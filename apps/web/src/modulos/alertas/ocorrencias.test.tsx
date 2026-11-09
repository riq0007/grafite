// Os alertas em "O que resolver agora" (spec modulo-alertas, "Ocorrências em 'O que resolver
// agora'"; change p3a-regras-e-alertas, design, decisão 11): a fonte lê os alertas para resolver,
// página a página, e os mostra com o ativo ou o coletor; o evento dos alertas relê a fonte.
import type { components } from '@grafite/api-client';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarCliente } from '../../api/cliente.ts';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';
import { fonteDosAlertas } from './ocorrencias.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

type Alerta = components['schemas']['AlertaNaLista'];

const IMPRESSORA = {
  tipo: 'ativo' as const,
  id: '0199d3a0-0000-7000-8000-0000000000a1',
  nome: 'Impressora do RH',
  patrimonio: 'PAT-00412',
  tipoDoAtivo: { id: 't1', nome: 'Impressora', icone: 'impressora' as const },
  imagem: { id: '0199d3a0-0000-7000-8000-0000000000f1' },
  modelo: { id: '0199d3a0-0000-7000-8000-0000000000e1', imagem: null },
};

const alerta = (id: string, mudancas: Partial<Alerta> = {}): Alerta => ({
  id,
  regra: { id: 'r1', nome: 'Toner em 10% ou menos' },
  condicao: 'toner.nivel',
  severidade: 'critico',
  texto: 'Toner preto em 8%',
  situacao: 'aberto',
  alvo: IMPRESSORA,
  abertoEm: '2026-10-14T10:00:00.000Z',
  resolvidoEm: null,
  comoTerminou: null,
  reconhecido: null,
  adiado: null,
  silencio: null,
  permite: { tratar: true },
  ...mudancas,
});

const COLETOR = alerta('al-coletor', {
  texto: 'Coletor sem contato',
  alvo: { tipo: 'coletor', id: '0199d3a0-0000-7000-8000-0000000000c9', nome: 'Coletor de Jundiaí' },
});

/** O cliente da API sobre o servidor do teste, como a tela inicial o passa à fonte. */
function clienteSobre(servidor: ServidorDeTeste) {
  return criarCliente({
    csrf: () => 'csrf-de-teste',
    aoPerderASessao: () => {},
    aoMudarOAcesso: () => {},
    buscar: async (pedido) => {
      const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
      const responder = servidor[caminho];
      if (!responder) throw new Error(`O teste não preparou o servidor para ${caminho}.`);
      return responder(pedido);
    },
  });
}

describe('a fonte dos alertas', () => {
  it('lê os alertas para resolver, página a página, com o ativo e o coletor', async () => {
    const pedidos: URLSearchParams[] = [];
    const api = clienteSobre({
      'GET /api/alertas': (pedido) => {
        const parametros = new URL(pedido.url).searchParams;
        pedidos.push(parametros);
        return parametros.get('cursor')
          ? Response.json({ itens: [COLETOR], total: 2, proximo: null })
          : Response.json({ itens: [alerta('al-toner')], total: 2, proximo: 'cursor-2' });
      },
    });
    const ocorrencias = await fonteDosAlertas.buscar(new AbortController().signal, {
      api,
      canal: criarCanalDeEventos(),
    });
    expect(pedidos[0]?.get('situacao')).toBe('abertos');
    expect(pedidos[0]?.get('paraResolver')).toBe('true');
    expect(pedidos[1]?.get('cursor')).toBe('cursor-2');
    expect(ocorrencias).toEqual([
      {
        id: 'al-toner',
        severidade: 'critico',
        texto: 'Toner preto em 8%',
        ativo: {
          nome: 'Impressora do RH',
          tipo: 'impressora',
          imagemDoAtivo: `/api/ativos/${IMPRESSORA.id}/imagem/${IMPRESSORA.imagem.id}/64`,
          imagemDoModelo: undefined,
        },
        desde: new Date('2026-10-14T10:00:00.000Z'),
        destino: `/ativos/${IMPRESSORA.id}`,
      },
      {
        id: 'al-coletor',
        severidade: 'critico',
        texto: 'Coletor sem contato',
        ativo: { nome: 'Coletor de Jundiaí', tipo: 'generico' },
        desde: new Date('2026-10-14T10:00:00.000Z'),
        destino: '/administracao/coletores/0199d3a0-0000-7000-8000-0000000000c9',
      },
    ]);
  });

  it('avisa a tela inicial quando os alertas mudam', () => {
    const canal = criarCanalDeEventos();
    const aoMudar = vi.fn();
    const parar = fonteDosAlertas.assinar?.(aoMudar, { api: clienteSobre({}), canal });
    canal.publicar({ id: 'e1', tipo: 'alertas.mudaram', momento: '', alvo: null });
    expect(aoMudar).toHaveBeenCalledOnce();
    parar?.();
    canal.publicar({ id: 'e2', tipo: 'alertas.mudaram', momento: '', alvo: null });
    expect(aoMudar).toHaveBeenCalledOnce();
  });
});

describe('os alertas na tela inicial', () => {
  it('mostra os alertas para resolver e os relê quando mudam', async () => {
    let itens = [alerta('al-toner')];
    const servidor: ServidorDeTeste = {
      'GET /api/alertas': () => Response.json({ itens, total: itens.length, proximo: null }),
    };
    noComputador();
    const canal = criarCanalDeEventos();
    render(
      <App
        roteador={criarRoteador(createMemoryHistory({ initialEntries: ['/'] }))}
        sessao={sessaoAtiva(naOrganizacao('alertas.ver'), servidor)}
        consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
        canal={canal}
      />,
    );
    const tabela = await screen.findByRole('grid', { name: 'Ocorrências abertas' });
    expect(within(tabela).getByText('Toner preto em 8%')).toBeTruthy();
    expect(within(tabela).getByText('Impressora do RH')).toBeTruthy();
    itens = [];
    act(() => canal.publicar({ id: 'e1', tipo: 'alertas.mudaram', momento: '', alvo: null }));
    await waitFor(() => expect(screen.getByText('Nenhuma ocorrência aberta.')).toBeTruthy());
  });
});
