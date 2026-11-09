// Fila dos avisos da tela (toasts). Quem aparece é decidido pela fila própria (filaDosAvisos.ts):
// no máximo três, e um persistente (o crítico e os que pedem decisão) nunca sai da tela por causa
// de outro aviso. A fila do React Aria só
// desenha os que estão na tela, e continua cuidando da pausa com o ponteiro ou o foco, do anúncio
// ao leitor de tela e do tempo, que só começa quando o aviso aparece (design do F1b, decisão 6).
import { UNSTABLE_ToastQueue as ToastQueue } from 'react-aria-components';
import { tempos } from '../../tokens/tempos.ts';
import {
  chegar,
  type EstadoDaFila,
  FILA_VAZIA,
  type MudancaDaFila,
  sair,
} from './filaDosAvisos.ts';

export type SituacaoDoAviso = 'info' | 'sucesso' | 'atencao' | 'critico';

export interface Aviso {
  situacao: SituacaoDoAviso;
  titulo: string;
  descricao?: string;
  /**
   * Uma ação com nome próprio, como "Atualizar": o botão primário do aviso, antes de "Fechar".
   * Escolhida, ela acontece e o aviso sai da tela.
   */
  acao?: { rotulo: string; aoEscolher: () => void };
  /**
   * Fica na tela até a pessoa agir ou fechar, qualquer que seja a severidade e o tempo escolhido,
   * como a versão nova da aplicação. O crítico é sempre persistente.
   */
  persistente?: boolean;
  /**
   * Quanto este aviso temporário fica na tela, em ms, no lugar do tempo escolhido, como o aviso de
   * exemplo dos padrões em edição. Não vale para o crítico nem para o persistente.
   */
  duracao?: number;
  /** Leva ao registro de que o aviso fala; o aviso mostra "Abrir". */
  aoAbrir?: () => void;
  /** Crítico: a pessoa reconhece que viu e vai tratar. Sem ele, o botão não aparece. */
  aoReconhecer?: () => void;
  /** Crítico: a pessoa adia; quem avisa decide quando lembrar de novo. Sem ele, não aparece. */
  aoAdiar?: () => void;
  /** O texto do botão de adiar, como "Adiar 15 min"; sem ele, "Adiar". */
  rotuloDoAdiar?: string;
}

/** O aviso como a região o recebe: com a chave na fila própria. */
export interface AvisoNaRegiao extends Aviso {
  chave: string;
}

/**
 * A fila do React Aria, avisando cada aviso fechado só depois de tirá-lo da lista: o `onClose` dela
 * roda antes, e acrescentar um aviso ali desloca o índice que ela vai remover.
 */
class FilaDaRegiao extends ToastQueue<AvisoNaRegiao> {
  aoFechar: (chaveNaRegiao: string) => void = () => {};

  override close(chaveNaRegiao: string) {
    super.close(chaveNaRegiao);
    this.aoFechar(chaveNaRegiao);
  }
}

const ehPersistente = (aviso: Aviso) => aviso.situacao === 'critico' || aviso.persistente === true;

export class FilaDeAvisos {
  /** A fila que a região desenha: só os avisos que estão na tela. */
  readonly doReactAria: ToastQueue<AvisoNaRegiao>;
  /** Quanto o aviso temporário fica na tela, em ms; vale para os que aparecem depois da troca. */
  duracaoDoTemporario: number;
  #estado: EstadoDaFila = FILA_VAZIA;
  #avisos = new Map<string, Aviso>();
  #duracoes = new Map<string, number | undefined>();
  /** Chave na fila própria → chave na fila do React Aria, para os avisos na tela. */
  #naRegiao = new Map<string, string>();
  #contador = 0;

  constructor(duracaoDoTemporario: number) {
    this.duracaoDoTemporario = duracaoDoTemporario;
    const regiao = new FilaDaRegiao({ maxVisibleToasts: tempos.aviso.maximoNaTela });
    regiao.aoFechar = (chaveNaRegiao) => {
      for (const [chave, naRegiao] of this.#naRegiao) {
        if (naRegiao === chaveNaRegiao) this.#fechadoNaRegiao(chave);
      }
    };
    this.doReactAria = regiao;
  }

  /** Os avisos à vista, o mais novo primeiro, com o tempo com que entraram. */
  get naTela(): Array<{ chave: string; aviso: Aviso; duracao: number | undefined }> {
    return this.#estado.naTela.map(({ chave }) => ({
      chave,
      aviso: this.#avisos.get(chave) as Aviso,
      duracao: this.#duracoes.get(chave),
    }));
  }

  /** As chaves dos avisos que esperam vaga. */
  get esperando(): string[] {
    return this.#estado.esperando.map(({ chave }) => chave);
  }

  avisar(aviso: Aviso): string {
    this.#contador += 1;
    const chave = `aviso-${this.#contador}`;
    this.#avisos.set(chave, aviso);
    this.#aplicar(chegar(this.#estado, { chave, persistente: ehPersistente(aviso) }));
    return chave;
  }

  /** Tira um aviso da tela ou da espera. */
  fechar(chave: string): void {
    const naRegiao = this.#naRegiao.get(chave);
    if (naRegiao) this.doReactAria.close(naRegiao);
    else this.#aplicar(sair(this.#estado, chave));
  }

  #aplicar({ estado, entram, saem }: MudancaDaFila) {
    this.#estado = estado;
    for (const chave of saem) {
      const naRegiao = this.#naRegiao.get(chave);
      this.#naRegiao.delete(chave);
      if (naRegiao) this.doReactAria.close(naRegiao);
      this.#avisos.delete(chave);
      this.#duracoes.delete(chave);
    }
    for (const { chave } of entram) {
      const aviso = this.#avisos.get(chave);
      if (!aviso) continue;
      const duracao = ehPersistente(aviso)
        ? undefined
        : (aviso.duracao ?? this.duracaoDoTemporario);
      this.#duracoes.set(chave, duracao);
      const naRegiao = this.doReactAria.add({ ...aviso, chave }, { timeout: duracao });
      this.#naRegiao.set(chave, naRegiao);
    }
    // Quem saiu da espera sem aparecer também deixa de existir.
    for (const chave of this.#avisos.keys()) {
      const naFila =
        this.#estado.naTela.some((aviso) => aviso.chave === chave) ||
        this.#estado.esperando.some((aviso) => aviso.chave === chave);
      if (!naFila) this.#avisos.delete(chave);
    }
  }

  /** A região fechou o aviso (tempo, fechar ou uma ação): ele sai e dá a vez ao próximo. */
  #fechadoNaRegiao(chave: string) {
    if (!this.#naRegiao.has(chave)) return;
    this.#naRegiao.delete(chave);
    this.#aplicar(sair(this.#estado, chave));
  }
}

export function criarFilaDeAvisos({
  duracaoDoTemporario = tempos.aviso.temporario,
}: {
  duracaoDoTemporario?: number;
} = {}): FilaDeAvisos {
  return new FilaDeAvisos(duracaoDoTemporario);
}

/** Fila padrão do aplicativo. */
export const filaDeAvisos = criarFilaDeAvisos();

/** Mostra um aviso e devolve a chave dele na fila. O crítico e o persistente não somem sozinhos. */
export function avisar(aviso: Aviso, fila: FilaDeAvisos = filaDeAvisos): string {
  return fila.avisar(aviso);
}
