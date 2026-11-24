// A ordem das marcadas na seleção (spec modulo-chat, "Mensagens selecionadas"; change
// andamento-e-varias-mensagens, decisão 8): o transformar as cita e a rota as recebe na ordem da
// conversa, que é a dos ids (UUIDv7, na ordem da criação), e não na de marcar.
import type { MensagemDoChat } from './conversa.ts';

/**
 * As marcadas que valem, na ordem da conversa: cada id pela última leitura da mensagem, sem a que
 * já virou chamado, aqui ou por outra conta, e sem a que a tela não leu.
 */
export function marcadasNaOrdem(
  ids: readonly string[],
  conhecidas: ReadonlyMap<string, MensagemDoChat>,
): MensagemDoChat[] {
  return ids
    .flatMap((id) => {
      const mensagem = conhecidas.get(id);
      return mensagem && !mensagem.chamado ? [mensagem] : [];
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
