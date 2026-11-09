// O estoque dos consumíveis pela API (spec estoque; change p4c-estoque, design, decisões 3 a 5), no
// escopo do Operação: quem vê o estoque lê os saldos, as movimentações e os consumíveis abaixo do
// mínimo dos locais do alcance; quem o movimenta define o mínimo e lança as entradas, as saídas, as
// transferências e os ajustes, numa transação que confere os campos, as permissões em cada local,
// as referências e o saldo, e grava a movimentação, a auditoria e o evento.
import {
  ativos,
  type Banco,
  consumiveis,
  consumiveisDosModelos,
  modelos,
  movimentosDoEstoque,
  naOrganizacao,
  saldosDoEstoque,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import { alcance, montarArvore, normalizarTexto, pode, rotuloDoAtivo } from '@grafite/domain';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  max,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { modulosDesligados } from '../acesso/modulos.ts';
import { lerArvore, lerLocais } from '../arvore.ts';
import { contendo } from '../busca.ts';
import { pelaBuscaDoConsumivel } from '../consumiveis/consumiveis.ts';
import {
  AbaixoDoMinimo,
  AtivosParaSaida,
  EntradasDoFornecedor,
  EstoqueDoConsumivel,
  FiltrosDasMovimentacoes,
  FiltrosDosAtivosParaSaida,
  FiltrosDosSaldos,
  LancamentoDoEstoque,
  ListaDeMovimentacoes,
  ListaDeSaldos,
  ParametrosDoMinimo,
  PedidoDeAjuste,
  PedidoDeEntrada,
  PedidoDeSaida,
  PedidoDeTransferencia,
  PedidoDoMinimo,
  SaldoDoEstoque,
} from '../estoque/esquemas.ts';
import { lancar } from '../estoque/lancamento.ts';
import {
  type LeitorDoEstoque,
  lerMovimentos,
  lerPaginaDeMovimentos,
  lerPaginaDeSaldos,
  lerSaldos,
  locaisDaConsulta,
  localEm,
} from '../estoque/leitura.ts';
import { definirMinimo } from '../estoque/minimo.ts';
import { lerFornecedor } from '../fornecedores/fornecedores.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const ParametrosDoConsumivel = z.object({ id: z.uuid({ error: 'Consumível não encontrado.' }) });
const ParametrosDoFornecedor = z.object({ id: z.uuid({ error: 'Fornecedor não encontrado.' }) });

/** As movimentações mais novas que a ficha do consumível mostra. */
const MOVIMENTOS_NA_FICHA = 10;

const PROBLEMAS_DO_LANCAMENTO = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

/** As condições dos saldos que a conta vê, com os filtros da tela. */
function condicoesDosSaldos(
  leitor: LeitorDoEstoque,
  filtros: z.infer<typeof FiltrosDosSaldos>,
): SQL[] {
  const condicoes: SQL[] = [];
  const locais = locaisDaConsulta(leitor, 'estoque.ver', filtros.local);
  if (locais !== null) condicoes.push(localEm(saldosDoEstoque.localId, locais));
  if (filtros.consumivel) condicoes.push(eq(saldosDoEstoque.consumivelId, filtros.consumivel));
  if (filtros.tipo) condicoes.push(eq(consumiveis.tipo, filtros.tipo));
  if (filtros.situacao === 'abaixo-do-minimo')
    condicoes.push(isNotNull(saldosDoEstoque.abaixoDesde));
  if (filtros.situacao === 'sem-estoque') condicoes.push(eq(saldosDoEstoque.saldo, 0));
  if (filtros.situacao === 'em-estoque') {
    condicoes.push(gt(saldosDoEstoque.saldo, 0), isNull(saldosDoEstoque.abaixoDesde));
  }
  const doTexto = pelaBuscaDoConsumivel(filtros.busca);
  if (doTexto) condicoes.push(doTexto);
  return condicoes;
}

/**
 * Os ativos para a saída: os ativos que a conta vê, pelas palavras do patrimônio, do nome ou do
 * modelo, com os de modelo compatível com o consumível primeiro, como sugeridos.
 */
async function ativosParaSaida(
  tx: Transacao,
  leitor: LeitorDoEstoque,
  filtros: z.infer<typeof FiltrosDosAtivosParaSaida>,
): Promise<z.infer<typeof AtivosParaSaida>> {
  const { acesso, arvore } = leitor;
  const doVer = alcance(acesso, 'ativos.ver', arvore);
  if (!doVer) return { ativos: [] };
  const condicoes: SQL[] = [eq(ativos.situacao, 'ativo')];
  // O ativo sem local só entra pela organização inteira, como na tabela dos ativos.
  if (doVer !== 'organizacao') condicoes.push(localEm(ativos.localId, [...doVer]));
  for (const palavra of normalizarTexto(filtros.busca ?? '')
    .split(' ')
    .filter(Boolean)) {
    const padrao = contendo(palavra);
    condicoes.push(or(like(ativos.busca, padrao), like(modelos.busca, padrao)) as SQL);
  }
  const sugerido = filtros.consumivel
    ? sql<boolean>`exists (select 1 from ${consumiveisDosModelos}
        where ${consumiveisDosModelos.consumivelId} = ${filtros.consumivel}
        and ${consumiveisDosModelos.modeloId} = ${ativos.modeloId})`
    : sql<boolean>`false`;
  const linhas = await tx
    .select({
      id: ativos.id,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      tipo: { nome: tiposDeAtivo.nome },
      modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
      sugerido,
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(and(...condicoes))
    // Sem o consumível, nenhum é sugerido, e a ordem é só a do patrimônio.
    .orderBy(
      ...(filtros.consumivel ? [desc(sugerido)] : []),
      asc(ativos.patrimonioNormalizado),
      asc(ativos.id),
    )
    .limit(filtros.limite);
  return {
    ativos: linhas.map((linha) => ({
      id: linha.id,
      rotulo: rotuloDoAtivo({ nome: linha.nome, modelo: linha.modelo, tipo: linha.tipo }),
      patrimonio: linha.patrimonio,
      local: linha.localId ? { id: linha.localId, caminho: arvore.caminho(linha.localId) } : null,
      sugerido: linha.sugerido,
    })),
  };
}

/** As condições das movimentações que a conta vê, na origem ou no destino, com os filtros. */
function condicoesDasMovimentacoes(
  leitor: LeitorDoEstoque,
  filtros: z.infer<typeof FiltrosDasMovimentacoes>,
): SQL[] {
  const condicoes: SQL[] = [];
  const naOrigemOuNoDestino = (locais: readonly string[]) =>
    or(
      localEm(movimentosDoEstoque.origemId, locais),
      localEm(movimentosDoEstoque.destinoId, locais),
    ) as SQL;
  const doAlcance = locaisDaConsulta(leitor, 'estoque.ver');
  if (doAlcance !== null) condicoes.push(naOrigemOuNoDestino(doAlcance));
  if (filtros.local) {
    const { arvore } = leitor;
    const ramo = arvore.local(filtros.local) ? [...arvore.ramo(filtros.local)] : [];
    condicoes.push(naOrigemOuNoDestino(ramo));
  }
  if (filtros.de) condicoes.push(gte(movimentosDoEstoque.momento, new Date(filtros.de)));
  if (filtros.ate) condicoes.push(lte(movimentosDoEstoque.momento, new Date(filtros.ate)));
  if (filtros.tipo) condicoes.push(eq(movimentosDoEstoque.tipo, filtros.tipo));
  if (filtros.consumivel) {
    condicoes.push(eq(movimentosDoEstoque.consumivelId, filtros.consumivel));
  }
  if (filtros.fornecedor) {
    condicoes.push(eq(movimentosDoEstoque.fornecedorId, filtros.fornecedor));
  }
  if (filtros.ativo) condicoes.push(eq(movimentosDoEstoque.ativoId, filtros.ativo));
  return condicoes;
}

/** Os pares abaixo do mínimo que a fonte do Início lê de uma vez. */
const TETO_DO_ABAIXO_DO_MINIMO = 200;

export const rotasDoEstoque: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/estoque/saldos',
    {
      config: { permissao: 'estoque.ver' },
      schema: {
        summary:
          'Os saldos dos consumíveis nos locais que a conta vê, com a busca, os filtros e o cursor',
        querystring: FiltrosDosSaldos,
        response: { 200: ListaDeSaldos, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const filtros = requisicao.query;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const locais = await lerLocais(tx);
        const leitor: LeitorDoEstoque = { acesso, arvore: montarArvore(locais) };
        const condicoes = condicoesDosSaldos(leitor, filtros);
        const [contagem] = await tx
          .select({ total: count() })
          .from(saldosDoEstoque)
          .innerJoin(consumiveis, eq(consumiveis.id, saldosDoEstoque.consumivelId))
          .where(and(...condicoes));
        const pagina = await lerPaginaDeSaldos(tx, leitor, {
          locais,
          onde: and(...condicoes),
          cursor: filtros.cursor,
          limite: filtros.limite,
        });
        return {
          ...pagina,
          total: contagem?.total ?? 0,
          permite: { movimentar: pode(acesso, 'estoque.movimentar') },
        };
      });
    },
  );

  app.get(
    '/estoque/movimentos',
    {
      config: { permissao: 'estoque.ver' },
      schema: {
        summary:
          'As movimentações com a origem ou o destino nos locais que a conta vê, da mais nova para a mais antiga, com os filtros e o cursor',
        querystring: FiltrosDasMovimentacoes,
        response: { 200: ListaDeMovimentacoes, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const filtros = requisicao.query;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const leitor: LeitorDoEstoque = { acesso, arvore: await lerArvore(tx) };
        const condicoes = condicoesDasMovimentacoes(leitor, filtros);
        const [contagem] = await tx
          .select({ total: count() })
          .from(movimentosDoEstoque)
          .where(and(...condicoes));
        const pagina = await lerPaginaDeMovimentos(tx, leitor, {
          onde: and(...condicoes),
          cursor: filtros.cursor,
          limite: filtros.limite,
        });
        return { ...pagina, total: contagem?.total ?? 0 };
      });
    },
  );

  app.get(
    '/estoque/abaixo-do-minimo',
    {
      config: { permissao: 'estoque.ver' },
      schema: {
        summary:
          'Os consumíveis abaixo do mínimo nos locais que a conta vê, os mais antigos primeiro, para o Início',
        response: { 200: AbaixoDoMinimo, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const leitor: LeitorDoEstoque = { acesso, arvore: await lerArvore(tx) };
        const locais = locaisDaConsulta(leitor, 'estoque.ver');
        const itens = await lerSaldos(tx, leitor, {
          onde: and(
            isNotNull(saldosDoEstoque.abaixoDesde),
            locais === null ? undefined : localEm(saldosDoEstoque.localId, locais),
          ),
          ordem: [asc(saldosDoEstoque.abaixoDesde), asc(saldosDoEstoque.id)],
          limite: TETO_DO_ABAIXO_DO_MINIMO,
        });
        return { itens };
      });
    },
  );

  app.get(
    '/estoque/ativos-para-saida',
    {
      config: { permissao: 'estoque.movimentar' },
      schema: {
        summary:
          'Os ativos ativos que a conta vê, para a saída, com os de modelo compatível com o consumível como sugeridos',
        querystring: FiltrosDosAtivosParaSaida,
        response: { 200: AtivosParaSaida, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      if ((await modulosDesligados(banco, orgId)).includes('ativos')) return { ativos: [] };
      return naOrganizacao(banco, orgId, async (tx) =>
        ativosParaSaida(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.query),
      );
    },
  );

  app.get(
    '/consumiveis/:id/estoque',
    {
      config: { permissao: 'estoque.ver' },
      schema: {
        summary:
          'O estoque de um consumível nos locais que a conta vê: os saldos, a soma e as movimentações mais novas',
        params: ParametrosDoConsumivel,
        response: { 200: EstoqueDoConsumivel, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const { id } = requisicao.params;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [consumivel] = await tx
          .select({ id: consumiveis.id })
          .from(consumiveis)
          .where(eq(consumiveis.id, id));
        if (!consumivel) throw naoEncontrado('Consumível não encontrado.');
        const leitor: LeitorDoEstoque = { acesso, arvore: await lerArvore(tx) };
        const locais = locaisDaConsulta(leitor, 'estoque.ver');
        const saldos = (
          await lerSaldos(tx, leitor, {
            onde: and(
              eq(saldosDoEstoque.consumivelId, id),
              locais === null ? undefined : localEm(saldosDoEstoque.localId, locais),
            ),
          })
        ).sort((a, b) => a.local.caminho.localeCompare(b.local.caminho, 'pt-BR'));
        const movimentos = await lerMovimentos(tx, leitor, {
          onde: and(
            eq(movimentosDoEstoque.consumivelId, id),
            locais === null
              ? undefined
              : or(
                  localEm(movimentosDoEstoque.origemId, locais),
                  localEm(movimentosDoEstoque.destinoId, locais),
                ),
          ),
          limite: MOVIMENTOS_NA_FICHA,
        });
        return {
          saldos,
          soma: saldos.reduce((soma, { saldo }) => soma + saldo, 0),
          movimentos,
          permite: { movimentar: pode(acesso, 'estoque.movimentar') },
        };
      });
    },
  );

  app.get(
    '/fornecedores/:id/entradas',
    {
      config: { permissao: 'estoque.ver' },
      schema: {
        summary:
          'Quantas entradas do fornecedor houve nos locais que a conta vê, e o momento da última',
        params: ParametrosDoFornecedor,
        response: { 200: EntradasDoFornecedor, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const fornecedor = await lerFornecedor(tx, requisicao.params.id);
        const locais = locaisDaConsulta({ acesso, arvore: await lerArvore(tx) }, 'estoque.ver');
        const [contagem] = await tx
          .select({ entradas: count(), ultima: max(movimentosDoEstoque.momento) })
          .from(movimentosDoEstoque)
          .where(
            and(
              eq(movimentosDoEstoque.tipo, 'entrada'),
              eq(movimentosDoEstoque.fornecedorId, fornecedor.id),
              locais === null ? undefined : localEm(movimentosDoEstoque.destinoId, locais),
            ),
          );
        return {
          entradas: contagem?.entradas ?? 0,
          ultima: contagem?.ultima?.toISOString() ?? null,
        };
      });
    },
  );

  app.put(
    '/estoque/minimos/:consumivelId/:localId',
    {
      config: { permissao: 'estoque.movimentar' },
      schema: {
        summary: 'Definir o mínimo de um consumível num local; 0 é sem mínimo',
        params: ParametrosDoMinimo,
        body: PedidoDoMinimo,
        response: { 200: SaldoDoEstoque, ...PROBLEMAS_DO_LANCAMENTO },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        definirMinimo(
          tx,
          { ...requisicao.params, minimo: requisicao.body.minimo },
          { requisicao, momento: agora() },
        ),
      ),
  );

  app.post(
    '/estoque/entradas',
    {
      config: { permissao: 'estoque.movimentar' },
      schema: {
        summary: 'Lançar uma entrada no estoque de um local, com o fornecedor e a nota fiscal',
        body: PedidoDeEntrada,
        response: { 201: LancamentoDoEstoque, ...PROBLEMAS_DO_LANCAMENTO },
      },
    },
    async (requisicao, resposta) => {
      const pedido = requisicao.body;
      const lancamento = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        lancar(
          tx,
          {
            tipo: 'entrada',
            consumivel: pedido.consumivel ?? null,
            quantidade: pedido.quantidade ?? null,
            destino: pedido.destino ?? null,
            fornecedor: pedido.fornecedor ?? null,
            notaFiscal: pedido.notaFiscal ?? null,
            observacao: pedido.observacao ?? null,
          },
          { requisicao, momento: agora() },
        ),
      );
      return resposta.code(201).send(lancamento);
    },
  );

  app.post(
    '/estoque/saidas',
    {
      config: { permissao: 'estoque.movimentar' },
      schema: {
        summary:
          'Lançar uma saída do estoque de um local para um ativo que a conta vê, com o total de páginas lido na hora',
        body: PedidoDeSaida,
        response: { 201: LancamentoDoEstoque, ...PROBLEMAS_DO_LANCAMENTO },
      },
    },
    async (requisicao, resposta) => {
      const pedido = requisicao.body;
      const lancamento = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        lancar(
          tx,
          {
            tipo: 'saida',
            consumivel: pedido.consumivel ?? null,
            quantidade: pedido.quantidade ?? null,
            origem: pedido.origem ?? null,
            ativo: pedido.ativo ?? null,
            observacao: pedido.observacao ?? null,
          },
          { requisicao, momento: agora() },
        ),
      );
      return resposta.code(201).send(lancamento);
    },
  );

  app.post(
    '/estoque/transferencias',
    {
      config: { permissao: 'estoque.movimentar' },
      schema: {
        summary: 'Lançar uma transferência entre dois locais do estoque, com a permissão nos dois',
        body: PedidoDeTransferencia,
        response: { 201: LancamentoDoEstoque, ...PROBLEMAS_DO_LANCAMENTO },
      },
    },
    async (requisicao, resposta) => {
      const pedido = requisicao.body;
      const lancamento = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        lancar(
          tx,
          {
            tipo: 'transferencia',
            consumivel: pedido.consumivel ?? null,
            quantidade: pedido.quantidade ?? null,
            origem: pedido.origem ?? null,
            destino: pedido.destino ?? null,
            observacao: pedido.observacao ?? null,
          },
          { requisicao, momento: agora() },
        ),
      );
      return resposta.code(201).send(lancamento);
    },
  );

  app.post(
    '/estoque/ajustes',
    {
      config: { permissao: 'estoque.movimentar' },
      schema: {
        summary: 'Lançar um ajuste do estoque de um local, que acrescenta ou retira, com o motivo',
        body: PedidoDeAjuste,
        response: { 201: LancamentoDoEstoque, ...PROBLEMAS_DO_LANCAMENTO },
      },
    },
    async (requisicao, resposta) => {
      const pedido = requisicao.body;
      const lancamento = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        lancar(
          tx,
          {
            tipo: 'ajuste',
            consumivel: pedido.consumivel ?? null,
            quantidade: pedido.quantidade ?? null,
            local: pedido.local ?? null,
            direcao: pedido.direcao ?? null,
            motivo: pedido.motivo ?? null,
            observacao: pedido.observacao ?? null,
          },
          { requisicao, momento: agora() },
        ),
      );
      return resposta.code(201).send(lancamento);
    },
  );
};
