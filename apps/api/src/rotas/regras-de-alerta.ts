// As regras de alerta da organização (spec alertas, "Regras de alerta", e modulo-alertas, "Regras
// na tela"; change p3a-regras-e-alertas, design, decisão 10): quem vê os alertas lista as regras,
// para o filtro das listas; quem os administra lê, cadastra, edita, inativa e reativa. A conferência dos campos é a do domínio; o nome repetido
// e o registro do escopo inativo, do banco. Cada mudança vai para a auditoria, com o evento dos
// alertas para quem os vê.

import { isDeepStrictEqual } from 'node:util';
import {
  type Banco,
  CONDICOES_DE_ALERTA_NO_BANCO,
  ESCOPOS_DA_REGRA_NO_BANCO,
  naOrganizacao,
  regrasDeAlerta,
  SEVERIDADES_NO_BANCO,
  SITUACOES_DA_REGRA,
  type Transacao,
} from '@grafite/db';
import {
  conferirRegra,
  EFEITOS_DA_EXCECAO,
  LUGARES_DA_EXCECAO,
  normalizarTexto,
  pode,
} from '@grafite/domain';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import {
  conferirEscopoNoBanco,
  conferirExcecoesNoBanco,
  dadosDaLinha,
  escopoDaLinha,
  excecoesDaLinha,
  type LinhaDaRegra,
  nomesDosEscopos,
  semNomeDeRegraRepetido,
  visaoDaRegra,
} from '../alertas/regras.ts';
import { pedirAvaliacao } from '../alertas/tarefas.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import { dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** Os parâmetros de cada condição; o domínio confere os da condição da regra. */
const ParametrosDaRegra = z
  .object({
    limite: z.number().optional(),
    folga: z.number().optional(),
    condicoes: z.array(z.string()).optional(),
    situacoes: z.array(z.string()).optional(),
    ciclos: z.number().optional(),
    minutos: z.number().optional(),
  })
  .meta({ id: 'ParametrosDaRegraDeAlerta' });

/** Uma exceção da regra, com o nome do lugar (change regras-indicadores-e-tarefas). */
const ExcecaoDaRegraDeAlerta = z
  .object({
    lugar: z.object({
      tipo: z.enum(LUGARES_DA_EXCECAO),
      id: z.uuid(),
      /** O nome do tipo, do modelo, do ativo ou do local. */
      nome: z.string().nullable(),
    }),
    efeito: z.enum(EFEITOS_DA_EXCECAO),
    /** Só no "Outro limite", da regra do toner. */
    limite: z.number().int().optional(),
    folga: z.number().int().optional(),
  })
  .meta({ id: 'ExcecaoDaRegraDeAlerta' });

/** A exceção como a tela a manda: os tipos largos, para a recusa vir com as mensagens do domínio. */
const PedidoDeExcecao = z.object({
  lugar: z.object({ tipo: z.string().optional(), id: z.string().optional() }).optional(),
  efeito: z.string().optional(),
  limite: z.number().optional(),
  folga: z.number().optional(),
});

const RegraDeAlerta = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    condicao: z.enum(CONDICOES_DE_ALERTA_NO_BANCO),
    parametros: ParametrosDaRegra,
    /** Em minutos; 0 nas condições sem a duração. */
    duracao: z.number().int(),
    severidade: z.enum(SEVERIDADES_NO_BANCO),
    escopo: z.object({
      tipo: z.enum(ESCOPOS_DA_REGRA_NO_BANCO),
      id: z.uuid().nullable(),
      /** O nome do tipo, do modelo, do ativo ou do local; nenhum na organização inteira. */
      nome: z.string().nullable(),
    }),
    excecoes: z.array(ExcecaoDaRegraDeAlerta),
    situacao: z.enum(SITUACOES_DA_REGRA),
    /** Se a regra nasceu de uma regra de fábrica. */
    deFabrica: z.boolean(),
    criadoEm: z.string(),
    atualizadoEm: z.string(),
  })
  .meta({ id: 'RegraDeAlerta' });

const ListaDeRegras = z
  .object({ regras: z.array(RegraDeAlerta), permite: z.object({ cadastrar: z.boolean() }) })
  .meta({ id: 'ListaDeRegrasDeAlerta' });

