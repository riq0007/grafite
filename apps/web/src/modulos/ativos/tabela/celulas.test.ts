import {
  type CampoNoCatalogo,
  type ColunaDosAtivos,
  colunasDosAtivos,
  type TipoDeCampo,
} from '@grafite/domain';
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import type { AtivoNaLista } from '../consultas.ts';
import { textoDaCelula } from './celulas.tsx';

const CRITICIDADE = '7a1f5c2e-0b3d-4e8f-9a6b-1c2d3e4f5a6b';
const DONO = '8b2a6d3f-1c4e-4f9a-8b7c-2d3e4f5a6b7c';
const LIGADO = '9c3b7e4a-2d5f-4a8b-9c8d-3e4f5a6b7c8d';
const CUSTO = 'ad4c8f5b-3e6a-4b9c-8d9e-4f5a6b7c8d9e';
const SENHA = 'be5d9a6c-4f7b-4c8d-9e8f-5a6b7c8d9e8f';
const NOTA = 'cf6e0b7d-5a8c-4d9e-8f9a-6b7c8d9e0f1a';
const FOTO = 'd07f1c8e-6b9d-4e0f-9a0b-7c8d9e0f1a2b';

const campo = (
  id: string,
  rotulo: string,
  tipo: TipoDeCampo,
  extras: Partial<CampoNoCatalogo> = {},
): CampoNoCatalogo => ({
  id,
  rotulo,
  tipo,
  configuracao: {},
  grupo: null,
  situacao: 'ativo',
  restrito: false,
  escrita: 'manual',
  ...extras,
});

const COLUNAS = colunasDosAtivos({
  tipos: [
    {
      situacao: 'ativo',
      capacidades: [],
      campos: [CRITICIDADE, DONO, LIGADO, CUSTO, SENHA, NOTA, FOTO].map((campoId) => ({
        campoId,
        obrigatorio: false,
      })),
    },
  ],
  campos: [
    campo(CRITICIDADE, 'Criticidade', 'lista', {
      configuracao: { opcoes: [{ id: 'alta', rotulo: 'Alta', situacao: 'ativa' }] },
    }),
    campo(DONO, 'Dono', 'pessoa'),
    campo(LIGADO, 'Ligado a', 'ativo'),
    campo(CUSTO, 'Custo', 'moeda'),
    campo(SENHA, 'Senha do BIOS', 'texto', { restrito: true }),
    campo(NOTA, 'PDF da nota fiscal', 'arquivo'),
    campo(FOTO, 'Foto da etiqueta', 'imagem'),
  ],
  verRestritos: true,
});

const coluna = (chave: string) => COLUNAS.find((uma) => uma.chave === chave) as ColunaDosAtivos;

const ATIVO: AtivoNaLista = {
  id: 'a1',
  rotulo: 'HP LaserJet M404',
  tipo: { id: 'impressora', nome: 'Impressora', icone: 'impressora' },
  modelo: { id: 'm404', fabricante: 'HP', nome: 'LaserJet M404', imagem: null },
  imagem: null,
  patrimonio: 'PAT-00412',
  serie: null,
  hostname: 'IMP-ALMOX-01',
  local: { id: 'expedicao', caminho: 'Jundiaí › Expedição' },
  responsavel: { id: 'ana', nome: 'Ana Souza' },
  uso: 'em-manutencao',
  situacao: 'ativo',
  criadoEm: '2026-10-09T15:30:00.000Z',
  atualizadoEm: '2026-10-10T09:05:00.000Z',
  valores: {
    [CRITICIDADE]: 'alta',
    [DONO]: 'bruno',
    [LIGADO]: 'fora',
    [CUSTO]: 1500.5,
    [NOTA]: 'f-nf',
    [FOTO]: 'f-et',
    'ativo.contrato': 'Contrato\tSul',
    'ativo.fornecedor': 'locadora',
  },
  permite: { editar: true, verRestritos: false, verResponsavel: true },
};

const REFERENCIAS = {
  pessoas: { bruno: 'Bruno Lima' },
  locais: {},
  ativos: {},
  // O nome atual, com "(inativo)" no inativo, como a API o manda (change p4a-fornecedores).
  fornecedores: { locadora: 'Locadora Norte (inativo)' },
  arquivos: {
    'f-nf': { nome: 'nota-fiscal-1234.pdf', bytes: 240 * 1024, tipo: 'application/pdf' },
    'f-et': { nome: 'etiqueta.png', bytes: 18 * 1024, tipo: 'image/png' },
  },
  modelos: {},
  tiposDosModelos: {},
};

const texto = (chave: string, ativo = ATIVO) =>
  textoDaCelula(coluna(chave), ativo, REFERENCIAS, criarDataHora('America/Sao_Paulo'));

describe('o texto de cada célula dos ativos', () => {
  it('as colunas do ativo, pelos campos dele', () => {
    expect(texto('ativo.rotulo')).toBe('HP LaserJet M404');
    expect(texto('ativo.tipo')).toBe('Impressora');
    expect(texto('ativo.modelo')).toBe('HP LaserJet M404');
    expect(texto('ativo.situacao')).toBe('Em manutenção');
    expect(texto('ativo.situacao', { ...ATIVO, situacao: 'inativo' })).toBe('Inativo');
    expect(texto('ativo.patrimonio')).toBe('PAT-00412');
    expect(texto('ativo.serie')).toBeNull();
    expect(texto('ativo.local')).toBe('Jundiaí › Expedição');
    expect(texto('ativo.responsavel')).toBe('Ana Souza');
  });

  it('o cadastro e a última mudança com a hora, no fuso escolhido', () => {
    expect(texto('ativo.criado-em')).toBe('09/10/2026 12:30');
    expect(texto('ativo.atualizado-em')).toBe('10/10/2026 06:05');
  });

  it('os campos pelo motor, com as referências pelo nome atual', () => {
    expect(texto(CRITICIDADE)).toBe('Alta');
    expect(texto(DONO)).toBe('Bruno Lima');
    expect(texto(LIGADO)).toBe('Ativo fora do seu acesso');
    expect(texto(CUSTO)).toBe('R$ 1.500,50');
    expect(texto('ativo.contrato')).toBe('Contrato\tSul');
    expect(texto('ativo.garantia')).toBeNull();
    expect(texto('ativo.fornecedor')).toBe('Locadora Norte (inativo)');
  });

  it('o arquivo e a imagem pelo nome do arquivo, o texto que se copia e que a prévia mostra', () => {
    expect(texto(NOTA)).toBe('nota-fiscal-1234.pdf');
    expect(texto(FOTO)).toBe('etiqueta.png');
    expect(texto(NOTA, { ...ATIVO, valores: {} })).toBeNull();
  });

  it('o restrito, sem os restritos onde o ativo está, fica de fora', () => {
    expect(
      texto(SENHA, { ...ATIVO, valores: { ...ATIVO.valores, [SENHA]: 'segredo' } }),
    ).toBeNull();
  });
});
