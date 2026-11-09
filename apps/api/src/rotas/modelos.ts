// Os modelos de equipamento (spec catalogo-de-ativos; design do P1a, decisões 5 a 8 e 10): toda
// sessão lê a lista, a ficha, as sugestões de fabricante e a imagem; quem tem `modelos.editar`
// cadastra, edita, inativa, reativa e troca a imagem. O tipo do modelo não muda depois de criado, e o
// modelo novo usa um tipo ativo. O fabricante é comparado sem acento nem maiúsculas, e a grafia do
// modelo mais antigo vale para os seguintes. A imagem segue o caminho comum das imagens.
import {
  ativos,
  type Banco,
  modelos,
  naOrganizacao,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import { ICONES_DE_TIPO, normalizarTexto, pode } from '@grafite/domain';
import { and, asc, count, eq, inArray, like, ne, type SQL, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { VARIANTES } from '../arquivos/armazenamento.ts';
import { BytesDaImagem } from '../arquivos/esquemas.ts';
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
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { contendo } from '../busca.ts';
import { SituacaoDoCadastro } from '../catalogo/esquemas.ts';
import { ativosNoEscopo, ContagemNoEscopo } from '../contagens.ts';
import { Cursor, decodificarCursor, Limite, pagina } from '../paginacao.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const Modelo = z
  .object({
    id: z.uuid(),
    tipo: z.object({ id: z.uuid(), nome: z.string(), icone: z.enum(ICONES_DE_TIPO) }),
    fabricante: z.string(),
    nome: z.string(),
    /** A imagem atual; sem ela, a tela mostra o ícone do tipo. */
    imagem: z.object({ id: z.uuid() }).nullable(),
    situacao: SituacaoDoCadastro,
    permite: z.object({ editar: z.boolean() }),
  })
  .meta({ id: 'Modelo' });

/** O modelo no cartão da referência e na ficha (change relacoes-vivas, design, decisão 1). */
const ResumoDoModelo = z
  .object({
    id: z.uuid(),
    fabricante: z.string(),
    nome: z.string(),
    imagem: z.object({ id: z.uuid() }).nullable(),
    situacao: SituacaoDoCadastro,
    tipo: z.object({ id: z.uuid(), nome: z.string(), icone: z.enum(ICONES_DE_TIPO) }),
    /** Os ativos do modelo, no escopo de quem vê; nulo para quem não vê ativos em nenhum ramo. */
    ativos: ContagemNoEscopo.nullable(),
  })
  .meta({ id: 'ResumoDoModelo' });

const ListaDeModelos = z
  .object({
    itens: z.array(Modelo),
    /** O cursor da próxima página; nulo na última. */
    proximo: z.string().nullable(),
    /** Quantos modelos atendem aos filtros, em todas as páginas. */
    total: z.number().int().min(0),
    permite: z.object({ cadastrar: z.boolean() }),
  })
  .meta({ id: 'ListaDeModelos' });

/** Os ids separados por vírgula, como `tipos=a,b`. */
const IDS_SEPARADOS =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$/i;

const FiltrosDeModelos = z.object({
  tipo: z.uuid({ error: 'Tipo de ativo não encontrado.' }).optional(),
  /**
   * Os modelos de qualquer destes tipos, separados por vírgula: o filtro de Modelo da tabela segue
   * o de Tipo (change filtros-e-barra-da-tabela, design, decisão 4).
   */
  tipos: z
    .string()
    .max(1_900, { error: 'Tipo de ativo não encontrado.' })
    .regex(IDS_SEPARADOS, { error: 'Tipo de ativo não encontrado.' })
    .optional(),
  situacao: z
    .enum(['ativos', 'inativos', 'todos'], { error: 'Escolha ativos, inativos ou todos.' })
    .default('ativos'),
  busca: z.string().max(200, { error: 'Use até 200 caracteres.' }).optional(),
  cursor: Cursor.optional(),
  limite: Limite,
});

const ChaveDoModelo = z.tuple([z.string(), z.string(), z.uuid()]);

const Fabricante = z
  .string({ error: 'Informe o fabricante.' })
  .trim()
  .min(1, { error: 'Informe o fabricante.' })
  .max(60, { error: 'Use até 60 caracteres.' });

const NomeDoModelo = z
  .string({ error: 'Informe o nome do modelo.' })
  .trim()
  .min(1, { error: 'Informe o nome do modelo.' })
  .max(80, { error: 'Use até 80 caracteres.' });

const PedidoDeModelo = z
  .object({
    tipoId: z.uuid({ error: 'Tipo de ativo não encontrado.' }),
    fabricante: Fabricante,
    nome: NomeDoModelo,
  })
  .meta({ id: 'PedidoDeModelo' });

/** Sem o tipo: ele não muda depois de criado. */
const PedidoDeAlteracaoDoModelo = z
  .object({ fabricante: Fabricante.optional(), nome: NomeDoModelo.optional() })
  .meta({ id: 'PedidoDeAlteracaoDoModelo' });

const ParametrosDoModelo = z.object({ id: z.uuid({ error: 'Modelo não encontrado.' }) });

const ParametrosDaImagem = ParametrosDoModelo.extend({
  arquivo: z.uuid({ error: 'Imagem não encontrada.' }),
  tamanho: z.enum(VARIANTES, { error: 'Use 64, 128, 256, 512 ou completa.' }),
});

const MODELO_REPETIDO = 'Já existe este modelo neste tipo.';

const COLUNAS_DO_MODELO = {
  modelo: modelos,
  tipo: { id: tiposDeAtivo.id, nome: tiposDeAtivo.nome, icone: tiposDeAtivo.icone },
};

const doTipo = and(eq(tiposDeAtivo.orgId, modelos.orgId), eq(tiposDeAtivo.id, modelos.tipoId));

type LinhaDoModelo = {
  modelo: typeof modelos.$inferSelect;
  tipo: { id: string; nome: string; icone: (typeof ICONES_DE_TIPO)[number] };
};

async function lerModelo(
  tx: Transacao,
  id: string,
  { travar = false } = {},
): Promise<LinhaDoModelo> {
  const consulta = tx
    .select(COLUNAS_DO_MODELO)
    .from(modelos)
    .innerJoin(tiposDeAtivo, doTipo)
    .where(eq(modelos.id, id));
  const [linha] = await (travar ? consulta.for('update', { of: modelos }) : consulta);
  if (!linha) throw naoEncontrado('Modelo não encontrado.');
  return linha;
}

const modeloDaResposta = ({ modelo, tipo }: LinhaDoModelo, editar: boolean) => ({
  id: modelo.id,
  tipo,
  fabricante: modelo.fabricante,
  nome: modelo.nome,
  imagem: modelo.imagemId ? { id: modelo.imagemId } : null,
  situacao: modelo.situacao,
  permite: { editar },
});

/** O que a auditoria guarda do modelo; a imagem tem as ações dela. */
const visaoDoModelo = ({ modelo, tipo }: LinhaDoModelo) => ({
  tipo: tipo.nome,
  fabricante: modelo.fabricante,
  nome: modelo.nome,
  situacao: modelo.situacao,
});

/**
 * A grafia do fabricante que vale: a do modelo mais antigo com o mesmo fabricante, ativo ou não,
 * fora o próprio modelo; sem nenhum, a pedida.
 */
async function grafiaDoFabricante(tx: Transacao, pedida: string, foraDe?: string) {
  const [existente] = await tx
    .select({ fabricante: modelos.fabricante })
    .from(modelos)
    .where(
      and(
        eq(modelos.fabricanteNormalizado, normalizarTexto(pedida)),
        foraDe ? ne(modelos.id, foraDe) : undefined,
      ),
    )
    .orderBy(asc(modelos.criadoEm), asc(modelos.id))
    .limit(1);
  return existente?.fabricante ?? pedida;
}

async function semModeloRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'modelos_unico_no_tipo')) {
      throw conflito(MODELO_REPETIDO, { nome: MODELO_REPETIDO });
    }
    throw erro;
  }
}

