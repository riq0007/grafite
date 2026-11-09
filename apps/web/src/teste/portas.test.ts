import { describe, expect, it } from 'vitest';
import { portaDaPilha, portaDoE2e } from './portas.ts';

describe('portas das pontas a ponta', () => {
  it('sem a variável, valem as portas de sempre', () => {
    expect(portaDoE2e({})).toBe(4173);
    expect(portaDaPilha({})).toBe(4174);
  });

  it('com a variável, vale a porta da instância do executor', () => {
    expect(portaDoE2e({ GRAFITE_E2E_PORTA: '4273' })).toBe(4273);
    expect(portaDaPilha({ GRAFITE_PILHA_PORTA: '4274' })).toBe(4274);
  });

  it('uma variável vazia conta como ausente', () => {
    expect(portaDoE2e({ GRAFITE_E2E_PORTA: '' })).toBe(4173);
  });

  it.each(['abc', '4273.5', '80', '65536', '-1', '4273x'])(
    'recusa %s, nomeando a variável e o valor',
    (valor) => {
      expect(() => portaDoE2e({ GRAFITE_E2E_PORTA: valor })).toThrow(
        `GRAFITE_E2E_PORTA precisa ser uma porta entre 1024 e 65535, e veio "${valor}".`,
      );
      expect(() => portaDaPilha({ GRAFITE_PILHA_PORTA: valor })).toThrow(
        `GRAFITE_PILHA_PORTA precisa ser uma porta entre 1024 e 65535, e veio "${valor}".`,
      );
    },
  );
});
