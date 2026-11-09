import { type CampoNoCatalogo, CHAVE_DO_MODELO, camposDoAtivo } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import {
  alteracoesNaoSalvas,
  cartaoComRecusa,
  cartoesDaFicha,
  textoDasAlteracoes,
} from './cartoes.ts';

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

const CAMPOS = [
  campo('c-ip', 'IP', { tipo: 'ip', grupo: 'Rede' }),
  campo('c-mascara', 'Máscara', { grupo: 'Rede' }),
  campo('c-gateway', 'Gateway', { grupo: 'Rede' }),
  campo('c-senha', 'Senha do painel', { restrito: true }),
  campo('c-laudo', 'Laudo técnico', { tipo: 'arquivo' }),
];

const IMPRESSORA = {
  capacidades: ['snmp.suprimentos'],
  campos: [
    { campoId: 'c-ip', obrigatorio: true },
    { campoId: 'c-mascara', obrigatorio: true },
    { campoId: 'c-gateway', obrigatorio: false },
    { campoId: 'c-senha', obrigatorio: false },
    { campoId: 'c-laudo', obrigatorio: false },
  ],
};

const definicoes = camposDoAtivo({ tipo: IMPRESSORA, campos: CAMPOS });
const LOCAIS: Record<string, string> = { 'l-exp': 'Jundiaí › Expedição' };

const daImpressora = ({
  entradas = {},
  verRestritos = true,
  situacoes = { 'snmp.suprimentos': { texto: 'Preto em 18%', tom: 'atencao' as const } },
  primeiroCartao = null,
}: {
  entradas?: Record<string, string | string[] | null>;
  verRestritos?: boolean;
  situacoes?: Record<string, { texto: string; tom: 'normal' | 'atencao' }>;
  primeiroCartao?: string | null;
} = {}) =>
  cartoesDaFicha({
    grupos: definicoes.grupos,
    entradas: { 'ativo.uso': 'em-uso', ...entradas },
    verRestritos,
    situacoesDasCapacidades: situacoes,
    resumoDaVisaoGeral: '1 alerta aberto',
    nomeDoRegistro: (id) => LOCAIS[id],
    primeiroCartao,
  });

const resumo = (cartoes: ReturnType<typeof daImpressora>) =>
  cartoes.map(({ chave, nome, resumo: texto, tom }) => [chave, nome, texto, tom]);
const chaves = (cartoes: ReturnType<typeof daImpressora>) => cartoes.map(({ chave }) => chave);

describe('cartoesDaFicha', () => {
  it('a capacidade principal primeiro, a Visão geral depois e os grupos na ordem da ficha', () => {
    expect(resumo(daImpressora())).toEqual([
      ['capacidade:snmp.suprimentos', 'Suprimentos e contadores', 'Preto em 18%', 'atencao'],
      ['visao-geral', 'Visão geral', '1 alerta aberto', 'normal'],
      ['identificacao', 'Identificação', 'Nada preenchido', 'normal'],
      ['uso', 'Uso', 'Em uso', 'normal'],
      ['organizacao:Rede', 'Rede', 'Falta: IP e mais 1', 'atencao'],
      ['outros', 'Outros', 'Nada preenchido', 'normal'],
      ['administrativo', 'Administrativo', 'Nada preenchido', 'normal'],
    ]);
  });

  // O primeiro cartão da ficha (change primeiro-cartao-da-ficha, design, decisão 3).
  it('a Visão geral escolhida no tipo abre a lista, com a ordem da ficha', () => {
    expect(chaves(daImpressora({ primeiroCartao: 'visao-geral' }))).toEqual([
      'visao-geral',
      'identificacao',
      'uso',
      'organizacao:Rede',
      'outros',
      'capacidade:snmp.suprimentos',
      'administrativo',
    ]);
  });

  it('o escolhido que falta na ficha cai no automático, e sem capacidade com cartão, na Visão geral', () => {
    expect(chaves(daImpressora({ primeiroCartao: 'controlid.backup' }))[0]).toBe(
      'capacidade:snmp.suprimentos',
    );
    expect(chaves(daImpressora({ situacoes: {} }))[0]).toBe('visao-geral');
  });

  it('o resumo traz os valores dos dois primeiros campos preenchidos, com o nome do registro', () => {
    const cartoes = daImpressora({
      entradas: {
        'ativo.local': 'l-exp',
        'ativo.patrimonio': 'PAT-0142',
        'ativo.serie': 'VNB3K21',
        'ativo.hostname': 'IMP-01',
        'ativo.valor-de-compra': '1.200,50',
        'c-ip': '10.0.4.12',
        'c-mascara': '255.255.255.0',
      },
    });
    const porChave = Object.fromEntries(cartoes.map((cartao) => [cartao.chave, cartao.resumo]));
    expect(porChave.uso).toBe('Em uso · Jundiaí › Expedição');
    expect(porChave.identificacao).toBe('PAT-0142 · VNB3K21');
    expect(porChave['organizacao:Rede']).toBe('10.0.4.12 · 255.255.255.0');
    expect(porChave.administrativo).toBe('R$ 1.200,50');
  });

  it('o restrito que a conta não vê e o arquivo ficam fora do resumo, e o grupo vazio sai', () => {
    const vendo = daImpressora({ entradas: { 'c-senha': 'segredo', 'c-laudo': 'arquivo-1' } });
    expect(vendo.find((cartao) => cartao.chave === 'outros')?.resumo).toBe('segredo');
    const semVer = daImpressora({
      entradas: { 'c-senha': 'segredo', 'c-laudo': 'arquivo-1' },
      verRestritos: false,
    });
    const outros = semVer.find((cartao) => cartao.chave === 'outros');
    expect(outros?.resumo).toBe('Nada preenchido');
    expect(outros?.campos.map((definicao) => definicao.chave)).toEqual(['c-laudo']);
  });

  it('a capacidade sem painel e sem campos não vira cartão', () => {
    const cartoes = daImpressora({ situacoes: {} });
    expect(cartoes.map((cartao) => cartao.chave)).not.toContain('capacidade:snmp.suprimentos');
  });
});

describe('as alterações não salvas', () => {
  it('conta as entradas, as travas e o modelo que mudaram', () => {
    expect(
      alteracoesNaoSalvas({
        entradas: { 'ativo.hostname': 'IMP-02', 'ativo.local': 'l-exp', 'c-portas': ['usb'] },
        iniciais: { 'ativo.hostname': 'IMP-01', 'ativo.local': 'l-exp', 'c-portas': ['usb'] },
        travas: { 'ativo.patrimonio': true, 'ativo.local': false },
        travasIniciais: {},
        modeloId: 'm-404',
        modeloInicial: null,
      }),
    ).toBe(3);
    expect(textoDasAlteracoes(0)).toBe('Nenhuma alteração');
    expect(textoDasAlteracoes(1)).toBe('1 alteração não salva');
    expect(textoDasAlteracoes(3)).toBe('3 alterações não salvas');
  });
});

describe('cartaoComRecusa', () => {
  it('o primeiro cartão, na ordem, com um campo recusado; o modelo é da Identificação', () => {
    const cartoes = daImpressora();
    expect(cartaoComRecusa(cartoes, { 'ativo.garantia': 'x', 'c-ip': 'Use um IPv4.' })).toBe(
      'organizacao:Rede',
    );
    expect(cartaoComRecusa(cartoes, { [CHAVE_DO_MODELO]: 'Modelo inativo.' })).toBe(
      'identificacao',
    );
    expect(cartaoComRecusa(cartoes, {})).toBeUndefined();
  });
});
