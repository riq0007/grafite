// Ocultar automático do dock (design, decisão 8): o dock esconde um pouco depois de o ponteiro
// sair e reaparece pela faixa da borda. Nunca esconde com o ponteiro em cima, com o foco do
// teclado dentro ou com um menu aberto.
import { tempos } from '../tokens/tempos.ts';

export interface OcultarDoDock {
  readonly visivel: boolean;
  /** Liga ou desliga o ocultar automático (preferência do usuário). */
  ligar(ligado: boolean): void;
  /** O ponteiro chegou à faixa de revelar, na borda do dock escondido. */
  entrarNaFaixa(): void;
  entrarNoDock(): void;
  sairDoDock(): void;
  focoEntrou(): void;
  focoSaiu(): void;
  menuAbriu(): void;
  menuFechou(): void;
  /** Cancela o temporizador pendente, ao desmontar o dock. */
  descartar(): void;
}

export interface OpcoesDoOcultarDoDock {
  ligado: boolean;
  /** Chamado cada vez que o dock aparece ou esconde. */
  aoMudar: (visivel: boolean) => void;
}

export function criarOcultarDoDock({ ligado, aoMudar }: OpcoesDoOcultarDoDock): OcultarDoDock {
  let estaLigado = ligado;
  let visivel = !ligado;
  let ponteiroNoDock = false;
  let comFoco = false;
  let comMenu = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const cancelar = () => {
    clearTimeout(temporizador);
    temporizador = undefined;
  };
  const definir = (novo: boolean) => {
    if (novo === visivel) return;
    visivel = novo;
    aoMudar(novo);
  };
  const mostrar = () => {
    cancelar();
    definir(true);
  };
  const talvezEsconder = () => {
    if (!estaLigado || ponteiroNoDock || comFoco || comMenu) return;
    cancelar();
    temporizador = setTimeout(() => definir(false), tempos.dock.esconder);
  };

  return {
    get visivel() {
      return visivel;
    },
    ligar(novo) {
      estaLigado = novo;
      if (novo) talvezEsconder();
      else mostrar();
    },
    entrarNaFaixa() {
      if (estaLigado) mostrar();
    },
    entrarNoDock() {
      ponteiroNoDock = true;
      mostrar();
    },
    sairDoDock() {
      ponteiroNoDock = false;
      talvezEsconder();
    },
    focoEntrou() {
      comFoco = true;
      mostrar();
    },
    focoSaiu() {
      comFoco = false;
      talvezEsconder();
    },
    menuAbriu() {
      comMenu = true;
      mostrar();
    },
    menuFechou() {
      comMenu = false;
      talvezEsconder();
    },
    descartar() {
      cancelar();
    },
  };
}
