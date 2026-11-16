import { describe, expect, it } from 'vitest';
import {
  AVISO_DO_ALCANCE,
  type ChamadoNaCarga,
  type ColunaDaCarga,
  type ContaNaCarga,
  cargaDasPessoas,
  type PedidoDaCarga,
  saudacao,
  textoDoResolvidoHoje,
  textoDosAbertos,
} from './carga.ts';

/**
 * O instante no relógio de São Paulo, que não tem horário de verão desde 2019 (UTC−3). Nos
 * mockups, hoje é terça, 17/11/2026.
 */
const sp = (dataHora: string) => new Date(`${dataHora}:00-03:00`);

const JUNDIAI = 'local-jundiai';
const CAMPINAS = 'local-campinas';
const AGORA = sp('2026-11-17T10:00');

const ANA: ContaNaCarga = {
  id: 'conta-ana',
  nome: 'Ana Souza',
  ativa: true,
  alcance: 'organizacao',
};
const BRUNO: ContaNaCarga = {
  id: 'conta-bruno',
  nome: 'Bruno Lima',
  ativa: true,
  alcance: new Set([CAMPINAS]),
};
const DIEGO: ContaNaCarga = {
  id: 'conta-diego',
  nome: 'Diego Martins',
  ativa: true,
  alcance: new Set([JUNDIAI, CAMPINAS]),
};
/** Renato atendia Campinas e Jundiaí e perdeu Jundiaí. */
const RENATO: ContaNaCarga = {
  id: 'conta-renato',
  nome: 'Renato Alves',
  ativa: true,
  alcance: new Set([CAMPINAS]),
};
/** Carla foi desativada. */
const CARLA: ContaNaCarga = {
  id: 'conta-carla',
  nome: 'Carla Mendes',
  ativa: false,
  alcance: 'organizacao',
};

/** O chamado Em atendimento de Jundiaí, aberto às 08:00 de hoje, sem ninguém. */
function chamado(numero: number, parte: Partial<ChamadoNaCarga> = {}): ChamadoNaCarga {
  return {
    numero,
    situacao: 'em-atendimento',
    responsavel: null,
    locais: [JUNDIAI],
    semLocal: false,
    abertoEm: sp('2026-11-17T08:00'),
    resolvidoEm: null,
    resolvidoPor: null,
    ...parte,
  };
}
const com = (conta: ContaNaCarga, numero: number, parte: Partial<ChamadoNaCarga> = {}) =>
  chamado(numero, { responsavel: conta.id, ...parte });
const naTriagem = (numero: number, parte: Partial<ChamadoNaCarga> = {}) =>
  chamado(numero, { situacao: 'triagem', ...parte });
const resolvidoPor = (
  conta: ContaNaCarga,
  numero: number,
  resolvidoEm: Date,
  parte: Partial<ChamadoNaCarga> = {},
) =>
  chamado(numero, {
    situacao: 'resolvido',
    responsavel: conta.id,
    resolvidoPor: conta.id,
    resolvidoEm,
    ...parte,
  });

function pedido(parte: Partial<PedidoDaCarga> = {}): PedidoDaCarga {
  return {
    contas: [ANA, BRUNO, DIEGO],
    chamados: [],
    alcanceDeQuemOlha: 'organizacao',
    cargaCheia: 5,
    agora: AGORA,
    fuso: 'America/Sao_Paulo',
    ...parte,
  };
}

/** A coluna de uma pessoa sem nenhum chamado, como a tela a recebe. */
function vazia(conta: ContaNaCarga, naoAtendeMais = false): ColunaDaCarga {
  return {
    conta: conta.id,
    nome: conta.nome,
    naoAtendeMais,
    abertos: [],
    maisAntigo: null,
    pedacos: { total: 5, cheios: 0 },
    resolvidosHoje: [],
  };
}

/** As colunas pelo nome e pela marca de quem não atende mais, para conferir a ordem. */
const ordem = (colunas: readonly ColunaDaCarga[]) =>
  colunas.map((coluna) => `${coluna.nome}${coluna.naoAtendeMais ? ' · não atende mais' : ''}`);

