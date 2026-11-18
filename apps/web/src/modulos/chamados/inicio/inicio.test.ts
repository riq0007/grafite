// O Início dos chamados (spec modulo-chamados, "Início dos chamados"; change chamados-da-ti, design,
// "O Início dos chamados (tarefa 5.17)"; mockup m12): os números da contagem, a frase dela, com o
// peso forte, as linhas da triagem pela ordem do vencimento e as ações delas, pela permissão, os
// prazos sem os parados e a frase dos parados.
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import {
  AGORA_DOS_MOCKUPS,
  ANA,
  BRUNO,
  CHAMADOS_DOS_MOCKUPS,
  chamadoNosPrazos,
  coluna,
  DIEGO,
  FUSO_DOS_MOCKUPS,
  PRAZOS_DOS_MOCKUPS,
  parado,
  passarNoQuadro,
  QUADRO_DOS_MOCKUPS,
  RENATO,
  sp,
} from '../../../teste/chamados.ts';
import type { ChamadoNosPrazos } from '../consultas.ts';
import { contadorDoPrazo } from '../prazo.ts';
import { gruposDosPrazos } from '../prazos/lista.ts';
import {
  acoesDaTriagem,
  contagemDoInicio,
  fraseDosParados,
  gruposDoInicio,
  linhasDaTriagem,
  type NumerosDoInicio,
  numerosDoInicio,
  quemPediuNaTriagem,
} from './inicio.ts';

const dataHora = criarDataHora(FUSO_DOS_MOCKUPS);
const { horario } = PRAZOS_DOS_MOCKUPS;
const contar = contadorDoPrazo(AGORA_DOS_MOCKUPS, FUSO_DOS_MOCKUPS);

/** Os grupos da lista compacta, como o Início os pede. */
const grupos = (chamados: readonly ChamadoNosPrazos[] = CHAMADOS_DOS_MOCKUPS) =>
  gruposDosPrazos(chamados, {
    horario,
    contar,
    agora: AGORA_DOS_MOCKUPS,
    dataHora,
    compacto: true,
  });

/** A frase inteira e, à parte, os trechos em peso forte. */
const lida = (numeros: NumerosDoInicio) => {
  const trechos = contagemDoInicio(numeros);
  return {
    frase: trechos.map(({ texto }) => texto).join(''),
    fortes: trechos.filter(({ forte }) => forte).map(({ texto }) => texto),
  };
};

const doMockup = (numero: number) => {
  const chamado = CHAMADOS_DOS_MOCKUPS.find((um) => um.numero === numero);
  if (!chamado) throw new Error(`O #${numero} não é dos mockups.`);
  return chamado;
};

describe('numerosDoInicio', () => {
  it('o m12: 3 na triagem, 1 estourado, 12 abertos e 1 resolvido hoje', () => {
    expect(numerosDoInicio(QUADRO_DOS_MOCKUPS, grupos())).toEqual({
      triagem: 3,
      estourados: 1,
      abertos: 12,
      resolvidosHoje: 1,
    });
  });

  it('o estourado sai da lista contada no minuto da tela, e não do grupo da leitura', () => {
    // O #1038 vence às 11:40: às 11:41, ele passou do prazo, com a leitura ainda das 09:40.
    const depois = sp('2026-11-11T11:41:00');
    const noMinuto = gruposDosPrazos(CHAMADOS_DOS_MOCKUPS, {
      horario,
      contar: contadorDoPrazo(depois, FUSO_DOS_MOCKUPS),
      agora: depois,
      dataHora,
      compacto: true,
    });
    expect(numerosDoInicio(QUADRO_DOS_MOCKUPS, noMinuto).estourados).toBe(4);
  });

  it('depois de Ana assumir o #1040, 2 na triagem e os mesmos 12 abertos', () => {
    const quadro = passarNoQuadro(QUADRO_DOS_MOCKUPS, 1040, ANA);
    expect(numerosDoInicio(quadro, grupos())).toMatchObject({ triagem: 2, abertos: 12 });
  });
});

