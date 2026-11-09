import { describe, expect, it } from 'vitest';
import { lerLote } from './lote.ts';
import { INTERVALOS_DAS_METRICAS, METRICAS_COM_ITEM } from './metricas.ts';

const AGORA = new Date('2026-10-12T12:00:00.000Z');
const CHAVE = '0199d3a0-0000-7000-8000-000000000001';
const ATIVO = '0199d3a0-0000-7000-8000-0000000000a1';

const leitura = (extras: Record<string, unknown> = {}) => ({
  ativoId: ATIVO,
  metrica: 'rede.disponibilidade',
  momento: '2026-10-12T11:58:00.000Z',
  valor: 'online',
  ...extras,
});

describe('lerLote', () => {
  it('lê a disponibilidade online, offline e sem dado, e a latência', () => {
    const lido = lerLote(
      {
        chave: CHAVE,
        leituras: [
          leitura(),
          leitura({ metrica: 'rede.latencia', valor: 3.5 }),
          leitura({ ativoId: ATIVO.toUpperCase(), valor: 'offline' }),
          leitura({ valor: null }),
          leitura({ metrica: 'rede.latencia', valor: null }),
        ],
      },
      AGORA,
    );
    expect(lido).toEqual({
      ok: true,
      lote: {
        chave: CHAVE,
        leituras: [
          {
            ativoId: ATIVO,
            metrica: 'rede.disponibilidade',
            momento: new Date('2026-10-12T11:58:00.000Z'),
            valorTexto: 'online',
            valorNumero: null,
            situacao: 'valida',
            item: '',
            detalhes: null,
          },
          {
            ativoId: ATIVO,
            metrica: 'rede.latencia',
            momento: new Date('2026-10-12T11:58:00.000Z'),
            valorTexto: null,
            valorNumero: 3.5,
            situacao: 'valida',
            item: '',
            detalhes: null,
          },
          {
            ativoId: ATIVO,
            metrica: 'rede.disponibilidade',
            momento: new Date('2026-10-12T11:58:00.000Z'),
            valorTexto: 'offline',
            valorNumero: null,
            situacao: 'valida',
            item: '',
            detalhes: null,
          },
          {
            ativoId: ATIVO,
            metrica: 'rede.disponibilidade',
            momento: new Date('2026-10-12T11:58:00.000Z'),
            valorTexto: null,
            valorNumero: null,
            situacao: 'sem-dado',
            item: '',
            detalhes: null,
          },
          {
            ativoId: ATIVO,
            metrica: 'rede.latencia',
            momento: new Date('2026-10-12T11:58:00.000Z'),
            valorTexto: null,
            valorNumero: null,
            situacao: 'sem-dado',
            item: '',
            detalhes: null,
          },
        ],
      },
    });
  });

  it('grava a latência fora de 0 a 2.000 ms como inconsistente, sem recusar', () => {
    const lido = lerLote(
      {
        chave: CHAVE,
        leituras: [
          leitura({ metrica: 'rede.latencia', valor: -5 }),
          leitura({ metrica: 'rede.latencia', valor: 2500 }),
          leitura({ metrica: 'rede.latencia', valor: 2000 }),
        ],
      },
      AGORA,
    );
    expect(lido.ok && lido.lote.leituras.map((lida) => lida.situacao)).toEqual([
      'inconsistente',
      'inconsistente',
      'valida',
    ]);
    expect(lido.ok && lido.lote.leituras[0]?.valorNumero).toBe(-5);
  });

  it('aceita o momento até 5 minutos no futuro e até 30 dias no passado', () => {
    const noLimite = lerLote(
      {
        chave: CHAVE,
        leituras: [
          leitura({ momento: '2026-10-12T12:05:00.000Z' }),
          leitura({ momento: '2026-09-12T12:00:00.000Z' }),
        ],
      },
      AGORA,
    );
    expect(noLimite.ok).toBe(true);
  });

  it('recusa a leitura fora do prazo, dizendo qual', () => {
    expect(
      lerLote(
        { chave: CHAVE, leituras: [leitura(), leitura({ momento: '2026-10-12T12:10:00.000Z' })] },
        AGORA,
      ),
    ).toEqual({ ok: false, erro: 'Leitura 2: o momento está mais de 5 minutos no futuro.' });
    expect(
      lerLote(
        { chave: CHAVE, leituras: [leitura({ momento: '2026-09-12T11:59:00.000Z' })] },
        AGORA,
      ),
    ).toEqual({ ok: false, erro: 'Leitura 1: o momento tem mais de 30 dias.' });
  });

  it('recusa a métrica desconhecida e o valor que não é da métrica', () => {
    expect(
      lerLote({ chave: CHAVE, leituras: [leitura({ metrica: 'snmp.toner' })] }, AGORA),
    ).toEqual({ ok: false, erro: 'Leitura 1: métrica desconhecida: snmp.toner.' });
    expect(lerLote({ chave: CHAVE, leituras: [leitura({ valor: 'talvez' })] }, AGORA)).toEqual({
      ok: false,
      erro: 'Leitura 1: a disponibilidade é online, offline ou sem dado.',
    });
    expect(
      lerLote(
        { chave: CHAVE, leituras: [leitura({ metrica: 'rede.latencia', valor: '3' })] },
        AGORA,
      ),
    ).toEqual({
      ok: false,
      erro: 'Leitura 1: a latência é um número de milissegundos ou sem dado.',
    });
  });

  it('recusa o lote com mais de 1.000 leituras, sem leituras ou sem a chave', () => {
    const muitas = Array.from({ length: 1001 }, () => leitura());
    expect(lerLote({ chave: CHAVE, leituras: muitas }, AGORA)).toEqual({
      ok: false,
      erro: 'O lote tem mais de 1.000 leituras.',
    });
    expect(lerLote({ chave: CHAVE, leituras: [] }, AGORA)).toEqual({
      ok: false,
      erro: 'O lote não tem leituras.',
    });
    expect(lerLote({ chave: 'lote-1', leituras: [leitura()] }, AGORA)).toEqual({
      ok: false,
      erro: 'A chave do lote precisa ser um UUID.',
    });
  });

  it('recusa a leitura sem o ativo ou com o momento inválido', () => {
    expect(lerLote({ chave: CHAVE, leituras: [leitura({ ativoId: 'PAT-1' })] }, AGORA)).toEqual({
      ok: false,
      erro: 'Leitura 1: o ativo precisa ser um UUID.',
    });
    expect(lerLote({ chave: CHAVE, leituras: [leitura({ momento: 'ontem' })] }, AGORA)).toEqual({
      ok: false,
      erro: 'Leitura 1: o momento não é válido.',
    });
  });
});

