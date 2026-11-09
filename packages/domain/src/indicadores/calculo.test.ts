// O cálculo dos indicadores sobre os alertas do período (spec indicadores; change p3d-indicadores,
// design, decisão 1): o tempo de atendimento do toner, o tempo até reconhecer o Crítico, a
// disponibilidade dos ativos e os alertas que voltam.
import { describe, expect, it } from 'vitest';
import {
  type AlertaParaOsIndicadores,
  calcularIndicadores,
  indicadorDaDisponibilidade,
  indicadorDoCritico,
  indicadorDoToner,
  indicadorQueVolta,
  periodoDosIndicadores,
} from './calculo.ts';

const AGORA = new Date('2026-10-14T12:00:00.000Z');
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const antes = (ms: number) => new Date(AGORA.getTime() - ms);

interface Alvo {
  nome: string;
}

let sequencia = 0;

/** Um alerta do toner aberto há `abriu` e trocado depois de `durou`, com o resto de fábrica. */
function alerta(
  mudancas: Partial<AlertaParaOsIndicadores<Alvo>> = {},
): AlertaParaOsIndicadores<Alvo> {
  sequencia += 1;
  return {
    id: `alerta-${sequencia}`,
    condicao: 'toner.nivel',
    regra: { id: 'regra-toner', nome: 'Toner em 10% ou menos' },
    severidade: 'critico',
    texto: 'Black Toner Cartridge em 8%',
    alvoChave: `ativo:${sequencia}`,
    alvo: { nome: `Impressora ${sequencia}` },
    observadoEm: antes(5 * DIA),
    abertoEm: antes(5 * DIA),
    reconhecidoEm: null,
    reconhecidoPor: null,
    resolvidoEm: null,
    comoTerminou: null,
    abertoNoSilencio: false,
    ...mudancas,
  };
}

/** Um toner trocado: abriu há `abriuHa` e terminou pela troca depois de `durou`. */
const trocado = (
  abriuHa: number,
  durou: number,
  mudancas: Partial<AlertaParaOsIndicadores<Alvo>> = {},
) =>
  alerta({
    abertoEm: antes(abriuHa),
    observadoEm: antes(abriuHa),
    resolvidoEm: antes(abriuHa - durou),
    comoTerminou: 'voltou-ao-normal',
    ...mudancas,
  });

const periodo = periodoDosIndicadores(AGORA);

describe('periodoDosIndicadores', () => {
  it('são os últimos 30 dias até agora, com os 30 anteriores', () => {
    expect(periodo).toEqual({
      inicio: new Date('2026-09-14T12:00:00.000Z'),
      fim: AGORA,
      inicioDoAnterior: new Date('2026-08-15T12:00:00.000Z'),
    });
  });
});

