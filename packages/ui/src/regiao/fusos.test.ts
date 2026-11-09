import { describe, expect, it } from 'vitest';
import {
  descreverFuso,
  FUSOS_DO_BRASIL,
  fusoDoSistema,
  fusoReconhecido,
  listaDeFusos,
} from './fusos.ts';

describe('fusoReconhecido', () => {
  it('reconhece os identificadores de fuso que o navegador conhece', () => {
    expect(fusoReconhecido('America/Sao_Paulo')).toBe(true);
    expect(fusoReconhecido('America/Manaus')).toBe(true);
    expect(fusoReconhecido('UTC')).toBe(true);
  });

  it('o fuso do sistema é um identificador que o navegador reconhece', () => {
    expect(fusoReconhecido(fusoDoSistema())).toBe(true);
  });

  it('recusa o que não é um fuso', () => {
    expect(fusoReconhecido('Marte/Olympus')).toBe(false);
    expect(fusoReconhecido('')).toBe(false);
    expect(fusoReconhecido('sistema')).toBe(false);
  });
});

// Setembro: Lisboa no horário de verão; janeiro: no de inverno.
const setembro = new Date('2026-09-24T17:32:00Z');
const janeiro = new Date('2026-01-15T12:00:00Z');

describe('descreverFuso', () => {
  it('dá aos fusos do Brasil o nome e a cidade em português, com a diferença para o UTC', () => {
    expect(descreverFuso('America/Manaus', setembro)).toEqual({
      id: 'America/Manaus',
      nome: 'Horário do Amazonas',
      cidade: 'Manaus',
      diferenca: 'UTC−4',
      rotulo: 'Horário do Amazonas · Manaus (UTC−4)',
      doBrasil: true,
    });
    expect(descreverFuso('America/Sao_Paulo', setembro).rotulo).toBe(
      'Horário de Brasília · São Paulo (UTC−3)',
    );
    expect(descreverFuso('America/Noronha', setembro).rotulo).toBe(
      'Horário de Fernando de Noronha · Fernando de Noronha (UTC−2)',
    );
    expect(descreverFuso('America/Rio_Branco', setembro).rotulo).toBe(
      'Horário do Acre · Rio Branco (UTC−5)',
    );
  });

  it('escreve a diferença com o sinal de menos, os minutos quando há, e "UTC" quando é zero', () => {
    expect(descreverFuso('Europe/Lisbon', setembro).diferenca).toBe('UTC+1');
    expect(descreverFuso('Europe/Lisbon', janeiro).diferenca).toBe('UTC');
    expect(descreverFuso('Asia/Kolkata', setembro).diferenca).toBe('UTC+5:30');
    expect(descreverFuso('America/St_Johns', setembro).diferenca).toBe('UTC−2:30');
  });

  it('os segundos do momento não mudam a diferença', () => {
    const quaseVirando = new Date('2026-09-24T17:32:45.900Z');
    expect(descreverFuso('UTC', quaseVirando).diferenca).toBe('UTC');
    expect(descreverFuso('America/Manaus', quaseVirando).diferenca).toBe('UTC−4');
    expect(descreverFuso('Asia/Kolkata', quaseVirando).diferenca).toBe('UTC+5:30');
  });

  it('fora do Brasil, usa o nome do navegador e a cidade do identificador', () => {
    const buenosAires = descreverFuso('America/Argentina/Buenos_Aires', setembro);
    expect(buenosAires.cidade).toBe('Buenos Aires');
    expect(buenosAires.nome).toMatch(/^Horário/);
    expect(buenosAires.doBrasil).toBe(false);
    expect(buenosAires.rotulo).toBe(`${buenosAires.nome} · Buenos Aires (UTC−3)`);
  });

  it('o UTC não tem cidade', () => {
    const universal = descreverFuso('UTC', setembro);
    expect(universal.cidade).toBe('');
    expect(universal.nome).not.toMatch(/GMT/);
    expect(universal.rotulo).toBe(`${universal.nome} (UTC)`);
  });
});

describe('listaDeFusos', () => {
  it('traz os fusos do Brasil primeiro, de oeste para leste, e depois os demais', () => {
    const lista = listaDeFusos(setembro, ['Asia/Kolkata', 'America/Manaus', 'Europe/Lisbon']);
    const doBrasil = lista.filter((fuso) => fuso.doBrasil);
    expect(lista.slice(0, doBrasil.length)).toEqual(doBrasil);
    expect(doBrasil).toHaveLength(Object.keys(FUSOS_DO_BRASIL).length);
    expect(doBrasil[0]?.diferenca).toBe('UTC−5');
    expect(doBrasil.at(-1)?.cidade).toBe('Fernando de Noronha');
    expect(lista.slice(doBrasil.length).map((fuso) => fuso.id)).toEqual([
      'Europe/Lisbon',
      'Asia/Kolkata',
    ]);
  });

  it('não repete um fuso do Brasil que o navegador também lista', () => {
    const lista = listaDeFusos(setembro, ['America/Manaus', 'America/Sao_Paulo']);
    expect(lista.filter((fuso) => fuso.id === 'America/Manaus')).toHaveLength(1);
  });

  it('dentro da mesma diferença, ordena pela cidade', () => {
    const amazonas = listaDeFusos(setembro, [])
      .filter((fuso) => fuso.diferenca === 'UTC−4')
      .map((fuso) => fuso.cidade);
    expect(amazonas).toEqual(['Boa Vista', 'Campo Grande', 'Cuiabá', 'Manaus', 'Porto Velho']);
  });

  it('escreve as cidades do Brasil em português', () => {
    const cidades = listaDeFusos(setembro, []).map((fuso) => fuso.cidade);
    expect(cidades).toEqual(expect.arrayContaining(['São Paulo', 'Belém', 'Cuiabá', 'Maceió']));
  });

  it('sem a lista do navegador, oferece os fusos do Brasil', () => {
    expect(listaDeFusos(setembro, []).every((fuso) => fuso.doBrasil)).toBe(true);
  });

  it('com a lista do navegador, oferece todos os fusos que ele conhece', () => {
    const lista = listaDeFusos(setembro);
    expect(lista.length).toBeGreaterThan(100);
    expect(lista.map((fuso) => fuso.rotulo)).toContain('Horário do Amazonas · Manaus (UTC−4)');
  });
});
