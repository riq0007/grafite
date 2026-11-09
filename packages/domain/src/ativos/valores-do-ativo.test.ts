import { describe, expect, it } from 'vitest';
import type { CampoNoCatalogo } from './valores-do-ativo.ts';
import { camposDoAtivo, conferirValoresDoAtivo } from './valores-do-ativo.ts';

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
const TENSAO = campo('c-tensao', 'Tensão', { situacao: 'inativo' });
const CRITICIDADE = campo('c-criticidade', 'Criticidade', {
  tipo: 'lista',
  configuracao: {
    opcoes: [
      { id: 'op-alta', rotulo: 'Alta', situacao: 'ativa' },
      { id: 'op-media', rotulo: 'Média', situacao: 'ativa' },
      { id: 'op-baixa', rotulo: 'Baixa', situacao: 'inativa' },
    ],
  },
});
const SALA = campo('c-sala', 'Sala do rack', { grupo: 'uso' });
const CUSTO = campo('c-custo', 'Custo do contrato', { tipo: 'moeda', restrito: true });
const LAUDO = campo('c-laudo', 'Laudo técnico', { tipo: 'arquivo' });
const CAMPOS = [IP, MASCARA, TENSAO, CRITICIDADE, SALA, CUSTO, LAUDO];

const IMPRESSORA = {
  capacidades: [] as string[],
  campos: [
    { campoId: 'c-criticidade', obrigatorio: false },
    { campoId: 'c-ip', obrigatorio: true },
    { campoId: 'c-tensao', obrigatorio: false },
    { campoId: 'c-mascara', obrigatorio: false },
    { campoId: 'c-sala', obrigatorio: false },
    { campoId: 'c-custo', obrigatorio: false },
    { campoId: 'c-laudo', obrigatorio: false },
  ],
};

const COMPUTADOR = { capacidades: ['hardware.inventario'], campos: [] };

describe('camposDoAtivo', () => {
  it('agrupa os comuns, os do tipo e os das capacidades, na ordem da ficha', () => {
    const { grupos } = camposDoAtivo({ tipo: IMPRESSORA, campos: CAMPOS });
    expect(grupos.map((grupo) => [grupo.nome, grupo.campos.map((c) => c.rotulo)])).toEqual([
      ['Identificação', ['Nome', 'Patrimônio', 'Número de série', 'Hostname']],
      ['Uso', ['Situação de uso', 'Local', 'Responsável', 'Sala do rack']],
      ['Rede', ['IP', 'Máscara']],
      ['Outros', ['Criticidade', 'Custo do contrato', 'Laudo técnico']],
      [
        'Administrativo',
        [
          'Fornecedor',
          'Nota fiscal',
          'Data de compra',
          'Valor de compra',
          'Garantia até',
          'Propriedade',
          'Contrato',
          'Custo mensal',
          'Centro de custo',
          'Vida útil (meses)',
        ],
      ],
    ]);
  });

  it('cada definição diz a chave, a obrigatoriedade, a marca de restrito e a origem', () => {
    const { porChave } = camposDoAtivo({ tipo: IMPRESSORA, campos: CAMPOS });
    expect(porChave.get('c-ip')).toMatchObject({
      chave: 'c-ip',
      tipo: 'ip',
      obrigatorio: true,
      restrito: false,
      origem: 'organizacao',
    });
    expect(porChave.get('c-custo')?.restrito).toBe(true);
    expect(porChave.get('ativo.patrimonio')).toMatchObject({
      origem: 'comum',
      obrigatorio: false,
      coluna: 'patrimonio',
    });
  });

  it('o campo inativo fica fora do formulário, mas é reconhecido', () => {
    const { porChave, inativos } = camposDoAtivo({ tipo: IMPRESSORA, campos: CAMPOS });
    expect(porChave.has('c-tensao')).toBe(false);
    expect(inativos.get('c-tensao')).toBe('Tensão');
  });

  it('a capacidade ligada vira um grupo com os campos dela, antes do administrativo', () => {
    const { grupos, porChave } = camposDoAtivo({ tipo: COMPUTADOR, campos: CAMPOS });
    expect(grupos.map((grupo) => grupo.nome)).toEqual([
      'Identificação',
      'Uso',
      'Inventário de hardware',
      'Administrativo',
    ]);
    expect(grupos[2]?.campos.map((c) => c.chave)).toEqual([
      'hardware.uuid',
      'hardware.ip',
      'hardware.mac',
      'hardware.processador',
      'hardware.memoria',
      'hardware.discos',
      'software.sistema',
      'software.versao-do-sistema',
      'software.licenca-do-windows',
      'software.licenca-do-office',
      'software.antivirus',
      'software.usuario',
      'software.ultima-inicializacao',
    ]);
    expect(porChave.get('hardware.memoria')?.origem).toBe('capacidade');
  });

  it('cada grupo tem uma chave estável, que não repete entre um grupo da organização e uma capacidade com o mesmo nome', () => {
    const placa = campo('c-placa', 'Placa-mãe', { grupo: 'Inventário de hardware' });
    const { grupos } = camposDoAtivo({
      tipo: {
        capacidades: ['hardware.inventario'],
        campos: [
          { campoId: 'c-placa', obrigatorio: false },
          { campoId: 'c-criticidade', obrigatorio: false },
        ],
      },
      campos: [...CAMPOS, placa],
    });
    expect(grupos.map((grupo) => [grupo.chave, grupo.nome])).toEqual([
      ['identificacao', 'Identificação'],
      ['uso', 'Uso'],
      ['organizacao:Inventário de hardware', 'Inventário de hardware'],
      ['outros', 'Outros'],
      ['capacidade:hardware.inventario', 'Inventário de hardware'],
      ['administrativo', 'Administrativo'],
    ]);
  });
});

