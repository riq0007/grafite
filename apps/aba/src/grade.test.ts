import { describe, expect, it } from 'vitest';
import { proximaNaGrade, seguinteNoTab } from './grade.ts';

const GRADE = [['chamado'], ['chat', 'lista'], ['sair']];

describe('proximaNaGrade', () => {
  it('a seta para baixo vai da opção larga à primeira da linha de baixo', () => {
    expect(proximaNaGrade(GRADE, 'chamado', 'ArrowDown')).toBe('chat');
  });

  it('as setas andam pela linha e sobem à opção larga', () => {
    expect(proximaNaGrade(GRADE, 'chat', 'ArrowRight')).toBe('lista');
    expect(proximaNaGrade(GRADE, 'lista', 'ArrowLeft')).toBe('chat');
    expect(proximaNaGrade(GRADE, 'lista', 'ArrowUp')).toBe('chamado');
    expect(proximaNaGrade(GRADE, 'lista', 'ArrowDown')).toBe('sair');
  });

  it('sem passar do fim', () => {
    expect(proximaNaGrade(GRADE, 'chamado', 'ArrowUp')).toBe('chamado');
    expect(proximaNaGrade(GRADE, 'chamado', 'ArrowRight')).toBe('chamado');
    expect(proximaNaGrade(GRADE, 'lista', 'ArrowRight')).toBe('lista');
    expect(proximaNaGrade(GRADE, 'sair', 'ArrowDown')).toBe('sair');
  });

  it('o Home e o End vão à primeira e à última; outra tecla não anda', () => {
    expect(proximaNaGrade(GRADE, 'chat', 'Home')).toBe('chamado');
    expect(proximaNaGrade(GRADE, 'chat', 'End')).toBe('sair');
    expect(proximaNaGrade(GRADE, 'chat', 'a')).toBeNull();
  });
});

describe('seguinteNoTab', () => {
  it('dá a volta nos dois sentidos', () => {
    expect(seguinteNoTab(GRADE, 'sair', false)).toBe('chamado');
    expect(seguinteNoTab(GRADE, 'chamado', true)).toBe('sair');
    expect(seguinteNoTab(GRADE, 'chat', false)).toBe('lista');
  });
});
