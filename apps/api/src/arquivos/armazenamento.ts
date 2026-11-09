// O armazenamento dos arquivos (spec arquivos-e-imagens; design do F2c, decisão 6): a interface que
// a API usa, trocável por outra, como a de um S3, sem mudar quem a usa, e a primeira implementação,
// em disco. A chave é `<org_id>/<arquivo_id>/<variante>`, e cada organização fica na própria pasta.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** As variantes de uma imagem: a regravada inteira e as miniaturas, pelo lado do quadrado. */
export const VARIANTES = ['completa', '512', '256', '128', '64'] as const;
export type Variante = (typeof VARIANTES)[number];

export interface Armazenamento {
  /** Grava o conteúdo da chave inteiro ou nada: quem abre nunca vê um conteúdo pela metade. */
  gravar(chave: string, conteudo: Buffer): Promise<void>;
  /** O conteúdo da chave, ou `null` se ela não tem nenhum. */
  abrir(chave: string): Promise<Buffer | null>;
  /** Apaga o conteúdo da chave; apagar o que não existe não é erro. */
  apagar(chave: string): Promise<void>;
}

/** A chave de uma variante de um arquivo de uma organização. */
export const chaveDoArquivo = (orgId: string, arquivoId: string, variante: Variante) =>
  `${orgId}/${arquivoId}/${variante}`;

/**
 * A chave do ZIP de um backup do Control iD (change p5a-backup-do-control-id, design, decisão 7):
 * na pasta da organização, pelo id do backup, que não é um arquivo da tabela dos arquivos.
 */
export const chaveDoBackupDoControlId = (orgId: string, backupId: string) =>
  `${orgId}/${backupId}/zip`;

/** A chave do modelo de uma planta do mapa (change p7-mapa-da-planta, design, decisão 1). */
export const chaveDoModeloDaPlanta = (orgId: string, plantaId: string) =>
  `${orgId}/${plantaId}/modelo`;

/**
 * A chave de uma parte do arquivo de um pacote de software (change distribuicao-de-software, design,
 * decisão 1): na pasta da organização, pelo id do pacote e pelo índice da parte.
 */
export const chaveDaParteDoPacote = (orgId: string, pacoteId: string, indice: number) =>
  `${orgId}/${pacoteId}/parte-${indice}`;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FORMATO_DA_CHAVE = new RegExp(
  `^${UUID}/${UUID}/(${[...VARIANTES, 'zip', 'modelo'].join('|')}|parte-\\d{1,4})$`,
);

/** Os erros de tirar a pasta do arquivo que só dizem que ela ainda tem outra variante ou já saiu. */
const PASTA_QUE_FICA = new Set(['ENOTEMPTY', 'EEXIST', 'ENOENT']);

/** Os arquivos na pasta da configuração, em `<pasta>/<org_id>/<arquivo_id>/<variante>`. */
export class ArmazenamentoEmDisco implements Armazenamento {
  readonly pasta: string;

  constructor(pasta: string) {
    this.pasta = resolve(pasta);
  }

  async gravar(chave: string, conteudo: Buffer): Promise<void> {
    const destino = this.caminho(chave);
    await mkdir(dirname(destino), { recursive: true });
    // Gravado ao lado, com outro nome, e renomeado no fim, numa troca atômica. O temporário de uma
    // gravação que falha é apagado.
    const temporario = `${destino}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporario, conteudo, { flush: true });
      await rename(temporario, destino);
    } catch (erro) {
      await rm(temporario, { force: true });
      throw erro;
    }
  }

  async abrir(chave: string): Promise<Buffer | null> {
    try {
      return await readFile(this.caminho(chave));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw erro;
    }
  }

  async apagar(chave: string): Promise<void> {
    const caminho = this.caminho(chave);
    await rm(caminho, { force: true });
    // A pasta do arquivo sai com a última variante.
    await rmdir(dirname(caminho)).catch((erro: NodeJS.ErrnoException) => {
      if (!PASTA_QUE_FICA.has(erro.code ?? '')) throw erro;
    });
  }

  /** O caminho da chave, que só existe no formato dela: nenhuma chave sai da pasta. */
  private caminho(chave: string): string {
    if (!FORMATO_DA_CHAVE.test(chave)) throw new Error(`Chave de arquivo inválida: ${chave}.`);
    return join(this.pasta, ...chave.split('/'));
  }
}
