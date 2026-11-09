// A vigilância do certificado (spec https-interno; design do F2d, decisão 10), contra um servidor
// HTTPS local com um certificado gerado no teste, de validade escolhida.
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { generate } from 'selfsigned';
import { afterEach, describe, expect, it } from 'vitest';
import { diasDeValidade, vigiarCertificado } from './certificado.ts';

const DIA = 24 * 60 * 60 * 1000;
/** O momento do teste: os certificados vencem em dias inteiros a partir dele. */
const AGORA = new Date('2026-10-07T12:00:00.000Z');

let servidor: Server | undefined;

afterEach(async () => {
  await new Promise<void>((pronto) => (servidor ? servidor.close(() => pronto()) : pronto()));
  servidor = undefined;
});

/** Um servidor HTTPS em 127.0.0.1, com o certificado que vence em `dias`; devolve o endereço. */
async function servidorQueVenceEm(dias: number): Promise<string> {
  const { private: chave, cert } = await generate(
    [{ name: 'commonName', value: 'grafite.empresa.local' }],
    {
      notBeforeDate: new Date(AGORA.getTime() + Math.min(-1, dias - 1) * DIA),
      notAfterDate: new Date(AGORA.getTime() + dias * DIA),
    },
  );
  const https = createServer({ key: chave, cert }, (_pedido, resposta) => resposta.end('ok'));
  servidor = https;
  await new Promise<void>((pronto) => https.listen(0, '127.0.0.1', () => pronto()));
  return `127.0.0.1:${(https.address() as AddressInfo).port}`;
}

describe('diasDeValidade', () => {
  it('lê pela conexão TLS quantos dias faltam para o certificado vencer', async () => {
    const endereco = await servidorQueVenceEm(60);
    await expect(diasDeValidade(endereco, { agora: () => AGORA })).resolves.toBe(60);
  });

  it('recusa com o motivo quando o endereço não responde', async () => {
    await expect(
      diasDeValidade('127.0.0.1:1', { agora: () => AGORA, tempoLimite: 2_000 }),
    ).rejects.toThrow(/^Não foi possível conferir o certificado de 127\.0\.0\.1:1: .+/);
  });
});

describe('vigiarCertificado', () => {
  it('com 60 dias, passa e diz quantos faltam', async () => {
    const endereco = await servidorQueVenceEm(60);
    await expect(vigiarCertificado(endereco, { agora: () => AGORA })).resolves.toBe(60);
  });

  it('com 10 dias, falha dizendo que a renovação não aconteceu', async () => {
    const endereco = await servidorQueVenceEm(10);
    await expect(vigiarCertificado(endereco, { agora: () => AGORA })).rejects.toThrow(
      `O certificado de ${endereco} vence em 10 dias, e a renovação não aconteceu.`,
    );
  });

  it('com 14 dias, ainda passa', async () => {
    const endereco = await servidorQueVenceEm(14);
    await expect(vigiarCertificado(endereco, { agora: () => AGORA })).resolves.toBe(14);
  });

  it('o certificado vencido falha dizendo que já venceu', async () => {
    const endereco = await servidorQueVenceEm(-2);
    await expect(vigiarCertificado(endereco, { agora: () => AGORA })).rejects.toThrow(
      `O certificado de ${endereco} venceu há 2 dias, e a renovação não aconteceu.`,
    );
  });

  it('o endereço que não responde falha com o motivo', async () => {
    await expect(
      vigiarCertificado('127.0.0.1:1', { agora: () => AGORA, tempoLimite: 2_000 }),
    ).rejects.toThrow(/^Não foi possível conferir o certificado de 127\.0\.0\.1:1/);
  });
});