// As métricas da impressora (change p2b-impressoras-por-snmp, design, decisões 1 e 7): o item de cada
// suprimento e contador, os detalhes do suprimento e os limites de cada valor.
describe('as métricas da impressora no lote', () => {
  const TONER = { descricao: 'Black Toner Cartridge', capacidade: 1000, nivel: 80 };
  const suprimento = (extras: Record<string, unknown> = {}) =>
    leitura({ metrica: 'impressora.suprimento', item: '1', valor: 8, detalhes: TONER, ...extras });
  const lidas = (...leituras: Record<string, unknown>[]) => {
    const lido = lerLote({ chave: CHAVE, leituras }, AGORA);
    if (!lido.ok) throw new Error(lido.erro);
    return lido.lote.leituras.map(
      ({ metrica, item, valorTexto, valorNumero, situacao, detalhes }) => ({
        metrica,
        item,
        valorTexto,
        valorNumero,
        situacao,
        detalhes,
      }),
    );
  };
  const recusa = (...leituras: Record<string, unknown>[]) => {
    const lido = lerLote({ chave: CHAVE, leituras }, AGORA);
    return lido.ok ? null : lido.erro;
  };

  it('lê a resposta, os suprimentos e os contadores com o item, as condições, as mensagens e a série', () => {
    expect(
      lidas(
        leitura({ metrica: 'snmp.resposta', valor: 'respondeu' }),
        suprimento(),
        leitura({ metrica: 'impressora.contador', item: '2', valor: 2300, detalhes: { cores: 4 } }),
        leitura({ metrica: 'impressora.condicoes', valor: ['sem-papel', 'tampa-aberta'] }),
        leitura({ metrica: 'impressora.mensagens', valor: ['Modo de economia de energia'] }),
        leitura({ metrica: 'impressora.serie', valor: ' VNB3K12345 ' }),
      ),
    ).toEqual([
      {
        metrica: 'snmp.resposta',
        item: '',
        valorTexto: 'respondeu',
        valorNumero: null,
        situacao: 'valida',
        detalhes: null,
      },
      {
        metrica: 'impressora.suprimento',
        item: '1',
        valorTexto: null,
        valorNumero: 8,
        situacao: 'valida',
        detalhes: TONER,
      },
      {
        metrica: 'impressora.contador',
        item: '2',
        valorTexto: null,
        valorNumero: 2300,
        situacao: 'valida',
        detalhes: { cores: 4 },
      },
      {
        metrica: 'impressora.condicoes',
        item: '',
        valorTexto: '["sem-papel","tampa-aberta"]',
        valorNumero: null,
        situacao: 'valida',
        detalhes: null,
      },
      {
        metrica: 'impressora.mensagens',
        item: '',
        valorTexto: '["Modo de economia de energia"]',
        valorNumero: null,
        situacao: 'valida',
        detalhes: null,
      },
      {
        metrica: 'impressora.serie',
        item: '',
        valorTexto: 'VNB3K12345',
        valorNumero: null,
        situacao: 'valida',
        detalhes: null,
      },
    ]);
  });

  it('o suprimento que só diz haver suprimento é válido e sem número; o de nível desconhecido, sem dado', () => {
    const [haSuprimento, desconhecido] = lidas(
      suprimento({ valor: null, detalhes: { descricao: 'Black', capacidade: -2, nivel: -3 } }),
      suprimento({
        item: '2',
        valor: null,
        detalhes: { descricao: 'Drum', capacidade: 20000, nivel: -2 },
      }),
    );
    expect(haSuprimento).toMatchObject({ situacao: 'valida', valorNumero: null, valorTexto: null });
    expect(haSuprimento?.detalhes).toEqual({ descricao: 'Black', capacidade: -2, nivel: -3 });
    expect(desconhecido).toMatchObject({ situacao: 'sem-dado', valorNumero: null });
  });

  it('o percentual acima de 100 e o contador negativo são inconsistentes, sem recusar o lote', () => {
    expect(
      lidas(
        suprimento({ valor: 120 }),
        suprimento({ item: '2', valor: 100 }),
        leitura({ metrica: 'impressora.contador', item: '1', valor: -5 }),
        leitura({ metrica: 'impressora.contador', item: '2', valor: 0 }),
      ).map((lida) => [lida.situacao, lida.valorNumero]),
    ).toEqual([
      ['inconsistente', 120],
      ['valida', 100],
      ['inconsistente', -5],
      ['valida', 0],
    ]);
  });

  it('sem resposta, as listas e a série são sem dado', () => {
    expect(
      lidas(
        leitura({ metrica: 'snmp.resposta', valor: 'nao-respondeu' }),
        leitura({ metrica: 'impressora.condicoes', valor: null }),
        leitura({ metrica: 'impressora.serie', valor: '  ' }),
      ).map((lida) => [lida.situacao, lida.valorTexto]),
    ).toEqual([
      ['valida', 'nao-respondeu'],
      ['sem-dado', null],
      ['sem-dado', null],
    ]);
  });

  it('recusa o item fora do formato da métrica', () => {
    const doSuprimento = 'Leitura 1: o item de impressora.suprimento é um número inteiro positivo.';
    expect(recusa(suprimento({ item: 'toner' }))).toBe(doSuprimento);
    expect(recusa(suprimento({ item: '0' }))).toBe(doSuprimento);
    expect(recusa(suprimento({ item: '1.5' }))).toBe(doSuprimento);
    expect(recusa(suprimento({ item: undefined }))).toBe(doSuprimento);
    expect(recusa(leitura({ metrica: 'impressora.contador', item: 2, valor: 10 }))).toBe(
      'Leitura 1: o item de impressora.contador é um número inteiro positivo.',
    );
    expect(recusa(leitura({ item: '1' }))).toBe(
      'Leitura 1: a métrica rede.disponibilidade não tem item.',
    );
  });

  it('recusa o valor fora da forma de cada métrica', () => {
    expect(recusa(leitura({ metrica: 'snmp.resposta', valor: 'talvez' }))).toBe(
      'Leitura 1: a resposta do SNMP é respondeu, nao-respondeu ou sem dado.',
    );
    expect(recusa(suprimento({ valor: '8%' }))).toBe(
      'Leitura 1: o nível do suprimento é um percentual ou sem dado.',
    );
    expect(recusa(leitura({ metrica: 'impressora.contador', item: '1', valor: 1.5 }))).toBe(
      'Leitura 1: o contador é um número inteiro de páginas ou sem dado.',
    );
    const daLista = 'as condições vêm numa lista de até 32 textos de até 200 caracteres.';
    expect(recusa(leitura({ metrica: 'impressora.condicoes', valor: 'sem papel' }))).toBe(
      `Leitura 1: ${daLista}`,
    );
    expect(
      recusa(leitura({ metrica: 'impressora.condicoes', valor: Array(33).fill('sem-papel') })),
    ).toBe(`Leitura 1: ${daLista}`);
    expect(recusa(leitura({ metrica: 'impressora.condicoes', valor: ['fora-de-linha'] }))).toBe(
      'Leitura 1: condição desconhecida: fora-de-linha.',
    );
    expect(recusa(leitura({ metrica: 'impressora.mensagens', valor: ['x'.repeat(201)] }))).toBe(
      'Leitura 1: as mensagens vêm numa lista de até 32 textos de até 200 caracteres.',
    );
    expect(recusa(leitura({ metrica: 'impressora.serie', valor: 12345 }))).toBe(
      'Leitura 1: o número de série é um texto de até 200 caracteres ou sem dado.',
    );
  });

  it('recusa os detalhes fora da forma: o suprimento traz a descrição, a capacidade e o nível', () => {
    const doSuprimento =
      'Leitura 1: o suprimento traz a descrição, a capacidade e o nível que a impressora informa.';
    expect(recusa(suprimento({ detalhes: undefined }))).toBe(doSuprimento);
    expect(recusa(suprimento({ detalhes: { ...TONER, capacidade: '1000' } }))).toBe(doSuprimento);
    expect(recusa(suprimento({ detalhes: { ...TONER, descricao: 'x'.repeat(201) } }))).toBe(
      doSuprimento,
    );
    expect(
      recusa(
        leitura({
          metrica: 'impressora.contador',
          item: '1',
          valor: 1,
          detalhes: { cores: 'duas' },
        }),
      ),
    ).toBe('Leitura 1: os detalhes do contador trazem só o número de cores do marcador.');
    expect(recusa(leitura({ detalhes: { cor: 'preta' } }))).toBe(
      'Leitura 1: a métrica rede.disponibilidade não tem detalhes.',
    );
  });

  it('só o suprimento e o contador têm item, e as métricas do SNMP são lidas a cada 10 minutos', () => {
    expect(METRICAS_COM_ITEM).toEqual(['impressora.suprimento', 'impressora.contador']);
    for (const metrica of [
      'snmp.resposta',
      'impressora.suprimento',
      'impressora.contador',
      'impressora.condicoes',
      'impressora.mensagens',
      'impressora.serie',
    ] as const) {
      expect(INTERVALOS_DAS_METRICAS[metrica]).toBe(600_000);
    }
  });
});

