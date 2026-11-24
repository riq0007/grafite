// As listas e as contagens do chat (spec modulo-chat, "Trilha do chat", "Lista do Chat" e "Vista
// Chamados"; spec chat, "Não lidas"; spec chamados, "Resposta nova"; change chat-com-chamados,
// design, decisões 5 e 15): a ordem das seções e dos grupos, os contadores e a resposta nova.
import type { EspecieDaConversa, SituacaoDoChamado } from '../chamados/acoes.ts';

/** O chamado nas listas do chat, no que as ordens e os grupos leem. */
export interface ChamadoNaLista {
  numero: number;
  situacao: SituacaoDoChamado;
  /** O resolvido que não se reabre mais. */
  fechado: boolean;
  abertoEm: Date;
  resolvidoEm: Date | null;
  /**
   * A conta participa dele pela TI (spec chamados, "Quem atende pelo chat"): a espera é da pessoa
   * do chamado, e não dela, e o aguardando fica com os outros abertos.
   */
  pelaTi: boolean;
}

/** O chamado que espera a conta: o aguardando, fora o de quem participa pela TI. */
const aguardaAConta = ({ situacao, pelaTi }: ChamadoNaLista) =>
  situacao === 'aguardando' && !pelaTi;

/** O chamado aberto: na triagem, em atendimento ou aguardando a pessoa. */
export function chamadoAberto(situacao: SituacaoDoChamado): boolean {
  return situacao !== 'resolvido';
}

const maisNovo = (a: Date, b: Date) => b.getTime() - a.getTime();

// O aberto mais novo primeiro, e o número mais alto na mesma hora.
const peloAberto = (a: ChamadoNaLista, b: ChamadoNaLista) =>
  maisNovo(a.abertoEm, b.abertoEm) || b.numero - a.numero;

// O resolvido mais novo primeiro, e o número mais alto na mesma hora.
const peloResolvido = (a: ChamadoNaLista, b: ChamadoNaLista) =>
  maisNovo(a.resolvidoEm ?? a.abertoEm, b.resolvidoEm ?? b.abertoEm) || b.numero - a.numero;

const antes = (sim: boolean) => (sim ? -1 : 0);
const primeiro = (a: boolean, b: boolean) => antes(a) - antes(b);

/**
 * As seções dos chamados na lista do Chat:
 * - CHAMADOS, com os abertos: o que a conta acaba de abrir (`novo`) no alto, até a lista se
 *   carregar de novo, depois os que aguardam a conta e então os outros, o aberto mais novo
 *   primeiro. O que aguarda a pessoa, a quem participa pela TI, fica com os outros;
 * - FECHADOS, com os resolvidos que ainda se reabrem, o resolvido mais novo primeiro. O fechado fica
 *   só na vista Chamados.
 */
export function secoesDoChat<T extends ChamadoNaLista>(
  chamados: readonly T[],
  novo: number | null = null,
): { chamados: T[]; fechados: T[] } {
  return {
    chamados: chamados
      .filter(({ situacao }) => chamadoAberto(situacao))
      .sort(
        (a, b) =>
          primeiro(a.numero === novo, b.numero === novo) ||
          primeiro(aguardaAConta(a), aguardaAConta(b)) ||
          peloAberto(a, b),
      ),
    fechados: chamados
      .filter(({ situacao, fechado }) => situacao === 'resolvido' && !fechado)
      .sort(peloResolvido),
  };
}

/** Os grupos da vista Chamados, pela vez de quem age, na ordem da tela. */
export const GRUPOS_DA_VISTA_CHAMADOS = [
  'aguardando-voce',
  'em-andamento',
  'abertos',
  'fechados',
] as const;
export type GrupoDaVistaChamados = (typeof GRUPOS_DA_VISTA_CHAMADOS)[number];

const GRUPO_DA_SITUACAO: Record<SituacaoDoChamado, GrupoDaVistaChamados> = {
  aguardando: 'aguardando-voce',
  'em-atendimento': 'em-andamento',
  triagem: 'abertos',
  resolvido: 'fechados',
};

// O que aguarda a pessoa, a quem participa pela TI, segue com a TI: em EM ANDAMENTO.
const grupoDoChamado = (chamado: ChamadoNaLista): GrupoDaVistaChamados =>
  chamado.situacao === 'aguardando' && chamado.pelaTi
    ? 'em-andamento'
    : GRUPO_DA_SITUACAO[chamado.situacao];

/**
 * Os grupos da vista Chamados, só os que têm chamados: nos abertos, o aberto mais novo primeiro,
 * como na lista do Chat; em FECHADOS, os resolvidos e os fechados, o resolvido mais novo primeiro.
 * O que aguarda a pessoa, a quem participa pela TI, fica em EM ANDAMENTO.
 */
