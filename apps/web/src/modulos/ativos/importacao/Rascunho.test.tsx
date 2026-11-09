import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Importacao = components['schemas']['Importacao'];
type LinhaDaPrevia = components['schemas']['LinhaDaPrevia'];

const TOTAIS = { novos: 1, alterados: 1, semMudanca: 0, comErro: 1 };

const RASCUNHO: Importacao = {
  id: 'i1',
  nomeDoArquivo: 'impressoras.csv',
  tipo: { id: 'impressora', nome: 'Impressora' },
  situacao: 'rascunho',
  linhas: 3,
  processadas: 0,
  totais: { novos: 0, alterados: 0, semMudanca: 0, comErro: 0 },
  criadaEm: '2026-10-12T12:00:00.000Z',
  concluidaEm: null,
  aplicadaEm: null,
  colunas: [
    { titulo: 'Patrimônio', campo: 'ativo.patrimonio', exemplos: ['PAT-00412', 'PAT-00902'] },
    { titulo: 'Setor', campo: null, exemplos: ['Expedição'] },
    { titulo: 'IP', campo: 'c-ip', exemplos: ['10.0.0'] },
  ],
  campos: [
    { chave: 'ativo.patrimonio', rotulo: 'Patrimônio', grupo: 'Identificação', restrito: false },
    { chave: 'ativo.local', rotulo: 'Local', grupo: 'Uso', restrito: false },
    { chave: 'c-ip', rotulo: 'IP', grupo: 'Rede', restrito: false },
  ],
};

const LINHAS: LinhaDaPrevia[] = [
  {
    linha: 2,
    acao: 'alterar',
    ativo: { id: 'a412', rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00412' },
    mudancas: [{ campo: 'IP', antes: '10.0.0.5', depois: '10.0.0.7' }],
    seguros: [{ campo: 'Hostname', motivo: 'Travado' }],
    erros: [],
  },
  {
    linha: 3,
    acao: 'novo',
    ativo: null,
    mudancas: [{ campo: 'Patrimônio', antes: null, depois: 'PAT-00902' }],
    seguros: [],
    erros: [],
  },
  {
    linha: 4,
    acao: 'com-erro',
    ativo: null,
    mudancas: [],
    seguros: [],
    erros: [{ campo: 'IP', mensagem: 'Use um IP, como 192.168.0.10.' }],
  },
];

/** A prévia, filtrada pela ação pedida, como a API responde. */
const previa =
  (pedidos: URL[] = []) =>
  (pedido: Request) => {
    const endereco = new URL(pedido.url);
    pedidos.push(endereco);
    const acao = endereco.searchParams.get('acao');
    return Response.json({
      totais: TOTAIS,
      linhas: LINHAS.filter((linha) => !acao || linha.acao === acao),
      proximo: null,
    });
  };

function abrir(servidor: ServidorDeTeste) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/gestao/importacoes/i1'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(naOrganizacao('ativos.ver', 'ativos.editar'), {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
        'GET /api/ativos/importacoes/i1': () => Response.json(RASCUNHO),
        'GET /api/ativos/importacoes/i1/previa': previa(),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
  return roteador;
}

/** A seleção do campo de uma coluna, pelo título dela. */
const colunaDe = (titulo: string) =>
  within(screen.getByRole('group', { name: 'Colunas' }))
    .getAllByRole('button', { name: new RegExp(titulo) })
    .find((botao) => botao.getAttribute('aria-haspopup') === 'listbox') as HTMLElement;