function condicoesDaLista(filtros: z.infer<typeof FiltrosDeModelos>): SQL[] {
  const condicoes: SQL[] = [];
  if (filtros.tipo) condicoes.push(eq(modelos.tipoId, filtros.tipo));
  if (filtros.tipos) {
    condicoes.push(inArray(modelos.tipoId, filtros.tipos.toLowerCase().split(',')));
  }
  if (filtros.situacao === 'ativos') condicoes.push(eq(modelos.situacao, 'ativo'));
  if (filtros.situacao === 'inativos') condicoes.push(eq(modelos.situacao, 'inativo'));
  for (const palavra of normalizarTexto(filtros.busca ?? '')
    .split(' ')
    .filter(Boolean)) {
    condicoes.push(like(modelos.busca, contendo(palavra)));
  }
  return condicoes;
}

const RESPOSTAS_DO_MODELO = {
  200: Modelo,
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

export const rotasDosModelos: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/modelos',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os modelos de equipamento, pelo fabricante e pelo nome',
        querystring: FiltrosDeModelos,
        response: { 200: ListaDeModelos, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const editar = pode(sessaoDa(requisicao).acesso, 'modelos.editar');
      const filtros = requisicao.query;
      const depoisDe = filtros.cursor ? decodificarCursor(filtros.cursor, ChaveDoModelo) : null;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const condicoes = condicoesDaLista(filtros);
        const linhas = await tx
          .select(COLUNAS_DO_MODELO)
          .from(modelos)
          .innerJoin(tiposDeAtivo, doTipo)
          .where(
            and(
              ...condicoes,
              depoisDe
                ? sql`(${modelos.fabricanteNormalizado}, ${modelos.nomeNormalizado}, ${modelos.id}) > (${depoisDe[0]}, ${depoisDe[1]}, ${depoisDe[2]})`
                : undefined,
            ),
          )
          .orderBy(modelos.fabricanteNormalizado, modelos.nomeNormalizado, modelos.id)
          .limit(filtros.limite + 1);
        const [contagem] = await tx
          .select({ total: count() })
          .from(modelos)
          .where(and(...condicoes));
        const { linhas: daPagina, proximo } = pagina(linhas, filtros.limite, ({ modelo }) => [
          modelo.fabricanteNormalizado,
          modelo.nomeNormalizado,
          modelo.id,
        ]);
        return {
          itens: daPagina.map((linha) => modeloDaResposta(linha, editar)),
          proximo,
          total: contagem?.total ?? 0,
          permite: { cadastrar: editar },
        };
      });
    },
  );

  app.get(
    '/modelos/fabricantes',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os fabricantes já usados nos modelos, pela grafia que vale',
        querystring: z.object({
          busca: z.string().max(60, { error: 'Use até 60 caracteres.' }).optional(),
          /** Os fabricantes já usados neste tipo vêm primeiro. */
          tipo: z.uuid({ error: 'Informe o id de um tipo de ativo.' }).optional(),
        }),
        response: {
          200: z
            .object({
              fabricantes: z.array(z.string()),
              /** Os fabricantes do tipo pedido, que vêm primeiro na lista. */
              doTipo: z.array(z.string()),
            })
            .meta({ id: 'Fabricantes' }),
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) => {
      const busca = normalizarTexto(requisicao.query.busca ?? '');
      const { tipo } = requisicao.query;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        // A grafia que vale é a do modelo mais antigo de cada fabricante, em qualquer tipo.
        const linhas = await tx
          .selectDistinctOn([modelos.fabricanteNormalizado], {
            fabricante: modelos.fabricante,
            normalizado: modelos.fabricanteNormalizado,
          })
          .from(modelos)
          .where(busca ? like(modelos.fabricanteNormalizado, contendo(busca)) : undefined)
          .orderBy(modelos.fabricanteNormalizado, modelos.criadoEm, modelos.id)
          .limit(50);
        const doTipo = tipo
          ? new Set(
              (
                await tx
                  .selectDistinct({ normalizado: modelos.fabricanteNormalizado })
                  .from(modelos)
                  .where(eq(modelos.tipoId, tipo))
              ).map((linha) => linha.normalizado),
            )
          : new Set<string>();
        const primeiros = linhas.filter((linha) => doTipo.has(linha.normalizado));
        const outros = linhas.filter((linha) => !doTipo.has(linha.normalizado));
        return {
          fabricantes: [...primeiros, ...outros].map((linha) => linha.fabricante),
          doTipo: primeiros.map((linha) => linha.fabricante),
        };
      });
    },
  );

  app.get(
    '/modelos/:id',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Um modelo de equipamento',
        params: ParametrosDoModelo,
        response: { 200: Modelo, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const editar = pode(sessaoDa(requisicao).acesso, 'modelos.editar');
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) =>
        modeloDaResposta(await lerModelo(tx, requisicao.params.id), editar),
      );
    },
  );

  app.get(
    '/modelos/:id/resumo',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary:
          'O resumo de um modelo, para o cartão da referência, com os ativos no escopo de quem vê',
        params: ParametrosDoModelo,
        response: { 200: ResumoDoModelo, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const { modelo, tipo } = await lerModelo(tx, requisicao.params.id);
        const arvore = await lerArvore(tx);
        return {
          id: modelo.id,
          fabricante: modelo.fabricante,
          nome: modelo.nome,
          imagem: modelo.imagemId ? { id: modelo.imagemId } : null,
          situacao: modelo.situacao,
          tipo,
          ativos: await ativosNoEscopo(tx, { acesso, arvore }, eq(ativos.modeloId, modelo.id)),
        };
      });
    },
  );

  app.post(
    '/modelos',
    {
      config: { permissao: 'modelos.editar' },
      schema: {
        summary: 'Cadastrar um modelo de equipamento',
        body: PedidoDeModelo,
        response: { ...RESPOSTAS_DO_MODELO, 201: Modelo },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      const criado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [tipo] = await tx
          .select({
            id: tiposDeAtivo.id,
            nome: tiposDeAtivo.nome,
            icone: tiposDeAtivo.icone,
            situacao: tiposDeAtivo.situacao,
          })
          .from(tiposDeAtivo)
          .where(eq(tiposDeAtivo.id, pedido.tipoId))
          .for('share');
        if (!tipo) throw dadosInvalidos({ tipoId: 'Tipo de ativo não encontrado.' });
        if (tipo.situacao === 'inativo') {
          const motivo = `O tipo ${tipo.nome} está inativo.`;
          throw conflito(motivo, { tipoId: motivo });
        }
        const fabricante = await grafiaDoFabricante(tx, pedido.fabricante);
        const [modelo] = await semModeloRepetido(() =>
          tx
            .insert(modelos)
            .values({
              orgId: sql`app.current_org()`,
              tipoId: tipo.id,
              fabricante,
              fabricanteNormalizado: normalizarTexto(fabricante),
              nome: pedido.nome,
              nomeNormalizado: normalizarTexto(pedido.nome),
              busca: normalizarTexto(`${fabricante} ${pedido.nome}`),
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!modelo) throw new Error('O modelo não foi cadastrado.');
        const linha = { modelo, tipo: { id: tipo.id, nome: tipo.nome, icone: tipo.icone } };
        await registrarNaAuditoria(tx, {
          acao: 'modelo.criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'modelo', id: modelo.id },
          depois: visaoDoModelo(linha),
          origem: origemDa(requisicao),
          momento,
        });
        return modeloDaResposta(linha, true);
      });
      return resposta.code(201).send(criado);
    },
  );

  app.patch(
    '/modelos/:id',
    {
      config: { permissao: 'modelos.editar' },
      schema: {
        summary: 'Editar o fabricante e o nome de um modelo, sem mudar o tipo',
        params: ParametrosDoModelo,
        body: PedidoDeAlteracaoDoModelo,
        response: RESPOSTAS_DO_MODELO,
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerModelo(tx, requisicao.params.id, { travar: true });
        const fabricante = pedido.fabricante
          ? await grafiaDoFabricante(tx, pedido.fabricante, antes.modelo.id)
          : antes.modelo.fabricante;
        const nome = pedido.nome ?? antes.modelo.nome;
        if (fabricante === antes.modelo.fabricante && nome === antes.modelo.nome) {
          return modeloDaResposta(antes, true);
        }
        const [modelo] = await semModeloRepetido(() =>
          tx
            .update(modelos)
            .set({
              fabricante,
              fabricanteNormalizado: normalizarTexto(fabricante),
              nome,
              nomeNormalizado: normalizarTexto(nome),
              busca: normalizarTexto(`${fabricante} ${nome}`),
              atualizadoEm: momento,
            })
            .where(eq(modelos.id, antes.modelo.id))
            .returning(),
        );
        if (!modelo) throw new Error('O modelo não foi alterado.');
        const depois = { modelo, tipo: antes.tipo };
        await registrarNaAuditoria(tx, {
          acao: 'modelo.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'modelo', id: modelo.id },
          antes: visaoDoModelo(antes),
          depois: visaoDoModelo(depois),
          origem: origemDa(requisicao),
          momento,
        });
        return modeloDaResposta(depois, true);
      });
    },
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'modelo.inativado'],
    ['reativacao', 'ativo', 'modelo.reativado'],
  ] as const) {
    app.post(
      `/modelos/:id/${caminho}`,
      {
        config: { permissao: 'modelos.editar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um modelo' : 'Reativar um modelo',
          params: ParametrosDoModelo,
          response: RESPOSTAS_DO_MODELO,
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerModelo(tx, requisicao.params.id, { travar: true });
          if (antes.modelo.situacao === situacao) return modeloDaResposta(antes, true);
          const [modelo] = await tx
            .update(modelos)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(modelos.id, antes.modelo.id))
            .returning();
          if (!modelo) throw new Error('O modelo não foi alterado.');
          const depois = { modelo, tipo: antes.tipo };
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'modelo', id: modelo.id },
            antes: visaoDoModelo(antes),
            depois: visaoDoModelo(depois),
            origem: origemDa(requisicao),
            momento,
          });
          return modeloDaResposta(depois, true);
        });
      },
    );
  }
};

