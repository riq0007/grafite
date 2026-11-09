import { describe, expect, it } from 'vitest';
import {
  caminhoDaTendencia,
  type DiaDaFaixa,
  formatarNumero,
  posicaoNaRegua,
  resumoDosDias,
} from './calculos.ts';

describe('posicaoNaRegua', () => {
  it('o valor em percentual do máximo', () => {
    expect(posicaoNaRegua(38, 100)).toBe(38);
    expect(posicaoNaRegua(412, 3000)).toBeCloseTo(13.73, 2);
  });

  it('fica na ponta fora da faixa', () => {
    expect(posicaoNaRegua(-5, 100)).toBe(0);
    expect(posicaoNaRegua(130, 100)).toBe(100);
    expect(posicaoNaRegua(10, 0)).toBe(0);
  });
});

describe('formatarNumero', () => {
  it('os milhares do pt-BR', () => {
    expect(formatarNumero(12500)).toBe('12.500');
    expect(formatarNumero(3.5)).toBe('3,5');
  });

  it('o percentual colado, e as outras unidades com o espaço que não quebra', () => {
    expect(formatarNumero(38, '%')).toBe('38%');
    expect(formatarNumero(412, 'rostos')).toBe('412 rostos');
  });
});

describe('resumoDosDias', () => {
  const dias = (situacoes: DiaDaFaixa['situacao'][]): DiaDaFaixa[] =>
    situacoes.map((situacao, i) => ({
      data: `2026-10-${String(i + 1).padStart(2, '0')}`,
      situacao,
    }));

  it('conta o concluído e o parcial como dia com o que se conta', () => {
    const resumo = resumoDosDias(
      dias([...Array(26).fill('ok'), 'falha', 'falha', 'nada', 'nada']),
      'backup',
    );
    expect(resumo).toMatchObject({ total: 30, comAlgo: 26, ok: 26, falha: 2, nada: 2, parcial: 0 });
    expect(resumo.texto).toBe('26 de 30 dias com backup · 2 falhas');
  });

  it('o singular e o parcial', () => {
    const resumo = resumoDosDias(dias(['ok', 'parcial', 'falha']), 'backup');
    expect(resumo.texto).toBe('2 de 3 dias com backup · 1 falha · 1 parcial');
    expect(resumoDosDias(dias(['parcial', 'parcial']), 'backup').texto).toBe(
      '2 de 2 dias com backup · 2 parciais',
    );
    expect(resumoDosDias(dias(['ok']), 'backup').texto).toBe('1 de 1 dia com backup');
  });

  it('sem dias', () => {
    expect(resumoDosDias([], 'backup').texto).toBe('Nenhum dia');
  });
});

describe('caminhoDaTendencia', () => {
  const pontos = [
    { momento: '2026-10-01T00:00:00Z', valor: 380 },
    { momento: '2026-10-16T00:00:00Z', valor: 400 },
    { momento: '2026-10-31T00:00:00Z', valor: 412 },
  ];

  it('vai da esquerda à direita, e o maior valor fica em cima', () => {
    const { linha, ultimo } = caminhoDaTendencia(pontos, 120, 32);
    expect(linha.startsWith('M2.0 30.0')).toBe(true);
    expect(ultimo).toEqual({ x: 118, y: 2 });
  });

  it('a ordem de chegada não importa', () => {
    expect(caminhoDaTendencia([...pontos].reverse(), 120, 32).linha).toBe(
      caminhoDaTendencia(pontos, 120, 32).linha,
    );
  });

  it('com um ponto só, o ponto fica no meio', () => {
    const { linha, ultimo } = caminhoDaTendencia([pontos[0] as (typeof pontos)[number]], 120, 32);
    expect(linha).toBe('M60.0 16.0');
    expect(ultimo).toEqual({ x: 60, y: 16 });
  });

  it('sem pontos, nada', () => {
    expect(caminhoDaTendencia([], 120, 32)).toEqual({ linha: '', ultimo: null, projecao: null });
  });

  it('a projeção sai do último ponto, na mesma escala', () => {
    const { projecao, ultimo } = caminhoDaTendencia(pontos, 120, 32, {
      momento: '2026-11-15T00:00:00Z',
      valor: 420,
    });
    expect(projecao?.startsWith(`M${ultimo?.x.toFixed(1)} `)).toBe(true);
    expect(ultimo?.x).toBeLessThan(118);
  });
});
