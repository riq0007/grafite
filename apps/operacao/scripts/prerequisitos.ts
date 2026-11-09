// A conferência dos pré-requisitos fixados (change instalador-e-menu-da-operacao, design, decisão
// 4): baixa os instaladores oficiais do Node e do PostgreSQL numa pasta temporária e confere o
// SHA-256 de cada um com o do prerequisitos.json. Roda quando a versão fixada muda.
// Uso: node apps/operacao/scripts/prerequisitos.ts --conferir
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type Baixador, baixadorDaRede } from '../src/windows/baixador.ts';
import { lerPrerequisitos, type Prerequisitos } from '../src/windows/prerequisitos.ts';

export interface ConferenciaDoInstalador {
  arquivo: string;
  fixado: string;
  baixado: string;
  confere: boolean;
}

/** Baixa o instalador do Node e o do PostgreSQL para a pasta e compara cada hash com o fixado. */
export async function conferirPrerequisitos({
  prerequisitos,
  baixador,
  pasta,
}: {
  prerequisitos: Prerequisitos;
  baixador: Baixador;
  pasta: string;
}): Promise<ConferenciaDoInstalador[]> {
  const resultados: ConferenciaDoInstalador[] = [];
  for (const { arquivo, url, sha256 } of [prerequisitos.node, prerequisitos.postgres]) {
    const baixado = await baixador.baixar(url, join(pasta, arquivo));
    resultados.push({ arquivo, fixado: sha256, baixado, confere: baixado === sha256 });
  }
  return resultados;
}

export function relatorioDaConferencia(resultados: ConferenciaDoInstalador[]): string {
  const linhas = resultados.map(({ arquivo, fixado, baixado, confere }) =>
    confere
      ? `${arquivo}: confere.`
      : `${arquivo}: não confere. Fixado: ${fixado}. Baixado: ${baixado}.`,
  );
  const falhas = resultados.filter(({ confere }) => !confere).length;
  linhas.push(
    falhas === 0
      ? 'Os dois instaladores conferem com o prerequisitos.json.'
      : `${falhas === 1 ? 'Um instalador não confere' : 'Os dois instaladores não conferem'}: não suba a versão fixada sem saber por quê.`,
  );
  return linhas.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { conferir: { type: 'boolean' } } });
  if (!values.conferir) {
    console.error('Uso: node apps/operacao/scripts/prerequisitos.ts --conferir');
    process.exit(2);
  }
  const pasta = await mkdtemp(join(tmpdir(), 'grafite-prerequisitos-'));
  try {
    const resultados = await conferirPrerequisitos({
      prerequisitos: await lerPrerequisitos(),
      baixador: baixadorDaRede,
      pasta,
    });
    console.log(relatorioDaConferencia(resultados));
    if (!resultados.every(({ confere }) => confere)) process.exitCode = 1;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}
