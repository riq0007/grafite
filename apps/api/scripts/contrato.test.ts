import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diferencasDoContrato, gerarContrato } from './contrato.ts';

let pasta = '';

function gravar(arquivos: Map<string, string>) {
  for (const [caminho, conteudo] of arquivos) {
    mkdirSync(dirname(join(pasta, caminho)), { recursive: true });
    writeFileSync(join(pasta, caminho), conteudo);
  }
}

afterEach(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true });
});

describe('diferencasDoContrato', () => {
  it('aponta os arquivos do cliente que não batem com a API atual', async () => {
    pasta = mkdtempSync(join(tmpdir(), 'grafite-contrato-'));
    gravar(
      new Map([
        ['openapi.json', '{}\n'],
        ['src/esquema.ts', 'export interface paths {}\n'],
      ]),
    );
    expect(await diferencasDoContrato(pasta)).toEqual(['openapi.json', 'src/esquema.ts']);
  });

  it('aponta arquivo ausente', async () => {
    pasta = mkdtempSync(join(tmpdir(), 'grafite-contrato-'));
    expect(await diferencasDoContrato(pasta)).toEqual(['openapi.json', 'src/esquema.ts']);
  });

  it('não aponta nada quando o cliente foi gerado da API atual', async () => {
    pasta = mkdtempSync(join(tmpdir(), 'grafite-contrato-'));
    gravar(await gerarContrato());
    expect(await diferencasDoContrato(pasta)).toEqual([]);
  });

  it('o contrato gerado descreve o /health', async () => {
    const openapi = JSON.parse((await gerarContrato()).get('openapi.json') ?? '{}');
    expect(Object.keys(openapi.paths)).toContain('/health');
  });
});