describe('indicadorDoToner', () => {
  it('Mediana dos toners trocados: lista o que passou da meta', () => {
    const lento = trocado(10 * DIA, 4 * DIA);
    const resultado = indicadorDoToner(
      [trocado(9 * DIA, DIA), trocado(8 * DIA, 1.5 * DIA), lento],
      periodo,
      2 * 24 * 60,
    );
    expect(resultado).toMatchObject({
      valor: 1.5 * 24 * 60,
      anterior: null,
      base: 3,
      situacao: 'dentro',
      mais: 0,
    });
    expect(resultado.itens).toEqual([
      {
        id: lento.id,
        texto: lento.texto,
        alvo: lento.alvo,
        minutos: 4 * 24 * 60,
        esperando: false,
        reconhecidoPor: null,
      },
    ]);
  });

  it('a mediana de uma quantidade par é a média das duas do meio, e passa da meta', () => {
    const resultado = indicadorDoToner(
      [
        trocado(9 * DIA, DIA),
        trocado(8 * DIA, 3 * DIA),
        trocado(7 * DIA, 4 * DIA),
        trocado(6 * DIA, 5 * DIA),
      ],
      periodo,
      2 * 24 * 60,
    );
    expect(resultado.valor).toBe(3.5 * 24 * 60);
    expect(resultado.situacao).toBe('fora');
  });

  it('Toner ainda esperando: vem primeiro, com o tempo até agora', () => {
    const esperando = alerta({ abertoEm: antes(3 * DIA), observadoEm: antes(3 * DIA) });
    const recente = alerta({ abertoEm: antes(DIA), observadoEm: antes(DIA) });
    const lento = trocado(10 * DIA, 4 * DIA);
    const resultado = indicadorDoToner([lento, recente, esperando], periodo, 2 * 24 * 60);
    expect(
      resultado.itens.map(({ id, minutos, esperando: espera }) => [id, minutos, espera]),
    ).toEqual([
      [esperando.id, 3 * 24 * 60, true],
      [lento.id, 4 * 24 * 60, false],
    ]);
  });

  it('Regra que deixou de valer: o alerta encerrado não entra', () => {
    const resultado = indicadorDoToner(
      [trocado(9 * DIA, 5 * DIA, { comoTerminou: 'regra-deixou-de-valer' }), trocado(8 * DIA, DIA)],
      periodo,
      2 * 24 * 60,
    );
    expect(resultado).toMatchObject({ valor: 24 * 60, base: 1, itens: [] });
  });

  it('compara com os toners trocados nos 30 dias anteriores', () => {
    const resultado = indicadorDoToner(
      [trocado(40 * DIA, 2.3 * DIA), trocado(5 * DIA, 1.5 * DIA)],
      periodo,
      2 * 24 * 60,
    );
    expect(resultado.valor).toBe(1.5 * 24 * 60);
    expect(resultado.anterior).toBeCloseTo(2.3 * 24 * 60);
  });

  it('sem toner trocado no período, fica sem dado, mas lista o que espera', () => {
    const esperando = alerta({ abertoEm: antes(3 * DIA) });
    const resultado = indicadorDoToner([trocado(40 * DIA, DIA), esperando], periodo, 2 * 24 * 60);
    expect(resultado).toMatchObject({
      valor: null,
      anterior: 24 * 60,
      base: 0,
      situacao: 'sem-dado',
    });
    expect(resultado.itens.map(({ id }) => id)).toEqual([esperando.id]);
  });

  it('deixa de fora as outras condições e o alerta que abriu no silêncio', () => {
    const resultado = indicadorDoToner(
      [
        trocado(9 * DIA, 5 * DIA, { condicao: 'rede.offline' }),
        trocado(9 * DIA, 5 * DIA, { abertoNoSilencio: true }),
        alerta({ abertoEm: antes(9 * DIA), abertoNoSilencio: true }),
      ],
      periodo,
      2 * 24 * 60,
    );
    expect(resultado).toMatchObject({ valor: null, base: 0, itens: [] });
  });

  it('corta a lista em 20 e diz quantos ficaram de fora', () => {
    const lentos = Array.from({ length: 23 }, (_, indice) =>
      trocado(25 * DIA, (3 + indice / 10) * DIA),
    );
    const resultado = indicadorDoToner(lentos, periodo, 2 * 24 * 60);
    expect(resultado.itens).toHaveLength(20);
    expect(resultado.mais).toBe(3);
    // Do mais demorado para o mais rápido.
    expect(resultado.itens[0]?.minutos).toBeCloseTo(5.2 * 24 * 60);
  });
});

