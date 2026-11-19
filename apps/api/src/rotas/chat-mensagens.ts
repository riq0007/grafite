// A conversa aberta e as mensagens (spec chat, "Conversas", "Conversa direta", "Mensagem", "Link da
// mensagem" e "Chamado citado numa mensagem"; spec modulo-chat, "Conversa aberta"; change
// chat-com-chamados, design, decisões 1, 3 e 11; tarefa 3.2): o cabeçalho, as páginas de 50 e a
// mensagem, na conversa e na direta que nasce com ela. Tudo pede o `chat.usar` e o módulo Chat
// ligado, pela guarda do escopo; a conversa de que a conta não participa responde como inexistente.
import {
  type Banco,
  contas,
  conversas,
  leiturasDasConversas,
  membrosDoGrupo,
  naOrganizacao,
  TIPOS_DE_CONVERSA_NO_BANCO,
  type Transacao,
} from '@grafite/db';
import { mensagemDaRecusaDaEscrita, nomeNoChat } from '@grafite/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { carregarGrupos } from '../acesso/acesso.ts';
import { sessaoDa } from '../acesso/escopo.ts';
import { ContaDoChat, contaDoChat, lerContas } from '../chat/contas.ts';
import { lerConversaDaConta, travarADireta, travarParaAMensagem } from '../chat/conversa.ts';
import {
  BuscaDaPagina,
  type ContaQueLeAsMensagens,
  gravarMensagem,
  lerPagina,
  MensagemDoChat,
  mensagensParaAConta,
  PaginaDeMensagens,
} from '../chat/mensagens.ts';
import { usaOChatNaConsulta } from '../chat/quem-usa.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const ConversaAberta = z
  .object({
    id: z.uuid(),
    tipo: z.enum(TIPOS_DE_CONVERSA_NO_BANCO),
    /** O nome da conversa para a conta: a direta, o da outra, com o "(TI)". */
    nome: z.string(),
    /** A outra conta da direta; a equipe e o canal não têm. */
    outra: ContaDoChat.nullable(),
    /** Na equipe, quantas pessoas do grupo usam o chat; a direta e o canal não têm. */
    pessoas: z.int().nullable(),
    /** O grupo que escreve na equipe ou no canal, se há um. */
    escreveGrupo: z.string().nullable(),
    arquivada: z.boolean(),
    silenciada: z.boolean(),
    /** A última mensagem que a conta leu, ou nulo. */
    lidaAte: z.uuid().nullable(),
    /** A conta escreve; sem isso, a `recusa` diz por quê. */
    escreve: z.boolean(),
    /** A frase no lugar do campo de escrever, como "Só TI escreve neste canal.". */
    recusa: z.string().nullable(),
  })
  .meta({ id: 'ConversaAberta' });

const MensagemNaDireta = z
  .object({
    /** A conversa direta, a que nasceu com a mensagem ou a que já existia. */
    conversa: z.uuid(),
    mensagem: MensagemDoChat,
  })
  .meta({ id: 'MensagemNaDireta' });

const ParametrosDaConversa = z.object({ id: z.uuid({ error: 'Conversa não encontrada.' }) });

const ParametrosDaDireta = z.object({ conta: z.uuid({ error: 'Pessoa não encontrada.' }) });

/** O texto passa pelo domínio, que conta os caracteres sem os espaços das pontas. */
const TextoDaMensagem = z.string().max(40_000, { error: 'Use até 4.000 caracteres.' });

const NovaMensagem = z.object({
  texto: TextoDaMensagem,
  /** A mensagem respondida, da mesma conversa. */
  respondeA: z.uuid({ error: 'A mensagem respondida não está nesta conversa.' }).nullish(),
});

const PROBLEMAS = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
} as const;

const pessoaNaoEncontrada = () => naoEncontrado('Pessoa não encontrada.');

/** A conta da sessão, com a pessoa, o acesso de agora e os grupos ativos de que ela é. */
async function contaDaSessao(
  tx: Transacao,
  requisicao: FastifyRequest,
): Promise<ContaQueLeAsMensagens> {
  const { contaId, acesso } = sessaoDa(requisicao);
  const [conta] = await tx
    .select({ pessoaId: contas.pessoaId })
    .from(contas)
    .where(eq(contas.id, contaId));
  return {
    id: contaId,
    pessoaId: conta?.pessoaId ?? '',
    acesso,
    grupos: await carregarGrupos(tx, contaId),
  };
}

