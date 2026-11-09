// Os fornecedores da organização pela API (spec fornecedores e modulo-administracao, "Tela de
// fornecedores"; change p4a-fornecedores, design, decisão 5): quem vê os fornecedores lê a lista,
// com a busca pelo nome e pelo começo do CNPJ, a situação e o cursor, e a ficha; quem os edita
// cadastra, edita, inativa e reativa. Cada mudança vai para a auditoria, com o evento para toda a
// organização, porque o nome do fornecedor aparece nas telas dos ativos.
import { ativos, type Banco, fornecedores, naOrganizacao } from '@grafite/db';
import { alcance, cnpjComPontuacao, normalizarTexto, podeEm } from '@grafite/domain';
import { and, asc, count, eq, gt, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { modulosDesligados } from '../acesso/modulos.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import {
  dadosConferidos,
  type LinhaDoFornecedor,
  lerFornecedor,
  semFornecedorRepetido,
  visaoDoFornecedor,
} from '../fornecedores/fornecedores.ts';
import { Cursor, codificarCursor, decodificarCursor, Limite } from '../paginacao.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const SITUACOES_DO_FORNECEDOR = ['ativo', 'inativo'] as const;

const Fornecedor = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    /** Escrito com a pontuação, como "12.345.678/0001-95". */
    cnpj: z.string().nullable(),
    contato: z.string().nullable(),
    email: z.string().nullable(),
    telefone: z.string().nullable(),
    observacoes: z.string().nullable(),
    situacao: z.enum(SITUACOES_DO_FORNECEDOR),
    criadoEm: z.string(),
    atualizadoEm: z.string(),
  })
  .meta({ id: 'Fornecedor' });

const FichaDoFornecedor = Fornecedor.extend({
  permite: z.object({ editar: z.boolean() }),
}).meta({ id: 'FichaDoFornecedor' });

const ListaDeFornecedores = z
  .object({
    itens: z.array(Fornecedor),
    /** Quantos fornecedores a busca e a situação trazem, em todas as páginas. */
    total: z.number().int(),
    proximo: z.string().nullable(),
    permite: z.object({ cadastrar: z.boolean() }),
  })
  .meta({ id: 'ListaDeFornecedores' });

const FiltrosDaLista = z.object({
  /** O nome, sem diferenciar acento e maiúsculas, ou o começo do CNPJ, com ou sem a pontuação. */
  busca: z.string().max(120).optional(),
  situacao: z.enum(['ativos', 'inativos', 'todos']).default('ativos'),
  limite: Limite.default(50),
  cursor: Cursor.optional(),
});

/** Os textos como chegam: a conferência e a mensagem de cada campo são do domínio. */
const textoOpcional = z.string().max(5000).nullable().optional();

const PedidoDeFornecedor = z
  .object({
    nome: z.string({ error: 'Informe o nome do fornecedor.' }).max(5000),
    cnpj: textoOpcional,
    contato: textoOpcional,
    email: textoOpcional,
    telefone: textoOpcional,
    observacoes: textoOpcional,
  })
  .meta({ id: 'PedidoDeFornecedor' });

const PedidoDeAlteracaoDoFornecedor = PedidoDeFornecedor.partial().meta({
  id: 'PedidoDeAlteracaoDoFornecedor',
});

const ParametrosDoFornecedor = z.object({ id: z.uuid({ error: 'Fornecedor não encontrado.' }) });

const FornecedoresParaEscolher = z
  .object({
    /** Os ativos, pelo nome, só com o que a escolha mostra. */
    fornecedores: z.array(
      z.object({ id: z.uuid(), nome: z.string(), cnpj: z.string().nullable() }),
    ),
  })
  .meta({ id: 'FornecedoresParaEscolher' });

const AtivosDoFornecedor = z
  .object({
    /** Os ativos ativos do fornecedor que a conta vê; nulo sem ver ativos ou com o módulo desligado. */
    ativos: z.number().int().nullable(),
  })
  .meta({ id: 'AtivosDoFornecedor' });

const PROBLEMAS_DO_FORNECEDOR = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

const comoResposta = (fornecedor: LinhaDoFornecedor): z.infer<typeof Fornecedor> => ({
  id: fornecedor.id,
  nome: fornecedor.nome,
  cnpj: fornecedor.cnpj ? cnpjComPontuacao(fornecedor.cnpj) : null,
  contato: fornecedor.contato,
  email: fornecedor.email,
  telefone: fornecedor.telefone,
  observacoes: fornecedor.observacoes,
  situacao: fornecedor.situacao,
  criadoEm: fornecedor.criadoEm.toISOString(),
  atualizadoEm: fornecedor.atualizadoEm.toISOString(),
});

