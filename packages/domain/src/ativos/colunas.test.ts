import { describe, expect, it } from 'vitest';
import type { TipoDeCampo } from '../campos/tipos.ts';
import type { Capacidade } from './catalogo.ts';
import {
  type ColunaDosAtivos,
  colunasDosAtivos,
  GRUPO_DO_REGISTRO,
  GRUPO_DOS_OUTROS_TIPOS,
  type TipoNasColunas,
} from './colunas.ts';
import type { CampoNoCatalogo } from './valores-do-ativo.ts';

const IP = '0199a6e0-0000-7000-8000-0000000000f1';
const TENSAO = '0199a6e0-0000-7000-8000-0000000000f2';
const CRITICIDADE = '0199a6e0-0000-7000-8000-0000000000f3';
const SALA = '0199a6e0-0000-7000-8000-0000000000f4';
const CUSTO = '0199a6e0-0000-7000-8000-0000000000f5';
const ANTIGO = '0199a6e0-0000-7000-8000-0000000000f6';
const SOLTO = '0199a6e0-0000-7000-8000-0000000000f7';

const campo = (
  id: string,
  rotulo: string,
  tipo: TipoDeCampo,
  extras: Partial<CampoNoCatalogo> = {},
): CampoNoCatalogo => ({
  id,
  rotulo,
  tipo,
  grupo: null,
  configuracao: {},
  restrito: false,
  escrita: 'automatica',
  situacao: 'ativo',
  ...extras,
});

const CAMPOS: CampoNoCatalogo[] = [
  campo(IP, 'IP', 'ip', { grupo: 'Rede' }),
  campo(TENSAO, 'Tensão', 'texto', { situacao: 'inativo' }),
  campo(CRITICIDADE, 'Criticidade', 'lista', {
    configuracao: {
      opcoes: [
        { id: 'alta', rotulo: 'Alta', situacao: 'ativa' },
        { id: 'baixa', rotulo: 'Baixa', situacao: 'ativa' },
      ],
    },
  }),
  campo(SALA, 'Sala', 'texto', { grupo: 'uso' }),
  campo(CUSTO, 'Custo de manutenção', 'moeda', { grupo: 'Rede', restrito: true }),
  campo(ANTIGO, 'Antigo', 'texto'),
  campo(SOLTO, 'Solto', 'texto'),
];

const IMPRESSORA: TipoNasColunas = {
  situacao: 'ativo',
  capacidades: [],
  campos: [
    { campoId: IP, obrigatorio: true },
    { campoId: TENSAO, obrigatorio: false },
    { campoId: CRITICIDADE, obrigatorio: false },
    { campoId: SALA, obrigatorio: false },
    { campoId: CUSTO, obrigatorio: false },
  ],
};

const DESKTOP_ANTIGO: TipoNasColunas = {
  situacao: 'inativo',
  capacidades: ['hardware.inventario'],
  campos: [{ campoId: ANTIGO, obrigatorio: false }],
};

const TIPOS = [IMPRESSORA, DESKTOP_ANTIGO];

const chaves = (colunas: ColunaDosAtivos[]) => colunas.map((coluna) => coluna.chave);
const daChave = (colunas: ColunaDosAtivos[], chave: string) => {
  const achada = colunas.find((coluna) => coluna.chave === chave);
  if (!achada) throw new Error(`Coluna ${chave} fora da lista.`);
  return achada;
};

