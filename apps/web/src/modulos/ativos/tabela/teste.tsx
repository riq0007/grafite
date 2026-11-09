// O servidor e a tela da tabela dos ativos nos testes de componente: o catálogo com campos de
// cada tipo, os ativos, os locais e as pessoas, e a App inteira aberta num endereço.
import type { components } from '@grafite/api-client';
import type { AjustesDasPreferencias } from '@grafite/domain';
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

export type Ativo = components['schemas']['AtivoNaLista'];

export const IMPRESSORA = { id: 'impressora', nome: 'Impressora', icone: 'impressora' } as const;
export const SWITCH = { id: 'switch', nome: 'Switch', icone: 'switch' } as const;

export const IP = '7a1f5c2e-0b3d-4e8f-9a6b-1c2d3e4f5a6b';
export const DONO = '8b2a6d3f-1c4e-4f9a-8b7c-2d3e4f5a6b7c';
export const CUSTO = 'ad4c8f5b-3e6a-4b9c-8d9e-4f5a6b7c8d9e';
export const SENHA = 'be5d9a6c-4f7b-4c8d-9e8f-5a6b7c8d9e8f';
export const NOTA = 'cf6e0b7d-5a8c-4d9e-8f9a-6b7c8d9e0f1a';
export const FOTO = 'd07f1c8e-6b9d-4e0f-9a0b-7c8d9e0f1a2b';
/** O campo só do switch: com o filtro de Tipo na impressora, ele vai para "Outros tipos". */
export const PORTAS = 'e18a2d9f-7c0e-4f1a-8b2c-8d9e0f1a2b3c';

const campo = (id: string, rotulo: string, tipo: string, extras = {}) => ({
  id,
  rotulo,
  tipo,
  grupo: 'Rede',
  configuracao: {},
  restrito: false,
  escrita: 'manual',
  situacao: 'ativo',
  usadoPor: 1,
  permite: { editar: false },
  ...extras,
});

export const CAMPOS = [
  campo(IP, 'IP', 'ip'),
  campo(DONO, 'Dono', 'pessoa', { grupo: null }),
  campo(CUSTO, 'Custo', 'moeda', { grupo: null }),
  campo(SENHA, 'Senha do BIOS', 'texto', { grupo: null, restrito: true }),
  campo(NOTA, 'PDF da nota fiscal', 'arquivo', { grupo: null }),
  campo(FOTO, 'Foto da etiqueta', 'imagem', { grupo: null }),
  campo(PORTAS, 'Portas', 'inteiro', { grupo: 'Rede' }),
];

export const ativo = (id: string, rotulo: string, extras: Partial<Ativo> = {}): Ativo => ({
  id,
  rotulo,
  tipo: IMPRESSORA,
  modelo: null,
  imagem: null,
  patrimonio: null,
  serie: null,
  hostname: null,
  local: null,
  responsavel: null,
  uso: 'em-uso',
  situacao: 'ativo',
  criadoEm: '2026-10-09T12:00:00.000Z',
  atualizadoEm: '2026-10-09T12:00:00.000Z',
  valores: {},
  permite: { editar: true, verRestritos: true, verResponsavel: true },
  ...extras,
});

export const M404 = ativo('a1', 'HP LaserJet M404', {
  modelo: { id: 'm404', fabricante: 'HP', nome: 'LaserJet M404', imagem: { id: 'img-1' } },
  patrimonio: 'PAT-00412',
  local: { id: 'expedicao', caminho: 'Jundiaí › Expedição' },
  valores: {
    [IP]: '10.0.0.12',
    [DONO]: 'bruno',
    [CUSTO]: 1500.5,
    [SENHA]: 'segredo',
    [NOTA]: 'f-nf',
    [FOTO]: 'f-et',
  },
});
export const RH = ativo('a2', 'Impressora do RH', {
  uso: 'em-manutencao',
  permite: { editar: true, verRestritos: false, verResponsavel: true },
});

/** Os locais, pelo id: o filtro "Em" só vale com o id de um local. */
export const JUNDIAI = '5f0c2a1e-8d3b-4c7a-9e6f-1a2b3c4d5e6f';
export const EXPEDICAO = '6a1d3b2f-9e4c-4d8b-8f7a-2b3c4d5e6f7a';

export const LOCAIS = {
  locais: [
    { id: JUNDIAI, paiId: null, nome: 'Jundiaí', tipo: 'unidade', situacao: 'ativo' },
    { id: EXPEDICAO, paiId: JUNDIAI, nome: 'Expedição', tipo: 'setor', situacao: 'ativo' },
  ].map((local) => ({ ...local, permite: { editar: true } })),
  permite: { cadastrarNaRaiz: true },
};

export const REFERENCIAS = {
  pessoas: { bruno: 'Bruno Lima' },
  locais: {},
  ativos: {},
  arquivos: {
    'f-nf': { nome: 'nota-fiscal-1234.pdf', bytes: 240 * 1024, tipo: 'application/pdf' },
    'f-et': { nome: 'etiqueta.png', bytes: 18 * 1024, tipo: 'image/png' },
  },
  modelos: {},
  tiposDosModelos: {},
};

/** Os modelos que a busca do filtro de Modelo acha: o da impressora e um computador. */
export const MODELOS = [
  { id: 'm404', fabricante: 'HP', nome: 'LaserJet M404', tipo: IMPRESSORA },
  {
    id: 'optiplex',
    fabricante: 'Dell',
    nome: 'OptiPlex 7010',
    tipo: { id: 'computador', nome: 'Computador', icone: 'computador' },
  },
];

/** As contagens de cada coluna de escolha, como a API as dá para os dois ativos. */
export const CONTAGENS: Record<string, { valor: string; quantos: number }[]> = {
  'ativo.tipo': [{ valor: 'impressora', quantos: 2 }],
};

