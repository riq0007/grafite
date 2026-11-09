import { describe, expect, it } from 'vitest';
import type { EstadoDoCampo } from '../ativos/estado-do-campo.ts';
import { type CampoNoCatalogo, camposDoAtivo } from '../ativos/valores-do-ativo.ts';
import type { LocalDaArvore } from '../locais/arvore.ts';
import { type AtivoNoIndice, type Casamento, criarCasamento } from './casamento.ts';
import {
  type AtivoAtual,
  type Celula,
  type ContextoDaLinha,
  identificacaoDaLinha,
  planejarLinha,
} from './linha.ts';
import { criarReferencias } from './referencias.ts';

const IMPRESSORA = 'tipo-impressora';

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
const TOMBAMENTO = campo('c-tombamento', 'Tombamento', { escrita: 'manual' });
const SETOR = campo('c-setor', 'Setor de faturamento');
const SUBSTITUI = campo('c-substitui', 'Substitui', {
  tipo: 'ativo',
  configuracao: { tipos: [IMPRESSORA] },
});
const CAMPOS = [IP, CUSTO, TOMBAMENTO, SETOR, SUBSTITUI];

const definicoes = camposDoAtivo({
  tipo: {
    capacidades: [],
    campos: CAMPOS.map((um) => ({ campoId: um.id, obrigatorio: um.id === 'c-setor' })),
  },
  campos: CAMPOS,
});

const local = (id: string, nome: string, paiId: string | null): LocalDaArvore => ({
  id,
  nome,
  paiId,
  tipo: 'setor',
  situacao: 'ativo',
});
const LOCAIS = [
  local('l-jun', 'Jundiaí', null),
  local('l-cam', 'Campinas', null),
  local('l-alm', 'Almoxarifado', 'l-jun'),
  local('l-exp', 'Expedição', 'l-jun'),
];
const CAMINHOS: Record<string, string> = {
  'l-jun': 'Jundiaí',
  'l-cam': 'Campinas',
  'l-alm': 'Jundiaí › Almoxarifado',
  'l-exp': 'Jundiaí › Expedição',
};

const noIndice = (id: string, extras: Partial<AtivoNoIndice> = {}): AtivoNoIndice => ({
  id,
  tipoId: IMPRESSORA,
  tipo: 'Impressora',
  nome: `Impressora ${id}`,
  situacao: 'ativo',
  patrimonio: null,
  serie: null,
  hostname: null,
  ...extras,
});

const INDICE = [
  noIndice('a-412', { patrimonio: 'PAT-00412', hostname: 'IMP-01' }),
  noIndice('a-300', { patrimonio: 'PAT-00300', nome: 'Impressora antiga' }),
  noIndice('a-301', { patrimonio: 'PAT-00301', situacao: 'inativo' }),
  noIndice('a-610', { patrimonio: 'PAT-00610', tipoId: 'tipo-switch', tipo: 'Switch' }),
  noIndice('a-900', { patrimonio: 'PAT-00900' }),
];

const travado = (origem: EstadoDoCampo['origem'] = 'manual'): EstadoDoCampo => ({
  origem,
  momento: '2026-10-01T10:00:00.000Z',
  autorId: 'conta-ana',
  trava: true,
});

const PAT_412: AtivoAtual = {
  id: 'a-412',
  localId: 'l-alm',
  modeloId: null,
  valores: {
    'ativo.patrimonio': 'PAT-00412',
    'ativo.hostname': 'IMP-01',
    'ativo.uso': 'em-uso',
    'ativo.local': 'l-alm',
    'c-ip': '10.0.0.5',
    'c-custo': 150,
    'c-setor': 'Fiscal',
  },
  estado: { 'ativo.hostname': travado() },
};

const PAT_900: AtivoAtual = {
  id: 'a-900',
  localId: 'l-cam',
  modeloId: null,
  valores: { 'ativo.patrimonio': 'PAT-00900', 'ativo.local': 'l-cam', 'c-setor': 'Fiscal' },
  estado: {},
};

const MAPEAMENTO = [
  'ativo.patrimonio',
  'ativo.hostname',
  'ativo.local',
  'c-ip',
  'c-custo',
  'c-tombamento',
  'c-setor',
  'ativo.modelo',
  'c-substitui',
  'ativo.data-de-compra',
  'ativo.uso',
  null,
];

/** As células na ordem do mapeamento acima; o que não vem fica vazio. */
function celulas(valores: Partial<Record<string, Celula>>): Celula[] {
  return MAPEAMENTO.map((chave, posicao) =>
    chave === null ? (valores[`coluna-${posicao}`] ?? null) : (valores[chave] ?? null),
  );
}

const NOMES: Record<string, string> = {
  ...CAMINHOS,
  'a-300': 'Impressora antiga',
  'm-1': 'HP LaserJet M404',
};