/** O modelo dono da imagem, como a rota o conferiu na transação. */
interface DonoDaImagemDoModelo {
  modeloId: string;
  imagemId: string | null;
}

/** As rotas da imagem do modelo: num plugin só delas, porque o corpo é a imagem, e não JSON. */
export const rotasDaImagemDoModelo: FastifyPluginAsyncZod<DependenciasDasImagens> = async (
  app,
  deps,
) => {
  aceitarImagens(app);

  const imagemDoModelo = (
    requisicao: Parameters<typeof quemMuda>[0],
    id: string,
  ): ImagemDoRegistro<DonoDaImagemDoModelo> => ({
    async conferir(tx, travar) {
      const { modelo } = await lerModelo(tx, id, { travar });
      return { modeloId: modelo.id, imagemId: modelo.imagemId };
    },
    async apontar(tx, dono, imagemId, momento) {
      await tx
        .update(modelos)
        .set({ imagemId, atualizadoEm: momento })
        .where(eq(modelos.id, dono.modeloId));
    },
    async auditar(tx, dono, { arquivoId, anteriorId }, momento) {
      const comum = {
        ator: { tipo: 'conta' as const, contaId: sessaoDa(requisicao).contaId },
        alvo: { tipo: 'modelo', id: dono.modeloId },
        origem: origemDa(requisicao),
        momento,
      };
      await registrarNaAuditoria(
        tx,
        arquivoId
          ? {
              ...comum,
              acao: 'imagem-do-modelo.trocada',
              dados: { arquivoId, arquivoAnteriorId: anteriorId },
            }
          : { ...comum, acao: 'imagem-do-modelo.removida', dados: { arquivoId: anteriorId } },
      );
    },
  });

  const responder = (id: string) => async (tx: Transacao) =>
    modeloDaResposta(await lerModelo(tx, id), true);

  const PROBLEMAS_DA_IMAGEM = {
    401: RespostaDeProblema,
    409: RespostaDeProblema,
    413: RespostaDeProblema,
    415: RespostaDeProblema,
    ...PROBLEMAS_DO_ACESSO,
  };

  app.put(
    '/modelos/:id/imagem',
    {
      config: { permissao: 'modelos.editar' },
      schema: {
        summary: 'Trocar a imagem de um modelo',
        params: ParametrosDoModelo,
        consumes: TIPOS_DO_ENVIO,
        body: BytesDaImagem,
        response: { 200: Modelo, ...PROBLEMAS_DA_IMAGEM },
      },
    },
    async (requisicao) =>
      trocarImagem(
        deps,
        quemMuda(requisicao, sessaoDa(requisicao).contaId),
        imagemDoModelo(requisicao, requisicao.params.id),
        { conteudo: requisicao.body, responder: responder(requisicao.params.id) },
      ),
  );

  app.delete(
    '/modelos/:id/imagem',
    {
      config: { permissao: 'modelos.editar' },
      schema: {
        summary: 'Remover a imagem de um modelo',
        params: ParametrosDoModelo,
        response: { 200: Modelo, ...PROBLEMAS_DA_IMAGEM },
      },
    },
    async (requisicao) =>
      tirarImagem(
        deps,
        quemMuda(requisicao, sessaoDa(requisicao).contaId),
        imagemDoModelo(requisicao, requisicao.params.id),
        { responder: responder(requisicao.params.id) },
      ),
  );

  app.get(
    '/modelos/:id/imagem/:arquivo/:tamanho',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Um tamanho da imagem de um modelo',
        params: ParametrosDaImagem,
        response: { 200: IMAGEM_ENTREGUE, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) => {
      const { id, arquivo, tamanho } = requisicao.params;
      return entregarImagem(deps, requisicao, resposta, {
        arquivo,
        tamanho,
        // O modelo de outra organização nem aparece: o endereço responde como a imagem que falta.
        imagemAtual: async (tx) => {
          const [linha] = await tx
            .select({ imagemId: modelos.imagemId })
            .from(modelos)
            .where(eq(modelos.id, id));
          if (!linha) throw imagemNaoEncontrada();
          return linha.imagemId;
        },
      });
    },
  );
};
