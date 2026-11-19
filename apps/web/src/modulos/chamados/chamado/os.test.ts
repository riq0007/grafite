import { describe, expect, it } from 'vitest';
import { problemaDaOs } from './os.ts';

describe('problemaDaOs', () => {
  it('o título e, embaixo, uma linha por resposta, como no resumo da abertura', () => {
    expect(
      problemaDaOs('Toner preto', [
        { nome: 'Cor do toner', resposta: 'Preto' },
        { nome: 'Impressora', resposta: 'HP LaserJet M404 · PAT-00139' },
      ]),
    ).toBe('Toner preto\nCor do toner: Preto\nImpressora: HP LaserJet M404 · PAT-00139');
  });

  it('sem respostas, só o título', () => {
    expect(problemaDaOs('Impressora não imprime', [])).toBe('Impressora não imprime');
  });

  it('a resposta que não cabe no limite fica de fora, inteira, e a seguinte ainda entra', () => {
    // "Título" tem 6 caracteres; cada linha conta a quebra antes dela.
    const respostas = [
      { nome: 'A', resposta: '1234' },
      { nome: 'Longa', resposta: 'x'.repeat(20) },
      { nome: 'B', resposta: '56' },
    ];
    // 6 + "\nA: 1234" (8) = 14; a longa (28) passaria de 30; "\nB: 56" (6) fecha em 20.
    expect(problemaDaOs('Título', respostas, 30)).toBe('Título\nA: 1234\nB: 56');
    // No limite exato, a linha entra.
    expect(problemaDaOs('Título', respostas.slice(0, 1), 14)).toBe('Título\nA: 1234');
    expect(problemaDaOs('Título', respostas.slice(0, 1), 13)).toBe('Título');
  });
});
