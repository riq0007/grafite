// As importações de ativos (spec importacao-de-ativos; design do P1e, decisões 1 a 5), para quem
// tem `ativos.editar` em algum escopo: o envio da planilha, que cria o rascunho com as colunas
// sugeridas; a lista e o detalhe, só das importações da própria conta; a escolha das colunas; a
// prévia linha a linha, que não grava nada; o descarte do rascunho; "Importar", que põe a
// importação na fila, com a auditoria; e as linhas com erro da aplicação. Cada mudança manda o
// evento `importacoes.mudaram` só às sessões de quem importou.
import {
  type Banco,
  errosDaImportacao,
  importacoes,
  naOrganizacao,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type CampoDaImportacao,
  conferirMapeamento,
  podeEm,
  sugerirColunas,
} from '@grafite/domain';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirAtiva, sessaoDa } from '../acesso/escopo.ts';
import { nomeDoArquivo } from '../arquivos/documentos.ts';
import { BytesDoArquivo } from '../arquivos/esquemas.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { avisarQuemImportou, publicoDaImportacao } from '../eventos/importacoes.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import {
  EnvioDaPlanilha,
  ErrosDaImportacao,
  FiltrosDaPrevia,
  FiltrosDasImportacoes,
  Importacao,
  ListaDeImportacoes,
  ParametrosDaImportacao,
  PedidoDasColunas,
  PreviaDaImportacao,
} from '../importacao/esquemas.ts';
import {
  extensaoDaPlanilha,
  LIMITE_DA_PLANILHA,
  lerPlanilha,
  planilhaNaoAceita,
  planilhaPesadaDemais,
} from '../importacao/planilha.ts';
import {
  type BaseDaImportacao,
  camposOferecidos,
  lerBaseDaImportacao,
  lerTipoDaImportacao,
  planejarImportacao,
  type TipoDaImportacao,
  totaisDos,
} from '../importacao/regra.ts';
import { TAREFA_DA_IMPORTACAO } from '../importacao/tarefa.ts';
import { decodificarCursor, pagina } from '../paginacao.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';
import { filaIndisponivel } from './tarefas.ts';

export const IMPORTACAO_NAO_ENCONTRADA = 'Importação não encontrada.';
export const NAO_E_RASCUNHO = 'A importação não está mais em rascunho.';
const SEM_PREVIA = 'A prévia só existe antes de importar.';

const PROBLEMAS_DA_IMPORTACAO = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

type LinhaDaImportacao = typeof importacoes.$inferSelect & { tipoNome: string };

/** A importação da conta, pelo id, ou 404: a de outra conta não existe para ela. */
export async function lerImportacao(
  tx: Transacao,
  id: string,
  contaId: string,
  { travar = false } = {},
): Promise<LinhaDaImportacao> {
  const consulta = tx
    .select({ importacao: importacoes, tipoNome: tiposDeAtivo.nome })
    .from(importacoes)
    .innerJoin(
      tiposDeAtivo,
      and(eq(tiposDeAtivo.orgId, importacoes.orgId), eq(tiposDeAtivo.id, importacoes.tipoId)),
    )
    .where(and(eq(importacoes.id, id), eq(importacoes.criadaPor, contaId)));
  const [linha] = await (travar ? consulta.for('update', { of: importacoes }) : consulta);
  if (!linha) throw naoEncontrado(IMPORTACAO_NAO_ENCONTRADA);
  return { ...linha.importacao, tipoNome: linha.tipoNome };
}

const iso = (momento: Date | null) => (momento ? momento.toISOString() : null);

/** Até três valores de uma coluna, como texto, para ajudar a escolher o campo. */
function exemplosDa(linha: LinhaDaImportacao, posicao: number): string[] {
  const exemplos: string[] = [];
  for (const { celulas } of linha.conteudo ?? []) {
    const celula = celulas[posicao];
    if (celula !== null && celula !== undefined && !exemplos.includes(String(celula))) {
      exemplos.push(String(celula));
    }
    if (exemplos.length === 3) break;
  }
  return exemplos;
}

function naLista(linha: LinhaDaImportacao): z.infer<typeof ListaDeImportacoes>['itens'][number] {
  return {
    id: linha.id,
    nomeDoArquivo: linha.nomeDoArquivo,
    tipo: { id: linha.tipoId, nome: linha.tipoNome },
    situacao: linha.situacao,
    linhas: linha.linhas,
    processadas: linha.processadas,
    totais: linha.totais,
    criadaEm: linha.criadaEm.toISOString(),
    concluidaEm: iso(linha.concluidaEm),
  };
}

