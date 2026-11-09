// As mudanças da conta sobre uma visão (spec visoes-de-tabela, "Tabela alterada"; design do
// visoes-da-conta, decisões 1 e 3): o pedido que as grava, com a mesma forma e os mesmos limites da
// definição de uma visão, e a composição das três camadas, com o estado da tabela.
import { describe, expect, it } from 'vitest';
import { comporVisao, lerMudancasDaVisao } from './mudancas.ts';
import { type DefinicaoDaVisao, LIMITES_DA_VISAO, VISAO_DE_FABRICA } from './visoes.ts';

const SALVA: DefinicaoDaVisao = {
  colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.local' }],
  ordenacao: { chave: 'ativo.criadoEm', direcao: 'decrescente' },
  filtros: [],
};
const COM_IP: DefinicaoDaVisao = {
  ...SALVA,
  colunas: [...SALVA.colunas, { chave: 'c-ip', largura: 140 }],
};
const SEM_ORDEM: DefinicaoDaVisao = { ...SALVA, ordenacao: null };
const ID = '01a136f2-7bbe-7751-b364-d63a6cac89d8';

describe('composição das camadas da visão', () => {
  it('sem mudanças, vale a visão salva', () => {
    expect(comporVisao({ salva: SALVA })).toEqual({ definicao: SALVA, estado: 'salva' });
  });

  it('com as mudanças da conta, vale a tabela dela, "Personalizada"', () => {
    expect(comporVisao({ salva: SALVA, daConta: COM_IP })).toEqual({
      definicao: COM_IP,
      estado: 'personalizada',
    });
  });

  it('as mudanças iguais à visão não personalizam', () => {
    expect(comporVisao({ salva: SALVA, daConta: { ...SALVA } })).toEqual({
      definicao: SALVA,
      estado: 'salva',
    });
  });

  it('o endereço que difere da visão com as mudanças da conta vale, "Do link"', () => {
    expect(comporVisao({ salva: SALVA, daConta: COM_IP, doEndereco: SEM_ORDEM })).toEqual({
      definicao: SEM_ORDEM,
      estado: 'do-link',
    });
    expect(comporVisao({ salva: SALVA, doEndereco: SEM_ORDEM }).estado).toBe('do-link');
  });

  it('o endereço igual à tabela que já vale não é um link', () => {
    expect(comporVisao({ salva: SALVA, daConta: COM_IP, doEndereco: COM_IP }).estado).toBe(
      'personalizada',
    );
    expect(comporVisao({ salva: SALVA, doEndereco: { ...SALVA } }).estado).toBe('salva');
  });
});

describe('o pedido das mudanças', () => {
  it('lê a tabela, a visão e a definição, com a de fábrica pelo nome dela', () => {
    expect(
      lerMudancasDaVisao({ tabela: 'ativos', visao: VISAO_DE_FABRICA, definicao: COM_IP }),
    ).toEqual({
      ok: true,
      mudancas: { tabela: 'ativos', visao: VISAO_DE_FABRICA, definicao: COM_IP },
    });
    expect(lerMudancasDaVisao({ tabela: 'ativos', visao: ID, definicao: SALVA })).toMatchObject({
      ok: true,
      mudancas: { visao: ID },
    });
  });

  it('recusa a tabela sem visões, a visão que não é um id e a definição inválida', () => {
    expect(
      lerMudancasDaVisao({ tabela: 'pessoas', visao: VISAO_DE_FABRICA, definicao: SALVA }),
    ).toEqual({
      ok: false,
      erro: 'A tabela não tem visões.',
    });
    expect(lerMudancasDaVisao({ tabela: 'ativos', visao: 'qualquer', definicao: SALVA })).toEqual({
      ok: false,
      erro: 'A visão não existe.',
    });
    expect(
      lerMudancasDaVisao({ tabela: 'ativos', visao: ID, definicao: { colunas: 'x' } }),
    ).toEqual({ ok: false, erro: 'A definição da visão não é válida.' });
  });

  it('as mudanças têm os mesmos limites da visão', () => {
    const colunas = Array.from({ length: LIMITES_DA_VISAO.colunas + 1 }, (_, i) => ({
      chave: `c-${i}`,
    }));
    expect(
      lerMudancasDaVisao({ tabela: 'ativos', visao: ID, definicao: { ...SALVA, colunas } }).ok,
    ).toBe(false);
  });
});
