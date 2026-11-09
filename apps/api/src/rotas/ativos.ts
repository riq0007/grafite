// Os ativos (spec cadastro-de-ativos; design do P1b, decisões 4 a 9): a lista e a ficha para quem
// tem `ativos.ver` no local do ativo; o cadastro, a edição, as travas, a inativação e a reativação
// para quem tem `ativos.editar` nele. O ativo sem local só é alcançado pela organização inteira, e
// os campos restritos pedem `ativos.restritos`.
import {
  ativos,
  type Banco,
  modelos,
  naOrganizacao,
  pessoas,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  alcance,
  normalizarTexto,
  pode,
  podeEm,
  rotuloDoAtivo,
} from '@grafite/domain';
import { and, count, desc, eq, inArray, like, lt, or, type SQL, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { BytesDaImagem, BytesDoArquivo } from '../arquivos/esquemas.ts';
import {
  aceitarImagens,
  type DependenciasDasImagens,
  entregarImagem,
  IMAGEM_ENTREGUE,
  type ImagemDoRegistro,
  imagemNaoEncontrada,
  quemMuda,
  TIPOS_DO_ENVIO,
  tirarImagem,
  trocarImagem,
} from '../arquivos/imagem-do-registro.ts';
import { lerArvore } from '../arvore.ts';
import {
  aceitarArquivos,
  entregarArquivoDoCampo,
  tirarArquivoDoCampo,
  trocarArquivoDoCampo,
} from '../ativos/arquivos-dos-campos.ts';
import {
  chavesRestritas,
  condicoesDosFiltros,
  depoisDoCursor,
  lerColunasPedidas,
  lerContextoDaTabela,
  lerFiltrosPedidos,
  ordemPedida,
  ordenacaoDaConsulta,
  referenciasDaLista,
  valorDaContagem,
  valorDaOrdem,
} from '../ativos/colunas.ts';
import { gravarAtivo, mudarSituacaoDoAtivo, quemGravaPela } from '../ativos/escrita.ts';
import {
  ChaveDaOrdemDoAtivo,
  ChaveDoAtivo,
  ContagensDaColuna,
  EtiquetasDosAtivos,
  FichaDoAtivo,
  FiltrosDasContagens,
  FiltrosDeAtivos,
  FiltrosDoHistorico,
  HistoricoDoAtivo,
  LigacaoLivre,
  LigadosDoAtivo,
  ListaDeAtivos,
  NomeDoArquivoEnviado,
  ParametrosDaEntregaDoArquivo,
  ParametrosDaImagemDoAtivo,
  ParametrosDaLigacao,
  ParametrosDoArquivoDoCampo,
  ParametrosDoAtivo,
  PedidoDasEtiquetas,
  PedidoDeAlteracaoDoAtivo,
  PedidoDeAtivo,
  PedidoDeLigacao,
  ResumoDoAtivo,
  SerieDosSuprimentos,
} from '../ativos/esquemas.ts';
import { historicoDoAtivo } from '../ativos/historico.ts';
import {
  ativoNaLista,
  COLUNAS_DO_ATIVO,
  consultarAtivos,
  doModelo,
  doResponsavel,
  doTipo,
  fichaDoAtivo,
  lerAtivo,
} from '../ativos/leitura.ts';
import {
  desfazerLigacao,
  ligadosDoAtivo,
  ligarAtivos,
  quantosLigados,
} from '../ativos/ligacoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { contendo } from '../busca.ts';
import { controlIdDosAtivos } from '../coleta/control-id.ts';
import { disponibilidadeDosAtivos } from '../coleta/disponibilidade.ts';
import { serieDosSuprimentos, suprimentosDosAtivos } from '../coleta/suprimentos.ts';
import { saidaDoAtivo } from '../eventos/ativos.ts';
import { decodificarCursor, pagina } from '../paginacao.ts';
import { dadosInvalidos, RespostaDeProblema } from '../problemas.ts';
import { apagarRascunhosDaConta } from './rascunho-do-ativo.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

/**
 * As condições da lista: o alcance de `ativos.ver`, os filtros do P1b e a busca no ativo e no
 * modelo. Sem a situação, os ativos, a menos que os filtros das colunas tragam a deles.
 */
function condicoesDaLista(
  filtros: z.infer<typeof FiltrosDeAtivos>,
  sessao: SessaoDaRequisicao,
  arvore: ArvoreDeLocais,
  comSituacaoNosFiltros: boolean,
): SQL[] {
  const condicoes: SQL[] = [];
  const alcanceDoVer = alcance(sessao.acesso, 'ativos.ver', arvore);
  if (alcanceDoVer !== 'organizacao') {
    // O ativo sem local só entra pela organização inteira.
    condicoes.push(
      alcanceDoVer && alcanceDoVer.size > 0
        ? inArray(ativos.localId, [...alcanceDoVer])
        : sql`false`,
    );
  }
  const situacao = filtros.situacao ?? (comSituacaoNosFiltros ? 'todos' : 'ativos');
  if (situacao === 'ativos') condicoes.push(eq(ativos.situacao, 'ativo'));
  if (situacao === 'inativos') condicoes.push(eq(ativos.situacao, 'inativo'));
  if (filtros.uso) condicoes.push(eq(ativos.uso, filtros.uso));
  if (filtros.tipo) condicoes.push(eq(ativos.tipoId, filtros.tipo));
  if (filtros.local) condicoes.push(inArray(ativos.localId, [...arvore.ramo(filtros.local)]));
  for (const palavra of normalizarTexto(filtros.busca ?? '')
    .split(' ')
    .filter(Boolean)) {
    const padrao = contendo(palavra);
    const noAtivoOuNoModelo = or(like(ativos.busca, padrao), like(modelos.busca, padrao));
    if (noAtivoOuNoModelo) condicoes.push(noAtivoOuNoModelo);
  }
  return condicoes;
}

/** Quantas etiquetas cabem num pedido. */
const LIMITE_DAS_ETIQUETAS = 200;

const PROBLEMAS_DO_ATIVO = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

export const rotasDosAtivos: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/ativos',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'Os ativos que a conta pode ver, os cadastrados por último primeiro',
        querystring: FiltrosDeAtivos,
        response: { 200: ListaDeAtivos, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const filtros = requisicao.query;
      const pedidos = lerFiltrosPedidos(filtros.filtros);
      const colunasPedidas = lerColunasPedidas(filtros.colunas);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const contexto = await lerContextoDaTabela(tx, sessao, arvore, filtros.fuso ?? 'UTC');
        // Sem uma coluna que ordena, a ordem do cadastro, com o cursor no id, como no P1b.
        const ordem = ordemPedida(filtros.ordem, filtros.direcao, contexto);
        const depoisDe = !filtros.cursor
          ? undefined
          : ordem
            ? depoisDoCursor(ordem, decodificarCursor(filtros.cursor, ChaveDaOrdemDoAtivo))
            : lt(ativos.id, decodificarCursor(filtros.cursor, ChaveDoAtivo)[0]);
        const condicoes = [
          ...condicoesDaLista(
            filtros,
            sessao,
            arvore,
            pedidos.some((filtro) => filtro.operador === 'situacao'),
          ),
          ...condicoesDosFiltros(pedidos, contexto),
        ];
        const linhas = await tx
          .select({
            ...COLUNAS_DO_ATIVO,
            ordem: ordem ? valorDaOrdem(ordem) : sql<string | null>`null`,
          })
          .from(ativos)
          .innerJoin(tiposDeAtivo, doTipo)
          .leftJoin(modelos, doModelo)
          .leftJoin(pessoas, doResponsavel)
          .where(and(...condicoes, depoisDe))
          .orderBy(...(ordem ? ordenacaoDaConsulta(ordem) : [desc(ativos.id)]))
          .limit(filtros.limite + 1);
        const [contagem] = await tx
          .select({ total: count() })
          .from(ativos)
          .innerJoin(tiposDeAtivo, doTipo)
          .leftJoin(modelos, doModelo)
          .where(and(...condicoes));
        const { linhas: daPagina, proximo } = pagina(linhas, filtros.limite, (linha) =>
          ordem ? [linha.ordem, linha.ativo.id] : [linha.ativo.id],
        );
        const comColunas = {
          pedidas: colunasPedidas.filter((chave) => contexto.colunas.has(chave)),
          restritos: chavesRestritas(contexto),
        };
        const disponibilidade = await disponibilidadeDosAtivos(
          tx,
          daPagina.map(({ ativo }) => ativo),
          {
            restritos: comColunas.restritos,
            veRestritos: (localId) => podeEm(sessao.acesso, 'ativos.restritos', localId, arvore),
          },
        );
        const suprimentos = await suprimentosDosAtivos(
          tx,
          daPagina.map(({ ativo }) => ativo),
          {
            restritos: comColunas.restritos,
            veRestritos: (localId) => podeEm(sessao.acesso, 'ativos.restritos', localId, arvore),
          },
        );
        const controlId = await controlIdDosAtivos(
          tx,
          daPagina.map(({ ativo }) => ativo),
          {
            restritos: comColunas.restritos,
            veRestritos: (localId) => podeEm(sessao.acesso, 'ativos.restritos', localId, arvore),
          },
        );
        const itens = daPagina.map((linha) => {
          const painel = suprimentos.get(linha.ativo.id);
          return {
            ...ativoNaLista(linha, sessao, arvore, comColunas),
            disponibilidade: disponibilidade.get(linha.ativo.id) ?? null,
            suprimentos: painel ? { menor: painel.menor, total: painel.total } : null,
            controlId: controlId.get(linha.ativo.id) ?? null,
          };
        });
        return {
          itens,
          proximo,
          total: contagem?.total ?? 0,
          referencias: await referenciasDaLista(tx, itens, pedidos, contexto, sessao),
          permite: { cadastrar: pode(sessao.acesso, 'ativos.editar') },
        };
      });
    },
  );

  // As contagens do "é qualquer de" (change filtros-e-barra-da-tabela, design, decisão 2): a mesma
  // consulta da lista, sem o filtro da própria coluna, agrupada pelo valor dela.
  app.get(
    '/ativos/contagens',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary:
          'Quantos ativos cada opção de uma coluna de escolha traz, com a busca e os filtros',
        querystring: FiltrosDasContagens,
        response: { 200: ContagensDaColuna, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const pedido = requisicao.query;
      const pedidos = lerFiltrosPedidos(pedido.filtros);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const contexto = await lerContextoDaTabela(tx, sessao, arvore, pedido.fuso ?? 'UTC');
        const coluna = contexto.colunas.get(pedido.coluna);
        const valor = coluna ? valorDaContagem(coluna, contexto) : null;
        if (!valor) throw dadosInvalidos({ coluna: 'Esta coluna não tem contagem.' });
        const outros = pedidos.filter((filtro) => filtro.chave !== pedido.coluna);
        const condicoes = and(
          ...condicoesDaLista(
            { busca: pedido.busca, limite: 1 },
            sessao,
            arvore,
            outros.some((filtro) => filtro.operador === 'situacao'),
          ),
          ...condicoesDosFiltros(outros, contexto),
        );
        const [contagem] = await tx
          .select({ total: count() })
          .from(ativos)
          .innerJoin(tiposDeAtivo, doTipo)
          .leftJoin(modelos, doModelo)
          .where(condicoes);
        const opcao = sql<string>`opcao`;
        const linhas =
          valor.tipo === 'um'
            ? await tx
                .select({ valor: sql<string>`${valor.expressao}`.as('opcao'), quantos: count() })
                .from(ativos)
                .innerJoin(tiposDeAtivo, doTipo)
                .leftJoin(modelos, doModelo)
                .where(and(condicoes, sql`${valor.expressao} is not null`))
                .groupBy(opcao)
            : await tx
                .select({ valor: sql<string>`marcada.opcao`.as('opcao'), quantos: count() })
                .from(ativos)
                .innerJoin(tiposDeAtivo, doTipo)
                .leftJoin(modelos, doModelo)
                .innerJoin(
                  sql`lateral jsonb_array_elements_text(coalesce(${valor.expressao}, '[]'::jsonb)) as marcada(opcao)`,
                  sql`true`,
                )
                .where(condicoes)
                .groupBy(opcao);
        return {
          coluna: pedido.coluna,
          total: contagem?.total ?? 0,
          opcoes: linhas
            .map((linha) => ({ valor: linha.valor, quantos: Number(linha.quantos) }))
            .sort(
              (a, b) =>
                b.quantos - a.quantos || (a.valor < b.valor ? -1 : a.valor > b.valor ? 1 : 0),
            ),
        };
      });
    },
  );

  // As etiquetas (spec etiquetas-de-ativos; design do P1f, decisão 4): só leitura, sem auditoria.
  app.get(
    '/ativos/etiquetas',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'Os ativos das etiquetas, na ordem pedida, só os que a conta vê, até 200',
        querystring: PedidoDasEtiquetas,
        response: { 200: EtiquetasDosAtivos, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const pedidos = [
        ...new Set(
          requisicao.query.ids
            .split(',')
            .map((id) => id.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      if (pedidos.length > LIMITE_DAS_ETIQUETAS) {
        throw dadosInvalidos({ ids: 'Escolha até 200 ativos por vez.' });
      }
      // O id que não é um uuid não existe: fica de fora, sem ir ao banco.
      const validos = pedidos.filter((id) => z.uuid().safeParse(id).success);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linhas =
          validos.length > 0 ? await consultarAtivos(tx).where(inArray(ativos.id, validos)) : [];
        const porId = new Map(linhas.map((linha) => [linha.ativo.id, linha]));
        const itens = pedidos.flatMap((id) => {
          const linha = porId.get(id);
          if (!linha || !podeEm(sessao.acesso, 'ativos.ver', linha.ativo.localId, arvore)) {
            return [];
          }
          return [
            {
              id,
              rotulo: rotuloDoAtivo({
                nome: linha.ativo.nome,
                modelo: linha.modelo,
                tipo: linha.tipo,
              }),
              patrimonio: linha.ativo.patrimonio,
            },
          ];
        });
        return { itens, fora: pedidos.length - itens.length };
      });
    },
  );

  app.get(
    '/ativos/:id',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'Um ativo, com os valores, o estado de cada campo e o que a conta pode fazer',
        params: ParametrosDoAtivo,
        response: { 200: FichaDoAtivo, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linha = await lerAtivo(tx, requisicao.params.id);
        exigirEm(requisicao, 'ativos.ver', linha.ativo.localId, arvore);
        return fichaDoAtivo(tx, linha, sessao, arvore);
      });
    },
  );

  app.post(
    '/ativos',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Cadastrar um ativo',
        body: PedidoDeAtivo,
        response: { 201: FichaDoAtivo, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const { tipoId, ...pedido } = requisicao.body;
      const ficha = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const { id } = await gravarAtivo(tx, {
          quem: quemGravaPela(requisicao),
          arvore,
          momento: agora(),
          atual: null,
          tipoId,
          pedido,
          lerLinha: (ativoId) => lerAtivo(tx, ativoId),
        });
        // O cadastro feito apaga o rascunho da conta na mesma transação: o recusado o mantém
        // (change cadastro-em-etapas, decisão 7).
        await apagarRascunhosDaConta(tx, sessao.contaId, 'ativo');
        return fichaDoAtivo(tx, await lerAtivo(tx, id), sessao, arvore);
      });
      return resposta.code(201).send(ficha);
    },
  );

  app.patch(
    '/ativos/:id',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Editar e travar os campos de um ativo; só as chaves pedidas mudam',
        params: ParametrosDoAtivo,
        body: PedidoDeAlteracaoDoAtivo,
        response: { 200: FichaDoAtivo, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const atual = await lerAtivo(tx, requisicao.params.id, { travar: true });
        exigirEm(requisicao, 'ativos.editar', atual.ativo.localId, arvore);
        await gravarAtivo(tx, {
          quem: quemGravaPela(requisicao),
          arvore,
          momento: agora(),
          atual,
          tipoId: atual.ativo.tipoId,
          pedido: requisicao.body,
          lerLinha: (ativoId) => lerAtivo(tx, ativoId),
        });
        return fichaDoAtivo(tx, await lerAtivo(tx, atual.ativo.id), sessao, arvore);
      });
    },
  );

  app.get(
    '/ativos/:id/resumo',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'O resumo de um ativo, para o cartão da referência',
        params: ParametrosDoAtivo,
        response: { 200: ResumoDoAtivo, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linha = await lerAtivo(tx, requisicao.params.id);
        exigirEm(requisicao, 'ativos.ver', linha.ativo.localId, arvore);
        const { id, rotulo, tipo, modelo, imagem, patrimonio, local, responsavel, uso, situacao } =
          ativoNaLista(linha, sessao, arvore);
        return {
          id,
          rotulo,
          tipo,
          modelo,
          imagem,
          patrimonio,
          local,
          responsavel,
          uso,
          situacao,
          ligados: await quantosLigados(tx, { sessao, arvore }, id),
        };
      });
    },
  );

  app.get(
    '/ativos/:id/suprimentos/serie',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary:
          'A série dos suprimentos: o último nível válido de cada dia de São Paulo, nos últimos 30 dias',
        params: ParametrosDoAtivo,
        response: { 200: SerieDosSuprimentos, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linha = await lerAtivo(tx, requisicao.params.id);
        exigirEm(requisicao, 'ativos.ver', linha.ativo.localId, arvore);
        return serieDosSuprimentos(tx, linha.ativo, agora());
      }),
  );

  app.get(
    '/ativos/:id/historico',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary:
          'O histórico do ativo, do mais novo para o mais antigo, sem os restritos que a conta não vê',
        params: ParametrosDoAtivo,
        querystring: FiltrosDoHistorico,
        response: { 200: HistoricoDoAtivo, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linha = await lerAtivo(tx, requisicao.params.id);
        exigirEm(requisicao, 'ativos.ver', linha.ativo.localId, arvore);
        return historicoDoAtivo(tx, { sessao, arvore }, linha, requisicao.query);
      });
    },
  );

  app.get(
    '/ativos/:id/ligados',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'O que está ligado ao ativo: pelos campos do tipo ativo e pelas ligações livres',
        params: ParametrosDoAtivo,
        response: { 200: LigadosDoAtivo, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linha = await lerAtivo(tx, requisicao.params.id);
        exigirEm(requisicao, 'ativos.ver', linha.ativo.localId, arvore);
        return ligadosDoAtivo(tx, { sessao, arvore }, linha);
      });
    },
  );

  app.post(
    '/ativos/:id/ligacoes',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Ligar o ativo a outro pela ligação livre, o "Ligado a"',
        params: ParametrosDoAtivo,
        body: PedidoDeLigacao,
        response: { 201: LigacaoLivre, ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const ligacao = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        ligarAtivos(
          tx,
          { requisicao, sessao, arvore: await lerArvore(tx), momento: agora() },
          {
            esteId: requisicao.params.id.toLowerCase(),
            outroId: requisicao.body.outroId.toLowerCase(),
          },
        ),
      );
      return resposta.code(201).send(ligacao);
    },
  );

  app.delete(
    '/ativos/:id/ligacoes/:ligacaoId',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Desfazer uma ligação livre do ativo, que sai das fichas dos dois',
        params: ParametrosDaLigacao,
        response: { 204: z.null(), ...PROBLEMAS_DO_ATIVO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        desfazerLigacao(
          tx,
          { requisicao, sessao, arvore: await lerArvore(tx), momento: agora() },
          {
            esteId: requisicao.params.id.toLowerCase(),
            ligacaoId: requisicao.params.ligacaoId.toLowerCase(),
          },
        ),
      );
      return resposta.code(204).send(null);
    },
  );

  for (const [caminho, situacao] of [
    ['inativacao', 'inativo'],
    ['reativacao', 'ativo'],
  ] as const) {
    app.post(
      `/ativos/:id/${caminho}`,
      {
        config: { permissao: 'ativos.editar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um ativo' : 'Reativar um ativo',
          params: ParametrosDoAtivo,
          response: { 200: FichaDoAtivo, ...PROBLEMAS_DO_ATIVO },
        },
      },
      async (requisicao) => {
        const sessao = sessaoDa(requisicao);
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const arvore = await lerArvore(tx);
          const atual = await lerAtivo(tx, requisicao.params.id, { travar: true });
          exigirEm(requisicao, 'ativos.editar', atual.ativo.localId, arvore);
          await mudarSituacaoDoAtivo(tx, {
            quem: quemGravaPela(requisicao),
            arvore,
            momento: agora(),
            atual,
            situacao,
            lerLinha: (ativoId) => lerAtivo(tx, ativoId),
          });
          return fichaDoAtivo(tx, await lerAtivo(tx, atual.ativo.id), sessao, arvore);
        });
      },
    );
  }
};

