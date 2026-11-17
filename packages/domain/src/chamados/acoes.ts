// As ações do atendimento (spec chamados, "Ações do atendimento", "Situação e quem atende" e
// "Conversa do chamado"; change chamados-da-ti, design, decisão 4): a matriz situação × ação, a
// mudança que a rota aplica, com o efeito no relógio, a primeira resposta e a conversa, na ordem, e
// a recusa com a frase da spec. As ações que mudam quem atende (assumir, passar, devolver à triagem
// e o desfazer do assumir) e as da conversa e do fim (a mensagem, a espera, a nota, retomar,
// resolver e reabrir).
import { lerTexto } from '../campos/textos.ts';
import { vazio } from '../campos/tipos.ts';
import { nomeCurto } from '../pessoas/pessoa.ts';
import {
  type AlcanceDeQuemAtende,
  atendeOChamado,
  type ContaQueAtendePorPadrao,
} from './atendimento.ts';
import type { CampoDoFormulario, Formulario } from './formulario.ts';
import { type HorarioDaTi, type ModoDoPrazo, segundosNoHorario } from './prazo.ts';
import { camposVisiveis, respostaDe } from './respostas.ts';
import type { RelogioDoChamado } from './situacao-do-prazo.ts';
import { nomeNoResumo } from './titulo-e-resumo.ts';

/** As situações do chamado, na ordem da tela, com os textos do banco. */
export const SITUACOES_DO_CHAMADO = [
  'triagem',
  'em-atendimento',
  'aguardando',
  'resolvido',
] as const;
export type SituacaoDoChamado = (typeof SITUACOES_DO_CHAMADO)[number];

/**
 * As origens do chamado, com os textos do banco. Nesta change, todo chamado nasce da TI; o chat e a
 * aba trazem as origens deles.
 */
export const ORIGENS_DO_CHAMADO = ['ti'] as const;
export type OrigemDoChamado = (typeof ORIGENS_DO_CHAMADO)[number];

/** As espécies da conversa: a mensagem para a pessoa, a nota interna e o evento. */
export const ESPECIES_DA_CONVERSA = ['mensagem', 'nota', 'evento'] as const;
export type EspecieDaConversa = (typeof ESPECIES_DA_CONVERSA)[number];

/** As ações da matriz, na ordem da tabela da spec. */
export const ACOES_DO_CHAMADO = [
  'assumir',
  'passar',
  'devolver',
  'mensagem',
  'esperar',
  'nota',
  'retomar',
  'resolver',
  'reabrir',
] as const;
export type AcaoDoChamado = (typeof ACOES_DO_CHAMADO)[number];

/** O que a ação faz com o relógio: segue como estava, para ou volta a contar. */
export type EfeitoNoRelogio = 'segue' | 'para' | 'volta';

/**
 * Com quem o chamado fica: quem age, a conta escolhida, ninguém, a mesma conta de antes ou quem
 * resolveu.
 */
export type QuemFica = 'quem-age' | 'escolhida' | 'ninguem' | 'mesma' | 'quem-resolveu';

