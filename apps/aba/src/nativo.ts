// O contrato da tela com o lado nativo (change aba-dos-colaboradores, design, decisão 7): o que a tela
// lê e ouve do Rust e o que ela informa a ele. Os comandos do Rust entram nas tarefas do lado nativo;
// na ponta a ponta, eles são simulados (`e2e/tauri.ts`).
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type FormaDaAba = 'pilula' | 'entalhe';
export type TemaDoWindows = 'escuro' | 'claro' | 'alto-contraste';

/**
 * Como a aba aparece: a forma da configuração da organização, o tema e as animações do Windows e o
 * tamanho da tela principal, em px lógicos (já com a escala do Windows).
 */
export interface Aparencia {
  forma: FormaDaAba;
  tema: TemaDoWindows;
  movimentoReduzido: boolean;
  tela: { largura: number; altura: number };
}

export const COMANDO_DA_APARENCIA = 'aparencia';
export const EVENTO_DA_APARENCIA = 'aparencia-mudou';
export const COMANDO_DA_FORMA = 'informar_forma';

export function lerAparencia(): Promise<Aparencia> {
  return invoke<Aparencia>(COMANDO_DA_APARENCIA);
}

export function ouvirAparencia(aoMudar: (aparencia: Aparencia) => void): Promise<UnlistenFn> {
  return listen<Aparencia>(EVENTO_DA_APARENCIA, (evento) => aoMudar(evento.payload));
}

/**
 * Um retângulo da forma, em px CSS da janela, com o raio dos cantos de cima e o dos de baixo. Fora
 * dos retângulos, o lado nativo deixa o clique e a rolagem passarem para a janela de baixo.
 */
export interface RetanguloDaForma {
  x: number;
  y: number;
  largura: number;
  altura: number;
  raioDeCima: number;
  raioDeBaixo: number;
}

export function informarForma(retangulos: RetanguloDaForma[]): Promise<void> {
  return invoke(COMANDO_DA_FORMA, { retangulos });
}