describe('as colunas da tabela dos ativos', () => {
  const colunas = colunasDosAtivos({ tipos: TIPOS, campos: CAMPOS, verRestritos: false });

  it('sem tipos, as do ativo, as dos campos comuns e as do registro, nos grupos, com a principal primeiro', () => {
    const semTipos = colunasDosAtivos({ tipos: [], campos: [], verRestritos: false });
    expect(chaves(semTipos)).toEqual([
      'ativo.rotulo',
      'ativo.tipo',
      'ativo.modelo',
      'ativo.patrimonio',
      'ativo.serie',
      'ativo.hostname',
      'ativo.situacao',
      'ativo.local',
      'ativo.responsavel',
      'ativo.fornecedor',
      'ativo.nota-fiscal',
      'ativo.data-de-compra',
      'ativo.valor-de-compra',
      'ativo.garantia',
      'ativo.propriedade',
      'ativo.contrato',
      'ativo.custo-mensal',
      'ativo.centro-de-custo',
      'ativo.vida-util',
      'ativo.criado-em',
      'ativo.atualizado-em',
    ]);
    expect(semTipos.filter((coluna) => coluna.principal).map((coluna) => coluna.chave)).toEqual([
      'ativo.rotulo',
    ]);
    expect([...new Set(semTipos.map((coluna) => coluna.grupo))]).toEqual([
      'Identificação',
      'Uso',
      'Administrativo',
      GRUPO_DO_REGISTRO,
    ]);
    expect(GRUPO_DO_REGISTRO).toBe('Registro');
  });

  it('as colunas do ativo, com os rótulos, o que ordenam e o filtro', () => {
    expect(daChave(colunas, 'ativo.rotulo')).toMatchObject({
      rotulo: 'Ativo',
      principal: true,
      ordena: true,
      filtro: 'texto',
      podeFicarVazia: false,
    });
    expect(daChave(colunas, 'ativo.tipo')).toMatchObject({
      rotulo: 'Tipo',
      filtro: 'escolha',
      podeFicarVazia: false,
    });
    expect(daChave(colunas, 'ativo.modelo')).toMatchObject({
      rotulo: 'Modelo',
      filtro: 'escolha',
      podeFicarVazia: true,
    });
    expect(daChave(colunas, 'ativo.situacao')).toMatchObject({
      rotulo: 'Situação',
      filtro: 'situacao',
      podeFicarVazia: false,
    });
    expect(daChave(colunas, 'ativo.criado-em')).toMatchObject({
      rotulo: 'Cadastrado em',
      filtro: 'momento',
      mono: true,
      podeFicarVazia: false,
    });
    expect(daChave(colunas, 'ativo.atualizado-em')).toMatchObject({ rotulo: 'Atualizado em' });
  });

  it('os identificadores na fonte mono, e os números à direita', () => {
    for (const chave of ['ativo.patrimonio', 'ativo.serie', 'ativo.hostname', IP]) {
      expect(daChave(colunas, chave).mono).toBe(true);
    }
    expect(daChave(colunas, 'ativo.fornecedor').mono).toBe(false);
    expect(daChave(colunas, 'ativo.valor-de-compra')).toMatchObject({
      alinhamento: 'fim',
      mono: true,
      filtro: 'numero',
    });
    expect(daChave(colunas, 'ativo.vida-util')).toMatchObject({
      alinhamento: 'fim',
      filtro: 'numero',
    });
    expect(daChave(colunas, 'ativo.garantia')).toMatchObject({
      alinhamento: 'inicio',
      filtro: 'data',
    });
  });

  it('a ordem e o filtro de cada tipo de campo', () => {
    expect(daChave(colunas, IP)).toMatchObject({ ordena: true, filtro: 'texto' });
    expect(daChave(colunas, 'ativo.local')).toMatchObject({ ordena: true, filtro: 'local' });
    expect(daChave(colunas, 'ativo.responsavel')).toMatchObject({
      ordena: true,
      filtro: 'escolha',
    });
    expect(daChave(colunas, 'ativo.propriedade')).toMatchObject({
      ordena: true,
      filtro: 'escolha',
    });
    expect(daChave(colunas, CRITICIDADE)).toMatchObject({ ordena: true, filtro: 'escolha' });
    const outros = colunasDosAtivos({
      tipos: [
        {
          situacao: 'ativo',
          capacidades: [],
          campos: [
            { campoId: 'multi', obrigatorio: false },
            { campoId: 'monitor', obrigatorio: false },
            { campoId: 'laudo', obrigatorio: false },
            { campoId: 'foto', obrigatorio: false },
          ],
        },
      ],
      campos: [
        campo('multi', 'Áreas', 'lista-multipla'),
        campo('monitor', 'Monitor', 'ativo'),
        campo('laudo', 'Laudo técnico', 'arquivo'),
        campo('foto', 'Foto da etiqueta', 'imagem'),
      ],
      verRestritos: false,
    });
    expect(daChave(outros, 'multi')).toMatchObject({ ordena: false, filtro: 'escolha' });
    for (const chave of ['monitor', 'laudo', 'foto']) {
      expect(daChave(outros, chave)).toMatchObject({
        ordena: false,
        filtro: null,
        podeFicarVazia: true,
      });
    }
  });

  it('os campos da organização ativos que um tipo ativo usa, nos grupos deles', () => {
    expect(chaves(colunas)).toContain(IP);
    expect(chaves(colunas)).toContain(CRITICIDADE);
    // Inativo, usado só por um tipo inativo, e fora de todo tipo.
    expect(chaves(colunas)).not.toContain(TENSAO);
    expect(chaves(colunas)).not.toContain(ANTIGO);
    expect(chaves(colunas)).not.toContain(SOLTO);
    expect(daChave(colunas, IP).grupo).toBe('Rede');
    expect(daChave(colunas, CRITICIDADE).grupo).toBe('Outros');
  });

  it('o campo num grupo com o nome de um grupo comum entra nele, depois dos comuns', () => {
    const doUso = colunas.filter((coluna) => coluna.grupo === 'Uso').map((coluna) => coluna.chave);
    expect(doUso).toEqual(['ativo.situacao', 'ativo.local', 'ativo.responsavel', SALA]);
  });

  it('a ordem dos grupos: os comuns, os da organização, "Outros", as capacidades, o administrativo e o registro', () => {
    const comCapacidade = colunasDosAtivos({
      tipos: [{ ...IMPRESSORA, capacidades: ['hardware.inventario'] }],
      campos: CAMPOS,
      verRestritos: false,
    });
    expect([...new Set(comCapacidade.map((coluna) => coluna.grupo))]).toEqual([
      'Identificação',
      'Uso',
      'Rede',
      'Outros',
      'Inventário de hardware',
      'Administrativo',
      'Registro',
    ]);
  });

  it('os campos das capacidades ligadas a um tipo ativo, com a chave fixa', () => {
    expect(chaves(colunas).filter((chave) => chave.startsWith('hardware.'))).toEqual([]);
    const capacidades: Capacidade[] = [
      {
        chave: 'teste.capacidade',
        nome: 'Teste',
        descricao: '',
        campos: [
          {
            chave: 'teste.memoria',
            rotulo: 'Memória',
            tipo: 'inteiro',
            grupo: 'Hardware',
            configuracao: {},
            escrita: 'automatica',
          },
        ],
      },
    ];
    const comCapacidade = colunasDosAtivos({
      tipos: [{ situacao: 'ativo', capacidades: ['teste.capacidade'], campos: [] }],
      campos: [],
      capacidades,
      verRestritos: false,
    });
    expect(daChave(comCapacidade, 'teste.memoria')).toMatchObject({
      rotulo: 'Memória',
      grupo: 'Teste',
      filtro: 'numero',
      alinhamento: 'fim',
    });
  });

  it('o campo restrito só para quem vê os restritos, marcado como restrito', () => {
    expect(chaves(colunas)).not.toContain(CUSTO);
    const comRestritos = colunasDosAtivos({ tipos: TIPOS, campos: CAMPOS, verRestritos: true });
    expect(daChave(comRestritos, CUSTO)).toMatchObject({ restrita: true, grupo: 'Rede' });
    expect(daChave(comRestritos, IP).restrita).toBeFalsy();
  });

  it('cada campo leva o tipo e a configuração, para mostrar o valor pelo motor de campos', () => {
    expect(daChave(colunas, CRITICIDADE).campo).toEqual({
      tipo: 'lista',
      configuracao: CAMPOS[2]?.configuracao,
    });
    expect(daChave(colunas, 'ativo.propriedade').campo?.tipo).toBe('lista');
    expect(daChave(colunas, 'ativo.rotulo').campo).toBeUndefined();
  });

  it('as chaves são únicas e cada coluna tem uma largura padrão entre 64 e 800 px', () => {
    const comRestritos = colunasDosAtivos({ tipos: TIPOS, campos: CAMPOS, verRestritos: true });
    expect(new Set(chaves(comRestritos)).size).toBe(comRestritos.length);
    for (const coluna of comRestritos) {
      expect(coluna.largura).toBeGreaterThanOrEqual(64);
      expect(coluna.largura).toBeLessThanOrEqual(800);
    }
  });
});

