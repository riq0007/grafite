// A saúde dos apps, contra servidores locais: o HTTP da porta do app e um HTTPS no lugar do proxy,
// com um certificado gerado no teste.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer as criarHttp, type Server as ServidorHttp } from 'node:http';
import { createServer as criarHttps } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate } from 'selfsigned';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { servicoDaPortaNoLinux } from './layout.ts';
import { conferirSaude, saudeNoLinux, saudePelaRede } from './saude.ts';

let pasta: string;
const servidores: ServidorHttp[] = [];

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-saude-'));
});

afterEach(async () => {
  for (const servidor of servidores.splice(0)) {
    await new Promise<void>((pronto) => servidor.close(() => pronto()));
  }
  await rm(pasta, { recursive: true, force: true });
});

async function ouvir(servidor: ServidorHttp): Promise<number> {
  servidores.push(servidor);
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', () => pronto()));
  return (servidor.address() as AddressInfo).port;
}

const rapido = { prazoLocal: 1_000, prazoDoProxy: 1_000, intervalo: 20 };

describe('conferirSaude', () => {
  it('passa com a versão e o ambiente esperados', () => {
    expect(() =>
      conferirSaude(
        { status: 'ok', versao: '0.4.0', ambiente: 'producao' },
        { versao: '0.4.0', ambiente: 'producao' },
        'O app da produção',
      ),
    ).not.toThrow();
  });

  it('recusa a versão ou o ambiente diferentes, dizendo o que respondeu', () => {
    expect(() =>
      conferirSaude(
        { status: 'ok', versao: '0.3.0', ambiente: 'producao' },
        { versao: '0.4.0', ambiente: 'producao' },
        'O app da produção',
      ),
    ).toThrow('O app da produção respondeu a versão 0.3.0, e a esperada é a 0.4.0.');
    expect(() =>
      conferirSaude(
        { status: 'ok', versao: '0.4.0', ambiente: 'teste' },
        { versao: '0.4.0', ambiente: 'producao' },
        'O app da produção',
      ),
    ).toThrow('O app da produção respondeu o ambiente teste, e o esperado é producao.');
  });
});

describe('saude.local', () => {
  it('espera o app responder ok, passando pelo degradado', async () => {
    let pedidos = 0;
    const porta = await ouvir(
      criarHttp((pedido, resposta) => {
        pedidos += 1;
        resposta.setHeader('content-type', 'application/json');
        resposta.end(
          JSON.stringify({
            status: pedidos < 3 ? 'degradado' : 'ok',
            versao: '0.4.0',
            ambiente: 'teste',
            caminho: pedido.url,
          }),
        );
      }),
    );
    await expect(saudePelaRede(rapido).local(porta)).resolves.toMatchObject({
      status: 'ok',
      versao: '0.4.0',
      ambiente: 'teste',
      caminho: '/health',
    });
    expect(pedidos).toBe(3);
  });

  it('desiste no prazo com o último motivo, como o 503 do banco fora', async () => {
    const porta = await ouvir(
      criarHttp((_pedido, resposta) => {
        resposta.statusCode = 503;
        resposta.end(JSON.stringify({ status: 'indisponivel', versao: '0.4.0' }));
      }),
    );
    await expect(saudePelaRede(rapido).local(porta)).rejects.toThrow(
      `O app em 127.0.0.1:${porta} não respondeu com saúde em 1 s: respondeu indisponivel.`,
    );
  });

  it('desiste no prazo quando nada atende na porta', async () => {
    const livre = await ouvir(criarHttp());
    await new Promise<void>((pronto) => servidores.pop()?.close(() => pronto()));
    await expect(saudePelaRede(rapido).local(livre)).rejects.toThrow(
      new RegExp(`^O app em 127\\.0\\.0\\.1:${livre} não respondeu com saúde em 1 s: .+`),
    );
  });
});

