import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { CARLA, type OrdemDeTeste, ordem, servidorDasOrdens } from '../../../teste/ordens.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { EXPEDICAO, haDias, NB0031 } from '../../../teste/solicitacoes.ts';

// As OS na ficha do ativo (spec cadastro-de-ativos, "Ordens de serviço na ficha do ativo"; spec
// modulo-operacao, "Formulários das ordens de serviço" e "Operação atualizada pelos eventos"; change
// p4e-ordens-de-servico, design, decisão 8): a seção da relação do Operação com o alvo `ativo`, com
// "Nova ordem de serviço".

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Ficha = components['schemas']['FichaDoAtivo'];

const ID = NB0031.id;
const NOTEBOOK = { id: 'notebook', nome: 'Notebook', icone: 'notebook' } as const;

const FICHA: Ficha = {
  id: ID,
  rotulo: NB0031.rotulo,
  tipo: NOTEBOOK,
  modelo: null,
  imagem: null,
  patrimonio: NB0031.patrimonio,
  serie: null,
  hostname: null,
  local: null,
  responsavel: null,
  uso: 'em-uso',
  situacao: 'ativo',
  criadoEm: '2026-10-09T12:00:00.000Z',
  atualizadoEm: '2026-10-09T12:00:00.000Z',
  valores: { 'ativo.patrimonio': NB0031.patrimonio, 'ativo.uso': 'em-uso' },
  estado: {},
  referencias: { pessoas: {}, locais: {}, ativos: {}, fornecedores: {}, arquivos: {} },
  permite: { editar: false, verRestritos: false, editarRestritos: false, verResponsavel: false },
};

/** A ficha do NB-0031 com as OS dele, e o que a nova OS pede ao abrir. */
function servidorDaFicha({
  emAberto = [],
  resolvidasOuEncerradas = [],
}: {
  emAberto?: OrdemDeTeste[];
  resolvidasOuEncerradas?: OrdemDeTeste[];
} = {}) {
  const estado = { emAberto, resolvidasOuEncerradas };
  const aberturas: unknown[] = [];
  const { servidor: daLista } = servidorDasOrdens([]);
  const servidor: ServidorDeTeste = {
    ...daLista,
    [`GET /api/ativos/${ID}`]: () => Response.json(FICHA),
    [`GET /api/ativos/${ID}/ligados`]: () =>
      Response.json({ porCampos: [], livres: [], permite: { ligar: false } }),
    [`GET /api/ativos/${ID}/historico`]: () => Response.json({ itens: [], proximo: null }),
    [`GET /api/ativos/${ID}/resumo`]: () => Response.json({ ...NB0031, local: EXPEDICAO }),
    'GET /api/tipos-de-ativo': () =>
      Response.json({
        tipos: [
          {
            ...NOTEBOOK,
            capacidades: [],
            configuracaoDasCapacidades: {},
            campos: [],
            situacao: 'ativo',
            permite: { editar: false },
          },
        ],
        permite: { cadastrar: false },
      }),
    'GET /api/campos': () => Response.json({ campos: [], permite: { cadastrar: false } }),
    [`GET /api/ativos/${ID}/ordens`]: () => Response.json(estado),
    'GET /api/ativos': () =>
      Response.json({ itens: [{ ...NB0031, local: EXPEDICAO }], total: 1, proximo: null }),
    'POST /api/ordens': async (pedido) => {
      aberturas.push(await pedido.json());
      return Response.json(ordem(12), { status: 201 });
    },
  };
  return { servidor, estado, aberturas };
}

const ATENDE = naOrganizacao('ativos.ver', 'ordens.ver', 'ordens.atender');
const VE = naOrganizacao('ativos.ver', 'ordens.ver');

function abrir(
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[],
  canal: CanalDeEventos = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [`/ativos/${ID}`] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

const secao = () => screen.findByRole('region', { name: 'Ordens de serviço' });
const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('as OS na ficha do ativo', () => {
  it('Ativo sem OS: a seção diz que não há nenhuma', async () => {
    const { servidor } = servidorDaFicha();
    abrir(servidor, VE);
    expect(
      await within(await secao()).findByText('Nenhuma ordem de serviço deste ativo.'),
    ).toBeTruthy();
    expect(within(await secao()).queryByRole('link', { name: 'Nova ordem de serviço' })).toBeNull();
  });

  it('Problema que voltou: a em aberto e a encerrada, cada uma com o problema e levando à ficha dela', async () => {
    const { servidor } = servidorDaFicha({
      emAberto: [ordem(20, { problema: 'Não liga de novo', abertaEm: haDias(1) })],
      resolvidasOuEncerradas: [
        ordem(12, { situacao: 'encerrada', encerradaPor: CARLA, encerradaEm: haDias(2) }),
      ],
    });
    abrir(servidor, VE);
    const ordens = await secao();
    const aberta = await within(ordens).findByRole('link', { name: 'OS 20' });
    expect(aberta.getAttribute('href')).toBe('/operacao/ordens/20');
    expect(within(ordens).getByRole('link', { name: 'OS 12' }).getAttribute('href')).toBe(
      '/operacao/ordens/12',
    );
    const itens = within(ordens)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toContain('Não liga de novo');
    expect(itens[0]).toContain('Aberta');
    expect(itens[0]).toContain('Há 1 d');
    expect(itens[1]).toContain('Não liga');
    expect(itens[1]).toContain('Encerrada');
    expect(itens[1]).toContain('Há 3 d');
  });

  it('OS pela ficha do notebook: "Nova ordem de serviço" abre a gaveta com ele, e a OS volta com "OS 12 aberta."', async () => {
    const { servidor, aberturas } = servidorDaFicha();
    const roteador = abrir(servidor, ATENDE);
    const nova = await within(await secao()).findByRole('link', { name: 'Nova ordem de serviço' });
    fireEvent.click(nova);
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/ordens'));
    const formulario = await screen.findByRole('dialog', { name: 'Nova ordem de serviço' });
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Ativo' }) as HTMLInputElement).value,
      ).toBe('Dell Latitude 5440 · NB-0031'),
    );
    fireEvent.change(within(formulario).getByRole('textbox', { name: 'Problema' }), {
      target: { value: 'Não liga' },
    });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Abrir a OS' }));
    await waitFor(() => expect(avisos()).toContain('OS 12 aberta.'));
    expect(aberturas).toEqual([{ ativo: ID, problema: 'Não liga' }]);
  });

  it('OS aberta com a ficha aberta: o evento das OS relê a seção', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDaFicha();
    abrir(servidor, VE, canal);
    await within(await secao()).findByText('Nenhuma ordem de serviço deste ativo.');
    estado.emAberto = [ordem(12)];
    canal.publicar({
      id: 'e1',
      tipo: 'ordens.mudaram',
      momento: '2026-10-22T10:00:00.000Z',
      alvo: { tipo: 'ordem', id: 'o12' },
    });
    expect(await within(await secao()).findByRole('link', { name: 'OS 12' })).toBeTruthy();
  });

  it('quem não vê as OS não tem a seção', async () => {
    const { servidor } = servidorDaFicha();
    abrir(servidor, naOrganizacao('ativos.ver'));
    await screen.findByRole('heading', { level: 1, name: /Dell Latitude 5440/ });
    expect(screen.queryByRole('region', { name: 'Ordens de serviço' })).toBeNull();
  });
});
