import { describe, expect, it } from 'vitest';
import {
  conferirSenha,
  criarConferenciaDeEngano,
  gerarHashDaSenha,
  precisaRegravar,
} from './senhas.ts';

const senha = 'cavalo bateria grampo correto';
/** Parâmetros menores que os de produção: um hash gravado antes de uma mudança deles. */
const antigos = { memoria: 8192, passadas: 1, paralelismo: 1 };

describe('gerarHashDaSenha', () => {
  it('grava no formato PHC do Argon2id, com os parâmetros, o sal de 16 bytes e 32 bytes de hash', async () => {
    expect(await gerarHashDaSenha(senha)).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
  });

  it('a mesma senha gera hashes diferentes, pelo sal', async () => {
    expect(await gerarHashDaSenha(senha)).not.toBe(await gerarHashDaSenha(senha));
  });

  it('não guarda a senha no texto', async () => {
    expect(await gerarHashDaSenha(senha)).not.toContain('cavalo');
  });
});

describe('conferirSenha', () => {
  it('aceita a senha certa e recusa a errada', async () => {
    const hash = await gerarHashDaSenha(senha);
    expect(await conferirSenha(senha, hash)).toBe(true);
    expect(await conferirSenha('cavalo bateria grampo errado', hash)).toBe(false);
  });

  it('lê os parâmetros do próprio texto', async () => {
    const hash = await gerarHashDaSenha(senha, antigos);
    expect(hash).toContain('$m=8192,t=1,p=1$');
    expect(await conferirSenha(senha, hash)).toBe(true);
  });

  it('a mesma senha escrita com o acento composto ou separado confere', async () => {
    const hash = await gerarHashDaSenha('senha do café da manhã');
    // A mesma frase com o acento separado da letra (U+0301 e U+0303), como alguns teclados digitam.
    expect(await conferirSenha('senha do café da manhã', hash)).toBe(true);
  });

  it.each([
    [''],
    ['texto qualquer'],
    [
      '$argon2i$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g',
    ],
    [
      '$argon2id$v=19$m=999999999,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g',
    ],
  ])('recusa, sem erro, o hash malformado %j', async (hash) => {
    expect(await conferirSenha(senha, hash)).toBe(false);
  });
});

describe('precisaRegravar', () => {
  it('pede para regravar o hash feito com outros parâmetros', async () => {
    expect(precisaRegravar(await gerarHashDaSenha(senha, antigos))).toBe(true);
  });

  it('não pede para regravar o hash feito com os parâmetros atuais', async () => {
    expect(precisaRegravar(await gerarHashDaSenha(senha))).toBe(false);
  });
});

describe('criarConferenciaDeEngano', () => {
  it('confere qualquer senha contra um hash que nenhuma senha conhecida abre', async () => {
    const conferirDeEngano = await criarConferenciaDeEngano();
    expect(await conferirDeEngano(senha)).toBe(false);
    expect(await conferirDeEngano('')).toBe(false);
  });
});
