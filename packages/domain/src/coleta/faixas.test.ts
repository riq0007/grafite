import { describe, expect, it } from 'vitest';
import { coletorDoIp, ipNaFaixa, lerFaixa, lerFaixas } from './faixas.ts';

const FAIXA_INVALIDA = 'Use uma faixa como 10.0.0.0/24.';

describe('lerFaixa', () => {
  it('aceita a faixa IPv4 com o prefixo, na forma canônica', () => {
    expect(lerFaixa('10.0.0.0/24')).toEqual({ ok: true, faixa: '10.0.0.0/24' });
    expect(lerFaixa(' 192.168.1.10/32 ')).toEqual({ ok: true, faixa: '192.168.1.10/32' });
    expect(lerFaixa('0.0.0.0/0')).toEqual({ ok: true, faixa: '0.0.0.0/0' });
  });

  it('guarda o endereço da rede, e não o IP digitado', () => {
    expect(lerFaixa('10.0.0.77/24')).toEqual({ ok: true, faixa: '10.0.0.0/24' });
    expect(lerFaixa('172.16.200.9/12')).toEqual({ ok: true, faixa: '172.16.0.0/12' });
  });

  it('aceita a faixa IPv6, em minúsculas e comprimida', () => {
    expect(lerFaixa('2001:DB8::1/64')).toEqual({ ok: true, faixa: '2001:db8::/64' });
    expect(lerFaixa('fe80:0:0:0:0:0:0:0/10')).toEqual({ ok: true, faixa: 'fe80::/10' });
    expect(lerFaixa('::1/128')).toEqual({ ok: true, faixa: '::1/128' });
  });

  it('recusa o IP inválido, o prefixo fora do limite e a faixa sem o prefixo', () => {
    for (const entrada of [
      '10.0.0.300/24',
      '10.0.0.0/33',
      '10.0.0.0/-1',
      '10.0.0.0/',
      '10.0.0.0',
      '2001:db8::/129',
      'rede/24',
      '',
      42,
      null,
    ]) {
      expect(lerFaixa(entrada), String(entrada)).toEqual({ ok: false, erro: FAIXA_INVALIDA });
    }
  });
});

describe('lerFaixas', () => {
  it('lê a lista sem repetir a mesma faixa, na ordem em que veio', () => {
    expect(lerFaixas(['10.0.5.0/24', '10.0.0.0/16', '10.0.5.9/24'])).toEqual({
      ok: true,
      faixas: ['10.0.5.0/24', '10.0.0.0/16'],
    });
    expect(lerFaixas([])).toEqual({ ok: true, faixas: [] });
  });

  it('recusa a lista com uma faixa inválida e a lista com mais de 50', () => {
    expect(lerFaixas(['10.0.0.0/24', '10.0.0.300/24'])).toEqual({
      ok: false,
      erro: FAIXA_INVALIDA,
    });
    const muitas = Array.from({ length: 51 }, (_, i) => `10.0.${i}.0/24`);
    expect(lerFaixas(muitas)).toEqual({ ok: false, erro: 'Use até 50 faixas.' });
    expect(lerFaixas('10.0.0.0/24')).toEqual({ ok: false, erro: FAIXA_INVALIDA });
  });
});

describe('ipNaFaixa', () => {
  it('confere o IP pelos bits do prefixo', () => {
    expect(ipNaFaixa('10.0.0.5', '10.0.0.0/24')).toBe(true);
    expect(ipNaFaixa('10.0.0.255', '10.0.0.0/24')).toBe(true);
    expect(ipNaFaixa('10.0.1.5', '10.0.0.0/24')).toBe(false);
    expect(ipNaFaixa('127.0.0.1', '127.0.0.0/8')).toBe(true);
    expect(ipNaFaixa('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('confere o IPv6 e nunca mistura as versões', () => {
    expect(ipNaFaixa('2001:db8::42', '2001:db8::/64')).toBe(true);
    expect(ipNaFaixa('2001:db9::42', '2001:db8::/64')).toBe(false);
    expect(ipNaFaixa('10.0.0.5', '::/0')).toBe(false);
    expect(ipNaFaixa('::ffff:10.0.0.5', '10.0.0.0/24')).toBe(false);
  });

  it('não alcança nada com o IP ou a faixa inválidos', () => {
    expect(ipNaFaixa('10.0.0.300', '10.0.0.0/24')).toBe(false);
    expect(ipNaFaixa('10.0.0.5', 'rede')).toBe(false);
  });
});

describe('coletorDoIp', () => {
  // Os ids em UUIDv7 ordenam no tempo: o menor é o coletor cadastrado primeiro.
  const antigo = { id: '01900000-0000-7000-8000-000000000001', faixas: ['10.0.0.0/16'] };
  const novo = { id: '01900000-0000-7000-8000-000000000002', faixas: ['10.0.5.0/24'] };

  it('escolhe o coletor da faixa mais específica que alcança o IP', () => {
    expect(coletorDoIp('10.0.5.20', [antigo, novo])).toBe(novo.id);
    expect(coletorDoIp('10.0.6.1', [antigo, novo])).toBe(antigo.id);
  });

  it('no empate, escolhe o coletor cadastrado primeiro', () => {
    const outro = { id: '01900000-0000-7000-8000-000000000003', faixas: ['10.0.5.0/24'] };
    expect(coletorDoIp('10.0.5.20', [outro, novo])).toBe(novo.id);
  });

  it('não escolhe nenhum quando nenhuma faixa alcança o IP', () => {
    expect(coletorDoIp('10.9.0.5', [antigo, novo])).toBeNull();
    expect(coletorDoIp('10.0.5.20', [])).toBeNull();
    expect(coletorDoIp('2001:db8::1', [antigo])).toBeNull();
  });
});
