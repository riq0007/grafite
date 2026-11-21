// A vista Equipes e as abas da equipe e do canal (spec modulo-chat, "Equipes e Avisos na tela" e
// "Conversa na tela"; spec chat, "Chamados da conversa"; change chat-com-chamados, design, decisões
// 11 e 15; tarefa 3.5): as equipes e os canais ativos de que a conta participa, com quantas pessoas
// cada um tem; quem participa, pelo nome; os anexos da conversa, o mais novo primeiro; e os chamados
// abertos das mensagens dela. Tudo pede o `chat.usar`, e a conversa de que a conta não participa
// responde como inexistente. Quem participa não é gravado: a equipe é de quem é do grupo ativo e usa
// o chat, e o canal, de quem usa o chat (`chat/quem-usa.ts`).
import {
  anexosDoChat,
  arquivos,
  type Banco,
  chamados,
  contas,
  conversas,
  membrosDoGrupo,
  mensagensDoChat,
  naOrganizacao,
} from '@grafite/db';
import {
  estaFechado,
  ordemDasEquipesECanais,
  participaDoChamado,
  situacaoNoChat,
} from '@grafite/domain';
import { and, count, countDistinct, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { lerHorarioDaTi } from '../chamados/horario.ts';
import { ContaDoChat, contaDoChat, lerContas } from '../chat/contas.ts';
import { idsDeQuemParticipa, lerConversaDaConta } from '../chat/conversa.ts';
import { usaOChatNaConsulta } from '../chat/quem-usa.ts';
import { contaDaSessao } from '../chat/sessao.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** Quantos anexos e quantos chamados cada página das abas traz. */
const TAMANHO_DA_PAGINA = 50;

const EquipeDaConta = z
  .object({
    id: z.uuid(),
    tipo: z.enum(['equipe', 'canal']),
    nome: z.string(),
    /** Quantas pessoas participam: na equipe, as do grupo que usam o chat; no canal, todas. */
    pessoas: z.int(),
  })
  .meta({ id: 'EquipeDaConta' });

const EquipesDaConta = z.object({ itens: z.array(EquipeDaConta) }).meta({ id: 'EquipesDaConta' });

const PessoasDaConversa = z
  .object({
    /** Quem participa, pelo nome. */
    pessoas: z.array(ContaDoChat),
  })
  .meta({ id: 'PessoasDaConversa' });

const ArquivoDaConversa = z
  .object({
    /** O id do arquivo, que a entrega pela conversa recebe. */
    id: z.uuid(),
    nome: z.string(),
    tipo: z.string(),
    bytes: z.int(),
    /** A mensagem do anexo, para o "Ver na conversa". */
    mensagem: z.uuid(),
    /** Quem mandou. */
    autor: ContaDoChat,
    /** Quando mandou, em ISO 8601. */
    enviadoEm: z.string(),
  })
  .meta({ id: 'ArquivoDaConversa' });

const ArquivosDaConversa = z
  .object({ itens: z.array(ArquivoDaConversa), seguintes: z.boolean() })
  .meta({ id: 'ArquivosDaConversa' });

const ChamadoDaConversa = z
  .object({
    numero: z.int(),
    titulo: z.string(),
    /** A situação nas palavras do colaborador, com o Fechado. */
    situacao: z.string(),
    /** Quem atende, ou nulo, na triagem. */
    atende: z.string().nullable(),
    /** Quem abriu pelo chat. */
    abriu: z.string().nullable(),
    /** ISO 8601. */
    abertoEm: z.string(),
  })
  .meta({ id: 'ChamadoDaConversa' });

const ChamadosDaConversa = z
  .object({ itens: z.array(ChamadoDaConversa), seguintes: z.boolean() })
  .meta({ id: 'ChamadosDaConversa' });

const ParametrosDaConversa = z.object({ id: z.uuid({ error: 'Conversa não encontrada.' }) });

const PROBLEMAS = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO } as const;

/** As contas que usam o chat agora, na consulta: a conta ativa, com o `chat.usar`. */
const quemUsa = () => usaOChatNaConsulta(contas.id);