// Os painéis de filtros e de colunas com um filtro de Tipo (change filtros-e-barra-da-tabela,
// design, decisão 4): primeiro os grupos dos tipos filtrados, depois os comuns, e os campos dos
// outros tipos por último, em "Outros tipos".
describe('as colunas pelos tipos filtrados', () => {
  const COM_ID: TipoNasColunas = { ...IMPRESSORA, id: 'impressora' };
  const NOTEBOOK: TipoNasColunas = {
    id: 'notebook',
    situacao: 'ativo',
    capacidades: ['hardware.inventario'],
    campos: [{ campoId: SOLTO, obrigatorio: false }],
  };
  const TIPOS_COM_ID = [COM_ID, NOTEBOOK];
  const grupos = (colunas: ColunaDosAtivos[]) => [
    ...new Set(colunas.map((coluna) => coluna.grupo)),
  ];

  it('sem tipo filtrado, a ordem de sempre', () => {
    const deSempre = colunasDosAtivos({ tipos: TIPOS_COM_ID, campos: CAMPOS, verRestritos: true });
    expect(
      colunasDosAtivos({
        tipos: TIPOS_COM_ID,
        campos: CAMPOS,
        verRestritos: true,
        tiposFiltrados: [],
      }),
    ).toEqual(deSempre);
  });

  it('os grupos do tipo filtrado primeiro, depois os comuns, e os dos outros tipos por último', () => {
    const colunas = colunasDosAtivos({
      tipos: TIPOS_COM_ID,
      campos: CAMPOS,
      verRestritos: true,
      tiposFiltrados: ['impressora'],
    });
    expect(grupos(colunas)).toEqual([
      'Rede',
      'Outros',
      'Identificação',
      'Uso',
      'Administrativo',
      GRUPO_DO_REGISTRO,
      GRUPO_DOS_OUTROS_TIPOS,
    ]);
    // O campo do tipo num grupo comum fica nele; o do notebook e a capacidade dele vão ao fim.
    expect(daChave(colunas, SALA).grupo).toBe('Uso');
    expect(daChave(colunas, SOLTO).grupo).toBe(GRUPO_DOS_OUTROS_TIPOS);
    expect(daChave(colunas, 'hardware.memoria').grupo).toBe(GRUPO_DOS_OUTROS_TIPOS);
    // Nenhuma coluna sai nem se repete.
    expect(chaves(colunas).sort()).toEqual(
      chaves(colunasDosAtivos({ tipos: TIPOS_COM_ID, campos: CAMPOS, verRestritos: true })).sort(),
    );
  });

  it('a capacidade do tipo filtrado vem com os grupos dele', () => {
    const colunas = colunasDosAtivos({
      tipos: TIPOS_COM_ID,
      campos: CAMPOS,
      verRestritos: false,
      tiposFiltrados: ['notebook'],
    });
    expect(grupos(colunas)).toEqual([
      'Outros',
      'Inventário de hardware',
      'Identificação',
      'Uso',
      'Administrativo',
      GRUPO_DO_REGISTRO,
      GRUPO_DOS_OUTROS_TIPOS,
    ]);
    expect(daChave(colunas, IP).grupo).toBe(GRUPO_DOS_OUTROS_TIPOS);
    // O campo da impressora num grupo comum, que o notebook não usa, também vai ao fim.
    expect(daChave(colunas, SALA).grupo).toBe(GRUPO_DOS_OUTROS_TIPOS);
  });
});

