// O diário das migrations (migrations/meta/_journal.json): a etiqueta de cada uma e o momento que o
// migrador grava em drizzle.__drizzle_migrations (created_at). O manifesto do backup diz as
// migrations aplicadas pela etiqueta.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pastaMigracoes } from './migrar.ts';

export interface MigracaoDoDiario {
  etiqueta: string;
  quando: number;
}

export async function lerDiarioDasMigracoes(pasta = pastaMigracoes): Promise<MigracaoDoDiario[]> {
  const diario = JSON.parse(await readFile(join(pasta, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  return diario.entries.map(({ tag, when }) => ({ etiqueta: tag, quando: when }));
}

/** A etiqueta da migration aplicada, pelo momento gravado; a de outra versão fica marcada. */
export function etiquetaDaMigracao(diario: readonly MigracaoDoDiario[], quando: number): string {
  return (
    diario.find((migracao) => migracao.quando === quando)?.etiqueta ?? `desconhecida-${quando}`
  );
}
