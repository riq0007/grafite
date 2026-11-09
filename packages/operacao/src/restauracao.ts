// A restauração e o teste de restauração (spec backup; design do F2d, decisões 13 e 16). O teste
// prova que o backup mais novo restaura: confere os hashes, restaura num banco descartável da
// instância do teste, compara as linhas com o manifesto, confere o zip e apaga o banco, também
// depois de uma falha. Ele nunca toca no banco nem nos arquivos da produção.
import { statfs } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { backupsProntosNoDestino, pastasNoDestino } from './distribuicao.ts';
import { contarLinhasNaConexao } from './linhas.ts';
import { conferirPartes, lerManifesto } from './manifesto.ts';
import { type FerramentasDoPostgres, separarSenha } from './postgres.ts';
import { conferirZip } from './zip.ts';

/** O banco descartável do teste de restauração, na instância do teste. */
export const BANCO_DESCARTAVEL = 'grafite_restauracao';

/**
 * O espaço que a restauração pede: o dump é comprimido, então o banco restaurado ocupa algumas
 * vezes o tamanho dele, mais uma folga para o servidor continuar trabalhando.
 */
const VEZES_O_DUMP = 5;
const FOLGA = 1024 ** 3;

export interface DependenciasDoTesteDeRestauracao {
  ferramentas: FerramentasDoPostgres;
  /** O superusuário da instância do teste (`GRAFITE_RESTAURACAO_URL`), com a senha. */
  urlRestauracao: string;
  /** Os destinos do backup; o teste usa o mais novo do primeiro. */
  destinos: readonly string[];
  /** Os bytes livres onde a instância grava (padrão: o disco da pasta de dados dela). */
  espacoLivre?: () => Promise<number>;
  /**
   * A pasta de dados da instância, vista daqui, cujo disco dá o espaço livre (padrão: a que a
   * instância diz). No Linux (change servidor-linux-com-docker), a pasta que o PostgreSQL diz só
   * existe dentro do contêiner do banco, e esta é a do servidor, montada.
   */
  pastaDaInstancia?: string;
  /** O backup a testar, pelo nome (padrão: o mais novo do primeiro destino). */
  backup?: string;
}

export interface ResultadoDoTesteDeRestauracao {
  /** O nome do backup testado, como `2026-10-07T0500Z`. */
  backup: string;
  detalhes: { tabelas: number; linhas: number; arquivos: number };
}

export async function testarRestauracao(
  dep: DependenciasDoTesteDeRestauracao,
): Promise<ResultadoDoTesteDeRestauracao> {
  const [primeiro] = dep.destinos;
  if (primeiro === undefined) throw new Error('Nenhum destino de backup configurado.');
  const nome = dep.backup ?? (await backupsProntosNoDestino(primeiro)).at(-1);
  if (nome === undefined) throw new Error('Nenhum backup pronto para testar.');
  const { pronta } = pastasNoDestino(primeiro, nome);
  const manifesto = await lerManifesto(pronta);
  const problemas = await conferirPartes(pronta, manifesto);
  if (problemas.length > 0) {
    throw new Error(`O backup ${nome} não passou na conferência: ${problemas.join(' ')}`);
  }

  const precisa = VEZES_O_DUMP * manifesto.partes['banco.dump'].tamanho + FOLGA;
  const { pastaDaInstancia } = dep;
  const livre = await (
    dep.espacoLivre ??
    (pastaDaInstancia === undefined
      ? () => espacoLivreDaInstancia(dep.urlRestauracao)
      : () => espacoLivreEm(pastaDaInstancia))
  )();
  if (livre < precisa) {
    throw new Error(
      `Falta espaço para o teste de restauração: são precisos ${formatarTamanho(precisa)} livres, e há ${formatarTamanho(livre)}.`,
    );
  }

  let resultado: ResultadoDoTesteDeRestauracao;
  try {
    await apagarBanco(dep.urlRestauracao, BANCO_DESCARTAVEL);
    resultado = await restaurarEConferir(dep, nome, pronta, manifesto.linhas);
  } catch (erro) {
    // A falha que vale é a do teste; o banco que sobrar é apagado no próximo.
    await apagarBanco(dep.urlRestauracao, BANCO_DESCARTAVEL).catch(() => {});
    throw erro;
  }
  await apagarBanco(dep.urlRestauracao, BANCO_DESCARTAVEL);
  return resultado;
}

/** Restaura o backup no banco descartável e compara as linhas e o zip com o manifesto. */
async function restaurarEConferir(
  dep: DependenciasDoTesteDeRestauracao,
  nome: string,
  pronta: string,
  doManifesto: Record<string, number>,
): Promise<ResultadoDoTesteDeRestauracao> {
  await restaurarBanco({
    ferramentas: dep.ferramentas,
    urlSuperusuario: dep.urlRestauracao,
    nome: BANCO_DESCARTAVEL,
    arquivoDump: join(pronta, 'banco.dump'),
  });
  const linhas = await contarLinhas(urlDoBanco(dep.urlRestauracao, BANCO_DESCARTAVEL));
  const diferencas = compararLinhas(linhas, doManifesto);
  if (diferencas.length > 0) {
    throw new Error(`As linhas restauradas não batem com o manifesto: ${diferencas.join(' ')}`);
  }
  const { arquivos } = await conferirZip(join(pronta, 'arquivos.zip'));
  return {
    backup: nome,
    detalhes: {
      tabelas: Object.keys(linhas).length,
      linhas: Object.values(linhas).reduce((soma, n) => soma + n, 0),
      arquivos,
    },
  };
}