describe('contagemDoInicio', () => {
  it('o m12, com a triagem e o estourado em peso forte', () => {
    expect(lida({ triagem: 3, estourados: 1, abertos: 12, resolvidosHoje: 1 })).toEqual({
      frase:
        '3 esperam na triagem e 1 já passou do prazo. 12 chamados abertos na equipe, 1 resolvido hoje.',
      fortes: ['3 esperam na triagem', '1 já passou do prazo'],
    });
  });

  it('a triagem que passa a 2, como no cenário da spec', () => {
    expect(lida({ triagem: 2, estourados: 1, abertos: 12, resolvidosHoje: 1 }).frase).toMatch(
      /^2 esperam na triagem e /,
    );
  });

  it('o singular e o plural de cada parte', () => {
    expect(lida({ triagem: 1, estourados: 2, abertos: 1, resolvidosHoje: 3 }).frase).toBe(
      '1 espera na triagem e 2 já passaram do prazo. 1 chamado aberto na equipe, 3 resolvidos hoje.',
    );
  });

  it('o zero, sem o peso forte, que chamaria a atenção para nada', () => {
    expect(lida({ triagem: 0, estourados: 0, abertos: 9, resolvidosHoje: 0 })).toEqual({
      frase:
        'Nenhum chamado espera na triagem e nenhum passou do prazo. 9 chamados abertos na equipe, nenhum resolvido hoje.',
      fortes: [],
    });
    expect(lida({ triagem: 0, estourados: 1, abertos: 4, resolvidosHoje: 1 })).toEqual({
      frase:
        'Nenhum chamado espera na triagem e 1 já passou do prazo. 4 chamados abertos na equipe, 1 resolvido hoje.',
      fortes: ['1 já passou do prazo'],
    });
    expect(lida({ triagem: 2, estourados: 0, abertos: 5, resolvidosHoje: 0 }).fortes).toEqual([
      '2 esperam na triagem',
    ]);
  });

  it('sem chamados abertos, "Nenhum chamado aberto." e os resolvidos hoje', () => {
    expect(lida({ triagem: 0, estourados: 0, abertos: 0, resolvidosHoje: 2 })).toEqual({
      frase: 'Nenhum chamado aberto. 2 resolvidos hoje.',
      fortes: [],
    });
    expect(lida({ triagem: 0, estourados: 0, abertos: 0, resolvidosHoje: 1 }).frase).toBe(
      'Nenhum chamado aberto. 1 resolvido hoje.',
    );
    expect(lida({ triagem: 0, estourados: 0, abertos: 0, resolvidosHoje: 0 }).frase).toBe(
      'Nenhum chamado aberto. Nenhum resolvido hoje.',
    );
  });
});

describe('linhasDaTriagem', () => {
  it('a triagem do m12 pela ordem do vencimento: #1038, #1040 e #1042', () => {
    const linhas = linhasDaTriagem(QUADRO_DOS_MOCKUPS, PRAZOS_DOS_MOCKUPS, contar);
    expect(linhas.map(({ numero }) => numero)).toEqual([1038, 1040, 1042]);
    expect(linhas[0]?.situacao?.texto).toBe('vence em 2 h');
  });

  it('o número que a lista ainda não trouxe fica por último, sem o chamado', () => {
    const quadro = {
      ...QUADRO_DOS_MOCKUPS,
      triagem: { ...QUADRO_DOS_MOCKUPS.triagem, abertos: [1038, 1040, 1042, 1043] },
    };
    const linhas = linhasDaTriagem(quadro, PRAZOS_DOS_MOCKUPS, contar);
    expect(linhas.map(({ numero }) => numero)).toEqual([1038, 1040, 1042, 1043]);
    expect(linhas[3]?.chamado).toBeNull();
  });
});

describe('quemPediuNaTriagem', () => {
  it('quem pediu e o local dela, como "Helena Prado, Diretoria"; sem o local, só o nome', () => {
    expect(quemPediuNaTriagem(doMockup(1038))).toBe('Helena Prado, Diretoria');
    expect(quemPediuNaTriagem(doMockup(1040))).toBe('Paulo Nunes');
  });
});

