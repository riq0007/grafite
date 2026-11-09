import { describe, expect, it } from 'vitest';
import { formatarTamanho } from './tamanho.ts';

describe('formatarTamanho', () => {
  it('os bytes, os KB inteiros e os MB com uma casa, em pt-BR', () => {
    expect(formatarTamanho(1)).toBe('1 byte');
    expect(formatarTamanho(512)).toBe('512 bytes');
    expect(formatarTamanho(1024)).toBe('1 KB');
    expect(formatarTamanho(240 * 1024)).toBe('240 KB');
    expect(formatarTamanho(Math.round(1.2 * 1024 * 1024))).toBe('1,2 MB');
    expect(formatarTamanho(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('perto de 1 MB já diz MB, e não 1.024 KB', () => {
    expect(formatarTamanho(1024 * 1024 - 100)).toBe('1 MB');
    expect(formatarTamanho(1024 * 1023)).toBe('1.023 KB');
  });
});
