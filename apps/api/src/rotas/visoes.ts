// As visões de tabela (spec visoes-de-tabela; design do P1c, decisões 5 e 6): cada conta cria, edita e
// remove as próprias, que só ela vê, sem a auditoria, com o evento só para as sessões dela; as da
// organização, que todos usam, pedem `organizacao.editar` e vão para a auditoria, com o evento para
// todas as sessões. As visões seguem a tabela: a permissão de vê-la e o módulo dela, que, desligado,
// as recusa como recusa as rotas dele.
import {
  type Banco,
  contas,
  mudancasDasVisoes,
  naOrganizacao,
  organizacoes,
  type Transacao,
  visoes,
} from '@grafite/db';
import {
  type DefinicaoDaVisao,
  LIMITES_DA_VISAO,
  lerDefinicaoDaVisao,
  lerMudancasDaVisao,
  lerNomeDaVisao,
  normalizarTexto,
  pode,
  type TabelaComVisoes as Tabela,
  tabelaComVisoes,
  VISAO_DE_FABRICA,
} from '@grafite/domain';
import { and, asc, count, eq, isNull, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RecusaDePermissao, sessaoDa } from '../acesso/escopo.ts';
import { moduloDesligado, modulosDesligados } from '../acesso/modulos.ts';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { registrarEvento } from '../eventos/saida.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { visaoNaAuditoria } from '../visoes/descricao.ts';
import {
  FiltroDasMudancas,
  MudancasDaVisao,
  ParametrosDaVisao,
  PedidoDeAlteracaoDaVisao,
  PedidoDeMudancas,
  PedidoDeVisao,
  TabelaComVisoes,
  VisaoDaTabela,
  VisoesDaTabela,
} from '../visoes/esquemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const NOME_REPETIDO = 'Já existe uma visão com este nome.';
const NAO_ENCONTRADA = 'Visão não encontrada.';

const PROBLEMAS_DA_VISAO = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

type LinhaDaVisao = typeof visoes.$inferSelect;

/**
 * A tabela pedida, conferida: o módulo dela ligado na organização e a permissão de vê-la. A recusa
 * da permissão vai para a auditoria, como a das rotas.
 */
async function conferirTabela(
  banco: Banco,
  requisicao: FastifyRequest,
  sessao: SessaoDaRequisicao,
  id: string,
): Promise<Tabela> {
  const tabela = tabelaComVisoes(id);
  if (!tabela) throw dadosInvalidos({ tabela: 'Tabela desconhecida.' });
  const orgId = requisicao.organizacao?.id ?? '';
  if (tabela.modulo && (await modulosDesligados(banco, orgId)).includes(tabela.modulo)) {
    throw moduloDesligado(tabela.modulo);
  }
  if (!pode(sessao.acesso, tabela.permissao)) throw new RecusaDePermissao(tabela.permissao);
  return tabela;
}

/** A visão como a API a devolve, com o que a conta pode fazer com ela. */
function comoVisao(linha: LinhaDaVisao, sessao: SessaoDaRequisicao): z.infer<typeof VisaoDaTabela> {
  return {
    id: linha.id,
    nome: linha.nome,
    compartilhada: linha.contaId === null,
    definicao: linha.definicao as unknown as DefinicaoDaVisao,
    permite: {
      editar: linha.contaId === null ? pode(sessao.acesso, 'organizacao.editar') : true,
    },
  };
}

function nomeConferido(bruto: string): string {
  const lido = lerNomeDaVisao(bruto);
  if (!lido.ok) throw dadosInvalidos({ nome: lido.erro });
  return lido.nome;
}

function definicaoConferida(bruta: unknown): DefinicaoDaVisao {
  const lida = lerDefinicaoDaVisao(bruta);
  if (!lida.ok) throw dadosInvalidos({ definicao: lida.erro });
  return lida.definicao;
}

/** A gravação da visão, com o nome repetido como recusa no nome. */
async function semNomeRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (
      violouUnicidade(erro, 'visoes_nome_da_organizacao_unico') ||
      violouUnicidade(erro, 'visoes_nome_da_conta_unico')
    ) {
      throw conflito(NOME_REPETIDO, { nome: NOME_REPETIDO });
    }
    throw erro;
  }
}

/**
 * O limite de visões da conta ou da organização na tabela. A linha da dona fica travada até o fim
 * da transação: duas criações juntas contam uma depois da outra.
 */
