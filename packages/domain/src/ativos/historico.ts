// O histórico do ativo (spec cadastro-de-ativos; design do P1d, decisão 6): as mudanças de cada
// registro da auditoria, comparando as visões de antes e de depois que a gravação guardou, pelo
// rótulo e pelo valor mostrado. Sem os restritos, a mudança e a trava de um campo restrito saem.

/** A visão do ativo que a gravação guarda na auditoria, antes e depois. */
export interface VisaoDoAtivoNaAuditoria {
  tipo?: string;
  modelo?: string | null;
  situacao?: 'ativo' | 'inativo';
  /** O valor mostrado de cada campo preenchido, pelo rótulo. */
  campos?: Record<string, string>;
  /** Os rótulos dos campos travados. */
  travados?: string[];
  /** Os rótulos dos campos restritos da visão; os registros de antes do P1d não têm. */
  restritos?: string[];
}

export interface MudancaDoCampo {
  campo: string;
  antes: string | null;
  depois: string | null;
}

export interface MudancasDoAtivo {
  mudancas: MudancaDoCampo[];
  travas: { ligadas: string[]; desligadas: string[] };
}

const SITUACOES = { ativo: 'Ativo', inativo: 'Inativo' } as const;

const textoDa = (situacao: VisaoDoAtivoNaAuditoria['situacao']) =>
  situacao ? SITUACOES[situacao] : null;

/**
 * As mudanças de um registro: o modelo, a situação e cada campo que mudou, na ordem da visão de
 * depois e, no fim, os que saíram dela, e as travas ligadas e desligadas. No cadastro, sem a visão
 * de antes, os campos preenchidos. `restritos` soma aos rótulos restritos que as próprias visões
 * dizem os dos registros antigos, que não os guardam.
 */
export function mudancasDoAtivo(
  antes: VisaoDoAtivoNaAuditoria | null,
  depois: VisaoDoAtivoNaAuditoria | null,
  { restritos, verRestritos }: { restritos: ReadonlySet<string>; verRestritos: boolean },
): MudancasDoAtivo {
  const ocultos = new Set(
    verRestritos ? [] : [...restritos, ...(antes?.restritos ?? []), ...(depois?.restritos ?? [])],
  );
  const mudancas: MudancaDoCampo[] = [];
  const comparar = (campo: string, de: string | null, para: string | null) => {
    if (de !== para && !ocultos.has(campo)) mudancas.push({ campo, antes: de, depois: para });
  };

  comparar('Modelo', antes ? (antes.modelo ?? null) : null, depois?.modelo ?? null);
  if (antes) comparar('Situação', textoDa(antes.situacao), textoDa(depois?.situacao));
  const camposDe = antes?.campos ?? {};
  const camposPara = depois?.campos ?? {};
  for (const [campo, valor] of Object.entries(camposPara)) {
    comparar(campo, camposDe[campo] ?? null, valor);
  }
  for (const [campo, valor] of Object.entries(camposDe)) {
    if (!(campo in camposPara)) comparar(campo, valor, null);
  }

  const travadosDe = new Set(antes?.travados ?? []);
  const travadosPara = new Set(depois?.travados ?? []);
  const visivel = (campo: string) => !ocultos.has(campo);
  return {
    mudancas,
    travas: {
      ligadas: [...travadosPara].filter((campo) => !travadosDe.has(campo) && visivel(campo)),
      desligadas: [...travadosDe].filter((campo) => !travadosPara.has(campo) && visivel(campo)),
    },
  };
}
