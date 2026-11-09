import { describe, expect, it } from 'vitest';
import {
  codificarBase32,
  conferirCodigoDoApp,
  decodificarBase32,
  formatarChave,
  gerarCodigoHotp,
  gerarCodigoTotp,
  uriDoApp,
} from './totp.ts';

/** A chave dos vetores das RFCs 4226 e 6238. */
const chaveDasRfcs = Buffer.from('12345678901234567890', 'ascii');
const passo = 30_000;

describe('base32 (RFC 4648)', () => {
  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('%j vira %j, sem o preenchimento', (texto, base32) => {
    expect(codificarBase32(Buffer.from(texto, 'ascii'))).toBe(base32);
    expect(decodificarBase32(base32).toString('ascii')).toBe(texto);
  });

  it('lê também com o preenchimento, em minúsculas e com espaços', () => {
    expect(decodificarBase32('mzxw 6ytb oi======').toString('ascii')).toBe('foobar');
  });

  it('a chave das RFCs em base32', () => {
    expect(codificarBase32(chaveDasRfcs)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
});

describe('HOTP (RFC 4226)', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [4, '338314'],
    [5, '254676'],
    [6, '287922'],
    [7, '162583'],
    [8, '399871'],
    [9, '520489'],
  ])('contador %i gera %s', (contador, codigo) => {
    expect(gerarCodigoHotp(chaveDasRfcs, contador)).toBe(codigo);
  });
});

describe('TOTP (RFC 6238, SHA-1 com 8 dígitos)', () => {
  it.each([
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
    [20_000_000_000, '65353130'],
  ])('no segundo %i gera %s', (segundos, codigo) => {
    expect(gerarCodigoTotp(chaveDasRfcs, segundos * 1000, 8)).toBe(codigo);
  });
});

describe('conferirCodigoDoApp', () => {
  const agora = 1_234_567_890_000;
  const passoAtual = Math.floor(agora / passo);
  const codigoDo = (deslocamento: number) =>
    gerarCodigoTotp(chaveDasRfcs, agora + deslocamento * passo);

  it('aceita o código do intervalo atual e devolve o passo dele', () => {
    expect(conferirCodigoDoApp(chaveDasRfcs, codigoDo(0), agora, null)).toBe(passoAtual);
  });

  it('aceita o do intervalo anterior e o do seguinte', () => {
    expect(conferirCodigoDoApp(chaveDasRfcs, codigoDo(-1), agora, null)).toBe(passoAtual - 1);
    expect(conferirCodigoDoApp(chaveDasRfcs, codigoDo(1), agora, null)).toBe(passoAtual + 1);
  });

  it('recusa o código de dois intervalos atrás', () => {
    expect(conferirCodigoDoApp(chaveDasRfcs, codigoDo(-2), agora, null)).toBeNull();
  });

  it('recusa o código de um passo já usado, ou anterior a ele', () => {
    expect(conferirCodigoDoApp(chaveDasRfcs, codigoDo(0), agora, passoAtual)).toBeNull();
    expect(conferirCodigoDoApp(chaveDasRfcs, codigoDo(-1), agora, passoAtual)).toBeNull();
    expect(conferirCodigoDoApp(chaveDasRfcs, codigoDo(1), agora, passoAtual)).toBe(passoAtual + 1);
  });

  it('aceita o código com o espaço que os apps mostram no meio', () => {
    const codigo = codigoDo(0);
    expect(
      conferirCodigoDoApp(chaveDasRfcs, `${codigo.slice(0, 3)} ${codigo.slice(3)}`, agora, null),
    ).toBe(passoAtual);
  });

  it.each(['000000', '12a456', '12345', '1234567', ''])('recusa o código %j', (codigo) => {
    expect(conferirCodigoDoApp(chaveDasRfcs, codigo, agora, null)).toBeNull();
  });
});

describe('o cadastro no app', () => {
  it('a URI traz a chave, o emissor, o usuário e a organização', () => {
    expect(uriDoApp({ chave: chaveDasRfcs, usuario: 'joao.silva', organizacao: 'Empresa X' })).toBe(
      'otpauth://totp/Grafite%3Ajoao.silva%20(Empresa%20X)?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Grafite&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('a chave em texto vem em grupos de 4', () => {
    expect(formatarChave(chaveDasRfcs)).toBe('GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ');
  });
});
