// O que a tela "Quem está com o quê" monta do quadro e da lista dos prazos (spec modulo-chamados,
// "Quem está com o quê"; change chamados-da-ti, design, decisão 22).
import { describe, expect, it } from 'vitest';
import {
  AGORA_DOS_MOCKUPS,
  BRUNO,
  CHAMADOS_DOS_MOCKUPS,
  chamadoNosPrazos,
  coluna,
  FUSO_DOS_MOCKUPS,
  HORARIO_DOS_MOCKUPS,
  PRAZOS_DOS_MOCKUPS,
  parado,
  QUADRO_DOS_MOCKUPS,
  RENATO,
} from '../../../teste/chamados.ts';
import { contadorDoPrazo } from '../prazo.ts';
import {
  abertosNoQuadro,
  chaveDaColuna,
  idadeDoMaisAntigo,
  listaPorNumero,
  quadradosDaColuna,
  textoDaCarga,
  textoDaTriagem,
  textoDoMaisAntigo,
  textoDosAbertos,
  textoDosResolvidosHoje,
} from './quadro.ts';

const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;
const HORA = 60 * MINUTO;

describe('idadeDoMaisAntigo', () => {
  const ha = (ms: number) =>
    idadeDoMaisAntigo(new Date(AGORA_DOS_MOCKUPS.getTime() - ms), AGORA_DOS_MOCKUPS);

  it('arredonda para o mais perto, como o mockup, e não para baixo', () => {
    expect(ha(16 * HORA + 35 * MINUTO)).toBe('17 h');
    expect(ha(16 * HORA + 29 * MINUTO)).toBe('16 h');
    expect(ha(16 * HORA + 30 * MINUTO)).toBe('17 h');
    expect(ha(6 * HORA)).toBe('6 h');
    expect(ha(8 * HORA + 20 * MINUTO)).toBe('8 h');
    expect(ha(46 * HORA + 20 * MINUTO)).toBe('2 d');
    expect(ha(72 * HORA)).toBe('3 d');
    expect(ha(12 * MINUTO + 29 * SEGUNDO)).toBe('12 min');
    expect(ha(12 * MINUTO + 30 * SEGUNDO)).toBe('13 min');
  });

  it('em minutos até 59 min, em horas até 23 h e em dias daí em diante, subindo a unidade', () => {
    expect(ha(30 * SEGUNDO)).toBe('1 min');
    expect(ha(59 * MINUTO + 29 * SEGUNDO)).toBe('59 min');
    expect(ha(59 * MINUTO + 30 * SEGUNDO)).toBe('1 h');
    expect(ha(89 * MINUTO + 59 * SEGUNDO)).toBe('1 h');
    expect(ha(90 * MINUTO)).toBe('2 h');
    expect(ha(23 * HORA + 29 * MINUTO)).toBe('23 h');
    expect(ha(23 * HORA + 30 * MINUTO)).toBe('1 d');
    expect(ha(35 * HORA + 59 * MINUTO)).toBe('1 d');
    expect(ha(36 * HORA)).toBe('2 d');
  });

  it('abaixo de meio minuto, e com o relógio do computador atrasado, "menos de 1 min"', () => {
    expect(ha(29 * SEGUNDO)).toBe('menos de 1 min');
    expect(ha(0)).toBe('menos de 1 min');
    expect(ha(-90 * SEGUNDO)).toBe('menos de 1 min');
  });
});

describe('os textos da coluna', () => {
  it('o mais antigo, com o número e a idade', () => {
    expect(
      textoDoMaisAntigo({ numero: 1041, abertoEm: '2026-11-10T20:05:00.000Z' }, AGORA_DOS_MOCKUPS),
    ).toBe('mais antigo #1041, há 17 h');
    expect(
      textoDoMaisAntigo(
        { numero: 1043, abertoEm: AGORA_DOS_MOCKUPS.toISOString() },
        AGORA_DOS_MOCKUPS,
      ),
    ).toBe('mais antigo #1043, há menos de 1 min');
  });

  it('a triagem e a carga', () => {
    expect(textoDaTriagem(0)).toBe('0 na triagem');
    expect(textoDaTriagem(1)).toBe('1 na triagem');
    expect(textoDaTriagem(3)).toBe('3 na triagem');
    expect(textoDaCarga(2, 5)).toBe('Carga: 2 de 5');
    expect(textoDaCarga(7, 5)).toBe('Carga: 7 de 5');
  });

  it('os abertos, no singular e no plural', () => {
    expect(textoDosAbertos(0)).toBe('0 abertos');
    expect(textoDosAbertos(1)).toBe('1 aberto');
    expect(textoDosAbertos(2)).toBe('2 abertos');
    expect(textoDosAbertos(12)).toBe('12 abertos');
  });

  it('os resolvidos hoje, pelo número, com os três primeiros e quantos mais', () => {
    expect(textoDosResolvidosHoje([])).toBe('Nada resolvido hoje');
    expect(textoDosResolvidosHoje([1035])).toBe('Resolveu hoje: #1035');
    expect(textoDosResolvidosHoje([1035, 1031])).toBe('Resolveu hoje: #1031 e #1035');
    expect(textoDosResolvidosHoje([1035, 1033, 1031])).toBe('Resolveu hoje: #1031, #1033 e #1035');
    expect(textoDosResolvidosHoje([1040, 1035, 1033, 1031])).toBe(
      'Resolveu hoje: #1031, #1033, #1035 e mais 1',
    );
    expect(textoDosResolvidosHoje([1040, 1035, 1033, 1031, 1038])).toBe(
      'Resolveu hoje: #1031, #1033, #1035 e mais 2',
    );
    // Pelo número, e não pela ordem do texto: o #998 vem antes do #1031.
    expect(textoDosResolvidosHoje([1031, 998])).toBe('Resolveu hoje: #998 e #1031');
  });
});

