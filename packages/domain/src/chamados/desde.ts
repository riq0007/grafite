// Desde quando o chamado está onde está (spec chamados, "Conversa do chamado"; change
// chamados-da-ti, design, decisão 4): na triagem, pela conversa; com quem atende, pelo
// `responsavel_desde`, que a ação muda; e o estado de antes do assumir, que o desfazer devolve.
import type {
  ChamadoParaAcao,
  EventoDaAcao,
  MudancaDoChamado,
  SituacaoDoChamado,
} from './acoes.ts';
import type { MudancaDeQuemParticipa } from './acoes-de-quem-participa.ts';
import { objeto } from './leitura.ts';

/**
 * Uma linha da conversa como o "desde" a lê: o código do evento, nulo na mensagem e na nota, os
 * dados, a conta que agiu e quando.
 */
export interface EventoNaConversa {
  evento: string | null;
  dados: unknown;
  autor: string | null;
  em: Date;
}

/**
 * Os eventos que as ações gravam, todos quando a versão sobe (`decidirAcao`), e o da troca do ativo,
 * que também a sobe (`decidirTrocaDoAtivo`): o desfazer só vale com o assumir depois de todos eles.
 * A abertura não sobe a versão, nem a troca do título e dos campos da TI, que não vão à conversa.
 */
export const EVENTOS_QUE_SOBEM_A_VERSAO = [
  'assumiu',
  'passou',
  'devolveu',
  'desfez',
  'aguardando',
  'retomou',
  'resolveu',
  'reabriu',
  'ativo',
] as const satisfies readonly EventoDaAcao['evento'][];

/**
 * Os eventos que vão à conversa sem subir a versão: o chamado que virou OS, pediu toner ou nasceu
 * com a solicitação gerada pelo tipo, ou sem ela, não muda a situação, quem atende nem os locais, e
 * o desfazer do assumir segue valendo depois deles.
 */
export const EVENTOS_QUE_NAO_SOBEM_A_VERSAO = [
  'os',
  'solicitacao',
  'solicitacao-nao-gerada',
] as const satisfies readonly EventoDaAcao['evento'][];

/** Aceita só o `never`: o tipo que sobra reprova o typecheck onde o guarda o pede. */
type SemNenhum<Sobra extends never> = Sobra;

/** O guarda: o evento novo do domínio que não está numa das duas listas reprova o typecheck aqui. */
export type EventosForaDasListas = SemNenhum<
  Exclude<
    EventoDaAcao['evento'],
    (typeof EVENTOS_QUE_SOBEM_A_VERSAO)[number] | (typeof EVENTOS_QUE_NAO_SOBEM_A_VERSAO)[number]
  >
>;

const SOBEM: ReadonlySet<string | null> = new Set(EVENTOS_QUE_SOBEM_A_VERSAO);

/** O momento como o `toISOString` o grava. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** O momento gravado pelo `toISOString` nos dados de um evento, ou nulo, com outro valor. */
export function momentoLido(valor: unknown): Date | null {
  if (typeof valor !== 'string' || !ISO.test(valor)) return null;
  const momento = new Date(valor);
  return Number.isNaN(momento.getTime()) ? null : momento;
}

/**
 * Desde quando o chamado está na triagem: o último entre a abertura, o devolver, o reabrir sem
 * ninguém e o desfazer sem ninguém, que volta a contar de quando o chamado caiu nela antes do
 * assumir (o `desde` dele; ilegível, o momento do desfazer). A conversa vem na ordem.
 */
export function desdeNaTriagem(abertoEm: Date, conversa: readonly EventoNaConversa[]): Date {
  for (const linha of conversa.toReversed()) {
    const dados = objeto(linha.dados);
    switch (linha.evento) {
      case 'devolveu':
        return linha.em;
      case 'reabriu':
        if (dados?.para === null) return linha.em;
        break;
      case 'desfez':
        if (dados?.para === null) return momentoLido(dados.desde) ?? linha.em;
        break;
    }
  }
  return abertoEm;
}

/**
 * Desde quando quem atende está com o chamado depois da ação: sem ninguém, nulo, e a triagem conta
 * pela conversa; no desfazer, o de antes do assumir, que o evento dele guarda; no reabrir, agora,
 * mesmo com a conta que já estava com o resolvido, para o tempo resolvido não contar; com a mesma
 * conta, o de antes; com outra, agora. Vale também para a mudança de quem participa
 * (`decidirAcaoDeQuemParticipa`): a retomada segue com quem atende, e a reabertura é agora.
 */
export function desdeDeQuemAtende(
  chamado: Pick<ChamadoParaAcao, 'responsavel' | 'desde'>,
  mudanca: Pick<MudancaDoChamado | MudancaDeQuemParticipa, 'responsavel' | 'conversa'>,
  agora: Date,
): Date | null {
  if (mudanca.responsavel === null) return null;
  for (const entrada of mudanca.conversa) {
    if (entrada.especie !== 'evento') continue;
    if (entrada.evento === 'desfez') return new Date(entrada.dados.desde);
    if (entrada.evento === 'reabriu') return agora;
  }
  return mudanca.responsavel === chamado.responsavel ? chamado.desde : agora;
}

/** O estado de antes do assumir, que o desfazer devolve. */
export interface AntesDoAssumir {
  situacao: SituacaoDoChamado;
  /** A conta que estava com o chamado, ou nulo, na triagem. */
  de: string | null;
  desde: Date;
}

/**
 * O estado de antes do assumir, lido do último evento que sobe a versão: só o assumir de quem
 * desfaz, com o `de` e o `desde` legíveis. Sem ninguém, a triagem; com alguém, a situação de agora,
 * que o assumir não muda. Senão, nulo, e o desfazer é recusado (`decidirDesfazer`).
 */
export function antesDoAssumir(
  conversa: readonly EventoNaConversa[],
  quemDesfaz: string,
  situacaoDeAgora: SituacaoDoChamado,
): AntesDoAssumir | null {
  const ultimo = conversa.findLast((linha) => SOBEM.has(linha.evento));
  if (ultimo?.evento !== 'assumiu' || ultimo.autor !== quemDesfaz) return null;
  const dados = objeto(ultimo.dados);
  const de = dados?.de;
  const desde = momentoLido(dados?.desde);
  if ((de !== null && typeof de !== 'string') || desde === null) return null;
  return { situacao: de === null ? 'triagem' : situacaoDeAgora, de, desde };
}
