// As ações do atendimento (spec chamados, "Ações do atendimento" e "Situação e quem atende"; change
// chamados-da-ti, design, decisão 4): a matriz situação × ação, a mudança que a rota aplica, com o
// efeito no relógio e os eventos da conversa, e a recusa com a frase da spec. As ações que mudam
// quem atende: assumir, passar, devolver à triagem e o desfazer do assumir.
import { nomeCurto } from '../pessoas/pessoa.ts';
import {
  type AlcanceDeQuemAtende,
  atendeOChamado,
  type ContaQueAtendePorPadrao,
} from './atendimento.ts';

/** As situações do chamado, na ordem da tela, com os textos do banco. */
export const SITUACOES_DO_CHAMADO = [
  'triagem',
  'em-atendimento',
  'aguardando',
  'resolvido',
] as const;
export type SituacaoDoChamado = (typeof SITUACOES_DO_CHAMADO)[number];

/** As ações da matriz. */
export const ACOES_DO_CHAMADO = ['assumir', 'passar', 'devolver'] as const;
export type AcaoDoChamado = (typeof ACOES_DO_CHAMADO)[number];

/** O que a ação faz com o relógio: segue como estava, para ou volta a contar. */
export type EfeitoNoRelogio = 'segue' | 'para' | 'volta';

/** Com quem o chamado fica: quem age, a conta escolhida ou ninguém. */
export type QuemFica = 'quem-age' | 'escolhida' | 'ninguem';

/** A recusa da célula, que vale para toda conta. */
export type RecusaDaCelula = 'resolvido' | 'ja-na-triagem' | 'aguardando';

/** Uma célula da matriz: a situação de chegada, com quem o chamado fica e o relógio, ou a recusa. */
export type CelulaDaAcao =
  | { chega: SituacaoDoChamado; fica: QuemFica; relogio: EfeitoNoRelogio }
  | { recusa: RecusaDaCelula };

/** A tabela da spec, ação por ação, situação de partida por situação de partida. */
export const MATRIZ_DAS_ACOES: Readonly<
  Record<AcaoDoChamado, Readonly<Record<SituacaoDoChamado, CelulaDaAcao>>>
> = {
  assumir: {
    triagem: { chega: 'em-atendimento', fica: 'quem-age', relogio: 'segue' },
    'em-atendimento': { chega: 'em-atendimento', fica: 'quem-age', relogio: 'segue' },
    aguardando: { chega: 'aguardando', fica: 'quem-age', relogio: 'segue' },
    resolvido: { recusa: 'resolvido' },
  },
  passar: {
    triagem: { chega: 'em-atendimento', fica: 'escolhida', relogio: 'segue' },
    'em-atendimento': { chega: 'em-atendimento', fica: 'escolhida', relogio: 'segue' },
    aguardando: { chega: 'aguardando', fica: 'escolhida', relogio: 'segue' },
    resolvido: { recusa: 'resolvido' },
  },
  devolver: {
    triagem: { recusa: 'ja-na-triagem' },
    'em-atendimento': { chega: 'triagem', fica: 'ninguem', relogio: 'segue' },
    aguardando: { recusa: 'aguardando' },
    resolvido: { recusa: 'resolvido' },
  },
};

/** Um local do chamado, com o nome que as recusas citam. */
export interface LocalDoChamado {
  id: string;
  nome: string;
}

/** O chamado como as ações o leem. */
export interface ChamadoParaAcao {
  numero: number;
  situacao: SituacaoDoChamado;
  /** A conta de quem atende, ou nulo, na triagem. */
  responsavel: string | null;
  /** O nome da pessoa que pediu, que o aguardando cita. */
  pessoa: string;
  /** Os locais do chamado, na ordem dele: o da pessoa e o do ativo. */
  locais: readonly LocalDoChamado[];
  semLocal: boolean;
  versao: number;
}

/** Quem age, com o alcance de `chamados.atender` da conta. */
export interface QuemAge {
  id: string;
  alcance: AlcanceDeQuemAtende;
}

/** A conta que recebe o chamado, como está agora: a escolhida ou a de antes do assumir. */
export interface ContaQueRecebe extends ContaQueAtendePorPadrao {
  nome: string;
}

export type PedidoDeAcao =
  | { acao: 'assumir' }
  | { acao: 'passar'; para: ContaQueRecebe }
  | { acao: 'devolver' };

/**
 * O desfazer do assumir: a versão, que o cliente manda, e o estado de antes, que a rota lê do evento
 * `assumiu` que ela mesma gravou, e não do cliente.
 */
