import { describe, expect, it } from 'vitest';
import {
  aplicarAColunas,
  type ColunaDaTabela,
  conferirFiltro,
  type DefinicaoDaVisao,
  type FiltroDaVisao,
  LIMITES_DA_VISAO,
  lerDefinicaoDaVisao,
  lerNomeDaVisao,
  mesmaDefinicao,
  operadoresDa,
  partesQueMudaram,
  ROTULOS_DAS_SITUACOES,
  TABELAS_COM_VISOES,
  tabelaComVisoes,
  VISAO_DE_FABRICA,
  visaoQueVale,
} from './visoes.ts';

const LOCAL = '0199a6e0-0000-7000-8000-00000000010a';
const TENSAO = '0199a6e0-0000-7000-8000-0000000000f1';

const coluna = (chave: string, extras: Partial<ColunaDaTabela> = {}): ColunaDaTabela => ({
  chave,
  rotulo: chave,
  grupo: 'Identificação',
  ordena: true,
  filtro: 'texto',
  podeFicarVazia: true,
  alinhamento: 'inicio',
  mono: false,
  largura: 160,
  ...extras,
});

const COLUNAS: ColunaDaTabela[] = [
  coluna('ativo.rotulo', { rotulo: 'Ativo', principal: true, podeFicarVazia: false }),
  coluna('ativo.patrimonio', { rotulo: 'Patrimônio', mono: true }),
  coluna('ativo.local', { rotulo: 'Local', filtro: 'local' }),
  coluna('ativo.situacao', { rotulo: 'Situação', filtro: 'situacao', podeFicarVazia: false }),
  coluna('ativo.valor-de-compra', { rotulo: 'Valor de compra', filtro: 'numero' }),
  coluna('ativo.garantia', { rotulo: 'Garantia até', filtro: 'data' }),
  coluna('ativo.criado-em', { rotulo: 'Cadastrado em', filtro: 'momento', podeFicarVazia: false }),
  coluna('ativo.tipo', { rotulo: 'Tipo', filtro: 'escolha', podeFicarVazia: false }),
  coluna('ativo.outro', { rotulo: 'Outro ativo', filtro: null, ordena: false }),
];

function colunaDa(chave: string): ColunaDaTabela {
  const achada = COLUNAS.find((candidata) => candidata.chave === chave);
  if (!achada) throw new Error(`Coluna ${chave} fora do exemplo.`);
  return achada;
}

describe('as tabelas com visões', () => {
  it('por enquanto, só a dos ativos, com o módulo, a permissão e a visão de fábrica', () => {
    expect(TABELAS_COM_VISOES.map((tabela) => tabela.id)).toEqual(['ativos']);
    const ativos = tabelaComVisoes('ativos');
    expect(ativos).toMatchObject({ modulo: 'ativos', permissao: 'ativos.ver' });
    expect(ativos?.fabrica).toEqual({
      nome: 'Todos os ativos',
      definicao: {
        colunas: [
          { chave: 'ativo.rotulo' },
          { chave: 'ativo.patrimonio' },
          { chave: 'ativo.local' },
          { chave: 'ativo.situacao' },
        ],
        ordenacao: { chave: 'ativo.criado-em', direcao: 'decrescente' },
        filtros: [{ chave: 'ativo.situacao', operador: 'situacao', situacao: 'ativos' }],
      },
    });
    expect(tabelaComVisoes('pessoas')).toBeUndefined();
    expect(VISAO_DE_FABRICA).toBe('fabrica');
  });

  it('as situações do filtro da lista, com o rótulo de cada uma', () => {
    expect(ROTULOS_DAS_SITUACOES).toEqual({
      ativos: 'Ativos',
      'em-uso': 'Em uso',
      'em-estoque': 'Em estoque',
      'em-manutencao': 'Em manutenção',
      inativos: 'Inativos',
      todos: 'Todos',
    });
  });
});

