// O download dos instaladores dos pré-requisitos (change instalador-e-menu-da-operacao, design,
// decisões 3 e 4), contra um servidor HTTP local: o arquivo gravado e o SHA-256 do que foi gravado.
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { baixadorDaRede } from './baixador.ts';

let pasta: string;
let servidor: Server;
let base: string;

const CONTEUDO = Buffer.alloc(3 * 1024 * 1024, 'grafite');

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-baixador-'));
  servidor = createServer((pedido, resposta) => {
    if (pedido.url === '/instalador.msi') {
      resposta.writeHead(200, { 'content-length': CONTEUDO.length });
      resposta.end(CONTEUDO);
    } else {
      resposta.writeHead(404).end();
    }
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((fechado) => servidor.close(fechado));
  await rm(pasta, { recursive: true, force: true });
});

describe('baixadorDaRede', () => {
  it('grava o arquivo e devolve o SHA-256 do que gravou', async () => {
    const arquivo = join(pasta, 'instalador.msi');

    const sha256 = await baixadorDaRede.baixar(`${base}/instalador.msi`, arquivo);

    expect(sha256).toBe(createHash('sha256').update(CONTEUDO).digest('hex'));
    expect((await readFile(arquivo)).equals(CONTEUDO)).toBe(true);
  });

  it('recusa a resposta de erro, sem deixar arquivo', async () => {
    const arquivo = join(pasta, 'falta.msi');

    await expect(baixadorDaRede.baixar(`${base}/falta.msi`, arquivo)).rejects.toThrow(
      `O download de ${base}/falta.msi falhou: HTTP 404.`,
    );
    await expect(access(arquivo)).rejects.toThrow();
  });
});
