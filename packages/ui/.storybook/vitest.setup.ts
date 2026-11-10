import * as anotacoesDeAcessibilidade from '@storybook/addon-a11y/preview';
import { setProjectAnnotations } from '@storybook/react-vite';
import { configure } from 'storybook/test';
import { beforeEach } from 'vitest';
import { commands } from 'vitest/browser';
import { ligarNavegadorDeTeste } from '../src/teste/navegadorDeTeste.ts';
import * as anotacoesDoProjeto from './preview.tsx';

declare module 'vitest/browser' {
  interface BrowserCommands {
    tirarPonteiroDaPagina: () => Promise<void>;
    porPonteiroSobre: (seletor: string, ponto?: { x: number; y: number }) => Promise<void>;
    apertarTecla: (tecla: string) => Promise<void>;
  }
}

setProjectAnnotations([anotacoesDeAcessibilidade, anotacoesDoProjeto]);

// O ponteiro e o teclado de verdade, para as histórias que conferem o `:hover` e o `:focus-visible`
// do CSS (src/teste/navegadorDeTeste.ts).
ligarNavegadorDeTeste({
  porPonteiroSobre: (seletor, ponto) => commands.porPonteiroSobre(seletor, ponto),
  tirarPonteiro: () => commands.tirarPonteiroDaPagina(),
  apertarTecla: (tecla) => commands.apertarTecla(tecla),
});

// O waitFor e os findBy das histórias esperam até 10 s, no lugar de 1 s, o padrão da Testing
// Library: com o executor do CI carregado, a tela leva mais de 1 s para chegar ao que a história
// confere. A espera acaba quando a tela chega (change captura-e-catalogo-sob-carga, como a web).
configure({ asyncUtilTimeout: 10_000 });

// A virtualização do React Aria lê `process.env` no navegador, e, nos testes, desenha todas as
// linhas sem o VIRT_ON. As histórias da tabela virtualizada conferem justamente que só as linhas
// perto da área visível ficam desenhadas, como na aplicação compilada.
const global = globalThis as { process?: { env: Record<string, string | undefined> } };
global.process ??= { env: {} };
global.process.env.VIRT_ON = '1';

// As histórias simulam o ponteiro; o cursor real do navegador não pode estar sobre elas
// (ver .storybook/comandos-do-navegador.ts). E a janela da história começa com o foco, como a de
// quem usa o sistema: sem ele, o primeiro foco dentro dela dispara `focus` na própria janela, e o
// React Aria, ao impedir o foco de um botão (o indicador da árvore), tenta tratá-la como elemento
// e lança um TypeError.
beforeEach(async () => {
  await commands.tirarPonteiroDaPagina();
  window.focus();
});
