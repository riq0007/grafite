// O backup da produção (spec backup; design do F2d, decisões 11 e 12). O banco é lido pelo papel do
// backup num instantâneo: a transação REPEATABLE READ exporta o instantâneo, conta as linhas nele e
// o pg_dump usa o mesmo, então o manifesto bate com o dump mesmo com gravações no meio. O backup é
// montado numa pasta `.parcial` no primeiro destino e só ganha o nome no fim, então um backup pela
// metade nunca aparece como pronto; depois, ele é copiado para os outros destinos, e a retenção só
// roda com todos gravados (distribuicao.ts).
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { etiquetaDaMigracao, lerDiarioDasMigracoes } from '@grafite/db';
import type { Retencao } from '@grafite/domain';
import pg from 'pg';
import {
  apagarSobras,
  conferirMarcaDoDestino,
  distribuirBackup,
  nomeLivre,
  pastasNoDestino,
  type ResultadoNoDestino,
} from './distribuicao.ts';
import { contarLinhasNaConexao } from './linhas.ts';
import { type Manifesto, PARTES_DO_BACKUP, sha256DoArquivo } from './manifesto.ts';
import { type FerramentasDoPostgres, separarSenha } from './postgres.ts';
import { renomearComPaciencia } from './renomear.ts';
import { zipar } from './zip.ts';

export interface DependenciasDoBackup {
  /** A conexão do papel do backup (grafite_backup), com a senha. */
  urlBackup: string;
  ferramentas: FerramentasDoPostgres;
  /** A pasta dos arquivos da produção (`GRAFITE_ARQUIVOS_PASTA`). */
  pastaDosArquivos: string;
  /** As pastas de destino, na ordem da configuração; o backup é montado na primeira. */
  destinos: readonly string[];
  retencao: Retencao;
  /** O fuso do servidor, em que a retenção conta os dias, as semanas e os meses. */
  fuso: string;
  /** A versão do Grafite que faz o backup. */
  versao: string;
  agora: () => Date;
  /** A cópia de um arquivo para os outros destinos (padrão: `copyFile`). */
  copiarArquivo?: (origem: string, destino: string) => Promise<void>;
  /**
   * No Linux (change servidor-linux-com-docker, design, decisão 11), cada destino precisa da marca
   * da instalação: sem ela, ele pode ser o ponto de montagem de um compartilhamento desmontado.
   */
  exigirMarca?: boolean;
}

export interface BackupFeito {
  /** O nome do backup em cada destino, como `2026-10-07T0500Z`. */
  pasta: string;
  /** Os bytes do dump, do zip e do manifesto. */
  tamanho: number;
  manifesto: Manifesto;
  destinos: ResultadoNoDestino[];
  /** Os backups antigos que a retenção apagou, pelo nome. */
  removidos: string[];
}

/** O backup que não chegou a todos os destinos, com o resultado em cada um que foi tentado. */
export class FalhaNoBackup extends Error {
  readonly destinos: ResultadoNoDestino[];

  constructor(mensagem: string, destinos: ResultadoNoDestino[], opcoes?: ErrorOptions) {
    super(mensagem, opcoes);
    this.name = 'FalhaNoBackup';
    this.destinos = destinos;
  }
}

/** O nome do backup pelo momento em que começou, em UTC e até o minuto. */
export function nomeDoBackup(momento: Date): string {
  return `${momento.toISOString().slice(0, 16).replace(':', '')}Z`;
}

