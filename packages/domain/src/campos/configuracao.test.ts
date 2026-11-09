import { describe, expect, it } from 'vitest';
import { conferirConfiguracao, opcoesExcluidas } from './configuracao.ts';
import type { OpcaoDaLista } from './tipos.ts';

let ids = 0;
const novoId = () => `novo-${++ids}`;

describe('conferirConfiguracao', () => {
  it('os números aceitam o mínimo e o máximo, e o decimal, as casas', () => {
    expect(conferirConfiguracao('inteiro', { minimo: 1, maximo: 64 }, novoId)).toEqual({
      ok: true,
      configuracao: { minimo: 1, maximo: 64 },
    });
    expect(conferirConfiguracao('decimal', { casas: 3, minimo: 0.5 }, novoId)).toEqual({
      ok: true,
      configuracao: { casas: 3, minimo: 0.5 },
    });
    expect(conferirConfiguracao('inteiro', {}, novoId)).toEqual({ ok: true, configuracao: {} });
  });

  it('recusa o mínimo maior que o máximo', () => {
    expect(conferirConfiguracao('inteiro', { minimo: 10, maximo: 5 }, novoId)).toEqual({
      ok: false,
      erros: { minimo: 'O mínimo não pode passar do máximo.' },
    });
  });

  it('confere os limites pela leitura do próprio tipo', () => {
    expect(conferirConfiguracao('inteiro', { minimo: 1.5 }, novoId)).toEqual({
      ok: false,
      erros: { minimo: 'Use um número inteiro, como 1.024.' },
    });
    expect(conferirConfiguracao('decimal', { casas: 1, maximo: 2.25 }, novoId)).toEqual({
      ok: false,
      erros: { maximo: 'Use até 1 casa decimal.' },
    });
  });

  it.each([-1, 7, 2.5, '2'])('recusa as casas %j', (casas) => {
    expect(conferirConfiguracao('decimal', { casas }, novoId)).toEqual({
      ok: false,
      erros: { casas: 'Use de 0 a 6 casas decimais.' },
    });
  });

  it('dá um id a cada opção nova e mantém o das que já existiam', () => {
    ids = 0;
    expect(
      conferirConfiguracao(
        'lista',
        {
          opcoes: [
            { id: 'op-proprio', rotulo: ' Próprio ', situacao: 'ativa' },
            { rotulo: 'Alugado' },
            { id: 'op-comodato', rotulo: 'Comodato', situacao: 'inativa' },
          ],
        },
        novoId,
      ),
    ).toEqual({
      ok: true,
      configuracao: {
        opcoes: [
          { id: 'op-proprio', rotulo: 'Próprio', situacao: 'ativa' },
          { id: 'novo-1', rotulo: 'Alugado', situacao: 'ativa' },
          { id: 'op-comodato', rotulo: 'Comodato', situacao: 'inativa' },
        ],
      },
    });
  });

  it('recusa a lista sem opções, a com mais de 200 e o rótulo repetido sem acento', () => {
    expect(conferirConfiguracao('lista-multipla', { opcoes: [] }, novoId)).toEqual({
      ok: false,
      erros: { opcoes: 'Inclua pelo menos uma opção.' },
    });
    const muitas = Array.from({ length: 201 }, (_, i) => ({ rotulo: `Opção ${i}` }));
    expect(conferirConfiguracao('lista', { opcoes: muitas }, novoId)).toEqual({
      ok: false,
      erros: { opcoes: 'Use até 200 opções.' },
    });
    expect(
      conferirConfiguracao(
        'lista',
        { opcoes: [{ rotulo: 'Próprio' }, { rotulo: 'proprio' }] },
        novoId,
      ),
    ).toEqual({ ok: false, erros: { 'opcoes.1': 'Já existe uma opção com este rótulo.' } });
  });

  it('recusa o rótulo de opção vazio ou longo demais', () => {
    expect(
      conferirConfiguracao(
        'lista',
        { opcoes: [{ rotulo: ' ' }, { rotulo: 'a'.repeat(61) }] },
        novoId,
      ),
    ).toEqual({
      ok: false,
      erros: { 'opcoes.0': 'Informe o rótulo da opção.', 'opcoes.1': 'Use até 60 caracteres.' },
    });
  });

  it('recusa configuração no tipo que não tem, ou a que não serve ao tipo', () => {
    expect(conferirConfiguracao('texto', { minimo: 1 }, novoId)).toEqual({
      ok: false,
      erros: { configuracao: 'Esta configuração não serve para o tipo do campo.' },
    });
    expect(conferirConfiguracao('inteiro', { opcoes: [] }, novoId)).toEqual({
      ok: false,
      erros: { configuracao: 'Esta configuração não serve para o tipo do campo.' },
    });
    expect(conferirConfiguracao('ip', {}, novoId)).toEqual({ ok: true, configuracao: {} });
  });

  it('o campo de ativo guarda os tipos aceitos, sem repetir, e o nome do lado de lá', () => {
    const computador = '0199a3f0-0000-7000-8000-0000000000c1';
    const notebook = '0199a3f0-0000-7000-8000-0000000000c2';
    expect(
      conferirConfiguracao(
        'ativo',
        { tipos: [computador, notebook.toUpperCase(), computador], ladoDeLa: ' Monitores ' },
        novoId,
      ),
    ).toEqual({ ok: true, configuracao: { tipos: [computador, notebook], ladoDeLa: 'Monitores' } });
    // Sem tipos, o campo aceita ativos de qualquer tipo; sem o nome, o grupo usa o rótulo.
    expect(conferirConfiguracao('ativo', { tipos: [], ladoDeLa: '' }, novoId)).toEqual({
      ok: true,
      configuracao: {},
    });
  });

  it('recusa mais de 20 tipos, o tipo que não é da lista e o nome do lado de lá longo demais', () => {
    const muitos = Array.from(
      { length: 21 },
      (_, i) => `0199a3f0-0000-7000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(conferirConfiguracao('ativo', { tipos: muitos }, novoId)).toEqual({
      ok: false,
      erros: { tipos: 'Escolha até 20 tipos.' },
    });
    expect(conferirConfiguracao('ativo', { tipos: ['Computador'] }, novoId)).toEqual({
      ok: false,
      erros: { tipos: 'Escolha os tipos da lista.' },
    });
    expect(conferirConfiguracao('ativo', { ladoDeLa: 'a'.repeat(61) }, novoId)).toEqual({
      ok: false,
      erros: { ladoDeLa: 'Use até 60 caracteres.' },
    });
    expect(conferirConfiguracao('texto', { ladoDeLa: 'Monitores' }, novoId)).toEqual({
      ok: false,
      erros: { configuracao: 'Esta configuração não serve para o tipo do campo.' },
    });
  });
});

describe('opcoesExcluidas', () => {
  const antes: OpcaoDaLista[] = [
    { id: 'op-proprio', rotulo: 'Próprio', situacao: 'ativa' },
    { id: 'op-alugado', rotulo: 'Alugado', situacao: 'ativa' },
  ];

  it('acha as opções que sumiram da configuração nova', () => {
    expect(opcoesExcluidas(antes, [{ id: 'op-alugado' }, { rotulo: 'Comodato' }])).toEqual([
      antes[0],
    ]);
    expect(opcoesExcluidas(antes, [{ id: 'op-proprio' }, { id: 'op-alugado' }])).toEqual([]);
  });
});