describe('conferirValoresDoAtivo', () => {
  const campos = camposDoAtivo({ tipo: IMPRESSORA, campos: CAMPOS });

  it('no cadastro, lê cada valor, põe o uso padrão e cobra os obrigatórios', () => {
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: {},
        pedidos: { 'ativo.patrimonio': ' PAT-00412 ', 'c-criticidade': 'alta' },
        cadastro: true,
      }),
    ).toEqual({ ok: false, erros: { 'c-ip': 'Preencha este campo.' } });
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: {},
        pedidos: { 'ativo.patrimonio': ' PAT-00412 ', 'c-criticidade': 'alta', 'c-ip': '10.0.0.5' },
        cadastro: true,
      }),
    ).toEqual({
      ok: true,
      mudancas: {
        'ativo.patrimonio': 'PAT-00412',
        'ativo.uso': 'em-uso',
        'c-criticidade': 'op-alta',
        'c-ip': '10.0.0.5',
      },
    });
  });

  it('o arquivo e a imagem não se gravam como um valor comum: vão pela ficha', () => {
    const laudo = '0199a3f0-0000-7000-8000-0000000000a1';
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: {},
        pedidos: { 'c-laudo': laudo },
        cadastro: false,
      }),
    ).toEqual({ ok: false, erros: { 'c-laudo': 'Envie o arquivo pela ficha do ativo.' } });
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'c-laudo': laudo },
        pedidos: { 'c-laudo': null },
        cadastro: false,
      }),
    ).toEqual({ ok: false, erros: { 'c-laudo': 'Envie o arquivo pela ficha do ativo.' } });
    // O valor igual ao guardado não é uma mudança, como em todo campo.
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'c-laudo': laudo },
        pedidos: { 'c-laudo': laudo },
        cadastro: false,
      }),
    ).toEqual({ ok: true, mudancas: {} });
  });

  it('recusa pela chave: a do motor, o campo fora do tipo e o inativo', () => {
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'c-ip': '10.0.0.5' },
        pedidos: {
          'c-ip': '10.0.0.300',
          'hardware.processador': 'Core i5',
          'c-tensao': '220',
          'ativo.vida-util': '700',
        },
        cadastro: false,
      }),
    ).toEqual({
      ok: false,
      erros: {
        'c-ip': expect.any(String),
        'hardware.processador': 'Este campo não é do tipo do ativo.',
        'c-tensao': 'O campo Tensão está inativo.',
        'ativo.vida-util': expect.any(String),
      },
    });
  });

  it('na edição, confere só o que foi pedido e não deixa esvaziar o obrigatório', () => {
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'c-ip': '10.0.0.5' },
        pedidos: { 'ativo.hostname': 'imp-almox-01' },
        cadastro: false,
      }),
    ).toEqual({ ok: true, mudancas: { 'ativo.hostname': 'imp-almox-01' } });
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'c-ip': '10.0.0.5' },
        pedidos: { 'c-ip': '' },
        cadastro: false,
      }),
    ).toEqual({ ok: false, erros: { 'c-ip': 'Preencha este campo.' } });
  });

  it('a situação de uso nunca fica vazia: o cadastro sem ela começa em uso', () => {
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: {},
        pedidos: { 'ativo.uso': '', 'c-ip': '10.0.0.5' },
        cadastro: true,
      }),
    ).toEqual({ ok: true, mudancas: { 'ativo.uso': 'em-uso', 'c-ip': '10.0.0.5' } });
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'ativo.uso': 'em-estoque' },
        pedidos: { 'ativo.uso': '' },
        cadastro: false,
      }),
    ).toEqual({ ok: false, erros: { 'ativo.uso': 'Preencha este campo.' } });
  });

  it('esvaziar um campo opcional é uma mudança para nada', () => {
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'ativo.hostname': 'imp-almox-01' },
        pedidos: { 'ativo.hostname': '  ' },
        cadastro: false,
      }),
    ).toEqual({ ok: true, mudancas: { 'ativo.hostname': null } });
  });

  it('o valor pedido igual ao guardado não muda nada, na forma guardada ou na digitada', () => {
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'ativo.valor-de-compra': 1234.5, 'c-criticidade': 'op-alta' },
        pedidos: { 'ativo.valor-de-compra': '1.234,50', 'c-criticidade': 'Alta' },
        cadastro: false,
      }),
    ).toEqual({ ok: true, mudancas: {} });
  });

  it('a opção inativa guardada continua, e escolhê-la de novo é recusado', () => {
    // O formulário reenviou o valor guardado: não é mudança, e não é conferido.
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'c-criticidade': 'op-baixa' },
        pedidos: { 'c-criticidade': 'op-baixa', 'ativo.nome': 'Impressora do RH' },
        cadastro: false,
      }),
    ).toEqual({ ok: true, mudancas: { 'ativo.nome': 'Impressora do RH' } });
    expect(
      conferirValoresDoAtivo({
        campos,
        atuais: { 'c-criticidade': 'op-alta' },
        pedidos: { 'c-criticidade': 'Baixa' },
        cadastro: false,
      }),
    ).toEqual({ ok: false, erros: { 'c-criticidade': 'A opção Baixa está inativa.' } });
  });
});