/** A recusa da célula, que vale para toda conta. */
export type RecusaDaCelula =
  | 'resolvido'
  | 'ja-na-triagem'
  | 'aguardando'
  | 'nao-aguardando'
  | 'nao-resolvido';

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
  mensagem: {
    triagem: { chega: 'triagem', fica: 'mesma', relogio: 'segue' },
    'em-atendimento': { chega: 'em-atendimento', fica: 'mesma', relogio: 'segue' },
    aguardando: { chega: 'aguardando', fica: 'mesma', relogio: 'segue' },
    resolvido: { recusa: 'resolvido' },
  },
  esperar: {
    triagem: { chega: 'aguardando', fica: 'quem-age', relogio: 'para' },
    'em-atendimento': { chega: 'aguardando', fica: 'mesma', relogio: 'para' },
    aguardando: { chega: 'aguardando', fica: 'mesma', relogio: 'segue' },
    resolvido: { recusa: 'resolvido' },
  },
  nota: {
    triagem: { chega: 'triagem', fica: 'mesma', relogio: 'segue' },
    'em-atendimento': { chega: 'em-atendimento', fica: 'mesma', relogio: 'segue' },
    aguardando: { chega: 'aguardando', fica: 'mesma', relogio: 'segue' },
    resolvido: { recusa: 'resolvido' },
  },
  retomar: {
    triagem: { recusa: 'nao-aguardando' },
    'em-atendimento': { recusa: 'nao-aguardando' },
    aguardando: { chega: 'em-atendimento', fica: 'mesma', relogio: 'volta' },
    resolvido: { recusa: 'resolvido' },
  },
  resolver: {
    triagem: { chega: 'resolvido', fica: 'mesma', relogio: 'para' },
    'em-atendimento': { chega: 'resolvido', fica: 'mesma', relogio: 'para' },
    aguardando: { chega: 'resolvido', fica: 'mesma', relogio: 'segue' },
    resolvido: { recusa: 'resolvido' },
  },
  reabrir: {
    triagem: { recusa: 'nao-resolvido' },
    'em-atendimento': { recusa: 'nao-resolvido' },
    aguardando: { recusa: 'nao-resolvido' },
    // Quem resolveu e não atende mais os locais deixa o chamado na triagem (`decidirAcao`).
    resolvido: { chega: 'em-atendimento', fica: 'quem-resolveu', relogio: 'volta' },
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
  /** A conta de quem atende, ou nulo, na triagem e no resolvido da triagem. */
  responsavel: string | null;
  /**
   * Desde quando o chamado está com quem atende (o `responsavel_desde`) ou, sem ninguém, desde quando
   * está na triagem (`desdeNaTriagem`): o assumir o guarda no evento, para o "estava há 2 h na triagem".
   */
  desde: Date;
  /** O nome da pessoa que pediu, que o aguardando cita. */
  pessoa: string;
  /** Os locais do chamado, na ordem dele: o da pessoa e o do ativo. */
  locais: readonly LocalDoChamado[];
  semLocal: boolean;
  versao: number;
  /** Quando a TI escreveu à pessoa pela primeira vez, ou nulo, com a primeira resposta pendente. */
  primeiraRespostaEm: Date | null;
}

/** Quem age, com o alcance de `chamados.atender` da conta. */
export interface QuemAge {
  id: string;
  alcance: AlcanceDeQuemAtende;
}

/** A conta que recebe o chamado, como está agora: a escolhida, a de antes do assumir ou quem resolveu. */
export interface ContaQueRecebe extends ContaQueAtendePorPadrao {
  nome: string;
}

/** Os tetos da conversa: a mensagem e a nota, o "O que foi feito" da resolução e os anexos. */
export const LIMITES_DA_CONVERSA = { mensagem: 4000, feito: 2000, anexos: 5 } as const;

/** O texto que a ação escreve: a mensagem para a pessoa, a nota ou o "O que foi feito". */
export type TextoDaAcao = 'mensagem' | 'nota' | 'feito';

/**
 * As ações que a tela faz com a versão que mostra, pelos botões do quadro, dos prazos e da ficha: a
 * versão que o chamado não tem mais é recusada antes de tudo, e duas pessoas não agem no mesmo
 * chamado sem saber. A mensagem, a espera e a nota, do campo de escrever, não a levam.
 */
export type AcaoComVersao = 'assumir' | 'passar' | 'devolver' | 'retomar' | 'resolver' | 'reabrir';

/**
 * O pedido da ação. Como a conta escolhida do passar, o que só uma ação usa vem nele: o número de
 * anexos da mensagem, da espera e da nota; a cópia do formulário e as respostas do chamado, no
 * resolver; e quem resolveu, como a conta está agora, no reabrir, ou nulo, sem a conta. A versão das
 * ações dos botões é a que a tela mostra, quando ela a manda.
 */