export function gruposDaVistaChamados<T extends ChamadoNaLista>(
  chamados: readonly T[],
): { grupo: GrupoDaVistaChamados; chamados: T[] }[] {
  return GRUPOS_DA_VISTA_CHAMADOS.map((grupo) => ({
    grupo,
    chamados: chamados
      .filter((chamado) => grupoDoChamado(chamado) === grupo)
      .sort(grupo === 'fechados' ? peloResolvido : peloAberto),
  })).filter(({ chamados: doGrupo }) => doGrupo.length > 0);
}

const peloId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** EQUIPES E CANAIS, em ordem de nome, sem diferenciar os acentos e as maiúsculas. */
export function ordemDasEquipesECanais<T extends { id: string; nome: string }>(
  conversas: readonly T[],
): T[] {
  return [...conversas].sort(
    (a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true }) ||
      peloId(a.id, b.id),
  );
}

/** RECENTES: as conversas diretas, a da mensagem mais nova primeiro. */
export function ordemDasRecentes<T extends { id: string; ultimaMensagemEm: Date }>(
  conversas: readonly T[],
): T[] {
  return [...conversas].sort(
    (a, b) => maisNovo(a.ultimaMensagemEm, b.ultimaMensagemEm) || peloId(b.id, a.id),
  );
}

/** O contador mostra até 99; acima disso, "99+". A API conta as não lidas até 100. */
export const MAXIMO_NO_CONTADOR = 99;

/** O texto do contador: nenhum no zero, o número até 99 e "99+" acima dele. */
export function contadorDoChat(quantos: number): string | null {
  if (quantos <= 0) return null;
  return quantos > MAXIMO_NO_CONTADOR ? `${MAXIMO_NO_CONTADOR}+` : String(quantos);
}

/**
 * O total do chat: as não lidas das conversas diretas, das equipes e dos canais, fora as
 * silenciadas. Os chamados contam à parte, pela resposta nova.
 */
export function totalDoChat(
  conversas: readonly { naoLidas: number; silenciada: boolean }[],
): number {
  return conversas.reduce(
    (total, { naoLidas, silenciada }) => (silenciada ? total : total + naoLidas),
    0,
  );
}

/** A linha da conversa do chamado, no que a resposta nova lê. */
export interface LinhaParaARespostaNova {
  /** O `uuidv7()` da linha, que segue a ordem das gravações no chamado. */
  id: string;
  especie: EspecieDaConversa;
  /** A conta da TI que escreveu; a mensagem de quem participa não tem. */
  autorConta: string | null;
}

/**
 * As mensagens da TI que são resposta nova para a conta: as de outra conta depois da `vista_ate`
 * dela, pelo id, só no chamado aberto. A `vista_ate` é a última linha da conversa na mensagem, na
 * escolha, no "Reabrir", na avaliação e no "Marcar como vista" de quem participa; abrir a conversa
 * não a muda. O resolvido e o fechado não têm resposta nova: o "O que foi feito" do resolver é
 * mensagem da TI, e a pessoa o recebe pela notificação do resolvido.
 *
 * Quem participa pela TI não tem resposta nova: as mensagens da TI são para a pessoa do chamado, e
 * ela fala como a TI. O `pelaTi` é obrigatório para nenhum chamador o esquecer.
 */
export function respostaNova(pedido: {
  situacao: SituacaoDoChamado;
  linhas: readonly LinhaParaARespostaNova[];
  contaId: string;
  vistaAte: string | null;
  pelaTi: boolean;
}): number {
  if (pedido.pelaTi || !chamadoAberto(pedido.situacao)) return 0;
  const vistaAte = pedido.vistaAte?.toLowerCase() ?? null;
  return pedido.linhas.filter(
    ({ id, especie, autorConta }) =>
      especie === 'mensagem' &&
      autorConta !== null &&
      autorConta !== pedido.contaId &&
      (vistaAte === null || id.toLowerCase() > vistaAte),
  ).length;
}

/**
 * A resposta por ver (change aba-dos-colaboradores, spec chamados, "Resposta por ver"): as
 * mensagens da resposta nova escritas depois da última abertura da conversa pela pessoa. Sem
 * abertura, é a resposta nova inteira; tudo o que tira a resposta nova tira também esta.
 */
export function respostaPorVer(pedido: {
  situacao: SituacaoDoChamado;
  linhas: readonly (LinhaParaARespostaNova & { criadaEm: Date })[];
  contaId: string;
  vistaAte: string | null;
  pelaTi: boolean;
  abertaEm: Date | null;
}): number {
  const { abertaEm, ...daRespostaNova } = pedido;
  if (abertaEm === null) return respostaNova(daRespostaNova);
  return respostaNova({
    ...daRespostaNova,
    linhas: pedido.linhas.filter(({ criadaEm }) => criadaEm.getTime() > abertaEm.getTime()),
  });
}

/** Os chamados com resposta nova, para a trilha: conta os chamados, e não as mensagens. */
export function chamadosComRespostaNova(chamados: readonly { respostaNova: number }[]): number {
  return chamados.filter(({ respostaNova: novas }) => novas > 0).length;
}
