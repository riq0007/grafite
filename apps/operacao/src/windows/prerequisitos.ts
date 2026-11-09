// Os pré-requisitos do servidor Windows com a versão e o hash fixados (change
// instalador-e-menu-da-operacao, design, decisão 4): o Node 24 e o PostgreSQL 18, pelos instaladores
// oficiais. O do Node vem do SHASUMS256.txt do nodejs.org; o do PostgreSQL, que a EDB não publica, é
// calculado ao fixar a versão, com a assinatura do instalador conferida. O arquivo fica em
// apps/operacao, no repositório e no pacote, e o atalho de instalação o lê antes de existir o Node.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** O `prerequisitos.json`, ao lado do `package.json` do comando de operação. */
export const PREREQUISITOS = fileURLToPath(new URL('../../prerequisitos.json', import.meta.url));

const Sha256 = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'o SHA-256 tem 64 caracteres hexadecimais, em minúsculas');

/** O instalador e a URL de onde ele vem, que dependem da versão. */
function daVersao<T extends { arquivo: string; url: string }>(
  esperado: (dado: T) => { arquivo: string; url: string; origem: string },
) {
  return (dado: T, contexto: z.RefinementCtx) => {
    const { arquivo, url, origem } = esperado(dado);
    if (dado.arquivo !== arquivo) {
      contexto.addIssue({
        code: 'custom',
        path: ['arquivo'],
        message: `o instalador é o ${arquivo}`,
      });
    } else if (dado.url !== url) {
      contexto.addIssue({
        code: 'custom',
        path: ['url'],
        message: `o instalador vem de ${origem}, com o nome do arquivo`,
      });
    }
  };
}

const Node = z
  .object({
    versao: z.string().regex(/^24\.\d+\.\d+$/, 'a produção usa o Node 24'),
    arquivo: z.string(),
    url: z.string(),
    sha256: Sha256,
  })
  .superRefine(
    daVersao(({ versao }) => ({
      arquivo: `node-v${versao}-x64.msi`,
      url: `https://nodejs.org/dist/v${versao}/node-v${versao}-x64.msi`,
      origem: `https://nodejs.org/dist/v${versao}/`,
    })),
  );

const Postgres = z
  .object({
    versao: z.string().regex(/^18\.\d+$/, 'a produção usa o PostgreSQL 18'),
    arquivo: z.string(),
    url: z.string(),
    sha256: Sha256,
  })
  .superRefine(
    daVersao(({ versao, arquivo }) => {
      // O número depois da versão é o da montagem da EDB, como o 1 de postgresql-18.6-1.
      const montagem = new RegExp(
        `^postgresql-${versao.replace('.', '\\.')}-\\d+-windows-x64\\.exe$`,
      );
      const esperado = montagem.test(arquivo) ? arquivo : `postgresql-${versao}-1-windows-x64.exe`;
      return {
        arquivo: esperado,
        url: `https://get.enterprisedb.com/postgresql/${esperado}`,
        origem: 'https://get.enterprisedb.com/postgresql/',
      };
    }),
  );

const Arquivo = z.object({ node: Node, postgres: Postgres });

export type Prerequisito = z.infer<typeof Node>;
export type Prerequisitos = z.infer<typeof Arquivo>;

/** Lê e confere o `prerequisitos.json`; o que não confere para com o campo e o motivo. */
export async function lerPrerequisitos(arquivo = PREREQUISITOS): Promise<Prerequisitos> {
  const lido = Arquivo.safeParse(JSON.parse(await readFile(arquivo, 'utf8')));
  if (!lido.success) {
    const [problema] = lido.error.issues;
    throw new Error(
      `O ${basename(arquivo)} não confere: ${problema?.path.join('.')}: ${problema?.message}.`,
    );
  }
  return lido.data;
}