export function importacaoNaResposta(
  linha: LinhaDaImportacao,
  campos: readonly CampoDaImportacao[],
): z.infer<typeof Importacao> {
  return {
    ...naLista(linha),
    colunas: linha.colunas.map((titulo, posicao) => ({
      titulo,
      campo: linha.mapeamento[posicao] ?? null,
      exemplos: exemplosDa(linha, posicao),
    })),
    campos: [...campos],
    aplicadaEm: iso(linha.aplicadaEm),
  };
}

/** O tipo da importação, que existe porque a chave estrangeira garante. */
async function tipoDa(tx: Transacao, linha: LinhaDaImportacao): Promise<TipoDaImportacao> {
  const tipo = await lerTipoDaImportacao(tx, linha.tipoId);
  if (!tipo) throw new Error('O tipo da importação não foi encontrado.');
  return tipo;
}

/** A linha da prévia, com o ativo casado só quando a conta o vê. */
function linhaDaPrevia(
  plano: Awaited<ReturnType<typeof planejarImportacao>>[number],
  base: BaseDaImportacao,
  acesso: Acesso,
): z.infer<typeof PreviaDaImportacao>['linhas'][number] {
  const ativo = plano.ativoId ? base.porId.get(plano.ativoId) : undefined;
  const veOAtivo =
    ativo !== undefined &&
    podeEm(acesso, 'ativos.ver', base.localDoAtivo.get(ativo.id) ?? null, base.arvore);
  return {
    linha: plano.linha,
    acao: plano.acao,
    ativo:
      ativo && veOAtivo ? { id: ativo.id, rotulo: ativo.nome, patrimonio: ativo.patrimonio } : null,
    mudancas: plano.mudancas.map(({ campo, antes, depois }) => ({ campo, antes, depois })),
    seguros: plano.seguros.map(({ campo, motivo }) => ({ campo, motivo })),
    erros: plano.erros,
  };
}

/** A chave da ordem da lista: a criação com a precisão do banco e o id, que desempata. */
const ChaveDaImportacao = z.tuple([z.string(), z.uuid()]);

/** A chave da página da prévia: o número da última linha mostrada. */
const ChaveDaLinha = z.tuple([z.number().int()]);

