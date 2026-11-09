// Os consumíveis da organização pela API (spec consumiveis e modulo-operacao, "Lista dos
// consumíveis"; change p4b-consumiveis, design, decisão 4): quem vê os consumíveis lê a lista, com a
// busca pelo código e pelo nome, os filtros do tipo, da cor e da situação e o cursor, e a ficha, com
// os fornecedores e os modelos; quem os edita cadastra, edita, inativa e reativa. Cada mudança vai
// para a auditoria, com o evento para toda a organização, porque os compatíveis aparecem nas fichas
// dos modelos e dos ativos. Quem edita os consumíveis lê os modelos para escolher, e toda sessão lê
// os compatíveis de um modelo, como referência dele (decisão 5), e os consumíveis ativos para
// escolher num campo, como o do estoque; quem vê os consumíveis lê os que um fornecedor vende
// (change p4c-estoque, decisão 6).
import {
  type Banco,
  CORES_DE_CONSUMIVEL_NO_BANCO,
  consumiveis,
  consumiveisDosModelos,
  fornecedoresDosConsumiveis,
  modelos,
  naOrganizacao,
  TIPOS_DE_CONSUMIVEL_NO_BANCO,
  tiposDeAtivo,
} from '@grafite/db';
import { podeEm } from '@grafite/domain';
import { and, arrayContains, asc, count, eq, gt, inArray, or, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import {
  CAPACIDADE_DOS_CONSUMIVEIS,
  ConsumivelCompativel,
  compativeisDoModelo,
  tipoComCompativeis,
} from '../consumiveis/compativeis.ts';
import {
  conferirLigacoes,
  dadosConferidos,
  gravarLigacoes,
  type LigacoesDoConsumivel,
  type LinhaDoConsumivel,
  lerConsumivel,
  ligacoesDo,
  mesmasLigacoes,
  pelaBuscaDoConsumivel,
  semConsumivelRepetido,
  visaoDoConsumivel,
} from '../consumiveis/consumiveis.ts';
import { lerFornecedor } from '../fornecedores/fornecedores.ts';
import { Cursor, codificarCursor, decodificarCursor, Limite } from '../paginacao.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const SITUACOES_DO_CONSUMIVEL = ['ativo', 'inativo'] as const;

const TipoDoConsumivel = z.enum(TIPOS_DE_CONSUMIVEL_NO_BANCO, {
  error: 'Escolha o tipo do consumível.',
});
const CorDoConsumivel = z.enum(CORES_DE_CONSUMIVEL_NO_BANCO, {
  error: 'Escolha uma cor da lista.',
});

const Consumivel = z
  .object({
    id: z.uuid(),
    /** O código do fabricante, como foi escrito, como "CF258A". */
    codigo: z.string(),
    nome: z.string().nullable(),
    tipo: TipoDoConsumivel,
    cor: CorDoConsumivel.nullable(),
    /** As páginas que ele rende. */
    rendimento: z.number().int().nullable(),
    situacao: z.enum(SITUACOES_DO_CONSUMIVEL),
    criadoEm: z.string(),
    atualizadoEm: z.string(),
  })
  .meta({ id: 'Consumivel' });

const ConsumivelNaLista = Consumivel.extend({
  /** Quantos modelos compatíveis ele tem. */
  modelos: z.number().int(),
}).meta({ id: 'ConsumivelNaLista' });

const FornecedorDoConsumivel = z
  .object({ id: z.uuid(), nome: z.string(), situacao: z.enum(SITUACOES_DO_CONSUMIVEL) })
  .meta({ id: 'FornecedorDoConsumivel' });

const ModeloDoConsumivel = z
  .object({
    id: z.uuid(),
    fabricante: z.string(),
    nome: z.string(),
    situacao: z.enum(SITUACOES_DO_CONSUMIVEL),
    tipo: z.object({ id: z.uuid(), nome: z.string() }),
  })
  .meta({ id: 'ModeloDoConsumivel' });

const FichaDoConsumivel = Consumivel.extend({
  /** Pelo nome. */
  fornecedores: z.array(FornecedorDoConsumivel),
  /** Pelo fabricante e pelo nome. */
  modelos: z.array(ModeloDoConsumivel),
  permite: z.object({ editar: z.boolean() }),
}).meta({ id: 'FichaDoConsumivel' });

const ListaDeConsumiveis = z
  .object({
    itens: z.array(ConsumivelNaLista),
    /** Quantos consumíveis a busca e os filtros trazem, em todas as páginas. */
    total: z.number().int(),
    proximo: z.string().nullable(),
    permite: z.object({ cadastrar: z.boolean() }),
  })
  .meta({ id: 'ListaDeConsumiveis' });

const FiltrosDaLista = z.object({
  /** O código, sem diferenciar maiúsculas, espaços e hífens, ou o nome, sem acento. */
  busca: z.string().max(120).optional(),
  tipo: TipoDoConsumivel.optional(),
  cor: CorDoConsumivel.optional(),
  situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
  limite: Limite.default(50),
  cursor: Cursor.optional(),
});

/** Os textos e as listas como chegam: a conferência e a mensagem de cada campo são do domínio. */
const textoOpcional = z.string().max(5000).nullable().optional();
const Identificadores = (mensagem: string) =>
  z
    .array(z.uuid({ error: mensagem }))
    .max(1000)
    .optional();

const PedidoDeConsumivel = z
  .object({
    codigo: z.string({ error: 'Informe o código do consumível.' }).max(5000),
    nome: textoOpcional,
    tipo: TipoDoConsumivel,
    cor: CorDoConsumivel.nullable().optional(),
    rendimento: z
      .number({ error: 'Use um número inteiro de páginas, de 1 a 1.000.000.' })
      .nullable()
      .optional(),
    fornecedores: Identificadores('Fornecedor não encontrado.'),
    modelos: Identificadores('Modelo não encontrado.'),
  })
  .meta({ id: 'PedidoDeConsumivel' });

const PedidoDeAlteracaoDoConsumivel = PedidoDeConsumivel.partial().meta({
  id: 'PedidoDeAlteracaoDoConsumivel',
});

const ParametrosDoConsumivel = z.object({ id: z.uuid({ error: 'Consumível não encontrado.' }) });

const ParametrosDoModelo = z.object({ id: z.uuid({ error: 'Modelo não encontrado.' }) });

const ModelosParaEscolher = z
  .object({
    /** Os modelos ativos dos tipos que ligam a capacidade, pelo fabricante e pelo nome. */
    modelos: z.array(
      z.object({
        id: z.uuid(),
        fabricante: z.string(),
        nome: z.string(),
        tipo: z.object({ id: z.uuid(), nome: z.string() }),
      }),
    ),
  })
  .meta({ id: 'ModelosParaOsConsumiveis' });

const ConsumiveisDoModelo = z
  .object({
    /** Os ativos que têm o modelo, pelo tipo e pelo código; nulo sem a capacidade no tipo dele. */
    consumiveis: z.array(ConsumivelCompativel).nullable(),
  })
  .meta({ id: 'ConsumiveisDoModelo' });

/** Um consumível para escolher num campo, como referência: sem a permissão dos consumíveis. */
const ConsumivelParaEscolher = z
  .object({
    id: z.uuid(),
    codigo: z.string(),
    nome: z.string().nullable(),
    tipo: TipoDoConsumivel,
    cor: CorDoConsumivel.nullable(),
  })
  .meta({ id: 'ConsumivelParaEscolher' });

const ConsumiveisParaEscolher = z
  .object({
    /** Os ativos, pelo código. */
    consumiveis: z.array(ConsumivelParaEscolher),
  })
  .meta({ id: 'ConsumiveisParaEscolher' });

const FiltrosDaEscolha = z.object({
  /** O código, sem diferenciar maiúsculas, espaços e hífens, ou o nome, sem acento. */
  busca: z.string().max(120).optional(),
  /** Só este consumível, mesmo inativo, como o do lançamento aberto pelo endereço. */
  id: z.uuid({ error: 'Consumível não encontrado.' }).optional(),
  limite: Limite.default(50),
});

const ConsumiveisDoFornecedor = z
  .object({
    /** Os ativos que ele vende, pelo código. */
    consumiveis: z.array(ConsumivelParaEscolher),
  })
  .meta({ id: 'ConsumiveisDoFornecedor' });

const ParametrosDoFornecedor = z.object({ id: z.uuid({ error: 'Fornecedor não encontrado.' }) });

const COLUNAS_PARA_ESCOLHER = {
  id: consumiveis.id,
  codigo: consumiveis.codigo,
  nome: consumiveis.nome,
  tipo: consumiveis.tipo,
  cor: consumiveis.cor,
};

const PROBLEMAS_DO_CONSUMIVEL = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

const comoResposta = (consumivel: LinhaDoConsumivel): z.infer<typeof Consumivel> => ({
  id: consumivel.id,
  codigo: consumivel.codigo,
  nome: consumivel.nome,
  tipo: consumivel.tipo,
  cor: consumivel.cor,
  rendimento: consumivel.rendimento,
  situacao: consumivel.situacao,
  criadoEm: consumivel.criadoEm.toISOString(),
  atualizadoEm: consumivel.atualizadoEm.toISOString(),
});

const comoFicha = (
  consumivel: LinhaDoConsumivel,
  ligacoes: LigacoesDoConsumivel,
  editar: boolean,
): z.infer<typeof FichaDoConsumivel> => ({
  ...comoResposta(consumivel),
  ...ligacoes,
  permite: { editar },
});

const ValorDoCursor = z.tuple([z.string(), z.uuid()]);

const SEM_LIGACOES: LigacoesDoConsumivel = { fornecedores: [], modelos: [] };

export const rotasDosConsumiveis: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/consumiveis',
    {
      config: { permissao: 'consumiveis.ver' },
      schema: {
        summary:
          'Os consumíveis da organização, pelo código, com a busca, o tipo, a cor, a situação e o cursor',
        querystring: FiltrosDaLista,
        response: { 200: ListaDeConsumiveis, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const { busca, tipo, cor, situacao, limite, cursor } = requisicao.query;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const condicoes: SQL[] = [];
        if (situacao !== 'todos') {
          condicoes.push(eq(consumiveis.situacao, situacao === 'ativos' ? 'ativo' : 'inativo'));
        }
        if (tipo) condicoes.push(eq(consumiveis.tipo, tipo));
        if (cor) condicoes.push(eq(consumiveis.cor, cor));
        const doTexto = pelaBuscaDoConsumivel(busca);
        if (doTexto) condicoes.push(doTexto);
        const [contagem] = await tx
          .select({ total: count() })
          .from(consumiveis)
          .where(and(...condicoes));
        const comCursor = [...condicoes];
        if (cursor) {
          const [codigo, id] = decodificarCursor(cursor, ValorDoCursor);
          comCursor.push(
            or(
              gt(consumiveis.codigoNormalizado, codigo),
              and(eq(consumiveis.codigoNormalizado, codigo), gt(consumiveis.id, id)),
            ) as SQL,
          );
        }
        const linhas = await tx
          .select()
          .from(consumiveis)
          .where(and(...comCursor))
          .orderBy(asc(consumiveis.codigoNormalizado), asc(consumiveis.id))
          .limit(limite + 1);
        const daPagina = linhas.slice(0, limite);
        const ultima = daPagina.at(-1);
        // Os modelos de cada consumível da página, numa consulta só.
        const modelosDaPagina =
          daPagina.length === 0
            ? []
            : await tx
                .select({ consumivelId: consumiveisDosModelos.consumivelId, total: count() })
                .from(consumiveisDosModelos)
                .where(
                  inArray(
                    consumiveisDosModelos.consumivelId,
                    daPagina.map(({ id }) => id),
                  ),
                )
                .groupBy(consumiveisDosModelos.consumivelId);
        const modelosDe = new Map(
          modelosDaPagina.map((linha) => [linha.consumivelId, linha.total]),
        );
        return {
          itens: daPagina.map((consumivel) => ({
            ...comoResposta(consumivel),
            modelos: modelosDe.get(consumivel.id) ?? 0,
          })),
          total: contagem?.total ?? 0,
          proximo:
            linhas.length > limite && ultima
              ? codificarCursor([ultima.codigoNormalizado, ultima.id])
              : null,
          permite: {
            cadastrar: podeEm(acesso, 'consumiveis.editar', null, await lerArvore(tx)),
          },
        };
      });
    },
  );

  app.get(
    '/consumiveis/escolha',
    {
      // Como os fornecedores: o código e o nome dos consumíveis são referência, para quem movimenta
      // o estoque escolher o consumível sem ver os consumíveis (change p4c-estoque, decisão 6).
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os consumíveis ativos, pelo código, com a busca, para escolher um',
        querystring: FiltrosDaEscolha,
        response: {
          200: ConsumiveisParaEscolher,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      const { busca, id, limite } = requisicao.query;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => ({
        consumiveis: await tx
          .select(COLUNAS_PARA_ESCOLHER)
          .from(consumiveis)
          .where(
            id
              ? eq(consumiveis.id, id)
              : and(eq(consumiveis.situacao, 'ativo'), pelaBuscaDoConsumivel(busca)),
          )
          .orderBy(asc(consumiveis.codigoNormalizado), asc(consumiveis.id))
          .limit(limite),
      }));
    },
  );

  app.get(
    '/fornecedores/:id/consumiveis',
    {
      config: { permissao: 'consumiveis.ver' },
      schema: {
        summary: 'Os consumíveis ativos que o fornecedor vende, pelo código',
        params: ParametrosDoFornecedor,
        response: {
          200: ConsumiveisDoFornecedor,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const fornecedor = await lerFornecedor(tx, requisicao.params.id);
        return {
          consumiveis: await tx
            .select(COLUNAS_PARA_ESCOLHER)
            .from(fornecedoresDosConsumiveis)
            .innerJoin(consumiveis, eq(consumiveis.id, fornecedoresDosConsumiveis.consumivelId))
            .where(
              and(
                eq(fornecedoresDosConsumiveis.fornecedorId, fornecedor.id),
                eq(consumiveis.situacao, 'ativo'),
              ),
            )
            .orderBy(asc(consumiveis.codigoNormalizado), asc(consumiveis.id)),
        };
      }),
  );

  app.get(
    '/consumiveis/modelos',
    {
      config: { permissao: 'consumiveis.editar' },
      schema: {
        summary:
          'Os modelos ativos dos tipos com os consumíveis compatíveis, para escolher nos consumíveis',
        response: { 200: ModelosParaEscolher, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linhas = await tx
          .select({
            id: modelos.id,
            fabricante: modelos.fabricante,
            nome: modelos.nome,
            tipoId: tiposDeAtivo.id,
            tipoNome: tiposDeAtivo.nome,
          })
          .from(modelos)
          .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, modelos.tipoId))
          .where(
            and(
              eq(modelos.situacao, 'ativo'),
              arrayContains(tiposDeAtivo.capacidades, [CAPACIDADE_DOS_CONSUMIVEIS]),
            ),
          )
          .orderBy(
            asc(modelos.fabricanteNormalizado),
            asc(modelos.nomeNormalizado),
            asc(modelos.id),
          );
        return {
          modelos: linhas.map(({ tipoId, tipoNome, ...modelo }) => ({
            ...modelo,
            tipo: { id: tipoId, nome: tipoNome },
          })),
        };
      }),
  );

  app.get(
    '/modelos/:id/consumiveis',
    {
      // Como os modelos: os compatíveis são referência do modelo, para quem vê a ficha dele ou a de
      // um ativo dele, sem ver os consumíveis.
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os consumíveis compatíveis de um modelo, pelo tipo e pelo código',
        params: ParametrosDoModelo,
        response: { 200: ConsumiveisDoModelo, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [modelo] = await tx
          .select({ tipoId: modelos.tipoId })
          .from(modelos)
          .where(eq(modelos.id, requisicao.params.id));
        if (!modelo) throw naoEncontrado('Modelo não encontrado.');
        if (!(await tipoComCompativeis(tx, modelo.tipoId))) return { consumiveis: null };
        return { consumiveis: await compativeisDoModelo(tx, requisicao.params.id) };
      }),
  );

  app.get(
    '/consumiveis/:id',
    {
      config: { permissao: 'consumiveis.ver' },
      schema: {
        summary:
          'A ficha de um consumível, com os fornecedores, os modelos e o que a conta pode fazer',
        params: ParametrosDoConsumivel,
        response: { 200: FichaDoConsumivel, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const consumivel = await lerConsumivel(tx, requisicao.params.id);
        return comoFicha(
          consumivel,
          await ligacoesDo(tx, consumivel.id),
          podeEm(acesso, 'consumiveis.editar', null, await lerArvore(tx)),
        );
      });
    },
  );

  app.post(
    '/consumiveis',
    {
      config: { permissao: 'consumiveis.editar' },
      schema: {
        summary: 'Cadastrar um consumível, com o código único na organização',
        body: PedidoDeConsumivel,
        response: { 201: FichaDoConsumivel, ...PROBLEMAS_DO_CONSUMIVEL },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const orgId = requisicao.organizacao?.id ?? '';
      const dados = dadosConferidos({
        codigo: pedido.codigo,
        nome: pedido.nome ?? null,
        tipo: pedido.tipo,
        cor: pedido.cor ?? null,
        rendimento: pedido.rendimento ?? null,
        fornecedores: pedido.fornecedores ?? [],
        modelos: pedido.modelos ?? [],
      });
      const momento = agora();
      const ficha = await naOrganizacao(banco, orgId, async (tx) => {
        await conferirLigacoes(tx, dados, SEM_LIGACOES);
        const [consumivel] = await semConsumivelRepetido(() =>
          tx
            .insert(consumiveis)
            .values({ orgId, ...dados.colunas, criadoEm: momento, atualizadoEm: momento })
            .returning(),
        );
        if (!consumivel) throw new Error('O consumível não foi cadastrado.');
        await gravarLigacoes(tx, { orgId, consumivelId: consumivel.id }, dados, SEM_LIGACOES);
        const ligacoes = await ligacoesDo(tx, consumivel.id);
        await registrarNaAuditoria(tx, {
          acao: 'consumivel.criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'consumivel', id: consumivel.id },
          depois: visaoDoConsumivel(consumivel, ligacoes),
          origem: origemDa(requisicao),
          momento,
        });
        return comoFicha(consumivel, ligacoes, true);
      });
      return resposta.code(201).send(ficha);
    },
  );

  app.patch(
    '/consumiveis/:id',
    {
      config: { permissao: 'consumiveis.editar' },
      schema: {
        summary:
          'Editar um consumível; as listas pedidas trocam as de antes, e a mesma informação não grava nada',
        params: ParametrosDoConsumivel,
        body: PedidoDeAlteracaoDoConsumivel,
        response: { 200: FichaDoConsumivel, ...PROBLEMAS_DO_CONSUMIVEL },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const orgId = requisicao.organizacao?.id ?? '';
      const momento = agora();
      return naOrganizacao(banco, orgId, async (tx) => {
        const antes = await lerConsumivel(tx, requisicao.params.id);
        const ligacoesDeAntes = await ligacoesDo(tx, antes.id);
        const dados = dadosConferidos({
          codigo: pedido.codigo ?? antes.codigo,
          nome: pedido.nome === undefined ? antes.nome : pedido.nome,
          tipo: pedido.tipo ?? antes.tipo,
          cor: pedido.cor === undefined ? antes.cor : pedido.cor,
          rendimento: pedido.rendimento === undefined ? antes.rendimento : pedido.rendimento,
          fornecedores: pedido.fornecedores ?? ligacoesDeAntes.fornecedores.map(({ id }) => id),
          modelos: pedido.modelos ?? ligacoesDeAntes.modelos.map(({ id }) => id),
        });
        const colunasIguais = (Object.keys(dados.colunas) as (keyof typeof dados.colunas)[]).every(
          (campo) => dados.colunas[campo] === antes[campo],
        );
        if (colunasIguais && mesmasLigacoes(dados, ligacoesDeAntes)) {
          return comoFicha(antes, ligacoesDeAntes, true);
        }
        await conferirLigacoes(tx, dados, ligacoesDeAntes);
        const [depois] = await semConsumivelRepetido(() =>
          tx
            .update(consumiveis)
            .set({ ...dados.colunas, atualizadoEm: momento })
            .where(eq(consumiveis.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('O consumível não foi alterado.');
        await gravarLigacoes(tx, { orgId, consumivelId: antes.id }, dados, ligacoesDeAntes);
        const ligacoesDeDepois = await ligacoesDo(tx, antes.id);
        await registrarNaAuditoria(tx, {
          acao: 'consumivel.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'consumivel', id: antes.id },
          antes: visaoDoConsumivel(antes, ligacoesDeAntes),
          depois: visaoDoConsumivel(depois, ligacoesDeDepois),
          origem: origemDa(requisicao),
          momento,
        });
        return comoFicha(depois, ligacoesDeDepois, true);
      });
    },
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'consumivel.inativado'],
    ['reativacao', 'ativo', 'consumivel.reativado'],
  ] as const) {
    app.post(
      `/consumiveis/:id/${caminho}`,
      {
        config: { permissao: 'consumiveis.editar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um consumível' : 'Reativar um consumível',
          params: ParametrosDoConsumivel,
          response: { 200: FichaDoConsumivel, ...PROBLEMAS_DO_CONSUMIVEL },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerConsumivel(tx, requisicao.params.id);
          const ligacoes = await ligacoesDo(tx, antes.id);
          if (antes.situacao === situacao) return comoFicha(antes, ligacoes, true);
          const [depois] = await tx
            .update(consumiveis)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(consumiveis.id, antes.id))
            .returning();
          if (!depois) throw new Error('O consumível não foi alterado.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'consumivel', id: antes.id },
            antes: { situacao: antes.situacao },
            depois: { situacao: depois.situacao },
            origem: origemDa(requisicao),
            momento,
          });
          return comoFicha(depois, ligacoes, true);
        });
      },
    );
  }
};
