// A lista dos prazos (spec modulo-chamados, "Prazos"; change chamados-da-ti, design, decisão 3 e "A
// lista dos prazos (tarefa 5.15)"; mockup m05): os grupos pela situação do prazo no momento da tela,
// que o contador anda a cada minuto, com o prazo ilegível por último, a ordem de cada grupo, os
// selos do alto, a escala e a barra de cada chamado, em segundos do relógio.
import {
  compararPrazos,
  type GrupoDoPrazo,
  type HorarioDaTi,
  type SituacaoDoPrazo,
} from '@grafite/domain';
import type { DataHora } from '@grafite/ui';
import type { ChamadoNosPrazos } from '../consultas.ts';
import type { ContarOPrazo } from '../prazo.ts';

/** Os grupos da tela: os do prazo e, por último, o do prazo ilegível. */
export type GrupoDaLista = GrupoDoPrazo | 'ilegivel';

const ORDEM_DOS_GRUPOS: readonly GrupoDaLista[] = [
  'estourado',
  'ate-2-horas',
  'hoje',
  'depois-de-hoje',
  'parado',
  'ilegivel',
];

/** Um chamado na lista, com a situação do prazo agora; nula, o prazo guardado não se lê. */
export interface LinhaDosPrazos {
  chamado: ChamadoNosPrazos;
  situacao: SituacaoDoPrazo | null;
}

export interface GrupoDosPrazos {
  grupo: GrupoDaLista;
  titulo: string;
  /** O que vem ao lado do título na faixa, como "até as 11:40". */
  apoio: string | null;
  linhas: LinhaDosPrazos[];
}

const MS_POR_HORA = 3_600_000;

/**
 * O limite do "Vence em até 2 horas", no fuso de quem olha: "até as 11:40", ou "até amanhã, 01:00"
 * depois da meia-noite, quando o "Vence hoje" fica vazio.
 */
function limiteDasDuasHoras(agora: Date, dataHora: Pick<DataHora, 'formatarHora' | 'grupoDoDia'>) {
  const limite = new Date(agora.getTime() + 2 * MS_POR_HORA);
  const hora = dataHora.formatarHora(limite);
  const hoje = dataHora.grupoDoDia(limite, agora) === 'Hoje';
  return { ate: hoje ? `até as ${hora}` : `até amanhã, ${hora}`, depois: `depois das ${hora}` };
}

/**
 * Os grupos na ordem da tela, só os que têm chamados. A situação de cada chamado sai do contador da
 * tela, e não do grupo da leitura, para o grupo, o texto e a ordem andarem juntos. No grupo, o
 * vencimento, e o empate, o número (`compararPrazos`); no parado, o que resta; no ilegível, o
 * número. Na lista compacta, a do painel aberto, o apoio do estourado e o do parado são os curtos
 * do m06.
 */
export function gruposDosPrazos(
  chamados: readonly ChamadoNosPrazos[],
  {
    horario,
    contar,
    agora,
    dataHora,
    compacto = false,
  }: {
    horario: HorarioDaTi;
    contar: ContarOPrazo;
    agora: Date;
    dataHora: Pick<DataHora, 'formatarHora' | 'grupoDoDia'>;
    compacto?: boolean;
  },
): GrupoDosPrazos[] {
  const porGrupo = new Map<GrupoDaLista, LinhaDosPrazos[]>();
  for (const chamado of chamados) {
    const situacao = chamado.relogio ? contar(chamado.relogio, horario) : null;
    const grupo = situacao?.grupo ?? 'ilegivel';
    porGrupo.set(grupo, [...(porGrupo.get(grupo) ?? []), { chamado, situacao }]);
  }
  const limite = limiteDasDuasHoras(agora, dataHora);
  const textos: Record<GrupoDaLista, Pick<GrupoDosPrazos, 'titulo' | 'apoio'>> = {
    estourado: {
      titulo: 'Estourado',
      apoio: compacto ? 'passou do prazo' : 'passou do prazo e ainda está aberto',
    },
    'ate-2-horas': { titulo: 'Vence em até 2 horas', apoio: limite.ate },
    hoje: { titulo: 'Vence hoje', apoio: limite.depois },
    'depois-de-hoje': { titulo: 'Vence depois de hoje', apoio: null },
    parado: {
      titulo: 'Relógio parado',
      apoio: compacto
        ? 'aguardando o colaborador'
        : 'aguardando o colaborador: o prazo volta a contar ao retomar',
    },
    ilegivel: { titulo: 'Prazo ilegível', apoio: 'o prazo guardado no chamado não se lê' },
  };
  return ORDEM_DOS_GRUPOS.flatMap((grupo) => {
    const linhas = porGrupo.get(grupo);
    if (!linhas) return [];
    linhas.sort(
      (a, b) =>
        (a.situacao && b.situacao ? compararPrazos(a.situacao, b.situacao) : 0) ||
        a.chamado.numero - b.chamado.numero,
    );
    return [{ grupo, ...textos[grupo], linhas }];
  });
}

/** Os grupos que têm selo no alto, na ordem do m05. */
type GrupoDoSelo = 'estourado' | 'ate-2-horas' | 'parado';