function contexto(
  extras: Partial<Omit<ContextoDaLinha, 'casamento'>> = {},
): ContextoDaLinha & { casamento: Casamento } {
  return {
    definicoes,
    mapeamento: MAPEAMENTO,
    referencias: criarReferencias({
      locais: LOCAIS,
      pessoas: [],
      modelos: [{ id: 'm-1', fabricante: 'HP', nome: 'LaserJet M404' }],
    }),
    casamento: criarCasamento(INDICE, IMPRESSORA),
    nomeDoTipo: (id) => ({ [IMPRESSORA]: 'Impressora', 'tipo-switch': 'Switch' })[id],
    nomeDoRegistro: (id) => NOMES[id],
    caminhoDoLocal: (id) => CAMINHOS[id] ?? id,
    acesso: {
      editaEm: (localId) => localId !== null && localId !== 'l-cam',
      restritosEm: (localId) => localId !== null && localId !== 'l-cam',
    },
    ...extras,
  };
}

/** Casa e planeja a linha, como a prévia: o ativo casado vem dos atuais dados. */
function planejar(
  valores: Partial<Record<string, Celula>>,
  extras: Partial<Omit<ContextoDaLinha, 'casamento'>> = {},
  atuais: AtivoAtual[] = [PAT_412, PAT_900],
  linha = 2,
) {
  const ctx = contexto(extras);
  const linhaDaPlanilha = celulas(valores);
  const casamento = ctx.casamento.casar(linha, identificacaoDaLinha(linhaDaPlanilha, MAPEAMENTO));
  const atual =
    casamento.tipo === 'casado'
      ? (atuais.find((um) => um.id === casamento.ativo.id) ?? null)
      : null;
  return planejarLinha(linha, linhaDaPlanilha, casamento, atual, ctx);
}

describe('identificacaoDaLinha', () => {
  it('lê o patrimônio, a série e o hostname das colunas escolhidas, com o número como texto', () => {
    expect(
      identificacaoDaLinha(
        [412, null, ' imp-01 '],
        ['ativo.patrimonio', 'ativo.serie', 'ativo.hostname'],
      ),
    ).toEqual({ patrimonio: '412', serie: null, hostname: 'imp-01' });
  });
});

