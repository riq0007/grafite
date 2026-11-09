// O arquivo do pacote de software (spec distribuicao-de-software, "Base de software"; change
// distribuicao-de-software, design, decisão 1): cortado em pedaços de 8 MB, cada um comprimido pelo
// gzip, com o SHA-512 da parte comprimida, que é o que o agente do GLPI baixa e confere, e o SHA-512
// do arquivo inteiro, que ele confere depois de juntar as partes.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pacotesDeSoftware, partesDosPacotes, type Transacao } from '@grafite/db';
import { TAMANHO_DA_PARTE_DO_PACOTE } from '@grafite/domain';
import { asc, eq } from 'drizzle-orm';
import { type Armazenamento, chaveDaParteDoPacote } from '../arquivos/armazenamento.ts';

const sha512 = (conteudo: Buffer) => createHash('sha512').update(conteudo).digest('hex');

export interface ParteDoArquivo {
  indice: number;
  sha512: string;
  conteudo: Buffer;
}

/** As partes do arquivo, na ordem, e o SHA-512 dele inteiro. */
export function partesDoArquivo(
  arquivo: Buffer,
  tamanhoDaParte = TAMANHO_DA_PARTE_DO_PACOTE,
): { sha512: string; partes: ParteDoArquivo[] } {
  const partes: ParteDoArquivo[] = [];
  for (let inicio = 0, indice = 0; inicio < arquivo.length; inicio += tamanhoDaParte, indice++) {
    const conteudo = gzipSync(arquivo.subarray(inicio, inicio + tamanhoDaParte));
    partes.push({ indice, sha512: sha512(conteudo), conteudo });
  }
  return { sha512: sha512(arquivo), partes };
}

/**
 * Troca o arquivo do pacote: grava as partes novas no armazenamento e no banco, apaga as que sobram
 * e guarda o nome, o tamanho e o SHA-512 no pacote.
 */
export async function trocarArquivoDoPacote(
  tx: Transacao,
  {
    orgId,
    pacoteId,
    nome,
    arquivo,
    armazenamento,
    momento,
  }: {
    orgId: string;
    pacoteId: string;
    nome: string;
    arquivo: Buffer;
    armazenamento: Armazenamento;
    momento: Date;
  },
): Promise<{ sha512: string; partes: number }> {
  const { sha512: doArquivo, partes } = partesDoArquivo(arquivo);
  const antes = await tx
    .select({ indice: partesDosPacotes.indice })
    .from(partesDosPacotes)
    .where(eq(partesDosPacotes.pacoteId, pacoteId))
    .orderBy(asc(partesDosPacotes.indice));
  for (const parte of partes) {
    await armazenamento.gravar(chaveDaParteDoPacote(orgId, pacoteId, parte.indice), parte.conteudo);
  }
  for (const { indice } of antes) {
    if (indice >= partes.length) {
      await armazenamento.apagar(chaveDaParteDoPacote(orgId, pacoteId, indice));
    }
  }
  await tx.delete(partesDosPacotes).where(eq(partesDosPacotes.pacoteId, pacoteId));
  if (partes.length > 0) {
    await tx.insert(partesDosPacotes).values(
      partes.map((parte) => ({
        orgId,
        pacoteId,
        indice: parte.indice,
        sha512: parte.sha512,
        tamanho: parte.conteudo.length,
      })),
    );
  }
  await tx
    .update(pacotesDeSoftware)
    .set({
      nomeDoArquivo: nome,
      tamanhoDoArquivo: arquivo.length,
      sha512DoArquivo: doArquivo,
      atualizadoEm: momento,
    })
    .where(eq(pacotesDeSoftware.id, pacoteId));
  return { sha512: doArquivo, partes: partes.length };
}
