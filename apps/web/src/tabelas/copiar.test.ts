import { filaDeAvisos } from '@grafite/ui';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { copiarLinhas, linhasParaCopiar } from './copiar.ts';

interface Ativo {
  rotulo: string;
  hostname: string | null;
  valor: string | null;
}

const COLUNAS = [
  { rotulo: 'Ativo', texto: (ativo: Ativo) => ativo.rotulo },
  { rotulo: 'Hostname', texto: (ativo: Ativo) => ativo.hostname },
  { rotulo: 'Valor de compra', texto: (ativo: Ativo) => ativo.valor },
];

const HP: Ativo = { rotulo: 'HP LaserJet', hostname: 'IMP-ALMOX-01', valor: 'R$ 2.500,00' };
const ARUBA: Ativo = { rotulo: 'Aruba\t2930F', hostname: 'SW-CPD\nA1', valor: null };

let avisados: MockInstance<typeof filaDeAvisos.avisar>;

beforeEach(() => {
  avisados = vi.spyOn(filaDeAvisos, 'avisar');
});

afterEach(() => {
  avisados.mockRestore();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
});

describe('as linhas para copiar', () => {
  it('a linha dos rótulos e uma por registro, com os valores separados por tabulação', () => {
    expect(linhasParaCopiar(COLUNAS, [HP])).toBe(
      'Ativo\tHostname\tValor de compra\nHP LaserJet\tIMP-ALMOX-01\tR$ 2.500,00',
    );
  });

  it('as tabulações e as quebras de linha viram espaços, e o valor oculto fica vazio (foco 9)', () => {
    expect(linhasParaCopiar(COLUNAS, [ARUBA]).split('\n')[1]).toBe('Aruba 2930F\tSW-CPD A1\t');
    expect(linhasParaCopiar(COLUNAS, [{ ...HP, hostname: 'a\r\nb' }]).split('\n')[1]).toBe(
      'HP LaserJet\ta b\tR$ 2.500,00',
    );
  });
});

describe('copiar as linhas', () => {
  it('leva o texto à área de transferência e diz quantas linhas copiou', async () => {
    const copiar = vi.fn(async () => {});
    await copiarLinhas(COLUNAS, [HP], copiar);
    expect(copiar).toHaveBeenCalledWith(linhasParaCopiar(COLUNAS, [HP]));
    await copiarLinhas(COLUNAS, [HP, ARUBA, HP], copiar);
    expect(avisados.mock.calls.map(([aviso]) => aviso.titulo)).toEqual([
      '1 linha copiada.',
      '3 linhas copiadas.',
    ]);
  });

  it('diz quando o navegador não deixou copiar', async () => {
    await copiarLinhas(COLUNAS, [HP], async () => {
      throw new Error('negado');
    });
    expect(avisados.mock.calls.map(([aviso]) => aviso.titulo)).toEqual([
      'Não foi possível copiar as linhas.',
    ]);
  });
});
