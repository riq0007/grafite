// As ordens de serviço dos testes da web (spec ordens-de-servico e modulo-operacao; change
// p4e-ordens-de-servico): a OS do NB-0031, como a API a devolve, aberta há 3 dias por Carla, e o
// servidor das OS, que filtra, busca e pagina como a API e muda a situação em lote pelas regras do
// domínio.
import type { components } from '@grafite/api-client';
import {
  acaoDoLoteDasOrdens,
  normalizarTexto,
  type RecusaNaOrdem,
  recusaNaOrdem,
  SITUACOES_EM_ABERTO,
  type SituacaoDoLoteDasOrdens,
  situacaoDepoisDaAcao,
  textoDoLoteDasOrdens,
} from '@grafite/domain';
import { vi } from 'vitest';
import type { ServidorDeTeste } from './sessao.ts';
import { EXPEDICAO, haDias, NB0031 } from './solicitacoes.ts';

export type OrdemDeTeste = components['schemas']['OrdemDeServico'];

export const CARLA = { id: 'carla', nome: 'Carla Dias' };

/** A OS do NB-0031, Aberta há 3 dias por Carla, com o problema "Não liga". */
export function ordem(numero: number, extras: Partial<OrdemDeTeste> = {}): OrdemDeTeste {
  const abertaEm = haDias(3);
  return {
    id: `o${numero}`,
    numero,
    situacao: 'aberta',
    ativo: NB0031,
    local: EXPEDICAO,
    solicitacao: null,
    problema: 'Não liga',
    fornecedor: null,
    osDoFornecedor: null,
    solucao: null,
    motivoDoEncerramento: null,
    abertaPor: CARLA,
    abertaEm,
    resolvidaPor: null,
    resolvidaEm: null,
    encerradaPor: null,
    encerradaEm: null,
    historico: [
      {
        id: `h${numero}-aberta`,
        situacao: 'aberta',
        texto: null,
        fornecedor: null,
        mudadaPor: CARLA,
        mudadaEm: abertaEm,
      },
    ],
    pecas: [],
    permite: { atender: true },
    ...extras,
  };
}

/** A OS resolvida há 1 dia, com "Fonte trocada". */
export const resolvida = (numero: number, extras: Partial<OrdemDeTeste> = {}) => {
  const base = ordem(numero);
  return ordem(numero, {
    situacao: 'resolvida',
    solucao: 'Fonte trocada',
    resolvidaPor: CARLA,
    resolvidaEm: haDias(1),
    historico: [
      {
        id: `h${numero}-resolvida`,
        situacao: 'resolvida',
        texto: 'Fonte trocada',
        fornecedor: null,
        mudadaPor: CARLA,
        mudadaEm: haDias(1),
      },
      ...base.historico,
    ],
    ...extras,
  });
};

/** O que a busca da API acha numa OS: o número, o ativo, o problema e a OS do fornecedor. */
const textoDaBusca = (o: OrdemDeTeste) =>
  normalizarTexto(
    [
      String(o.numero),
      o.ativo.patrimonio ?? o.ativo.rotulo,
      o.problema,
      o.osDoFornecedor ?? '',
    ].join(' '),
  );

/**
 * O servidor das OS: a lista filtra a situação (as em aberto por padrão) e a busca e pagina de
 * `porPagina` em `porPagina`; o lote muda a situação de cada uma pelas regras do domínio e responde
 * o retorno da API.
 */
export function servidorDasOrdens(
  inicial: OrdemDeTeste[],
  { porPagina = 50 }: { porPagina?: number } = {},
) {
  const estado = { ordens: [...inicial] };
  const pedidos: URLSearchParams[] = [];
  const lotes: { numeros: number[]; situacao: SituacaoDoLoteDasOrdens }[] = [];
  const lista = vi.fn((pedido: Request) => {
    const parametros = new URL(pedido.url).searchParams;
    pedidos.push(parametros);
    const situacao = parametros.get('situacao') ?? 'em-aberto';
    const palavras = normalizarTexto(parametros.get('busca') ?? '')
      .split(' ')
      .filter(Boolean);
    const todas = estado.ordens.filter(
      (o) =>
        (situacao === 'todas' ||
          (situacao === 'em-aberto'
            ? (SITUACOES_EM_ABERTO as readonly string[]).includes(o.situacao)
            : o.situacao === situacao)) &&
        palavras.every((palavra) => textoDaBusca(o).includes(palavra)),
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
    const acao = acaoDoLoteDasOrdens(corpo.situacao);
    let mudaram = 0;
    const recusadas: { numero: number; recusa: RecusaNaOrdem }[] = [];
    for (const numero of corpo.numeros) {
      const atual = estado.ordens.find((o) => o.numero === numero);
      const recusa: RecusaNaOrdem | null = atual
        ? recusaNaOrdem(atual.situacao, acao)
        : { motivo: 'nao-encontrada' };
      if (recusa || !atual) {
        recusadas.push({ numero, recusa: recusa ?? { motivo: 'nao-encontrada' } });
        continue;
      }
      estado.ordens = estado.ordens.map((o) =>
        o.numero === numero ? { ...o, situacao: situacaoDepoisDaAcao(acao) } : o,
      );
      mudaram += 1;
    }
    return Response.json({
      mudaram,
      recusadas: recusadas.map(({ numero }) => ({ numero, mensagem: `A ${numero} não mudou.` })),
      texto: textoDoLoteDasOrdens({ mudaram, recusadas }),
    });
  });
  const servidor: ServidorDeTeste = {
    'GET /api/ordens': lista,
    'POST /api/ordens/situacao': lote,
    'GET /api/locais': () => Response.json({ locais: [] }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  return { servidor, estado, lista, lote, pedidos, lotes };
}