export async function fazerBackup(dep: DependenciasDoBackup): Promise<BackupFeito> {
  const [primeiro] = dep.destinos;
  if (primeiro === undefined) throw new Error('Nenhum destino de backup configurado.');
  await apagarSobras(dep.destinos);
  const momento = dep.agora();
  // Um segundo backup no mesmo minuto ganha o sufixo -2: o Windows recusa dar à .parcial o nome de
  // uma pasta que já existe (change backup-no-mesmo-minuto).
  const nome = await nomeLivre(dep.destinos, nomeDoBackup(momento));
  let montado: { tamanho: number; manifesto: Manifesto };
  try {
    if (dep.exigirMarca) await conferirMarcaDoDestino(primeiro);
    montado = await montarBackup(dep, primeiro, nome, momento);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    throw new FalhaNoBackup(mensagem, [{ destino: primeiro, situacao: 'falhou', erro: mensagem }], {
      cause: erro,
    });
  }
  const { destinos, removidos } = await distribuirBackup(nome, dep);
  const falhas = destinos.filter((resultado) => resultado.situacao === 'falhou');
  if (falhas.length > 0) {
    const motivos = falhas.map(({ destino, erro }) => `${destino}: ${erro}`).join(' ');
    throw new FalhaNoBackup(`O backup não chegou a todos os destinos. ${motivos}`, destinos);
  }
  return { pasta: nome, ...montado, destinos, removidos };
}

/** O dump, o zip e o manifesto numa `.parcial` do primeiro destino, renomeada no fim. */
async function montarBackup(
  dep: DependenciasDoBackup,
  primeiro: string,
  nome: string,
  momento: Date,
): Promise<{ tamanho: number; manifesto: Manifesto }> {
  const { base, parcial, pronta } = pastasNoDestino(primeiro, nome);
  await mkdir(parcial, { recursive: true });

  const { linhas, migracoes } = await despejarBanco(dep, join(parcial, 'banco.dump'));
  await zipar(dep.pastaDosArquivos, join(parcial, 'arquivos.zip'));

  const partes = {} as Manifesto['partes'];
  for (const parte of PARTES_DO_BACKUP) {
    const caminho = join(parcial, parte);
    partes[parte] = { tamanho: (await stat(caminho)).size, sha256: await sha256DoArquivo(caminho) };
  }
  const manifesto: Manifesto = {
    versao: dep.versao,
    migracoes,
    criadoEm: momento.toISOString(),
    linhas,
    partes,
  };
  const texto = `${JSON.stringify(manifesto, null, 2)}\n`;
  await writeFile(join(parcial, 'manifesto.json'), texto);
  await mkdir(base, { recursive: true });
  await renomearComPaciencia(parcial, pronta);

  return {
    tamanho:
      partes['banco.dump'].tamanho + partes['arquivos.zip'].tamanho + Buffer.byteLength(texto),
    manifesto,
  };
}

/** O dump do banco e, no mesmo instantâneo, as linhas por tabela e as migrations aplicadas. */
async function despejarBanco(
  dep: DependenciasDoBackup,
  arquivo: string,
): Promise<{ linhas: Record<string, number>; migracoes: string[] }> {
  const diario = await lerDiarioDasMigracoes();
  const cliente = new pg.Client({ connectionString: dep.urlBackup });
  await cliente.connect();
  try {
    await cliente.query('begin isolation level repeatable read read only');
    const { rows } = await cliente.query<{ instantaneo: string }>(
      'select pg_export_snapshot() as instantaneo',
    );
    const instantaneo = rows[0]?.instantaneo ?? '';
    const linhas = await contarLinhasNaConexao(cliente);
    const { rows: aplicadas } = await cliente.query<{ quando: string }>(
      'select created_at as quando from drizzle.__drizzle_migrations order by created_at',
    );
    const migracoes = aplicadas.map(({ quando }) => etiquetaDaMigracao(diario, Number(quando)));

    const { url, senha } = separarSenha(dep.urlBackup);
    const { codigo, erro } = await dep.ferramentas.executar(
      'pg_dump',
      ['--format=custom', `--snapshot=${instantaneo}`, `--file=${arquivo}`, `--dbname=${url}`],
      { senha },
    );
    if (codigo !== 0) throw new Error(`O pg_dump falhou: ${erro.trim()}`);
    await cliente.query('commit');
    return { linhas, migracoes };
  } finally {
    await cliente.end();
  }
}
