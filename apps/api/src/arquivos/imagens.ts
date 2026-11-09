// O tratamento das imagens enviadas (spec arquivos-e-imagens; design do F2c, decisão 7). O tipo vem
// do conteúdo, e nunca do nome nem do tipo informado: o SVG pelo texto, e o resto pelo sharp. A
// imagem raster é regravada em WebP: sem os metadados, de pé conforme o EXIF e com no máximo 2048 px
// no maior lado. O SVG é guardado sanitizado. As miniaturas saem da regravada ou do SVG sanitizado.
// Para um servidor pequeno, só dois tratamentos correm ao mesmo tempo, cada um numa linha.
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { ProblemaDaApi } from '../problemas.ts';
import type { Variante } from './armazenamento.ts';
import { pareceSvg, sanitizarSvg } from './svg.ts';

sharp.concurrency(1);

/** O maior envio: 10 MiB. */
export const LIMITE_DO_ENVIO = 10 * 1024 * 1024;
const LIMITE_DE_PIXELS = 50_000_000;
const LADO_MAXIMO = 2048;
const MINIATURAS = [512, 256, 128, 64] as const;

/** O formato reconhecido no conteúdo enviado. */
export type OrigemDaImagem = 'png' | 'jpeg' | 'webp' | 'avif' | 'svg';

export interface ImagemTratada {
  origem: OrigemDaImagem;
  /** O tipo da variante completa: a regravada em WebP ou o SVG sanitizado. */
  tipo: 'image/webp' | 'image/svg+xml';
  /** As dimensões da variante completa. */
  largura: number;
  altura: number;
  /** Cada variante pronta para o armazenamento. */
  variantes: Record<Variante, Buffer>;
}

export const formatoNaoAceito = () =>
  new ProblemaDaApi({
    codigo: 'formato-nao-aceito',
    status: 415,
    titulo: 'Formato não aceito',
    detalhe: 'Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.',
  });

/** O envio passa de 10 MB: a mesma recusa para o tratamento e para o corpo grande demais. */
export const imagemPesadaDemais = () =>
  new ProblemaDaApi({
    codigo: 'imagem-pesada-demais',
    status: 413,
    titulo: 'Imagem pesada demais',
    detalhe: 'A imagem passa de 10 MB.',
  });

const imagemGrandeDemais = () =>
  new ProblemaDaApi({
    codigo: 'imagem-grande-demais',
    status: 400,
    titulo: 'Imagem grande demais',
    detalhe: 'A imagem é grande demais. Envie uma de até 50 megapixels.',
  });

const imagemIlegivel = () =>
  new ProblemaDaApi({
    codigo: 'imagem-ilegivel',
    status: 400,
    titulo: 'Imagem ilegível',
    detalhe: 'Não foi possível ler a imagem. O arquivo pode estar corrompido.',
  });

/**
 * Uma fila com `vagas` lugares: a tarefa espera a vez, e a que termina, bem ou mal, passa o lugar
 * direto para a primeira da fila.
 */
export function limitarA(vagas: number) {
  let ocupadas = 0;
  const fila: (() => void)[] = [];
  return async <T>(tarefa: () => Promise<T>): Promise<T> => {
    if (ocupadas < vagas) ocupadas += 1;
    else await new Promise<void>((entrar) => fila.push(entrar));
    try {
      return await tarefa();
    } finally {
      const proxima = fila.shift();
      if (proxima) proxima();
      else ocupadas -= 1;
    }
  };
}

const naVez = limitarA(2);

/** Trata a imagem enviada, ou recusa com o motivo: 415, 413 ou 400. */
export function tratarImagem(conteudo: Buffer): Promise<ImagemTratada> {
  if (conteudo.length > LIMITE_DO_ENVIO) return Promise.reject(imagemPesadaDemais());
  return naVez(() => (pareceSvg(conteudo) ? tratarSvg(conteudo) : tratar(conteudo)));
}

const ORIGENS: Partial<Record<string, OrigemDaImagem>> = { png: 'png', jpeg: 'jpeg', webp: 'webp' };

const LEITURA = { failOn: 'error', limitInputPixels: LIMITE_DE_PIXELS } as const;

/** A recusa de um erro do sharp ao ler a imagem: um cabeçalho gigante ou um conteúdo estragado. */
const recusaDaLeitura = (erro: unknown) =>
  /pixel limit/i.test((erro as Error).message) ? imagemGrandeDemais() : imagemIlegivel();

/** O formato pelo cabeçalho, sem decodificar: o executável e o GIF param aqui, e a bomba também. */
async function reconhecer(conteudo: Buffer): Promise<OrigemDaImagem> {
  let metadados: Metadata;
  try {
    metadados = await sharp(conteudo).metadata();
  } catch (erro) {
    if (/unsupported image format/i.test((erro as Error).message)) throw formatoNaoAceito();
    throw recusaDaLeitura(erro);
  }
  const { format, compression, width, height } = metadados;
  const origem: OrigemDaImagem | undefined =
    format === 'heif' ? (compression === 'av1' ? 'avif' : undefined) : ORIGENS[format];
  if (!origem) throw formatoNaoAceito();
  if (width * height > LIMITE_DE_PIXELS) throw imagemGrandeDemais();
  return origem;
}

const caberEm = (lado: number) =>
  ({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true }) as const;

async function tratar(conteudo: Buffer): Promise<ImagemTratada> {
  const origem = await reconhecer(conteudo);
  let regravada: { data: Buffer; info: OutputInfo };
  try {
    regravada = await sharp(conteudo, LEITURA)
      .autoOrient()
      .resize(caberEm(LADO_MAXIMO))
      .webp()
      .toBuffer({ resolveWithObject: true });
  } catch (erro) {
    throw recusaDaLeitura(erro);
  }
  const variantes = { completa: regravada.data } as Record<Variante, Buffer>;
  for (const lado of MINIATURAS) {
    variantes[`${lado}`] = await sharp(regravada.data).resize(caberEm(lado)).webp().toBuffer();
  }
  return {
    origem,
    tipo: 'image/webp',
    largura: regravada.info.width,
    altura: regravada.info.height,
    variantes,
  };
}

/** O SVG sanitizado é a variante completa, e as miniaturas são desenhadas a partir dele. */
async function tratarSvg(conteudo: Buffer): Promise<ImagemTratada> {
  const sanitizado = await sanitizarSvg(conteudo.toString('utf8'));
  if (sanitizado === null) throw imagemIlegivel();
  const completa = Buffer.from(sanitizado);
  try {
    const { width, height } = await sharp(completa).metadata();
    if (width * height > LIMITE_DE_PIXELS) throw imagemGrandeDemais();
    const variantes = { completa } as Record<Variante, Buffer>;
    for (const lado of MINIATURAS) {
      variantes[`${lado}`] = await sharp(completa, LEITURA).resize(caberEm(lado)).webp().toBuffer();
    }
    return { origem: 'svg', tipo: 'image/svg+xml', largura: width, altura: height, variantes };
  } catch (erro) {
    if (erro instanceof ProblemaDaApi) throw erro;
    throw recusaDaLeitura(erro);
  }
}
