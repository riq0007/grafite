import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  conferirHorario,
  type DiaDaSemana,
  fraseDoPrazo,
  HORARIO_DA_TI_PADRAO,
  type HorarioDaTi,
  minutosDoPrazo,
  momentoEmQueAlcanca,
  noHorarioDaTi,
  type PedidoDoHorario,
  type PrazoDoTipo,
  prazoEmMinutos,
  rotuloDaUnidadeDoPrazo,
  segundosNoHorario,
  textoDoValorDoPrazo,
} from './prazo.ts';

/**
 * O instante no relógio de São Paulo, que não tem horário de verão desde 2019 (UTC−3). Nos
 * mockups, hoje é terça, 17/11/2026, e são 09:40.
 */
const sp = (dataHora: string) => new Date(`${dataHora}:00-03:00`);

const HORA = 3600;
const MINUTO = 60;

const PADRAO = HORARIO_DA_TI_PADRAO;
const NOVA_YORK: HorarioDaTi = { ...PADRAO, fuso: 'America/New_York' };

const PEDIDO: PedidoDoHorario = {
  dias: [1, 2, 3, 4, 5],
  inicio: 8 * 60,
  fim: 18 * 60,
  fuso: 'America/Sao_Paulo',
  cargaCheia: 5,
};

describe('HORARIO_DA_TI_PADRAO', () => {
  it('é de segunda a sexta, das 08:00 às 18:00, no fuso de São Paulo, com a carga cheia de 5', () => {
    expect(HORARIO_DA_TI_PADRAO).toEqual({
      dias: [1, 2, 3, 4, 5],
      inicio: 480,
      fim: 1080,
      fuso: 'America/Sao_Paulo',
      cargaCheia: 5,
    });
  });
});

describe('conferirHorario', () => {
  it('aceita o padrão', () => {
    expect(conferirHorario(PEDIDO)).toEqual({ ok: true, horario: HORARIO_DA_TI_PADRAO });
  });

  it('pede pelo tipo os dias de segunda (1) a domingo (7), que o esquema da rota confere', () => {
    expectTypeOf<PedidoDoHorario['dias']>().toEqualTypeOf<readonly DiaDaSemana[]>();
    expectTypeOf<HorarioDaTi['dias']>().toEqualTypeOf<readonly DiaDaSemana[]>();
  });

  it('tira os dias repetidos e os põe em ordem', () => {
    const conferido = conferirHorario({ ...PEDIDO, dias: [5, 1, 3, 1] });
    expect(conferido.ok && conferido.horario.dias).toEqual([1, 3, 5]);
  });

  it('recusa sem nenhum dia', () => {
    expect(conferirHorario({ ...PEDIDO, dias: [] })).toEqual({
      ok: false,
      erros: { dias: 'Escolha ao menos um dia.' },
    });
  });

  it('recusa o fim que não vem depois do início', () => {
    for (const fim of [8 * 60, 7 * 60]) {
      expect(conferirHorario({ ...PEDIDO, fim })).toEqual({
        ok: false,
        erros: { fim: 'O fim vem depois do início.' },
      });
    }
  });

  it('recusa o fuso fora da lista', () => {
    for (const fuso of ['Marte/Base_Alfa', '', ' ']) {
      expect(conferirHorario({ ...PEDIDO, fuso })).toEqual({
        ok: false,
        erros: { fuso: 'Escolha um fuso da lista.' },
      });
    }
  });

  it('recusa a carga cheia fora de 1 a 20 ou com fração', () => {
    for (const cargaCheia of [0, 21, 5.5, Number.NaN]) {
      expect(conferirHorario({ ...PEDIDO, cargaCheia })).toEqual({
        ok: false,
        erros: { cargaCheia: 'Use um número inteiro de 1 a 20.' },
      });
    }
    expect(conferirHorario({ ...PEDIDO, cargaCheia: 1 }).ok).toBe(true);
    expect(conferirHorario({ ...PEDIDO, cargaCheia: 20 }).ok).toBe(true);
  });

  it('devolve as recusas juntas', () => {
    expect(conferirHorario({ dias: [], inicio: 600, fim: 600, fuso: 'x', cargaCheia: 0 })).toEqual({
      ok: false,
      erros: {
        dias: 'Escolha ao menos um dia.',
        fim: 'O fim vem depois do início.',
        fuso: 'Escolha um fuso da lista.',
        cargaCheia: 'Use um número inteiro de 1 a 20.',
      },
    });
  });
});

