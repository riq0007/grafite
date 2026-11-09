// O evento dos ativos (design do P1b, decisão 9): toda escrita de um ativo grava ativos.mudaram com o
// ativo no alvo. Recebem o evento quem vê ativos no escopo do local dele, o de antes e o de depois
// da mudança; `null` é o ativo sem local, que só a organização inteira alcança.
import type { SaidaDoEvento } from '../auditoria.ts';

export function saidaDoAtivo({
  ativoId,
  locais,
}: {
  ativoId: string;
  locais: readonly (string | null)[];
}): SaidaDoEvento {
  return {
    alvo: { tipo: 'ativo', id: ativoId },
    publico: { permissao: 'ativos.ver', locais: [...new Set(locais)] },
  };
}