export type PedidoDeAcao =
  | { acao: 'assumir' | 'devolver' | 'retomar'; versao?: number }
  | { acao: 'passar'; para: ContaQueRecebe; versao?: number }
  | { acao: 'mensagem' | 'esperar' | 'nota'; texto: string; anexos: number }
  | {
      acao: 'resolver';
      feito: string;
      formulario: Formulario;
      respostas: Readonly<Record<string, unknown>>;
      versao?: number;
    }
  | { acao: 'reabrir'; quemResolveu: ContaQueRecebe | null; versao?: number };

/**
 * O desfazer do assumir: a versão, que o cliente manda, e o estado de antes, que a rota lê do evento
 * `assumiu` que ela mesma gravou, e não do cliente.
 */
export interface PedidoDeDesfazer {
  /** A versão que o assumir deixou. */
  versao: number;
  /**
   * A situação, quem estava com o chamado e desde quando, antes do assumir: o `de` e o `desde` do
   * evento e, com o `de` nulo, a triagem; a conta, como está agora (`antesDoAssumir`). Nulo, quando o
   * último evento que sobe a versão não é o assumir de quem desfaz.
   */
  antes: { situacao: SituacaoDoChamado; responsavel: ContaQueRecebe | null; desde: Date } | null;
}

/**
 * O evento da conversa, com as contas nos dados; quem agiu é o autor dele. A espera, a retomada e a
 * resolução não têm dados: a pessoa vem do chamado. O `desde` do assumir, em ISO, é desde quando o
 * chamado estava na triagem, ou com quem estava; o do desfazer é o do assumir que ele desfaz, e o
 * chamado volta à triagem, ou a quem estava com ele, desde então.
 */
export type EventoDaAcao =
  | { evento: 'assumiu'; dados: { de: string | null; desde: string } }
  | { evento: 'passou'; dados: { de: string | null; para: string } }
  | { evento: 'devolveu'; dados: { de: string } }
  | { evento: 'desfez'; dados: { para: string | null; desde: string } }
  | { evento: 'aguardando' | 'retomou' | 'resolveu'; dados: Record<string, never> }
  | { evento: 'reabriu'; dados: { para: string | null } }
  /** A troca do ativo (`edicao.ts`), com os ids do ativo de antes e do de depois, ou nulo. */
  | { evento: 'ativo'; dados: { antes: string | null; depois: string | null } }
  /** O chamado virou OS (`os-e-solicitacao.ts`), com o número dela, que não muda. */
  | { evento: 'os'; dados: { numero: number } }
  /** O "Pedir toner", com o número da solicitação e se o chamado se juntou a ela ou a pediu. */
  | { evento: 'solicitacao'; dados: { numero: number; como: 'juntou' | 'pediu' } };

/** O que a ação grava na conversa: a mensagem para a pessoa, a nota ou o evento. */
export type EntradaDaConversa =
  | { especie: Exclude<EspecieDaConversa, 'evento'>; texto: string }
  | ({ especie: 'evento' } & EventoDaAcao);

/** O que a rota aplica no chamado. */
export interface MudancaDoChamado {
  situacao: SituacaoDoChamado;
  /** A conta de quem atende depois, ou nulo, na triagem. */
  responsavel: string | null;
  relogio: EfeitoNoRelogio;
  /** Sobe quando a situação ou quem atende muda, e só aí a ação grava o evento dela. */
  sobeAVersao: boolean;
  /** A ação escreve à pessoa, e a primeira resposta faltava: a rota grava o momento dela. */
  cumpreAPrimeiraResposta: boolean;
  /** O que a rota grava na conversa, nesta ordem. */
  conversa: readonly EntradaDaConversa[];
}