describe('minutosDoPrazo e prazoEmMinutos', () => {
  it('o minuto vale ele mesmo, e a hora, 60 min', () => {
    expect(minutosDoPrazo({ valor: 30, unidade: 'min' }, 'horario', PADRAO)).toBe(30);
    expect(minutosDoPrazo({ valor: 8, unidade: 'h' }, 'horario', PADRAO)).toBe(480);
    expect(minutosDoPrazo({ valor: 8, unidade: 'h' }, 'corridas', PADRAO)).toBe(480);
  });

  it('o dia vale 24 h em horas corridas', () => {
    expect(minutosDoPrazo({ valor: 3, unidade: 'd' }, 'corridas', PADRAO)).toBe(3 * 24 * 60);
  });

  it('no horário da TI, o dia útil vale o comprimento de um dia do horário', () => {
    expect(minutosDoPrazo({ valor: 3, unidade: 'd' }, 'horario', PADRAO)).toBe(30 * 60);
    expect(minutosDoPrazo({ valor: 3, unidade: 'd' }, 'horario', { ...PADRAO, fim: 17 * 60 })).toBe(
      27 * 60,
    );
  });

  it('copia o prazo do tipo em minutos, com o valor e a unidade do tipo para o texto', () => {
    expect(
      prazoEmMinutos(
        {
          modo: 'horario',
          resposta: { valor: 1, unidade: 'h' },
          resolucao: { valor: 3, unidade: 'd' },
        },
        PADRAO,
      ),
    ).toEqual({
      modo: 'horario',
      respostaMin: 60,
      resolucaoMin: 1800,
      resposta: { valor: 1, unidade: 'h' },
      resolucao: { valor: 3, unidade: 'd' },
    });
  });
});

describe('rotuloDaUnidadeDoPrazo, textoDoValorDoPrazo e fraseDoPrazo', () => {
  it('escreve o número com a unidade, e o dia do horário da TI como dia útil', () => {
    expect(textoDoValorDoPrazo({ valor: 30, unidade: 'min' }, 'corridas')).toBe('30 min');
    expect(textoDoValorDoPrazo({ valor: 8, unidade: 'h' }, 'horario')).toBe('8 h');
    expect(textoDoValorDoPrazo({ valor: 3, unidade: 'd' }, 'corridas')).toBe('3 dias');
    expect(textoDoValorDoPrazo({ valor: 3, unidade: 'd' }, 'horario')).toBe('3 dias úteis');
  });

  it('põe o dia no singular em 1', () => {
    expect(textoDoValorDoPrazo({ valor: 1, unidade: 'd' }, 'corridas')).toBe('1 dia');
    expect(textoDoValorDoPrazo({ valor: 1, unidade: 'd' }, 'horario')).toBe('1 dia útil');
    expect(textoDoValorDoPrazo({ valor: 1, unidade: 'h' }, 'corridas')).toBe('1 h');
    expect(textoDoValorDoPrazo({ valor: 1, unidade: 'min' }, 'horario')).toBe('1 min');
  });

  it('dá a unidade que segue o número no editor', () => {
    expect(rotuloDaUnidadeDoPrazo({ valor: 3, unidade: 'd' }, 'horario')).toBe('dias úteis');
    expect(rotuloDaUnidadeDoPrazo({ valor: 1, unidade: 'd' }, 'corridas')).toBe('dia');
    expect(rotuloDaUnidadeDoPrazo({ valor: 30, unidade: 'min' }, 'horario')).toBe('min');
    expect(rotuloDaUnidadeDoPrazo({ valor: 8, unidade: 'h' }, 'corridas')).toBe('h');
  });

  it('escreve o prazo do tipo como a frase do editor (m07 e m08)', () => {
    const impressora: PrazoDoTipo = {
      modo: 'horario',
      resposta: { valor: 30, unidade: 'min' },
      resolucao: { valor: 8, unidade: 'h' },
    };
    expect(fraseDoPrazo(impressora)).toBe('Responde em 30 min e resolve em 8 h, no horário da TI');
    expect(fraseDoPrazo({ ...impressora, modo: 'corridas' })).toBe(
      'Responde em 30 min e resolve em 8 h, em horas corridas',
    );
    const trocaDeEquipamento: PrazoDoTipo = {
      modo: 'horario',
      resposta: { valor: 1, unidade: 'h' },
      resolucao: { valor: 3, unidade: 'd' },
    };
    expect(fraseDoPrazo(trocaDeEquipamento)).toBe(
      'Responde em 1 h e resolve em 3 dias úteis, no horário da TI',
    );
  });
});