export interface PedidoDeDesfazer {
  /** A versão que o assumir deixou. */
  versao: number;
  /**
   * A situação e quem estava com o chamado antes do assumir: o `de` do evento e, com ele nulo, a
   * triagem; a conta, como está agora.
   */
  antes: { situacao: SituacaoDoChamado; responsavel: ContaQueRecebe | null };
}

/** O evento da conversa, com as contas nos dados; quem agiu é o autor dele. */
export type EventoDaAcao =
  | { evento: 'assumiu'; dados: { de: string | null } }
  | { evento: 'passou'; dados: { de: string | null; para: string } }
  | { evento: 'devolveu'; dados: { de: string } }
  | { evento: 'desfez'; dados: { para: string | null } };

/** O que a rota aplica no chamado. */
export interface MudancaDoChamado {
  situacao: SituacaoDoChamado;
  /** A conta de quem atende depois, ou nulo, na triagem. */
  responsavel: string | null;
  relogio: EfeitoNoRelogio;
  sobeAVersao: boolean;
  eventos: readonly EventoDaAcao[];
}

/** Por que a ação não acontece; `mensagemDaRecusaDaAcao` escreve a frase. */
export type RecusaDaAcao =
  | { motivo: 'resolvido' }
  | { motivo: 'ja-na-triagem' }
  | { motivo: 'aguardando'; pessoa: string }
  | { motivo: 'ja-esta-com-voce' }
  | { motivo: 'ja-esta-com'; nome: string }
  /** O local é o primeiro do chamado fora do alcance; nulo, a organização inteira. */
  | { motivo: 'voce-nao-atende'; local: string | null }
  | { motivo: 'nao-atende'; nome: string; local: string | null }
  | { motivo: 'mudou' };

export type DecisaoDaAcao =
  | ({ aceita: true } & MudancaDoChamado)
  | { aceita: false; recusa: RecusaDaAcao };

const recusada = (recusa: RecusaDaAcao): DecisaoDaAcao => ({ aceita: false, recusa });

const idsDosLocais = (chamado: ChamadoParaAcao) => ({
  locais: chamado.locais.map((local) => local.id),
  semLocal: chamado.semLocal,
});

/**
 * O local que a recusa cita: o primeiro do chamado fora do alcance. Sem alcance, o primeiro do
 * chamado; com todos os locais no alcance, o que falta é a organização inteira (nulo).
 */
function localDeFora(alcance: AlcanceDeQuemAtende, chamado: ChamadoParaAcao): string | null {
  const fora =
    alcance === null || alcance === 'organizacao'
      ? chamado.locais[0]
      : chamado.locais.find((local) => !alcance.has(local.id));
  return fora?.nome ?? null;
}

function recusaDeQuemAge(quemAge: QuemAge, chamado: ChamadoParaAcao): RecusaDaAcao | null {
  if (atendeOChamado(quemAge.alcance, idsDosLocais(chamado))) return null;
  return { motivo: 'voce-nao-atende', local: localDeFora(quemAge.alcance, chamado) };
}

/** Só a conta ativa que atende todos os locais do chamado o recebe. */
function recusaDeQuemRecebe(conta: ContaQueRecebe, chamado: ChamadoParaAcao): RecusaDaAcao | null {
  if (conta.ativa && atendeOChamado(conta.alcance, idsDosLocais(chamado))) return null;
  const alcance = conta.ativa ? conta.alcance : null;
  return { motivo: 'nao-atende', nome: conta.nome, local: localDeFora(alcance, chamado) };
}

function recusaDaCelula(recusa: RecusaDaCelula, chamado: ChamadoParaAcao): RecusaDaAcao {
  return recusa === 'aguardando'
    ? { motivo: 'aguardando', pessoa: chamado.pessoa }
    : { motivo: recusa };
}

/**
 * Decide a ação pela matriz. Quem age precisa atender os locais do chamado, antes de qualquer
 * célula. Assumir o chamado que já está com quem assume e passar a quem já o atende são recusados;
 * a conta escolhida precisa estar ativa e atender os locais.
 */