export const rotasDasEquipesDoChat: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/chat/equipes',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'As equipes e os canais ativos de que a conta participa, com quantas pessoas',
        response: { 200: EquipesDaConta, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const linhas = await tx
          .select({
            id: conversas.id,
            tipo: conversas.tipo,
            nome: conversas.nome,
            grupoId: conversas.grupoId,
          })
          .from(conversas)
          .where(
            and(
              isNull(conversas.arquivadaEm),
              or(
                eq(conversas.tipo, 'canal'),
                conta.grupos.length > 0
                  ? and(eq(conversas.tipo, 'equipe'), inArray(conversas.grupoId, conta.grupos))
                  : undefined,
              ),
            ),
          );
        const dasEquipes = [
          ...new Set(linhas.flatMap(({ grupoId }) => (grupoId === null ? [] : [grupoId]))),
        ];
        const porGrupo = new Map(
          dasEquipes.length > 0
            ? (
                await tx
                  .select({
                    grupoId: membrosDoGrupo.grupoId,
                    pessoas: countDistinct(membrosDoGrupo.contaId),
                  })
                  .from(membrosDoGrupo)
                  .where(
                    and(
                      inArray(membrosDoGrupo.grupoId, dasEquipes),
                      isNull(membrosDoGrupo.encerradaEm),
                      usaOChatNaConsulta(membrosDoGrupo.contaId),
                    ),
                  )
                  .groupBy(membrosDoGrupo.grupoId)
              ).map(({ grupoId, pessoas }) => [grupoId, pessoas])
            : [],
        );
        const doCanal = linhas.some(({ tipo }) => tipo === 'canal')
          ? ((await tx.select({ pessoas: count() }).from(contas).where(quemUsa()))[0]?.pessoas ?? 0)
          : 0;
        return {
          itens: ordemDasEquipesECanais(
            linhas.map(({ id, tipo, nome, grupoId }) => ({
              id,
              tipo: tipo === 'equipe' ? ('equipe' as const) : ('canal' as const),
              nome: nome ?? '',
              pessoas: tipo === 'equipe' ? (porGrupo.get(grupoId ?? '') ?? 0) : doCanal,
            })),
          ),
        };
      }),
  );

  app.get(
    '/chat/conversas/:id/pessoas',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Quem participa da conversa agora, pelo nome',
        params: ParametrosDaConversa,
        response: { 200: PessoasDaConversa, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const aberta = await lerConversaDaConta(tx, conta, requisicao.params.id);
        const lidas = await lerContas(tx, await idsDeQuemParticipa(tx, aberta.conversa));
        return {
          pessoas: [...lidas.values()]
            .sort(
              (a, b) =>
                a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) ||
                a.conta.localeCompare(b.conta),
            )
            .map(contaDoChat),
        };
      }),
  );

  app.get(
    '/chat/conversas/:id/arquivos',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Os anexos da conversa, o mais novo primeiro, de 50 em 50',
        params: ParametrosDaConversa,
        querystring: z.object({
          /** O último arquivo da página anterior: a página traz os de antes dele. */
          antesDe: z.uuid({ error: 'Arquivo não encontrado.' }).optional(),
        }),
        response: { 200: ArquivosDaConversa, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const { linha } = await lerConversaDaConta(tx, conta, requisicao.params.id);
        const { antesDe } = requisicao.query;
        const linhas = await tx
          .select({
            id: arquivos.id,
            nome: arquivos.nome,
            tipo: arquivos.tipo,
            bytes: arquivos.bytes,
            mensagem: mensagensDoChat.id,
            autor: mensagensDoChat.autorConta,
            enviadoEm: mensagensDoChat.criadaEm,
          })
          .from(anexosDoChat)
          .innerJoin(arquivos, eq(arquivos.id, anexosDoChat.arquivoId))
          .innerJoin(mensagensDoChat, eq(mensagensDoChat.id, anexosDoChat.mensagemId))
          .where(
            and(
              eq(anexosDoChat.conversaId, linha.id),
              isNull(arquivos.removidoEm),
              antesDe === undefined
                ? undefined
                : sql`(${anexosDoChat.mensagemId}, ${anexosDoChat.arquivoId}) < (
                    select a.mensagem_id, a.arquivo_id from anexos_do_chat a
                    where a.arquivo_id = ${antesDe} and a.conversa_id = ${linha.id})`,
            ),
          )
          .orderBy(desc(anexosDoChat.mensagemId), desc(anexosDoChat.arquivoId))
          .limit(TAMANHO_DA_PAGINA + 1);
        const pagina = linhas.slice(0, TAMANHO_DA_PAGINA);
        const autores = await lerContas(
          tx,
          pagina.flatMap(({ autor }) => (autor ? [autor] : [])),
        );
        return {
          itens: pagina.flatMap(({ autor, enviadoEm, nome, ...arquivo }) => {
            const lido = autor ? autores.get(autor) : undefined;
            return lido
              ? [
                  {
                    ...arquivo,
                    nome: nome ?? 'arquivo',
                    autor: contaDoChat(lido),
                    enviadoEm: enviadoEm.toISOString(),
                  },
                ]
              : [];
          }),
          seguintes: linhas.length > TAMANHO_DA_PAGINA,
        };
      }),
  );

  app.get(
    '/chat/conversas/:id/chamados',
    {
      config: { permissao: 'chat.usar' },
      schema: {
        summary: 'Os chamados abertos das mensagens da conversa, o mais novo primeiro, de 50 em 50',
        params: ParametrosDaConversa,
        querystring: z.object({
          /** O último número da página anterior: a página traz os de antes dele. */
          antes: z.coerce.number().int().positive().optional(),
        }),
        response: { 200: ChamadosDaConversa, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const conta = await contaDaSessao(tx, requisicao);
        const { linha } = await lerConversaDaConta(tx, conta, requisicao.params.id);
        // Com o módulo Chamados desligado, a aba fica vazia, como a citação sem o chip.
        if (!(await ligadoNaTransacao(tx, 'chamados'))) return { itens: [], seguintes: false };
        const { antes } = requisicao.query;
        const linhas = await tx
          .select({
            numero: chamados.numero,
            titulo: chamados.titulo,
            situacao: chamados.situacao,
            resolvidoEm: chamados.resolvidoEm,
            fechadoEm: chamados.fechadoEm,
            responsavelId: chamados.responsavelId,
            abertoPor: chamados.abertoPor,
            abertoEm: chamados.abertoEm,
            pessoaId: chamados.pessoaId,
            origem: chamados.origem,
          })
          .from(chamados)
          .where(
            and(
              eq(chamados.origemConversaId, linha.id),
              antes === undefined ? undefined : lt(chamados.numero, antes),
            ),
          )
          .orderBy(desc(chamados.numero))
          .limit(TAMANHO_DA_PAGINA + 1);
        const pagina = linhas.slice(0, TAMANHO_DA_PAGINA);
        const { fuso } = await lerHorarioDaTi(tx);
        const nomes = await lerContas(
          tx,
          pagina.flatMap(({ responsavelId, abertoPor }) =>
            [responsavelId, abertoPor].filter((id) => id !== null),
          ),
        );
        const momento = agora();
        return {
          itens: pagina.map((chamado) => ({
            numero: chamado.numero,
            titulo: chamado.titulo,
            situacao: situacaoNoChat(
              chamado.situacao,
              estaFechado(chamado, momento, fuso),
              participaDoChamado(
                { id: conta.id, pessoaId: conta.pessoaId, usaOChat: true },
                chamado,
              ),
            ),
            atende: chamado.responsavelId ? (nomes.get(chamado.responsavelId)?.nome ?? null) : null,
            abriu: chamado.abertoPor ? (nomes.get(chamado.abertoPor)?.nome ?? null) : null,
            abertoEm: chamado.abertoEm.toISOString(),
          })),
          seguintes: linhas.length > TAMANHO_DA_PAGINA,
        };
      }),
  );
};
