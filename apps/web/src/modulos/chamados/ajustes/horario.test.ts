// O que a tela do horário da TI decide sem a API (change chamados-da-ti, design, "O horário da TI
// (tarefa 5.26)"): o horário escrito numa frase, o que mudou, as recusas da spec antes de mandar e
// as que ainda valem.
import { HORARIO_DA_TI_PADRAO } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import {
  conferirEdicao,
  diasNaFrase,
  type EdicaoDoHorario,
  edicaoDoHorario,
  errosDoHorario,
  fraseDoHorario,
  mudouOHorario,
  recusasQueValem,
  textoDaDuracao,
} from './horario.ts';

function edicao(mudar: Partial<EdicaoDoHorario> = {}): EdicaoDoHorario {
  return {
    dias: [1, 2, 3, 4, 5],
    inicio: 8 * 60,
    fim: 18 * 60,
    fuso: 'America/Sao_Paulo',
    cargaCheia: '5',
    ...mudar,
  };
}

describe('diasNaFrase', () => {
  it('junta três ou mais dias seguidos de um dia a outro', () => {
    expect(diasNaFrase([1, 2, 3, 4, 5])).toBe('De segunda a sexta');
    expect(diasNaFrase([1, 2, 3, 4, 5, 6])).toBe('De segunda a sábado');
  });

  it('com os sete dias, diz todos os dias', () => {
    expect(diasNaFrase([1, 2, 3, 4, 5, 6, 7])).toBe('Todos os dias');
  });

  it('separa os dias soltos e os pares por vírgula e "e"', () => {
    expect(diasNaFrase([1, 3, 5])).toBe('Segunda, quarta e sexta');
    expect(diasNaFrase([6, 7])).toBe('Sábado e domingo');
    expect(diasNaFrase([1, 2, 3, 5])).toBe('De segunda a quarta e sexta');
    expect(diasNaFrase([1, 2, 4, 5, 6])).toBe('Segunda, terça e de quinta a sábado');
  });

  it('com um dia só, diz qual, com o artigo dele', () => {
    expect(diasNaFrase([2])).toBe('Só na terça');
    expect(diasNaFrase([6])).toBe('Só no sábado');
  });

  it('põe os dias na ordem da semana, sem repetir', () => {
    expect(diasNaFrase([5, 1, 3, 1])).toBe('Segunda, quarta e sexta');
  });

  it('sem dias, não tem frase', () => {
    expect(diasNaFrase([])).toBeNull();
  });
});

describe('textoDaDuracao', () => {
  it('diz as horas e os minutos que sobram', () => {
    expect(textoDaDuracao(600)).toBe('10 h');
    expect(textoDaDuracao(570)).toBe('9 h 30 min');
    expect(textoDaDuracao(45)).toBe('45 min');
    expect(textoDaDuracao(1439)).toBe('23 h 59 min');
  });
});

describe('fraseDoHorario', () => {
  it('escreve os dias, as horas e o comprimento do dia útil', () => {
    expect(fraseDoHorario(edicao())).toBe(
      'De segunda a sexta, das 08:00 às 18:00. Cada dia útil tem 10 h.',
    );
    expect(fraseDoHorario(edicao({ dias: [6, 7], inicio: 9 * 60, fim: 13 * 60 + 30 }))).toBe(
      'Sábado e domingo, das 09:00 às 13:30. Cada dia útil tem 4 h 30 min.',
    );
  });

  it('usa o singular com a 01:00, como se lê "uma hora"', () => {
    expect(fraseDoHorario(edicao({ inicio: 60, fim: 5 * 60 }))).toBe(
      'De segunda a sexta, da 01:00 às 05:00. Cada dia útil tem 4 h.',
    );
    expect(fraseDoHorario(edicao({ inicio: 0, fim: 60 + 30 }))).toBe(
      'De segunda a sexta, das 00:00 à 01:30. Cada dia útil tem 1 h 30 min.',
    );
  });

  it('sem dias, com uma hora apagada ou com o fim antes do início, não tem frase', () => {
    expect(fraseDoHorario(edicao({ dias: [] }))).toBeNull();
    expect(fraseDoHorario(edicao({ inicio: null }))).toBeNull();
    expect(fraseDoHorario(edicao({ fim: null }))).toBeNull();
    expect(fraseDoHorario(edicao({ inicio: 18 * 60, fim: 18 * 60 }))).toBeNull();
  });
});

