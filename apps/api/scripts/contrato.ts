// Contrato da API: o OpenAPI sai dos mesmos schemas Zod que validam as requisições,
// e o cliente tipado (packages/api-client) sai do OpenAPI.
// Uso: node apps/api/scripts/contrato.ts escrever | verificar
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarBanco } from '@grafite/db';
import openapiTS, { astToString } from 'openapi-typescript';
import pg from 'pg';
import pacote from '../package.json' with { type: 'json' };
import { criarApp } from '../src/app.ts';

const pastaDoCliente = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/api-client',
);
const CABECALHO =
  '// Gerado por apps/api/scripts/contrato.ts a partir da API. Não edite à mão.\n\n';

/** Arquivos do cliente (caminho relativo a packages/api-client → conteúdo). */
export async function gerarContrato(): Promise<Map<string, string>> {
  // Gerar o contrato só monta as rotas: o pool nunca conecta, a chave nunca cifra nada, e nenhum
  // arquivo é gravado.
  const nuncaUsado = async () => {
    throw new Error('O contrato não grava nem lê arquivos.');
  };
  const app = await criarApp({
    ambiente: 'desenvolvimento',
    versao: pacote.version,
    verificarBanco: async () => {},
    banco: criarBanco(new pg.Pool()),
    chaveDoisPassos: Buffer.alloc(32),
    chavesDoCofre: { atual: Buffer.alloc(32) },
    armazenamento: { gravar: nuncaUsado, abrir: nuncaUsado, apagar: nuncaUsado },
    agora: () => new Date(),
  });
  await app.ready();
  const documento = app.swagger();
  await app.close();
  const openapi = `${JSON.stringify(documento, null, 2)}\n`;
  const esquema = CABECALHO + astToString(await openapiTS(JSON.parse(openapi)));
  return new Map([
    ['openapi.json', openapi],
    ['src/esquema.ts', esquema],
  ]);
}

/** Arquivos em `pasta` que não batem com o contrato gerado da API atual. */
export async function diferencasDoContrato(pasta: string): Promise<string[]> {
  const diferentes: string[] = [];
  for (const [caminho, conteudo] of await gerarContrato()) {
    const atual = await readFile(join(pasta, caminho), 'utf8').catch(() => null);
    if (atual !== conteudo) diferentes.push(caminho);
  }
  return diferentes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modo = process.argv[2];
  if (modo === 'escrever') {
    for (const [caminho, conteudo] of await gerarContrato()) {
      const destino = join(pastaDoCliente, caminho);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, conteudo);
    }
    console.log('Contrato e cliente da API regenerados.');
  } else if (modo === 'verificar') {
    const diferentes = await diferencasDoContrato(pastaDoCliente);
    if (diferentes.length > 0) {
      console.error(
        `O cliente da API está desatualizado em relação à API: ${diferentes.join(', ')}.\nRode: pnpm contrato:gerar`,
      );
      process.exitCode = 1;
    } else {
      console.log('Contrato da API em dia.');
    }
  } else {
    console.error('Uso: node apps/api/scripts/contrato.ts escrever | verificar');
    process.exitCode = 2;
  }
}