const colunaDe = (colunas: readonly ColunaDaCarga[], conta: ContaNaCarga, naoAtendeMais = false) =>
  colunas.find((coluna) => coluna.conta === conta.id && coluna.naoAtendeMais === naoAtendeMais);

describe('cargaDasPessoas', () => {
  it('dá uma coluna a cada pessoa da TI, pelo nome, mesmo sem chamado', () => {
    const alvaro: ContaNaCarga = {
      id: 'conta-alvaro',
      nome: 'Álvaro Nunes',
      ativa: true,
      alcance: new Set([JUNDIAI]),
    };
    const carga = cargaDasPessoas(pedido({ contas: [DIEGO, ANA, alvaro, BRUNO] }));

    expect(carga).toEqual({
      triagem: { abertos: [], maisAntigo: null },
      colunas: [vazia(alvaro), vazia(ANA), vazia(BRUNO), vazia(DIEGO)],
      resolvidosHoje: [],
      contandoSoOsLocaisQueVe: false,
    });
  });

  it('segue pelo id nos nomes iguais', () => {
    const outraAna: ContaNaCarga = { ...ANA, id: 'conta-ana-2' };
    const { colunas } = cargaDasPessoas(pedido({ contas: [outraAna, ANA] }));

    expect(colunas.map((coluna) => coluna.conta)).toEqual(['conta-ana', 'conta-ana-2']);
  });

  it('não dá coluna à conta desativada, sem o alcance ou com o alcance vazio, sem chamado aberto', () => {
    const paula: ContaNaCarga = {
      id: 'conta-paula',
      nome: 'Paula Reis',
      ativa: true,
      alcance: null,
    };
    const pedro: ContaNaCarga = {
      id: 'conta-pedro',
      nome: 'Pedro Costa',
      ativa: true,
      alcance: new Set(),
    };
    const { colunas } = cargaDasPessoas(pedido({ contas: [ANA, CARLA, paula, pedro] }));

    expect(ordem(colunas)).toEqual(['Ana Souza']);
  });

  it('conta os Em atendimento e os Aguardando o colaborador, com o mais antigo pela abertura', () => {
    const { colunas } = cargaDasPessoas(
      pedido({
        chamados: [
          com(DIEGO, 1044, { situacao: 'aguardando', abertoEm: sp('2026-11-16T17:00') }),
          com(DIEGO, 1041, { abertoEm: sp('2026-11-17T08:00') }),
          resolvidoPor(DIEGO, 1039, sp('2026-11-16T16:00'), { abertoEm: sp('2026-11-16T09:00') }),
        ],
      }),
    );

    expect(colunaDe(colunas, DIEGO)).toEqual({
      ...vazia(DIEGO),
      abertos: [1041, 1044],
      maisAntigo: { numero: 1044, abertoEm: sp('2026-11-16T17:00') },
      pedacos: { total: 5, cheios: 2 },
    });
  });

  it('enche a barra a partir da carga cheia', () => {
    const sete = [1050, 1051, 1052, 1053, 1054, 1055, 1056].map((numero) => com(DIEGO, numero));
    const { colunas } = cargaDasPessoas(pedido({ chamados: [...sete, com(ANA, 1057)] }));

    expect(colunaDe(colunas, DIEGO)?.abertos).toHaveLength(7);
    expect(colunaDe(colunas, DIEGO)?.pedacos).toEqual({ total: 5, cheios: 5 });
    expect(colunaDe(colunas, ANA)?.pedacos).toEqual({ total: 5, cheios: 1 });
    expect(textoDosAbertos(7)).toBe('7 abertos');
  });

  it('dá os pedaços da carga cheia da TI', () => {
    const { colunas } = cargaDasPessoas(
      pedido({ cargaCheia: 3, chamados: [com(ANA, 1060), com(ANA, 1061)] }),
    );

    expect(colunaDe(colunas, ANA)?.pedacos).toEqual({ total: 3, cheios: 2 });
  });

  it('conta só os chamados que quem olha vê, e avisa', () => {
    const deCampinas = { locais: [CAMPINAS] };
    const carga = cargaDasPessoas(
      pedido({
        contas: [ANA, BRUNO, CARLA, DIEGO],
        alcanceDeQuemOlha: new Set([CAMPINAS]),
        chamados: [
          com(DIEGO, 1061, deCampinas),
          com(DIEGO, 1062, { locais: [JUNDIAI, CAMPINAS] }),
          com(DIEGO, 1063),
          com(DIEGO, 1064),
          com(DIEGO, 1065),
          com(DIEGO, 1066),
          com(ANA, 1067, { locais: [], semLocal: true }),
          com(CARLA, 1068),
          naTriagem(1069, deCampinas),
          naTriagem(1070),
          resolvidoPor(DIEGO, 1071, sp('2026-11-17T09:00'), deCampinas),
          resolvidoPor(DIEGO, 1072, sp('2026-11-17T09:00')),
        ],
      }),
    );

    expect(colunaDe(carga.colunas, DIEGO)?.abertos).toEqual([1061, 1062]);
    expect(colunaDe(carga.colunas, ANA)?.abertos).toEqual([]);
    expect(colunaDe(carga.colunas, DIEGO)?.resolvidosHoje).toEqual([1071]);
    expect(carga.triagem.abertos).toEqual([1069]);
    expect(ordem(carga.colunas)).toEqual(['Ana Souza', 'Bruno Lima', 'Diego Martins']);
    expect(carga.contandoSoOsLocaisQueVe).toBe(true);
    expect(AVISO_DO_ALCANCE).toBe('Contando só os chamados dos locais que você vê.');
  });

  it('conta tudo, sem o aviso, a quem vê a organização inteira', () => {
    const carga = cargaDasPessoas(
      pedido({
        chamados: [
          com(DIEGO, 1061, { locais: [CAMPINAS] }),
          com(DIEGO, 1063),
          com(ANA, 1067, { locais: [], semLocal: true }),
        ],
      }),
    );

    expect(colunaDe(carga.colunas, DIEGO)?.abertos).toEqual([1061, 1063]);
    expect(colunaDe(carga.colunas, ANA)?.abertos).toEqual([1067]);
    expect(carga.contandoSoOsLocaisQueVe).toBe(false);
  });

  it('põe o chamado de quem não o atende mais na coluna dela, depois das outras', () => {
    const { colunas } = cargaDasPessoas(
      pedido({
        contas: [ANA, BRUNO, CARLA, DIEGO, RENATO],
        chamados: [
          com(RENATO, 1033),
          com(RENATO, 1036, { locais: [CAMPINAS] }),
          com(CARLA, 1037, { abertoEm: sp('2026-11-16T11:00') }),
        ],
      }),
    );

    expect(ordem(colunas)).toEqual([
      'Ana Souza',
      'Bruno Lima',
      'Diego Martins',
      'Renato Alves',
      'Carla Mendes · não atende mais',
      'Renato Alves · não atende mais',
    ]);
    expect(colunaDe(colunas, RENATO)?.abertos).toEqual([1036]);
    expect(colunaDe(colunas, RENATO, true)?.abertos).toEqual([1033]);
    expect(colunaDe(colunas, CARLA, true)).toEqual({
      ...vazia(CARLA, true),
      abertos: [1037],
      maisAntigo: { numero: 1037, abertoEm: sp('2026-11-16T11:00') },
      pedacos: { total: 5, cheios: 1 },
    });
  });

  it('só dá a coluna de quem não atende mais a quem tem algum chamado aberto que se vê', () => {
    const { colunas } = cargaDasPessoas(
      pedido({
        contas: [ANA, CARLA, RENATO],
        alcanceDeQuemOlha: new Set([CAMPINAS]),
        chamados: [
          com(RENATO, 1036, { locais: [CAMPINAS] }),
          com(CARLA, 1037),
          resolvidoPor(CARLA, 1032, sp('2026-11-17T09:00'), { locais: [CAMPINAS] }),
        ],
      }),
    );

    expect(ordem(colunas)).toEqual(['Ana Souza', 'Renato Alves']);
  });

  it('dá o resolvido hoje a quem resolveu, e não a quem atende, no dia do fuso de quem olha', () => {
    const chamados = [
      resolvidoPor(ANA, 1035, sp('2026-11-17T09:00'), { responsavel: DIEGO.id }),
      resolvidoPor(ANA, 1034, sp('2026-11-16T23:30')),
      resolvidoPor(ANA, 1030, sp('2026-11-16T20:00')),
    ];
    const emSaoPaulo = cargaDasPessoas(pedido({ chamados }));
    const emUtc = cargaDasPessoas(pedido({ chamados, fuso: 'UTC' }));

    expect(colunaDe(emSaoPaulo.colunas, ANA)?.resolvidosHoje).toEqual([1035]);
    expect(colunaDe(emSaoPaulo.colunas, DIEGO)?.resolvidosHoje).toEqual([]);
    expect(colunaDe(emUtc.colunas, ANA)?.resolvidosHoje).toEqual([1034, 1035]);
  });

  it('não conta como resolvido o chamado reaberto', () => {
    const { colunas } = cargaDasPessoas(
      pedido({
        chamados: [com(ANA, 1038, { resolvidoPor: ANA.id, resolvidoEm: sp('2026-11-17T09:00') })],
      }),
    );

    expect(colunaDe(colunas, ANA)).toMatchObject({ abertos: [1038], resolvidosHoje: [] });
  });

  it('põe o resolvido hoje de quem não é mais da TI na coluna de quem não atende mais, ou em nenhuma', () => {
    const paulo: ContaNaCarga = {
      id: 'conta-paulo',
      nome: 'Paulo Dias',
      ativa: false,
      alcance: 'organizacao',
    };
    const { colunas } = cargaDasPessoas(
      pedido({
        contas: [ANA, CARLA, paulo, RENATO],
        chamados: [
          com(CARLA, 1037),
          resolvidoPor(CARLA, 1032, sp('2026-11-17T09:00')),
          resolvidoPor(paulo, 1031, sp('2026-11-17T09:00')),
          com(RENATO, 1033),
          resolvidoPor(RENATO, 1029, sp('2026-11-17T09:30')),
        ],
      }),
    );

    expect(colunaDe(colunas, CARLA, true)?.resolvidosHoje).toEqual([1032]);
    expect(colunaDe(colunas, RENATO)?.resolvidosHoje).toEqual([1029]);
    expect(colunaDe(colunas, RENATO, true)?.resolvidosHoje).toEqual([]);
    expect(colunas.flatMap((coluna) => coluna.resolvidosHoje)).not.toContain(1031);
  });

  it('dá todos os resolvidos hoje que quem olha vê, para a contagem do Início', () => {
    const paulo: ContaNaCarga = {
      id: 'conta-paulo',
      nome: 'Paulo Dias',
      ativa: false,
      alcance: 'organizacao',
    };
    const carga = cargaDasPessoas(
      pedido({
        alcanceDeQuemOlha: new Set([JUNDIAI]),
        chamados: [
          resolvidoPor(ANA, 1035, sp('2026-11-17T09:00')),
          resolvidoPor(paulo, 1031, sp('2026-11-17T08:30')),
          resolvidoPor(DIEGO, 1030, sp('2026-11-16T20:00')),
          resolvidoPor(BRUNO, 1036, sp('2026-11-17T09:10'), { locais: [CAMPINAS] }),
        ],
      }),
    );

    expect(carga.resolvidosHoje).toEqual([1031, 1035]);
  });

  it('dá à triagem os números e o mais antigo, e o menor número no empate', () => {
    const { triagem } = cargaDasPessoas(
      pedido({
        chamados: [
          naTriagem(1043, { abertoEm: sp('2026-11-17T09:00') }),
          naTriagem(1042, { abertoEm: sp('2026-11-16T15:00') }),
          naTriagem(1040, { abertoEm: sp('2026-11-16T15:00') }),
        ],
      }),
    );

    expect(triagem).toEqual({
      abertos: [1040, 1042, 1043],
      maisAntigo: { numero: 1040, abertoEm: sp('2026-11-16T15:00') },
    });
  });

  it('recusa o chamado aberto com uma conta que não veio, ou sem ninguém', () => {
    expect(() =>
      cargaDasPessoas(pedido({ chamados: [chamado(1080, { responsavel: 'conta-sumida' })] })),
    ).toThrow('#1080');
    expect(() => cargaDasPessoas(pedido({ chamados: [chamado(1081)] }))).toThrow('#1081');
  });
});