/** A regra como a tela a manda: os tipos largos, para a recusa vir com as mensagens do domínio. */
const PedidoDeRegra = z
  .object({
    nome: z.string(),
    condicao: z.enum(CONDICOES_DE_ALERTA_NO_BANCO),
    parametros: ParametrosDaRegra.default({}),
    duracao: z.number().optional(),
    severidade: z.enum(SEVERIDADES_NO_BANCO),
    escopo: z.object({
      tipo: z.enum(ESCOPOS_DA_REGRA_NO_BANCO),
      id: z.string().nullable().optional(),
    }),
    excecoes: z.array(PedidoDeExcecao).optional(),
  })
  .meta({ id: 'PedidoDeRegraDeAlerta' });

const ParametrosDaRota = z.object({ id: z.uuid({ error: 'Regra não encontrada.' }) });

const regraNaoEncontrada = () => naoEncontrado('Regra não encontrada.');

const PROBLEMAS_DA_REGRA = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

const comoResposta = (
  linha: LinhaDaRegra,
  nomes: ReadonlyMap<string, string>,
): z.infer<typeof RegraDeAlerta> => {
  const escopo = escopoDaLinha(linha);
  return {
    id: linha.id,
    nome: linha.nome,
    condicao: linha.condicao,
    parametros: linha.parametros,
    duracao: linha.duracao,
    severidade: linha.severidade,
    escopo: { ...escopo, nome: escopo.id ? (nomes.get(escopo.id) ?? null) : null },
    excecoes: excecoesDaLinha(linha).map((excecao) => ({
      ...excecao,
      lugar: { ...excecao.lugar, nome: nomes.get(excecao.lugar.id) ?? null },
    })),
    situacao: linha.situacao,
    deFabrica: linha.fabrica !== null,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
};

async function responder(tx: Transacao, linha: LinhaDaRegra) {
  return comoResposta(linha, await nomesDosEscopos(tx, [linha]));
}

async function lerRegra(tx: Transacao, id: string, trancar = false): Promise<LinhaDaRegra> {
  const consulta = tx.select().from(regrasDeAlerta).where(eq(regrasDeAlerta.id, id));
  const [linha] = trancar ? await consulta.for('update') : await consulta;
  if (!linha) throw regraNaoEncontrada();
  return linha;
}

/** O pedido conferido pelo domínio e, no banco, o registro do escopo. */
async function regraConferida(
  tx: Transacao,
  pedido: z.infer<typeof PedidoDeRegra>,
  condicaoAtual?: LinhaDaRegra['condicao'],
) {
  const conferida = conferirRegra(pedido, { condicaoAtual });
  if (!conferida.ok) throw dadosInvalidos(conferida.erros as Record<string, string>);
  await conferirEscopoNoBanco(tx, conferida.dados.escopo);
  await conferirExcecoesNoBanco(tx, conferida.dados.excecoes ?? []);
  return conferida.dados;
}

/** O evento das regras vai a quem vê alertas, sem o nome da regra. */
const saidaDaRegra = (id: string) => ({
  publico: { permissao: 'alertas.ver' as const },
  alvo: { tipo: 'regra-de-alerta', id },
});

export const rotasDasRegrasDeAlerta: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  /** Para a mudança de uma regra valer logo; sem ela, a avaliação do minuto basta. */
  fila?: FilaDeTarefas;
}> = async (app, { banco, agora, fila }) => {
  app.get(
    '/regras-de-alerta',
    {
      config: { permissao: 'alertas.ver' },
      schema: {
        summary: 'As regras de alerta da organização, pelo nome',
        response: { 200: ListaDeRegras, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linhas = await tx
          .select()
          .from(regrasDeAlerta)
          .orderBy(asc(regrasDeAlerta.nomeNormalizado));
        const nomes = await nomesDosEscopos(tx, linhas);
        return {
          regras: linhas.map((linha) => comoResposta(linha, nomes)),
          permite: { cadastrar: pode(sessaoDa(requisicao).acesso, 'alertas.administrar') },
        };
      }),
  );

  app.get(
    '/regras-de-alerta/:id',
    {
      config: { permissao: 'alertas.administrar' },
      schema: {
        summary: 'Uma regra de alerta',
        params: ParametrosDaRota,
        response: { 200: RegraDeAlerta, ...PROBLEMAS_DA_REGRA },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        responder(tx, await lerRegra(tx, requisicao.params.id)),
      ),
  );

  app.post(
    '/regras-de-alerta',
    {
      config: { permissao: 'alertas.administrar' },
      schema: {
        summary: 'Cadastrar uma regra de alerta',
        body: PedidoDeRegra,
        response: { 201: RegraDeAlerta, ...PROBLEMAS_DA_REGRA },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      const criada = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const dados = await regraConferida(tx, requisicao.body);
        const [linha] = await semNomeDeRegraRepetido(() =>
          tx
            .insert(regrasDeAlerta)
            .values({
              orgId: requisicao.organizacao?.id ?? '',
              nome: dados.nome,
              nomeNormalizado: normalizarTexto(dados.nome),
              condicao: dados.condicao,
              parametros: dados.parametros,
              duracao: dados.duracao,
              severidade: dados.severidade,
              escopo: dados.escopo.tipo,
              escopoId: dados.escopo.id,
              excecoes: dados.excecoes ?? [],
              criadoPor: contaId,
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!linha) throw new Error('A regra não foi cadastrada.');
        await registrarNaAuditoria(tx, {
          acao: 'regra-de-alerta.criada',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'regra-de-alerta', id: linha.id },
          depois: visaoDaRegra(linha),
          origem: origemDa(requisicao),
          momento,
          saida: saidaDaRegra(linha.id),
        });
        await pedirAvaliacao(fila, requisicao.organizacao?.id ?? '', tx);
        return responder(tx, linha);
      });
      return resposta.code(201).send(criada);
    },
  );

  app.patch(
    '/regras-de-alerta/:id',
    {
      config: { permissao: 'alertas.administrar' },
      schema: {
        summary: 'Editar uma regra de alerta: a condição não muda',
        params: ParametrosDaRota,
        body: PedidoDeRegra,
        response: { 200: RegraDeAlerta, ...PROBLEMAS_DA_REGRA },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerRegra(tx, requisicao.params.id, true);
        const dados = await regraConferida(tx, requisicao.body, antes.condicao);
        const iguais = isDeepStrictEqual(dadosDaLinha(antes), dados);
        if (iguais) return responder(tx, antes);
        const [depois] = await semNomeDeRegraRepetido(() =>
          tx
            .update(regrasDeAlerta)
            .set({
              nome: dados.nome,
              nomeNormalizado: normalizarTexto(dados.nome),
              parametros: dados.parametros,
              duracao: dados.duracao,
              severidade: dados.severidade,
              escopo: dados.escopo.tipo,
              escopoId: dados.escopo.id,
              excecoes: dados.excecoes ?? [],
              atualizadoEm: momento,
            })
            .where(eq(regrasDeAlerta.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('A regra não foi alterada.');
        await registrarNaAuditoria(tx, {
          acao: 'regra-de-alerta.alterada',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'regra-de-alerta', id: antes.id },
          antes: visaoDaRegra(antes),
          depois: visaoDaRegra(depois),
          origem: origemDa(requisicao),
          momento,
          saida: saidaDaRegra(antes.id),
        });
        await pedirAvaliacao(fila, requisicao.organizacao?.id ?? '', tx);
        return responder(tx, depois);
      });
    },
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativa', 'regra-de-alerta.inativada'],
    ['reativacao', 'ativa', 'regra-de-alerta.reativada'],
  ] as const) {
    app.post(
      `/regras-de-alerta/:id/${caminho}`,
      {
        config: { permissao: 'alertas.administrar' },
        schema: {
          summary:
            situacao === 'inativa'
              ? 'Inativar uma regra de alerta'
              : 'Reativar uma regra de alerta',
          params: ParametrosDaRota,
          response: { 200: RegraDeAlerta, ...PROBLEMAS_DA_REGRA },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerRegra(tx, requisicao.params.id, true);
          if (antes.situacao === situacao) return responder(tx, antes);
          const [depois] = await tx
            .update(regrasDeAlerta)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(regrasDeAlerta.id, antes.id))
            .returning();
          if (!depois) throw new Error('A regra não foi alterada.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'regra-de-alerta', id: antes.id },
            antes: visaoDaRegra(antes),
            depois: visaoDaRegra(depois),
            origem: origemDa(requisicao),
            momento,
            saida: saidaDaRegra(antes.id),
          });
          await pedirAvaliacao(fila, requisicao.organizacao?.id ?? '', tx);
          return responder(tx, depois);
        });
      },
    );
  }
};