describe('a leitura da definição de uma visão', () => {
  const valida: DefinicaoDaVisao = {
    colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio', largura: 140 }],
    ordenacao: { chave: 'ativo.patrimonio', direcao: 'crescente' },
    filtros: [
      { chave: 'ativo.patrimonio', operador: 'contem', texto: 'PAT' },
      { chave: 'ativo.valor-de-compra', operador: 'entre', de: 1000 },
      { chave: 'ativo.garantia', operador: 'entre', ate: '2026-12-31' },
      { chave: 'ativo.tipo', operador: 'qualquer', valores: ['t1', 't2'] },
      { chave: 'ativo.local', operador: 'em', local: LOCAL },
      { chave: 'ativo.outro', operador: 'vazio' },
      { chave: 'ativo.serie', operador: 'preenchido' },
      { chave: 'ativo.situacao', operador: 'situacao', situacao: 'inativos' },
    ],
  };

  it('aceita a definição completa', () => {
    expect(lerDefinicaoDaVisao(valida)).toEqual({ ok: true, definicao: valida });
  });

  it('traz a largura para o limite mais próximo, em pixels inteiros', () => {
    const lida = lerDefinicaoDaVisao({
      ...valida,
      colunas: [
        { chave: 'a', largura: 20 },
        { chave: 'b', largura: 1000 },
        { chave: 'c', largura: 120.6 },
      ],
    });
    expect(lida.ok && lida.definicao.colunas).toEqual([
      { chave: 'a', largura: 64 },
      { chave: 'b', largura: 800 },
      { chave: 'c', largura: 121 },
    ]);
  });

  it('deixa de fora a coluna repetida, com a primeira valendo', () => {
    const lida = lerDefinicaoDaVisao({
      ...valida,
      colunas: [{ chave: 'a', largura: 100 }, { chave: 'b' }, { chave: 'a', largura: 300 }],
    });
    expect(lida.ok && lida.definicao.colunas).toEqual([
      { chave: 'a', largura: 100 },
      { chave: 'b' },
    ]);
  });

  it('aceita a visão sem ordenação e sem filtros', () => {
    expect(lerDefinicaoDaVisao({ colunas: [], ordenacao: null, filtros: [] })).toEqual({
      ok: true,
      definicao: { colunas: [], ordenacao: null, filtros: [] },
    });
  });

  it.each([
    ['um texto', 'texto'],
    ['as colunas que não são uma lista', { colunas: 'a', ordenacao: null, filtros: [] }],
    ['a coluna sem chave', { colunas: [{ largura: 100 }], ordenacao: null, filtros: [] }],
    [
      'a ordenação sem direção conhecida',
      { colunas: [], ordenacao: { chave: 'a', direcao: 'subindo' }, filtros: [] },
    ],
    ['os filtros que não são uma lista', { colunas: [], ordenacao: null, filtros: {} }],
    [
      'o filtro com o operador desconhecido',
      { colunas: [], ordenacao: null, filtros: [{ chave: 'a', operador: 'parecido' }] },
    ],
  ])('recusa %s', (_caso, bruto) => {
    expect(lerDefinicaoDaVisao(bruto)).toEqual({
      ok: false,
      erro: 'A definição da visão não é válida.',
    });
  });

  it('recusa mais de 60 colunas e mais de 20 filtros', () => {
    const colunas = Array.from({ length: LIMITES_DA_VISAO.colunas + 1 }, (_, i) => ({
      chave: `c${i}`,
    }));
    expect(lerDefinicaoDaVisao({ colunas, ordenacao: null, filtros: [] })).toEqual({
      ok: false,
      erro: 'Use até 60 colunas.',
    });
    const filtros = Array.from({ length: LIMITES_DA_VISAO.filtros + 1 }, (_, i) => ({
      chave: `c${i}`,
      operador: 'vazio',
    }));
    expect(lerDefinicaoDaVisao({ colunas: [], ordenacao: null, filtros })).toEqual({
      ok: false,
      erro: 'Use até 20 filtros.',
    });
  });

  it('recusa dois filtros na mesma coluna', () => {
    expect(
      lerDefinicaoDaVisao({
        colunas: [],
        ordenacao: null,
        filtros: [
          { chave: 'a', operador: 'vazio' },
          { chave: 'a', operador: 'contem', texto: 'x' },
        ],
      }),
    ).toEqual({ ok: false, erro: 'Use um filtro por coluna.' });
  });

  it.each([
    [{ chave: 'a', operador: 'contem', texto: '   ' }, 'Digite o texto do filtro.'],
    [
      { chave: 'a', operador: 'contem', texto: 'x'.repeat(201) },
      'Use até 200 caracteres no filtro.',
    ],
    [{ chave: 'a', operador: 'entre' }, 'Informe o início ou o fim do intervalo.'],
    [{ chave: 'a', operador: 'qualquer', valores: [] }, 'Escolha pelo menos uma opção.'],
    [
      { chave: 'a', operador: 'qualquer', valores: Array.from({ length: 101 }, (_, i) => `v${i}`) },
      'Escolha até 100 opções.',
    ],
    [{ chave: 'a', operador: 'em', local: '' }, 'Escolha um local.'],
    [{ chave: 'a', operador: 'igual', local: ' ' }, 'Escolha um local.'],
    [{ chave: 'a', operador: 'situacao', situacao: 'quebrados' }, 'Escolha uma situação da lista.'],
  ])('recusa o filtro %j', (filtro, erro) => {
    expect(lerDefinicaoDaVisao({ colunas: [], ordenacao: null, filtros: [filtro] })).toEqual({
      ok: false,
      erro,
    });
  });

  it('aceita o filtro do local sem os de dentro (change relacoes-vivas, decisão 3)', () => {
    const filtros = [{ chave: 'ativo.local', operador: 'igual', local: LOCAL }];
    expect(lerDefinicaoDaVisao({ colunas: [], ordenacao: null, filtros })).toEqual({
      ok: true,
      definicao: { colunas: [], ordenacao: null, filtros },
    });
  });

  it('tira os espaços das bordas do texto do filtro', () => {
    const lida = lerDefinicaoDaVisao({
      colunas: [],
      ordenacao: null,
      filtros: [{ chave: 'a', operador: 'contem', texto: '  almox ' }],
    });
    expect(lida.ok && lida.definicao.filtros).toEqual([
      { chave: 'a', operador: 'contem', texto: 'almox' },
    ]);
  });

  it('recusa a definição maior que 32 KB', () => {
    const colunas = Array.from({ length: 60 }, (_, i) => ({ chave: `${'x'.repeat(600)}${i}` }));
    expect(lerDefinicaoDaVisao({ colunas, ordenacao: null, filtros: [] })).toEqual({
      ok: false,
      erro: 'A visão passou do tamanho permitido.',
    });
  });
});

