// O caminho do chamado pelas situações, lido dos eventos da conversa (spec chamados, "Ações do
// atendimento" e "Leitura do chamado pela pessoa"; change chat-com-chamados, design, decisão 9): a
// linha do tempo da TI e as etapas de quem participa leem a situação pela mesma regra.
import { SITUACOES_DO_CHAMADO, type SituacaoDoChamado } from './acoes.ts';

/**
 * O evento da conversa, no que o caminho lê: o código e, na abertura e no reabrir, quem recebe o
 * chamado.
 */
export interface EventoNoCaminho {
  evento: string;
  /**
   * Na abertura, quem nasce atendendo, pelo "Fica comigo" ou pelo tipo; no reabrir, quem recebe o
   * chamado. Sem ninguém, ele fica na triagem ou volta a ela, como a abertura de antes do `para`.
   */
  para?: unknown;
}

/** Um passo do caminho: o evento e a situação de antes e de depois dele. */
export interface PassoDoCaminho<Evento> {
  evento: Evento;
  estava: SituacaoDoChamado;
  situacao: SituacaoDoChamado;
}

/** A situação depois do evento, pela matriz das ações, ou nula no que não muda a situação. */
function situacaoDepois(evento: EventoNoCaminho, estava: SituacaoDoChamado) {
  switch (evento.evento) {
    case 'abertura':
    case 'reabriu':
      return evento.para ? 'em-atendimento' : 'triagem';
    case 'devolveu':
      return 'triagem';
    case 'assumiu':
    case 'passou':
      // O assumir e o passar no aguardando continuam nele.
      return estava === 'aguardando' ? 'aguardando' : 'em-atendimento';
    case 'aguardando':
      return 'aguardando';
    case 'retomou':
      return 'em-atendimento';
    case 'resolveu':
      return 'resolvido';
    default:
      return null;
  }
}

/**
 * O caminho do chamado pelas situações: um passo por evento que muda a situação ou quem atende, na
 * ordem da conversa. O desfazer tira o passo do assumir que ele desfaz, que vem logo antes dele, e
 * o chamado volta à situação do passo de antes. Os eventos que não mudam a situação nem quem
 * atende, como a troca do ativo, a OS, a solicitação, a escolha, a avaliação e o fechamento, ficam
 * de fora.
 */
export function caminhoDaSituacao<Evento extends EventoNoCaminho>(
  eventos: readonly Evento[],
): PassoDoCaminho<Evento>[] {
  const passos: PassoDoCaminho<Evento>[] = [];
  for (const evento of eventos) {
    if (evento.evento === 'desfez') {
      // O desfazer vem logo depois do assumir que ele desfaz (`decidirDesfazer`, em `acoes.ts`).
      if (passos.at(-1)?.evento.evento === 'assumiu') passos.pop();
      continue;
    }
    const estava = passos.at(-1)?.situacao ?? 'triagem';
    const situacao = situacaoDepois(evento, estava);
    if (situacao) passos.push({ evento, estava, situacao });
  }
  return passos;
}

/** Uma etapa de quem participa: a chegada a ela, a que o chamado pulou ou a que ainda não veio. */
export type EtapaDoChamado = { situacao: SituacaoDoChamado; agora: boolean } & (
  | { estado: 'chegou'; em: Date }
  | { estado: 'pulada' }
  | { estado: 'ainda-nao' }
);

/**
 * As etapas de quem participa, na ordem das situações (Aberto, Em andamento, Aguardando você e
 * Resolvido), com a de agora marcada; no fechado, a de agora é o Resolvido. Até a de agora, cada
 * etapa tem a hora da última chegada a ela, e a que o chamado pulou fica sem hora; as depois da de
 * agora ainda não vieram. As chegadas saem do caminho com todos os eventos, também os que a pessoa
 * não lê: o desfazer tira a chegada do assumir desfeito e devolve a de antes.
 */
export function etapasDoChamado(
  eventos: readonly (EventoNoCaminho & { em: Date })[],
  situacao: SituacaoDoChamado,
): EtapaDoChamado[] {
  const chegadas = new Map<SituacaoDoChamado, Date>();
  for (const passo of caminhoDaSituacao(eventos)) {
    // A abertura chega sempre ao Aberto e, quando nasce com alguém, também ao Em andamento; o passar
    // e o assumir no aguardando não chegam de novo.
    if (passo.evento.evento === 'abertura') chegadas.set('triagem', passo.evento.em);
    if (passo.situacao !== passo.estava) chegadas.set(passo.situacao, passo.evento.em);
  }
  const deAgora = SITUACOES_DO_CHAMADO.indexOf(situacao);
  return SITUACOES_DO_CHAMADO.map((etapa, indice): EtapaDoChamado => {
    const base = { situacao: etapa, agora: indice === deAgora };
    if (indice > deAgora) return { ...base, estado: 'ainda-nao' };
    const em = chegadas.get(etapa);
    return em ? { ...base, estado: 'chegou', em } : { ...base, estado: 'pulada' };
  });
}
