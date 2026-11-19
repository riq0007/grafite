// O resumo dos tempos do resolvido (spec chamados, "Resumo dos tempos"; change chat-com-chamados,
// design, decisões 13 e 15): a abertura, a primeira resposta da TI e a resolução, em horas
// corridas, e quem atendeu. A leitura o monta para o evento do resolvido, e as duas telas o
// escrevem pelas mesmas linhas.
import { textoDoTempo } from '../indicadores/textos.ts';

/** O momento e o tempo desde a abertura, como "18 min". */
export interface TempoDesdeAAbertura {
  em: Date;
  tempo: string;
}

export interface ResumoDosTempos {
  abertoEm: Date;
  /** A primeira mensagem da TI para a pessoa; nula sem nenhuma, o "sem resposta". */
  primeiraResposta: TempoDesdeAAbertura | null;
  resolvido: TempoDesdeAAbertura;
  /** Quem resolveu. */
  atendeu: string;
}

const MS_POR_MINUTO = 60_000;

// Os minutos entre as horas como a tela as mostra, sem os segundos, para a conta fechar com elas:
// das 10:32:50 às 11:20:10 são 48 min, como de 10:32 a 11:20.
const minutosEntre = (de: Date, ate: Date) =>
  Math.max(0, Math.floor(ate.getTime() / MS_POR_MINUTO) - Math.floor(de.getTime() / MS_POR_MINUTO));

/**
 * O resumo dos tempos, em horas corridas, com a noite e o fim de semana, e o tempo como a tela o
 * escreve (`textoDoTempo`). A primeira resposta é a do chamado (`primeira_resposta_em`), a mesma do
 * prazo: a primeira mensagem da TI para a pessoa, também o "O que foi feito" do resolver.
 */
export function resumoDosTempos(pedido: {
  abertoEm: Date;
  primeiraRespostaEm: Date | null;
  resolvidoEm: Date;
  atendeu: string;
}): ResumoDosTempos {
  const desdeAAbertura = (em: Date): TempoDesdeAAbertura => ({
    em,
    tempo: textoDoTempo(minutosEntre(pedido.abertoEm, em)),
  });
  return {
    abertoEm: pedido.abertoEm,
    primeiraResposta: pedido.primeiraRespostaEm ? desdeAAbertura(pedido.primeiraRespostaEm) : null,
    resolvido: desdeAAbertura(pedido.resolvidoEm),
    atendeu: pedido.atendeu,
  };
}

/** Uma linha do resumo: o rótulo, a hora ou o nome, e o tempo, que vem depois da hora. */
export interface LinhaDoResumoDosTempos {
  rotulo: string;
  valor: string;
  tempo: string | null;
}

/** As linhas do resumo, com a hora como a tela a escreve (`hora`). */
export function linhasDoResumoDosTempos(
  resumo: ResumoDosTempos,
  hora: (em: Date) => string,
): LinhaDoResumoDosTempos[] {
  const { primeiraResposta } = resumo;
  return [
    { rotulo: 'Aberto', valor: hora(resumo.abertoEm), tempo: null },
    {
      rotulo: 'Primeira resposta da TI',
      valor: primeiraResposta ? hora(primeiraResposta.em) : 'sem resposta',
      tempo: primeiraResposta?.tempo ?? null,
    },
    { rotulo: 'Resolvido', valor: hora(resumo.resolvido.em), tempo: resumo.resolvido.tempo },
    { rotulo: 'Atendeu', valor: resumo.atendeu, tempo: null },
  ];
}