// As métricas da sondagem do Control iD (change p2c-saude-do-control-id, design, decisões 1 e 6): a
// situação entre as quatro, o firmware com o produto e a série, todos sem item, com textos de até
// 100 caracteres.
describe('as métricas da sondagem do Control iD no lote', () => {
  const lidas = (...leituras: Record<string, unknown>[]) => {
    const lido = lerLote({ chave: CHAVE, leituras }, AGORA);
    if (!lido.ok) throw new Error(lido.erro);
    return lido.lote.leituras.map(({ metrica, item, valorTexto, situacao, detalhes }) => ({
      metrica,
      item,
      valorTexto,
      situacao,
      detalhes,
    }));
  };
  const recusa = (...leituras: Record<string, unknown>[]) => {
    const lido = lerLote({ chave: CHAVE, leituras }, AGORA);
    return lido.ok ? null : lido.erro;
  };
  const sondagem = (valor: unknown, extras: Record<string, unknown> = {}) =>
    leitura({ metrica: 'controlid.sondagem', valor, ...extras });

  it('lê a sondagem, o firmware com o produto e a série, sem item', () => {
    expect(
      lidas(
        sondagem('respondendo'),
        leitura({
          metrica: 'controlid.firmware',
          valor: ' 6.12.2 ',
          detalhes: { produto: 'iDAccess Pro' },
        }),
        leitura({ metrica: 'controlid.serie', valor: ' 0M0400/123456 ' }),
      ),
    ).toEqual([
      {
        metrica: 'controlid.sondagem',
        item: '',
        valorTexto: 'respondendo',
        situacao: 'valida',
        detalhes: null,
      },
      {
        metrica: 'controlid.firmware',
        item: '',
        valorTexto: '6.12.2',
        situacao: 'valida',
        detalhes: { produto: 'iDAccess Pro' },
      },
      {
        metrica: 'controlid.serie',
        item: '',
        valorTexto: '0M0400/123456',
        situacao: 'valida',
        detalhes: null,
      },
    ]);
  });

  it('as quatro situações, a resposta inesperada com a etapa e o código, e a sondagem sem dado', () => {
    expect(
      lidas(
        sondagem('respondendo'),
        sondagem('login-recusado'),
        sondagem('sem-resposta'),
        sondagem('resposta-inesperada', { detalhes: { etapa: 'login', codigo: 404 } }),
        sondagem('resposta-inesperada', { detalhes: { etapa: 'informacoes' } }),
        sondagem(null),
      ).map(({ valorTexto, situacao, detalhes }) => [valorTexto, situacao, detalhes]),
    ).toEqual([
      ['respondendo', 'valida', null],
      ['login-recusado', 'valida', null],
      ['sem-resposta', 'valida', null],
      ['resposta-inesperada', 'valida', { etapa: 'login', codigo: 404 }],
      ['resposta-inesperada', 'valida', { etapa: 'informacoes' }],
      [null, 'sem-dado', null],
    ]);
  });

  it('o firmware que o controle não informa e a série vazia são sem dado', () => {
    expect(
      lidas(
        leitura({ metrica: 'controlid.firmware', valor: null, detalhes: { produto: 'iDFlex' } }),
        leitura({ metrica: 'controlid.serie', valor: '   ' }),
      ).map(({ valorTexto, situacao, detalhes }) => [valorTexto, situacao, detalhes]),
    ).toEqual([
      [null, 'sem-dado', { produto: 'iDFlex' }],
      [null, 'sem-dado', null],
    ]);
  });

  it('recusa a situação desconhecida e os textos de mais de 100 caracteres', () => {
    expect(recusa(sondagem('talvez'))).toBe(
      'Leitura 1: a sondagem do Control iD é respondendo, login-recusado, sem-resposta, resposta-inesperada ou sem dado.',
    );
    expect(recusa(leitura({ metrica: 'controlid.firmware', valor: 'x'.repeat(101) }))).toBe(
      'Leitura 1: o firmware é um texto de até 100 caracteres ou sem dado.',
    );
    expect(recusa(leitura({ metrica: 'controlid.serie', valor: 'x'.repeat(101) }))).toBe(
      'Leitura 1: o número de série é um texto de até 100 caracteres ou sem dado.',
    );
    expect(recusa(sondagem('respondendo', { item: '1' }))).toBe(
      'Leitura 1: a métrica controlid.sondagem não tem item.',
    );
  });

  it('recusa os detalhes fora da forma da sondagem e do firmware', () => {
    const daSondagem =
      'Leitura 1: os detalhes da sondagem trazem a etapa, login ou informacoes, e o código HTTP.';
    expect(recusa(sondagem('resposta-inesperada', { detalhes: { etapa: 'logout' } }))).toBe(
      daSondagem,
    );
    expect(
      recusa(sondagem('resposta-inesperada', { detalhes: { etapa: 'login', codigo: '404' } })),
    ).toBe(daSondagem);
    expect(
      recusa(
        leitura({
          metrica: 'controlid.firmware',
          valor: '6.12.2',
          detalhes: { produto: 'x'.repeat(101) },
        }),
      ),
    ).toBe('Leitura 1: os detalhes do firmware trazem só o produto, com até 100 caracteres.');
    expect(recusa(leitura({ metrica: 'controlid.serie', valor: 'A1', detalhes: { a: 1 } }))).toBe(
      'Leitura 1: a métrica controlid.serie não tem detalhes.',
    );
  });

  it('as métricas da sondagem são lidas a cada 5 minutos', () => {
    for (const metrica of [
      'controlid.sondagem',
      'controlid.firmware',
      'controlid.serie',
    ] as const) {
      expect(INTERVALOS_DAS_METRICAS[metrica]).toBe(300_000);
    }
  });
});