describe('textoDosAbertos', () => {
  it('diz quantos estão abertos, no singular só com um', () => {
    expect(textoDosAbertos(0)).toBe('0 abertos');
    expect(textoDosAbertos(1)).toBe('1 aberto');
    expect(textoDosAbertos(2)).toBe('2 abertos');
  });
});

describe('textoDoResolvidoHoje', () => {
  it('lista os resolvidos pelo número, com os três primeiros quando passam de três', () => {
    expect(textoDoResolvidoHoje([])).toBe('Nada resolvido hoje');
    expect(textoDoResolvidoHoje([1035])).toBe('Resolveu hoje: #1035');
    expect(textoDoResolvidoHoje([1036, 1035])).toBe('Resolveu hoje: #1035 e #1036');
    expect(textoDoResolvidoHoje([1036, 1033, 1035])).toBe('Resolveu hoje: #1033, #1035 e #1036');
    expect(textoDoResolvidoHoje([1038, 1031, 1035, 1033])).toBe(
      'Resolveu hoje: #1031, #1033, #1035 e mais 1',
    );
    expect(textoDoResolvidoHoje([1038, 1031, 1035, 1033, 1036])).toBe(
      'Resolveu hoje: #1031, #1033, #1035 e mais 2',
    );
  });

  it('não mexe na lista que recebe', () => {
    const numeros = [1036, 1035];
    textoDoResolvidoHoje(numeros);
    expect(numeros).toEqual([1036, 1035]);
  });
});

