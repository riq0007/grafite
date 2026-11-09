// O manifesto de um backup (design do F2d, decisão 11): a versão, as migrations aplicadas, as linhas
// de cada tabela no instantâneo do dump e o tamanho e o SHA-256 de cada parte. Ele vai ao lado das
// partes, em `manifesto.json`, e é o que a restauração e o teste de restauração conferem.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

export const PARTES_DO_BACKUP = ['banco.dump', 'arquivos.zip'] as const;

export type ParteDoBackup = (typeof PARTES_DO_BACKUP)[number];

export interface Manifesto {
  /** A versão do Grafite que fez o backup. */
  versao: string;
  /** As migrations aplicadas, pela etiqueta, como `0017_papel_do_backup`. */
  migracoes: string[];
  /** ISO 8601. */
  criadoEm: string;
  /** As linhas de cada tabela (`esquema.tabela`) no instantâneo do dump. */
  linhas: Record<string, number>;
  partes: Record<ParteDoBackup, { tamanho: number; sha256: string }>;
}

export async function sha256DoArquivo(caminho: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(caminho), hash);
  return hash.digest('hex');
}

/** Os problemas das partes de uma pasta contra o manifesto, em pt-BR; vazio quando tudo bate. */
export async function conferirPartes(pasta: string, manifesto: Manifesto): Promise<string[]> {
  const problemas: string[] = [];
  for (const parte of PARTES_DO_BACKUP) {
    const esperado = manifesto.partes[parte];
    const caminho = join(pasta, parte);
    const tamanho = await stat(caminho).then(
      (informacoes) => informacoes.size,
      () => null,
    );
    if (tamanho === null) {
      problemas.push(`Falta a parte ${parte}.`);
    } else if (tamanho !== esperado.tamanho) {
      problemas.push(
        `A parte ${parte} tem ${tamanho} bytes, e o manifesto diz ${esperado.tamanho}.`,
      );
    } else if ((await sha256DoArquivo(caminho)) !== esperado.sha256) {
      problemas.push(`A parte ${parte} não confere com o hash do manifesto.`);
    }
  }
  return problemas;
}

/** O `manifesto.json` de uma pasta de backup, conferido no formato. */
export async function lerManifesto(pasta: string): Promise<Manifesto> {
  const texto = await readFile(join(pasta, 'manifesto.json'), 'utf8').catch(() => {
    throw new Error(`Falta o manifesto.json em ${pasta}.`);
  });
  let conteudo: unknown;
  try {
    conteudo = JSON.parse(texto);
  } catch (erro) {
    throw new Error(`O manifesto de ${pasta} não é válido.`, { cause: erro });
  }
  if (!manifestoValido(conteudo)) throw new Error(`O manifesto de ${pasta} não é válido.`);
  return conteudo;
}

const contagem = (valor: unknown) => Number.isSafeInteger(valor) && (valor as number) >= 0;
const objeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

function manifestoValido(valor: unknown): valor is Manifesto {
  if (!objeto(valor)) return false;
  const { versao, migracoes, criadoEm, linhas, partes } = valor;
  return (
    typeof versao === 'string' &&
    versao !== '' &&
    Array.isArray(migracoes) &&
    migracoes.every((migracao) => typeof migracao === 'string') &&
    typeof criadoEm === 'string' &&
    !Number.isNaN(Date.parse(criadoEm)) &&
    objeto(linhas) &&
    Object.values(linhas).every(contagem) &&
    objeto(partes) &&
    PARTES_DO_BACKUP.every((parte) => {
      const descricao = partes[parte];
      return (
        objeto(descricao) &&
        contagem(descricao.tamanho) &&
        typeof descricao.sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(descricao.sha256)
      );
    })
  );
}