interface DonoDaImagemDoAtivo {
  ativoId: string;
  localId: string | null;
  imagemId: string | null;
}

/**
 * A imagem própria do ativo (spec cadastro-de-ativos, "Imagem do ativo"; design do P1d, decisão 4),
 * pelo caminho comum das imagens: a troca e a remoção com `ativos.editar` no local do ativo, e a
 * entrega com `ativos.ver` nele. Num plugin só dela, porque o corpo é a imagem, e não JSON.
 */
export const rotasDaImagemDoAtivo: FastifyPluginAsyncZod<DependenciasDasImagens> = async (
  app,
  deps,
) => {
  aceitarImagens(app);

  const imagemDoAtivo = (
    requisicao: FastifyRequest,
    id: string,
  ): ImagemDoRegistro<DonoDaImagemDoAtivo> => ({
    async conferir(tx, travar) {
      const { ativo } = await lerAtivo(tx, id, { travar });
      exigirEm(requisicao, 'ativos.editar', ativo.localId, await lerArvore(tx));
      return { ativoId: ativo.id, localId: ativo.localId, imagemId: ativo.imagemId };
    },
    async apontar(tx, dono, imagemId, momento) {
      await tx
        .update(ativos)
        .set({ imagemId, atualizadoEm: momento })
        .where(eq(ativos.id, dono.ativoId));
    },
    async auditar(tx, dono, { arquivoId, anteriorId }, momento) {
      const comum = {
        ator: { tipo: 'conta' as const, contaId: sessaoDa(requisicao).contaId },
        alvo: { tipo: 'ativo', id: dono.ativoId },
        origem: origemDa(requisicao),
        momento,
        saida: saidaDoAtivo({ ativoId: dono.ativoId, locais: [dono.localId] }),
      };
      await registrarNaAuditoria(
        tx,
        arquivoId
          ? {
              ...comum,
              acao: 'imagem-do-ativo.trocada',
              dados: { arquivoId, arquivoAnteriorId: anteriorId },
            }
          : { ...comum, acao: 'imagem-do-ativo.removida', dados: { arquivoId: anteriorId } },
      );
    },
  });

  const responder = (requisicao: FastifyRequest, id: string) => async (tx: Transacao) =>
    fichaDoAtivo(tx, await lerAtivo(tx, id), sessaoDa(requisicao), await lerArvore(tx));

  const PROBLEMAS_DA_IMAGEM = {
    401: RespostaDeProblema,
    409: RespostaDeProblema,
    413: RespostaDeProblema,
    415: RespostaDeProblema,
    ...PROBLEMAS_DO_ACESSO,
  };

  app.put(
    '/ativos/:id/imagem',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Trocar a imagem própria de um ativo',
        params: ParametrosDoAtivo,
        consumes: TIPOS_DO_ENVIO,
        body: BytesDaImagem,
        response: { 200: FichaDoAtivo, ...PROBLEMAS_DA_IMAGEM },
      },
    },
    async (requisicao) =>
      trocarImagem(
        deps,
        quemMuda(requisicao, sessaoDa(requisicao).contaId),
        imagemDoAtivo(requisicao, requisicao.params.id),
        { conteudo: requisicao.body, responder: responder(requisicao, requisicao.params.id) },
      ),
  );

  app.delete(
    '/ativos/:id/imagem',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Remover a imagem própria de um ativo',
        params: ParametrosDoAtivo,
        response: { 200: FichaDoAtivo, ...PROBLEMAS_DA_IMAGEM },
      },
    },
    async (requisicao) =>
      tirarImagem(
        deps,
        quemMuda(requisicao, sessaoDa(requisicao).contaId),
        imagemDoAtivo(requisicao, requisicao.params.id),
        { responder: responder(requisicao, requisicao.params.id) },
      ),
  );

  app.get(
    '/ativos/:id/imagem/:arquivo/:tamanho',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'Um tamanho da imagem própria de um ativo',
        params: ParametrosDaImagemDoAtivo,
        response: {
          200: IMAGEM_ENTREGUE,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const { id, arquivo, tamanho } = requisicao.params;
      return entregarImagem(deps, requisicao, resposta, {
        arquivo,
        tamanho,
        // O ativo que não existe responde como a imagem que falta; o de fora do acesso, com 403.
        imagemAtual: async (tx) => {
          const [linha] = await tx
            .select({ localId: ativos.localId, imagemId: ativos.imagemId })
            .from(ativos)
            .where(eq(ativos.id, id));
          if (!linha) throw imagemNaoEncontrada();
          exigirEm(requisicao, 'ativos.ver', linha.localId, await lerArvore(tx));
          return linha.imagemId;
        },
      });
    },
  );
};

