import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Importacao = components['schemas']['Importacao'];
type ImportacaoNaLista = components['schemas']['ImportacaoNaLista'];
type Tipo = components['schemas']['TipoDeAtivo'];

const ZERADOS = { novos: 0, alterados: 0, semMudanca: 0, comErro: 0 };

const naLista = (id: string, extras: Partial<ImportacaoNaLista> = {}): ImportacaoNaLista => ({
  id,
  nomeDoArquivo: 'impressoras.csv',
  tipo: { id: 'impressora', nome: 'Impressora' },
  situacao: 'rascunho',
  linhas: 3,
  processadas: 0,
  totais: ZERADOS,
  criadaEm: '2026-10-12T12:00:00.000Z',
  concluidaEm: null,
  ...extras,
});

const importacao = (extras: Partial<Importacao> = {}): Importacao => ({
  ...naLista('i1'),
  colunas: [
    { titulo: 'Patrimônio', campo: 'ativo.patrimonio', exemplos: ['PAT-00412'] },
    { titulo: 'Local', campo: 'ativo.local', exemplos: ['Jundiaí › Expedição'] },
  ],
  campos: [
    { chave: 'ativo.patrimonio', rotulo: 'Patrimônio', grupo: 'Identificação', restrito: false },
    { chave: 'ativo.local', rotulo: 'Local', grupo: 'Uso', restrito: false },
  ],
  aplicadaEm: null,
  ...extras,
});

const tipo = (id: string, nome: string, situacao: Tipo['situacao'] = 'ativo'): Tipo => ({
  id,
  nome,
  icone: 'impressora',
  capacidades: [],
  configuracaoDasCapacidades: {},
  primeiroCartao: null,
  campos: [],
  situacao,
  permite: { editar: false },
});

const TIPOS = {
  'GET /api/tipos-de-ativo': () =>
    Response.json({
      tipos: [tipo('impressora', 'Impressora'), tipo('camera', 'Câmera', 'inativo')],
      permite: { cadastrar: false },
    }),
};

const lista = (itens: ImportacaoNaLista[]) => () => Response.json({ itens, proximo: null });

/** A prévia vazia do rascunho, para a tela da importação abrir. */
const PREVIA = {
  'GET /api/ativos/importacoes/i1/previa': () =>
    Response.json({ totais: ZERADOS, linhas: [], proximo: null }),
};

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[] = naOrganizacao('ativos.ver', 'ativos.editar'),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
  return roteador;
}

describe('a lista das importações', () => {
  it('mostra as importações da conta, com o tipo, a situação em texto e os totais', async () => {
    abrir('/gestao/importacoes', {
      'GET /api/ativos/importacoes': lista([
        naLista('i3', {
          nomeDoArquivo: 'novos.xlsx',
          situacao: 'aplicando',
          linhas: 120,
          processadas: 60,
        }),
        naLista('i2', {
          nomeDoArquivo: 'computadores.xlsx',
          tipo: { id: 'computador', nome: 'Computador' },
          situacao: 'concluida',
          linhas: 5000,
          processadas: 5000,
          totais: { novos: 4990, alterados: 1, semMudanca: 0, comErro: 9 },
          concluidaEm: '2026-10-12T12:30:00.000Z',
        }),
        naLista('i1'),
      ]),
    });
    const tabela = await screen.findByRole('list', { name: 'Importações' });
    const itens = within(tabela).getAllByRole('listitem');
    expect(itens).toHaveLength(3);
    expect(itens[0]?.textContent).toContain('novos.xlsx');
    expect(itens[0]?.textContent).toContain('Importando');
    expect(itens[0]?.textContent).toContain('60 de 120 linhas');
    expect(itens[1]?.textContent).toContain('Computador');
    expect(itens[1]?.textContent).toContain('Concluída');
    expect(itens[1]?.textContent).toContain('4.990 novos · 1 alterado · 9 com erro');
    expect(itens[2]?.textContent).toContain('Rascunho');
    expect(itens[2]?.textContent).toContain('3 linhas');
  });

  it('sem importações, diz isso e leva à importação nova; cada item leva à importação dele', async () => {
    const roteador = abrir('/gestao/importacoes', {
      'GET /api/ativos/importacoes': lista([]),
      ...TIPOS,
    });
    expect(await screen.findByText('Nenhuma importação ainda.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Importar planilha' })[0] as HTMLElement);
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/importacoes/nova'));
    cleanup();

    const outro = abrir('/gestao/importacoes', {
      'GET /api/ativos/importacoes': lista([naLista('i1')]),
      'GET /api/ativos/importacoes/i1': () => Response.json(importacao()),
      ...PREVIA,
    });
    fireEvent.click(await screen.findByRole('link', { name: /impressoras\.csv/ }));
    await waitFor(() => expect(outro.state.location.pathname).toBe('/gestao/importacoes/i1'));
  });

  it('quem não edita ativos não vê as importações', async () => {
    abrir('/gestao/importacoes', {}, naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso às importações de ativos.')).toBeTruthy();
  });
});

describe('a importação nova', () => {
  function escolherAPlanilha(arquivo: File) {
    const escolha = screen.getByRole('group', { name: 'Planilha' });
    const campo = escolha.querySelector('input[type="file"]') as HTMLElement;
    fireEvent.change(campo, { target: { files: [arquivo] } });
  }

  async function escolherOTipo() {
    fireEvent.click(await screen.findByRole('button', { name: /Tipo dos ativos/ }));
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Impressora',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Impressora' }));
  }

  it('pede o tipo e a planilha, envia e abre o rascunho', async () => {
    const enderecos: URL[] = [];
    const roteador = abrir('/gestao/importacoes/nova', {
      ...TIPOS,
      'POST /api/ativos/importacoes': (pedido) => {
        enderecos.push(new URL(pedido.url));
        return Response.json(importacao(), { status: 201 });
      },
      'GET /api/ativos/importacoes/i1': () => Response.json(importacao()),
      ...PREVIA,
    });
    await screen.findByRole('heading', { level: 1, name: 'Importar planilha' });
    expect(screen.queryByRole('group', { name: 'Planilha' })).toBeNull();
    await escolherOTipo();
    expect(
      screen.getByText('XLSX ou CSV, até 10 MB, com os títulos na primeira linha.'),
    ).toBeTruthy();
    escolherAPlanilha(new File(['Patrimônio;Local'], 'impressoras.csv', { type: 'text/csv' }));

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/gestao/importacoes/i1'));
    expect(enderecos[0]?.searchParams.get('tipoId')).toBe('impressora');
    expect(enderecos[0]?.searchParams.get('nome')).toBe('impressoras.csv');
  });

  it('mostra a recusa da API junto da escolha', async () => {
    abrir('/gestao/importacoes/nova', {
      ...TIPOS,
      'POST /api/ativos/importacoes': () =>
        Response.json(
          {
            type: 'urn:grafite:problema:formato-nao-aceito',
            title: 'Formato não aceito',
            status: 415,
            detail: 'Formato não aceito. Envie a planilha em XLSX ou CSV.',
            codigoDeRastreio: 'R7K2-9QXM',
          },
          { status: 415 },
        ),
    });
    await escolherOTipo();
    escolherAPlanilha(new File(['%PDF-1.7'], 'nota.pdf', { type: 'application/pdf' }));
    const escolha = screen.getByRole('group', { name: 'Planilha' });
    expect((await within(escolha).findByRole('alert')).textContent).toContain(
      'Formato não aceito. Envie a planilha em XLSX ou CSV.',
    );
  });
});
