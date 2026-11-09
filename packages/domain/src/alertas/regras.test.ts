import { describe, expect, it } from 'vitest';
import {
  CONDICOES_DE_ALERTA,
  condicaoDe,
  conferirRegra,
  PARAMETROS_INICIAIS,
  ROTULOS_DAS_SEVERIDADES,
} from './regras.ts';

/** Uma regra válida do toner, para cada caso mudar só o que testa. */
const doToner = (mudancas: Record<string, unknown> = {}) => ({
  nome: 'Toner em 10% ou menos',
  condicao: 'toner.nivel',
  parametros: { limite: 10, folga: 5 },
  duracao: 0,
  severidade: 'critico',
  escopo: { tipo: 'organizacao', id: null },
  ...mudancas,
});

const erros = (entrada: Record<string, unknown>, opcoes?: Parameters<typeof conferirRegra>[1]) => {
  const conferida = conferirRegra(entrada, opcoes);
  return conferida.ok ? {} : conferida.erros;
};

describe('condições de alerta', () => {
  it('as seis, com o rótulo, o alvo, a capacidade e se aceitam a duração', () => {
    expect(
      CONDICOES_DE_ALERTA.map(({ chave, rotulo, alvo, capacidade, comDuracao }) => [
        chave,
        rotulo,
        alvo,
        capacidade,
        comDuracao,
      ]),
    ).toEqual([
      ['rede.offline', 'Ativo offline', 'ativo', 'rede.disponibilidade', true],
      ['toner.nivel', 'Nível do toner', 'ativo', 'snmp.suprimentos', true],
      ['impressora.condicao', 'Condição da impressora', 'ativo', 'snmp.suprimentos', true],
      ['controlid.situacao', 'Saúde do Control iD', 'ativo', 'controlid.saude', true],
      ['coleta.atrasada', 'Coleta atrasada', 'ativo', null, false],
      ['coletor.sem-contato', 'Coletor sem contato', 'coletor', null, false],
    ]);
    expect(condicaoDe('toner.nivel')?.rotulo).toBe('Nível do toner');
    expect(condicaoDe('outra')).toBeUndefined();
  });

  it('as severidades em texto', () => {
    expect(ROTULOS_DAS_SEVERIDADES).toEqual({
      critico: 'Crítico',
      atencao: 'Atenção',
      info: 'Informação',
    });
  });

  it('os parâmetros com que o formulário começa cada condição', () => {
    expect(PARAMETROS_INICIAIS).toEqual({
      'rede.offline': {},
      'toner.nivel': { limite: 10, folga: 5 },
      'impressora.condicao': { condicoes: [] },
      'controlid.situacao': { situacoes: [] },
      'coleta.atrasada': { ciclos: 3 },
      'coletor.sem-contato': { minutos: 10 },
    });
  });
});

