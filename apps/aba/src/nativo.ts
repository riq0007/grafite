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

/**
 * O que a aba mostra da pessoa: as não lidas do chat, as respostas novas dos chamados, quem está na
 * aba (com a entrada pela senha, ela tem o "Sair") e se o atalho ficou com outro programa.
 */
export interface EstadoDaAba {
  naoLidas: number;
  respostasNovas: number;
  pessoa: { nome: string; pelaSenha: boolean } | null;
  atalhoOcupado: boolean;
}

export const COMANDO_DO_ESTADO = 'estado';
export const EVENTO_DO_ESTADO = 'estado-mudou';
/** O Ctrl+Alt+T, de qualquer programa: abre o painel com o foco em "Abrir chamado". */
export const EVENTO_DO_ATALHO = 'atalho';
/** A janela da aba perdeu o foco para outro programa: é o clique fora, e o painel fecha. */
export const EVENTO_DE_FECHAR_O_PAINEL = 'fechar-o-painel';

export function lerEstado(): Promise<EstadoDaAba> {
  return invoke<EstadoDaAba>(COMANDO_DO_ESTADO);
}

export function ouvirEstado(aoMudar: (estado: EstadoDaAba) => void): Promise<UnlistenFn> {
  return listen<EstadoDaAba>(EVENTO_DO_ESTADO, (evento) => aoMudar(evento.payload));
}

export function ouvir(evento: string, aoChegar: () => void): Promise<UnlistenFn> {
  return listen(evento, () => aoChegar());
}

export type OpcaoDaAba = 'abrir-chamado' | 'abrir-chat' | 'visualizar-chamados';

/** Abre a tela maior, embaixo da aba, na opção escolhida. */
export function abrirTelaMaior(destino: OpcaoDaAba): Promise<void> {
  return invoke('abrir_tela_maior', { destino });
}

/** Devolve o foco à janela que estava na frente antes do atalho; sem atalho, não faz nada. */
export function devolverOFoco(): Promise<void> {
  return invoke('devolver_o_foco');
}

/** O "Sair" da entrada pela senha: termina a sessão da aba no servidor, com a do chat. */
export function sair(): Promise<void> {
  return invoke('sair');
}