async function escolher(titulo: string, campo: string) {
  fireEvent.click(colunaDe(titulo));
  fireEvent.click(await screen.findByRole('option', { name: campo }));
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('o rascunho da importação', () => {
  it('mostra cada coluna com os exemplos e o campo, e guarda a escolha nova', async () => {
    const corpos: unknown[] = [];
    abrir({
      'PUT /api/ativos/importacoes/i1/colunas': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json({
          ...RASCUNHO,
          colunas: RASCUNHO.colunas.map((coluna) =>
            coluna.titulo === 'Setor' ? { ...coluna, campo: 'ativo.local' } : coluna,
          ),
        });
      },
    });
    const colunas = await screen.findByRole('group', { name: 'Colunas' });
    expect(colunas.textContent).toContain('Ex.: PAT-00412, PAT-00902');
    expect(colunaDe('Setor').textContent).toContain('Ignorar');
    expect(colunaDe('Patrimônio').textContent).toContain('Patrimônio');

    await escolher('Setor', 'Local');
    await waitFor(() =>
      expect(corpos).toEqual([{ colunas: ['ativo.patrimonio', 'ativo.local', 'c-ip'] }]),
    );
  });

  it('recusa um campo em duas colunas sem enviar, nas duas', async () => {
    const enviar = vi.fn(() => Response.json(RASCUNHO));
    abrir({ 'PUT /api/ativos/importacoes/i1/colunas': enviar });
    await screen.findByRole('group', { name: 'Colunas' });
    await escolher('Setor', 'Patrimônio');
    const colunas = screen.getByRole('group', { name: 'Colunas' });
    await waitFor(() =>
      expect(within(colunas).getAllByText('O campo Patrimônio está em duas colunas.')).toHaveLength(
        2,
      ),
    );
    expect(enviar).not.toHaveBeenCalled();
  });

  it('mostra a prévia com os totais e filtra por ação', async () => {
    const pedidos: URL[] = [];
    abrir({ 'GET /api/ativos/importacoes/i1/previa': previa(pedidos) });
    const lista = await screen.findByRole('list', { name: 'Prévia da importação' });
    expect(
      screen.getByText('3 linhas: 1 novo · 1 alterado · 1 com erro', { exact: false }),
    ).toBeTruthy();
    expect(within(lista).getAllByRole('listitem', { name: /^Linha/ })).toHaveLength(3);
    expect(lista.textContent).toContain('IP: 10.0.0.5 → 10.0.0.7');
    expect(lista.textContent).toContain('Travado: Hostname');

    fireEvent.click(screen.getByRole('radio', { name: /Com erro/ }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Prévia da importação' })).getAllByRole(
          'listitem',
          { name: /^Linha/ },
        ),
      ).toHaveLength(1),
    );
    expect(pedidos.at(-1)?.searchParams.get('acao')).toBe('com-erro');
  });

  it('"Importar" pede a confirmação com os totais e põe a importação na fila', async () => {
    const aplicar = vi.fn(() =>
      Response.json(
        { ...RASCUNHO, situacao: 'na-fila', aplicadaEm: '2026-10-12T12:05:00Z' },
        {
          status: 202,
        },
      ),
    );
    abrir({ 'POST /api/ativos/importacoes/i1/aplicacao': aplicar });
    await screen.findByRole('list', { name: 'Prévia da importação' });
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Importar impressoras.csv?' });
    expect(dialogo.textContent).toContain('1 ativo novo e 1 ativo alterado.');
    expect(dialogo.textContent).toContain('A linha com erro fica de fora.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Importar' }));
    await waitFor(() => expect(aplicar).toHaveBeenCalledOnce());
    await waitFor(() => expect(avisos()).toContain('Importação na fila.'));
  });

  it('"Descartar" pede a confirmação e volta à lista', async () => {
    const descartar = vi.fn(() => new Response(null, { status: 204 }));
    const roteador = abrir({
      'DELETE /api/ativos/importacoes/i1': descartar,
      'GET /api/ativos/importacoes': () => Response.json({ itens: [], proximo: null }),
    });
    await screen.findByRole('list', { name: 'Prévia da importação' });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Descartar a importação?' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/importacoes'));
    expect(descartar).toHaveBeenCalledOnce();
    expect(avisos()).toContain('Importação descartada.');
  });
});