describe('acoesDaTriagem', () => {
  const daTela = {
    podeAtender: true,
    conta: ANA.conta,
    colunas: QUADRO_DOS_MOCKUPS.colunas,
  };

  it('a quem atende, "Assumir" e as quatro pessoas de "Passar para…", com os abertos', () => {
    expect(acoesDaTriagem(doMockup(1040), daTela)).toEqual({
      assumir: true,
      pessoas: [
        { ...ANA, abertos: 2 },
        { ...BRUNO, abertos: 2 },
        { ...DIEGO, abertos: 3 },
        { ...RENATO, abertos: 2 },
      ],
    });
  });

  it('a quem só vê os chamados, nenhum botão', () => {
    expect(acoesDaTriagem(doMockup(1040), { ...daTela, podeAtender: false })).toBeNull();
  });

  it('sem o chamado da lista, nenhum botão: a versão e os locais vêm dela', () => {
    expect(acoesDaTriagem(null, daTela)).toBeNull();
  });

  it('fora de "Passar para…", quem não atende mais e quem não atende o local do chamado', () => {
    const doFinanceiro = { ...doMockup(1040), locais: ['local-financeiro'], semLocal: false };
    const colunas = [
      coluna(ANA, [1031, 1041], null),
      // Bruno atende só a Portaria: sem a árvore dos locais ainda, a API confere o local.
      coluna(BRUNO, [1032], null, { atende: { organizacao: false, locais: ['local-portaria'] } }),
      coluna(DIEGO, [1029], null, { naoAtendeMais: true }),
    ];
    expect(acoesDaTriagem(doFinanceiro, { ...daTela, colunas })?.pessoas).toEqual([
      { ...ANA, abertos: 2 },
      { ...BRUNO, abertos: 1 },
    ]);
    const semLocal = { ...doMockup(1040), locais: [], semLocal: true };
    expect(
      acoesDaTriagem(semLocal, { ...daTela, colunas })?.pessoas.map(({ nome }) => nome),
    ).toEqual(['Ana Souza']);
  });
});

describe('os prazos do Início', () => {
  it('sem os parados e com os apoios curtos, como no m12', () => {
    expect(
      gruposDoInicio(grupos()).map(({ titulo, apoio, linhas }) => [
        titulo,
        apoio,
        linhas.map(({ chamado }) => chamado.numero),
      ]),
    ).toEqual([
      ['Estourado', 'passou do prazo', [1033]],
      // O #1031 e o #1038 vencem às 11:40: o empate vai pelo número, e não pela ordem do m12.
      ['Vence em até 2 horas', 'até as 11:40', [1039, 1031, 1038]],
      ['Vence hoje', 'depois das 11:40', [1037, 1040, 1042, 1034, 1036]],
    ]);
  });

  it('a frase dos parados, na ordem do grupo deles: o que resta primeiro', () => {
    expect(fraseDosParados(grupos())).toBe(
      '3 com o relógio parado, esperando o colaborador: #1041, #1032 e #1029.',
    );
  });

  it('um parado só, no singular; nenhum, sem frase', () => {
    expect(fraseDosParados(grupos([doMockup(1041), doMockup(1033)]))).toBe(
      '1 com o relógio parado, esperando o colaborador: #1041.',
    );
    expect(fraseDosParados(grupos([doMockup(1033)]))).toBeNull();
  });

  it('com mais de 5 parados, os 5 primeiros e "e mais 2"', () => {
    const parados = Array.from({ length: 7 }, (_, indice) =>
      chamadoNosPrazos(1050 + indice, 'outro', 'Esperando a peça', {
        pessoa: 'Portaria',
        responsavel: BRUNO,
        abertoEm: sp('2026-11-10T08:00:00'),
        // Cada um com 1 h a menos contada que o anterior: o #1050 é o que tem menos a esperar.
        relogio: parado(24, (16 - indice) * 60),
      }),
    );
    expect(fraseDosParados(grupos(parados))).toBe(
      '7 com o relógio parado, esperando o colaborador: #1050, #1051, #1052, #1053, #1054 e mais 2.',
    );
  });
});
