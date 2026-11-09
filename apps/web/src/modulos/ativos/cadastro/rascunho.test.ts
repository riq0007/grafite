import { CHAVE_DO_MODELO } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import type { CampoDaOrganizacao, TipoDeAtivo } from '../consultas.ts';
import {
  type ConteudoDoRascunho,
  conteudoDoRascunho,
  decidirPelaOrigem,
  estadoDoTipo,
  retomarRascunho,
} from './rascunho.ts';

const campo = (
  id: string,
  rotulo: string,
  extras: Partial<CampoDaOrganizacao> = {},
): CampoDaOrganizacao =>
  ({
    id,
    rotulo,
    tipo: 'texto',
    grupo: null,
    configuracao: {},
    restrito: false,
    escrita: 'automatica',
    situacao: 'ativo',
    ...extras,
  }) as CampoDaOrganizacao;

const CAMPOS = [
  campo('c-ip', 'IP', { tipo: 'ip', grupo: 'Rede' }),
  campo('c-custo', 'Custo do contrato', { tipo: 'moeda', restrito: true }),
  campo('c-laudo', 'Laudo técnico', { tipo: 'arquivo' }),
  campo('c-portas', 'Portas', {
    tipo: 'lista-multipla',
    configuracao: {
      opcoes: [
        { id: 'usb', rotulo: 'USB', situacao: 'ativa' },
        { id: 'rede', rotulo: 'Rede', situacao: 'ativa' },
      ],
    },
  }),
  campo('c-vizinha', 'Impressora vizinha', { tipo: 'ativo' }),
];

const tipo = (id: string, nome: string, situacao: 'ativo' | 'inativo' = 'ativo') =>
  ({
    id,
    nome,
    icone: 'impressora',
    situacao,
    capacidades: [],
    campos: ['c-ip', 'c-custo', 'c-laudo', 'c-portas', 'c-vizinha'].map((campoId) => ({
      campoId,
      obrigatorio: campoId === 'c-ip',
    })),
  }) as unknown as TipoDeAtivo;

const IMPRESSORA = tipo('t-impressora', 'Impressora');
const ATIVOS = [IMPRESSORA];

const rascunho = (extras: Partial<ConteudoDoRascunho> = {}): ConteudoDoRascunho => ({
  tipoId: IMPRESSORA.id,
  modeloId: 'm-404',
  valores: {
    'ativo.patrimonio': 'PAT-0142',
    'c-ip': '10.0.4.12',
    'c-custo': '1200,00',
    'c-laudo': 'arquivo-1',
    'c-portas': ['usb'],
    'c-vizinha': 'a-7',
    'c-sumiu': 'valor de um campo que o tipo não usa mais',
  },
  travas: { 'c-ip': true, 'c-sumiu': true, [CHAVE_DO_MODELO]: true },
  nomes: { 'a-7': 'HP do 2º andar', 'a-9': 'Nome de um registro que nada cita' },
  etapa: 'organizacao:Rede',
  origem: null,
  ...extras,
});

const retomar = (conteudo: ConteudoDoRascunho, editarRestritos = true) =>
  retomarRascunho({ rascunho: conteudo, tipos: ATIVOS, campos: CAMPOS, editarRestritos });

