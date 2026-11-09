import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { sessaoAtiva } from '../teste/sessao.ts';
import { criarRoteador } from './arvore.ts';

afterEach(cleanup);

function abrir(endereco: string) {
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(<App roteador={roteador} sessao={sessaoAtiva()} />);
}

describe('rotas', () => {
  it('mostra "Página não encontrada" dentro da casca, com um link para o Início', async () => {
    abrir('/endereco-que-nao-existe');
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para o Início' }).getAttribute('href')).toBe('/');
  });

  it('abre Ajustes no endereço dele', async () => {
    abrir('/ajustes');
    expect(await screen.findByRole('heading', { name: 'Aparência' })).toBeTruthy();
  });
});
