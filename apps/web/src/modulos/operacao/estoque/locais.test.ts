import { type LocalDaArvore, montarArvore } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import { locaisForaDoAlcance } from './locais.ts';

// Os locais que o lançamento oferece (spec modulo-operacao, "Lançamento das movimentações"; change
// p4c-estoque, design, decisão 7): só os ramos em que a conta movimenta o estoque.

const local = (id: string, paiId: string | null): LocalDaArvore => ({
  id,
  paiId,
  nome: id,
  tipo: 'outro',
  situacao: 'ativo',
});

// jun › almox ; jun › exp ; cps › almoxCps
const LOCAIS = [
  local('jun', null),
  local('almox', 'jun'),
  local('exp', 'jun'),
  local('cps', null),
  local('almoxCps', 'cps'),
];
const ARVORE = montarArvore(LOCAIS);

describe('os locais fora do alcance de quem movimenta', () => {
  it('fora do ramo da permissão, nenhum local se escolhe', () => {
    expect(
      [
        ...locaisForaDoAlcance(LOCAIS, ARVORE, {
          chave: 'estoque.movimentar',
          organizacao: false,
          locais: ['jun'],
        }),
      ].sort(),
    ).toEqual(['almoxCps', 'cps']);
  });

  it('na organização inteira, todos se escolhem; sem a permissão, nenhum', () => {
    expect(
      locaisForaDoAlcance(LOCAIS, ARVORE, {
        chave: 'estoque.movimentar',
        organizacao: true,
        locais: [],
      }).size,
    ).toBe(0);
    expect(locaisForaDoAlcance(LOCAIS, ARVORE, undefined).size).toBe(LOCAIS.length);
  });
});
