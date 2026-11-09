// Os indicadores criados pela organização pela API (spec indicadores, "Indicadores da organização";
// change regras-indicadores-e-tarefas, design, decisão 3): quem vê os alertas lê os indicadores
// criados, calculados com os alertas que a conta vê; quem os administra cria, edita e apaga, com a
// conferência do domínio, o recorte ativo no banco, o nome único, a auditoria e o evento das metas,
// que atualiza a tela dos indicadores.
import {
  type Banco,
  indicadoresCriados,
  MEDIDAS_DOS_INDICADORES_NO_BANCO,
  naOrganizacao,
} from '@grafite/db';
import {
  conferirIndicadorCriado,
  MENSAGEM_DO_NOME_DO_INDICADOR_REPETIDO,
  normalizarTexto,
  podeEm,
} from '@grafite/domain';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import {
  conferirRecorteNoBanco,
  type LinhaDoIndicadorCriado,
  lerIndicadoresCriados,
} from '../alertas/indicadores-criados.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { SituacaoDoIndicador } from './indicadores.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const AlvoDoIndicadorCriado = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('ativo'),
    id: z.uuid(),
    nome: z.string(),
    local: z.string().nullable(),
  }),
  z.object({ tipo: z.literal('coletor'), id: z.uuid(), nome: z.string() }),
]);

const RegistroDoRecorte = z.object({ id: z.uuid(), nome: z.string() }).nullable();

const IndicadorCriado = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    medida: z.enum(MEDIDAS_DOS_INDICADORES_NO_BANCO),
    recorte: z.object({
      tipo: RegistroDoRecorte,
      modelo: RegistroDoRecorte,
      /** O caminho do local na árvore. */
      local: RegistroDoRecorte,
    }),
    /** Na unidade da medida, como as metas dos indicadores. */
    meta: z.number().int(),
    metaDeFabrica: z.number().int(),
    valor: z.number().nullable(),
    anterior: z.number().nullable(),
    base: z.number().int(),
    situacao: SituacaoDoIndicador,
    /** Até 20, na ordem da medida. */
    itens: z.array(
      z.object({
        alvo: AlvoDoIndicadorCriado,
        detalhe: z.string(),
        /** ISO 8601, como o último backup bom; a tela o escreve no fuso da conta. */
        momento: z.string().nullable(),
      }),
    ),
    mais: z.number().int(),
  })
  .meta({ id: 'IndicadorCriado' });

const ListaDeIndicadoresCriados = z
  .object({
    indicadores: z.array(IndicadorCriado),
    permite: z.object({ criar: z.boolean() }),
  })
  .meta({ id: 'ListaDeIndicadoresCriados' });

/** O indicador como a tela o manda: os tipos largos, para a recusa vir com as mensagens do domínio. */
const PedidoDeIndicadorCriado = z
  .object({
    nome: z.string(),
    medida: z.string(),
    recorte: z
      .object({
        tipoId: z.string().nullable().optional(),
        modeloId: z.string().nullable().optional(),
        localId: z.string().nullable().optional(),
      })
      .optional(),
    meta: z.number(),
  })
  .meta({ id: 'PedidoDeIndicadorCriado' });

const ParametrosDoIndicadorCriado = z.object({
  id: z.uuid({ error: 'Indicador não encontrado.' }),
});

const indicadorNaoEncontrado = () => naoEncontrado('Indicador não encontrado.');

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

/** O que a auditoria guarda de um indicador criado. */
const visaoDoIndicador = (linha: LinhaDoIndicadorCriado) => ({
  nome: linha.nome,
  medida: linha.medida,
  recorte: { tipoId: linha.tipoId, modeloId: linha.modeloId, localId: linha.localId },
  meta: linha.meta,
});

/** O evento das metas atualiza a tela de quem vê os alertas. */
const saidaDoIndicador = (id: string) => ({
  publico: { permissao: 'alertas.ver' as const },
  alvo: { tipo: 'indicador-criado', id },
});

/** Grava o indicador, trocando o nome repetido pela recusa no campo do nome. */
async function semNomeRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'indicadores_criados_nome_unico')) {
      throw conflito(MENSAGEM_DO_NOME_DO_INDICADOR_REPETIDO, {
        nome: MENSAGEM_DO_NOME_DO_INDICADOR_REPETIDO,
      });
    }
    throw erro;
  }
}