/**
 * Os arquivos e as imagens dos campos do ativo (spec cadastro-de-ativos, "Arquivos e imagens nos
 * campos do ativo"; design do P1d, decisão 5): o envio, a troca e a remoção com `ativos.editar` no
 * local do ativo, e a entrega com `ativos.ver` nele; num campo restrito, também `ativos.restritos`.
 * Num plugin só deles, porque o corpo é o arquivo, até 25 MiB, e não JSON.
 */
export const rotasDosArquivosDosCampos: FastifyPluginAsyncZod<DependenciasDasImagens> = async (
  app,
  deps,
) => {
  aceitarArquivos(app);

  const PROBLEMAS_DO_ARQUIVO = {
    401: RespostaDeProblema,
    409: RespostaDeProblema,
    413: RespostaDeProblema,
    415: RespostaDeProblema,
    ...PROBLEMAS_DO_ACESSO,
  };

  app.put(
    '/ativos/:id/campos/:campoId/arquivo',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Enviar ou trocar o arquivo de um campo de arquivo ou de imagem do ativo',
        params: ParametrosDoArquivoDoCampo,
        querystring: NomeDoArquivoEnviado,
        consumes: ['application/octet-stream'],
        body: BytesDoArquivo,
        response: { 200: FichaDoAtivo, ...PROBLEMAS_DO_ARQUIVO },
      },
    },
    async (requisicao) =>
      trocarArquivoDoCampo(deps, requisicao, {
        ativoId: requisicao.params.id,
        campoId: requisicao.params.campoId,
        conteudo: requisicao.body,
        nome: requisicao.query.nome ?? '',
      }),
  );

  app.delete(
    '/ativos/:id/campos/:campoId/arquivo',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Remover o arquivo de um campo de arquivo ou de imagem do ativo',
        params: ParametrosDoArquivoDoCampo,
        response: { 200: FichaDoAtivo, ...PROBLEMAS_DO_ARQUIVO },
      },
    },
    async (requisicao) =>
      tirarArquivoDoCampo(deps, requisicao, {
        ativoId: requisicao.params.id,
        campoId: requisicao.params.campoId,
      }),
  );

  app.get(
    '/ativos/:id/campos/:campoId/arquivo/:arquivo/:variante',
    {
      config: { permissao: 'ativos.ver' },
      schema: {
        summary: 'O arquivo de um campo, para baixar, ou um tamanho da imagem de um campo',
        params: ParametrosDaEntregaDoArquivo,
        response: {
          200: {
            description:
              'O documento, como anexo, no tipo conferido; a imagem como as outras imagens',
            content: {
              'application/octet-stream': { schema: BytesDoArquivo },
              'image/webp': { schema: BytesDoArquivo },
            },
          },
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) =>
      entregarArquivoDoCampo(deps, requisicao, resposta, {
        ativoId: requisicao.params.id,
        campoId: requisicao.params.campoId,
        arquivo: requisicao.params.arquivo,
        variante: requisicao.params.variante,
      }),
  );
};