describe('indicadorDoCritico', () => {
  const critico = (mudancas: Partial<AlertaParaOsIndicadores<Alvo>>) =>
    alerta({ condicao: 'rede.offline', severidade: 'critico', ...mudancas });

  it('é a mediana do tempo até o reconhecimento dos Críticos abertos no período', () => {
    const resultado = indicadorDoCritico(
      [
        critico({
          abertoEm: antes(5 * DIA),
          reconhecidoEm: antes(5 * DIA - 10 * MINUTO),
          reconhecidoPor: 'Ana Souza',
        }),
        critico({
          abertoEm: antes(4 * DIA),
          reconhecidoEm: antes(4 * DIA - 20 * MINUTO),
          reconhecidoPor: 'Ana Souza',
        }),
        critico({
          abertoEm: antes(3 * DIA),
          reconhecidoEm: antes(3 * DIA - 50 * MINUTO),
          reconhecidoPor: 'Bruno Lima',
        }),
      ],
      periodo,
      30,
    );
    expect(resultado).toMatchObject({ valor: 20, base: 3, situacao: 'dentro' });
    expect(resultado.itens).toEqual([
      expect.objectContaining({ minutos: 50, reconhecidoPor: 'Bruno Lima', esperando: false }),
    ]);
  });

  it('Crítico sem reconhecimento: entra com o tempo desde a abertura', () => {
    const resultado = indicadorDoCritico([critico({ abertoEm: antes(2 * HORA) })], periodo, 30);
    expect(resultado).toMatchObject({ valor: 120, situacao: 'fora' });
    expect(resultado.itens).toEqual([
      expect.objectContaining({ minutos: 120, reconhecidoPor: null, esperando: true }),
    ]);
  });

  it('Crítico que se resolveu sozinho: não entra', () => {
    const resultado = indicadorDoCritico(
      [
        critico({
          abertoEm: antes(DIA),
          resolvidoEm: antes(DIA - 10 * MINUTO),
          comoTerminou: 'voltou-ao-normal',
        }),
      ],
      periodo,
      30,
    );
    expect(resultado).toMatchObject({ valor: null, base: 0, situacao: 'sem-dado', itens: [] });
  });

  it('deixa de fora as outras severidades, o silêncio e o que abriu antes do período', () => {
    const resultado = indicadorDoCritico(
      [
        critico({ severidade: 'atencao', abertoEm: antes(DIA) }),
        critico({ abertoNoSilencio: true, abertoEm: antes(DIA) }),
        critico({ abertoEm: antes(31 * DIA), reconhecidoEm: antes(31 * DIA - 5 * MINUTO) }),
      ],
      periodo,
      30,
    );
    expect(resultado).toMatchObject({ valor: null, anterior: 5, base: 0 });
  });
});