describe('edicaoDoHorario e mudouOHorario', () => {
  it('a edição começa no horário gravado, com a carga em texto, para o número na frase', () => {
    expect(edicaoDoHorario(HORARIO_DA_TI_PADRAO)).toEqual(edicao());
  });

  it('sem mudança, nada mudou', () => {
    expect(mudouOHorario(edicao(), HORARIO_DA_TI_PADRAO)).toBe(false);
  });

  it('os dias valem como conjunto, e a carga, pelo número', () => {
    expect(mudouOHorario(edicao({ dias: [5, 4, 3, 2, 1] }), HORARIO_DA_TI_PADRAO)).toBe(false);
    expect(mudouOHorario(edicao({ cargaCheia: '05' }), HORARIO_DA_TI_PADRAO)).toBe(false);
  });

  it('cada parte mudada conta, também a hora e a carga apagadas', () => {
    expect(mudouOHorario(edicao({ dias: [1, 2, 3, 4] }), HORARIO_DA_TI_PADRAO)).toBe(true);
    expect(mudouOHorario(edicao({ inicio: 9 * 60 }), HORARIO_DA_TI_PADRAO)).toBe(true);
    expect(mudouOHorario(edicao({ fim: null }), HORARIO_DA_TI_PADRAO)).toBe(true);
    expect(mudouOHorario(edicao({ fuso: 'America/Manaus' }), HORARIO_DA_TI_PADRAO)).toBe(true);
    expect(mudouOHorario(edicao({ cargaCheia: '6' }), HORARIO_DA_TI_PADRAO)).toBe(true);
    expect(mudouOHorario(edicao({ cargaCheia: '' }), HORARIO_DA_TI_PADRAO)).toBe(true);
  });
});

describe('conferirEdicao', () => {
  it('o horário certo vira o pedido da API, com os dias em ordem e a carga em número', () => {
    expect(conferirEdicao(edicao({ dias: [5, 1, 3], cargaCheia: '8' }))).toEqual({
      ok: true,
      pedido: {
        dias: [1, 3, 5],
        inicio: 480,
        fim: 1080,
        fuso: 'America/Sao_Paulo',
        cargaCheia: 8,
      },
    });
  });

  it('recusa como a spec, cada parte no campo dela', () => {
    expect(conferirEdicao(edicao({ dias: [] }))).toEqual({
      ok: false,
      erros: { dias: 'Escolha ao menos um dia.' },
    });
    expect(conferirEdicao(edicao({ inicio: 18 * 60, fim: 8 * 60 }))).toEqual({
      ok: false,
      erros: { fim: 'O fim vem depois do início.' },
    });
    expect(conferirEdicao(edicao({ fuso: 'Lua/Base_Alfa' }))).toEqual({
      ok: false,
      erros: { fuso: 'Escolha um fuso da lista.' },
    });
    for (const carga of ['0', '21', '']) {
      expect(conferirEdicao(edicao({ cargaCheia: carga }))).toEqual({
        ok: false,
        erros: { cargaCheia: 'Use um número inteiro de 1 a 20.' },
      });
    }
  });

  it('a hora apagada pede a hora, sem a recusa do fim, que não se confere sem as duas', () => {
    expect(conferirEdicao(edicao({ inicio: null, fim: 0 }))).toEqual({
      ok: false,
      erros: { inicio: 'Escreva a hora.' },
    });
    expect(conferirEdicao(edicao({ fim: null, dias: [] }))).toEqual({
      ok: false,
      erros: { fim: 'Escreva a hora.', dias: 'Escolha ao menos um dia.' },
    });
  });
});

describe('errosDoHorario', () => {
  it('pega da recusa da API só os campos da tela', () => {
    expect(
      errosDoHorario({ fim: 'O fim vem depois do início.', outro: 'x', cargaCheia: 'Use…' }),
    ).toEqual({ fim: 'O fim vem depois do início.', cargaCheia: 'Use…' });
  });
});

describe('recusasQueValem', () => {
  const erros = {
    dias: 'Escolha ao menos um dia.',
    inicio: 'Escreva a hora.',
    fim: 'O fim vem depois do início.',
    fuso: 'Escolha um fuso da lista.',
    cargaCheia: 'Use um número inteiro de 1 a 20.',
  };
  const naRecusa = edicao({ dias: [3, 1], inicio: null, fuso: 'Lua/Base_Alfa', cargaCheia: '0' });

  it('sem mudança, todas valem; os dias, como conjunto', () => {
    expect(recusasQueValem(erros, naRecusa, { ...naRecusa, dias: [1, 3] })).toEqual(erros);
  });

  it('cada uma sai quando o campo dela muda', () => {
    expect(recusasQueValem(erros, naRecusa, { ...naRecusa, dias: [1] })).not.toHaveProperty('dias');
    expect(
      recusasQueValem(erros, naRecusa, { ...naRecusa, fuso: 'America/Manaus' }),
    ).not.toHaveProperty('fuso');
    expect(recusasQueValem(erros, naRecusa, { ...naRecusa, cargaCheia: '5' })).not.toHaveProperty(
      'cargaCheia',
    );
  });

  it('a do fim sai também quando o início muda', () => {
    const valem = recusasQueValem(erros, naRecusa, { ...naRecusa, inicio: 7 * 60 });
    expect(valem).not.toHaveProperty('inicio');
    expect(valem).not.toHaveProperty('fim');
    expect(valem).toHaveProperty('dias');
  });
});
