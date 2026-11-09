import { type CampoNoCatalogo, CHAVE_DO_MODELO, camposDoAtivo } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import type { EntradaDoCampo } from './CampoDoAtivo.tsx';
import {
  etapaAnterior,
  etapaComRecusa,
  etapaSeguinte,
  etapasDoCadastro,
  gruposDoCadastro,
} from './etapas.ts';

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
const MASCARA = campo('c-mascara', 'Máscara', { grupo: 'Rede' });
const GATEWAY = campo('c-gateway', 'Gateway', { grupo: 'Rede' });
const CUSTO = campo('c-custo', 'Custo do contrato', { tipo: 'moeda', restrito: true });
const LAUDO = campo('c-laudo', 'Laudo técnico', { tipo: 'arquivo', grupo: 'Documentos' });
const CAMPOS = [IP, MASCARA, GATEWAY, CUSTO, LAUDO];

const IMPRESSORA = {
  nome: 'Impressora',
  capacidades: [] as string[],
  campos: [
    { campoId: 'c-ip', obrigatorio: true },
    { campoId: 'c-mascara', obrigatorio: false },
    { campoId: 'c-gateway', obrigatorio: false },
    { campoId: 'c-custo', obrigatorio: false },
    { campoId: 'c-laudo', obrigatorio: false },
  ],
};

const definicoes = camposDoAtivo({ tipo: IMPRESSORA, campos: CAMPOS });

/** As entradas iniciais do cadastro: a situação de uso com o padrão, o resto vazio. */
const entradasVazias = (): Record<string, EntradaDoCampo> => ({ 'ativo.uso': 'em-uso' });

const daImpressora = ({
  entradas = entradasVazias(),
  verRestritos = true,
  modelo = null as { fabricante: string; nome: string } | null,
} = {}) =>
  etapasDoCadastro({
    tipo: IMPRESSORA,
    modelo,
    grupos: gruposDoCadastro(definicoes, verRestritos),
    entradas,
  });

const resumo = (etapas: ReturnType<typeof daImpressora>) =>
  etapas.map(({ chave, nome, situacao }) => [chave, nome, situacao]);

