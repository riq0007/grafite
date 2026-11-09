import { describe, expect, it } from 'vitest';
import { descreverDispositivo } from './dispositivo.ts';

describe('descreverDispositivo', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome no Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge no Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0',
      'Opera no Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Firefox no Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox no Linux'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Safari no Mac',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari no iPhone',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
      'Chrome no iPhone',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari no iPad',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Chrome no Android',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome no ChromeOS',
    ],
  ])('%s', (agente, descricao) => {
    expect(descreverDispositivo(agente)).toBe(descricao);
  });

  it('sem o navegador conhecido, diz só o sistema', () => {
    expect(descreverDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Outro/1.0')).toBe(
      'Navegador no Windows',
    );
  });

  it('sem o sistema conhecido, diz só o navegador', () => {
    expect(descreverDispositivo('Mozilla/5.0 (Desconhecido) Chrome/130.0.0.0 Safari/537.36')).toBe(
      'Chrome',
    );
  });

  it.each([['curl/8.4.0'], [''], [null], [undefined]])(
    'diz "Navegador desconhecido" para %j',
    (agente) => {
      expect(descreverDispositivo(agente)).toBe('Navegador desconhecido');
    },
  );
});