describe('o quadro', () => {
  it('a chave da coluna é a conta e a marca de quem não atende mais', () => {
    const atende = coluna(RENATO, [1037], null);
    const naoAtende = coluna(RENATO, [1033], null, { naoAtendeMais: true });
    expect(chaveDaColuna(atende)).toBe(`${RENATO.conta}:atende`);
    expect(chaveDaColuna(naoAtende)).toBe(`${RENATO.conta}:nao-atende-mais`);
  });

  it('os abertos são os da triagem e os de todas as colunas', () => {
    expect(abertosNoQuadro(QUADRO_DOS_MOCKUPS)).toBe(12);
    expect(
      abertosNoQuadro({
        ...QUADRO_DOS_MOCKUPS,
        triagem: { abertos: [], maisAntigo: null },
        colunas: [
          coluna(BRUNO, [], null),
          coluna(RENATO, [1037], null),
          coluna(RENATO, [1033, 1050], null, { naoAtendeMais: true }),
        ],
      }),
    ).toBe(3);
  });
});

describe('quadradosDaColuna', () => {
  const contar = contadorDoPrazo(AGORA_DOS_MOCKUPS, FUSO_DOS_MOCKUPS);
  const dos = (numeros: number[], chamados = CHAMADOS_DOS_MOCKUPS) =>
    quadradosDaColuna(numeros, {
      lista: listaPorNumero({ ...PRAZOS_DOS_MOCKUPS, chamados }),
      horario: HORARIO_DOS_MOCKUPS,
      contar,
    });
  const numeros = (numerosDaColuna: number[], chamados?: typeof CHAMADOS_DOS_MOCKUPS) =>
    dos(numerosDaColuna, chamados).map((quadrado) => quadrado.numero);

  it('pelo vencimento: o estourado, os que vencem antes e o parado por último, como no m01', () => {
    expect(numeros([1038, 1040, 1042])).toEqual([1038, 1040, 1042]);
    expect(numeros([1031, 1041])).toEqual([1031, 1041]);
    expect(numeros([1032, 1034])).toEqual([1034, 1032]);
    expect(numeros([1029, 1036, 1039])).toEqual([1039, 1036, 1029]);
    expect(numeros([1037, 1033])).toEqual([1033, 1037]);
  });

  it('cada quadrado traz o chamado da lista e a situação do prazo agora', () => {
    const [estourado, depois] = dos([1037, 1033]);
    expect(estourado?.chamado?.titulo).toBe('Switch Rack 2 sem link na porta 3');
    expect(estourado?.situacao?.grupo).toBe('estourado');
    expect(estourado?.situacao?.texto).toBe('estourado há 20 min');
    expect(depois?.situacao?.texto).toBe('vence em 4 h');
  });

  it('no empate do vencimento, o menor número primeiro', () => {
    // O #1031 e o #1038 vencem às 11:40.
    expect(numeros([1038, 1031])).toEqual([1031, 1038]);
    expect(numeros([1031, 1038])).toEqual([1031, 1038]);
  });

  it('os parados pelo que resta do prazo', () => {
    // Restam 1 h 44 min ao #1041, 12 h ao #1032 e 17 h ao #1029.
    expect(numeros([1029, 1032, 1041])).toEqual([1041, 1032, 1029]);
  });

  it('o de prazo ilegível e o que a lista ainda não trouxe vão por último, pelo número', () => {
    const ilegivel = chamadoNosPrazos(1045, 'outro', 'Cadeira quebrada', {
      pessoa: 'Portaria',
      responsavel: BRUNO,
      abertoEm: AGORA_DOS_MOCKUPS,
      relogio: null,
    });
    const chamados = [...CHAMADOS_DOS_MOCKUPS, ilegivel];
    expect(numeros([1050, 1045, 1032, 1034, 1044], chamados)).toEqual([
      1034, 1032, 1044, 1045, 1050,
    ]);
    const [, , faltando, semRelogio] = dos([1050, 1045, 1032, 1034, 1044], chamados);
    expect(faltando).toEqual({ numero: 1044, chamado: null, situacao: null });
    expect(semRelogio).toEqual({ numero: 1045, chamado: ilegivel, situacao: null });
  });

  it('a mesma lista conta o relógio parado pelo contado, sem o "desde"', () => {
    const [quadrado] = dos(
      [1041],
      [
        chamadoNosPrazos(1041, 'acesso', 'Sem acesso à pasta do Financeiro', {
          pessoa: 'Fernanda Rocha',
          responsavel: BRUNO,
          abertoEm: AGORA_DOS_MOCKUPS,
          relogio: parado(4, 3 * 60),
        }),
      ],
    );
    expect(quadrado?.situacao).toMatchObject({ grupo: 'parado', restaS: 3600 });
  });
});