export const lista = (itens: Ativo[], proximo: string | null = null, total = itens.length) =>
  Response.json({ itens, proximo, total, referencias: REFERENCIAS, permite: { cadastrar: true } });

/** O que a tabela guardou na conta: as mudanças sobre uma visão, ou a visão restaurada. */
export type GravacaoNaConta =
  | { metodo: 'PUT'; visao: string; definicao: Record<string, unknown> }
  | { metodo: 'DELETE'; visao: string };

/** As colunas, pela chave, da última gravação das mudanças na conta. */
export function colunasGuardadas(gravacoes: GravacaoNaConta[]) {
  const ultima = gravacoes.at(-1);
  if (ultima?.metodo !== 'PUT') return undefined;
  return (ultima.definicao.colunas as { chave: string }[]).map((coluna) => coluna.chave);
}

export function servidorDeAtivos(
  responder: (parametros: URLSearchParams) => Response = () => lista([M404, RH]),
) {
  const pedidos: URLSearchParams[] = [];
  const contagens: URLSearchParams[] = [];
  const buscasDeModelos: URLSearchParams[] = [];
  const gravacoes: GravacaoNaConta[] = [];
  const mudancas = new Map<string, { visao: string; definicao: unknown; atualizadaEm: string }>();
  const servidor: ServidorDeTeste = {
    'GET /api/ativos': (pedido) => {
      const parametros = new URL(pedido.url).searchParams;
      pedidos.push(parametros);
      return responder(parametros);
    },
    'GET /api/tipos-de-ativo': () =>
      Response.json({
        tipos: [
          {
            ...IMPRESSORA,
            capacidades: [],
            campos: CAMPOS.filter((um) => um.id !== PORTAS).map((um) => ({
              campoId: um.id,
              obrigatorio: false,
            })),
            situacao: 'ativo',
            permite: { editar: false },
          },
          {
            ...SWITCH,
            capacidades: [],
            campos: [{ campoId: PORTAS, obrigatorio: false }],
            situacao: 'ativo',
            permite: { editar: false },
          },
        ],
        permite: { cadastrar: false },
      }),
    'GET /api/ativos/contagens': (pedido) => {
      const parametros = new URL(pedido.url).searchParams;
      contagens.push(parametros);
      const coluna = parametros.get('coluna') ?? '';
      const opcoes = CONTAGENS[coluna] ?? [];
      const total = opcoes.reduce((soma, opcao) => soma + opcao.quantos, 0);
      return Response.json({ coluna, total, opcoes });
    },
    'GET /api/modelos': (pedido) => {
      const parametros = new URL(pedido.url).searchParams;
      buscasDeModelos.push(parametros);
      const tipos = parametros.get('tipos')?.split(',');
      const itens = MODELOS.filter((modelo) => !tipos || tipos.includes(modelo.tipo.id)).map(
        (modelo) => ({ ...modelo, imagem: null, situacao: 'ativo', permite: { editar: false } }),
      );
      return Response.json({
        itens,
        proximo: null,
        total: itens.length,
        permite: { cadastrar: false },
      });
    },
    'GET /api/campos': () => Response.json({ campos: CAMPOS, permite: { cadastrar: false } }),
    'GET /api/visoes': () =>
      Response.json({
        visoes: [],
        mudancas: [...mudancas.values()],
        permite: { compartilhar: false },
      }),
    'PUT /api/visoes/mudancas': async (pedido) => {
      const { visao, definicao } = await pedido.json();
      gravacoes.push({ metodo: 'PUT', visao, definicao });
      const guardadas = { visao, definicao, atualizadaEm: new Date().toISOString() };
      mudancas.set(visao, guardadas);
      return Response.json(guardadas);
    },
    'DELETE /api/visoes/mudancas': (pedido) => {
      const visao = new URL(pedido.url).searchParams.get('visao') ?? '';
      gravacoes.push({ metodo: 'DELETE', visao });
      mudancas.delete(visao);
      return new Response(null, { status: 204 });
    },
    'GET /api/locais': () => Response.json(LOCAIS),
    'GET /api/pessoas/nomes': () =>
      Response.json({ pessoas: [{ id: 'bruno', nome: 'Bruno Lima' }] }),
  };
  return { servidor, pedidos, gravacoes, contagens, buscasDeModelos };
}

export function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('ativos.editar', 'ativos.ver', 'ativos.restritos'),
  canal: CanalDeEventos = criarCanalDeEventos(),
  /** As preferências que a conta mudou, como as visões fixadas. */
  preferencias: AjustesDasPreferencias = {},
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor, preferencias)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

export const tabela = () => screen.findByRole('grid', { name: 'Ativos' });

export const cabecalhos = async () =>
  within(await tabela())
    .getAllByRole('columnheader')
    .map(
      (coluna) =>
        coluna.querySelector('[class*="rotuloDaColuna"], [class*="somenteLeitor"]')?.textContent,
    );

/** As linhas do corpo à vista agora, sem esperar a tabela acabar de carregar. */
export const linhasAgora = (grade: HTMLElement) =>
  within(grade)
    .getAllByRole('row')
    .filter((linha) => !linha.querySelector('[role="columnheader"]'));

/** As linhas do corpo, depois de a tabela acabar de carregar: sem o esqueleto. */
export async function linhas() {
  const grade = await tabela();
  await waitFor(() => expect(grade.getAttribute('aria-busy')).toBeNull());
  return linhasAgora(grade);
}

export const celula = (linha: HTMLElement | undefined, indice: number) =>
  (linha as HTMLElement).querySelectorAll('[role="gridcell"], [role="rowheader"]')[
    indice
  ] as HTMLElement;