describe('os filtros de cada coluna', () => {
  it('os operadores conforme o filtro da coluna e se ela pode ficar vazia', () => {
    expect(operadoresDa(colunaDa('ativo.patrimonio'))).toEqual(['contem', 'vazio', 'preenchido']);
    expect(operadoresDa(colunaDa('ativo.valor-de-compra'))).toEqual([
      'entre',
      'vazio',
      'preenchido',
    ]);
    expect(operadoresDa(colunaDa('ativo.criado-em'))).toEqual(['entre']);
    expect(operadoresDa(colunaDa('ativo.tipo'))).toEqual(['qualquer']);
    expect(operadoresDa(colunaDa('ativo.local'))).toEqual(['em', 'igual', 'vazio', 'preenchido']);
    expect(operadoresDa(colunaDa('ativo.situacao'))).toEqual(['situacao']);
    expect(operadoresDa(colunaDa('ativo.outro'))).toEqual(['vazio', 'preenchido']);
  });

  it('aceita o filtro que vale para a coluna', () => {
    expect(
      conferirFiltro(
        { chave: 'ativo.valor-de-compra', operador: 'entre', de: 10, ate: 20 },
        colunaDa('ativo.valor-de-compra'),
      ),
    ).toBeNull();
    expect(
      conferirFiltro(
        { chave: 'ativo.garantia', operador: 'entre', de: '2026-01-01' },
        colunaDa('ativo.garantia'),
      ),
    ).toBeNull();
    expect(
      conferirFiltro(
        { chave: 'ativo.local', operador: 'em', local: LOCAL },
        colunaDa('ativo.local'),
      ),
    ).toBeNull();
    expect(
      conferirFiltro({ chave: 'ativo.outro', operador: 'preenchido' }, colunaDa('ativo.outro')),
    ).toBeNull();
    expect(
      conferirFiltro(
        { chave: 'ativo.local', operador: 'igual', local: LOCAL },
        colunaDa('ativo.local'),
      ),
    ).toBeNull();
  });

  it('recusa o local que não é um id, com ou sem os de dentro', () => {
    for (const operador of ['em', 'igual'] as const) {
      expect(
        conferirFiltro(
          { chave: 'ativo.local', operador, local: 'Jundiaí' },
          colunaDa('ativo.local'),
        ),
      ).toBe('Escolha um local.');
    }
  });

  it('recusa o operador que a coluna não tem', () => {
    expect(conferirFiltro({ chave: 'ativo.tipo', operador: 'vazio' }, colunaDa('ativo.tipo'))).toBe(
      'Este filtro não vale para a coluna Tipo.',
    );
    expect(
      conferirFiltro(
        { chave: 'ativo.local', operador: 'contem', texto: 'x' },
        colunaDa('ativo.local'),
      ),
    ).toBe('Este filtro não vale para a coluna Local.');
  });

  it('confere o intervalo pelo filtro da coluna: números num, datas na outra', () => {
    expect(
      conferirFiltro(
        { chave: 'ativo.valor-de-compra', operador: 'entre', de: '2026-01-01' },
        colunaDa('ativo.valor-de-compra'),
      ),
    ).toBe('Use um número.');
    expect(
      conferirFiltro(
        { chave: 'ativo.garantia', operador: 'entre', de: 10 },
        colunaDa('ativo.garantia'),
      ),
    ).toBe('Use uma data válida.');
    expect(
      conferirFiltro(
        { chave: 'ativo.garantia', operador: 'entre', ate: '2026-02-31' },
        colunaDa('ativo.garantia'),
      ),
    ).toBe('Use uma data válida.');
    expect(
      conferirFiltro(
        { chave: 'ativo.criado-em', operador: 'entre', de: '31/12/2026' },
        colunaDa('ativo.criado-em'),
      ),
    ).toBe('Use uma data válida.');
  });

  it('recusa o início depois do fim', () => {
    expect(
      conferirFiltro(
        { chave: 'ativo.valor-de-compra', operador: 'entre', de: 20, ate: 10 },
        colunaDa('ativo.valor-de-compra'),
      ),
    ).toBe('O início vem depois do fim.');
    expect(
      conferirFiltro(
        { chave: 'ativo.garantia', operador: 'entre', de: '2026-12-31', ate: '2026-01-01' },
        colunaDa('ativo.garantia'),
      ),
    ).toBe('O início vem depois do fim.');
  });

  it('recusa o local que não é um identificador', () => {
    expect(
      conferirFiltro(
        { chave: 'ativo.local', operador: 'em', local: 'jundiai' },
        colunaDa('ativo.local'),
      ),
    ).toBe('Escolha um local.');
  });
});