describe('saude.peloProxy', () => {
  /** Um HTTPS em 127.0.0.1 com o certificado do endereço, no lugar do proxy; devolve a porta e a raiz. */
  async function proxyDeExemplo(endereco: string) {
    const { private: chave, cert } = await generate([{ name: 'commonName', value: endereco }], {
      algorithm: 'sha256',
    });
    const raiz = join(pasta, 'root.crt');
    await writeFile(raiz, cert);
    const hosts: string[] = [];
    const porta = await ouvir(
      criarHttps({ key: chave, cert }, (pedido, resposta) => {
        hosts.push(String(pedido.headers.host));
        resposta.end(JSON.stringify({ status: 'ok', versao: '0.4.0', ambiente: 'producao' }));
      }) as unknown as ServidorHttp,
    );
    return { porta, raiz, hosts };
  }

  it('pede a saúde ao próprio servidor, com o nome do endereço e confiando na raiz dada', async () => {
    const { porta, raiz, hosts } = await proxyDeExemplo('grafite.empresa.local');
    const saude = saudePelaRede({ ...rapido, portaDoProxy: porta });
    await expect(saude.peloProxy('grafite.empresa.local', { raiz })).resolves.toEqual({
      status: 'ok',
      versao: '0.4.0',
      ambiente: 'producao',
    });
    expect(hosts).toEqual(['grafite.empresa.local']);
  });

  it('recusa o certificado em que não confia', async () => {
    const { porta } = await proxyDeExemplo('grafite.empresa.local');
    await expect(
      saudePelaRede({ ...rapido, portaDoProxy: porta }).peloProxy('grafite.empresa.local'),
    ).rejects.toThrow(
      /^O endereço https:\/\/grafite\.empresa\.local não respondeu com saúde em 1 s: .*certificate/,
    );
  });

  it('recusa o certificado de outro nome, mesmo com a raiz', async () => {
    const { porta, raiz } = await proxyDeExemplo('grafite.empresa.local');
    await expect(
      saudePelaRede({ ...rapido, portaDoProxy: porta }).peloProxy('grafite-teste.empresa.local', {
        raiz,
      }),
    ).rejects.toThrow(/^O endereço https:\/\/grafite-teste\.empresa\.local não respondeu/);
  });
});

describe('a saúde pela rede interna do Linux', () => {
  it('pede o app ao host da porta, como o nome do serviço no Linux', async () => {
    const porta = await ouvir(
      criarHttp((_pedido, resposta) => {
        resposta.end(JSON.stringify({ status: 'ok', versao: '0.4.0', ambiente: 'producao' }));
      }),
    );
    const perguntadas: number[] = [];
    const saude = saudePelaRede({
      ...rapido,
      hostDaPorta: (perguntada) => {
        perguntadas.push(perguntada);
        return '127.0.0.1';
      },
    });
    await expect(saude.local(porta)).resolves.toMatchObject({ status: 'ok' });
    expect(perguntadas).toEqual([porta]);
    await expect(
      saudePelaRede({ ...rapido, hostDaPorta: () => 'app-producao.invalid' }).local(porta),
    ).rejects.toThrow(`O app em app-producao.invalid:${porta} não respondeu com saúde em 1 s`);
  });

  it('pede a saúde pelo HTTPS ao host do proxy, com o nome do endereço', async () => {
    await expect(
      saudePelaRede({ ...rapido, hostDoProxy: 'proxy.invalid' }).peloProxy('grafite.empresa.local'),
    ).rejects.toThrow(
      /^O endereço https:\/\/grafite\.empresa\.local não respondeu com saúde em 1 s: .*proxy\.invalid/,
    );
  });

  it('no Linux, cada porta é a de um serviço da rede interna, e o proxy é o serviço dele', async () => {
    expect([3000, 3001, 3100].map(servicoDaPortaNoLinux)).toEqual([
      'app-producao',
      'app-teste',
      'coletor',
    ]);
    expect(() => servicoDaPortaNoLinux(8080)).toThrow(
      'A porta 8080 não é a de um serviço do Grafite.',
    );
    await expect(saudeNoLinux(rapido).local(3000)).rejects.toThrow(/^O app em app-producao:3000 /);
    await expect(saudeNoLinux(rapido).peloProxy('grafite.empresa.local')).rejects.toThrow(
      /: .*\bproxy\b/,
    );
  });
});
