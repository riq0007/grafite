// As solicitações dos testes da web (spec solicitacoes e modulo-operacao; change p4d-solicitacoes):
// uma de cada tipo, como a API as devolve, registradas há 3 dias, e o servidor da lista, que filtra,
// busca e pagina como a API e muda a situação em lote pelas regras do domínio.
import type { components } from '@grafite/api-client';
import {
  normalizarTexto,
  type RecusaDaSituacao,
  recusaDaSituacao,
  SITUACOES_PENDENTES,
  type SituacaoDeDestino,
  textoDoLote,
} from '@grafite/domain';
import { vi } from 'vitest';
import type { ServidorDeTeste } from './sessao.ts';

export type SolicitacaoDeTeste = components['schemas']['Solicitacao'];

const DIA = 24 * 60 * 60 * 1000;

/** O momento de alguns dias atrás, em ISO 8601. */
export const haDias = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();

export const EXPEDICAO = { id: 'expedicao', caminho: 'Jundiaí › Expedição' };
export const ALMOXARIFADO = { id: 'almoxarifado', caminho: 'Jundiaí › Almoxarifado' };

export const PAT00412 = {
  id: 'pat00412',
  rotulo: 'HP LaserJet M404',
  patrimonio: 'PAT-00412',
  abrir: true,
};
export const NB0031 = {
  id: 'nb0031',
  rotulo: 'Dell Latitude 5440',
  patrimonio: 'NB-0031',
  abrir: true,
};
export const CF258A = { id: 'cf258a', codigo: 'CF258A', nome: 'HP 58A', abrir: true };

function solicitacao(numero: number, extras: Partial<SolicitacaoDeTeste>): SolicitacaoDeTeste {
  return {
    id: `s${numero}`,
    numero,
    tipo: 'toner',
    situacao: 'aberta',
    pessoa: { id: 'joana', nome: 'Joana Prado' },
    observacao: null,
    locais: [EXPEDICAO],
    semLocal: false,
    impressoras: [],
    ativo: null,
    defeito: null,
    tipoDeAtivo: null,
    quantidade: null,
    motivo: null,
    local: null,
    fornecedor: null,
    osDoFornecedor: null,
    oQueFoiFeito: null,
    motivoDoCancelamento: null,
    registradaPor: { id: 'carla', nome: 'Carla Dias' },
    registradaEm: haDias(3),
    encerradaPor: null,
    encerradaEm: null,
    permite: { atender: true },
    ordem: null,
    ...extras,
  };
}

/** O toner de 1 preto da PAT-00412, com o CF258A sugerido. */
export const toner = (numero: number, extras: Partial<SolicitacaoDeTeste> = {}) =>
  solicitacao(numero, {
    tipo: 'toner',
    impressoras: [
      {
        ativo: PAT00412,
        contador: { paginas: 48210, lidoEm: haDias(3) },
        itens: [
          { id: `i${numero}`, cor: 'preto', quantidade: 1, consumivel: CF258A, entrega: null },
        ],
      },
    ],
    ...extras,
  });

/** O conserto do NB-0031, que não liga. */
export const conserto = (numero: number, extras: Partial<SolicitacaoDeTeste> = {}) =>
  solicitacao(numero, { tipo: 'conserto', ativo: NB0031, defeito: 'Não liga', ...extras });

/** O equipamento: 2 notebooks para a Expedição. */
export const equipamento = (numero: number, extras: Partial<SolicitacaoDeTeste> = {}) =>
  solicitacao(numero, {
    tipo: 'equipamento',
    tipoDeAtivo: { id: 'notebook', nome: 'Notebook' },
    quantidade: 2,
    motivo: 'Contratação',
    local: EXPEDICAO,
    ...extras,
  });

/** O que a busca da API acha numa solicitação: o número, quem pediu, os ativos e a OS. */
const textoDaBusca = (s: SolicitacaoDeTeste) =>
  normalizarTexto(
    [
      String(s.numero),
      s.pessoa.nome,
      ...s.impressoras.map(({ ativo }) => ativo.patrimonio ?? ativo.rotulo),
      s.ativo?.patrimonio ?? '',
      s.osDoFornecedor ?? '',
    ].join(' '),
  );

/**
 * O servidor das solicitações: a lista filtra a situação (as pendentes por padrão), o tipo e a
 * busca e pagina de `porPagina` em `porPagina`; o lote muda a situação de cada uma pelas regras do
 * domínio e responde o retorno da API.
 */
export function servidorDasSolicitacoes(
  inicial: SolicitacaoDeTeste[],
  { porPagina = 50 }: { porPagina?: number } = {},
) {
  const estado = { solicitacoes: [...inicial] };
  const pedidos: URLSearchParams[] = [];
  const lotes: { numeros: number[]; situacao: SituacaoDeDestino; motivo?: string }[] = [];
  const lista = vi.fn((pedido: Request) => {
    const parametros = new URL(pedido.url).searchParams;
    pedidos.push(parametros);
    const situacao = parametros.get('situacao') ?? 'pendentes';
    const tipo = parametros.get('tipo');
    const palavras = normalizarTexto(parametros.get('busca') ?? '')
      .split(' ')
      .filter(Boolean);
    const todas = estado.solicitacoes.filter(
      (s) =>
        (situacao === 'todas' ||
          (situacao === 'pendentes'
            ? (SITUACOES_PENDENTES as readonly string[]).includes(s.situacao)
            : s.situacao === situacao)) &&
        (!tipo || s.tipo === tipo) &&
        palavras.every((palavra) => textoDaBusca(s).includes(palavra)),
    );
    const inicio = Number(parametros.get('cursor') ?? 0);
    const tamanho = Math.min(Number(parametros.get('limite') ?? porPagina), porPagina);
    return Response.json({
      itens: todas.slice(inicio, inicio + tamanho),
      total: todas.length,
      proximo: inicio + tamanho < todas.length ? String(inicio + tamanho) : null,
    });
  });
  const lote = vi.fn(async (pedido: Request) => {
    const corpo = (await pedido.json()) as (typeof lotes)[number];
    lotes.push(corpo);
    let mudaram = 0;
    const recusadas: { numero: number; recusa: RecusaDaSituacao }[] = [];
    for (const numero of corpo.numeros) {
      const atual = estado.solicitacoes.find((s) => s.numero === numero);
      const recusa: RecusaDaSituacao | null = atual
        ? recusaDaSituacao({
            tipo: atual.tipo,
            atual: atual.situacao,
            nova: corpo.situacao,
            noLote: true,
            comFornecedor: atual.fornecedor !== null,
          })
        : { motivo: 'nao-encontrada' };
      if (recusa || !atual) {
        recusadas.push({ numero, recusa: recusa ?? { motivo: 'nao-encontrada' } });
        continue;
      }
      estado.solicitacoes = estado.solicitacoes.map((s) =>
        s.numero === numero ? { ...s, situacao: corpo.situacao } : s,
      );
      mudaram += 1;
    }
    return Response.json({
      mudaram,
      recusadas: recusadas.map(({ numero }) => ({ numero, mensagem: `A ${numero} não mudou.` })),
      texto: textoDoLote({ mudaram, recusadas }),
    });
  });
  const servidor: ServidorDeTeste = {
    'GET /api/solicitacoes': lista,
    'POST /api/solicitacoes/situacao': lote,
    'GET /api/locais': () => Response.json({ locais: [] }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  return { servidor, estado, lista, lote, pedidos, lotes };
}