export const rotasDasMensagensDoChat: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/chat/conversas/:id',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'A conversa aberta: o nome, quem escreve, o silenciar e a última lida',
        params: ParametrosDaConversa,
        response: { 200: ConversaAberta, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const aberta = await lerConversaDaConta(tx, conta, requisicao.params.id);
        const { linha, conversa, outra, participacao } = aberta;
        const [leitura] = await tx
          .select({
            silenciada: leiturasDasConversas.silenciada,
            lidaAte: leiturasDasConversas.lidaAte,
          })
          .from(leiturasDasConversas)
          .where(
            and(
              eq(leiturasDasConversas.conversaId, linha.id),
              eq(leiturasDasConversas.contaId, conta.id),
            ),
          );
        let pessoas: number | null = null;
        if (conversa.tipo === 'equipe') {
          const [contagem] = await tx
            .select({
              pessoas: sql<number>`count(distinct ${membrosDoGrupo.contaId})::int`,
            })
            .from(membrosDoGrupo)
            .where(
              and(
                eq(membrosDoGrupo.grupoId, conversa.grupo.id),
                isNull(membrosDoGrupo.encerradaEm),
                usaOChatNaConsulta(membrosDoGrupo.contaId),
              ),
            );
          pessoas = contagem?.pessoas ?? 0;
        }
        return {
          id: linha.id,
          tipo: linha.tipo,
          nome: outra ? nomeNoChat(outra.nome, outra.daTi) : (linha.nome ?? ''),
          outra: outra ? contaDoChat(outra) : null,
          pessoas,
          escreveGrupo: conversa.tipo === 'direta' ? null : (conversa.escreve?.nome ?? null),
          arquivada: linha.arquivadaEm !== null,
          silenciada: leitura?.silenciada ?? false,
          lidaAte: leitura?.lidaAte ?? null,
          escreve: participacao.participa && participacao.escreve,
          recusa:
            participacao.participa && !participacao.escreve
              ? mensagemDaRecusaDaEscrita(participacao.recusa)
              : null,
        };
      }),
  );

  app.get(
    '/chat/conversas/:id/mensagens',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'As mensagens da conversa, de 50 em 50: as mais novas, antes, depois ou ao redor',
        params: ParametrosDaConversa,
        querystring: BuscaDaPagina,
        response: { 200: PaginaDeMensagens, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const { linha } = await lerConversaDaConta(tx, conta, requisicao.params.id);
        return lerPagina(tx, conta, linha.id, requisicao.query, agora());
      }),
  );

  app.post(
    '/chat/conversas/:id/mensagens',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Manda a mensagem na conversa, com a resposta a outra dela',
        params: ParametrosDaConversa,
        body: NovaMensagem,
        response: { 201: MensagemDoChat, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      const mensagem = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const conversa = await travarParaAMensagem(tx, conta, requisicao.params.id, momento);
        const gravada = await gravarMensagem(tx, conversa, {
          contaId: conta.id,
          texto: requisicao.body.texto,
          respondeA: requisicao.body.respondeA ?? null,
          momento,
        });
        const [lida] = await mensagensParaAConta(tx, conta, conversa.linha.id, [gravada], momento);
        if (!lida) throw new Error('A mensagem gravada não foi lida.');
        return lida;
      });
      return resposta.status(201).send(mensagem);
    },
  );

  app.post(
    '/chat/diretas/:conta/mensagens',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Manda a mensagem à pessoa: a primeira cria a conversa direta',
        params: ParametrosDaDireta,
        body: z.object({ texto: TextoDaMensagem }),
        response: { 201: MensagemNaDireta, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      const enviada = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const outraId = requisicao.params.conta.toLowerCase();
        if (outraId === conta.id.toLowerCase()) throw pessoaNaoEncontrada();
        const outra = (await lerContas(tx, [outraId])).get(outraId);
        if (!outra) throw pessoaNaoEncontrada();
        if (!outra.usaOChat) {
          // Quem não usa o chat não está na escolha: só a direta que já existe fica para ler, e a
          // mensagem nela é recusada pela frase.
          const [contaA, contaB] = [conta.id.toLowerCase(), outraId].sort();
          const [existe] = await tx
            .select({ id: conversas.id })
            .from(conversas)
            .where(
              and(
                eq(conversas.tipo, 'direta'),
                eq(conversas.contaA, contaA ?? ''),
                eq(conversas.contaB, contaB ?? ''),
              ),
            );
          if (!existe) throw pessoaNaoEncontrada();
        }
        const conversa = await travarADireta(tx, conta, outraId, momento);
        const gravada = await gravarMensagem(tx, conversa, {
          contaId: conta.id,
          texto: requisicao.body.texto,
          respondeA: null,
          momento,
        });
        const [mensagem] = await mensagensParaAConta(
          tx,
          conta,
          conversa.linha.id,
          [gravada],
          momento,
        );
        if (!mensagem) throw new Error('A mensagem gravada não foi lida.');
        return { conversa: conversa.linha.id, mensagem };
      });
      return resposta.status(201).send(enviada);
    },
  );
};
