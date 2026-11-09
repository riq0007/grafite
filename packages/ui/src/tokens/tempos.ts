// Tempos de interação usados pelo código (não pelo CSS), em ms. Vêm do Apêndice B da spec
// mestre; o da dica foi definido no F0 e entra no apêndice na atualização final.
export const tempos = {
  dica: { atraso: 700 },
  /**
   * Cartão da referência: abre com o ponteiro parado sobre ela, e fecha um pouco depois de o
   * ponteiro sair dela e do cartão, para dar tempo de passar de um ao outro.
   */
  cartao: { abrir: 500, fechar: 300 },
  /** Submenu: abre depois de o ponteiro parar sobre o item. */
  menu: { abrirSubmenu: 150 },
  /**
   * Aviso: o que não é crítico some em 6 s de fábrica, ou no tempo que o usuário escolher entre
   * as opções (com pausa no hover e no foco); no máximo 3 na tela.
   */
  aviso: { temporario: 6000, opcoes: [6000, 10000, 20000], maximoNaTela: 3 },
  /**
   * Busca: um provedor de módulo só é chamado depois de uma pausa na digitação, e a busca desiste
   * dele depois do limite.
   */
  busca: { pausaDoProvedor: 150, limiteDoProvedor: 5000 },
  /**
   * Dock: o menu abre com o ponteiro parado sobre o item; com outro menu aberto, troca mais
   * rápido; fecha um pouco depois de o ponteiro sair; o ocultar automático esconde depois de sair.
   */
  dock: { abrirMenu: 150, trocarMenu: 60, fecharMenus: 320, esconder: 650 },
  /** Chegada: o carregamento só aparece se ela passar deste tempo, também no primeiro acesso. */
  chegada: { mostrarDepoisDe: 500 },
  /** PWA: a aplicação procura versão nova ao abrir e a cada intervalo destes. */
  pwa: { conferirVersao: 60 * 60 * 1000 },
} as const;
