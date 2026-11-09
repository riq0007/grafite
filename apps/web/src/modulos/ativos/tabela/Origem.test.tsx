// A tabela a partir de uma origem (spec cadastro-de-ativos, "Tabela a partir de uma origem"; change
// relacoes-vivas, decisão 3): a origem no endereço vira o filtro da coluna dela, fora da visão e das
// mudanças da conta, com a faixa que diz de onde a tabela veio, o "Incluir os locais de dentro" no
// local, o "Limpar origem" e a origem levada ao cadastro.
import { filaDeAvisos } from '@grafite/ui';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { estadoDaSessaoAtiva, naOrganizacao } from '../../../teste/sessao.ts';
import { abrir, EXPEDICAO, servidorDeAtivos, tabela } from './teste.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

const CONTAGEM = { quantos: 2, recortada: false };

const RESUMOS = {
  [`GET /api/locais/${EXPEDICAO}/resumo`]: () =>
    Response.json({
      id: EXPEDICAO,
      caminho: 'Jundiaí › Expedição',
      tipo: 'setor',
      situacao: 'ativo',
      ativos: { aqui: CONTAGEM, comOsDeDentro: CONTAGEM },
      pessoas: { aqui: CONTAGEM, comOsDeDentro: CONTAGEM },
    }),
  'GET /api/pessoas/ana/resumo': () =>
    Response.json({
      id: 'ana',
      nome: 'Ana Souza',
      situacao: 'ativa',
      foto: null,
      local: null,
      temConta: true,
      ativos: CONTAGEM,
    }),
  'GET /api/modelos/m404/resumo': () =>
    Response.json({
      id: 'm404',
      fabricante: 'HP',
      nome: 'LaserJet M404',
      imagem: null,
      situacao: 'ativo',
      tipo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
      ativos: CONTAGEM,
    }),
  'GET /api/tipos-de-ativo/impressora/resumo': () =>
    Response.json({
      id: 'impressora',
      nome: 'Impressora',
      icone: 'impressora',
      situacao: 'ativo',
      ativos: CONTAGEM,
    }),
  // O fornecedor pela ficha dele (change p4a-fornecedores, design, decisão 6).
  'GET /api/fornecedores/hp': () =>
    Response.json({
      id: 'hp',
      nome: 'HP Brasil',
      cnpj: '12.345.678/0001-95',
      contato: null,
      email: null,
      telefone: null,
      observacoes: null,
      situacao: 'ativo',
      criadoEm: '2026-10-14T12:00:00.000Z',
      atualizadoEm: '2026-10-14T12:00:00.000Z',
      permite: { editar: false },
    }),
};

/** Os filtros do último pedido da lista. */
const filtrosDe = (pedidos: URLSearchParams[]): { chave: string }[] =>
  JSON.parse(pedidos.at(-1)?.get('filtros') ?? '[]');