describe('etapasDoCadastro', () => {
  it('a impressora tem Tipo, Modelo, Identificação, Uso, Rede, os outros grupos e Administrativo, nessa ordem', () => {
    expect(daImpressora().map((etapa) => etapa.nome)).toEqual([
      'Tipo',
      'Modelo',
      'Identificação',
      'Uso',
      'Rede',
      'Documentos',
      'Outros',
      'Administrativo',
    ]);
  });

  it('diz o que falta, com "e mais N", o que está preenchido e o que é opcional', () => {
    expect(resumo(daImpressora())).toEqual([
      ['tipo', 'Tipo', 'Impressora'],
      ['modelo', 'Modelo', 'Opcional'],
      ['identificacao', 'Identificação', 'Opcional'],
      ['uso', 'Uso', 'Preenchida'],
      ['organizacao:Rede', 'Rede', 'Falta: IP'],
      ['organizacao:Documentos', 'Documentos', 'Opcional'],
      ['outros', 'Outros', 'Opcional'],
      ['administrativo', 'Administrativo', 'Opcional'],
    ]);
    const rede = daImpressora().find((etapa) => etapa.chave === 'organizacao:Rede');
    expect(rede?.tom).toBe('atencao');
  });

  it('a etapa com mais de um obrigatório vazio diz o primeiro e quantos mais faltam', () => {
    const exigente = {
      ...IMPRESSORA,
      campos: IMPRESSORA.campos.map((item) => ({
        ...item,
        obrigatorio: item.campoId !== 'c-laudo',
      })),
    };
    const etapas = etapasDoCadastro({
      tipo: exigente,
      modelo: null,
      grupos: gruposDoCadastro(camposDoAtivo({ tipo: exigente, campos: CAMPOS }), true),
      entradas: { ...entradasVazias(), 'c-mascara': '255.255.255.0' },
    });
    expect(etapas.find((etapa) => etapa.nome === 'Rede')?.situacao).toBe('Falta: IP e mais 1');
  });

  it('preenchida com os obrigatórios ou com algo opcional; o nome do modelo escolhido', () => {
    const etapas = daImpressora({
      entradas: { ...entradasVazias(), 'c-ip': '10.0.4.12', 'ativo.patrimonio': 'PAT-0142' },
      modelo: { fabricante: 'HP', nome: 'LaserJet M404' },
    });
    expect(resumo(etapas).slice(1, 5)).toEqual([
      ['modelo', 'Modelo', 'HP LaserJet M404'],
      ['identificacao', 'Identificação', 'Preenchida'],
      ['uso', 'Uso', 'Preenchida'],
      ['organizacao:Rede', 'Rede', 'Preenchida'],
    ]);
  });

  it('um texto só de espaços e uma lista vazia não contam como preenchidos', () => {
    const etapas = daImpressora({
      entradas: { ...entradasVazias(), 'c-ip': '   ', 'ativo.nome': '' },
    });
    expect(etapas.find((etapa) => etapa.nome === 'Rede')?.situacao).toBe('Falta: IP');
    expect(etapas.find((etapa) => etapa.nome === 'Identificação')?.situacao).toBe('Opcional');
  });

  it('o campo de arquivo não conta: ele é enviado depois do cadastro', () => {
    const etapas = daImpressora({ entradas: { ...entradasVazias(), 'c-laudo': 'arquivo-1' } });
    expect(etapas.find((etapa) => etapa.nome === 'Documentos')?.situacao).toBe('Opcional');
  });

  it('sem ver os restritos, o campo restrito sai, e o grupo que fica vazio também', () => {
    const etapas = daImpressora({ verRestritos: false });
    expect(etapas.map((etapa) => etapa.nome)).not.toContain('Outros');
    expect(etapas.flatMap((etapa) => etapa.campos.map((c) => c.chave))).not.toContain('c-custo');
  });

  it('antes do tipo, só o Tipo abre, e as outras dizem "Escolha o tipo antes"', () => {
    const etapas = etapasDoCadastro({ tipo: null, modelo: null, grupos: [], entradas: {} });
    expect(
      etapas.map(({ chave, situacao, motivo, tom }) => ({ chave, situacao, motivo, tom })),
    ).toEqual([
      { chave: 'tipo', situacao: 'Falta escolher', motivo: undefined, tom: 'atencao' },
      { chave: 'modelo', situacao: '', motivo: 'Escolha o tipo antes', tom: 'normal' },
      { chave: 'identificacao', situacao: '', motivo: 'Escolha o tipo antes', tom: 'normal' },
      { chave: 'uso', situacao: '', motivo: 'Escolha o tipo antes', tom: 'normal' },
      { chave: 'administrativo', situacao: '', motivo: 'Escolha o tipo antes', tom: 'normal' },
    ]);
  });
});

describe('a navegação pelas etapas', () => {
  it('a seguinte e a anterior, sem passar do fim nem do começo', () => {
    const etapas = daImpressora();
    expect(etapaSeguinte(etapas, 'modelo')?.nome).toBe('Identificação');
    expect(etapaSeguinte(etapas, 'administrativo')).toBeUndefined();
    expect(etapaAnterior(etapas, 'modelo')?.nome).toBe('Tipo');
    expect(etapaAnterior(etapas, 'tipo')).toBeUndefined();
  });

  it('a primeira etapa com uma recusa, na ordem da lista', () => {
    const etapas = daImpressora();
    expect(etapaComRecusa(etapas, { 'ativo.garantia': 'x', 'c-ip': 'Preencha este campo.' })).toBe(
      'organizacao:Rede',
    );
    expect(etapaComRecusa(etapas, { [CHAVE_DO_MODELO]: 'Modelo inativo.' })).toBe('modelo');
    expect(etapaComRecusa(etapas, {})).toBeUndefined();
  });
});
