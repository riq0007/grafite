import { describe, expect, it } from 'vitest';
import { filtrarFornecedores } from './escolha.ts';

const FORNECEDORES = [
  { id: 'hp', nome: 'HP Brasil', cnpj: '12.345.678/0001-95' },
  { id: 'locadora', nome: 'Locadora Norte', cnpj: null },
  { id: 'alfa', nome: 'Assistência Técnica', cnpj: '12.ABC.345/01DE-35' },
];

const nomes = (texto: string) => filtrarFornecedores(FORNECEDORES, texto).map(({ nome }) => nome);

describe('a busca dos fornecedores para escolher', () => {
  it('acha pelo nome, sem acento e sem diferenciar maiúsculas', () => {
    expect(nomes('loca')).toEqual(['Locadora Norte']);
    expect(nomes('ASSISTENCIA')).toEqual(['Assistência Técnica']);
    expect(nomes('')).toEqual(['HP Brasil', 'Locadora Norte', 'Assistência Técnica']);
  });

  it('acha pelo começo do CNPJ, com ou sem a pontuação, também o alfanumérico', () => {
    expect(nomes('12.345')).toEqual(['HP Brasil']);
    expect(nomes('12345678')).toEqual(['HP Brasil']);
    expect(nomes('12abc')).toEqual(['Assistência Técnica']);
    expect(nomes('99')).toEqual([]);
  });
});
