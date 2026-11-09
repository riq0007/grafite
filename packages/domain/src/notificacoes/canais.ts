// Os canais de fora da aplicação (spec notificacoes, "E-mail do crítico na hora", "Resumo diário por
// e-mail" e "Push por severidade"; change p3c-email-e-push, design, decisão 4): para cada
// notificação, se ela vai por e-mail na hora e por push, e se a conta recebe o resumo diário, pelas
// preferências resolvidas da conta, pela pessoa, pelos aparelhos e pelo que o servidor envia.
import type { PreferenciasDaInterface } from '../preferencias/preferencias.ts';
import type { SeveridadeDaNotificacao } from './notificacoes.ts';

/** Quem recebe a notificação, para os canais de fora. */
export interface DestinoDosCanais {
  /** O e-mail da pessoa da conta, se ela tem. */
  email: string | null;
  /** Quantos aparelhos a conta tem inscritos no push. */
  aparelhos: number;
  /** As preferências das notificações que valem para a conta. */
  preferencias: PreferenciasDaInterface['notificacoes'];
}

/** O que o servidor envia: sem a configuração, ou no ambiente de teste, o canal fica desligado. */
export interface CanaisDoServidor {
  email: boolean;
  push: boolean;
}

/** O push de cada severidade, pelas escolhas da conta. */
const PUSH_DA_SEVERIDADE = {
  critico: 'pushCritico',
  atencao: 'pushAtencao',
  info: 'pushInformacao',
} as const satisfies Record<SeveridadeDaNotificacao, keyof DestinoDosCanais['preferencias']>;

/**
 * Os canais da notificação na hora em que ela é gravada: o e-mail só para o Crítico, e o push nas
 * severidades escolhidas, que o Foco reduz ao Crítico.
 */
export function canaisNaHora(
  severidade: SeveridadeDaNotificacao,
  { email, aparelhos, preferencias }: DestinoDosCanais,
  servidor: CanaisDoServidor,
): { email: boolean; push: boolean } {
  const critico = severidade === 'critico';
  return {
    email: servidor.email && email !== null && critico && preferencias.emailCritico,
    push:
      servidor.push &&
      aparelhos > 0 &&
      preferencias[PUSH_DA_SEVERIDADE[severidade]] &&
      (critico || !preferencias.foco),
  };
}

/**
 * Se a conta recebe o resumo diário, com as notificações não lidas que não foram por e-mail. O
 * resumo não depende do push nem do Foco.
 */
export function recebeResumo(
  { email, preferencias }: DestinoDosCanais,
  servidor: CanaisDoServidor,
): boolean {
  return servidor.email && email !== null && preferencias.resumo === 'diario';
}
