// Máquina dos menus em árvore do dock (design, decisão 8). As regras de tempo do Apêndice B
// ficam aqui, testáveis com relógio falso; o componente só liga a elas os eventos do ponteiro,
// do toque e do teclado.
import { tempos } from '../tokens/tempos.ts';

export interface MenusDoDock {
  /** Menu aberto, pelo id do item do dock, ou `null`. */
  readonly aberto: string | null;
  /** O ponteiro entrou num item; `temMenu` diz se o item abre um menu. */
  entrarNoItem(id: string, temMenu: boolean): void;
  sairDoItem(): void;
  entrarNoMenu(): void;
  sairDoMenu(): void;
  /** Toque e teclado: abre sem os atrasos do ponteiro. */
  abrirAgora(id: string): void;
  /** Esc, item escolhido, toque fora: fecha na hora e cancela o que estava para acontecer. */
  fecharAgora(): void;
  /** Cancela o temporizador pendente, ao desmontar o dock. */
  descartar(): void;
}

export interface OpcoesDosMenusDoDock {
  /** Chamado cada vez que o menu aberto muda. */
  aoMudar: (aberto: string | null) => void;
}

export function criarMenusDoDock({ aoMudar }: OpcoesDosMenusDoDock): MenusDoDock {
  let aberto: string | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const cancelar = () => {
    clearTimeout(temporizador);
    temporizador = undefined;
  };
  const definir = (id: string | null) => {
    cancelar();
    if (id === aberto) return;
    aberto = id;
    aoMudar(id);
  };
  const agendar = (id: string | null, espera: number) => {
    cancelar();
    temporizador = setTimeout(() => definir(id), espera);
  };

  return {
    get aberto() {
      return aberto;
    },
    entrarNoItem(id, temMenu) {
      const alvo = temMenu ? id : null;
      if (aberto === null) {
        if (alvo === null) cancelar();
        else agendar(alvo, tempos.dock.abrirMenu);
      } else if (alvo === aberto) {
        cancelar();
      } else {
        // Um item sem menu troca para "nenhum menu", no mesmo tempo da troca.
        agendar(alvo, tempos.dock.trocarMenu);
      }
    },
    sairDoItem() {
      if (aberto === null) cancelar();
      else agendar(null, tempos.dock.fecharMenus);
    },
    entrarNoMenu() {
      cancelar();
    },
    sairDoMenu() {
      if (aberto !== null) agendar(null, tempos.dock.fecharMenus);
    },
    abrirAgora(id) {
      definir(id);
    },
    fecharAgora() {
      definir(null);
    },
    descartar() {
      cancelar();
    },
  };
}
