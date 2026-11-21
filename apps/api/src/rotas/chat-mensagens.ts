// A conversa aberta e as mensagens (spec chat, "Conversas", "Conversa direta", "Mensagem", "Link da
// mensagem" e "Chamado citado numa mensagem"; spec modulo-chat, "Conversa aberta"; change
// chat-com-chamados, design, decisões 1, 3 e 11; tarefa 3.2): o cabeçalho, as páginas de 50 e a
// mensagem, na conversa e na direta que nasce com ela. Tudo pede o `chat.usar` e o módulo Chat
// ligado, pela guarda do escopo; a conversa de que a conta não participa responde como inexistente.
import {
  type Banco,
  conversas,
  leiturasDasConversas,
  membrosDoGrupo,
  naOrganizacao,
  TIPOS_DE_CONVERSA_NO_BANCO,
} from '@grafite/db';
import { fraseNoLugarDaCaixa, nomeNoChat } from '@grafite/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ANEXO_NAO_ENCONTRADO } from '../chamados/anexos.ts';
import { ContaDoChat, contaDoChat, lerContas } from '../chat/contas.ts';
import { lerConversaDaConta, travarADireta, travarParaAMensagem } from '../chat/conversa.ts';
import {
  BuscaDaPagina,
  gravarMensagem,
  lerPagina,
  MensagemDoChat,
  mensagemNaoEncontrada,
  mensagensParaAConta,
  PaginaDeMensagens,
} from '../chat/mensagens.ts';
import { usaOChatNaConsulta } from '../chat/quem-usa.ts';
import { contaDaSessao } from '../chat/sessao.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { naoEncontrado, ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
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

/**
 * Os anexos enviados antes (`POST /chat/anexos`), até 5 pelo domínio; o teto aqui só barra o pedido
 * absurdo antes de o ler.
 */
const AnexosDaMensagem = z
  .array(z.uuid({ error: ANEXO_NAO_ENCONTRADO }))
  .max(50, { error: 'Anexe até 5 arquivos.' })
  .optional();

const NovaMensagem = z.object({
  texto: TextoDaMensagem,
  anexos: AnexosDaMensagem,
  /** A mensagem respondida, da mesma conversa. */
  respondeA: z.uuid({ error: 'A mensagem respondida não está nesta conversa.' }).nullish(),
});

const PROBLEMAS = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
} as const;

const pessoaNaoEncontrada = () => naoEncontrado('Pessoa não encontrada.');

export const rotasDasMensagensDoChat: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  fila?: FilaDeTarefas | undefined;
}> = async (app, { banco, agora, fila }) => {
  /** Quem pede a notificação da mensagem; sem a fila rodando, nada é pedido. */
  const enviar = (): EnviarTarefa | undefined =>
    fila?.rodando() ? (...dados) => fila.enviar(...dados) : undefined;

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
              ? fraseNoLugarDaCaixa(participacao.recusa)
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
        // O link da mensagem (`em`) de uma conversa de que a conta não participa diz que a mensagem
        // não foi encontrada (spec chat, "Link da mensagem").
        const { linha } = await lerConversaDaConta(tx, conta, requisicao.params.id).catch(
          (erro: unknown) => {
            const naoParticipa = erro instanceof ProblemaDaApi && erro.dados.status === 404;
            throw naoParticipa && requisicao.query.em !== undefined
              ? mensagemNaoEncontrada()
              : erro;
          },
        );
        return lerPagina(tx, conta, linha.id, requisicao.query, agora());
      }),
  );

  app.post(
    '/chat/conversas/:id/mensagens',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Manda a mensagem na conversa, com os anexos e a resposta a outra dela',
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
          anexos: requisicao.body.anexos ?? [],
          momento,
          enviar: enviar(),
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
        body: z.object({ texto: TextoDaMensagem, anexos: AnexosDaMensagem }),
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
          anexos: requisicao.body.anexos ?? [],
          momento,
          enviar: enviar(),
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