describe('a definição aplicada às colunas disponíveis', () => {
  const comTensao: DefinicaoDaVisao = {
    colunas: [{ chave: 'ativo.patrimonio' }, { chave: TENSAO, largura: 120 }],
    ordenacao: { chave: TENSAO, direcao: 'crescente' },
    filtros: [
      { chave: TENSAO, operador: 'contem', texto: '220' },
      { chave: 'ativo.patrimonio', operador: 'contem', texto: 'PAT' },
    ],
  };

  it('tira a coluna, o filtro e a ordem que deixaram de valer, e põe a principal primeiro', () => {
    expect(aplicarAColunas(comTensao, COLUNAS)).toEqual({
      colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.patrimonio' }],
      ordenacao: null,
      filtros: [{ chave: 'ativo.patrimonio', operador: 'contem', texto: 'PAT' }],
    });
  });

  it('a coluna volta quando vale de novo, porque a definição não muda', () => {
    aplicarAColunas(comTensao, COLUNAS);
    const comCampo = [...COLUNAS, coluna(TENSAO, { rotulo: 'Tensão' })];
    expect(aplicarAColunas(comTensao, comCampo)).toEqual({
      colunas: [
        { chave: 'ativo.rotulo' },
        { chave: 'ativo.patrimonio' },
        { chave: TENSAO, largura: 120 },
      ],
      ordenacao: { chave: TENSAO, direcao: 'crescente' },
      filtros: comTensao.filtros,
    });
  });

  it('leva a principal para o primeiro lugar quando ela está em outro', () => {
    const aplicada = aplicarAColunas(
      {
        colunas: [{ chave: 'ativo.local' }, { chave: 'ativo.rotulo', largura: 300 }],
        ordenacao: null,
        filtros: [],
      },
      COLUNAS,
    );
    expect(aplicada.colunas).toEqual([
      { chave: 'ativo.rotulo', largura: 300 },
      { chave: 'ativo.local' },
    ]);
  });

  it('tira a ordem pela coluna que não ordena e o filtro com o operador que ela não tem', () => {
    const aplicada = aplicarAColunas(
      {
        colunas: [{ chave: 'ativo.outro' }],
        ordenacao: { chave: 'ativo.outro', direcao: 'crescente' },
        filtros: [{ chave: 'ativo.tipo', operador: 'vazio' }],
      },
      COLUNAS,
    );
    expect(aplicada).toEqual({
      colunas: [{ chave: 'ativo.rotulo' }, { chave: 'ativo.outro' }],
      ordenacao: null,
      filtros: [],
    });
  });

  it('a ordem e o filtro valem por uma coluna disponível mesmo fora da vista', () => {
    const aplicada = aplicarAColunas(
      {
        colunas: [{ chave: 'ativo.rotulo' }],
        ordenacao: { chave: 'ativo.criado-em', direcao: 'decrescente' },
        filtros: [{ chave: 'ativo.situacao', operador: 'situacao', situacao: 'ativos' }],
      },
      COLUNAS,
    );
    expect(aplicada.ordenacao).toEqual({ chave: 'ativo.criado-em', direcao: 'decrescente' });
    expect(aplicada.filtros).toHaveLength(1);
  });

  it('a mesma visão aplicada duas vezes não fica alterada', () => {
    expect(
      mesmaDefinicao(aplicarAColunas(comTensao, COLUNAS), aplicarAColunas(comTensao, COLUNAS)),
    ).toBe(true);
  });
});