describe('segundosNoHorario', () => {
  it('em horas corridas, conta todo o tempo: o #1033, aberto às 01:20, às 09:40', () => {
    expect(
      segundosNoHorario(sp('2026-11-17T01:20'), sp('2026-11-17T09:40'), 'corridas', PADRAO),
    ).toBe(8 * HORA + 20 * MINUTO);
  });

  it('no horário da TI, conta das 08:00: o #1042, aberto às 07:40, às 09:40', () => {
    expect(
      segundosNoHorario(sp('2026-11-17T07:40'), sp('2026-11-17T09:40'), 'horario', PADRAO),
    ).toBe(1 * HORA + 40 * MINUTO);
  });

  it('soma o dia anterior: o #1031, aberto ontem às 17:40, às 09:40', () => {
    expect(
      segundosNoHorario(sp('2026-11-16T17:40'), sp('2026-11-17T09:40'), 'horario', PADRAO),
    ).toBe(2 * HORA);
  });

  it('o #1041, aberto ontem às 17:05 e parado às 09:21, tem 2 h 16 min contadas', () => {
    expect(
      segundosNoHorario(sp('2026-11-16T17:05'), sp('2026-11-17T09:21'), 'horario', PADRAO),
    ).toBe(2 * HORA + 16 * MINUTO);
  });

  it('não conta a noite nem o fim de semana', () => {
    expect(
      segundosNoHorario(sp('2026-11-20T18:00'), sp('2026-11-23T08:00'), 'horario', PADRAO),
    ).toBe(0);
    expect(
      segundosNoHorario(sp('2026-11-20T17:00'), sp('2026-11-23T09:00'), 'horario', PADRAO),
    ).toBe(2 * HORA);
  });

  it('conta o sábado quando ele está nos dias do horário', () => {
    const comSabado: HorarioDaTi = { ...PADRAO, dias: [1, 2, 3, 4, 5, 6] };
    expect(
      segundosNoHorario(sp('2026-11-20T17:00'), sp('2026-11-23T09:00'), 'horario', comSabado),
    ).toBe(12 * HORA);
  });

  it('conta a semana inteira: cinco dias de 10 h', () => {
    expect(
      segundosNoHorario(sp('2026-11-16T00:00'), sp('2026-11-23T00:00'), 'horario', PADRAO),
    ).toBe(50 * HORA);
  });

  it('sem tempo, ou com o fim antes do começo, é zero', () => {
    const agora = sp('2026-11-17T09:40');
    expect(segundosNoHorario(agora, agora, 'horario', PADRAO)).toBe(0);
    expect(segundosNoHorario(agora, sp('2026-11-17T09:00'), 'horario', PADRAO)).toBe(0);
    expect(segundosNoHorario(agora, sp('2026-11-17T09:00'), 'corridas', PADRAO)).toBe(0);
  });

  it('arredonda para baixo ao segundo', () => {
    const de = sp('2026-11-17T09:40');
    const quase = (ms: number) => new Date(de.getTime() + ms);
    expect(segundosNoHorario(de, quase(1999), 'corridas', PADRAO)).toBe(1);
    expect(segundosNoHorario(de, quase(999), 'horario', PADRAO)).toBe(0);
    expect(segundosNoHorario(de, quase(60_999), 'horario', PADRAO)).toBe(60);
  });

  it('segue o horário de verão do fuso do horário, como em America/New_York', () => {
    // O verão começa no domingo, 08/03/2026, e acaba no domingo, 01/11/2026.
    expect(
      segundosNoHorario(
        new Date('2026-03-06T17:00:00-05:00'),
        new Date('2026-03-09T09:00:00-04:00'),
        'horario',
        NOVA_YORK,
      ),
    ).toBe(2 * HORA);
    expect(
      segundosNoHorario(
        new Date('2026-10-30T17:00:00-04:00'),
        new Date('2026-11-02T09:00:00-05:00'),
        'horario',
        NOVA_YORK,
      ),
    ).toBe(2 * HORA);
  });
});