export const rotasDosIndicadoresCriados: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  /** O indicador calculado, como a lista o devolve. */
  const calculado = async (
    tx: Parameters<Parameters<typeof naOrganizacao>[2]>[0],
    acesso: ReturnType<typeof sessaoDa>['acesso'],
    id: string,
  ) => {
    const arvore = await lerArvore(tx);
    const todos = await lerIndicadoresCriados(tx, { agora: agora(), arvore, acesso });
    const achado = todos.find((indicador) => indicador.id === id);
    if (!achado) throw indicadorNaoEncontrado();
    return achado;
  };

  app.get(
    '/alertas/indicadores/criados',
    {
      config: { permissao: 'alertas.ver' },
      schema: {
        summary:
          'Os indicadores criados pela organização, calculados com os alertas que a conta vê',
        response: { 200: ListaDeIndicadoresCriados, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        return {
          indicadores: await lerIndicadoresCriados(tx, { agora: agora(), arvore, acesso }),
          permite: { criar: podeEm(acesso, 'alertas.administrar', null, arvore) },
        };
      });
    },
  );

  app.post(
    '/alertas/indicadores/criados',
    {
      config: { permissao: 'alertas.administrar' },
      schema: {
        summary: 'Criar um indicador da organização',
        body: PedidoDeIndicadorCriado,
        response: { 201: IndicadorCriado, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const conferido = conferirIndicadorCriado(requisicao.body);
      if (!conferido.ok) throw dadosInvalidos(conferido.erros as Record<string, string>);
      const { dados } = conferido;
      const momento = agora();
      const criado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        await conferirRecorteNoBanco(tx, dados.recorte);
        const [linha] = await semNomeRepetido(() =>
          tx
            .insert(indicadoresCriados)
            .values({
              orgId: requisicao.organizacao?.id ?? '',
              nome: dados.nome,
              nomeNormalizado: normalizarTexto(dados.nome),
              medida: dados.medida,
              ...dados.recorte,
              meta: dados.meta,
              criadoPor: contaId,
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!linha) throw new Error('O indicador não foi criado.');
        await registrarNaAuditoria(tx, {
          acao: 'indicador-criado.criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'indicador-criado', id: linha.id },
          depois: visaoDoIndicador(linha),
          origem: origemDa(requisicao),
          momento,
          saida: saidaDoIndicador(linha.id),
        });
        return calculado(tx, acesso, linha.id);
      });
      return resposta.code(201).send(criado);
    },
  );

  app.patch(
    '/alertas/indicadores/criados/:id',
    {
      config: { permissao: 'alertas.administrar' },
      schema: {
        summary: 'Editar um indicador da organização',
        params: ParametrosDoIndicadorCriado,
        body: PedidoDeIndicadorCriado,
        response: { 200: IndicadorCriado, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId, acesso } = sessaoDa(requisicao);
      const conferido = conferirIndicadorCriado(requisicao.body);
      if (!conferido.ok) throw dadosInvalidos(conferido.erros as Record<string, string>);
      const { dados } = conferido;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [antes] = await tx
          .select()
          .from(indicadoresCriados)
          .where(eq(indicadoresCriados.id, requisicao.params.id))
          .for('update');
        if (!antes) throw indicadorNaoEncontrado();
        await conferirRecorteNoBanco(tx, dados.recorte);
        const [depois] = await semNomeRepetido(() =>
          tx
            .update(indicadoresCriados)
            .set({
              nome: dados.nome,
              nomeNormalizado: normalizarTexto(dados.nome),
              medida: dados.medida,
              ...dados.recorte,
              meta: dados.meta,
              atualizadoEm: momento,
            })
            .where(eq(indicadoresCriados.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('O indicador não foi alterado.');
        await registrarNaAuditoria(tx, {
          acao: 'indicador-criado.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'indicador-criado', id: antes.id },
          antes: visaoDoIndicador(antes),
          depois: visaoDoIndicador(depois),
          origem: origemDa(requisicao),
          momento,
          saida: saidaDoIndicador(antes.id),
        });
        return calculado(tx, acesso, antes.id);
      });
    },
  );

  app.delete(
    '/alertas/indicadores/criados/:id',
    {
      config: { permissao: 'alertas.administrar' },
      schema: {
        summary: 'Apagar um indicador da organização',
        params: ParametrosDoIndicadorCriado,
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [apagado] = await tx
          .delete(indicadoresCriados)
          .where(eq(indicadoresCriados.id, requisicao.params.id))
          .returning();
        if (!apagado) throw indicadorNaoEncontrado();
        await registrarNaAuditoria(tx, {
          acao: 'indicador-criado.apagado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'indicador-criado', id: apagado.id },
          antes: visaoDoIndicador(apagado),
          origem: origemDa(requisicao),
          momento,
          saida: saidaDoIndicador(apagado.id),
        });
      });
      return resposta.code(204).send(null);
    },
  );
};
