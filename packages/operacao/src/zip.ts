// O zip dos arquivos do backup (design do F2d, decisão 11): o yazl grava os caminhos relativos, em
// barras normais e UTF-8, e o yauzl lê. O yauzl não confere o CRC das entradas; ele é conferido aqui,
// na leitura, com o do cabeçalho de cada uma.
import { createWriteStream } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { type Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32 } from 'node:zlib';
import yauzl from 'yauzl';
import yazl from 'yazl';

/** Zipa os arquivos de uma pasta e das subpastas dela, pelos caminhos relativos a ela. */
export async function zipar(pasta: string, destino: string): Promise<{ arquivos: number }> {
  const nomes = (await readdir(pasta, { recursive: true, withFileTypes: true }))
    .filter((item) => item.isFile())
    .map((item) => relative(pasta, join(item.parentPath, item.name)).split(sep).join('/'))
    .sort();
  return ziparArquivos(pasta, nomes, destino);
}

/** Zipa só os arquivos dados, pelos caminhos relativos à pasta, em barras normais. */
export async function ziparArquivos(
  pasta: string,
  nomes: readonly string[],
  destino: string,
): Promise<{ arquivos: number }> {
  const zip = new yazl.ZipFile();
  for (const nome of nomes) zip.addFile(join(pasta, ...nome.split('/')), nome);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(destino));
  return { arquivos: nomes.length };
}

/** Lê todas as entradas e confere o CRC de cada uma, sem gravar nada. */
export async function conferirZip(caminho: string): Promise<{ arquivos: number }> {
  return percorrerZip(
    caminho,
    () => new Writable({ write: (_parte, _codificacao, pronto) => pronto() }),
  );
}

/** Confere o zip inteiro e depois o extrai na pasta de destino, que é criada se faltar. */
export async function deszipar(caminho: string, destino: string): Promise<{ arquivos: number }> {
  await conferirZip(caminho);
  await mkdir(destino, { recursive: true });
  return percorrerZip(caminho, async (nome) => {
    const arquivo = join(destino, ...nome.split('/'));
    await mkdir(dirname(arquivo), { recursive: true });
    return createWriteStream(arquivo);
  });
}

/** O conteúdo de um arquivo do zip, pelo caminho em barras normais, ou `null` sem ele. */
export async function lerDoZip(caminho: string, nome: string): Promise<Buffer | null> {
  let conteudo: Buffer | null = null;
  await percorrerZip(caminho, (entrada) => {
    if (entrada !== nome) return null;
    const partes: Buffer[] = [];
    return new Writable({
      write: (parte: Buffer, _codificacao, pronto) => {
        partes.push(parte);
        pronto();
      },
      final: (pronto) => {
        conteudo = Buffer.concat(partes);
        pronto();
      },
    });
  });
  return conteudo;
}

const danificado = (caminho: string, motivo: string) =>
  new Error(`O zip ${caminho} está danificado: ${motivo}`);

/**
 * Passa o conteúdo de cada arquivo do zip para a saída que `saidaDe` dá; sem saída, o arquivo nem é
 * lido. Os erros da leitura e do CRC dizem que o zip está danificado; os da saída, como o disco
 * cheio, chegam como vieram.
 */
async function percorrerZip(
  caminho: string,
  saidaDe: (nome: string) => Writable | Promise<Writable> | null,
): Promise<{ arquivos: number }> {
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.openPromise(caminho, { lazyEntries: true, autoClose: false });
  } catch (erro) {
    throw danificado(caminho, (erro as Error).message);
  }
  let arquivos = 0;
  const lerEntrada = async (entrada: yauzl.Entry) => {
    if (entrada.fileName.endsWith('/')) return;
    const saida = await saidaDe(entrada.fileName);
    if (saida === null) return;
    let leitura: Readable;
    try {
      leitura = await zip.openReadStreamPromise(entrada);
    } catch (erro) {
      throw danificado(caminho, (erro as Error).message);
    }
    let erroDaLeitura: unknown;
    leitura.once('error', (erro) => {
      erroDaLeitura ??= erro;
    });
    try {
      await pipeline(leitura, conferenciaDoCrc(caminho, entrada), saida);
    } catch (erro) {
      if (erro === erroDaLeitura) throw danificado(caminho, (erro as Error).message);
      throw erro;
    }
    arquivos += 1;
  };
  try {
    await new Promise<void>((resolver, recusar) => {
      zip.on('error', (erro: Error) => recusar(danificado(caminho, erro.message)));
      zip.on('end', () => resolver());
      zip.on('entry', (entrada: yauzl.Entry) => {
        lerEntrada(entrada).then(() => zip.readEntry(), recusar);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return { arquivos };
}

function conferenciaDoCrc(caminho: string, entrada: yauzl.Entry): Transform {
  let crc = 0;
  return new Transform({
    transform(parte: Buffer, _codificacao, pronto) {
      crc = crc32(parte, crc);
      pronto(null, parte);
    },
    flush(pronto) {
      pronto(
        crc === entrada.crc32
          ? null
          : danificado(caminho, `a entrada ${entrada.fileName} não confere com o CRC.`),
      );
    },
  });
}

/**
 * As entradas de um zip na memória que `quais` escolhe, pelo caminho em barras normais, com o CRC
 * conferido (change p5a-backup-do-control-id, design, decisão 8): a API lê assim os JSON e as fotos
 * do backup do Control iD guardado, sem gravar nada em disco.
 */
export async function entradasDoZip(
  conteudo: Buffer,
  quais: (nome: string) => boolean = () => true,
): Promise<Map<string, Buffer>> {
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromBufferPromise(conteudo, { lazyEntries: true });
  } catch (erro) {
    throw danificado('enviado', (erro as Error).message);
  }
  const lidas = new Map<string, Buffer>();
  await new Promise<void>((resolver, recusar) => {
    zip.on('error', (erro: Error) => recusar(danificado('enviado', erro.message)));
    zip.on('end', () => resolver());
    zip.on('entry', (entrada: yauzl.Entry) => {
      if (entrada.fileName.endsWith('/') || !quais(entrada.fileName)) {
        zip.readEntry();
        return;
      }
      zip
        .openReadStreamPromise(entrada)
        .then(async (leitura) => {
          const partes: Buffer[] = [];
          await pipeline(
            leitura,
            conferenciaDoCrc('enviado', entrada),
            new Writable({
              write: (parte: Buffer, _codificacao, pronto) => {
                partes.push(parte);
                pronto();
              },
            }),
          );
          lidas.set(entrada.fileName, Buffer.concat(partes));
          zip.readEntry();
        })
        .catch((erro: Error) => recusar(danificado('enviado', erro.message)));
    });
    zip.readEntry();
  });
  return lidas;
}