describe('conferência da regra', () => {
  it('aceita a regra válida, com o nome sem os espaços das pontas', () => {
    const conferida = conferirRegra(doToner({ nome: '  Toner em 10% ou menos ' }));
    expect(conferida).toEqual({
      ok: true,
      dados: {
        nome: 'Toner em 10% ou menos',
        condicao: 'toner.nivel',
        parametros: { limite: 10, folga: 5 },
        duracao: 0,
        severidade: 'critico',
        escopo: { tipo: 'organizacao', id: null },
        excecoes: [],
      },
    });
  });

  it('recusa o nome vazio e o longo', () => {
    expect(erros(doToner({ nome: '  ' }))).toEqual({ nome: 'Informe o nome da regra.' });
    expect(erros(doToner({ nome: 'x'.repeat(81) }))).toEqual({
      nome: 'Use até 80 caracteres no nome.',
    });
  });

  it('recusa a condição desconhecida e a severidade desconhecida', () => {
    expect(erros(doToner({ condicao: 'cpu.uso' }))).toEqual({ condicao: 'Escolha a condição.' });
    expect(erros(doToner({ severidade: 'grave' }))).toEqual({
      severidade: 'Escolha a severidade.',
    });
  });

  it('confere o limite e a folga do toner', () => {
    expect(erros(doToner({ parametros: { limite: 120, folga: 5 } }))).toEqual({
      limite: 'Informe um limite de 1 a 99%.',
    });
    expect(erros(doToner({ parametros: { limite: 0, folga: 5 } }))).toEqual({
      limite: 'Informe um limite de 1 a 99%.',
    });
    expect(erros(doToner({ parametros: { limite: 10.5, folga: 5 } }))).toEqual({
      limite: 'Informe um limite de 1 a 99%.',
    });
    expect(erros(doToner({ parametros: { limite: 10, folga: 51 } }))).toEqual({
      folga: 'Informe uma folga de 0 a 50 pontos.',
    });
    expect(erros(doToner({ parametros: { limite: 60, folga: 40 } }))).toEqual({
      folga: 'O limite mais a folga precisa ficar abaixo de 100%.',
    });
  });

  it('confere as condições da impressora', () => {
    const daImpressora = (condicoes: unknown) =>
      doToner({ condicao: 'impressora.condicao', parametros: { condicoes } });
    expect(erros(daImpressora([]))).toEqual({ condicoes: 'Escolha ao menos uma condição.' });
    expect(erros(daImpressora(['sem-papel', 'pegando-fogo']))).toEqual({
      condicoes: 'Condição desconhecida: pegando-fogo.',
    });
    const conferida = conferirRegra(daImpressora(['tampa-aberta', 'sem-papel', 'sem-papel']));
    // Sem repetir e na ordem do catálogo da impressora.
    expect(conferida.ok && conferida.dados.parametros).toEqual({
      condicoes: ['sem-papel', 'tampa-aberta'],
    });
  });

  it('confere as situações do Control iD', () => {
    const doControle = (situacoes: unknown) =>
      doToner({ condicao: 'controlid.situacao', parametros: { situacoes } });
    expect(erros(doControle([]))).toEqual({ situacoes: 'Escolha ao menos uma situação.' });
    expect(erros(doControle(['respondendo']))).toEqual({
      situacoes: 'Situação desconhecida: respondendo.',
    });
    const conferida = conferirRegra(doControle(['resposta-inesperada', 'login-recusado']));
    expect(conferida.ok && conferida.dados.parametros).toEqual({
      situacoes: ['login-recusado', 'resposta-inesperada'],
    });
  });

  it('confere os ciclos da coleta atrasada e os minutos do coletor, sem a duração', () => {
    const atrasada = (ciclos: unknown, duracao = 0) =>
      doToner({ condicao: 'coleta.atrasada', parametros: { ciclos }, duracao });
    expect(erros(atrasada(1))).toEqual({ ciclos: 'Informe de 2 a 20 ciclos.' });
    expect(erros(atrasada(21))).toEqual({ ciclos: 'Informe de 2 a 20 ciclos.' });
    // A duração não vale para a coleta atrasada: fica 0, sem erro.
    const conferida = conferirRegra(atrasada(3, 15));
    expect(conferida.ok && conferida.dados.duracao).toBe(0);

    const doColetor = (minutos: unknown) =>
      doToner({ condicao: 'coletor.sem-contato', parametros: { minutos } });
    expect(erros(doColetor(4))).toEqual({ minutos: 'Informe de 5 a 1.440 minutos.' });
    expect(erros(doColetor(1441))).toEqual({ minutos: 'Informe de 5 a 1.440 minutos.' });
    expect(conferirRegra(doColetor(10)).ok).toBe(true);
  });

  it('confere a duração das condições que a aceitam', () => {
    expect(erros(doToner({ duracao: -1 }))).toEqual({
      duracao: 'Informe uma duração de 0 a 1.440 minutos.',
    });
    expect(erros(doToner({ duracao: 1441 }))).toEqual({
      duracao: 'Informe uma duração de 0 a 1.440 minutos.',
    });
    expect(conferirRegra(doToner({ duracao: 1440 })).ok).toBe(true);
  });

  it('confere o escopo, com o registro escolhido em cada tipo', () => {
    const id = '0199d3a0-0000-7000-8000-000000000001';
    expect(erros(doToner({ escopo: { tipo: 'planeta', id } }))).toEqual({
      escopo: 'Escolha o escopo.',
    });
    expect(erros(doToner({ escopo: { tipo: 'tipo', id: null } }))).toEqual({
      escopo: 'Escolha um tipo ativo.',
    });
    expect(erros(doToner({ escopo: { tipo: 'modelo', id: 'x' } }))).toEqual({
      escopo: 'Escolha um modelo ativo.',
    });
    expect(erros(doToner({ escopo: { tipo: 'ativo' } }))).toEqual({
      escopo: 'Escolha um ativo que não esteja inativo.',
    });
    expect(erros(doToner({ escopo: { tipo: 'local', id: null } }))).toEqual({
      escopo: 'Escolha um local ativo.',
    });
    const conferida = conferirRegra(doToner({ escopo: { tipo: 'local', id } }));
    expect(conferida.ok && conferida.dados.escopo).toEqual({ tipo: 'local', id });
    // A organização inteira não tem id, mesmo que venha um.
    const daOrganizacao = conferirRegra(doToner({ escopo: { tipo: 'organizacao', id } }));
    expect(daOrganizacao.ok && daOrganizacao.dados.escopo).toEqual({
      tipo: 'organizacao',
      id: null,
    });
  });

  it('a regra do coletor vale para a organização inteira', () => {
    expect(
      erros(
        doToner({
          condicao: 'coletor.sem-contato',
          parametros: { minutos: 10 },
          escopo: { tipo: 'tipo', id: '0199d3a0-0000-7000-8000-000000000001' },
        }),
      ),
    ).toEqual({ escopo: 'A regra do coletor vale para a organização inteira.' });
  });

  it('a condição de uma regra que existe não muda', () => {
    expect(
      erros(doToner({ condicao: 'rede.offline', parametros: {} }), {
        condicaoAtual: 'toner.nivel',
      }),
    ).toEqual({ condicao: 'A condição de uma regra não muda: cadastre outra regra.' });
    expect(conferirRegra(doToner(), { condicaoAtual: 'toner.nivel' }).ok).toBe(true);
  });

  it('junta os erros de vários campos', () => {
    expect(
      erros(doToner({ nome: '', parametros: { limite: 0, folga: 99 }, severidade: null })),
    ).toEqual({
      nome: 'Informe o nome da regra.',
      limite: 'Informe um limite de 1 a 99%.',
      folga: 'Informe uma folga de 0 a 50 pontos.',
      severidade: 'Escolha a severidade.',
    });
  });
});
