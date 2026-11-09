// O bloqueio progressivo da entrada (spec entrada-e-sessoes): 5 recusas seguidas do mesmo usuário
// bloqueiam por 1 minuto, e cada recusa depois de um bloqueio dobra o tempo, até 15 minutos.

const MINUTO = 60_000;
const RECUSAS_ANTES_DO_BLOQUEIO = 5;
const TETO = 15 * MINUTO;

/** Por quanto tempo, em ms, a entrada fica bloqueada depois de `falhasSeguidas` recusas seguidas. */
export function bloqueioDepois(falhasSeguidas: number): number {
  if (falhasSeguidas < RECUSAS_ANTES_DO_BLOQUEIO) return 0;
  return Math.min(MINUTO * 2 ** (falhasSeguidas - RECUSAS_ANTES_DO_BLOQUEIO), TETO);
}

/** A recusa durante o bloqueio, com o tempo restante arredondado para cima, em minutos. */
export function mensagemDoBloqueio(restanteEmMs: number): string {
  const minutos = Math.max(1, Math.ceil(restanteEmMs / MINUTO));
  return `Muitas tentativas com este usuário. Tente de novo em ${minutos} min.`;
}
