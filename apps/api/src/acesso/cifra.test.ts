import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrarChaveDoApp, decifrarChaveDoApp } from './cifra.ts';

const chaveDoServidor = Buffer.alloc(32, 7);
const chaveDoApp = Buffer.from('12345678901234567890', 'ascii');
const conta = '0199a3f0-0000-7000-8000-000000000001';

describe('cifra da chave do app', () => {
  it('decifra o que cifrou, com a mesma chave do servidor e a mesma conta', () => {
    const cifrado = cifrarChaveDoApp(chaveDoApp, chaveDoServidor, conta);
    expect(decifrarChaveDoApp(cifrado, chaveDoServidor, conta)).toEqual(chaveDoApp);
  });

  it('grava a versão, o IV de 12 bytes, a etiqueta de 16 e os dados', () => {
    const cifrado = cifrarChaveDoApp(chaveDoApp, chaveDoServidor, conta);
    expect(cifrado[0]).toBe(1);
    expect(cifrado.length).toBe(1 + 12 + 16 + chaveDoApp.length);
    expect(cifrado.includes(chaveDoApp)).toBe(false);
  });

  it('a mesma chave cifrada duas vezes dá textos diferentes', () => {
    expect(cifrarChaveDoApp(chaveDoApp, chaveDoServidor, conta)).not.toEqual(
      cifrarChaveDoApp(chaveDoApp, chaveDoServidor, conta),
    );
  });

  it('não decifra com outra chave do servidor', () => {
    const cifrado = cifrarChaveDoApp(chaveDoApp, chaveDoServidor, conta);
    expect(() => decifrarChaveDoApp(cifrado, randomBytes(32), conta)).toThrow();
  });

  it('não decifra o segredo copiado para outra conta', () => {
    const cifrado = cifrarChaveDoApp(chaveDoApp, chaveDoServidor, conta);
    expect(() =>
      decifrarChaveDoApp(cifrado, chaveDoServidor, '0199a3f0-0000-7000-8000-000000000002'),
    ).toThrow();
  });

  it('não decifra um texto adulterado', () => {
    const cifrado = cifrarChaveDoApp(chaveDoApp, chaveDoServidor, conta);
    cifrado[cifrado.length - 1] = (cifrado[cifrado.length - 1] ?? 0) ^ 1;
    expect(() => decifrarChaveDoApp(cifrado, chaveDoServidor, conta)).toThrow();
  });

  it('recusa uma versão desconhecida da cifra', () => {
    const cifrado = cifrarChaveDoApp(chaveDoApp, chaveDoServidor, conta);
    cifrado[0] = 2;
    expect(() => decifrarChaveDoApp(cifrado, chaveDoServidor, conta)).toThrow(
      'Versão desconhecida da cifra: 2.',
    );
  });
});