describe('a comparação de duas definições', () => {
  const contemX: FiltroDaVisao = { chave: 'a', operador: 'contem', texto: 'x' };
  const base: DefinicaoDaVisao = {
    colunas: [{ chave: 'a' }, { chave: 'b', largura: 100 }],
    ordenacao: { chave: 'a', direcao: 'crescente' },
    filtros: [contemX, { chave: 'b', operador: 'qualquer', valores: ['1', '2'] }],
  };

  it('os mesmos filtros em outra ordem são a mesma definição', () => {
    expect(mesmaDefinicao(base, { ...base, filtros: [...base.filtros].reverse() })).toBe(true);
  });

  it('a largura, a ordem das colunas, a ordenação e um filtro mudam a definição', () => {
    expect(
      mesmaDefinicao(base, { ...base, colunas: [{ chave: 'a' }, { chave: 'b', largura: 120 }] }),
    ).toBe(false);
    expect(
      mesmaDefinicao(base, { ...base, colunas: [{ chave: 'b', largura: 100 }, { chave: 'a' }] }),
    ).toBe(false);
    expect(
      mesmaDefinicao(base, { ...base, ordenacao: { chave: 'a', direcao: 'decrescente' } }),
    ).toBe(false);
    expect(mesmaDefinicao(base, { ...base, ordenacao: null })).toBe(false);
    expect(mesmaDefinicao(base, { ...base, filtros: [contemX] })).toBe(false);
    expect(
      mesmaDefinicao(base, {
        ...base,
        filtros: [contemX, { chave: 'b', operador: 'qualquer', valores: ['2', '1'] }],
      }),
    ).toBe(false);
  });
});