const faixa = () => screen.findByRole('group', { name: 'Origem da tabela' });

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('a origem da tabela dos ativos', () => {
  it('a do local filtra só o local, fora da visão, e inclui os de dentro quando pedido', async () => {
    const { servidor, pedidos, gravacoes } = servidorDeAtivos();
    Object.assign(servidor, RESUMOS);
    const roteador = abrir(`/ativos?origem=local:${EXPEDICAO}`, servidor);
    await tabela();
    const daOrigem = await faixa();
    await waitFor(() =>
      expect(daOrigem.textContent).toContain('Ativos de Jundiaí › Expedição (vindo do local)'),
    );
    await waitFor(() =>
      expect(filtrosDe(pedidos)).toContainEqual({
        chave: 'ativo.local',
        operador: 'igual',
        local: EXPEDICAO,
      }),
    );
    // A origem não marca a visão nem grava nas mudanças da conta.
    expect(screen.queryByText(/Você mudou/)).toBeNull();
    expect(gravacoes).toEqual([]);

    fireEvent.click(
      within(daOrigem).getByRole('checkbox', { name: 'Incluir os locais de dentro' }),
    );
    await waitFor(() =>
      expect(filtrosDe(pedidos)).toContainEqual({
        chave: 'ativo.local',
        operador: 'em',
        local: EXPEDICAO,
      }),
    );
    expect(roteador.state.location.search).toMatchObject({
      origem: `local:${EXPEDICAO}`,
      dentro: true,
    });

    fireEvent.click(within(daOrigem).getByRole('button', { name: 'Limpar origem' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Origem da tabela' })).toBeNull(),
    );
    await waitFor(() =>
      expect(filtrosDe(pedidos).some((filtro) => filtro.chave === 'ativo.local')).toBe(false),
    );
    expect(roteador.state.location.search).not.toHaveProperty('origem');
    expect(gravacoes).toEqual([]);
  });

  it.each([
    [
      'pessoa:ana',
      'Ativos sob responsabilidade de Ana Souza',
      { chave: 'ativo.responsavel', operador: 'qualquer', valores: ['ana'] },
    ],
    [
      'modelo:m404',
      'Ativos do modelo HP LaserJet M404',
      { chave: 'ativo.modelo', operador: 'qualquer', valores: ['m404'] },
    ],
    [
      'tipo:impressora',
      'Ativos do tipo Impressora',
      { chave: 'ativo.tipo', operador: 'qualquer', valores: ['impressora'] },
    ],
    [
      'fornecedor:hp',
      'Ativos do fornecedor HP Brasil',
      { chave: 'ativo.fornecedor', operador: 'qualquer', valores: ['hp'] },
    ],
  ])('a origem %s diz "%s" e filtra a coluna dela', async (origem, texto, filtro) => {
    const { servidor, pedidos } = servidorDeAtivos();
    Object.assign(servidor, RESUMOS);
    abrir(`/ativos?origem=${origem}`, servidor);
    await tabela();
    const daOrigem = await faixa();
    await waitFor(() => expect(daOrigem.textContent).toContain(texto));
    expect(within(daOrigem).queryByRole('checkbox')).toBeNull();
    await waitFor(() => expect(filtrosDe(pedidos)).toContainEqual(filtro));
  });

  it('a origem que a conta não vê, ou que não existe mais, avisa, e a tabela segue sem ela', async () => {
    const { servidor, pedidos } = servidorDeAtivos();
    servidor['GET /api/pessoas/joao/resumo'] = () =>
      Response.json(
        {
          type: 'urn:grafite:problema:sem-permissao',
          title: 'Sem permissão',
          status: 403,
          detail: 'Você não tem permissão para isso.',
          codigoDeRastreio: 'R7K2-9QXM',
        },
        { status: 403 },
      );
    // A recusa por permissão faz a tela validar a sessão de novo.
    const permissoes = naOrganizacao('ativos.editar', 'ativos.ver', 'ativos.restritos');
    servidor['GET /api/sessao'] = () => estadoDaSessaoAtiva(permissoes);
    const roteador = abrir('/ativos?origem=pessoa:joao', servidor, permissoes);
    await tabela();
    await waitFor(() => expect(avisos()).toContain('A origem desta tabela não está disponível.'));
    await waitFor(() => expect(roteador.state.location.search).not.toHaveProperty('origem'));
    await waitFor(() =>
      expect(filtrosDe(pedidos).some((filtro) => filtro.chave === 'ativo.responsavel')).toBe(false),
    );
    expect(screen.queryByRole('group', { name: 'Origem da tabela' })).toBeNull();
  });

  it('"Novo ativo" leva a origem ao cadastro', async () => {
    const { servidor } = servidorDeAtivos();
    Object.assign(servidor, RESUMOS);
    const roteador = abrir(`/ativos?origem=local:${EXPEDICAO}`, servidor);
    await tabela();
    await faixa();
    fireEvent.click(screen.getByRole('button', { name: 'Novo ativo' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ativos/novo'));
    expect(roteador.state.location.search).toEqual({ origem: `local:${EXPEDICAO}` });
  });
});