/** Por que a ação não acontece; `mensagemDaRecusaDaAcao` escreve a frase. */
export type RecusaDaAcao =
  | { motivo: 'resolvido' }
  | { motivo: 'ja-na-triagem' }
  | { motivo: 'aguardando'; pessoa: string }
  | { motivo: 'nao-aguardando' }
  | { motivo: 'nao-resolvido' }
  | { motivo: 'ja-esta-com-voce' }
  | { motivo: 'ja-esta-com'; nome: string }
  /** O local é o primeiro do chamado fora do alcance; nulo, a organização inteira. */
  | { motivo: 'voce-nao-atende'; local: string | null }
  | { motivo: 'nao-atende'; nome: string; local: string | null }
  | { motivo: 'mudou' }
  /** A tela mostrava a versão de antes de outra ação. */
  | { motivo: 'versao'; acao: AcaoComVersao }
  /** O campo é o nome no resumo do primeiro campo só da TI obrigatório e vazio. */
  | { motivo: 'campo-da-ti'; campo: string }
  | { motivo: 'sem-texto'; texto: TextoDaAcao }
  | { motivo: 'texto-longo'; texto: TextoDaAcao }
  | { motivo: 'anexos-demais' };

export type DecisaoDaAcao =
  | ({ aceita: true } & MudancaDoChamado)
  | { aceita: false; recusa: RecusaDaAcao };

const recusada = (recusa: RecusaDaAcao): DecisaoDaAcao => ({ aceita: false, recusa });

const evento = (doEvento: EventoDaAcao): EntradaDaConversa => ({ especie: 'evento', ...doEvento });

/** Os locais do chamado com os nomes que as recusas citam. */
export type LocaisComNome = Pick<ChamadoParaAcao, 'locais' | 'semLocal'>;

const idsDosLocais = (chamado: LocaisComNome) => ({
  locais: chamado.locais.map((local) => local.id),
  semLocal: chamado.semLocal,
});

/**
 * O local que a recusa cita: o primeiro do chamado fora do alcance. Sem alcance, o primeiro do
 * chamado; com todos os locais no alcance, o que falta é a organização inteira (nulo).
 */
function localDeFora(alcance: AlcanceDeQuemAtende, chamado: LocaisComNome): string | null {
  const fora =
    alcance === null || alcance === 'organizacao'
      ? chamado.locais[0]
      : chamado.locais.find((local) => !alcance.has(local.id));
  return fora?.nome ?? null;
}

/**
 * Quem age precisa atender os locais do chamado: os de agora, nas ações, e também os novos, na troca
 * do ativo (`edicao.ts`).
 */
export function recusaDeQuemAge(
  quemAge: QuemAge,
  chamado: LocaisComNome,
): Extract<RecusaDaAcao, { motivo: 'voce-nao-atende' }> | null {
  if (atendeOChamado(quemAge.alcance, idsDosLocais(chamado))) return null;
  return { motivo: 'voce-nao-atende', local: localDeFora(quemAge.alcance, chamado) };
}

/**
 * A recusa da abertura de quem não atende os locais do chamado (spec chamados, "Abrir um chamado
 * pela TI"), com o alcance de `chamados.atender` de quem abre: a mesma frase de quem age, "Você não
 * atende os chamados de <local>.", ou nulo, quando atende.
 */
export function recusaDeQuemAbre(
  alcance: AlcanceDeQuemAtende,
  chamado: LocaisComNome,
): string | null {
  if (atendeOChamado(alcance, idsDosLocais(chamado))) return null;
  return `Você não atende ${dosChamados(localDeFora(alcance, chamado))}.`;
}

/**
 * Só a conta ativa que atende todos os locais do chamado o recebe; na troca do ativo, quem está com o
 * chamado precisa atender os locais novos (`edicao.ts`).
 */
