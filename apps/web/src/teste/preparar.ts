// Nenhum teste da web fala com a rede: antes de cada teste, o fetch responde como um servidor no
// ar. Um teste que precisa de outra resposta troca o stub ou injeta o próprio fetch. As boas-vindas
// do primeiro acesso já nascem vistas.
import { soltarOAnunciador } from '@grafite/ui/teste/soltarOAnunciador';
import { configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Depois de cada teste, e depois da limpeza do próprio arquivo, o anunciador do React Aria sai do
// documento: o anúncio que ainda espera os 100 ms dele não dispara depois de o ambiente sair.
afterEach(() => soltarOAnunciador());

// O findBy e o waitFor esperam até 10 s pela tela, no lugar de 1 s: com as três instâncias do
// executor rodando juntas, a tela leva mais de 1 s para aparecer. A espera acaba quando o que o
// teste procura aparece (change testes-sob-carga, design, decisão 2).
configure({ asyncUtilTimeout: 10_000 });

// A tabela virtualizada do React Aria desenha só o que cabe na área visível, medida pelo clientWidth
// e pelo clientHeight. O happy-dom não mede, e a área seria vazia: nos testes, ela é grande o
// bastante para todas as linhas e colunas. A área da tabela tem a largura da janela do happy-dom
// (1.024 px), que é a que o React Aria usa para saber as colunas à vista: as colunas sem largura
// dividem essa largura (change redesenho-da-interface, design, decisão 2).
Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get: () => 10_000,
});
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get(this: HTMLElement) {
    return this.hasAttribute('data-rolagem') ? window.innerWidth : 10_000;
  },
});

beforeEach(() => {
  // As boas-vindas já foram vistas: só os testes do primeiro acesso as desmarcam (design do F1c,
  // decisão 10).
  localStorage.setItem('grafite.chegada.boasVindas', 'vistas');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'ok', versao: '0.0.0', banco: 'ok' })),
  );
});
