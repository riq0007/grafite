// O pacote da versão para Linux (spec operacao-em-linux, "Pacote da versão para Linux"; change
// servidor-linux-com-docker, design, decisões 6 e 8): o tar que o CI publica, com o hash ao lado,
// conferido antes de tudo, como o zip do Windows: o hash cobre as imagens. Dentro, o pacote.json diz
// a versão e as imagens que ele leva, e o imagens.tar.gz as traz, para o Docker carregar. É um tar,
// e não um zip, porque todo Linux tem o tar, e o roteiro de instalação o abre antes do comando.
// O identificador de uma imagem muda de um Docker para outro (o do armazenamento do containerd é o
// do manifesto; o do clássico, o da configuração): a carga confere as etiquetas que o docker load
// diz ter carregado, e a marca da versão em versoes/ guarda o identificador que cada imagem ganhou
// no Docker do servidor. Cada versão é carregada uma vez só, enquanto as imagens forem essas.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { z } from 'zod';
import { conferirHashDoPacote, DESCRICAO_DO_PACOTE } from '../pacote.ts';

/** As imagens de cada versão, que o pacote leva com a etiqueta `grafite/<nome>:<versão>`. */
export const IMAGENS_DO_PACOTE = ['aplicacao', 'coletor', 'operacao', 'proxy', 'banco'] as const;

/** As imagens, comprimidas, dentro do tar do pacote. */
const ARQUIVO_DAS_IMAGENS = 'imagens.tar.gz';

const DescricaoDoLinux = z.object({
  versao: z.string().regex(/^\d+\.\d+\.\d+$/),
  plataforma: z.literal('linux'),
  /** As imagens que o pacote leva, todas as da versão. */
  imagens: z
    .array(z.enum(IMAGENS_DO_PACOTE))
    .refine((imagens) => IMAGENS_DO_PACOTE.every((nome) => imagens.includes(nome))),
});

export type DescricaoDoPacoteDoLinux = z.infer<typeof DescricaoDoLinux>;

/** A etiqueta de uma imagem de uma versão. */
export const imagemDaVersao = (nome: (typeof IMAGENS_DO_PACOTE)[number], versao: string) =>
  `grafite/${nome}:${versao}`;

const env = () => ({ env: process.env });

/** Confere o tar com o hash publicado e devolve a descrição de dentro dele, lida pelo tar. */
export async function conferirPacoteDoLinux(
  pacote: string,
  { executar }: { executar: ExecutarProcesso },
): Promise<DescricaoDoPacoteDoLinux> {
  const nome = basename(pacote);
  await conferirHashDoPacote(pacote);
  const { codigo, saida, erro } = await executar(
    'tar',
    ['-xOf', pacote, DESCRICAO_DO_PACOTE],
    env(),
  );
  if (codigo !== 0) {
    throw new Error(
      `O ${nome} não é um pacote do Grafite: falta o ${DESCRICAO_DO_PACOTE} (${(erro || saida).trim()}).`,
    );
  }
  let descricao: unknown;
  try {
    descricao = JSON.parse(saida);
  } catch {
    descricao = null;
  }
  const lida = DescricaoDoLinux.safeParse(descricao);
  if (!lida.success) {
    throw new Error(`O ${DESCRICAO_DO_PACOTE} de ${nome} não é o de um pacote para Linux.`);
  }
  return lida.data;
}

/** O identificador da imagem no Docker, ou nulo quando ela não está lá. */
async function idDaImagem(executar: ExecutarProcesso, imagem: string): Promise<string | null> {
  const { codigo, saida } = await executar(
    'docker',
    ['image', 'inspect', '--format', '{{.Id}}', imagem],
    env(),
  );
  return codigo === 0 ? saida.trim() : null;
}

/** O identificador de cada imagem no Docker do servidor, que a marca da versão guarda. */
type ImagensNoDocker = Record<(typeof IMAGENS_DO_PACOTE)[number], string>;

/** Se a marca da versão existe e cada imagem dela ainda é, no Docker, a que foi carregada. */
async function versaoCarregada(
  executar: ExecutarProcesso,
  pasta: string,
  versao: string,
): Promise<boolean> {
  const marca = await readFile(join(pasta, DESCRICAO_DO_PACOTE), 'utf8').then(
    (texto) => JSON.parse(texto) as { noDocker?: Partial<ImagensNoDocker> },
    () => null,
  );
  if (marca?.noDocker === undefined) return false;
  for (const nome of IMAGENS_DO_PACOTE) {
    const id = await idDaImagem(executar, imagemDaVersao(nome, versao));
    if (id === null || id !== marca.noDocker[nome]) return false;
  }
  return true;
}

/**
 * Carrega as imagens da versão no Docker, se ela ainda não estiver carregada, confere as etiquetas
 * que o docker load diz ter carregado e marca a versão. O pacote já foi conferido
 * (`conferirPacoteDoLinux`).
 */
export async function carregarVersao({
  pacote,
  descricao,
  pastaDasVersoes,
  executar,
}: {
  pacote: string;
  descricao: DescricaoDoPacoteDoLinux;
  pastaDasVersoes: string;
  executar: ExecutarProcesso;
}): Promise<{ jaEstava: boolean }> {
  const { versao } = descricao;
  const pasta = join(pastaDasVersoes, versao);
  if (await versaoCarregada(executar, pasta, versao)) return { jaEstava: true };
  const parcial = `${pasta}.parcial`;
  await rm(parcial, { recursive: true, force: true });
  await mkdir(parcial, { recursive: true });
  const extraido = await executar(
    'tar',
    ['-xf', pacote, '-C', parcial, ARQUIVO_DAS_IMAGENS],
    env(),
  );
  if (extraido.codigo !== 0) {
    throw new Error(
      `Não foi possível abrir as imagens de ${basename(pacote)}: ${(extraido.erro || extraido.saida).trim()}`,
    );
  }
  const imagens = join(parcial, ARQUIVO_DAS_IMAGENS);
  const carga = await executar('docker', ['load', '--input', imagens], env());
  if (carga.codigo !== 0) {
    throw new Error(
      `O Docker não carregou as imagens da versão ${versao}: ${(carga.erro || carga.saida).trim()}`,
    );
  }
  const carregadas = new Set(
    carga.saida
      .split('\n')
      .map((linha) => /^Loaded image: (.+)$/.exec(linha.trim())?.[1])
      .filter((imagem) => imagem !== undefined),
  );
  const noDocker = {} as ImagensNoDocker;
  for (const nome of IMAGENS_DO_PACOTE) {
    const imagem = imagemDaVersao(nome, versao);
    const id = carregadas.has(imagem) ? await idDaImagem(executar, imagem) : null;
    if (id === null) {
      throw new Error(`O docker load não trouxe a imagem ${imagem}, que o pacote diz levar.`);
    }
    noDocker[nome] = id;
  }
  await rm(parcial, { recursive: true, force: true });
  await mkdir(pasta, { recursive: true });
  await writeFile(
    join(pasta, DESCRICAO_DO_PACOTE),
    `${JSON.stringify({ ...descricao, noDocker }, null, 2)}\n`,
  );
  return { jaEstava: false };
}
