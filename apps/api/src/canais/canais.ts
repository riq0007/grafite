// Os canais de fora da API (change p3c-email-e-push, design, decisões 1, 6 e 8): o carteiro do
// e-mail e o entregador do push, criados na partida quando configurados, a origem dos links e a
// situação de cada canal para uma conta. No ambiente de teste, nenhum canal envia.
import type { Ambiente } from '@grafite/domain';
import type { CarteiroDeEmail } from './email.ts';
import type { EntregadorDePush } from './push.ts';

export interface CanaisDaApi {
  /** O carteiro, com o e-mail configurado; sem ele, nenhum e-mail sai. */
  carteiro?: CarteiroDeEmail;
  /** O entregador, com as chaves do push; sem ele, nenhum push sai nem aparelho se inscreve. */
  entregador?: EntregadorDePush;
  /** A origem dos links dos e-mails no lugar do endereço da organização. */
  origemDosLinks?: string;
}

export const SITUACOES_DO_EMAIL = [
  'ligado',
  'sem-configuracao',
  'ambiente-de-teste',
  'sem-email',
] as const;
export const SITUACOES_DO_PUSH = ['ligado', 'sem-configuracao', 'ambiente-de-teste'] as const;

export type SituacaoDoEmail = (typeof SITUACOES_DO_EMAIL)[number];
export type SituacaoDoPush = (typeof SITUACOES_DO_PUSH)[number];

/** O e-mail para uma pessoa: o ambiente de teste e a configuração antes do e-mail dela. */
export function situacaoDoEmail(
  ambiente: Ambiente,
  { carteiro }: CanaisDaApi,
  endereco: string | null,
): SituacaoDoEmail {
  if (ambiente === 'teste') return 'ambiente-de-teste';
  if (!carteiro) return 'sem-configuracao';
  return endereco === null ? 'sem-email' : 'ligado';
}

export function situacaoDoPush(ambiente: Ambiente, { entregador }: CanaisDaApi): SituacaoDoPush {
  if (ambiente === 'teste') return 'ambiente-de-teste';
  return entregador ? 'ligado' : 'sem-configuracao';
}

/** Os canais que enviam neste ambiente: no de teste, nenhum. */
export function canaisQueEnviam(ambiente: Ambiente, canais: CanaisDaApi): CanaisDaApi {
  return ambiente === 'teste' ? { origemDosLinks: canais.origemDosLinks } : canais;
}
