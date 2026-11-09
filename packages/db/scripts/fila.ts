// A estrutura da fila de tarefas (design do F2c, decisão 14): o esquema `fila` do pg-boss sai de
// uma migration gerada a partir da versão fixada, aplicada pelo papel dono, e a aplicação só usa a
// fila. Numa versão nova do pg-boss com o esquema mudado, `gerar` escreve a migration da subida.
// Uso: node packages/db/scripts/fila.ts gerar | verificar
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConstructionPlans, getMigrationPlans } from 'pg-boss';

const ESQUEMA = 'fila';
const raizDb = join(dirname(fileURLToPath(import.meta.url)), '..');
const pastaMigracoes = join(raizDb, 'migrations');
const MARCA = /^-- Esquema da fila: versão (\d+) do pg-boss/m;

/** A versão do pg-boss fixada no package.json do packages/db, que precisa ser exata. */
function versaoFixada(): string {
  const pacote = JSON.parse(readFileSync(join(raizDb, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const versao = pacote.dependencies?.['pg-boss'] ?? '';
  if (!/^\d+\.\d+\.\d+$/.test(versao)) {
    throw new Error(`Fixe a versão do pg-boss no packages/db (está "${versao}").`);
  }
  return versao;
}

/** A versão do esquema que o pg-boss instalado cria. */
export function versaoDoEsquemaInstalado(): number {
  const versao = /INSERT INTO fila\.version\(version\) VALUES \('(\d+)'\)/.exec(
    getConstructionPlans(ESQUEMA),
  )?.[1];
  if (!versao) throw new Error('O SQL do pg-boss não diz a versão do esquema.');
  return Number(versao);
}

/** A maior versão do esquema que as migrations já levam, ou 0 sem nenhuma da fila. */
export function versaoDoEsquemaNasMigracoes(pasta = pastaMigracoes): number {
  return readdirSync(pasta)
    .filter((arquivo) => arquivo.endsWith('.sql'))
    .map((arquivo) => MARCA.exec(readFileSync(join(pasta, arquivo), 'utf8'))?.[1])
    .reduce((maior, versao) => Math.max(maior, Number(versao ?? 0)), 0);
}

/**
 * O SQL do pg-boss sem o BEGIN e o COMMIT dele: o migrador já roda cada migration numa transação,
 * e um COMMIT no meio a fecharia antes da hora.
 */
export function semTransacaoPropria(sql: string): string {
  const inicios = sql.match(/^\s*BEGIN;\s*$/gm) ?? [];
  const fins = sql.match(/^\s*COMMIT;\s*$/gm) ?? [];
  if (inicios.length !== 1 || fins.length !== 1) {
    throw new Error('O SQL do pg-boss mudou de forma: esperava um BEGIN e um COMMIT.');
  }
  return sql
    .replace(/^\s*BEGIN;\s*$/m, '')
    .replace(/^\s*COMMIT;\s*$/m, '')
    .trim();
}

const PERMISSOES = [
  'GRANT USAGE ON SCHEMA fila TO grafite_app;',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA fila TO grafite_app;',
  'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA fila TO grafite_app;',
  'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA fila TO grafite_app;',
];

function conteudoDaMigracao(sql: string, versao: number, pacote: string): string {
  return [
    '-- A fila de tarefas (spec fila-de-tarefas; design do F2c, decisão 14): o esquema `fila` do',
    '-- pg-boss, gerado por `pnpm fila:gerar` a partir da versão fixada. Não edite à mão.',
    `-- Esquema da fila: versão ${versao} do pg-boss ${pacote}.`,
    semTransacaoPropria(sql),
    '--> statement-breakpoint',
    '-- O papel da aplicação usa a fila sem poder mudar a estrutura dela (spec isolamento-organizacoes).',
    PERMISSOES.join('\n--> statement-breakpoint\n'),
    '',
  ].join('\n');
}

function gerar(): void {
  const pacote = versaoFixada();
  const instalada = versaoDoEsquemaInstalado();
  const atual = versaoDoEsquemaNasMigracoes();
  if (atual === instalada) {
    console.log(`A estrutura da fila já está na versão ${instalada} do esquema.`);
    return;
  }
  if (atual > instalada) {
    throw new Error(
      `As migrations levam o esquema ${atual}, mais novo que o do pg-boss ${pacote} (${instalada}).`,
    );
  }
  const sql = atual === 0 ? getConstructionPlans(ESQUEMA) : getMigrationPlans(ESQUEMA, atual);
  const nome = atual === 0 ? 'fila' : `fila_esquema_${instalada}`;
  const antes = new Set(readdirSync(pastaMigracoes));
  const resultado = spawnSync(
    'pnpm',
    ['exec', 'drizzle-kit', 'generate', '--custom', '--name', nome],
    {
      cwd: raizDb,
      stdio: 'inherit',
    },
  );
  if (resultado.status !== 0) throw new Error('O drizzle-kit não criou a migration.');
  const nova = readdirSync(pastaMigracoes).find((arquivo) => !antes.has(arquivo));
  if (!nova) throw new Error('A migration nova não apareceu na pasta.');
  writeFileSync(join(pastaMigracoes, nova), conteudoDaMigracao(sql, instalada, pacote));
  console.log(`Migration da fila escrita: migrations/${nova} (esquema ${instalada}).`);
}

function verificar(): void {
  const pacote = versaoFixada();
  const instalada = versaoDoEsquemaInstalado();
  const atual = versaoDoEsquemaNasMigracoes();
  if (atual !== instalada) {
    console.error(
      `A estrutura da fila está na versão ${atual} do esquema, e o pg-boss ${pacote} pede a ${instalada}.\nRode: pnpm fila:gerar`,
    );
    process.exit(1);
  }
  console.log(
    `A estrutura da fila está em dia: versão ${instalada} do esquema, pg-boss ${pacote}.`,
  );
}

const modo = process.argv[2];
if (modo === 'gerar') gerar();
else if (modo === 'verificar') verificar();
else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.error('Uso: node packages/db/scripts/fila.ts gerar | verificar');
  process.exit(1);
}
