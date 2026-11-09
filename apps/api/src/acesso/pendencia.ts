// Os passos pendentes da sessão (spec entrada-e-sessoes), derivados a cada leitura da conta e da
// própria sessão, nesta ordem: o código do segundo passo, a troca da senha temporária e o cadastro
// dos dois passos exigidos. Nada é guardado à parte, então nada fica fora de sincronia.

export type Pendencia = 'segundo-passo' | 'trocar-senha' | 'cadastrar-dois-passos';

export interface EstadoDaEntrada {
  conta: { senhaTemporaria: boolean; exigeDoisPassos: boolean };
  /** A conta tem a verificação em dois passos ativa (o cadastro concluído). */
  doisPassosAtivos: boolean;
  /** Quando esta sessão passou pelo segundo passo, ou `null`. */
  segundoPassoEm: Date | null;
}

export function pendenciaDa({
  conta,
  doisPassosAtivos,
  segundoPassoEm,
}: EstadoDaEntrada): Pendencia | null {
  if (doisPassosAtivos && segundoPassoEm === null) return 'segundo-passo';
  if (conta.senhaTemporaria) return 'trocar-senha';
  if (conta.exigeDoisPassos && !doisPassosAtivos) return 'cadastrar-dois-passos';
  return null;
}