export function recusaDeQuemRecebe(
  conta: ContaQueRecebe,
  chamado: LocaisComNome,
): Extract<RecusaDaAcao, { motivo: 'nao-atende' }> | null {
  if (conta.ativa && atendeOChamado(conta.alcance, idsDosLocais(chamado))) return null;
  const alcance = conta.ativa ? conta.alcance : null;
  return { motivo: 'nao-atende', nome: conta.nome, local: localDeFora(alcance, chamado) };
}

function recusaDaCelula(recusa: RecusaDaCelula, chamado: ChamadoParaAcao): RecusaDaAcao {
  return recusa === 'aguardando'
    ? { motivo: 'aguardando', pessoa: chamado.pessoa }
    : { motivo: recusa };
}

const limiteDoTexto = (texto: TextoDaAcao): number =>
  texto === 'feito' ? LIMITES_DA_CONVERSA.feito : LIMITES_DA_CONVERSA.mensagem;

type Lido = { texto: string } | { recusa: RecusaDaAcao };

/** O texto sem os espaços das pontas e contado em caracteres, como o dos campos, ou a recusa. */
function lerOTexto(texto: string, de: TextoDaAcao): Lido {
  const lido = lerTexto(texto, limiteDoTexto(de));
  if (!lido.ok) return { recusa: { motivo: 'texto-longo', texto: de } };
  if (lido.valor === null) return { recusa: { motivo: 'sem-texto', texto: de } };
  return { texto: lido.valor };
}

/** A mensagem ou a nota: o texto e, depois, os anexos. */
function lerAMensagem(pedido: { texto: string; anexos: number }, de: 'mensagem' | 'nota'): Lido {
  const lido = lerOTexto(pedido.texto, de);
  if ('recusa' in lido || pedido.anexos <= LIMITES_DA_CONVERSA.anexos) return lido;
  return { recusa: { motivo: 'anexos-demais' } };
}

/**
 * O primeiro campo só da TI obrigatório, vazio e mostrado pela condição, na ordem do formulário. Os
 * da pessoa passaram pela conferência da abertura.
 */
function campoDaTiQueFalta(
  formulario: Formulario,
  respostas: Readonly<Record<string, unknown>>,
): CampoDoFormulario | undefined {
  const visiveis = camposVisiveis(formulario, respostas);
  return formulario.campos.find(
    (campo) =>
      campo.soDaTi &&
      campo.obrigatorio &&
      visiveis.has(campo.id) &&
      vazio(respostaDe(respostas, campo.id)),
  );
}

/** A versão que a tela mandou e o chamado não tem mais: a recusa, antes de tudo. */
function recusaDaVersao(chamado: ChamadoParaAcao, pedido: PedidoDeAcao): RecusaDaAcao | null {
  if (!('versao' in pedido) || pedido.versao === undefined || pedido.versao === chamado.versao) {
    return null;
  }
  return { motivo: 'versao', acao: pedido.acao };
}

/**
 * Decide a ação pela matriz. A versão que a tela mandou confere primeiro: a tela que mostra o
 * chamado de antes vê que ele mudou. Quem age precisa atender os locais do chamado, antes de qualquer
 * célula. Assumir o chamado que já está com quem assume e passar a quem já o atende são recusados;
 * a conta escolhida precisa estar ativa e atender os locais. A versão sobe, e o evento entra, só
 * quando a situação ou quem atende muda: esperar no chamado que já aguarda vale como a mensagem.
 */