export interface RestauracaoDoBanco {
  ferramentas: FerramentasDoPostgres;
  /** O superusuário da instância onde o banco é criado, com a senha. */
  urlSuperusuario: string;
  /** O banco novo, que ainda não existe. */
  nome: string;
  arquivoDump: string;
}

/** Cria o banco, do dono das tabelas quando ele existe, e restaura o dump nele numa transação. */
export async function restaurarBanco({
  ferramentas,
  urlSuperusuario,
  nome,
  arquivoDump,
}: RestauracaoDoBanco): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlSuperusuario });
  await cliente.connect();
  try {
    const { rowCount } = await cliente.query(
      "select 1 from pg_roles where rolname = 'grafite_owner'",
    );
    const dono = rowCount ? ' owner grafite_owner' : '';
    await cliente.query(`create database ${cliente.escapeIdentifier(nome)}${dono}`);
  } finally {
    await cliente.end();
  }
  const { url, senha } = separarSenha(urlDoBanco(urlSuperusuario, nome));
  const { codigo, erro } = await ferramentas.executar(
    'pg_restore',
    ['--exit-on-error', '--single-transaction', `--dbname=${url}`, arquivoDump],
    { senha },
  );
  if (codigo !== 0) throw new Error(`O pg_restore falhou: ${erro.trim()}`);
}

/** Confere que o pg_restore lê o dump inteiro, sem restaurar nada. */
export async function conferirDump(
  ferramentas: FerramentasDoPostgres,
  arquivo: string,
): Promise<void> {
  const { codigo, erro } = await ferramentas.executar('pg_restore', ['--list', arquivo]);
  if (codigo !== 0) throw new Error(`O pg_restore não conseguiu ler ${arquivo}: ${erro.trim()}`);
}

/** As linhas de cada tabela da aplicação no banco da conexão. */
export async function contarLinhas(url: string): Promise<Record<string, number>> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    return await contarLinhasNaConexao(cliente);
  } finally {
    await cliente.end();
  }
}

/** As diferenças entre as linhas restauradas e as do manifesto, em pt-BR; vazio quando batem. */
export function compararLinhas(
  restauradas: Record<string, number>,
  doManifesto: Record<string, number>,
): string[] {
  const tabelas = [...new Set([...Object.keys(restauradas), ...Object.keys(doManifesto)])].sort();
  const diferencas: string[] = [];
  for (const tabela of tabelas) {
    const restaurada = restauradas[tabela];
    const esperada = doManifesto[tabela];
    if (restaurada === esperada) continue;
    if (restaurada === undefined) diferencas.push(`${tabela} não está no banco restaurado.`);
    else if (esperada === undefined) diferencas.push(`${tabela} não está no manifesto.`);
    else diferencas.push(`${tabela} tem ${restaurada}, e o manifesto diz ${esperada}.`);
  }
  return diferencas;
}

async function apagarBanco(urlSuperusuario: string, nome: string): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlSuperusuario });
  await cliente.connect();
  try {
    await cliente.query(`drop database if exists ${cliente.escapeIdentifier(nome)} with (force)`);
  } finally {
    await cliente.end();
  }
}

/** Os bytes livres no disco de uma pasta. */
async function espacoLivreEm(pasta: string): Promise<number> {
  const { bavail, bsize } = await statfs(pasta);
  return bavail * bsize;
}

/** Os bytes livres no disco da pasta de dados da instância, que fica neste servidor. */
async function espacoLivreDaInstancia(urlSuperusuario: string): Promise<number> {
  const cliente = new pg.Client({ connectionString: urlSuperusuario });
  await cliente.connect();
  try {
    const { rows } = await cliente.query<{ data_directory: string }>('show data_directory');
    return await espacoLivreEm(rows[0]?.data_directory ?? '');
  } finally {
    await cliente.end();
  }
}

function urlDoBanco(url: string, nome: string): string {
  const conexao = new URL(url);
  conexao.pathname = `/${encodeURIComponent(nome)}`;
  return conexao.toString();
}

const UNIDADES = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const;

/** O tamanho em bytes como uma pessoa lê, em pt-BR: 1,5 GB. */
export function formatarTamanho(bytes: number): string {
  let valor = bytes;
  let unidade = 0;
  while (valor >= 1024 && unidade < UNIDADES.length - 1) {
    valor /= 1024;
    unidade += 1;
  }
  const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(valor);
  return `${numero} ${UNIDADES[unidade]}`;
}