describe('planejarLinha', () => {
  it('mostra o local mudado e o hostname travado, como a spec', () => {
    const plano = planejar({
      'ativo.patrimonio': 'PAT-00412',
      'ativo.hostname': 'IMP-NOVA',
      'ativo.local': 'Jundiaí › Expedição',
    });
    expect(plano).toMatchObject({
      linha: 2,
      acao: 'alterar',
      ativoId: 'a-412',
      mudancas: [
        {
          chave: 'ativo.local',
          campo: 'Local',
          antes: 'Jundiaí › Almoxarifado',
          depois: 'Jundiaí › Expedição',
        },
      ],
      seguros: [{ chave: 'ativo.hostname', campo: 'Hostname', motivo: 'Travado' }],
      erros: [],
      pedido: { valores: { 'ativo.local': 'l-exp' } },
    });
  });

  it('recusa o valor que a regra do campo recusa, no campo', () => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-00412', 'c-ip': '10.0.0' });
    expect(plano.acao).toBe('com-erro');
    expect(plano.erros).toEqual([{ campo: 'IP', mensagem: 'Use um IP, como 192.168.0.10.' }]);
  });

  it('a célula vazia não muda o valor guardado, e o igual não conta como mudança', () => {
    const plano = planejar({
      'ativo.patrimonio': 'pat-00412',
      'ativo.hostname': '',
      'c-ip': '10.0.0.5',
      'c-setor': 'Fiscal',
    });
    expect(plano).toMatchObject({ acao: 'sem-mudanca', mudancas: [], seguros: [], erros: [] });
  });

  it('lê a data pelo número de série do Excel, a lista pelo rótulo e o modelo pelo nome', () => {
    const plano = planejar({
      'ativo.patrimonio': 'PAT-00412',
      'ativo.data-de-compra': 45567,
      'ativo.uso': 'em manutenção',
      'ativo.modelo': 'HP LaserJet M404',
    });
    expect(plano.acao).toBe('alterar');
    expect(plano.pedido).toEqual({
      modeloId: 'm-1',
      valores: { 'ativo.data-de-compra': '2024-10-02', 'ativo.uso': 'em-manutencao' },
    });
    expect(plano.mudancas).toEqual([
      { chave: 'ativo.modelo', campo: 'Modelo', antes: null, depois: 'HP LaserJet M404' },
      { chave: 'ativo.uso', campo: 'Situação de uso', antes: 'Em uso', depois: 'Em manutenção' },
      { chave: 'ativo.data-de-compra', campo: 'Data de compra', antes: null, depois: '02/10/2024' },
    ]);
  });

  it('não muda o modelo travado', () => {
    const plano = planejar(
      { 'ativo.patrimonio': 'PAT-00412', 'ativo.modelo': 'HP LaserJet M404' },
      {},
      [{ ...PAT_412, estado: { 'ativo.modelo': travado() } }],
    );
    expect(plano).toMatchObject({
      acao: 'sem-mudanca',
      seguros: [{ chave: 'ativo.modelo', campo: 'Modelo', motivo: 'Travado' }],
    });
    expect(plano.pedido).toEqual({ valores: {} });
  });

  it('não grava o campo só manual, nem no ativo novo', () => {
    const plano = planejar({
      'ativo.patrimonio': 'PAT-07000',
      'c-tombamento': 'T-123',
      'c-setor': 'Fiscal',
      'ativo.local': 'Almoxarifado',
    });
    expect(plano).toMatchObject({
      acao: 'novo',
      ativoId: null,
      seguros: [{ chave: 'c-tombamento', campo: 'Tombamento', motivo: 'Só manual' }],
      erros: [],
    });
    expect(plano.pedido.valores).toEqual({
      'ativo.patrimonio': 'PAT-07000',
      'ativo.local': 'l-alm',
      'c-setor': 'Fiscal',
    });
    expect(plano.mudancas).toContainEqual({
      chave: 'ativo.patrimonio',
      campo: 'Patrimônio',
      antes: null,
      depois: 'PAT-07000',
    });
  });

  it('cobra os obrigatórios do ativo novo', () => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-07000', 'ativo.local': 'Almoxarifado' });
    expect(plano.acao).toBe('com-erro');
    expect(plano.erros).toEqual([
      { campo: 'Setor de faturamento', mensagem: 'Preencha este campo.' },
    ]);
  });

  it('recusa a linha sem valor nas colunas escolhidas', () => {
    const plano = planejar({ 'coluna-11': 'só uma observação' });
    expect(plano).toMatchObject({
      acao: 'com-erro',
      erros: [{ campo: null, mensagem: 'A linha não tem valor nas colunas escolhidas.' }],
    });
  });

  it('leva a recusa do casamento ao campo que casou', () => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-00610', 'c-ip': '10.0.0.9' });
    expect(plano).toMatchObject({
      acao: 'com-erro',
      ativoId: null,
      mudancas: [],
      erros: [{ campo: 'Patrimônio', mensagem: 'O ativo PAT-00610 é do tipo Switch.' }],
    });
  });

  it('recusa o ativo fora do escopo, sem mostrar os valores dele', () => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-00900', 'c-setor': 'Compras' });
    expect(plano).toMatchObject({
      acao: 'com-erro',
      ativoId: 'a-900',
      mudancas: [],
      seguros: [],
      erros: [{ campo: null, mensagem: 'Você não edita ativos em Campinas.' }],
    });
  });

  it('recusa levar o ativo para um local fora do escopo', () => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-00412', 'ativo.local': 'Campinas' });
    expect(plano.erros).toEqual([{ campo: null, mensagem: 'Você não edita ativos em Campinas.' }]);
  });

  it('recusa o ativo novo sem local a quem não edita na organização inteira', () => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-07000', 'c-setor': 'Fiscal' });
    expect(plano.erros).toEqual([{ campo: null, mensagem: 'Você não edita ativos sem local.' }]);
  });

  it('recusa o campo restrito a quem não o edita no local, sem mostrar o valor dele', () => {
    const plano = planejar(
      { 'ativo.patrimonio': 'PAT-00412', 'c-custo': '200,00', 'c-ip': '10.0.0.9' },
      {
        acesso: {
          editaEm: (localId) => localId !== null,
          restritosEm: () => false,
        },
      },
    );
    expect(plano.acao).toBe('com-erro');
    expect(plano.erros).toEqual([
      { campo: null, mensagem: 'Você não edita os campos restritos neste local.' },
    ]);
    expect(plano.mudancas.map((mudanca) => mudanca.chave)).toEqual(['c-ip']);
  });

  it('lê o ativo de um campo do tipo ativo pelo patrimônio', () => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-00412', 'c-substitui': 'pat-00300' });
    expect(plano.pedido.valores).toEqual({ 'c-substitui': 'a-300' });
    expect(plano.mudancas).toEqual([
      { chave: 'c-substitui', campo: 'Substitui', antes: null, depois: 'Impressora antiga' },
    ]);
  });

  it.each([
    ['PAT-09999', 'Ativo não encontrado: PAT-09999.'],
    ['PAT-00301', 'O ativo escolhido está inativo.'],
    ['PAT-00610', 'Escolha um ativo do tipo Impressora.'],
    ['PAT-00412', 'Um ativo não pode se referir a si mesmo.'],
  ])('recusa o ativo %s num campo do tipo ativo', (patrimonio, mensagem) => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-00412', 'c-substitui': patrimonio });
    expect(plano.erros).toEqual([{ campo: 'Substitui', mensagem }]);
  });

  it('recusa a referência por texto que não se resolve', () => {
    const plano = planejar({ 'ativo.patrimonio': 'PAT-00412', 'ativo.local': 'Expedição Norte' });
    expect(plano.erros).toEqual([
      { campo: 'Local', mensagem: 'Local não encontrado: Expedição Norte.' },
    ]);
  });

  it('ignora a coluna de um campo que saiu do tipo', () => {
    const plano = planejar(
      { 'ativo.patrimonio': 'PAT-00412', 'c-ip': '10.0.0.9' },
      { mapeamento: MAPEAMENTO.map((chave) => (chave === 'c-ip' ? 'c-removido' : chave)) },
    );
    expect(plano.acao).toBe('sem-mudanca');
  });
});