describe('retomarRascunho', () => {
  it('volta com o tipo, o modelo, os valores, as travas, os nomes e a etapa', () => {
    const estado = retomar(rascunho());
    expect(estado).toMatchObject({
      tipoId: IMPRESSORA.id,
      modeloId: 'm-404',
      travas: { 'c-ip': true, [CHAVE_DO_MODELO]: true },
      nomes: { 'a-7': 'HP do 2º andar' },
      etapa: 'organizacao:Rede',
      origem: null,
    });
    expect(estado.entradas).toMatchObject({
      'ativo.patrimonio': 'PAT-0142',
      'ativo.uso': 'em-uso',
      'c-ip': '10.0.4.12',
      'c-custo': '1200,00',
      'c-portas': ['usb'],
      'c-vizinha': 'a-7',
    });
  });

  it('deixa de fora o campo que o tipo não usa, o de arquivo e a forma errada', () => {
    const estado = retomar(
      rascunho({ valores: { 'c-ip': ['10.0.4.12'], 'c-portas': 'usb', 'c-laudo': 'arquivo-1' } }),
    );
    expect(estado.entradas['c-sumiu']).toBeUndefined();
    expect(estado.entradas['c-laudo']).toBeUndefined();
    expect(estado.entradas['c-ip']).toBe('');
    expect(estado.entradas['c-portas']).toEqual([]);
    expect(estado.travas['c-sumiu']).toBeUndefined();
  });

  it('sem editar os restritos, o valor restrito fica de fora', () => {
    const estado = retomar(rascunho(), false);
    expect(estado.entradas['c-custo']).toBeUndefined();
    expect(estado.entradas['c-ip']).toBe('10.0.4.12');
  });

  it('com o tipo inativado, volta sem o tipo e sem os valores, na etapa do Tipo', () => {
    const estado = retomarRascunho({
      rascunho: rascunho({ origem: 'local:l-1' }),
      tipos: [tipo(IMPRESSORA.id, 'Impressora', 'inativo')],
      campos: CAMPOS,
      editarRestritos: true,
    });
    expect(estado).toEqual({
      tipoId: null,
      modeloId: null,
      entradas: {},
      travas: {},
      nomes: {},
      etapa: 'tipo',
      origem: 'local:l-1',
    });
  });

  it('a etapa que não existe mais abre a do Tipo', () => {
    expect(retomar(rascunho({ etapa: 'organizacao:Sumiu' })).etapa).toBe('tipo');
    expect(retomar(rascunho({ etapa: null })).etapa).toBe('tipo');
    expect(retomar(rascunho({ etapa: 'modelo' })).etapa).toBe('modelo');
  });
});

describe('estadoDoTipo', () => {
  it('o cadastro novo de um tipo começa com os padrões e o que a origem preenche', () => {
    const estado = estadoDoTipo({
      tipo: IMPRESSORA,
      campos: CAMPOS,
      preenchido: {
        valores: { 'ativo.local': 'l-1' },
        nomes: { 'l-1': 'Expedição' },
        modeloId: 'm-404',
      },
      origem: 'local:l-1',
    });
    expect(estado).toMatchObject({
      tipoId: IMPRESSORA.id,
      modeloId: 'm-404',
      travas: {},
      nomes: { 'l-1': 'Expedição' },
      etapa: 'tipo',
      origem: 'local:l-1',
    });
    expect(estado.entradas).toMatchObject({
      'ativo.uso': 'em-uso',
      'ativo.local': 'l-1',
      'c-ip': '',
    });
  });
});

describe('decidirPelaOrigem', () => {
  it('sem rascunho começa; sem origem, ou com a mesma, retoma; com outra, pergunta', () => {
    expect(decidirPelaOrigem({ rascunho: null, origem: 'local:l-1' })).toBe('comecar');
    expect(decidirPelaOrigem({ rascunho: rascunho(), origem: null })).toBe('retomar');
    expect(
      decidirPelaOrigem({ rascunho: rascunho({ origem: 'local:l-1' }), origem: 'local:l-1' }),
    ).toBe('retomar');
    expect(decidirPelaOrigem({ rascunho: rascunho(), origem: 'local:l-1' })).toBe('perguntar');
    expect(
      decidirPelaOrigem({ rascunho: rascunho({ origem: 'local:l-2' }), origem: 'local:l-1' }),
    ).toBe('perguntar');
  });
});

describe('conteudoDoRascunho', () => {
  it('guarda o estado do cadastro na forma do rascunho', () => {
    const estado = retomar(rascunho());
    expect(conteudoDoRascunho(estado)).toEqual({
      tipoId: estado.tipoId,
      modeloId: estado.modeloId,
      valores: estado.entradas,
      travas: estado.travas,
      nomes: estado.nomes,
      etapa: estado.etapa,
      origem: estado.origem,
    });
  });
});
