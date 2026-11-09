import { describe, expect, it } from 'vitest';
import type { CampoNoCatalogo } from '../ativos/valores-do-ativo.ts';
import { camposDoAtivo } from '../ativos/valores-do-ativo.ts';
import { camposDaImportacao, conferirMapeamento, sugerirColunas } from './colunas.ts';

const campo = (
  id: string,
  rotulo: string,
  extras: Partial<CampoNoCatalogo> = {},
): CampoNoCatalogo => ({
  id,
  rotulo,
  tipo: 'texto',
  grupo: null,
  configuracao: {},
  restrito: false,
  escrita: 'automatica',
  situacao: 'ativo',
  ...extras,
});

const IP = campo('c-ip', 'IP', { tipo: 'ip', grupo: 'Rede' });
const CUSTO = campo('c-custo', 'Custo do contrato', { tipo: 'moeda', restrito: true });
const LAUDO = campo('c-laudo', 'Laudo técnico', { tipo: 'arquivo' });
const FOTO = campo('c-foto', 'Foto da etiqueta', { tipo: 'imagem' });
const TENSAO = campo('c-tensao', 'Tensão', { situacao: 'inativo' });

const definicoes = camposDoAtivo({
  tipo: {
    capacidades: ['hardware.inventario'],
    campos: [IP, CUSTO, LAUDO, FOTO, TENSAO].map((um) => ({ campoId: um.id, obrigatorio: false })),
  },
  campos: [IP, CUSTO, LAUDO, FOTO, TENSAO],
});

describe('camposDaImportacao', () => {
  it('oferece os campos do tipo na ordem da ficha, com o modelo e sem arquivo nem imagem', () => {
    const campos = camposDaImportacao(definicoes, { restritos: true });
    const chaves = campos.map((um) => um.chave);
    expect(chaves.slice(0, 5)).toEqual([
      'ativo.nome',
      'ativo.patrimonio',
      'ativo.serie',
      'ativo.hostname',
      'ativo.modelo',
    ]);
    expect(campos.find((um) => um.chave === 'ativo.modelo')).toEqual({
      chave: 'ativo.modelo',
      rotulo: 'Modelo',
      grupo: 'Identificação',
      restrito: false,
    });
    expect(chaves).toContain('c-ip');
    expect(chaves).toContain('c-custo');
    expect(chaves).toContain('hardware.processador');
    expect(chaves).not.toContain('c-laudo');
    expect(chaves).not.toContain('c-foto');
    expect(chaves).not.toContain('c-tensao');
  });

  it('só oferece os campos restritos a quem os vê em algum ramo', () => {
    const chaves = camposDaImportacao(definicoes, { restritos: false }).map((um) => um.chave);
    expect(chaves).not.toContain('c-custo');
    expect(chaves).toContain('c-ip');
  });
});

describe('sugerirColunas', () => {
  const campos = camposDaImportacao(definicoes, { restritos: true });

  it('liga cada coluna ao campo pelo rótulo, sem diferenciar acento, maiúsculas e espaços', () => {
    expect(sugerirColunas(['PATRIMONIO', 'Série', ' IP ', 'Observação'], campos)).toEqual([
      'ativo.patrimonio',
      'ativo.serie',
      'c-ip',
      null,
    ]);
  });

  it('reconhece os nomes conhecidos dos campos comuns', () => {
    expect(
      sugerirColunas(
        ['Serial', 'Localização', 'Responsável', 'Modelo', 'Nº de patrimônio', 'Host', 'Status'],
        campos,
      ),
    ).toEqual([
      'ativo.serie',
      'ativo.local',
      'ativo.responsavel',
      'ativo.modelo',
      'ativo.patrimonio',
      'ativo.hostname',
      'ativo.uso',
    ]);
  });

  it('reconhece o rótulo de um campo de capacidade e ignora os dois-pontos do título', () => {
    expect(sugerirColunas(['Processador:', 'Memória (GB)'], campos)).toEqual([
      'hardware.processador',
      'hardware.memoria',
    ]);
  });

  it('não liga o mesmo campo a duas colunas: a segunda fica em "Ignorar"', () => {
    expect(sugerirColunas(['Série', 'Serial', 'S/N'], campos)).toEqual(['ativo.serie', null, null]);
  });

  it('não sugere um campo que a conta não pode importar', () => {
    const semRestritos = camposDaImportacao(definicoes, { restritos: false });
    expect(sugerirColunas(['Custo do contrato', 'Laudo técnico'], semRestritos)).toEqual([
      null,
      null,
    ]);
  });
});

describe('conferirMapeamento', () => {
  const campos = camposDaImportacao(definicoes, { restritos: true });

  it('aceita cada campo numa coluna só, com as outras em "Ignorar"', () => {
    expect(conferirMapeamento(['ativo.patrimonio', null, 'ativo.local'], 3, campos)).toEqual({
      ok: true,
    });
  });

  it('recusa um campo em duas colunas, nas duas', () => {
    expect(
      conferirMapeamento(['ativo.local', 'ativo.patrimonio', 'ativo.local'], 3, campos),
    ).toEqual({
      ok: false,
      erros: {
        'colunas.0': 'O campo Local está em duas colunas.',
        'colunas.2': 'O campo Local está em duas colunas.',
      },
    });
  });

  it('recusa a importação sem nenhuma coluna escolhida', () => {
    expect(conferirMapeamento([null, null], 2, campos)).toEqual({
      ok: false,
      erros: { colunas: 'Escolha o campo de pelo menos uma coluna.' },
    });
  });

  it('recusa um campo que a importação não oferece e um número errado de colunas', () => {
    expect(conferirMapeamento(['c-laudo', 'ativo.serie'], 2, campos)).toEqual({
      ok: false,
      erros: { 'colunas.0': 'Este campo não pode ser importado.' },
    });
    expect(conferirMapeamento(['ativo.serie'], 2, campos)).toEqual({
      ok: false,
      erros: { colunas: 'Escolha o campo de cada uma das 2 colunas.' },
    });
  });
});
