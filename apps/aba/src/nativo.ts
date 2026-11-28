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
  /** As não lidas do chat; `null` sem o chat. */
  naoLidas: number | null;
  /** Os chamados com resposta nova; `null` sem os chamados. */
  respostasNovas: number | null;
  /** Os chamados com resposta por ver e a última delas, como o `GET /api/aba/estado` dá. */
  porVer: { quantas: number; ultima: RespostaPorVer | null } | null;
  pessoa: { nome: string; pelaSenha: boolean } | null;
  atalhoOcupado: boolean;
}

/** A última resposta por ver: quem respondeu, o chamado e o momento, em ISO 8601. */
export interface RespostaPorVer {
  quem: string;
  numero: number;
  titulo: string;
  momento: string;
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

/** Abre a tela maior no chat da aba, já no chamado da resposta. */
export function abrirChamado(numero: number): Promise<void> {
  return invoke('abrir_tela_maior', { destino: 'chamado', numero });
}

/** O que a tela maior mostra: uma das opções ou o chamado da linha da resposta, no chat. */
export type DestinoDaTelaMaior = OpcaoDaAba | 'chamado';

export interface TelaMaior {
  destino: DestinoDaTelaMaior;
  /** O número do chamado, com o destino `chamado`. */
  numero?: number;
}

export const COMANDO_DA_TELA_MAIOR = 'tela_maior';
/** A tela maior que abriu, mudou de destino ou fechou (`null`), às duas janelas: a da aba e a dela. */
export const EVENTO_DA_TELA_MAIOR = 'tela-maior-mudou';

export function lerTelaMaior(): Promise<TelaMaior | null> {
  return invoke<TelaMaior | null>(COMANDO_DA_TELA_MAIOR);
}

export function ouvirTelaMaior(aoMudar: (tela: TelaMaior | null) => void): Promise<UnlistenFn> {
  return listen<TelaMaior | null>(EVENTO_DA_TELA_MAIOR, (evento) => aoMudar(evento.payload));
}

/** O "Esc volta" e o voltar da trilha: fecha a tela maior, e o foco volta ao painel. */
export function fecharTelaMaior(): Promise<void> {
  return invoke('fechar_tela_maior');
}

/** Onde o chat fica na tela maior, em px CSS da janela; `null` sem o chat. */
export interface RetanguloDoCorpo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export function informarCorpo(retangulo: RetanguloDoCorpo | null): Promise<void> {
  return invoke('informar_corpo', { retangulo });
}

/** Devolve o foco à janela que estava na frente antes do atalho; sem atalho, não faz nada. */
export function devolverOFoco(): Promise<void> {
  return invoke('devolver_o_foco');
}

/** O "Sair" da entrada pela senha: termina a sessão da aba no servidor, com a do chat. */
export function sair(): Promise<void> {
  return invoke('sair');
}
