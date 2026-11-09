import { describe, expect, it } from 'vitest';
import { type AtivoNoIndice, criarCasamento } from './casamento.ts';

const COMPUTADOR = 'tipo-computador';

const ativo = (id: string, extras: Partial<AtivoNoIndice> = {}): AtivoNoIndice => ({
  id,
  tipoId: COMPUTADOR,
  tipo: 'Computador',
  nome: `Computador ${id}`,
  situacao: 'ativo',
  patrimonio: null,
  serie: null,
  hostname: null,
  ...extras,
});

const ATIVOS = [
  ativo('a-412', { patrimonio: 'PAT-00412', serie: 'BRJ999', hostname: 'CPU-412' }),
  ativo('a-500', { serie: 'brj123', hostname: 'CPU-500' }),
  ativo('a-610', {
    tipoId: 'tipo-switch',
    tipo: 'Switch',
    nome: 'Switch do rack',
    patrimonio: 'PAT-00610',
  }),
  ativo('a-700', { patrimonio: 'PAT-00700', situacao: 'inativo' }),
  ativo('a-801', { serie: 'REPETIDA', hostname: 'IMP-01' }),
  ativo('a-802', { serie: 'repetida', hostname: 'imp-01' }),
];

const vazia = { patrimonio: null, serie: null, hostname: null };

describe('criarCasamento', () => {
  it('casa pelo patrimônio, sem diferenciar acento, maiúsculas e espaços', () => {
    const casamento = criarCasamento(ATIVOS, COMPUTADOR);
    expect(casamento.casar(2, { ...vazia, patrimonio: ' pat-00412 ' })).toEqual({
      tipo: 'casado',
      ativo: ATIVOS[0],
    });
  });

  it('sem casamento pelo patrimônio, casa pela série, e depois pelo hostname', () => {
    const casamento = criarCasamento(ATIVOS, COMPUTADOR);
    expect(casamento.casar(2, { ...vazia, patrimonio: 'PAT-NOVO', serie: 'BRJ123' })).toEqual({
      tipo: 'casado',
      ativo: ATIVOS[1],
    });
    expect(casamento.casar(3, { ...vazia, hostname: 'cpu-412' })).toEqual({
      tipo: 'casado',
      ativo: ATIVOS[0],
    });
  });

  it('o patrimônio que casa vale mais que a série de outro ativo', () => {
    const casamento = criarCasamento(ATIVOS, COMPUTADOR);
    expect(casamento.casar(2, { ...vazia, patrimonio: 'PAT-00412', serie: 'BRJ123' })).toEqual({
      tipo: 'casado',
      ativo: ATIVOS[0],
    });
  });

  it('sem casamento, a linha é um ativo novo', () => {
    const casamento = criarCasamento(ATIVOS, COMPUTADOR);
    expect(
      casamento.casar(2, { patrimonio: 'PAT-09000', serie: 'XYZ', hostname: 'NOVO-01' }),
    ).toEqual({ tipo: 'novo' });
    expect(casamento.casar(3, vazia)).toEqual({ tipo: 'novo' });
  });

  it('recusa o ativo de outro tipo e o inativo', () => {
    const casamento = criarCasamento(ATIVOS, COMPUTADOR);
    expect(casamento.casar(2, { ...vazia, patrimonio: 'PAT-00610' })).toEqual({
      tipo: 'recusado',
      campo: 'ativo.patrimonio',
      mensagem: 'O ativo PAT-00610 é do tipo Switch.',
    });
    expect(casamento.casar(3, { ...vazia, patrimonio: 'PAT-00700' })).toEqual({
      tipo: 'recusado',
      campo: 'ativo.patrimonio',
      mensagem: 'O ativo PAT-00700 está inativo: reative-o antes de importar.',
    });
  });

  it('recusa a série e o hostname de mais de um ativo', () => {
    const casamento = criarCasamento(ATIVOS, COMPUTADOR);
    expect(casamento.casar(2, { ...vazia, serie: 'Repetida' })).toEqual({
      tipo: 'recusado',
      campo: 'ativo.serie',
      mensagem: 'Há mais de um ativo com a série Repetida: use o patrimônio.',
    });
    expect(casamento.casar(3, { ...vazia, hostname: 'IMP-01' })).toEqual({
      tipo: 'recusado',
      campo: 'ativo.hostname',
      mensagem: 'Há mais de um ativo com o hostname IMP-01: use o patrimônio.',
    });
  });

  it('recusa a segunda linha do mesmo ativo', () => {
    const casamento = criarCasamento(ATIVOS, COMPUTADOR);
    expect(casamento.casar(4, { ...vazia, patrimonio: 'PAT-00412' }).tipo).toBe('casado');
    expect(casamento.casar(9, { ...vazia, serie: 'brj999' })).toEqual({
      tipo: 'recusado',
      campo: 'ativo.serie',
      mensagem: 'A linha 4 já muda este ativo.',
    });
  });

  it('o ativo novo de uma linha entra no casamento das linhas seguintes', () => {
    const casamento = criarCasamento(ATIVOS, COMPUTADOR);
    expect(casamento.casar(4, { ...vazia, patrimonio: 'PAT-09000' })).toEqual({ tipo: 'novo' });
    casamento.acrescentar(4, ativo('a-novo', { patrimonio: 'PAT-09000', serie: 'NOVA' }));
    expect(casamento.casar(9, { ...vazia, serie: 'nova' })).toEqual({
      tipo: 'recusado',
      campo: 'ativo.serie',
      mensagem: 'A linha 4 já muda este ativo.',
    });
    expect(casamento.ativoPeloPatrimonio('pat-09000')?.id).toBe('a-novo');
  });

  it('diz o ativo sem patrimônio pelo nome', () => {
    const casamento = criarCasamento(
      [ativo('a-1', { tipoId: 'tipo-switch', tipo: 'Switch', nome: 'Core', serie: 'S1' })],
      COMPUTADOR,
    );
    expect(casamento.casar(2, { ...vazia, serie: 'S1' })).toEqual({
      tipo: 'recusado',
      campo: 'ativo.serie',
      mensagem: 'O ativo Core é do tipo Switch.',
    });
  });
});