describe('a coluna da disponibilidade', () => {
  const comDisponibilidade: TipoNasColunas = {
    ...IMPRESSORA,
    capacidades: ['rede.disponibilidade'],
  };

  it('entra no grupo da capacidade, com as situações para escolher no filtro', () => {
    const colunas = colunasDosAtivos({
      tipos: [comDisponibilidade],
      campos: CAMPOS,
      verRestritos: false,
    });
    const disponibilidade = daChave(colunas, 'coleta.disponibilidade');
    expect(disponibilidade).toMatchObject({
      rotulo: 'Disponibilidade',
      grupo: 'Disponibilidade na rede',
      origem: 'capacidade',
      ordena: true,
      filtro: 'escolha',
      podeFicarVazia: false,
    });
    expect(
      disponibilidade.campo?.configuracao?.opcoes?.map(({ id, rotulo }) => [id, rotulo]),
    ).toEqual([
      ['online', 'Online'],
      ['offline', 'Offline'],
      ['sem-dado', 'Sem dado'],
      ['nao-verificado', 'Não verificado'],
    ]);
  });

  it('não aparece sem um tipo ativo que ligue a disponibilidade', () => {
    expect(
      chaves(colunasDosAtivos({ tipos: TIPOS, campos: CAMPOS, verRestritos: false })),
    ).not.toContain('coleta.disponibilidade');
  });
});