export const rotasDasImportacoes: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  /** Sem ela, como no contrato e nos testes que não tratam da fila, "Importar" é recusado. */
  fila?: FilaDeTarefas;
}> = async (app, { banco, agora, fila }) => {
  app.get(
    '/ativos/importacoes',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'As importações de ativos da própria conta, da mais nova para a mais antiga',
        querystring: FiltrosDasImportacoes,
        response: { 200: ListaDeImportacoes, ...PROBLEMAS_DA_IMPORTACAO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const { cursor, limite } = requisicao.query;
      const depoisDe = cursor ? decodificarCursor(cursor, ChaveDaImportacao) : null;
      const linhas = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        tx
          .select({
            importacao: importacoes,
            tipoNome: tiposDeAtivo.nome,
            criadaEmExata: sql<string>`to_char(${importacoes.criadaEm} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          })
          .from(importacoes)
          .innerJoin(
            tiposDeAtivo,
            and(eq(tiposDeAtivo.orgId, importacoes.orgId), eq(tiposDeAtivo.id, importacoes.tipoId)),
          )
          .where(
            and(
              eq(importacoes.criadaPor, sessao.contaId),
              depoisDe
                ? sql`(${importacoes.criadaEm}, ${importacoes.id}) < (${depoisDe[0]}::timestamptz, ${depoisDe[1]}::uuid)`
                : undefined,
            ),
          )
          .orderBy(desc(importacoes.criadaEm), desc(importacoes.id))
          .limit(limite + 1),
      );
      const { linhas: daPagina, proximo } = pagina(linhas, limite, (linha) => [
        linha.criadaEmExata,
        linha.importacao.id,
      ]);
      return {
        itens: daPagina.map((linha) => naLista({ ...linha.importacao, tipoNome: linha.tipoNome })),
        proximo,
      };
    },
  );

  app.get(
    '/ativos/importacoes/:id',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Uma importação da própria conta, com as colunas, a situação e o resultado',
        params: ParametrosDaImportacao,
        response: { 200: Importacao, ...PROBLEMAS_DA_IMPORTACAO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linha = await lerImportacao(tx, requisicao.params.id, sessao.contaId);
        return importacaoNaResposta(
          linha,
          camposOferecidos(await tipoDa(tx, linha), sessao.acesso),
        );
      });
    },
  );

  app.put(
    '/ativos/importacoes/:id/colunas',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Escolher o campo de cada coluna do rascunho',
        params: ParametrosDaImportacao,
        body: PedidoDasColunas,
        response: { 200: Importacao, ...PROBLEMAS_DA_IMPORTACAO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linha = await lerImportacao(tx, requisicao.params.id, sessao.contaId, {
          travar: true,
        });
        if (linha.situacao !== 'rascunho') throw conflito(NAO_E_RASCUNHO);
        const campos = camposOferecidos(await tipoDa(tx, linha), sessao.acesso);
        const { colunas } = requisicao.body;
        const conferido = conferirMapeamento(colunas, linha.colunas.length, campos);
        if (!conferido.ok) throw dadosInvalidos(conferido.erros);
        const [gravada] = await tx
          .update(importacoes)
          .set({ mapeamento: colunas, atualizadaEm: agora() })
          .where(eq(importacoes.id, linha.id))
          .returning();
        await avisarQuemImportou(tx, linha);
        return importacaoNaResposta({ ...linha, ...gravada }, campos);
      });
    },
  );

  app.get(
    '/ativos/importacoes/:id/previa',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'A prévia do rascunho, linha a linha, com os totais; nada é gravado',
        params: ParametrosDaImportacao,
        querystring: FiltrosDaPrevia,
        response: { 200: PreviaDaImportacao, ...PROBLEMAS_DA_IMPORTACAO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const { acao, cursor, limite } = requisicao.query;
      const depoisDe = cursor ? decodificarCursor(cursor, ChaveDaLinha)[0] : 0;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linha = await lerImportacao(tx, requisicao.params.id, sessao.contaId);
        if (linha.situacao !== 'rascunho' || !linha.conteudo) throw conflito(SEM_PREVIA);
        const base = await lerBaseDaImportacao(tx, await tipoDa(tx, linha));
        const planos = await planejarImportacao(tx, base, {
          conteudo: linha.conteudo,
          mapeamento: linha.mapeamento,
          acesso: sessao.acesso,
        });
        const filtrados = planos.filter(
          (plano) => (!acao || plano.acao === acao) && plano.linha > depoisDe,
        );
        const { linhas: daPagina, proximo } = pagina(filtrados, limite, (plano) => [plano.linha]);
        return {
          totais: totaisDos(planos),
          linhas: daPagina.map((plano) => linhaDaPrevia(plano, base, sessao.acesso)),
          proximo,
        };
      });
    },
  );

  // A importação vai para a fila na mesma transação da auditoria (a opção `db` do pg-boss): se a
  // transação é desfeita, a tarefa não entra.
  app.post(
    '/ativos/importacoes/:id/aplicacao',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Importar: pôr o rascunho na fila, que grava as linhas sem erro',
        params: ParametrosDaImportacao,
        response: { 202: Importacao, 503: RespostaDeProblema, ...PROBLEMAS_DA_IMPORTACAO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      if (!fila?.rodando()) throw filaIndisponivel();
      const orgId = requisicao.organizacao?.id ?? '';
      const importacao = await naOrganizacao(banco, orgId, async (tx) => {
        const linha = await lerImportacao(tx, requisicao.params.id, sessao.contaId, {
          travar: true,
        });
        if (linha.situacao !== 'rascunho') throw conflito(NAO_E_RASCUNHO);
        const campos = camposOferecidos(await tipoDa(tx, linha), sessao.acesso);
        const conferido = conferirMapeamento(linha.mapeamento, linha.colunas.length, campos);
        if (!conferido.ok) throw dadosInvalidos(conferido.erros);
        const momento = agora();
        const [gravada] = await tx
          .update(importacoes)
          .set({ situacao: 'na-fila', aplicadaEm: momento, atualizadaEm: momento })
          .where(eq(importacoes.id, linha.id))
          .returning();
        await registrarNaAuditoria(tx, {
          acao: 'importacao.aplicada',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'importacao', id: linha.id },
          dados: { tipo: linha.tipoNome, arquivo: linha.nomeDoArquivo, linhas: linha.linhas },
          origem: origemDa(requisicao),
          momento,
          saida: { publico: publicoDaImportacao(linha) },
        });
        await fila.enviar(
          TAREFA_DA_IMPORTACAO,
          { orgId, importacaoId: linha.id },
          { tx, chaveUnica: linha.id },
        );
        return importacaoNaResposta({ ...linha, ...gravada }, campos);
      });
      return resposta.code(202).send(importacao);
    },
  );

  app.get(
    '/ativos/importacoes/:id/erros',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'As linhas que a aplicação não gravou, com as recusas, pelo número da linha',
        params: ParametrosDaImportacao,
        querystring: FiltrosDasImportacoes,
        response: { 200: ErrosDaImportacao, ...PROBLEMAS_DA_IMPORTACAO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const { cursor, limite } = requisicao.query;
      const depoisDe = cursor ? decodificarCursor(cursor, ChaveDaLinha)[0] : 0;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linha = await lerImportacao(tx, requisicao.params.id, sessao.contaId);
        const linhas = await tx
          .select({ linha: errosDaImportacao.linha, mensagens: errosDaImportacao.mensagens })
          .from(errosDaImportacao)
          .where(
            and(
              eq(errosDaImportacao.importacaoId, linha.id),
              gt(errosDaImportacao.linha, depoisDe),
            ),
          )
          .orderBy(asc(errosDaImportacao.linha))
          .limit(limite + 1);
        const { linhas: itens, proximo } = pagina(linhas, limite, (erro) => [erro.linha]);
        return { itens, proximo };
      });
    },
  );

  app.delete(
    '/ativos/importacoes/:id',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Descartar o rascunho, com o conteúdo da planilha',
        params: ParametrosDaImportacao,
        response: { 204: z.null(), ...PROBLEMAS_DA_IMPORTACAO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linha = await lerImportacao(tx, requisicao.params.id, sessao.contaId, {
          travar: true,
        });
        if (linha.situacao !== 'rascunho') throw conflito(NAO_E_RASCUNHO);
        await tx
          .update(importacoes)
          .set({ situacao: 'descartada', conteudo: null, atualizadaEm: agora() })
          .where(eq(importacoes.id, linha.id));
        await avisarQuemImportou(tx, linha);
      });
      return resposta.code(204).send(null);
    },
  );
};

/**
 * O corpo do envio da planilha: os bytes, até 10 MiB, só com a sessão que vale. O resto é recusado
 * como formato não aceito, e o corpo grande demais, como a planilha que passa de 10 MB. Vale para o
 * plugin inteiro: o envio fica num plugin só dele.
 */
function aceitarPlanilhas(app: FastifyInstance) {
  app.addHook('onRequest', async (requisicao) => {
    if (requisicao.method !== 'GET') await exigirAtiva(requisicao);
  });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: LIMITE_DA_PLANILHA },
    (_requisicao: FastifyRequest, corpo: Buffer, pronto: (erro: null, corpo: Buffer) => void) =>
      pronto(null, corpo),
  );
  app.setErrorHandler((erro: FastifyError) => {
    if (erro.code === 'FST_ERR_CTP_BODY_TOO_LARGE') throw planilhaPesadaDemais();
    if (erro.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') throw planilhaNaoAceita();
    throw erro;
  });
}

/** O envio da planilha, que cria o rascunho com as colunas sugeridas pelos títulos. */
export const rotasDoEnvioDaPlanilha: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  aceitarPlanilhas(app);

  app.post(
    '/ativos/importacoes',
    {
      config: { permissao: 'ativos.editar' },
      schema: {
        summary: 'Enviar a planilha de um tipo de ativo, em XLSX ou CSV, e criar o rascunho',
        querystring: EnvioDaPlanilha,
        consumes: ['application/octet-stream'],
        body: BytesDoArquivo,
        response: {
          201: Importacao,
          413: RespostaDeProblema,
          415: RespostaDeProblema,
          ...PROBLEMAS_DA_IMPORTACAO,
        },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const { tipoId, nome = '' } = requisicao.query;
      const planilha = lerPlanilha(requisicao.body);
      const nomeDoArquivoLido = nomeDoArquivo(nome, extensaoDaPlanilha(requisicao.body));
      const importacao = await naOrganizacao(
        banco,
        requisicao.organizacao?.id ?? '',
        async (tx) => {
          const tipo = await lerTipoDaImportacao(tx, tipoId.toLowerCase());
          if (!tipo) throw dadosInvalidos({ tipoId: 'Tipo de ativo não encontrado.' });
          if (tipo.situacao === 'inativo') {
            const motivo = `O tipo ${tipo.nome} está inativo.`;
            throw conflito(motivo, { tipoId: motivo });
          }
          const campos = camposOferecidos(tipo, sessao.acesso);
          const momento = agora();
          const [criada] = await tx
            .insert(importacoes)
            .values({
              orgId: sql`app.current_org()`,
              criadaPor: sessao.contaId,
              tipoId: tipo.id,
              nomeDoArquivo: nomeDoArquivoLido,
              colunas: planilha.titulos,
              conteudo: planilha.linhas,
              linhas: planilha.linhas.length,
              mapeamento: sugerirColunas(planilha.titulos, campos),
              criadaEm: momento,
              atualizadaEm: momento,
            })
            .returning();
          if (!criada) throw new Error('A importação não foi gravada.');
          await avisarQuemImportou(tx, criada);
          return importacaoNaResposta({ ...criada, tipoNome: tipo.nome }, campos);
        },
      );
      return resposta.code(201).send(importacao);
    },
  );
};