async function conferirLimite(
  tx: Transacao,
  tabela: Tabela,
  contaId: string | null,
  orgId: string,
) {
  if (contaId) {
    await tx.select({ id: contas.id }).from(contas).where(eq(contas.id, contaId)).for('update');
  } else {
    await tx
      .select({ id: organizacoes.id })
      .from(organizacoes)
      .where(eq(organizacoes.id, orgId))
      .for('update');
  }
  const [contagem] = await tx
    .select({ total: count() })
    .from(visoes)
    .where(
      and(
        eq(visoes.tabela, tabela.id as LinhaDaVisao['tabela']),
        contaId ? eq(visoes.contaId, contaId) : isNull(visoes.contaId),
      ),
    );
  const total = contagem?.total ?? 0;
  if (contaId && total >= LIMITES_DA_VISAO.visoesDaConta) {
    throw conflito('Você já tem 50 visões nesta tabela. Remova uma para criar outra.');
  }
  if (!contaId && total >= LIMITES_DA_VISAO.visoesDaOrganizacao) {
    throw conflito('A organização já tem 100 visões nesta tabela. Remova uma para criar outra.');
  }
}

/** A visão da organização, ou a da própria conta; a de outra conta não existe para quem pede. */
async function lerVisao(tx: Transacao, id: string, sessao: SessaoDaRequisicao) {
  const [linha] = await tx
    .select()
    .from(visoes)
    .where(and(eq(visoes.id, id), or(isNull(visoes.contaId), eq(visoes.contaId, sessao.contaId))))
    .for('update');
  if (!linha) throw naoEncontrado(NAO_ENCONTRADA);
  return linha;
}

/** A visão da organização pede `organizacao.editar` para mudar; a recusa vai para a auditoria. */
function conferirEdicao(linha: LinhaDaVisao, sessao: SessaoDaRequisicao) {
  if (linha.contaId === null && !pode(sessao.acesso, 'organizacao.editar')) {
    throw new RecusaDePermissao('organizacao.editar');
  }
}

type LinhaDasMudancas = typeof mudancasDasVisoes.$inferSelect;

/** As mudanças como a API as devolve: a visão pelo id, ou `fabrica`. */
const comoMudancas = (linha: LinhaDasMudancas): z.infer<typeof MudancasDaVisao> => ({
  visao: linha.visaoId ?? VISAO_DE_FABRICA,
  definicao: linha.definicao as unknown as DefinicaoDaVisao,
  atualizadaEm: linha.atualizadaEm.toISOString(),
});

/** A visão das mudanças pelo id: a de fábrica é nula. */
const visaoDasMudancas = (visao: string) =>
  visao === VISAO_DE_FABRICA
    ? isNull(mudancasDasVisoes.visaoId)
    : eq(mudancasDasVisoes.visaoId, visao);

/** O evento da visão da conta, só para as sessões dela; o da organização vai com a auditoria. */
const eventoDaConta = (tx: Transacao, id: string, contaId: string) =>
  registrarEvento(tx, {
    tipo: 'visoes.mudaram',
    alvo: { tipo: 'visao', id },
    publico: { contas: [contaId] },
  });