describe('saudacao', () => {
  it('dá bom dia das 05:00 às 11:59, boa tarde das 12:00 às 17:59 e boa noite no resto', () => {
    const fuso = 'America/Sao_Paulo';
    expect(saudacao('Ana Souza', sp('2026-11-17T04:59'), fuso)).toBe('Boa noite, Ana');
    expect(saudacao('Ana Souza', sp('2026-11-17T05:00'), fuso)).toBe('Bom dia, Ana');
    expect(saudacao('Ana Souza', sp('2026-11-17T11:59'), fuso)).toBe('Bom dia, Ana');
    expect(saudacao('Ana Souza', sp('2026-11-17T12:00'), fuso)).toBe('Boa tarde, Ana');
    expect(saudacao('Ana Souza', sp('2026-11-17T17:59'), fuso)).toBe('Boa tarde, Ana');
    expect(saudacao('Ana Souza', sp('2026-11-17T18:00'), fuso)).toBe('Boa noite, Ana');
    expect(saudacao('Ana Souza', sp('2026-11-17T00:00'), fuso)).toBe('Boa noite, Ana');
  });

  it('segue o fuso da conta', () => {
    expect(saudacao('Ana Souza', sp('2026-11-17T10:00'), 'UTC')).toBe('Boa tarde, Ana');
    expect(saudacao('Ana Souza', sp('2026-11-17T10:00'), 'Asia/Tokyo')).toBe('Boa noite, Ana');
  });

  it('chama pelo primeiro nome, a pessoa anonimizada pelo nome inteiro, e sem nome não chama', () => {
    const manha = sp('2026-11-17T09:00');
    const fuso = 'America/Sao_Paulo';
    expect(saudacao('  Bruno   Lima ', manha, fuso)).toBe('Bom dia, Bruno');
    expect(saudacao('Pessoa anonimizada 7KQ2', manha, fuso)).toBe(
      'Bom dia, Pessoa anonimizada 7KQ2',
    );
    expect(saudacao('  ', manha, fuso)).toBe('Bom dia');
  });
});
