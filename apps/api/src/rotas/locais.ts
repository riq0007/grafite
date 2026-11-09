// Os locais da organização (spec locais; design do F2b, decisões 3 e 11): a árvore inteira para
// toda sessão ativa, com o que a conta pode alterar em cada local, e as mudanças com a permissão no
// ramo. Elas rodam uma de cada vez, pela trava `locais`, com as regras do domínio conferidas dentro
// dela, e cada uma fica na auditoria com o caminho do local.
import {
  ativos,
  atribuicoes,
  type Banco,
  locais,
  naOrganizacao,
  pessoas,
  type Transacao,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  type LocalDaArvore,
  MOTIVOS_DA_ARVORE,
  montarArvore,
  normalizarTexto,
  podeEm,
  SITUACOES_DO_LOCAL,
  TIPOS_DE_LOCAL,
} from '@grafite/domain';
import { and, count, eq, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { modulosDesligados } from '../acesso/modulos.ts';
import { COLUNAS_DO_LOCAL, LOCAL_INATIVO, lerLocais } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { type AlcanceDaContagem, ContagemNoEscopo, contarNoEscopo } from '../contagens.ts';
import {
  conflito,
  dadosInvalidos,
  naoEncontrado,
  ProblemaDaApi,
  RespostaDeProblema,
} from '../problemas.ts';
import { travar } from '../travas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const Local = z
  .object({
    id: z.uuid(),
    /** O local de cima; nulo na raiz. */
    paiId: z.uuid().nullable(),
    nome: z.string(),
    tipo: z.enum(TIPOS_DE_LOCAL),
    situacao: z.enum(SITUACOES_DO_LOCAL),
    /** A conta pode cadastrar dentro dele, renomeá-lo, movê-lo, inativá-lo e reativá-lo. */
    permite: z.object({ editar: z.boolean() }),
  })
  .meta({ id: 'Local' });

const ArvoreDaOrganizacao = z
  .object({
    locais: z.array(Local),
    permite: z.object({ cadastrarNaRaiz: z.boolean() }),
  })
  .meta({ id: 'ArvoreDeLocais' });

const NomeDoLocal = z
  .string({ error: 'Informe o nome do local.' })
  .trim()
  .min(1, { error: 'Informe o nome do local.' })
  .max(80, { error: 'Use até 80 caracteres.' });

const TipoDoLocal = z.enum(TIPOS_DE_LOCAL, { error: 'Escolha o tipo do local.' });

const PedidoDeLocal = z
  .object({
    nome: NomeDoLocal,
    tipo: TipoDoLocal,
    /** O local de cima; nulo (o padrão) na raiz. */
    paiId: z.uuid({ error: 'Local não encontrado.' }).nullable().default(null),
  })
  .meta({ id: 'PedidoDeLocal' });

const PedidoDeAlteracaoDoLocal = z
  .object({ nome: NomeDoLocal.optional(), tipo: TipoDoLocal.optional() })
  .meta({ id: 'PedidoDeAlteracaoDoLocal' });

const PedidoDeMovimento = z
  .object({
    /** O novo local de cima; nulo para levar à raiz. */
    paiId: z.uuid({ error: 'Local não encontrado.' }).nullable(),
  })
  .meta({ id: 'PedidoDeMovimento' });

const ParametrosDoLocal = z.object({ id: z.uuid({ error: 'Local não encontrado.' }) });

/** Quantos registros o local tem, nele e com os de dentro, no escopo de quem vê. */
const ContagensDoLocal = z
  .object({ aqui: ContagemNoEscopo, comOsDeDentro: ContagemNoEscopo })
  .meta({ id: 'ContagensDoLocal' });

/** O local no cartão da referência e nos detalhes da árvore (change relacoes-vivas, decisão 1). */
const ResumoDoLocal = z
  .object({
    id: z.uuid(),
    /** Como "Jundiaí › Expedição". */
    caminho: z.string(),
    tipo: z.enum(TIPOS_DE_LOCAL),
    situacao: z.enum(SITUACOES_DO_LOCAL),
    /** Os ativos, sem os inativos; nulo com o módulo Ativos desligado ou para quem não os vê. */
    ativos: ContagensDoLocal.nullable(),
    /** As pessoas ativas que trabalham nele; nulo para quem não vê pessoas. */
    pessoas: ContagensDoLocal.nullable(),
  })
  .meta({ id: 'ResumoDoLocal' });

/** As contagens de cada local da árvore, para "Mostrar contagens" (change relacoes-vivas, decisão 6). */
const ContagensDosLocais = z
  .object({
    locais: z.array(
      z.object({
        id: z.uuid(),
        /** Os ativos, sem os inativos; nulo com o módulo Ativos desligado ou para quem não os vê. */
        ativos: ContagensDoLocal.nullable(),
        /** As pessoas ativas que trabalham nele; nulo para quem não vê pessoas. */
        pessoas: ContagensDoLocal.nullable(),
      }),
    ),
  })
  .meta({ id: 'ContagensDosLocais' });

interface ContadosNoLocal {
  vistos: number;
  total: number;
}

const contagem = ({ vistos, total }: ContadosNoLocal) => ({
  quantos: vistos,
  recortada: vistos < total,
});

/**
 * Os registros de uma tabela em cada local da árvore, aqui e com os de dentro, no alcance de quem os
 * vê: uma consulta conta os de cada local, e a árvore soma os de dentro. O total sem o escopo serve
 * só para dizer o recorte.
 */
async function contagensPorLocal(
  tx: Transacao,
  arvore: ArvoreDeLocais,
  ids: readonly string[],
  {
    alcanceDoVer,
    tabela,
    local,
    ativo,
  }: {
    alcanceDoVer: AlcanceDaContagem;
    tabela: PgTable;
    local: PgColumn;
    ativo: SQL;
  },
) {
  const noEscopo =
    alcanceDoVer === 'organizacao'
      ? sql`true`
      : alcanceDoVer.size > 0
        ? (inArray(local, [...alcanceDoVer]) as SQL)
        : sql`false`;
  const linhas = await tx
    .select({
      localId: sql<string>`${local}`,
      vistos: sql<number>`count(*) filter (where ${noEscopo})`.mapWith(Number),
      total: count(),
    })
    .from(tabela)
    .where(and(ativo, isNotNull(local)))
    .groupBy(local);
  const aqui = new Map<string, ContadosNoLocal>(
    linhas.map((linha) => [linha.localId, { vistos: linha.vistos, total: linha.total }]),
  );
  const zero = { vistos: 0, total: 0 };
  return new Map(
    ids.map((id) => {
      const dentro = { ...zero };
      for (const doRamo of arvore.ramo(id)) {
        const contados = aqui.get(doRamo) ?? zero;
        dentro.vistos += contados.vistos;
        dentro.total += contados.total;
      }
      return [
        id,
        { aqui: contagem(aqui.get(id) ?? zero), comOsDeDentro: contagem(dentro) },
      ] as const;
    }),
  );
}

/**
 * Os registros de uma tabela no local, aqui e com os de dentro, no alcance da permissão de vê-los;
 * nulo para quem não os vê em nenhum ramo.
 */
function contagensNoLocal(
  tx: Transacao,
  arvore: ArvoreDeLocais,
  localId: string,
  {
    alcanceDoVer,
    tabela,
    local,
    ativo,
  }: {
    alcanceDoVer: ReturnType<typeof alcance>;
    tabela: PgTable;
    local: PgColumn;
    /** A condição dos registros contados, como só os ativos. */
    ativo: SQL;
  },
) {
  if (alcanceDoVer === null) return null;
  return contarNoEscopo(tx, {
    tabela,
    onde: and(ativo, inArray(local, [...arvore.ramo(localId)])),
    local,
    alcance: alcanceDoVer,
    contagens: { aqui: eq(local, localId), comOsDeDentro: undefined },
  });
}

const localNaoEncontrado = () => naoEncontrado('Local não encontrado.');

const paiInativo = () =>
  new ProblemaDaApi({
    codigo: 'local-pai-inativo',
    status: 409,
    titulo: 'Local inativo',
    detalhe: LOCAL_INATIVO,
  });

const localEmUso = (motivos: string[]) =>
  new ProblemaDaApi({
    codigo: 'local-em-uso',
    status: 409,
    titulo: 'Local em uso',
    detalhe: motivos.join(' '),
  });

/** O que impede inativar um local: o que está ativo dentro dele ou com escopo nele. */
function motivosDoUso(uso: { locais: number; pessoas: number; atribuicoes: number }) {
  const motivos: string[] = [];
  if (uso.locais === 1) motivos.push('Há 1 local ativo dentro deste. Inative ou mova-o antes.');
  if (uso.locais > 1) {
    motivos.push(`Há ${uso.locais} locais ativos dentro deste. Inative ou mova-os antes.`);
  }
  if (uso.pessoas === 1) {
    motivos.push('Há 1 pessoa ativa com o local de trabalho aqui. Mude o local dela antes.');
  }
  if (uso.pessoas > 1) {
    motivos.push(
      `Há ${uso.pessoas} pessoas ativas com o local de trabalho aqui. Mude o local delas antes.`,
    );
  }
  if (uso.atribuicoes === 1) {
    motivos.push('Há 1 atribuição de perfil em vigor neste local. Encerre-a antes.');
  }
  if (uso.atribuicoes > 1) {
    motivos.push(
      `Há ${uso.atribuicoes} atribuições de perfil em vigor neste local. Encerre-as antes.`,
    );
  }
  return motivos;
}

/**
 * Quanto do que é ativo depende do local. A linha do local fica travada até o fim da transação:
 * quem escolhe o local para uma pessoa ou uma atribuição o lê com `for share` e espera.
 */
async function usoDoLocal(tx: Transacao, arvore: ArvoreDeLocais, id: string) {
  await tx.select({ id: locais.id }).from(locais).where(eq(locais.id, id)).for('update');
  const [comPessoas] = await tx
    .select({ total: count() })
    .from(pessoas)
    .where(and(eq(pessoas.localId, id), eq(pessoas.situacao, 'ativa')));
  const [comAtribuicoes] = await tx
    .select({ total: count() })
    .from(atribuicoes)
    .where(and(eq(atribuicoes.localId, id), isNull(atribuicoes.encerradaEm)));
  return {
    locais: arvore.filhos(id).filter((filho) => filho.situacao === 'ativo').length,
    pessoas: comPessoas?.total ?? 0,
    atribuicoes: comAtribuicoes?.total ?? 0,
  };
}

/** A recusa de uma regra da árvore: o nome repetido aponta o campo do nome. */
function recusarPelaArvore(motivo: string | null) {
  if (motivo === null) return;
  if (motivo === MOTIVOS_DA_ARVORE.nomeRepetido) throw conflito(motivo, { nome: motivo });
  if (motivo === MOTIVOS_DA_ARVORE.niveis || motivo === MOTIVOS_DA_ARVORE.ciclo) {
    throw conflito(motivo);
  }
  throw dadosInvalidos({ nome: motivo });
}

const comPermite = (local: LocalDaArvore, acesso: Acesso, arvore: ArvoreDeLocais) => ({
  ...local,
  permite: { editar: podeEm(acesso, 'locais.editar', local.id, arvore) },
});

/** O que a auditoria guarda de um local, com o caminho dele no momento da mudança. */
const visaoDoLocal = (local: LocalDaArvore, arvore: ArvoreDeLocais) => ({
  nome: local.nome,
  tipo: local.tipo,
  paiId: local.paiId,
  caminho: arvore.caminho(local.id),
  situacao: local.situacao,
});

type AcaoNoLocal = 'local.alterado' | 'local.movido' | 'local.inativado' | 'local.reativado';

interface MudancaNoLocal {
  acao: AcaoNoLocal;
  valores: Partial<
    Pick<typeof locais.$inferInsert, 'paiId' | 'nome' | 'nomeNormalizado' | 'tipo' | 'situacao'>
  >;
}

interface LocalEmMudanca {
  tx: Transacao;
  arvore: ArvoreDeLocais;
  local: LocalDaArvore;
}

export const rotasDosLocais: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  /**
   * Muda um local dentro da trava `locais`: acha o local, confere a permissão no ramo dele e grava
   * o que `decidir` devolver, com o antes → depois e os caminhos na auditoria. Sem mudança, nada é
   * gravado.
   */
  function mudarLocal(
    requisicao: FastifyRequest,
    id: string,
    decidir: (contexto: LocalEmMudanca) => Promise<MudancaNoLocal | null>,
  ) {
    const { contaId } = sessaoDa(requisicao);
    const momento = agora();
    return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
      await travar(tx, 'locais');
      const lidos = await lerLocais(tx);
      const arvore = montarArvore(lidos);
      const local = arvore.local(id);
      if (!local) throw localNaoEncontrado();
      exigirEm(requisicao, 'locais.editar', local.id, arvore);
      const mudanca = await decidir({ tx, arvore, local });
      if (!mudanca) return { local, arvore };

      const [alterado] = await tx
        .update(locais)
        .set({ ...mudanca.valores, atualizadoEm: momento })
        .where(eq(locais.id, local.id))
        .returning(COLUNAS_DO_LOCAL);
      if (!alterado) throw new Error('O local não foi alterado.');
      const depois = montarArvore(lidos.map((lido) => (lido.id === local.id ? alterado : lido)));
      await registrarNaAuditoria(tx, {
        acao: mudanca.acao,
        ator: { tipo: 'conta', contaId },
        alvo: { tipo: 'local', id: local.id },
        antes: visaoDoLocal(local, arvore),
        depois: visaoDoLocal(alterado, depois),
        origem: origemDa(requisicao),
        momento,
      });
      return { local: alterado, arvore: depois };
    });
  }

  const RESPOSTAS_DA_MUDANCA = {
    200: Local,
    401: RespostaDeProblema,
    409: RespostaDeProblema,
    ...PROBLEMAS_DO_ACESSO,
  };

  app.get(
    '/locais',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'A árvore de locais da organização',
        response: { 200: ArvoreDaOrganizacao, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const lidos = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', lerLocais);
      const arvore = montarArvore(lidos);
      return {
        locais: lidos.map((local) => comPermite(local, acesso, arvore)),
        permite: { cadastrarNaRaiz: podeEm(acesso, 'locais.editar', null, arvore) },
      };
    },
  );

  app.get(
    '/locais/contagens',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary:
          'Os ativos e as pessoas de cada local, nele e com os de dentro, no escopo de quem vê',
        response: { 200: ContagensDosLocais, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const comAtivos = !(await modulosDesligados(banco, orgId)).includes('ativos');
      return naOrganizacao(banco, orgId, async (tx) => {
        const lidos = await lerLocais(tx);
        const arvore = montarArvore(lidos);
        const ids = lidos.map((local) => local.id);
        const doAtivos = comAtivos ? alcance(acesso, 'ativos.ver', arvore) : null;
        const dasPessoas = alcance(acesso, 'pessoas.ver', arvore);
        const ativosPorLocal =
          doAtivos &&
          (await contagensPorLocal(tx, arvore, ids, {
            alcanceDoVer: doAtivos,
            tabela: ativos,
            local: ativos.localId,
            ativo: eq(ativos.situacao, 'ativo'),
          }));
        const pessoasPorLocal =
          dasPessoas &&
          (await contagensPorLocal(tx, arvore, ids, {
            alcanceDoVer: dasPessoas,
            tabela: pessoas,
            local: pessoas.localId,
            ativo: eq(pessoas.situacao, 'ativa'),
          }));
        return {
          locais: ids.map((id) => ({
            id,
            ativos: ativosPorLocal?.get(id) ?? null,
            pessoas: pessoasPorLocal?.get(id) ?? null,
          })),
        };
      });
    },
  );

  app.get(
    '/locais/:id/resumo',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary:
          'O resumo de um local, com os ativos e as pessoas, nele e com os de dentro, no escopo de quem vê',
        params: ParametrosDoLocal,
        response: { 200: ResumoDoLocal, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const comAtivos = !(await modulosDesligados(banco, orgId)).includes('ativos');
      return naOrganizacao(banco, orgId, async (tx) => {
        const arvore = montarArvore(await lerLocais(tx));
        const local = arvore.local(requisicao.params.id);
        if (!local) throw localNaoEncontrado();
        return {
          id: local.id,
          caminho: arvore.caminho(local.id),
          tipo: local.tipo,
          situacao: local.situacao,
          ativos: comAtivos
            ? await contagensNoLocal(tx, arvore, local.id, {
                alcanceDoVer: alcance(acesso, 'ativos.ver', arvore),
                tabela: ativos,
                local: ativos.localId,
                ativo: eq(ativos.situacao, 'ativo'),
              })
            : null,
          pessoas: await contagensNoLocal(tx, arvore, local.id, {
            alcanceDoVer: alcance(acesso, 'pessoas.ver', arvore),
            tabela: pessoas,
            local: pessoas.localId,
            ativo: eq(pessoas.situacao, 'ativa'),
          }),
        };
      });
    },
  );

  app.post(
    '/locais',
    {
      config: { permissao: 'locais.editar' },
      schema: {
        summary: 'Cadastrar um local, na raiz ou dentro de outro',
        body: PedidoDeLocal,
        response: {
          201: Local,
          401: RespostaDeProblema,
          409: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const { acesso, contaId } = sessaoDa(requisicao);
      const { nome, tipo, paiId } = requisicao.body;
      const momento = agora();
      const { local, arvore } = await naOrganizacao(
        banco,
        requisicao.organizacao?.id ?? '',
        async (tx) => {
          await travar(tx, 'locais');
          const lidos = await lerLocais(tx);
          const antes = montarArvore(lidos);
          const pai = paiId === null ? null : antes.local(paiId);
          if (pai === undefined) throw localNaoEncontrado();
          exigirEm(requisicao, 'locais.editar', paiId, antes);
          if (pai?.situacao === 'inativo') throw paiInativo();
          recusarPelaArvore(antes.podeCriar({ paiId, nome }));

          const [criado] = await tx
            .insert(locais)
            .values({
              orgId: sql`app.current_org()`,
              paiId,
              nome,
              nomeNormalizado: normalizarTexto(nome),
              tipo,
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(COLUNAS_DO_LOCAL);
          if (!criado) throw new Error('O local não foi cadastrado.');
          const depois = montarArvore([...lidos, criado]);
          await registrarNaAuditoria(tx, {
            acao: 'local.criado',
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'local', id: criado.id },
            depois: visaoDoLocal(criado, depois),
            origem: origemDa(requisicao),
            momento,
          });
          return { local: criado, arvore: depois };
        },
      );
      return resposta.code(201).send(comPermite(local, acesso, arvore));
    },
  );

  app.patch(
    '/locais/:id',
    {
      config: { permissao: 'locais.editar' },
      schema: {
        summary: 'Renomear um local ou mudar o tipo dele',
        params: ParametrosDoLocal,
        body: PedidoDeAlteracaoDoLocal,
        response: RESPOSTAS_DA_MUDANCA,
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const { local, arvore } = await mudarLocal(
        requisicao,
        requisicao.params.id,
        async ({ arvore, local }) => {
          const nome = pedido.nome ?? local.nome;
          const tipo = pedido.tipo ?? local.tipo;
          if (nome === local.nome && tipo === local.tipo) return null;
          if (nome !== local.nome) recusarPelaArvore(arvore.podeRenomear(local.id, nome));
          return {
            acao: 'local.alterado',
            valores: { nome, nomeNormalizado: normalizarTexto(nome), tipo },
          };
        },
      );
      return comPermite(local, acesso, arvore);
    },
  );

  app.post(
    '/locais/:id/movimento',
    {
      config: { permissao: 'locais.editar' },
      schema: {
        summary: 'Mover um local, com tudo o que está dentro dele',
        params: ParametrosDoLocal,
        body: PedidoDeMovimento,
        response: RESPOSTAS_DA_MUDANCA,
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const { paiId } = requisicao.body;
      const { local, arvore } = await mudarLocal(
        requisicao,
        requisicao.params.id,
        async ({ arvore, local }) => {
          const destino = paiId === null ? null : arvore.local(paiId);
          if (destino === undefined) throw localNaoEncontrado();
          exigirEm(requisicao, 'locais.editar', paiId, arvore);
          if (destino?.situacao === 'inativo') throw paiInativo();
          if (paiId === local.paiId) return null;
          recusarPelaArvore(arvore.podeMover(local.id, paiId));
          return { acao: 'local.movido', valores: { paiId } };
        },
      );
      return comPermite(local, acesso, arvore);
    },
  );

  app.post(
    '/locais/:id/inativacao',
    {
      config: { permissao: 'locais.editar' },
      schema: {
        summary: 'Inativar um local de que nada ativo depende',
        params: ParametrosDoLocal,
        response: RESPOSTAS_DA_MUDANCA,
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const { local, arvore } = await mudarLocal(
        requisicao,
        requisicao.params.id,
        async ({ tx, arvore, local }) => {
          if (local.situacao === 'inativo') return null;
          const motivos = motivosDoUso(await usoDoLocal(tx, arvore, local.id));
          if (motivos.length > 0) throw localEmUso(motivos);
          return { acao: 'local.inativado', valores: { situacao: 'inativo' } };
        },
      );
      return comPermite(local, acesso, arvore);
    },
  );

  app.post(
    '/locais/:id/reativacao',
    {
      config: { permissao: 'locais.editar' },
      schema: {
        summary: 'Reativar um local dentro de um local ativo',
        params: ParametrosDoLocal,
        response: RESPOSTAS_DA_MUDANCA,
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const { local, arvore } = await mudarLocal(
        requisicao,
        requisicao.params.id,
        async ({ arvore, local }) => {
          if (local.situacao === 'ativo') return null;
          const pai = local.paiId === null ? null : arvore.local(local.paiId);
          if (pai?.situacao === 'inativo') {
            throw new ProblemaDaApi({
              codigo: 'local-pai-inativo',
              status: 409,
              titulo: 'Local inativo',
              detalhe: 'Reative antes o local onde este fica.',
            });
          }
          return { acao: 'local.reativado', valores: { situacao: 'ativo' } };
        },
      );
      return comPermite(local, acesso, arvore);
    },
  );
};
