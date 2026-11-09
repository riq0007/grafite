// As importações simuladas na página, em memória (design do P1e), sobre os ativos simulados
// (api-dos-ativos.ts): o envio de um CSV simples, com as colunas sugeridas pelo domínio, a escolha
// das colunas, a prévia pela regra da linha do domínio, a aplicação, que grava nos ativos simulados
// com a origem "planilha" e conclui na hora, e as linhas com erro. A tela só vê a conclusão quando o
// teste empurra o evento, como a API de verdade avisa pela fila. Registrada depois dos ativos, ela
// responde as importações, e o resto passa adiante.
import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import {
  type AtivoAtual,
  type AtivoNoIndice,
  type Celula,
  type ContextoDaLinha,
  camposDaImportacao,
  camposDoAtivo,
  conferirMapeamento,
  criarCasamento,
  criarReferencias,
  identificacaoDaLinha,
  montarArvore,
  type PlanoDaLinha,
  planejarLinha,
  registrarGravacao,
  rotuloDoAtivo,
  sugerirColunas,
} from '@grafite/domain';
import type { Page } from '@playwright/test';
import { LOCAIS, PESSOAS, type simularAtivos } from './api-dos-ativos.ts';
import { SESSAO } from './fixtures.ts';

type Esquemas = components['schemas'];
type Importacao = Esquemas['Importacao'];
type ApiDosAtivos = Awaited<ReturnType<typeof simularAtivos>>;

interface ImportacaoGuardada {
  id: string;
  nomeDoArquivo: string;
  tipoId: string;
  situacao: Importacao['situacao'];
  colunas: string[];
  conteudo: { linha: number; celulas: Celula[] }[] | null;
  linhas: number;
  mapeamento: (string | null)[];
  processadas: number;
  totais: Importacao['totais'];
  erros: { linha: number; mensagens: PlanoDaLinha['erros'] }[];
  criadaEm: string;
  aplicadaEm: string | null;
  concluidaEm: string | null;
}

const MOMENTO = '2026-10-12T12:00:00.000Z';
const ZERADOS = { novos: 0, alterados: 0, semMudanca: 0, comErro: 0 };
const TOTAL_DA_ACAO = {
  novo: 'novos',
  alterar: 'alterados',
  'sem-mudanca': 'semMudanca',
  'com-erro': 'comErro',
} as const;

const problema = (status: number, detalhe: string, campos?: Record<string, string>) => ({
  status,
  json: {
    type: 'urn:grafite:problema:conflito',
    title: detalhe,
    status,
    detail: detalhe,
    codigoDeRastreio: 'T5EX-2E2E',
    ...(campos && { campos }),
  },
});