export const rotasDasVisoes: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/visoes',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'As visões de uma tabela: as da organização e as da própria conta',
        querystring: z.object({ tabela: TabelaComVisoes }),
        response: { 200: VisoesDaTabela, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const tabela = await conferirTabela(banco, requisicao, sessao, requisicao.query.tabela);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linhas = await tx
          .select()
          .from(visoes)
          .where(
            and(
              eq(visoes.tabela, tabela.id as LinhaDaVisao['tabela']),
              or(isNull(visoes.contaId), eq(visoes.contaId, sessao.contaId)),
            ),
          )
          .orderBy(sql`${visoes.contaId} is not null`, asc(visoes.nomeNormalizado));
        const mudancas = await tx
          .select()
          .from(mudancasDasVisoes)
          .where(
            and(
              eq(mudancasDasVisoes.contaId, sessao.contaId),
              eq(mudancasDasVisoes.tabela, tabela.id as LinhaDasMudancas['tabela']),
            ),
          )
          .orderBy(asc(mudancasDasVisoes.atualizadaEm));
        return {
          visoes: linhas.map((linha) => comoVisao(linha, sessao)),
          mudancas: mudancas.map(comoMudancas),
          permite: { compartilhar: pode(sessao.acesso, 'organizacao.editar') },
        };
      });
    },
  );

  app.post(
    '/visoes',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Criar uma visão da conta ou, com a permissão, da organização',
        body: PedidoDeVisao,
        response: { 201: VisaoDaTabela, ...PROBLEMAS_DA_VISAO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const tabela = await conferirTabela(banco, requisicao, sessao, pedido.tabela);
      const nome = nomeConferido(pedido.nome);
      const definicao = definicaoConferida(pedido.definicao);
      if (pedido.compartilhada && !pode(sessao.acesso, 'organizacao.editar')) {
        throw new RecusaDePermissao('organizacao.editar');
      }
      const orgId = requisicao.organizacao?.id ?? '';
      const dona = pedido.compartilhada ? null : sessao.contaId;
      const momento = agora();
      const criada = await naOrganizacao(banco, orgId, async (tx) => {
        await conferirLimite(tx, tabela, dona, orgId);
        const [linha] = await semNomeRepetido(() =>
          tx
            .insert(visoes)
            .values({
              orgId: sql`app.current_org()`,
              tabela: tabela.id as LinhaDaVisao['tabela'],
              contaId: dona,
              nome,
              nomeNormalizado: normalizarTexto(nome),
              definicao: definicao as unknown as Record<string, unknown>,
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!linha) throw new Error('A visão não foi criada.');
        if (dona) await eventoDaConta(tx, linha.id, dona);
        else {
          await registrarNaAuditoria(tx, {
            acao: 'visao.criada',
            ator: { tipo: 'conta', contaId: sessao.contaId },
            alvo: { tipo: 'visao', id: linha.id },
            depois: await visaoNaAuditoria(tx, { tabela: tabela.id, nome, definicao }),
            origem: origemDa(requisicao),
            momento,
            saida: { publico: { todas: true } },
          });
        }
        return comoVisao(linha, sessao);
      });
      return resposta.code(201).send(criada);
    },
  );

  app.put(
    '/visoes/mudancas',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Guardar as mudanças da conta sobre a visão de fábrica ou uma da organização',
        body: PedidoDeMudancas,
        response: { 200: MudancasDaVisao, ...PROBLEMAS_DA_VISAO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const lidas = lerMudancasDaVisao(requisicao.body);
      if (!lidas.ok) {
        throw dadosInvalidos(
          lidas.erro === 'A visão não existe.' ? { visao: lidas.erro } : { definicao: lidas.erro },
        );
      }
      const { mudancas } = lidas;
      const tabela = await conferirTabela(banco, requisicao, sessao, mudancas.tabela);
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      return naOrganizacao(banco, orgId, async (tx) => {
        const visaoId = mudancas.visao === VISAO_DE_FABRICA ? null : mudancas.visao;
        if (visaoId) {
          // A visão de outra conta não existe para quem pede; a própria guarda as mudanças nela.
          const visao = await lerVisao(tx, visaoId, sessao);
          if (visao.tabela !== tabela.id) throw naoEncontrado(NAO_ENCONTRADA);
          if (visao.contaId !== null) throw conflito('A visão é sua: as mudanças ficam nela.');
        }
        const [linha] = await tx
          .insert(mudancasDasVisoes)
          .values({
            orgId: sql`app.current_org()`,
            contaId: sessao.contaId,
            tabela: tabela.id as LinhaDasMudancas['tabela'],
            visaoId,
            definicao: mudancas.definicao as unknown as Record<string, unknown>,
            atualizadaEm: momento,
          })
          .onConflictDoUpdate({
            target: [
              mudancasDasVisoes.orgId,
              mudancasDasVisoes.contaId,
              mudancasDasVisoes.tabela,
              mudancasDasVisoes.visaoId,
            ],
            set: {
              definicao: mudancas.definicao as unknown as Record<string, unknown>,
              atualizadaEm: momento,
            },
          })
          .returning();
        if (!linha) throw new Error('As mudanças não foram guardadas.');
        await eventoDaConta(tx, linha.id, sessao.contaId);
        return comoMudancas(linha);
      });
    },
  );

  app.delete(
    '/visoes/mudancas',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Restaurar uma visão, ou todas da tabela, sem as mudanças da conta',
        querystring: FiltroDasMudancas,
        response: { 204: z.null(), ...PROBLEMAS_DA_VISAO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const { visao } = requisicao.query;
      const tabela = await conferirTabela(banco, requisicao, sessao, requisicao.query.tabela);
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const apagadas = await tx
          .delete(mudancasDasVisoes)
          .where(
            and(
              eq(mudancasDasVisoes.contaId, sessao.contaId),
              eq(mudancasDasVisoes.tabela, tabela.id as LinhaDasMudancas['tabela']),
              visao === undefined ? undefined : visaoDasMudancas(visao),
            ),
          )
          .returning({ id: mudancasDasVisoes.id });
        const [primeira] = apagadas;
        if (primeira) await eventoDaConta(tx, primeira.id, sessao.contaId);
      });
      return resposta.code(204).send(null);
    },
  );

  app.patch(
    '/visoes/:id',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Renomear ou salvar a definição de uma visão',
        params: ParametrosDaVisao,
        body: PedidoDeAlteracaoDaVisao,
        response: { 200: VisaoDaTabela, ...PROBLEMAS_DA_VISAO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const nome = pedido.nome === undefined ? undefined : nomeConferido(pedido.nome);
      const definicao =
        pedido.definicao === undefined ? undefined : definicaoConferida(pedido.definicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      const linha = await naOrganizacao(banco, orgId, (tx) =>
        lerVisao(tx, requisicao.params.id, sessao),
      );
      const tabela = await conferirTabela(banco, requisicao, sessao, linha.tabela);
      conferirEdicao(linha, sessao);
      return naOrganizacao(banco, orgId, async (tx) => {
        const antes = await lerVisao(tx, linha.id, sessao);
        const [depois] = await semNomeRepetido(() =>
          tx
            .update(visoes)
            .set({
              ...(nome === undefined ? {} : { nome, nomeNormalizado: normalizarTexto(nome) }),
              ...(definicao === undefined
                ? {}
                : { definicao: definicao as unknown as Record<string, unknown> }),
              atualizadoEm: momento,
            })
            .where(eq(visoes.id, antes.id))
            .returning(),
        );
        if (!depois) throw naoEncontrado(NAO_ENCONTRADA);
        if (depois.contaId) await eventoDaConta(tx, depois.id, depois.contaId);
        else {
          const naAuditoria = (visao: LinhaDaVisao) =>
            visaoNaAuditoria(tx, {
              tabela: tabela.id,
              nome: visao.nome,
              definicao: visao.definicao as unknown as DefinicaoDaVisao,
            });
          await registrarNaAuditoria(tx, {
            acao: 'visao.alterada',
            ator: { tipo: 'conta', contaId: sessao.contaId },
            alvo: { tipo: 'visao', id: depois.id },
            antes: await naAuditoria(antes),
            depois: await naAuditoria(depois),
            origem: origemDa(requisicao),
            momento,
            saida: { publico: { todas: true } },
          });
        }
        return comoVisao(depois, sessao);
      });
    },
  );

  app.post(
    '/visoes/:id/publicar',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Gravar as mudanças da conta na visão da organização, para todos',
        params: ParametrosDaVisao,
        response: { 200: VisaoDaTabela, ...PROBLEMAS_DA_VISAO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      const linha = await naOrganizacao(banco, orgId, (tx) =>
        lerVisao(tx, requisicao.params.id, sessao),
      );
      const tabela = await conferirTabela(banco, requisicao, sessao, linha.tabela);
      if (linha.contaId !== null) throw conflito('A visão é sua: as mudanças ficam nela.');
      conferirEdicao(linha, sessao);
      return naOrganizacao(banco, orgId, async (tx) => {
        const antes = await lerVisao(tx, linha.id, sessao);
        const [mudancas] = await tx
          .delete(mudancasDasVisoes)
          .where(
            and(
              eq(mudancasDasVisoes.contaId, sessao.contaId),
              eq(mudancasDasVisoes.visaoId, antes.id),
            ),
          )
          .returning();
        if (!mudancas) throw conflito('Não há mudanças suas nesta visão.');
        const [depois] = await tx
          .update(visoes)
          .set({ definicao: mudancas.definicao, atualizadoEm: momento })
          .where(eq(visoes.id, antes.id))
          .returning();
        if (!depois) throw naoEncontrado(NAO_ENCONTRADA);
        const naAuditoria = (visao: LinhaDaVisao) =>
          visaoNaAuditoria(tx, {
            tabela: tabela.id,
            nome: visao.nome,
            definicao: visao.definicao as unknown as DefinicaoDaVisao,
          });
        await registrarNaAuditoria(tx, {
          acao: 'visao.alterada',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'visao', id: depois.id },
          antes: await naAuditoria(antes),
          depois: await naAuditoria(depois),
          origem: origemDa(requisicao),
          momento,
          saida: { publico: { todas: true } },
        });
        return comoVisao(depois, sessao);
      });
    },
  );

  app.delete(
    '/visoes/:id',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Remover uma visão, de vez',
        params: ParametrosDaVisao,
        response: { 204: z.null(), ...PROBLEMAS_DA_VISAO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      const linha = await naOrganizacao(banco, orgId, (tx) =>
        lerVisao(tx, requisicao.params.id, sessao),
      );
      const tabela = await conferirTabela(banco, requisicao, sessao, linha.tabela);
      conferirEdicao(linha, sessao);
      await naOrganizacao(banco, orgId, async (tx) => {
        const antes = await lerVisao(tx, linha.id, sessao);
        await tx.delete(visoes).where(eq(visoes.id, antes.id));
        if (antes.contaId) await eventoDaConta(tx, antes.id, antes.contaId);
        else {
          await registrarNaAuditoria(tx, {
            acao: 'visao.removida',
            ator: { tipo: 'conta', contaId: sessao.contaId },
            alvo: { tipo: 'visao', id: antes.id },
            antes: await visaoNaAuditoria(tx, {
              tabela: tabela.id,
              nome: antes.nome,
              definicao: antes.definicao as unknown as DefinicaoDaVisao,
            }),
            origem: origemDa(requisicao),
            momento,
            saida: { publico: { todas: true } },
          });
        }
      });
      return resposta.code(204).send(null);
    },
  );
};
