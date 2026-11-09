import { describe, expect, it } from 'vitest';
import { avaliarSenha } from './senha.ts';

const usuario = 'joao.silva';

describe('avaliarSenha', () => {
  it.each([
    'cavalo bateria grampo correto',
    'Tr0ub4dor&3xyz',
    'meu cachorro chama Biscoito',
    `${'a'.repeat(11)}b`,
    `${'x'.repeat(120)}abcdefgh`,
  ])('aceita %j', (senha) => {
    expect(avaliarSenha(senha, { usuario })).toBeNull();
  });

  it.each([
    ['curta123', 'Use pelo menos 12 caracteres.'],
    ['😀😀😀😀😀😀😀😀😀😀😀', 'Use pelo menos 12 caracteres.'],
    ['x'.repeat(64) + 'y'.repeat(65), 'Use no máximo 128 caracteres.'],
  ])('recusa pelo tamanho %j', (senha, motivo) => {
    expect(avaliarSenha(senha, { usuario })).toBe(motivo);
  });

  it('conta cada caractere, e não cada metade de um emoji', () => {
    expect(avaliarSenha('😀😀😀😀😀😀😀😀😀😀😀😁', { usuario })).toBeNull();
  });

  it.each(['aaaaaaaaaaaa', '000000000000000', '!!!!!!!!!!!!'])(
    'recusa o caractere repetido %j',
    (senha) => {
      expect(avaliarSenha(senha, { usuario })).toBe('A senha não pode ser um caractere repetido.');
    },
  );

  it.each([
    '123456789012',
    '987654321098',
    'abcdefghijklm',
    'ZYXWVUTSRQPO',
    'qwertyuiopas',
    'mnbvcxzlkjhg',
  ])('recusa a sequência %j', (senha) => {
    expect(avaliarSenha(senha, { usuario })).toBe(
      'A senha não pode ser uma sequência, como 123456 ou abcdef.',
    );
  });

  it.each(['joao.silva2026!', 'Minha senha é JOAO.SILVA'])(
    'recusa a senha com o usuário %j',
    (senha) => {
      expect(avaliarSenha(senha, { usuario })).toBe('A senha não pode conter o seu usuário.');
    },
  );

  it('sem usuário, a regra do usuário não recusa nada', () => {
    expect(avaliarSenha('cavalo bateria grampo correto', { usuario: '  ' })).toBeNull();
  });

  it.each(['password1234', 'PassWord1234', 'senha1234567', 'Grafite@2026'])(
    'recusa a senha comum %j, sem diferenciar maiúsculas',
    (senha) => {
      expect(avaliarSenha(senha, { usuario })).toBe('Esta senha é comum demais. Escolha outra.');
    },
  );
});