// As colunas coletadas numéricas (change p2b-impressoras-por-snmp, design, decisão 8).
describe('as colunas dos suprimentos e contadores', () => {
  const comSuprimentos: TipoNasColunas = { ...IMPRESSORA, capacidades: ['snmp.suprimentos'] };
  const colunas = () =>
    colunasDosAtivos({ tipos: [comSuprimentos], campos: CAMPOS, verRestritos: false });

  it('Suprimentos e Total de páginas entram no grupo da capacidade, ordenam e filtram de e até', () => {
    const suprimentos = daChave(colunas(), 'coleta.suprimentos');
    expect(suprimentos).toMatchObject({
      rotulo: 'Suprimentos',
      grupo: 'Suprimentos e contadores',
      origem: 'capacidade',
      ordena: true,
      filtro: 'numero',
      alinhamento: 'fim',
      mono: true,
      podeFicarVazia: true,
      unidade: '%',
      campo: { tipo: 'inteiro', configuracao: {} },
    });
    const paginas = daChave(colunas(), 'coleta.paginas');
    expect(paginas).toMatchObject({
      rotulo: 'Total de páginas',
      grupo: 'Suprimentos e contadores',
      filtro: 'numero',
      ordena: true,
    });
    expect(paginas.unidade).toBeUndefined();
  });

  it('não aparecem sem um tipo ativo que ligue os suprimentos e contadores', () => {
    const lista = chaves(colunasDosAtivos({ tipos: TIPOS, campos: CAMPOS, verRestritos: false }));
    expect(lista).not.toContain('coleta.suprimentos');
    expect(lista).not.toContain('coleta.paginas');
  });
});

// As larguras de fábrica das colunas da coleta (spec componentes-base, "Célula numa linha só";
// change celulas-numa-linha, design, decisão 4): a largura que mostra o conteúdo do dia a dia sem
// corte, medida na história "Larguras que a coleta pede" do catálogo do @grafite/ui.
describe('as larguras de fábrica das colunas da coleta', () => {
  const comAColeta: TipoNasColunas = {
    ...IMPRESSORA,
    capacidades: ['rede.disponibilidade', 'snmp.suprimentos', 'controlid.saude'],
  };

  it('cada coluna nasce com a largura que mostra a situação e a idade sem corte', () => {
    const colunas = colunasDosAtivos({ tipos: [comAColeta], campos: CAMPOS, verRestritos: false });
    const daColeta = colunas.filter(({ chave }) => chave.startsWith('coleta.'));
    expect(Object.fromEntries(daColeta.map(({ chave, largura }) => [chave, largura]))).toEqual({
      'coleta.disponibilidade': 210,
      'coleta.suprimentos': 340,
      'coleta.paginas': 190,
      'coleta.control-id': 280,
    });
  });

  // A tabela divide a sobra entre as colunas sem largura guardada (spec componentes-base, "Tabela
  // na largura toda"): a coluna da coleta declara a largura que o conteúdo pede, para a divisão não
  // a deixar mais estreita.
  it('cada coluna da coleta declara a largura de fábrica como a que o conteúdo pede', () => {
    const colunas = colunasDosAtivos({ tipos: [comAColeta], campos: CAMPOS, verRestritos: false });
    const daColeta = colunas.filter(({ chave }) => chave.startsWith('coleta.'));
    expect(daColeta).toHaveLength(4);
    for (const coluna of daColeta) expect(coluna.larguraMinima).toBe(coluna.largura);
  });

  it('as outras colunas não declaram largura do conteúdo: seguem o mínimo da divisão', () => {
    const colunas = colunasDosAtivos({ tipos: [comAColeta], campos: CAMPOS, verRestritos: false });
    const outras = colunas.filter(({ chave }) => !chave.startsWith('coleta.'));
    expect(outras.length).toBeGreaterThan(0);
    for (const coluna of outras) expect(coluna.larguraMinima).toBeUndefined();
  });
});