describe('o que mudou entre duas definições', () => {
  const contemX: FiltroDaVisao = { chave: 'a', operador: 'contem', texto: 'x' };
  const salva: DefinicaoDaVisao = {
    colunas: [{ chave: 'a' }, { chave: 'b', largura: 100 }],
    ordenacao: { chave: 'a', direcao: 'crescente' },
    filtros: [contemX],
  };

  it('nada, quando a tabela é a visão salva', () => {
    expect(partesQueMudaram(salva, { ...salva, filtros: [contemX] })).toEqual([]);
  });

  it('as colunas, pela coluna nova, pela ordem delas ou pela largura', () => {
    expect(
      partesQueMudaram(salva, { ...salva, colunas: [...salva.colunas, { chave: 'c' }] }),
    ).toEqual(['colunas']);
    expect(partesQueMudaram(salva, { ...salva, colunas: [...salva.colunas].reverse() })).toEqual([
      'colunas',
    ]);
    expect(
      partesQueMudaram(salva, {
        ...salva,
        colunas: [
          { chave: 'a', largura: 300 },
          { chave: 'b', largura: 100 },
        ],
      }),
    ).toEqual(['colunas']);
  });

  it('as colunas, a ordem e os filtros, nessa ordem', () => {
    expect(
      partesQueMudaram(salva, {
        colunas: [{ chave: 'a' }],
        ordenacao: null,
        filtros: [],
      }),
    ).toEqual(['colunas', 'ordem', 'filtros']);
    expect(
      partesQueMudaram(salva, { ...salva, ordenacao: { chave: 'a', direcao: 'decrescente' } }),
    ).toEqual(['ordem']);
  });
});

describe('o nome da visão', () => {
  it('tira os espaços das bordas e aceita até 60 caracteres', () => {
    expect(lerNomeDaVisao('  Impressoras de Jundiaí ')).toEqual({
      ok: true,
      nome: 'Impressoras de Jundiaí',
    });
    expect(lerNomeDaVisao('x'.repeat(60))).toEqual({ ok: true, nome: 'x'.repeat(60) });
  });

  it('recusa o nome vazio e o longo demais', () => {
    expect(lerNomeDaVisao('   ')).toEqual({ ok: false, erro: 'Dê um nome à visão.' });
    expect(lerNomeDaVisao('x'.repeat(61))).toEqual({ ok: false, erro: 'Use até 60 caracteres.' });
    expect(lerNomeDaVisao(42)).toEqual({ ok: false, erro: 'Dê um nome à visão.' });
  });
});

describe('a visão que abre a tabela', () => {
  const DA_CONTA = '0199a6e0-0000-7000-8000-0000000000b1';
  const DA_ORGANIZACAO = '0199a6e0-0000-7000-8000-0000000000b2';
  const usaveis = new Set([DA_CONTA, DA_ORGANIZACAO]);

  it('a escolhida pela conta, quando ela ainda pode usá-la', () => {
    expect(visaoQueVale({ conta: DA_CONTA, organizacao: DA_ORGANIZACAO }, usaveis)).toBe(DA_CONTA);
  });

  it('a padrão da organização, quando a da conta foi removida ou a conta não escolheu', () => {
    expect(
      visaoQueVale({ conta: DA_CONTA, organizacao: DA_ORGANIZACAO }, new Set([DA_ORGANIZACAO])),
    ).toBe(DA_ORGANIZACAO);
    expect(visaoQueVale({ organizacao: DA_ORGANIZACAO }, usaveis)).toBe(DA_ORGANIZACAO);
  });

  it('a de fábrica, sem nenhuma das duas ou com as duas removidas', () => {
    expect(visaoQueVale({}, usaveis)).toBe('fabrica');
    expect(visaoQueVale({ conta: DA_CONTA, organizacao: DA_ORGANIZACAO }, new Set())).toBe(
      'fabrica',
    );
  });

  it('a de fábrica escolhida pela conta fica por cima da padrão da organização', () => {
    expect(visaoQueVale({ conta: 'fabrica', organizacao: DA_ORGANIZACAO }, usaveis)).toBe(
      'fabrica',
    );
  });
});
