// A tinta e a estimativa dos suprimentos (spec impressoras-por-snmp, "Painel Suprimentos" e
// "Estimativa de quando o suprimento acaba"; change suprimentos-rostos-e-backups, design, decisões 1
// e 3).
import { describe, expect, it } from 'vitest';
import { estimarFimDoSuprimento, type PontoDoSuprimento } from './estimativa.ts';
import { tintaDoSuprimento } from './impressoras.ts';

describe('tintaDoSuprimento', () => {
  it('toner colorido: a tinta pela descrição', () => {
    expect(tintaDoSuprimento('Cyan Toner')).toBe('ciano');
    expect(tintaDoSuprimento('Magenta Toner')).toBe('magenta');
    expect(tintaDoSuprimento('Yellow Toner')).toBe('amarelo');
    expect(tintaDoSuprimento('Black Toner Cartridge')).toBe('preto');
  });

  it('em português, sem acento e o K isolado', () => {
    expect(tintaDoSuprimento('Toner Preto')).toBe('preto');
    expect(tintaDoSuprimento('Cartucho Ciano')).toBe('ciano');
    expect(tintaDoSuprimento('Toner (K)')).toBe('preto');
    expect(tintaDoSuprimento('TK-1175')).toBeNull();
  });

  it('o cilindro, o fusor e o resíduo não têm tinta, mesmo com a cor na descrição', () => {
    expect(tintaDoSuprimento('Black Drum Unit')).toBeNull();
    expect(tintaDoSuprimento('Fuser Kit')).toBeNull();
    expect(tintaDoSuprimento('Waste Toner Box')).toBeNull();
  });

  it('o toner sem cor na descrição fica sem tinta', () => {
    expect(tintaDoSuprimento('Toner Cartridge')).toBeNull();
  });
});

const DIA = 86_400_000;
const inicio = Date.UTC(2026, 9, 1, 12);
const serie = (valores: number[], passoEmDias = 1): PontoDoSuprimento[] =>
  valores.map((percentual, i) => ({
    momento: new Date(inicio + i * passoEmDias * DIA),
    percentual,
  }));

describe('estimarFimDoSuprimento', () => {
  it('quando o toner acaba: de 75% para 25% em 25 dias, a 2 pontos por dia', () => {
    const pontos = serie(Array.from({ length: 26 }, (_, i) => 75 - 2 * i));
    expect(estimarFimDoSuprimento(pontos)).toEqual({ dias: 13, desde: new Date(inicio) });
  });

  it('toner trocado: a série nova tem menos de 3 pontos', () => {
    expect(estimarFimDoSuprimento(serie([30, 20, 10, 5, 96, 95]))).toBeNull();
  });

  it('depois da troca, a estimativa usa só a série nova', () => {
    const estimativa = estimarFimDoSuprimento(serie([20, 10, 5, 90, 85, 80, 75]));
    expect(estimativa?.desde).toEqual(new Date(inicio + 3 * DIA));
    expect(estimativa?.dias).toBe(15);
  });

  it('nível parado: sem estimativa', () => {
    expect(estimarFimDoSuprimento(serie(Array(20).fill(50)))).toBeNull();
  });

  it('menos de 3 dias de leituras: sem estimativa', () => {
    expect(estimarFimDoSuprimento(serie([50, 40, 30], 0.5))).toBeNull();
  });

  it('mais de um ano para acabar: sem estimativa', () => {
    expect(estimarFimDoSuprimento(serie([60, 59.9, 59.8, 59.7, 59.6]))).toBeNull();
  });

  it('em qualquer ordem de chegada', () => {
    const pontos = serie(Array.from({ length: 26 }, (_, i) => 75 - 2 * i));
    expect(estimarFimDoSuprimento([...pontos].reverse())?.dias).toBe(13);
  });
});