describe('indicadorDaDisponibilidade', () => {
  /** Uma queda do ativo, de `comecou` atrás até `terminou` atrás, ou ainda sem resposta. */
  const queda = (
    alvoChave: string,
    comecou: number,
    terminou: number | null,
    mudancas: Partial<AlertaParaOsIndicadores<Alvo>> = {},
  ) =>
    alerta({
      condicao: 'rede.offline',
      regra: { id: 'regra-offline', nome: 'Ativo offline' },
      severidade: 'atencao',
      texto: 'Sem resposta ao ping',
      alvoChave,
      alvo: { nome: alvoChave },
      observadoEm: antes(comecou),
      abertoEm: antes(comecou - 5 * MINUTO),
      resolvidoEm: terminou === null ? null : antes(terminou),
      comoTerminou: terminou === null ? null : 'voltou-ao-normal',
      ...mudancas,
    });

  it('Ativo abaixo da meta: soma as quedas do período desde que a falta de resposta começou', () => {
    const resultado = indicadorDaDisponibilidade(
      [
        queda('impressora-rh', 10 * DIA, 10 * DIA - 10 * HORA),
        queda('impressora-rh', 3 * DIA, 3 * DIA - 8 * HORA),
      ],
      periodo,
      990,
      true,
    );
    expect(resultado).toMatchObject({ valor: 1, base: 1, situacao: 'fora', mais: 0 });
    expect(resultado.itens).toEqual([
      { alvo: { nome: 'impressora-rh' }, porMil: 975, minutosForaDoAr: 18 * 60 },
    ]);
  });

  it('Queda que começou antes do período: só a parte de dentro entra', () => {
    const resultado = indicadorDaDisponibilidade(
      [queda('switch', 32 * DIA, 29 * DIA)],
      periodo,
      990,
      true,
    );
    expect(resultado.itens).toEqual([
      { alvo: { nome: 'switch' }, porMil: 966, minutosForaDoAr: 24 * 60 },
    ]);
  });

  it('a queda ainda aberta conta até agora, e duas regras na mesma queda contam uma vez', () => {
    const resultado = indicadorDaDisponibilidade(
      [
        queda('switch', 12 * HORA, null),
        queda('switch', 12 * HORA, null, { regra: { id: 'outra', nome: 'Switch offline' } }),
      ],
      periodo,
      990,
      true,
    );
    expect(resultado.itens).toEqual([
      { alvo: { nome: 'switch' }, porMil: 983, minutosForaDoAr: 12 * 60 },
    ]);
  });

  it('lista da menor disponibilidade para a maior, e o ativo na meta fica de fora', () => {
    const resultado = indicadorDaDisponibilidade(
      [
        queda('a', 10 * DIA, 10 * DIA - 8 * HORA),
        queda('b', 10 * DIA, 9 * DIA),
        // 7 h 12 min em 30 dias é 99% exato: na meta, não abaixo dela.
        queda('c', 10 * DIA, 10 * DIA - 7.2 * HORA),
      ],
      periodo,
      990,
      true,
    );
    expect(resultado.itens.map(({ alvo }) => alvo.nome)).toEqual(['b', 'a']);
    expect(resultado).toMatchObject({ valor: 2, base: 3 });
  });

  it('compara com os ativos abaixo da meta nos 30 dias anteriores', () => {
    const resultado = indicadorDaDisponibilidade(
      [queda('a', 40 * DIA, 39 * DIA), queda('b', 45 * DIA, 44 * DIA)],
      periodo,
      990,
      true,
    );
    expect(resultado).toMatchObject({ valor: 0, anterior: 2, base: 0, situacao: 'dentro' });
  });

  it('sem a regra de ativo offline ativa, fica sem dado', () => {
    const resultado = indicadorDaDisponibilidade(
      [queda('a', 10 * DIA, 9 * DIA)],
      periodo,
      990,
      false,
    );
    expect(resultado).toMatchObject({
      valor: null,
      anterior: null,
      situacao: 'sem-dado',
      itens: [],
    });
  });

  it('deixa de fora a queda que abriu no silêncio e as outras condições', () => {
    const resultado = indicadorDaDisponibilidade(
      [
        queda('a', 10 * DIA, 9 * DIA, { abertoNoSilencio: true }),
        queda('b', 10 * DIA, 9 * DIA, { condicao: 'controlid.situacao' }),
      ],
      periodo,
      990,
      true,
    );
    expect(resultado).toMatchObject({ valor: 0, base: 0, itens: [] });
  });
});

