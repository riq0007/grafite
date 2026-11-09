import { describe, expect, it } from 'vitest';
import { lerIp, lerMac, lerUrl } from './rede.ts';

const aceita = (valor: unknown) => ({ ok: true, valor });
const recusa = (erro: string) => ({ ok: false, erro });

describe('lerIp', () => {
  it.each([
    ['192.168.0.10', '192.168.0.10'],
    [' 10.0.0.1 ', '10.0.0.1'],
    ['192.168.000.010', '192.168.0.10'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8::1'],
    ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
    ['1:0:0:0:0:0:0:8', '1::8'],
    ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'],
    ['::1', '::1'],
    ['::', '::'],
    ['[fe80::1]', 'fe80::1'],
    ['::ffff:192.168.0.1', '::ffff:192.168.0.1'],
    ['::FFFF:C0A8:0001', '::ffff:192.168.0.1'],
    ['1:2:3:4:5:6:7:8', '1:2:3:4:5:6:7:8'],
  ])('lê %j na forma canônica %j', (entrada, valor) => {
    expect(lerIp(entrada)).toEqual(aceita(valor));
  });

  it.each([
    '256.1.1.1',
    '10.0.0',
    '10.0.0.1.2',
    'abc',
    '2001:db8::1::1',
    '1:2:3:4:5:6:7:8:9',
    'fe80::1%eth0',
    '12345::1',
    3232235521,
  ])('recusa %j', (entrada) => {
    expect(lerIp(entrada)).toEqual(recusa('Use um IP, como 192.168.0.10.'));
  });
});

describe('lerMac', () => {
  it.each([
    ['aa-bb-cc-dd-ee-ff', 'AA:BB:CC:DD:EE:FF'],
    ['AA:BB:CC:DD:EE:FF', 'AA:BB:CC:DD:EE:FF'],
    ['aabb.ccdd.eeff', 'AA:BB:CC:DD:EE:FF'],
    ['aabbccddeeff', 'AA:BB:CC:DD:EE:FF'],
    [' 00:1a:2B:3c:4D:5e ', '00:1A:2B:3C:4D:5E'],
  ])('lê %j', (entrada, valor) => {
    expect(lerMac(entrada)).toEqual(aceita(valor));
  });

  it.each(['AA:BB:CC:DD:EE', 'GG:BB:CC:DD:EE:FF', 'AA:BB-CC:DD:EE:FF', 'aabb.ccddeeff', 12])(
    'recusa %j',
    (entrada) => {
      expect(lerMac(entrada)).toEqual(recusa('Use um MAC, como AA:BB:CC:DD:EE:FF.'));
    },
  );
});

describe('lerUrl', () => {
  it.each([
    ['https://grafite.empresa.com.br/ajuda', 'https://grafite.empresa.com.br/ajuda'],
    ['HTTP://Exemplo.com.br', 'http://exemplo.com.br/'],
    [' http://10.0.0.5:8080/painel ', 'http://10.0.0.5:8080/painel'],
  ])('lê %j', (entrada, valor) => {
    expect(lerUrl(entrada)).toEqual(aceita(valor));
  });

  it.each([
    'ftp://servidor/arquivo',
    'grafite.empresa.com.br',
    'https://',
    'javascript:alert(1)',
    5,
  ])('recusa %j', (entrada) => {
    expect(lerUrl(entrada)).toEqual(recusa('Use um endereço que comece com http:// ou https://.'));
  });

  it('recusa o endereço com mais de 2.000 caracteres', () => {
    expect(lerUrl(`https://exemplo.com/${'a'.repeat(2000)}`)).toEqual(
      recusa('Use até 2.000 caracteres.'),
    );
  });
});