describe('momentoEmQueAlcanca', () => {
  it('em horas corridas, soma o tempo: o #1033 de 8 h, aberto às 01:20, vence às 09:20', () => {
    expect(momentoEmQueAlcanca(sp('2026-11-17T01:20'), 8 * HORA, 'corridas', PADRAO)).toEqual(
      sp('2026-11-17T09:20'),
    );
  });

  it('no horário da TI, o #1042 de 8 h, aberto às 07:40, vence às 16:00', () => {
    expect(momentoEmQueAlcanca(sp('2026-11-17T07:40'), 8 * HORA, 'horario', PADRAO)).toEqual(
      sp('2026-11-17T16:00'),
    );
  });

  it('o #1031 de 4 h, aberto ontem às 17:40, vence hoje às 11:40', () => {
    expect(momentoEmQueAlcanca(sp('2026-11-16T17:40'), 4 * HORA, 'horario', PADRAO)).toEqual(
      sp('2026-11-17T11:40'),
    );
  });

  it('o prazo de 3 dias úteis, aberto na sexta às 17:00, vence na quarta às 17:00', () => {
    const prazo = prazoEmMinutos(
      {
        modo: 'horario',
        resposta: { valor: 1, unidade: 'h' },
        resolucao: { valor: 3, unidade: 'd' },
      },
      PADRAO,
    );
    expect(prazo.resolucaoMin).toBe(30 * 60);
    expect(
      momentoEmQueAlcanca(sp('2026-11-20T17:00'), prazo.resolucaoMin * MINUTO, 'horario', PADRAO),
    ).toEqual(sp('2026-11-25T17:00'));
  });

  it('o tempo que acaba no fim da janela vence no fim dela, e não no dia seguinte', () => {
    expect(momentoEmQueAlcanca(sp('2026-11-16T08:00'), 10 * HORA, 'horario', PADRAO)).toEqual(
      sp('2026-11-16T18:00'),
    );
  });

  it('começa na janela seguinte quando parte fora dela', () => {
    expect(momentoEmQueAlcanca(sp('2026-11-20T19:00'), 30 * MINUTO, 'horario', PADRAO)).toEqual(
      sp('2026-11-23T08:30'),
    );
  });

  it('sem tempo que falte, é o próprio momento', () => {
    const agora = sp('2026-11-17T09:40');
    expect(momentoEmQueAlcanca(agora, 0, 'horario', PADRAO)).toEqual(agora);
    expect(momentoEmQueAlcanca(agora, -60, 'corridas', PADRAO)).toEqual(agora);
  });

  it('recusa o horário sem janela, em vez de andar para sempre', () => {
    const agora = sp('2026-11-17T09:40');
    expect(() => momentoEmQueAlcanca(agora, 60, 'horario', { ...PADRAO, dias: [] })).toThrow(
      'O horário da TI não tem janela.',
    );
    expect(() => momentoEmQueAlcanca(agora, 60, 'horario', { ...PADRAO, fim: 480 })).toThrow(
      'O horário da TI não tem janela.',
    );
  });

  it('recusa o tempo que falta que não é de um prazo, em vez de andar para sempre', () => {
    const agora = sp('2026-11-17T09:40');
    // O maior prazo é de 999 dias de 24 h, e o tempo que falta não passa dele. O infinito no
    // horário da TI vem por último: antes da recusa, ele travaria o teste.
    const casos = [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      999 * 24 * HORA + 1,
      Number.POSITIVE_INFINITY,
    ];
    for (const modo of ['corridas', 'horario'] as const) {
      for (const segundos of casos) {
        expect(() => momentoEmQueAlcanca(agora, segundos, modo, PADRAO)).toThrow(
          'O tempo que falta não é de um prazo.',
        );
      }
    }
  });

  it('o maior prazo ainda vence: 999 dias corridos e 999 dias úteis', () => {
    const agora = sp('2026-11-17T09:40');
    expect(momentoEmQueAlcanca(agora, 999 * 24 * HORA, 'corridas', PADRAO)).toEqual(
      new Date(agora.getTime() + 999 * 24 * HORA * 1000),
    );
    // Na terça contam 8 h 20 min; depois, 998 dias inteiros e 1 h 40 min do dia útil seguinte, a
    // segunda-feira 199 semanas e 6 dias depois.
    expect(momentoEmQueAlcanca(agora, 999 * 10 * HORA, 'horario', PADRAO)).toEqual(
      sp('2030-09-16T09:40'),
    );
  });

  it('anda pelas semanas de um dia só, com a janela de um minuto', () => {
    // Só o domingo, das 08:00 às 08:01: 10 min pedem 10 domingos.
    const horario: HorarioDaTi = { ...PADRAO, dias: [7], inicio: 8 * 60, fim: 8 * 60 + 1 };
    expect(momentoEmQueAlcanca(sp('2026-11-17T09:40'), 10 * MINUTO, 'horario', horario)).toEqual(
      sp('2027-01-24T08:01'),
    );
  });

  it('com o horário mudado depois da abertura, o prazo copiado conta até o fim novo', () => {
    // Aberto na segunda às 08:00, com 3 dias úteis das 08:00 às 18:00: 30 h.
    const prazo = prazoEmMinutos(
      {
        modo: 'horario',
        resposta: { valor: 1, unidade: 'h' },
        resolucao: { valor: 3, unidade: 'd' },
      },
      PADRAO,
    );
    // Às 11:00, o fim passa para as 17:00: as 3 h contadas até ali ficam como estavam.
    const novo: HorarioDaTi = { ...PADRAO, fim: 17 * 60 };
    const contado = segundosNoHorario(
      sp('2026-11-16T08:00'),
      sp('2026-11-16T11:00'),
      'horario',
      PADRAO,
    );
    expect(contado).toBe(3 * HORA);
    // As 27 h que faltam contam até as 17:00: 6 h na segunda, 9 h na terça e na quarta, e 3 h na quinta.
    expect(
      momentoEmQueAlcanca(
        sp('2026-11-16T11:00'),
        prazo.resolucaoMin * MINUTO - contado,
        'horario',
        novo,
      ),
    ).toEqual(sp('2026-11-19T11:00'));
    // O chamado de 3 dias úteis aberto depois tem 27 h.
    expect(
      prazoEmMinutos(
        {
          modo: 'horario',
          resposta: { valor: 1, unidade: 'h' },
          resolucao: { valor: 3, unidade: 'd' },
        },
        novo,
      ).resolucaoMin,
    ).toBe(27 * 60);
  });

  it('segue o horário de verão do fuso do horário, como em America/New_York', () => {
    expect(
      momentoEmQueAlcanca(new Date('2026-03-06T17:00:00-05:00'), 2 * HORA, 'horario', NOVA_YORK),
    ).toEqual(new Date('2026-03-09T09:00:00-04:00'));
    expect(
      momentoEmQueAlcanca(new Date('2026-10-30T17:00:00-04:00'), 2 * HORA, 'horario', NOVA_YORK),
    ).toEqual(new Date('2026-11-02T09:00:00-05:00'));
  });
});

describe('noHorarioDaTi', () => {
  it('vale do início até antes do fim, nos dias do horário', () => {
    expect(noHorarioDaTi(sp('2026-11-17T07:59'), PADRAO)).toBe(false);
    expect(noHorarioDaTi(sp('2026-11-17T08:00'), PADRAO)).toBe(true);
    expect(noHorarioDaTi(new Date('2026-11-17T17:59:59-03:00'), PADRAO)).toBe(true);
    expect(noHorarioDaTi(sp('2026-11-17T18:00'), PADRAO)).toBe(false);
    // O sábado está fora do padrão e dentro do horário que o inclui.
    expect(noHorarioDaTi(sp('2026-11-21T10:00'), PADRAO)).toBe(false);
    expect(noHorarioDaTi(sp('2026-11-21T10:00'), { ...PADRAO, dias: [6] })).toBe(true);
  });

  it('lê a hora no fuso do horário', () => {
    // 09:00 em São Paulo são 07:00 em Nova York, no horário padrão de lá.
    expect(noHorarioDaTi(sp('2026-11-17T09:00'), NOVA_YORK)).toBe(false);
    expect(noHorarioDaTi(sp('2026-11-17T11:00'), NOVA_YORK)).toBe(true);
  });
});