export function decidirAcao(
  chamado: ChamadoParaAcao,
  quemAge: QuemAge,
  pedido: PedidoDeAcao,
): DecisaoDaAcao {
  const daVersao = recusaDaVersao(chamado, pedido);
  if (daVersao) return recusada(daVersao);
  const daConta = recusaDeQuemAge(quemAge, chamado);
  if (daConta) return recusada(daConta);
  const celula = MATRIZ_DAS_ACOES[pedido.acao][chamado.situacao];
  if ('recusa' in celula) return recusada(recusaDaCelula(celula.recusa, chamado));
  const de = chamado.responsavel;
  const assumiu = evento({ evento: 'assumiu', dados: { de, desde: chamado.desde.toISOString() } });
  let situacao: SituacaoDoChamado = celula.chega;
  let escolhida: string | null = null;
  let quemResolveu: string | null = null;
  const conversa: EntradaDaConversa[] = [];
  switch (pedido.acao) {
    case 'assumir':
      if (de === quemAge.id) return recusada({ motivo: 'ja-esta-com-voce' });
      conversa.push(assumiu);
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
      conversa.push(evento({ evento: 'passou', dados: { de, para: para.id } }));
      break;
    }
    case 'devolver':
      // A matriz só devolve o chamado em atendimento, que o banco garante com alguém.
      if (de === null) throw new Error(`O chamado #${chamado.numero} em atendimento sem ninguém.`);
      conversa.push(evento({ evento: 'devolveu', dados: { de } }));
      break;
    case 'mensagem':
    case 'nota': {
      const lido = lerAMensagem(pedido, pedido.acao);
      if ('recusa' in lido) return recusada(lido.recusa);
      conversa.push({ especie: pedido.acao, texto: lido.texto });
      break;
    }
    case 'esperar': {
      const lido = lerAMensagem(pedido, 'mensagem');
      if ('recusa' in lido) return recusada(lido.recusa);
      // Na triagem, quem espera assume antes de escrever.
      if (chamado.situacao === 'triagem') conversa.push(assumiu);
      conversa.push({ especie: 'mensagem', texto: lido.texto });
      if (chamado.situacao !== 'aguardando') {
        conversa.push(evento({ evento: 'aguardando', dados: {} }));
      }
      break;
    }
    case 'retomar':
      conversa.push(evento({ evento: 'retomou', dados: {} }));
      break;
    case 'resolver': {
      const falta = campoDaTiQueFalta(pedido.formulario, pedido.respostas);
      if (falta) return recusada({ motivo: 'campo-da-ti', campo: nomeNoResumo(falta) });
      const lido = lerOTexto(pedido.feito, 'feito');
      if ('recusa' in lido) return recusada(lido.recusa);
      conversa.push(
        { especie: 'mensagem', texto: lido.texto },
        evento({ evento: 'resolveu', dados: {} }),
      );
      break;
    }
    case 'reabrir':
      // Sem a conta de quem resolveu, como sem quem atende os locais, o chamado volta à triagem.
      if (pedido.quemResolveu === null || recusaDeQuemRecebe(pedido.quemResolveu, chamado)) {
        situacao = 'triagem';
      } else {
        quemResolveu = pedido.quemResolveu.id;
      }
      conversa.push(evento({ evento: 'reabriu', dados: { para: quemResolveu } }));
      break;
  }
  const quemFicaComEle: Record<QuemFica, string | null> = {
    'quem-age': quemAge.id,
    escolhida,
    ninguem: null,
    mesma: de,
    'quem-resolveu': quemResolveu,
  };
  const responsavel = quemFicaComEle[celula.fica];
  return {
    aceita: true,
    situacao,
    responsavel,
    relogio: celula.relogio,
    sobeAVersao: situacao !== chamado.situacao || responsavel !== de,
    cumpreAPrimeiraResposta:
      chamado.primeiraRespostaEm === null &&
      conversa.some((entrada) => entrada.especie === 'mensagem'),
    conversa,
  };
}

/**
 * Desfaz o assumir, se nada que muda a situação ou quem atende aconteceu depois: a versão é a que o
 * assumir deixou, e ela confere primeiro, como a das outras ações; o último evento que sobe a versão
 * é o assumir de quem desfaz (`antes` lido); o chamado continua com quem desfaz, e o estado de antes
 * é um dos que o assumir deixa (a triagem sem ninguém, ou o atendimento e o aguardando com outra
 * conta). A conta de antes precisa atender os locais agora. Como o assumir não mexe no relógio, o
 * desfazer também não; o chamado volta à triagem, ou à conta de antes, desde quando estava antes.
 */
