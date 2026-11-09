// O pacote da versão (spec operacao-servicos, "Pacote da versão"; design do F2d, decisões 5 e 7): o
// zip que o CI publica, com o hash ao lado (`<zip>.sha256`), conferido antes de tudo, e o
// `pacote.json` dentro, com a versão e os links do workspace, que um zip não carrega. Cada versão é
// desempacotada uma vez só, em `versoes\<x.y.z>`, numa pasta `.parcial` renomeada no fim; os links
// são recriados como junções, porque o Node só tira os tipos do TypeScript fora do node_modules.
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { deszipar, lerDoZip, renomearComPaciencia, sha256DoArquivo } from '@grafite/operacao';
import { z } from 'zod';
import type { Juncoes } from './windows/juncoes.ts';

/** A descrição do pacote, na raiz dele. */
export const DESCRICAO_DO_PACOTE = 'pacote.json';

/** Um caminho relativo à pasta do pacote, em barras normais, que não sai dela. */
const CaminhoNoPacote = z
  .string()
  .min(1)
  .refine(
    (caminho) =>
      !/^[a-z]:/i.test(caminho) &&
      !caminho.startsWith('/') &&
      !caminho.includes('\\') &&
      caminho.split('/').every((parte) => parte !== '' && parte !== '.' && parte !== '..'),
  );

const Descricao = z.object({
  versao: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** Os links do workspace: onde fica cada um e para onde ele aponta, os dois na pasta do pacote. */
  links: z.array(z.object({ caminho: CaminhoNoPacote, alvo: CaminhoNoPacote })),
});

export type DescricaoDoPacote = z.infer<typeof Descricao>;

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/**
 * Confere o pacote, o zip do Windows ou o tar do Linux, com o hash publicado ao lado dele. Um
 * pacote que não confere é recusado antes de qualquer mudança.
 */
export async function conferirHashDoPacote(arquivo: string): Promise<void> {
  const nome = basename(arquivo);
  if (!(await existe(arquivo))) throw new Error(`O pacote ${arquivo} não existe.`);
  const texto = await readFile(`${arquivo}.sha256`, 'utf8').catch(() => {
    throw new Error(
      `Falta o ${nome}.sha256, publicado com o pacote: ponha os dois na mesma pasta.`,
    );
  });
  const publicado = /^[0-9a-f]{64}\b/i.exec(texto.trim())?.[0]?.toLowerCase();
  if (publicado === undefined) throw new Error(`O ${nome}.sha256 não tem um hash SHA-256.`);
  if ((await sha256DoArquivo(arquivo)) !== publicado) {
    throw new Error(
      `O pacote ${nome} não confere com o hash publicado. Nada foi mudado: baixe o pacote e o .sha256 de novo.`,
    );
  }
}

/** Confere o zip com o hash e devolve a descrição de dentro dele. */
export async function conferirPacote(zip: string): Promise<DescricaoDoPacote> {
  const nome = basename(zip);
  await conferirHashDoPacote(zip);
  const conteudo = await lerDoZip(zip, DESCRICAO_DO_PACOTE);
  if (conteudo === null) {
    throw new Error(`O ${nome} não é um pacote do Grafite: falta o ${DESCRICAO_DO_PACOTE}.`);
  }
  let descricao: unknown;
  try {
    descricao = JSON.parse(conteudo.toString('utf8'));
  } catch {
    descricao = null;
  }
  const lida = Descricao.safeParse(descricao);
  if (!lida.success) throw new Error(`O ${DESCRICAO_DO_PACOTE} de ${nome} não é válido.`);
  return lida.data;
}

/**
 * Desempacota a versão em `<pastaDasVersoes>\<versão>`, se ela ainda não estiver lá, e confere os
 * links do workspace. O pacote já foi conferido (`conferirPacote`).
 */
export async function desempacotarVersao({
  zip,
  descricao,
  pastaDasVersoes,
  juncoes,
}: {
  zip: string;
  descricao: DescricaoDoPacote;
  pastaDasVersoes: string;
  juncoes: Juncoes;
}): Promise<{ pasta: string; jaEstava: boolean }> {
  const pasta = join(pastaDasVersoes, descricao.versao);
  const jaEstava = await existe(pasta);
  if (!jaEstava) {
    const parcial = `${pasta}.parcial`;
    await rm(parcial, { recursive: true, force: true });
    await deszipar(zip, parcial);
    await renomearComPaciencia(parcial, pasta);
  }
  await recriarLinks(pasta, descricao, juncoes);
  return { pasta, jaEstava };
}

/** Recria os links do workspace de uma pasta de pacote como junções; os que existem são refeitos. */
export async function recriarLinks(
  pasta: string,
  { links }: DescricaoDoPacote,
  juncoes: Juncoes,
): Promise<void> {
  const naPasta = (caminho: string) => join(pasta, ...caminho.split('/'));
  for (const { caminho, alvo } of links) {
    const link = naPasta(caminho);
    await mkdir(dirname(link), { recursive: true });
    await juncoes.apontar(link, naPasta(alvo));
  }
}
