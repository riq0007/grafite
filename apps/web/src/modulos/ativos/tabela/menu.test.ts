import { filaDeAvisos } from '@grafite/ui';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { itensDoMenuDosAtivos } from './menu.ts';

const COM_PATRIMONIO = { id: 'a1', patrimonio: 'PAT-00412' };
const SEM_PATRIMONIO = { id: 'a2', patrimonio: null };
const OUTRO = { id: 'a3', patrimonio: 'PAT-00251' };

const ATIVOS = new Map([COM_PATRIMONIO, SEM_PATRIMONIO, OUTRO].map((ativo) => [ativo.id, ativo]));

let avisados: MockInstance<typeof filaDeAvisos.avisar>;

beforeEach(() => {
  avisados = vi.spyOn(filaDeAvisos, 'avisar');
});

afterEach(() => {
  avisados.mockRestore();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
});

function menu(chaves: string[]) {
  const acoes = {
    abrir: vi.fn(),
    prever: vi.fn(),
    copiarLinhas: vi.fn(),
    imprimirEtiquetas: vi.fn(),
    copiar: vi.fn(async () => {}),
  };
  const itens = itensDoMenuDosAtivos({
    chaves,
    ativos: ATIVOS,
    origem: 'https://ti.empresa.com.br',
    ...acoes,
  });
  const escolher = (rotulo: string) => itens.find((item) => item.rotulo === rotulo)?.aoEscolher();
  return { itens: itens.map((item) => item.rotulo), escolher, ...acoes };
}

describe('o menu de contexto dos ativos', () => {
  it('numa linha com patrimônio, todos os itens', () => {
    expect(menu(['a1']).itens).toEqual([
      'Abrir',
      'Prévia',
      'Copiar linhas',
      'Copiar patrimônio',
      'Copiar link',
      'Imprimir etiqueta',
    ]);
  });

  it('numa linha sem patrimônio, sem "Copiar patrimônio"', () => {
    expect(menu(['a2']).itens).toEqual([
      'Abrir',
      'Prévia',
      'Copiar linhas',
      'Copiar link',
      'Imprimir etiqueta',
    ]);
  });

  it('em várias linhas, só a prévia, copiar as linhas e imprimir as etiquetas', () => {
    expect(menu(['a1', 'a2', 'a3']).itens).toEqual([
      'Prévia',
      'Copiar linhas',
      'Imprimir etiquetas',
    ]);
  });

  it('imprimir as etiquetas abre as das linhas do menu, na ordem da tabela', () => {
    const varias = menu(['a3', 'a1']);
    varias.escolher('Imprimir etiquetas');
    expect(varias.imprimirEtiquetas).toHaveBeenCalledWith(['a3', 'a1']);
    const umaSo = menu(['a2']);
    umaSo.escolher('Imprimir etiqueta');
    expect(umaSo.imprimirEtiquetas).toHaveBeenCalledWith(['a2']);
  });

  it('abrir, a prévia e copiar as linhas agem sobre as linhas do menu', () => {
    const umaSo = menu(['a1']);
    umaSo.escolher('Abrir');
    expect(umaSo.abrir).toHaveBeenCalledWith('a1');
    const varias = menu(['a3', 'a1']);
    varias.escolher('Prévia');
    expect(varias.prever).toHaveBeenCalledWith('a3');
    varias.escolher('Copiar linhas');
    expect(varias.copiarLinhas).toHaveBeenCalledWith(['a3', 'a1']);
  });

  it('copiar o patrimônio e o link da ficha, com os retornos', async () => {
    const { escolher, copiar } = menu(['a1']);
    escolher('Copiar patrimônio');
    escolher('Copiar link');
    await vi.waitFor(() => expect(avisados).toHaveBeenCalledTimes(2));
    expect(copiar.mock.calls).toEqual([['PAT-00412'], ['https://ti.empresa.com.br/ativos/a1']]);
    expect(avisados.mock.calls.map(([aviso]) => aviso.titulo)).toEqual([
      'Patrimônio copiado.',
      'Link copiado.',
    ]);
  });
});