/** O padrão do LIKE, com o "%" e o "_" do texto tomados ao pé da letra. */
const contem = (texto: string) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const ValorDoCursor = z.tuple([z.string(), z.uuid()]);

export const rotasDosFornecedores: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  app.get(
    '/fornecedores',
    {
      config: { permissao: 'fornecedores.ver' },
      schema: {
        summary: 'Os fornecedores da organização, pelo nome, com a busca, a situação e o cursor',
        querystring: FiltrosDaLista,
        response: { 200: ListaDeFornecedores, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const { busca, situacao, limite, cursor } = requisicao.query;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const condicoes: SQL[] = [];
        if (situacao !== 'todos') {
          condicoes.push(eq(fornecedores.situacao, situacao === 'ativos' ? 'ativo' : 'inativo'));
        }
        const texto = busca?.trim() ?? '';
        if (texto !== '') {
          const pelaCnpj = texto.toUpperCase().replace(/[\s./-]/g, '');
          const pelaBusca = [
            sql`${fornecedores.nomeNormalizado} like ${contem(normalizarTexto(texto))}`,
          ];
          if (/^[0-9A-Z]+$/.test(pelaCnpj)) {
            pelaBusca.push(sql`${fornecedores.cnpj} like ${`${pelaCnpj}%`}`);
          }
          condicoes.push(or(...pelaBusca) as SQL);
        }
        const [contagem] = await tx
          .select({ total: count() })
          .from(fornecedores)
          .where(and(...condicoes));
        const comCursor = [...condicoes];
        if (cursor) {
          const [nome, id] = decodificarCursor(cursor, ValorDoCursor);
          comCursor.push(
            or(
              gt(fornecedores.nomeNormalizado, nome),
              and(eq(fornecedores.nomeNormalizado, nome), gt(fornecedores.id, id)),
            ) as SQL,
          );
        }
        const linhas = await tx
          .select()
          .from(fornecedores)
          .where(and(...comCursor))
          .orderBy(asc(fornecedores.nomeNormalizado), asc(fornecedores.id))
          .limit(limite + 1);
        const daPagina = linhas.slice(0, limite);
        const ultima = daPagina.at(-1);
        return {
          itens: daPagina.map(comoResposta),
          total: contagem?.total ?? 0,
          proximo:
            linhas.length > limite && ultima
              ? codificarCursor([ultima.nomeNormalizado, ultima.id])
              : null,
          permite: {
            cadastrar: podeEm(acesso, 'fornecedores.editar', null, await lerArvore(tx)),
          },
        };
      });
    },
  );

  app.get(
    '/fornecedores/escolha',
    {
      // Como a árvore de locais e os modelos: o nome e o CNPJ dos ativos são referência, para quem
      // edita os ativos escolher o fornecedor sem ver a Administração.
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os fornecedores ativos, pelo nome, para escolher um',
        response: {
          200: FornecedoresParaEscolher,
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linhas = await tx
          .select({ id: fornecedores.id, nome: fornecedores.nome, cnpj: fornecedores.cnpj })
          .from(fornecedores)
          .where(eq(fornecedores.situacao, 'ativo'))
          .orderBy(asc(fornecedores.nomeNormalizado), asc(fornecedores.id));
        return {
          fornecedores: linhas.map(({ id, nome, cnpj }) => ({
            id,
            nome,
            cnpj: cnpj ? cnpjComPontuacao(cnpj) : null,
          })),
        };
      }),
  );

  app.get(
    '/fornecedores/:id/ativos',
    {
      config: { permissao: 'fornecedores.ver' },
      schema: {
        summary: 'Quantos ativos ativos têm o fornecedor, no escopo de quem vê os ativos',
        params: ParametrosDoFornecedor,
        response: { 200: AtivosDoFornecedor, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const comAtivos = !(await modulosDesligados(banco, orgId)).includes('ativos');
      return naOrganizacao(banco, orgId, async (tx) => {
        const fornecedor = await lerFornecedor(tx, requisicao.params.id);
        const doVer = comAtivos ? alcance(acesso, 'ativos.ver', await lerArvore(tx)) : null;
        if (!doVer) return { ativos: null };
        const condicoes: SQL[] = [
          eq(ativos.situacao, 'ativo'),
          sql`${ativos.valores} @> ${JSON.stringify({ 'ativo.fornecedor': fornecedor.id })}::jsonb`,
        ];
        // O ativo sem local só entra pela organização inteira, como na tabela dos ativos.
        if (doVer !== 'organizacao') {
          condicoes.push(doVer.size > 0 ? inArray(ativos.localId, [...doVer]) : sql`false`);
        }
        const [contagem] = await tx
          .select({ total: count() })
          .from(ativos)
          .where(and(...condicoes));
        return { ativos: contagem?.total ?? 0 };
      });
    },
  );

  app.get(
    '/fornecedores/:id',
    {
      config: { permissao: 'fornecedores.ver' },
      schema: {
        summary: 'A ficha de um fornecedor, com o que a conta pode fazer',
        params: ParametrosDoFornecedor,
        response: { 200: FichaDoFornecedor, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const fornecedor = await lerFornecedor(tx, requisicao.params.id);
        return {
          ...comoResposta(fornecedor),
          permite: { editar: podeEm(acesso, 'fornecedores.editar', null, await lerArvore(tx)) },
        };
      });
    },
  );

  app.post(
    '/fornecedores',
    {
      config: { permissao: 'fornecedores.editar' },
      schema: {
        summary: 'Cadastrar um fornecedor, com o nome e o CNPJ únicos na organização',
        body: PedidoDeFornecedor,
        response: { 201: FichaDoFornecedor, ...PROBLEMAS_DO_FORNECEDOR },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const dados = dadosConferidos({
        nome: pedido.nome,
        cnpj: pedido.cnpj ?? null,
        contato: pedido.contato ?? null,
        email: pedido.email ?? null,
        telefone: pedido.telefone ?? null,
        observacoes: pedido.observacoes ?? null,
      });
      const momento = agora();
      const criado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [fornecedor] = await semFornecedorRepetido(() =>
          tx
            .insert(fornecedores)
            .values({
              orgId: requisicao.organizacao?.id ?? '',
              ...dados,
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!fornecedor) throw new Error('O fornecedor não foi cadastrado.');
        await registrarNaAuditoria(tx, {
          acao: 'fornecedor.criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'fornecedor', id: fornecedor.id },
          depois: visaoDoFornecedor(fornecedor),
          origem: origemDa(requisicao),
          momento,
        });
        return fornecedor;
      });
      return resposta.code(201).send({ ...comoResposta(criado), permite: { editar: true } });
    },
  );

  app.patch(
    '/fornecedores/:id',
    {
      config: { permissao: 'fornecedores.editar' },
      schema: {
        summary: 'Editar um fornecedor; a mesma informação não grava nada',
        params: ParametrosDoFornecedor,
        body: PedidoDeAlteracaoDoFornecedor,
        response: { 200: FichaDoFornecedor, ...PROBLEMAS_DO_FORNECEDOR },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerFornecedor(tx, requisicao.params.id);
        const dados = dadosConferidos({
          nome: pedido.nome ?? antes.nome,
          cnpj: pedido.cnpj === undefined ? antes.cnpj : pedido.cnpj,
          contato: pedido.contato === undefined ? antes.contato : pedido.contato,
          email: pedido.email === undefined ? antes.email : pedido.email,
          telefone: pedido.telefone === undefined ? antes.telefone : pedido.telefone,
          observacoes: pedido.observacoes === undefined ? antes.observacoes : pedido.observacoes,
        });
        const igual = (Object.keys(dados) as (keyof typeof dados)[]).every(
          (campo) => dados[campo] === antes[campo],
        );
        if (igual) return { ...comoResposta(antes), permite: { editar: true } };
        const [depois] = await semFornecedorRepetido(() =>
          tx
            .update(fornecedores)
            .set({ ...dados, atualizadoEm: momento })
            .where(eq(fornecedores.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('O fornecedor não foi alterado.');
        await registrarNaAuditoria(tx, {
          acao: 'fornecedor.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'fornecedor', id: antes.id },
          antes: visaoDoFornecedor(antes),
          depois: visaoDoFornecedor(depois),
          origem: origemDa(requisicao),
          momento,
        });
        return { ...comoResposta(depois), permite: { editar: true } };
      });
    },
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'fornecedor.inativado'],
    ['reativacao', 'ativo', 'fornecedor.reativado'],
  ] as const) {
    app.post(
      `/fornecedores/:id/${caminho}`,
      {
        config: { permissao: 'fornecedores.editar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um fornecedor' : 'Reativar um fornecedor',
          params: ParametrosDoFornecedor,
          response: { 200: FichaDoFornecedor, ...PROBLEMAS_DO_FORNECEDOR },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerFornecedor(tx, requisicao.params.id);
          if (antes.situacao === situacao)
            return { ...comoResposta(antes), permite: { editar: true } };
          const [depois] = await tx
            .update(fornecedores)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(fornecedores.id, antes.id))
            .returning();
          if (!depois) throw new Error('O fornecedor não foi alterado.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'fornecedor', id: antes.id },
            antes: { situacao: antes.situacao },
            depois: { situacao: depois.situacao },
            origem: origemDa(requisicao),
            momento,
          });
          return { ...comoResposta(depois), permite: { editar: true } };
        });
      },
    );
  }
};
