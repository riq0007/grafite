// As notificações gravadas no servidor (spec notificacoes; change p3b-notificacoes-no-servidor,
// design, decisão 2): uma por conta, com o que a central e o aviso mostram. Um módulo notifica pela
// API com estas notificações novas, e a API as grava na transação dele. A de uma mensagem, do chat
// ou de um chamado (change chat-com-chamados, design, decisão 6), leva o assunto que a leitura
// marca como lido.

export const SEVERIDADES_DA_NOTIFICACAO = ['critico', 'atencao', 'info'] as const;

export type SeveridadeDaNotificacao = (typeof SEVERIDADES_DA_NOTIFICACAO)[number];

/** Os limites dos textos, iguais na API e nas checagens do banco. */
export const LIMITES_DA_NOTIFICACAO = {
  titulo: 200,
  descricao: 300,
  origem: 40,
  destino: 500,
} as const;

/** A notificação que um módulo grava para uma conta, com as colunas da tabela. */
export interface NovaNotificacao {
  contaId: string;
  severidade: SeveridadeDaNotificacao;
  titulo: string;
  descricao: string | null;
  /** O módulo que notifica, como "Alertas". */
  origem: string;
  /** O endereço do registro, para "Abrir". */
  destino: string | null;
  /** O alerta de que ela trata, que dá as ações de reconhecer e de adiar. */
  alertaId: string | null;
  /**
   * A notificação de uma mensagem, do chat ou de um chamado: vai por push qualquer que seja a
   * severidade e nunca no Foco.
   */
  mensagem: boolean;
  /**
   * O assunto da mensagem, que a leitura da conversa ou do chamado marca como lido: `conversa:<id>`
   * ou `chamado:<id>`, com o id em minúsculas, como o banco o devolve. A mensagem sempre tem.
   */
  assunto: string | null;
  /**
   * A mensagem do chat de que ela trata, para a leitura da conversa marcar só as notificações até a
   * mensagem lida; a de um chamado não tem.
   */
  mensagemDoChatId: string | null;
}

const PESO: Record<SeveridadeDaNotificacao, number> = { critico: 3, atencao: 2, info: 1 };

/** A severidade mais alta de uma lista, ou Informação sem nenhuma. */
export function severidadeMaisAlta(
  severidades: Iterable<SeveridadeDaNotificacao>,
): SeveridadeDaNotificacao {
  let maior: SeveridadeDaNotificacao = 'info';
  for (const severidade of severidades) if (PESO[severidade] > PESO[maior]) maior = severidade;
  return maior;
}