/** O CSV simples dos testes: UTF-8, ponto e vírgula, uma linha por registro. */
function lerCsv(conteudo: Buffer) {
  const registros = conteudo
    .toString('utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((texto, posicao) => ({ linha: posicao + 1, celulas: texto.split(';') }))
    .filter(({ celulas }) => celulas.some((celula) => celula.trim() !== ''));
  const [titulos, ...linhas] = registros;
  return {
    colunas: (titulos?.celulas ?? []).map((titulo) => titulo.trim()),
    linhas: linhas.map(({ linha, celulas }) => ({
      linha,
      celulas: celulas.map((celula) => (celula.trim() === '' ? null : celula.trim())),
    })),
  };
}

/** Liga as importações simuladas à página, sobre os ativos simulados. */
export async function simularImportacoes(pagina: Page, ativos: ApiDosAtivos) {
  const importacoes: ImportacaoGuardada[] = [];
  const arvore = montarArvore(LOCAIS);
  const conta = SESSAO.sessao.conta.id;

  const tipoDe = (tipoId: string) => ativos.catalogo.tipos.find((tipo) => tipo.id === tipoId);
  const definicoesDe = (tipoId: string) =>
    camposDoAtivo({
      tipo: tipoDe(tipoId) ?? { capacidades: [], campos: [] },
      campos: ativos.catalogo.campos,
    });
  const camposDe = (tipoId: string) =>
    camposDaImportacao(definicoesDe(tipoId), { restritos: true });
  const modeloDe = (modeloId: string | null) =>
    ativos.catalogo.modelos.find((modelo) => modelo.id === modeloId);

  const rotuloDe = (ativo: ApiDosAtivos['ativos'][number]) =>
    rotuloDoAtivo({
      nome: (ativo.valores['ativo.nome'] as string | undefined) ?? null,
      modelo: modeloDe(ativo.modeloId) ?? null,
      tipo: tipoDe(ativo.tipoId) ?? { nome: 'Ativo' },
    });

  const texto = (valor: unknown) => (typeof valor === 'string' ? valor : null);

  /** O plano de cada linha, como a API faz, com o ativo novo de cada uma no casamento das seguintes. */
  function planejar(importacao: ImportacaoGuardada): PlanoDaLinha[] {
    const tipo = tipoDe(importacao.tipoId);
    const indice: AtivoNoIndice[] = ativos.ativos.map((ativo) => ({
      id: ativo.id,
      tipoId: ativo.tipoId,
      tipo: tipoDe(ativo.tipoId)?.nome ?? 'Ativo',
      nome: rotuloDe(ativo),
      situacao: ativo.situacao,
      patrimonio: texto(ativo.valores['ativo.patrimonio']),
      serie: texto(ativo.valores['ativo.serie']),
      hostname: texto(ativo.valores['ativo.hostname']),
    }));
    const casamento = criarCasamento(indice, importacao.tipoId);
    const contexto: ContextoDaLinha = {
      definicoes: definicoesDe(importacao.tipoId),
      mapeamento: importacao.mapeamento,
      referencias: criarReferencias({
        locais: LOCAIS.map(({ id, paiId, nome, tipo, situacao }) => ({
          id,
          paiId,
          nome,
          tipo,
          situacao,
        })),
        pessoas: PESSOAS.map((pessoa) => ({ ...pessoa, email: null, matricula: null })),
        modelos: ativos.catalogo.modelos.filter(
          (modelo) => modelo.tipoId === importacao.tipoId && modelo.situacao === 'ativo',
        ),
      }),
      casamento,
      nomeDoTipo: (id) => tipoDe(id)?.nome,
      nomeDoRegistro: (id) => {
        if (arvore.local(id)) return arvore.caminho(id);
        const pessoa = PESSOAS.find((uma) => uma.id === id);
        if (pessoa) return pessoa.nome;
        const modelo = modeloDe(id);
        if (modelo) return `${modelo.fabricante} ${modelo.nome}`;
        const ativo = ativos.ativos.find((um) => um.id === id);
        return ativo ? rotuloDe(ativo) : undefined;
      },
      caminhoDoLocal: (id) => arvore.caminho(id),
      acesso: { editaEm: () => true, restritosEm: () => true },
    };
    return (importacao.conteudo ?? []).map(({ linha, celulas }) => {
      const casado = casamento.casar(linha, identificacaoDaLinha(celulas, importacao.mapeamento));
      const guardado =
        casado.tipo === 'casado' ? ativos.ativos.find((um) => um.id === casado.ativo.id) : null;
      const atual: AtivoAtual | null = guardado
        ? {
            id: guardado.id,
            localId: texto(guardado.valores['ativo.local']),
            modeloId: guardado.modeloId,
            valores: guardado.valores,
            estado: guardado.estado,
          }
        : null;
      const plano = planejarLinha(linha, celulas, casado, atual, contexto);
      if (plano.acao === 'novo') {
        casamento.acrescentar(linha, {
          id: `linha-${linha}`,
          tipoId: importacao.tipoId,
          tipo: tipo?.nome ?? 'Ativo',
          nome: tipo?.nome ?? 'Ativo',
          situacao: 'ativo',
          patrimonio: texto(plano.pedido.valores['ativo.patrimonio']),
          serie: texto(plano.pedido.valores['ativo.serie']),
          hostname: texto(plano.pedido.valores['ativo.hostname']),
        });
      }
      return plano;
    });
  }

  /** Grava os planos nos ativos simulados, com a origem "planilha", e conclui a importação. */
  function aplicar(importacao: ImportacaoGuardada) {
    const totais = { ...ZERADOS };
    for (const plano of planejar(importacao)) {
      totais[TOTAL_DA_ACAO[plano.acao]] += 1;
      if (plano.acao === 'com-erro') {
        importacao.erros.push({ linha: plano.linha, mensagens: plano.erros });
        continue;
      }
      const chaves = [
        ...Object.keys(plano.pedido.valores),
        ...(plano.pedido.modeloId ? ['ativo.modelo'] : []),
      ];
      const gravacao = { origem: 'planilha' as const, momento: MOMENTO, autorId: conta };
      if (plano.acao === 'novo') {
        ativos.ativos.push({
          id: randomUUID(),
          tipoId: importacao.tipoId,
          modeloId: plano.pedido.modeloId ?? null,
          valores: { 'ativo.uso': 'em-uso', ...plano.pedido.valores },
          estado: registrarGravacao({}, chaves, gravacao),
          situacao: 'ativo',
        });
      }
      const existente = ativos.ativos.find((um) => um.id === plano.ativoId);
      if (plano.acao === 'alterar' && existente) {
        Object.assign(existente.valores, plano.pedido.valores);
        if (plano.pedido.modeloId) existente.modeloId = plano.pedido.modeloId;
        existente.estado = registrarGravacao(existente.estado, chaves, gravacao);
      }
    }
    Object.assign(importacao, {
      situacao: 'concluida',
      conteudo: null,
      processadas: importacao.linhas,
      totais,
      concluidaEm: MOMENTO,
    });
  }

  const naLista = (importacao: ImportacaoGuardada) => ({
    id: importacao.id,
    nomeDoArquivo: importacao.nomeDoArquivo,
    tipo: { id: importacao.tipoId, nome: tipoDe(importacao.tipoId)?.nome ?? 'Ativo' },
    situacao: importacao.situacao,
    linhas: importacao.linhas,
    processadas: importacao.processadas,
    totais: importacao.totais,
    criadaEm: importacao.criadaEm,
    concluidaEm: importacao.concluidaEm,
  });

  const detalhe = (importacao: ImportacaoGuardada): Importacao => ({
    ...naLista(importacao),
    colunas: importacao.colunas.map((titulo, posicao) => ({
      titulo,
      campo: importacao.mapeamento[posicao] ?? null,
      exemplos: [
        ...new Set(
          (importacao.conteudo ?? [])
            .map(({ celulas }) => celulas[posicao])
            .filter((celula): celula is string | number => celula !== null && celula !== undefined)
            .map(String),
        ),
      ].slice(0, 3),
    })),
    campos: camposDe(importacao.tipoId),
    aplicadaEm: importacao.aplicadaEm,
  });

  function responder(
    metodo: string,
    caminho: string,
    busca: URLSearchParams,
    corpo: Record<string, unknown>,
    conteudo: Buffer,
  ): { status: number; json?: unknown } | null {
    if (metodo === 'POST' && caminho === '/ativos/importacoes') {
      const tipoId = busca.get('tipoId') ?? '';
      const { colunas, linhas } = lerCsv(conteudo);
      if (linhas.length === 0) return problema(400, 'A planilha não tem linhas para importar.');
      const importacao: ImportacaoGuardada = {
        id: randomUUID(),
        nomeDoArquivo: busca.get('nome') ?? 'planilha.csv',
        tipoId,
        situacao: 'rascunho',
        colunas,
        conteudo: linhas,
        linhas: linhas.length,
        mapeamento: sugerirColunas(colunas, camposDe(tipoId)),
        processadas: 0,
        totais: { ...ZERADOS },
        erros: [],
        criadaEm: MOMENTO,
        aplicadaEm: null,
        concluidaEm: null,
      };
      importacoes.unshift(importacao);
      return { status: 201, json: detalhe(importacao) };
    }
    if (metodo === 'GET' && caminho === '/ativos/importacoes') {
      return { status: 200, json: { itens: importacoes.map(naLista), proximo: null } };
    }
    const partes = /^\/ativos\/importacoes\/([^/]+)(?:\/(colunas|previa|aplicacao|erros))?$/.exec(
      caminho,
    );
    const importacao = importacoes.find((uma) => uma.id === partes?.[1]);
    if (!partes) return null;
    if (!importacao) return problema(404, 'Importação não encontrada.');
    const acao = partes[2];
    if (metodo === 'GET' && !acao) return { status: 200, json: detalhe(importacao) };
    if (metodo === 'PUT' && acao === 'colunas') {
      const colunas = corpo.colunas as (string | null)[];
      const conferido = conferirMapeamento(
        colunas,
        importacao.colunas.length,
        camposDe(importacao.tipoId),
      );
      if (!conferido.ok) return problema(400, 'Confira os campos indicados.', conferido.erros);
      importacao.mapeamento = colunas;
      return { status: 200, json: detalhe(importacao) };
    }
    if (metodo === 'GET' && acao === 'previa') {
      const planos = planejar(importacao);
      const totais = { ...ZERADOS };
      for (const plano of planos) totais[TOTAL_DA_ACAO[plano.acao]] += 1;
      const filtro = busca.get('acao');
      return {
        status: 200,
        json: {
          totais,
          linhas: planos
            .filter((plano) => !filtro || plano.acao === filtro)
            .map((plano) => {
              const ativo = ativos.ativos.find((um) => um.id === plano.ativoId);
              return {
                linha: plano.linha,
                acao: plano.acao,
                ativo: ativo
                  ? {
                      id: ativo.id,
                      rotulo: rotuloDe(ativo),
                      patrimonio: texto(ativo.valores['ativo.patrimonio']),
                    }
                  : null,
                mudancas: plano.mudancas.map(({ campo, antes, depois }) => ({
                  campo,
                  antes,
                  depois,
                })),
                seguros: plano.seguros.map(({ campo, motivo }) => ({ campo, motivo })),
                erros: plano.erros,
              };
            }),
          proximo: null,
        },
      };
    }
    if (metodo === 'POST' && acao === 'aplicacao') {
      importacao.aplicadaEm = MOMENTO;
      const naFila = { ...detalhe(importacao), situacao: 'na-fila' as const };
      aplicar(importacao);
      return { status: 202, json: naFila };
    }
    if (metodo === 'GET' && acao === 'erros') {
      return { status: 200, json: { itens: importacao.erros, proximo: null } };
    }
    if (metodo === 'DELETE' && !acao) {
      Object.assign(importacao, { situacao: 'descartada', conteudo: null });
      return { status: 204 };
    }
    return null;
  }

  await pagina.route(
    (url) => url.pathname.startsWith('/api/ativos/importacoes'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const metodo = pedido.method();
      const emJson = pedido.headers()['content-type']?.startsWith('application/json');
      const corpo = (metodo !== 'GET' && emJson && pedido.postDataJSON()) || {};
      const conteudo = (!emJson && pedido.postDataBuffer()) || Buffer.alloc(0);
      const resposta = responder(
        metodo,
        url.pathname.slice('/api'.length),
        url.searchParams,
        corpo,
        conteudo,
      );
      if (!resposta) return rota.fallback();
      if (resposta.status === 204) return rota.fulfill({ status: 204 });
      await rota.fulfill({
        status: resposta.status,
        contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
        body: JSON.stringify(resposta.json),
      });
    },
  );

  return { importacoes };
}