describe('indicadorQueVolta', () => {
  const abriu = (
    alvoChave: string,
    ha: number,
    mudancas: Partial<AlertaParaOsIndicadores<Alvo>> = {},
  ) =>
    alerta({
      condicao: 'rede.offline',
      regra: { id: 'regra-offline', nome: 'Ativo offline' },
      alvoChave,
      alvo: { nome: alvoChave },
      observadoEm: antes(ha),
      abertoEm: antes(ha),
      resolvidoEm: antes(ha - HORA),
      comoTerminou: 'voltou-ao-normal',
      ...mudancas,
    });

  it('Switch que cai sempre: o mesmo alerta 4 vezes no período', () => {
    const resultado = indicadorQueVolta(
      [
        abriu('switch-2', 20 * DIA),
        abriu('switch-2', 15 * DIA),
        abriu('switch-2', 9 * DIA),
        abriu('switch-2', 2 * DIA),
        abriu('impressora', 3 * DIA),
      ],
      periodo,
      3,
    );
    expect(resultado).toMatchObject({ valor: 1, base: 5, situacao: 'fora', mais: 0 });
    expect(resultado.itens).toEqual([
      {
        alvo: { nome: 'switch-2' },
        regra: { id: 'regra-offline', nome: 'Ativo offline' },
        vezes: 4,
        ultimaEm: antes(2 * DIA),
      },
    ]);
  });

  it('conta cada regra à parte, e abaixo da meta fica dentro', () => {
    const toner = { id: 'regra-toner', nome: 'Toner em 10% ou menos' };
    const resultado = indicadorQueVolta(
      [
        abriu('impressora', 20 * DIA),
        abriu('impressora', 10 * DIA),
        abriu('impressora', 5 * DIA, { regra: toner }),
      ],
      periodo,
      3,
    );
    expect(resultado).toMatchObject({ valor: 0, situacao: 'dentro', itens: [] });
  });

  it('ordena pelas vezes e, nas mesmas vezes, pela mais recente', () => {
    const vezes = (alvoChave: string, quantas: number, ultima: number) =>
      Array.from({ length: quantas }, (_, indice) => abriu(alvoChave, ultima + indice * HORA));
    const resultado = indicadorQueVolta(
      [...vezes('a', 3, 5 * DIA), ...vezes('b', 5, 9 * DIA), ...vezes('c', 3, DIA)],
      periodo,
      3,
    );
    expect(resultado.itens.map(({ alvo, vezes: quantas }) => [alvo.nome, quantas])).toEqual([
      ['b', 5],
      ['c', 3],
      ['a', 3],
    ]);
  });

  it('deixa de fora o silêncio e compara com os 30 dias anteriores', () => {
    const resultado = indicadorQueVolta(
      [
        abriu('a', 5 * DIA, { abertoNoSilencio: true }),
        abriu('a', 4 * DIA, { abertoNoSilencio: true }),
        abriu('a', 3 * DIA, { abertoNoSilencio: true }),
        abriu('b', 40 * DIA),
        abriu('b', 41 * DIA),
        abriu('b', 42 * DIA),
      ],
      periodo,
      3,
    );
    expect(resultado).toMatchObject({ valor: 0, anterior: 1, base: 0 });
  });
});

describe('calcularIndicadores', () => {
  it('Ativo em manutenção: o alerta do silêncio não entra na disponibilidade nem nos que voltam', () => {
    const manutencao = (ha: number) =>
      alerta({
        condicao: 'rede.offline',
        regra: { id: 'regra-offline', nome: 'Ativo offline' },
        severidade: 'atencao',
        alvoChave: 'impressora-rh',
        observadoEm: antes(ha),
        abertoEm: antes(ha),
        resolvidoEm: antes(ha - DIA),
        comoTerminou: 'voltou-ao-normal',
        abertoNoSilencio: true,
      });
    const resultado = calcularIndicadores(
      [manutencao(9 * DIA), manutencao(6 * DIA), manutencao(3 * DIA)],
      {
        agora: AGORA,
        metas: { toner: 2880, critico: 30, disponibilidade: 990, 'que-voltam': 3 },
        regraDeOfflineAtiva: true,
      },
    );
    expect(resultado.periodo).toEqual(periodo);
    expect(resultado.disponibilidade).toMatchObject({ valor: 0, situacao: 'dentro', itens: [] });
    expect(resultado['que-voltam']).toMatchObject({ valor: 0, situacao: 'dentro', itens: [] });
  });

  it('calcula os quatro com as metas da organização', () => {
    const resultado = calcularIndicadores([trocado(5 * DIA, 3 * DIA)], {
      agora: AGORA,
      metas: { toner: 4 * 24 * 60, critico: 30, disponibilidade: 990, 'que-voltam': 3 },
      regraDeOfflineAtiva: false,
    });
    expect(resultado.toner).toMatchObject({ valor: 3 * 24 * 60, situacao: 'dentro' });
    expect(resultado.critico).toMatchObject({ valor: null, situacao: 'sem-dado' });
    expect(resultado.disponibilidade).toMatchObject({ valor: null, situacao: 'sem-dado' });
    expect(resultado['que-voltam']).toMatchObject({ valor: 0, situacao: 'dentro' });
  });
});
