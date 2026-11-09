import { describe, expect, it } from 'vitest';
import type { LocalDaArvore } from '../locais/arvore.ts';
import {
  criarReferencias,
  type FornecedorParaBusca,
  type ModeloParaBusca,
  type PessoaParaBusca,
} from './referencias.ts';

const local = (
  id: string,
  nome: string,
  paiId: string | null,
  situacao: LocalDaArvore['situacao'] = 'ativo',
): LocalDaArvore => ({ id, nome, paiId, tipo: 'setor', situacao });

const LOCAIS = [
  local('l-jun', 'Jundiaí', null),
  local('l-cam', 'Campinas', null),
  local('l-jun-exp', 'Expedição', 'l-jun'),
  local('l-cam-exp', 'Expedição', 'l-cam'),
  local('l-jun-alm', 'Almoxarifado', 'l-jun'),
  local('l-jun-g2', 'Galpão 2', 'l-jun'),
  local('l-jun-g2-doca', 'Doca', 'l-jun-g2'),
  local('l-velho', 'Arquivo morto', 'l-jun', 'inativo'),
];

const PESSOAS: PessoaParaBusca[] = [
  { id: 'p-1', nome: 'João Silva', email: 'joao@empresa.com', matricula: '1001' },
  { id: 'p-2', nome: 'João Silva', email: 'joao.silva@empresa.com', matricula: '1002' },
  { id: 'p-3', nome: 'Maria Souza', email: null, matricula: null },
];

const MODELOS: ModeloParaBusca[] = [
  { id: 'm-1', fabricante: 'HP', nome: 'LaserJet M404' },
  { id: 'm-2', fabricante: 'Brother', nome: 'HL-L2350' },
  { id: 'm-3', fabricante: 'Epson', nome: 'L3250' },
  { id: 'm-4', fabricante: 'Canon', nome: 'L3250' },
];

const FORNECEDORES: FornecedorParaBusca[] = [
  { id: 'f-1', nome: 'HP Brasil', cnpj: '12345678000195' },
  { id: 'f-2', nome: 'Locadora São João', cnpj: null },
];

const referencias = criarReferencias({
  locais: LOCAIS,
  pessoas: PESSOAS,
  modelos: MODELOS,
  fornecedores: FORNECEDORES,
});

describe('o local pelo texto', () => {
  it('lê o caminho com "›" ou ">", sem diferenciar acento e maiúsculas', () => {
    expect(referencias.local('Jundiaí › Expedição')).toEqual({ ok: true, valor: 'l-jun-exp' });
    expect(referencias.local('jundiai > expedicao')).toEqual({ ok: true, valor: 'l-jun-exp' });
    expect(referencias.local('Galpão 2 › Doca')).toEqual({ ok: true, valor: 'l-jun-g2-doca' });
  });

  it('lê o nome que só um local ativo tem', () => {
    expect(referencias.local('Almoxarifado')).toEqual({ ok: true, valor: 'l-jun-alm' });
    expect(referencias.local('Doca')).toEqual({ ok: true, valor: 'l-jun-g2-doca' });
  });

  it('recusa o nome de mais de um local, com o caminho de um deles como exemplo', () => {
    expect(referencias.local('Expedição')).toEqual({
      ok: false,
      erro: 'Há mais de um local Expedição: use o caminho, como Jundiaí › Expedição.',
    });
  });

  it('recusa o local que não existe e o inativo', () => {
    expect(referencias.local('Expedicão Norte')).toEqual({
      ok: false,
      erro: 'Local não encontrado: Expedicão Norte.',
    });
    expect(referencias.local('Arquivo morto')).toEqual({
      ok: false,
      erro: 'Local não encontrado: Arquivo morto.',
    });
  });

  it('a célula vazia não é um local', () => {
    expect(referencias.local('  ')).toEqual({ ok: true, valor: null });
  });
});

describe('a pessoa pelo texto', () => {
  it('lê a matrícula, o e-mail e o nome que só uma pessoa ativa tem', () => {
    expect(referencias.pessoa('1002')).toEqual({ ok: true, valor: 'p-2' });
    expect(referencias.pessoa('JOAO@empresa.com')).toEqual({ ok: true, valor: 'p-1' });
    expect(referencias.pessoa('maria souza')).toEqual({ ok: true, valor: 'p-3' });
  });

  it('lê a matrícula que veio como número da planilha', () => {
    expect(referencias.pessoa(1001)).toEqual({ ok: true, valor: 'p-1' });
  });

  it('recusa o nome de mais de uma pessoa e a pessoa que não existe', () => {
    expect(referencias.pessoa('João Silva')).toEqual({
      ok: false,
      erro: 'Há mais de uma pessoa com o nome João Silva: use a matrícula ou o e-mail.',
    });
    expect(referencias.pessoa('João')).toEqual({
      ok: false,
      erro: 'Pessoa não encontrada: João.',
    });
  });
});

describe('o modelo pelo texto', () => {
  it('lê o fabricante e o nome, ou o nome que só um modelo tem', () => {
    expect(referencias.modelo('HP LaserJet M404')).toEqual({ ok: true, valor: 'm-1' });
    expect(referencias.modelo('hp  laserjet m404')).toEqual({ ok: true, valor: 'm-1' });
    expect(referencias.modelo('HL-L2350')).toEqual({ ok: true, valor: 'm-2' });
    expect(referencias.modelo('Epson L3250')).toEqual({ ok: true, valor: 'm-3' });
  });

  it('recusa o modelo que não existe e o nome de mais de um modelo', () => {
    expect(referencias.modelo('HP LaserJet M405')).toEqual({
      ok: false,
      erro: 'Modelo não encontrado: HP LaserJet M405.',
    });
    expect(referencias.modelo('L3250')).toEqual({
      ok: false,
      erro: 'Há mais de um modelo L3250: use o fabricante e o nome, como Epson L3250.',
    });
  });
});

describe('o fornecedor pelo texto', () => {
  it('Fornecedor pelo CNPJ: com ou sem a pontuação', () => {
    expect(referencias.fornecedor('12345678000195')).toEqual({ ok: true, valor: 'f-1' });
    expect(referencias.fornecedor('12.345.678/0001-95')).toEqual({ ok: true, valor: 'f-1' });
  });

  it('lê o nome sem diferenciar acento, maiúsculas e espaços repetidos', () => {
    expect(referencias.fornecedor('hp  brasil')).toEqual({ ok: true, valor: 'f-1' });
    expect(referencias.fornecedor('LOCADORA SAO JOAO')).toEqual({ ok: true, valor: 'f-2' });
    expect(referencias.fornecedor('')).toEqual({ ok: true, valor: null });
  });

  it('Fornecedor que não existe: diz o texto da célula', () => {
    expect(referencias.fornecedor('HP Brazil')).toEqual({
      ok: false,
      erro: 'Fornecedor não encontrado: HP Brazil.',
    });
    expect(referencias.fornecedor('12.345.678/0001-96')).toEqual({
      ok: false,
      erro: 'Fornecedor não encontrado: 12.345.678/0001-96.',
    });
  });
});
