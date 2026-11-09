// A tabela dos ativos na busca (spec busca-global, "O que a busca encontra"; change relacoes-vivas,
// decisão 5): as ações da tela em "Nesta tela", antes de "Ir para", e o "Ver todos os N" no fim do
// grupo dos ativos, que abre a tabela com a busca.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrir, ativo, lista, M404, RH, servidorDeAtivos, tabela } from './teste.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const busca = () => screen.findByRole('dialog', { name: 'Busca' });

async function abrirABusca() {
  fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
  return busca();
}

/** A posição do grupo, pelo nome, entre os grupos da busca. */
const posicaoDoGrupo = (dialogo: HTMLElement, nome: string) =>
  within(dialogo)
    .getAllByRole('group')
    .indexOf(within(dialogo).getByRole('group', { name: nome }));

const opcoes = (grupo: HTMLElement) =>
  within(grupo)
    .getAllByRole('option')
    .map((opcao) => opcao.textContent);

describe('a tabela dos ativos na busca', () => {
  it('com o campo vazio, "Nesta tela" traz "Novo ativo" e "Filtrar por tipo…", antes de "Ir para"', async () => {
    abrir('/ativos', servidorDeAtivos().servidor);
    await tabela();
    const dialogo = await abrirABusca();
    await waitFor(() => expect(posicaoDoGrupo(dialogo, 'Nesta tela')).toBe(0));
    expect(posicaoDoGrupo(dialogo, 'Ir para')).toBe(1);
    const nestaTela = within(dialogo).getByRole('group', { name: 'Nesta tela' });
    expect(opcoes(nestaTela)).toEqual(['Novo ativo', 'Filtrar por tipo…']);
  });

  it('"Filtrar por tipo…" fecha a busca e abre o painel de filtros no tipo', async () => {
    abrir('/ativos', servidorDeAtivos().servidor);
    await tabela();
    const dialogo = await abrirABusca();
    const nestaTela = within(dialogo).getByRole('group', { name: 'Nesta tela' });
    fireEvent.click(within(nestaTela).getByRole('option', { name: 'Filtrar por tipo…' }));
    const painel = await screen.findByRole('dialog', { name: 'Filtros' });
    expect(await within(painel).findByRole('checkbox', { name: 'Impressora (2)' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Busca' })).toBeNull();
  });

  it('o grupo dos ativos termina com "Ver todos os N em Ativos", que abre a tabela com a busca', async () => {
    const achados = Array.from({ length: 8 }, (_, indice) =>
      ativo(`a${indice + 10}`, `HP LaserJet ${indice + 1}`),
    );
    const { servidor } = servidorDeAtivos((parametros) =>
      // O provedor da busca pede 8; a tabela, a página dela.
      parametros.get('limite') === '8' ? lista(achados, null, 23) : lista([M404, RH]),
    );
    const roteador = abrir('/ativos', servidor);
    await tabela();
    const dialogo = await abrirABusca();
    fireEvent.change(within(dialogo).getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'laserjet' },
    });
    const ativos = await within(dialogo).findByRole('group', { name: 'Ativos' });
    await waitFor(() => expect(opcoes(ativos).at(-1)).toBe('Ver todos os 23 em Ativos'));
    expect(opcoes(ativos)).toHaveLength(9);
    fireEvent.click(within(ativos).getByRole('option', { name: 'Ver todos os 23 em Ativos' }));
    await waitFor(() =>
      expect(roteador.state.location.search).toMatchObject({ busca: 'laserjet' }),
    );
    expect(roteador.state.location.pathname).toBe('/ativos');
  });
});
