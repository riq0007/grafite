// A chegada (F1c, design, decisão 2): as etapas reais do carregamento, em ordem, a barra e o limite
// de 500 ms, e o estado da chegada no <html>, que o CSS da casca lê. A lista de etapas é aberta: o
// F2 e o P3 acrescentam as suas ("Validando sessão", "Conectando alertas") sem mudar este arquivo,
// e a que só vale em parte das chegadas, como a dos alertas, que só vale com a sessão, diz quando.
import {
  MOSTRAR_CARREGAMENTO_DEPOIS_DE,
  type SituacaoDoCarregamento,
} from '@grafite/ui/carregamento';

export type { SituacaoDoCarregamento };

/** A primeira etapa, ativa desde o começo: o download e o início da aplicação. */
export const CARREGANDO_O_GRAFITE = 'Carregando o Grafite';

export interface EtapaDaChegada {
  /** O que a chegada espera, em texto, como "Validando sessão". */
  rotulo: string;
  /**
   * Termina quando a espera termina de verdade, e nunca por tempo. Não falha: uma etapa que depende
   * do servidor termina também sem ele, porque a chegada não espera o servidor.
   */
  pronta: () => Promise<void>;
  /**
   * Se a etapa vale nesta chegada, perguntado na vez dela; sem valer, ela termina na hora e o
   * carregamento não a mostra. Sem isto, ela sempre vale.
   */
  vale?: () => boolean;
}

export type EstadoDaChegada = 'carregando' | 'boas-vindas' | 'entrada' | 'montando' | 'pronta';

export function marcarChegada(estado: EstadoDaChegada): void {
  document.documentElement.setAttribute('data-chegada', estado);
}

export interface OpcoesDoCarregamento {
  /** A última espera, a de "Pronto": a casca desenhada e as fontes carregadas. */
  pronto: () => Promise<void>;
  /** Quando a chegada começou, no relógio de `agora`. */
  inicio: number;
  agora: () => number;
  /** Cada mudança da etapa, da barra ou da camada. */
  aoMudar: (situacao: SituacaoDoCarregamento) => void;
}

/**
 * Passa pelas etapas em ordem, terminando sempre em "Pronto", e avisa cada mudança. A camada só
 * aparece se a chegada passar de 500 ms. Resolve quando "Pronto" termina, dizendo se a camada chegou
 * a aparecer; o que vem depois (boas-vindas ou a casca) é decisão de quem chamou.
 */
export async function carregar(
  etapas: readonly EtapaDaChegada[],
  { pronto, inicio, agora, aoMudar }: OpcoesDoCarregamento,
): Promise<{ apareceu: boolean }> {
  const todas: EtapaDaChegada[] = [...etapas, { rotulo: 'Pronto', pronta: pronto }];
  const limite = MOSTRAR_CARREGAMENTO_DEPOIS_DE;
  let concluidas = 0;
  let visivel = agora() - inicio >= limite;
  const vale = (etapa: EtapaDaChegada) => etapa.vale?.() ?? true;
  const avisar = () => {
    // A etapa da vez é a primeira ainda por concluir que vale nesta chegada; "Pronto" sempre vale.
    let daVez = Math.min(concluidas, todas.length - 1);
    while (daVez < todas.length - 1 && !vale(todas[daVez] as EtapaDaChegada)) daVez += 1;
    aoMudar({
      etapa: (todas[daVez] as EtapaDaChegada).rotulo,
      progresso: Math.max(concluidas, daVez) / todas.length,
      visivel,
    });
  };

  marcarChegada('carregando');
  avisar();
  let aparecer: ReturnType<typeof setTimeout> | undefined;
  // O navegador trunca o atraso do setTimeout para ms inteiros: a espera é arredondada para cima e
  // conferida de novo, para a camada nunca aparecer antes dos 500 ms.
  const esperarParaAparecer = () => {
    const falta = limite - (agora() - inicio);
    if (falta > 0) {
      aparecer = setTimeout(esperarParaAparecer, Math.ceil(falta));
      return;
    }
    visivel = true;
    avisar();
  };
  if (!visivel) esperarParaAparecer();
  try {
    for (const etapa of todas) {
      if (vale(etapa)) await etapa.pronta();
      concluidas += 1;
      avisar();
    }
  } finally {
    clearTimeout(aparecer);
  }
  return { apareceu: visivel };
}
