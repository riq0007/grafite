// As ligações entre ativos (spec ligacoes-de-ativos; design do P1d, decisões 1 e 3): a recusa do
// ativo de um tipo que o campo não aceita, e a ligação livre, guardada como um par em ordem, para a
// mesma ligação não entrar duas vezes, de lados diferentes.

/** A recusa do ativo escolhido num campo de ativo quando o tipo dele não é um dos aceitos. */
export function mensagemDosTiposAceitos(nomes: readonly string[]): string {
  return nomes.length === 1
    ? `Escolha um ativo do tipo ${nomes[0]}.`
    : `Escolha um ativo de um destes tipos: ${nomes.join(', ')}.`;
}

/** Quantas ligações livres um ativo tem, no máximo. */
export const LIMITE_DE_LIGACOES = 100;

export const RECUSAS_DA_LIGACAO = {
  esteInativo: 'Este ativo está inativo.',
  outroInativo: 'O ativo escolhido está inativo.',
  ele: 'Um ativo não se liga a ele mesmo.',
  repetida: 'Os dois ativos já estão ligados.',
  limite: `Este ativo já tem ${LIMITE_DE_LIGACOES} ligações. Desfaça uma para ligar outra.`,
  limiteDoOutro: `O ativo escolhido já tem ${LIMITE_DE_LIGACOES} ligações.`,
} as const;

/** O par da ligação livre, sempre na mesma ordem, de qualquer lado que se ligue. */
export function parDaLigacao(
  esteId: string,
  outroId: string,
): { ok: true; par: [string, string] } | { ok: false; erro: string } {
  if (esteId === outroId) return { ok: false, erro: RECUSAS_DA_LIGACAO.ele };
  return { ok: true, par: esteId < outroId ? [esteId, outroId] : [outroId, esteId] };
}