const TEXTO_DO_SELO: Record<GrupoDoSelo, (quantos: number) => string> = {
  estourado: (quantos) => `${quantos} ${quantos === 1 ? 'estourado' : 'estourados'}`,
  'ate-2-horas': (quantos) => `${quantos} ${quantos === 1 ? 'vence' : 'vencem'} em até 2 h`,
  parado: (quantos) => `${quantos} com o relógio parado`,
};

/** Os selos do alto, como "1 estourado": só os dos grupos com chamados. */
export function selosDosPrazos(
  grupos: readonly GrupoDosPrazos[],
): { selo: GrupoDoSelo; texto: string }[] {
  return (['estourado', 'ate-2-horas', 'parado'] as const).flatMap((selo) => {
    const quantos = grupos.find((grupo) => grupo.grupo === selo)?.linhas.length ?? 0;
    return quantos > 0 ? [{ selo, texto: TEXTO_DO_SELO[selo](quantos) }] : [];
  });
}

/** A escala da barra, em horas a partir do agora, como no m05. */
const ESCALA = { de: -10, ate: 8, passo: 2 } as const;

/** A posição de um momento da escala, em porcentagem da largura, cortada nas bordas. */
function posicao(horas: number): number {
  const cortado = Math.min(ESCALA.ate, Math.max(ESCALA.de, horas));
  return ((cortado - ESCALA.de) / (ESCALA.ate - ESCALA.de)) * 100;
}

/** Uma marca da escala: o texto, o lugar em porcentagem da largura e as horas a partir do agora. */
export interface MarcaDaEscala {
  texto: string;
  posicao: number;
  horas: number;
}

/** As marcas da escala, de 2 em 2 h: "−10 h", …, "agora", …, "+8 h". */
export const MARCAS_DA_ESCALA: readonly MarcaDaEscala[] = Array.from(
  { length: (ESCALA.ate - ESCALA.de) / ESCALA.passo + 1 },
  (_, indice) => {
    const horas = ESCALA.de + indice * ESCALA.passo;
    const texto = horas === 0 ? 'agora' : `${horas > 0 ? '+' : '−'}${Math.abs(horas)} h`;
    return { texto, posicao: posicao(horas), horas };
  },
);

/**
 * As marcas de cada forma da lista: de 2 em 2 h na inteira, de 4 em 4 h na compacta, a do painel
 * aberto (m06), e de 8 em 8 h na do Início (m12), que é a mais estreita.
 */
export const marcasDaEscala = (passo: 2 | 4 | 8): MarcaDaEscala[] =>
  MARCAS_DA_ESCALA.filter(({ horas }) => horas % passo === 0);

/** Um trecho da barra, em porcentagem da largura da escala. */
export interface Trecho {
  de: number;
  ate: number;
}

/** A cor da barra: a de perigo no estourado e a de atenção no que vence em até 2 h. */
export type TomDaBarra = 'critico' | 'atencao' | 'neutro';

export interface BarraDoPrazo {
  tom: TomDaBarra;
  /** O tempo já gasto: até o agora, ou, no estourado, até a marca do prazo. */
  gasto: Trecho;
  /** O tempo que resta, do agora até a marca; nulo no estourado. */
  resta: Trecho | null;
  /** O tempo além do prazo, hachurado, da marca até o agora; só no estourado. */
  estouro: Trecho | null;
  /** A marca do prazo do tipo. */
  marca: number;
  /** O prazo vence depois do fim da escala: a marca fica na borda, com a seta. */
  alemDaEscala: boolean;
}

const SEGUNDOS_POR_HORA = 3600;

/**
 * A barra do chamado, em horas do relógio do prazo a partir do agora (decisão 3): o contado para
 * trás e o que resta para a frente. O relógio parado fica sem a barra.
 */
export function barraDoPrazo(situacao: SituacaoDoPrazo): BarraDoPrazo | null {
  if (situacao.grupo === 'parado') return null;
  const inicio = posicao(-situacao.contadoS / SEGUNDOS_POR_HORA);
  const agora = posicao(0);
  const prazoEmHoras = situacao.restaS / SEGUNDOS_POR_HORA;
  if (situacao.grupo === 'estourado') {
    const marca = posicao(Math.min(0, prazoEmHoras));
    return {
      tom: 'critico',
      gasto: { de: inicio, ate: marca },
      resta: null,
      estouro: { de: marca, ate: agora },
      marca,
      alemDaEscala: false,
    };
  }
  const marca = posicao(Math.max(0, prazoEmHoras));
  return {
    tom: situacao.grupo === 'ate-2-horas' ? 'atencao' : 'neutro',
    gasto: { de: inicio, ate: agora },
    resta: { de: agora, ate: marca },
    estouro: null,
    marca,
    alemDaEscala: prazoEmHoras > ESCALA.ate,
  };
}

/** "Sandra Vieira · Renato": quem pediu e o primeiro nome de quem atende. */
export function quemNaLinha({ pessoa, responsavel }: ChamadoNosPrazos): string {
  const quemAtende = responsavel ? responsavel.nome.split(' ')[0] : 'sem responsável';
  return `${pessoa.nome} · ${quemAtende}`;
}