export function decidirDesfazer(
  chamado: ChamadoParaAcao,
  quemAge: QuemAge,
  { versao, antes }: PedidoDeDesfazer,
): DecisaoDaAcao {
  if (chamado.versao !== versao) return recusada({ motivo: 'mudou' });
  const daConta = recusaDeQuemAge(quemAge, chamado);
  if (daConta) return recusada(daConta);
  if (antes === null) return recusada({ motivo: 'mudou' });
  const celula = MATRIZ_DAS_ACOES.assumir[antes.situacao];
  const assumidoDaquele =
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
    cumpreAPrimeiraResposta: false,
    conversa: [evento({ evento: 'desfez', dados: { para, desde: antes.desde.toISOString() } })],
  };
}

/**
 * O relógio guardado do chamado, como a ação o muda, com o modo do prazo guardado
 * (`modoDoPrazoGuardado`).
 */
export type RelogioDaAcao = { modo: ModoDoPrazo } & Pick<
  RelogioDoChamado,
  'contadoS' | 'relogioDesde'
>;

/**
 * O relógio guardado depois da ação. Parar soma o tempo que o relógio contou desde que voltou a
 * contar, no modo do prazo, e o deixa parado; voltar recomeça agora, do que já estava contado;
 * seguir não muda nada. A matriz só para o relógio que conta e só volta o parado, como os CHECKs do
 * banco pedem: o contrário é um erro do programa.
 */
export function relogioDepois(
  relogio: RelogioDaAcao,
  efeito: EfeitoNoRelogio,
  agora: Date,
  horario: HorarioDaTi,
): Pick<RelogioDoChamado, 'contadoS' | 'relogioDesde'> {
  const { contadoS, relogioDesde } = relogio;
  switch (efeito) {
    case 'segue':
      return { contadoS, relogioDesde };
    case 'para':
      if (relogioDesde === null) throw new Error('O relógio já está parado.');
      return {
        contadoS: contadoS + segundosNoHorario(relogioDesde, agora, relogio.modo, horario),
        relogioDesde: null,
      };
    case 'volta':
      if (relogioDesde !== null) throw new Error('O relógio já está contando.');
      return { contadoS, relogioDesde: agora };
  }
}

const dosChamados = (local: string | null) =>
  local === null ? 'os chamados da organização inteira' : `os chamados de ${local}`;

const ESCREVA: Readonly<Record<TextoDaAcao, string>> = {
  mensagem: 'Escreva a mensagem.',
  nota: 'Escreva a nota.',
  feito: 'Escreva o que foi feito.',
};

/** A frase da recusa, com o primeiro nome da pessoa e das contas. */
export function mensagemDaRecusaDaAcao(numero: number, recusa: RecusaDaAcao): string {
  switch (recusa.motivo) {
    case 'resolvido':
      return `O chamado #${numero} está resolvido.`;
    case 'ja-na-triagem':
      return `O chamado #${numero} já está na triagem.`;
    case 'aguardando':
      return `O chamado #${numero} está aguardando ${nomeCurto(recusa.pessoa)}. Passe a outra pessoa ou retome antes de devolver.`;
    case 'nao-aguardando':
      return `O chamado #${numero} não está aguardando.`;
    case 'nao-resolvido':
      return `O chamado #${numero} não está resolvido.`;
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
    case 'versao':
      return `O chamado #${numero} mudou. Confira antes de ${recusa.acao}.`;
    case 'campo-da-ti':
      return `Preencha ${recusa.campo} antes de resolver.`;
    case 'sem-texto':
      return ESCREVA[recusa.texto];
    case 'texto-longo':
      return `Use até ${limiteDoTexto(recusa.texto).toLocaleString('pt-BR')} caracteres.`;
    case 'anexos-demais':
      return `Anexe até ${LIMITES_DA_CONVERSA.anexos} arquivos.`;
  }
}
