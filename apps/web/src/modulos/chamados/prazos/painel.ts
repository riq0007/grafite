// O painel dos prazos (spec modulo-chamados, "Prazos"; change chamados-da-ti, design, "O painel dos
// prazos (tarefa 5.16)"; mockup m06): a barra do prazo em proporção, as ações pela permissão e a
// mensagem pronta para quem pediu, pela situação do prazo no momento da tela.
import { type ArvoreDeLocais, nomeCurto, type SituacaoDoPrazo } from '@grafite/domain';
import type { DataHora } from '@grafite/ui';
import { diaDe } from '../chamado/prazo.ts';
import type { ChamadoNosPrazos, ColunaDoQuadro } from '../consultas.ts';
import { chamadoArrastado } from '../quadro/arraste.ts';
import { acoesDoChamado, type PessoaParaPassar, pessoasParaPassar } from '../quadro/previa.ts';
import type { TomDaBarra } from './lista.ts';

/** A barra do painel, em porcentagem: o gasto, o que resta e o além do prazo somam 100. */
export interface BarraDoPainel {
  tom: TomDaBarra;
  gasto: number;
  resta: number;
  estouro: number;
}

/**
 * A barra do prazo no painel, em proporção do prazo, e não na escala da lista: o que o relógio
 * contou e o que resta, ou, depois do prazo, o prazo e o além dele, hachurado. A cor é a da lista:
 * a de perigo no estourado e a de atenção no que vence em até 2 h.
 */
export function barraDoPainel({ contadoS, prazoS, grupo }: SituacaoDoPrazo): BarraDoPainel {
  const tom: TomDaBarra =
    grupo === 'estourado' ? 'critico' : grupo === 'ate-2-horas' ? 'atencao' : 'neutro';
  if (contadoS > prazoS) {
    const gasto = prazoS > 0 ? (prazoS / contadoS) * 100 : 0;
    return { tom, gasto, resta: 0, estouro: 100 - gasto };
  }
  const gasto = prazoS > 0 ? (Math.max(0, contadoS) / prazoS) * 100 : 0;
  return { tom, gasto, resta: 100 - gasto, estouro: 0 };
}

/** O que o painel oferece a quem o abre. */
export interface AcoesDoPainel {
  /** A mensagem pronta e o "Avisar". */
  avisar: boolean;
  /** As pessoas de "Passar para…"; sem nenhuma, o grupo não aparece. */
  pessoas: PessoaParaPassar[];
}

/**
 * As ações do painel: a quem só vê os chamados, nenhuma. A quem atende, o "Avisar" e as pessoas
 * de "Passar para…", as da prévia do quadro, com a coluna do chamado achada pela conta de quem o
 * atende; sem o quadro ainda, sem as pessoas. A permissão é a geral, como na prévia do quadro: o
 * local de cada chamado, a API confere.
 */
export function acoesDoPainel(
  chamado: ChamadoNosPrazos,
  {
    podeAtender,
    conta,
    colunas,
    arvore,
  }: {
    podeAtender: boolean;
    conta: string | null;
    colunas: readonly ColunaDoQuadro[] | null;
    arvore?: ArvoreDeLocais;
  },
): AcoesDoPainel {
  if (!podeAtender) return { avisar: false, pessoas: [] };
  if (!colunas || !acoesDoChamado(chamado, conta).passar) return { avisar: true, pessoas: [] };
  const responsavel = chamado.responsavel?.conta;
  const coluna = colunas.find((uma) => responsavel !== undefined && uma.conta === responsavel);
  return {
    avisar: true,
    pessoas: pessoasParaPassar(colunas, chamadoArrastado(chamado, coluna ?? null), arvore),
  };
}

const MINUTO_MS = 60_000;

/**
 * A hora da próxima posição: a primeira meia hora cheia a partir de 30 min depois de agora, no
 * fuso de quem olha ("10:30" às 09:40 e às 10:00; "11:00" às 10:05).
 */
function horaDaPosicao(agora: Date, dataHora: Pick<DataHora, 'formatarHora'>): Date {
  const depois = Math.ceil((agora.getTime() + 30 * MINUTO_MS) / MINUTO_MS) * MINUTO_MS;
  const minutos = Number(dataHora.formatarHora(new Date(depois)).slice(-2));
  return new Date(depois + ((30 - (minutos % 30)) % 30) * MINUTO_MS);
}

/** "até as 10:30" hoje; noutro dia, como no detalhe do prazo: "até amanhã às 00:30". */
function ate(momento: Date, agora: Date, dataHora: DataHora): string {
  const dia = diaDe(momento, agora, dataHora);
  const hora = dataHora.formatarHora(momento);
  return dia === null ? `até as ${hora}` : `até ${dia} às ${hora}`;
}

/**
 * A mensagem pronta para quem pediu, pela situação do prazo agora, com o primeiro nome dela e o de
 * quem atende, "na fila da TI" na triagem e "comigo" com a própria conta (spec modulo-chamados,
 * "Prazos").
 */
export function mensagemPronta({
  chamado: { pessoa, responsavel },
  situacao,
  conta,
  agora,
  dataHora,
}: {
  chamado: Pick<ChamadoNosPrazos, 'pessoa' | 'responsavel'>;
  situacao: SituacaoDoPrazo | null;
  conta: string | null;
  agora: Date;
  dataHora: DataHora;
}): string {
  const nome = nomeCurto(pessoa.nome);
  if (situacao?.grupo === 'parado') {
    return `${nome}, o chamado está esperando a sua resposta. Assim que você responder, a TI retoma o atendimento.`;
  }
  const onde =
    responsavel === null
      ? 'na fila da TI'
      : responsavel.conta === conta
        ? 'comigo'
        : `com ${nomeCurto(responsavel.nome)}`;
  const posicao = `Voltamos com uma posição ${ate(horaDaPosicao(agora, dataHora), agora, dataHora)}.`;
  if (situacao === null) return `${nome}, o chamado está ${onde}. ${posicao}`;
  if (situacao.grupo === 'estourado') {
    const ja = responsavel === null ? '' : 'já ';
    return `${nome}, o chamado passou do prazo e ${ja}está ${onde}. ${posicao}`;
  }
  const previsao = situacao.vencimento
    ? ` A previsão é resolver ${ate(situacao.vencimento, agora, dataHora)}.`
    : ` ${posicao}`;
  return `${nome}, o chamado está ${onde}.${previsao}`;
}