export function decidirAcao(
  chamado: ChamadoParaAcao,
  quemAge: QuemAge,
  pedido: PedidoDeAcao,
): DecisaoDaAcao {
  const daConta = recusaDeQuemAge(quemAge, chamado);
  if (daConta) return recusada(daConta);
  const celula = MATRIZ_DAS_ACOES[pedido.acao][chamado.situacao];
  if ('recusa' in celula) return recusada(recusaDaCelula(celula.recusa, chamado));
  const de = chamado.responsavel;
  let escolhida: string | null = null;
  let evento: EventoDaAcao;
  switch (pedido.acao) {
    case 'assumir':
      if (de === quemAge.id) return recusada({ motivo: 'ja-esta-com-voce' });
      evento = { evento: 'assumiu', dados: { de } };
      break;
    case 'passar': {
      const { para } = pedido;
      if (para.id === de) {
        return recusada(
          para.id === quemAge.id
            ? { motivo: 'ja-esta-com-voce' }
            : { motivo: 'ja-esta-com', nome: para.nome },
        );
      }
      const naoRecebe = recusaDeQuemRecebe(para, chamado);
      if (naoRecebe) return recusada(naoRecebe);
      escolhida = para.id;
      evento = { evento: 'passou', dados: { de, para: para.id } };
      break;
    }
    case 'devolver':
      // A matriz só devolve o chamado em atendimento, que o banco garante com alguém.
      if (de === null) throw new Error(`O chamado #${chamado.numero} em atendimento sem ninguém.`);
      evento = { evento: 'devolveu', dados: { de } };
      break;
  }
  const quemFicaComEle: Record<QuemFica, string | null> = {
    'quem-age': quemAge.id,
    escolhida,
    ninguem: null,
  };
  return {
    aceita: true,
    situacao: celula.chega,
    responsavel: quemFicaComEle[celula.fica],
    relogio: celula.relogio,
    sobeAVersao: true,
    eventos: [evento],
  };
}

/**
 * Desfaz o assumir, se nada que muda a situação ou quem atende aconteceu depois: a versão é a que o
 * assumir deixou, o chamado continua com quem desfaz, e o estado de antes é um dos que o assumir
 * deixa (a triagem sem ninguém, ou o atendimento e o aguardando com outra conta). A conta de antes
 * precisa atender os locais agora. Como o assumir não mexe no relógio, o desfazer também não.
 */
export function decidirDesfazer(
  chamado: ChamadoParaAcao,
  quemAge: QuemAge,
  { versao, antes }: PedidoDeDesfazer,
): DecisaoDaAcao {
  const daConta = recusaDeQuemAge(quemAge, chamado);
  if (daConta) return recusada(daConta);
  const celula = MATRIZ_DAS_ACOES.assumir[antes.situacao];
  const assumidoDaquele =
    chamado.versao === versao &&
    chamado.responsavel === quemAge.id &&
    'chega' in celula &&
    celula.chega === chamado.situacao &&
    (antes.situacao === 'triagem') === (antes.responsavel === null) &&
    antes.responsavel?.id !== quemAge.id;
  if (!assumidoDaquele) return recusada({ motivo: 'mudou' });
  if (antes.responsavel !== null) {
    const naoRecebe = recusaDeQuemRecebe(antes.responsavel, chamado);
    if (naoRecebe) return recusada(naoRecebe);
  }
  const para = antes.responsavel?.id ?? null;
  return {
    aceita: true,
    situacao: antes.situacao,
    responsavel: para,
    relogio: 'segue',
    sobeAVersao: true,
    eventos: [{ evento: 'desfez', dados: { para } }],
  };
}

const dosChamados = (local: string | null) =>
  local === null ? 'os chamados da organização inteira' : `os chamados de ${local}`;

/** A frase da recusa, com o primeiro nome da pessoa e das contas. */
export function mensagemDaRecusaDaAcao(numero: number, recusa: RecusaDaAcao): string {
  switch (recusa.motivo) {
    case 'resolvido':
      return `O chamado #${numero} está resolvido.`;
    case 'ja-na-triagem':
      return `O chamado #${numero} já está na triagem.`;
    case 'aguardando':
      return `O chamado #${numero} está aguardando ${nomeCurto(recusa.pessoa)}. Passe a outra pessoa ou retome antes de devolver.`;
    case 'ja-esta-com-voce':
      return `O chamado #${numero} já está com você.`;
    case 'ja-esta-com':
      return `O chamado #${numero} já está com ${nomeCurto(recusa.nome)}.`;
    case 'voce-nao-atende':
      return `Você não atende ${dosChamados(recusa.local)}.`;
    case 'nao-atende':
      return `${nomeCurto(recusa.nome)} não atende ${dosChamados(recusa.local)}.`;
    case 'mudou':
      return 'O chamado mudou depois. Confira antes de desfazer.';
  }
}
