// As permissões na ficha do perfil (spec modulo-administracao): o catálogo agrupado por área, as que
// valem pelo perfil e as que vêm junto com outra, que a ficha indica em vez de deixar desmarcar.
import { type DefinicaoDePermissao, fechamento, PERMISSOES, type Permissao } from '@grafite/domain';

export interface AreaDoCatalogo {
  area: string;
  permissoes: (DefinicaoDePermissao & { chave: Permissao })[];
}

const TODAS: readonly Permissao[] = PERMISSOES.map((permissao) => permissao.chave);

/** As áreas do catálogo, na ordem dele, cada uma com as permissões dela. */
export const AREAS: readonly AreaDoCatalogo[] = PERMISSOES.reduce<AreaDoCatalogo[]>(
  (areas, permissao) => {
    const area = areas.find((existente) => existente.area === permissao.area);
    if (area) area.permissoes.push(permissao);
    else areas.push({ area: permissao.area, permissoes: [permissao] });
    return areas;
  },
  [],
);

/** As permissões que o perfil dá: as escolhidas e as que elas incluem; no que tem todas, todas. */
export function permissoesQueValem(perfil: {
  permissoes: readonly Permissao[];
  todasAsPermissoes: boolean;
}): Set<Permissao> {
  return perfil.todasAsPermissoes ? new Set(TODAS) : fechamento(perfil.permissoes);
}

/** A escolhida que traz a permissão junto, se houver; a própria permissão não conta. */
export function incluidaPor(chave: Permissao, escolhidas: readonly Permissao[]): Permissao | null {
  return escolhidas.find((outra) => outra !== chave && fechamento([outra]).has(chave)) ?? null;
}

/**
 * As escolhidas depois de uma mudança no grupo de permissões, que mostra as que valem (`antes`):
 * só a permissão marcada ou desmarcada muda, e a lista fica na ordem do catálogo.
 */
export function escolhidasDepois(
  escolhidas: readonly Permissao[],
  antes: ReadonlySet<Permissao>,
  depois: readonly string[],
): Permissao[] {
  const marcadas = depois.filter((chave) => !antes.has(chave as Permissao));
  const desmarcadas = new Set([...antes].filter((chave) => !depois.includes(chave)));
  const novas = new Set<string>([
    ...escolhidas.filter((chave) => !desmarcadas.has(chave)),
    ...marcadas,
  ]);
  return TODAS.filter((chave) => novas.has(chave));
}
