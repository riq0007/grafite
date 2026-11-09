// A leitura SNMP da impressora (spec impressoras-por-snmp, "Leitura das impressoras"; change
// p2b-impressoras-por-snmp, design, decisões 1, 4 e 5), contra o simulador alimentado pelas
// gravações: a impressora que responde, no v1 e no v2c, as leituras montadas pelas regras do domínio
// e aceitas pelo lote, a impressora que não responde e a comunidade errada.
import { createSocket, type Socket } from 'node:dgram';
import { join } from 'node:path';
import { lerLote } from '@grafite/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { iniciarSimuladorSnmp, type SimuladorSnmp } from '../test/simulador-snmp.ts';
import { type LeituraSnmp, leiturasDaImpressora, lerImpressora } from './snmp.ts';

const GRAVACOES = join(import.meta.dirname, '..', 'test', 'gravacoes');
const COMUNIDADE = 'comunidade-de-teste';
const ATIVO = '0199d3a0-0000-7000-8000-0000000000b1';
const MOMENTO = new Date('2026-10-14T13:22:00.000Z');
const QUANDO = MOMENTO.toISOString();
/** O simulador responde na hora; a espera curta deixa rápido o caso de quem não responde. */
const ESPERA = 300;

const simuladores: SimuladorSnmp[] = [];

async function simulador(gravacao: string) {
  const iniciado = await iniciarSimuladorSnmp({
    gravacao: { arquivo: join(GRAVACOES, gravacao) },
    comunidade: COMUNIDADE,
  });
  simuladores.push(iniciado);
  return iniciado;
}

let multifuncional: SimuladorSnmp;

beforeAll(async () => {
  multifuncional = await simulador('multifuncional-colorida.snmprec');
});

afterAll(async () => {
  await Promise.all(simuladores.map((iniciado) => iniciado.fechar()));
});

const ler = (porta: number, versao: '1' | '2c', comunidade = COMUNIDADE) =>
  lerImpressora({ ip: '127.0.0.1', porta, versao, comunidade, espera: ESPERA });

const MULTIFUNCIONAL: LeituraSnmp = {
  respondeu: true,
  serie: '3100R000001',
  suprimentos: [
    { item: 1, descricao: 'Black', capacidade: 100, nivel: 45 },
    { item: 2, descricao: 'Cyan', capacidade: -2, nivel: -3 },
    { item: 3, descricao: 'Magenta', capacidade: 100, nivel: -2 },
    { item: 4, descricao: 'Yellow', capacidade: 100, nivel: 20 },
    { item: 5, descricao: 'Waste Toner Bottle', capacidade: 100, nivel: 70 },
    { item: 6, descricao: 'Fuser Unit', capacidade: 200000, nivel: 150000 },
  ],
  contadores: [
    { item: 1, paginas: 48210, cores: 4 },
    { item: 2, paginas: 17345, cores: 4 },
  ],
  estadoDeErro: [0x40],
  mensagens: ['Sem papel na bandeja 2'],
};

describe('a leitura SNMP da impressora', () => {
  it('recupera os suprimentos pelo GETNEXT quando a HP recusa GETBULK', async () => {
    const hp = await iniciarSimuladorSnmp({
      gravacao: { arquivo: join(GRAVACOES, 'multifuncional-colorida.snmprec') },
      comunidade: COMUNIDADE,
      recusar: 'bulk',
    });
    simuladores.push(hp);
    expect(await ler(hp.porta, '2c')).toEqual(MULTIFUNCIONAL);
  });

  it('não apresenta sucesso vazio quando GETNEXT também falha', async () => {
    const falha = await iniciarSimuladorSnmp({
      gravacao: { arquivo: join(GRAVACOES, 'multifuncional-colorida.snmprec') },
      comunidade: COMUNIDADE,
      recusar: 'tudo',
    });
    simuladores.push(falha);
    expect(await ler(falha.porta, '2c')).toEqual({ respondeu: false });
  });

  it('lê a multifuncional colorida igual no v1, pelo GETNEXT, e no v2c, pelo GETBULK', async () => {
    expect(await ler(multifuncional.porta, '1')).toEqual(MULTIFUNCIONAL);
    expect(await ler(multifuncional.porta, '2c')).toEqual(MULTIFUNCIONAL);
  });

  it('lê a laser de uma cor e a térmica, sem mensagens e sem condições ativas', async () => {
    const laser = await simulador('laser-de-uma-cor.snmprec');
    expect(await ler(laser.porta, '2c')).toEqual({
      respondeu: true,
      serie: 'VNB3K12345',
      suprimentos: [
        { item: 1, descricao: 'Black Toner Cartridge', capacidade: 1000, nivel: 80 },
        { item: 2, descricao: 'Imaging Drum Unit', capacidade: 30000, nivel: 18000 },
      ],
      contadores: [{ item: 1, paginas: 12500, cores: 1 }],
      estadoDeErro: [0],
      mensagens: [],
    });
    const termica = await simulador('termica.snmprec');
    expect(await ler(termica.porta, '1')).toMatchObject({
      respondeu: true,
      serie: '52J000000001',
      contadores: [{ item: 1, paginas: 98112, cores: 1 }],
      mensagens: [],
    });
  });

  it('a impressora que não responde dá só o "não respondeu", depois de uma tentativa a mais', async () => {
    const calada: Socket = createSocket('udp4');
    let recebidos = 0;
    calada.on('message', () => {
      recebidos += 1;
    });
    await new Promise<void>((pronto) => calada.bind(0, '127.0.0.1', pronto));
    try {
      expect(await ler(calada.address().port, '2c')).toEqual({ respondeu: false });
      expect(recebidos).toBe(2);
    } finally {
      calada.close();
    }
  });

  it('a comunidade errada fica sem resposta, como a impressora que não responde', async () => {
    const antes = multifuncional.respondidos();
    expect(await ler(multifuncional.porta, '2c', 'public')).toEqual({ respondeu: false });
    expect(await ler(multifuncional.porta, '1', 'public')).toEqual({ respondeu: false });
    expect(multifuncional.respondidos()).toBe(antes);
  });
});

describe('as leituras da impressora', () => {
  /** O lote com as leituras, como a API o lê. */
  const comoALeLe = (leituras: unknown[]) =>
    lerLote({ chave: '0199d3a0-0000-7000-8000-0000000000c1', leituras }, MOMENTO);

  it('monta as leituras pelas regras do domínio, e o lote aceita todas', () => {
    const leituras = leiturasDaImpressora(ATIVO, MULTIFUNCIONAL, MOMENTO);
    const suprimento = (item: string, valor: number | null, detalhes: object) => ({
      ativoId: ATIVO,
      metrica: 'impressora.suprimento',
      item,
      momento: QUANDO,
      valor,
      detalhes,
    });
    expect(leituras).toEqual([
      { ativoId: ATIVO, metrica: 'snmp.resposta', momento: QUANDO, valor: 'respondeu' },
      { ativoId: ATIVO, metrica: 'impressora.serie', momento: QUANDO, valor: '3100R000001' },
      suprimento('1', 45, { descricao: 'Black', capacidade: 100, nivel: 45 }),
      // "Há suprimento": sem número, com o nível bruto nos detalhes.
      suprimento('2', null, { descricao: 'Cyan', capacidade: -2, nivel: -3 }),
      // O nível que a impressora não mede é "sem dado", nunca 100%.
      suprimento('3', null, { descricao: 'Magenta', capacidade: 100, nivel: -2 }),
      suprimento('4', 20, { descricao: 'Yellow', capacidade: 100, nivel: 20 }),
      suprimento('5', 70, { descricao: 'Waste Toner Bottle', capacidade: 100, nivel: 70 }),
      suprimento('6', 75, { descricao: 'Fuser Unit', capacidade: 200000, nivel: 150000 }),
      {
        ativoId: ATIVO,
        metrica: 'impressora.contador',
        item: '1',
        momento: QUANDO,
        valor: 48210,
        detalhes: { cores: 4 },
      },
      {
        ativoId: ATIVO,
        metrica: 'impressora.contador',
        item: '2',
        momento: QUANDO,
        valor: 17345,
        detalhes: { cores: 4 },
      },
      { ativoId: ATIVO, metrica: 'impressora.condicoes', momento: QUANDO, valor: ['sem-papel'] },
      {
        ativoId: ATIVO,
        metrica: 'impressora.mensagens',
        momento: QUANDO,
        valor: ['Sem papel na bandeja 2'],
      },
    ]);
    const lido = comoALeLe(leituras);
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    expect(
      lido.lote.leituras.map(({ metrica, item, situacao }) => `${metrica}:${item}:${situacao}`),
    ).toEqual([
      'snmp.resposta::valida',
      'impressora.serie::valida',
      'impressora.suprimento:1:valida',
      'impressora.suprimento:2:valida',
      'impressora.suprimento:3:sem-dado',
      'impressora.suprimento:4:valida',
      'impressora.suprimento:5:valida',
      'impressora.suprimento:6:valida',
      'impressora.contador:1:valida',
      'impressora.contador:2:valida',
      'impressora.condicoes::valida',
      'impressora.mensagens::valida',
    ]);
  });

  it('a impressora que não responde dá só o "não respondeu"', () => {
    expect(leiturasDaImpressora(ATIVO, { respondeu: false }, MOMENTO)).toEqual([
      { ativoId: ATIVO, metrica: 'snmp.resposta', momento: QUANDO, valor: 'nao-respondeu' },
    ]);
  });

  it('o suprimento sem capacidade nem nível fica de fora, e o que não cabe no lote é cortado', () => {
    const longo = 'x'.repeat(250);
    const leituras = leiturasDaImpressora(
      ATIVO,
      {
        respondeu: true,
        serie: `  ${longo}  `,
        suprimentos: [
          { item: 1, descricao: 'Ribbon', capacidade: -2, nivel: -2 },
          { item: 2, descricao: longo, capacidade: 100, nivel: -2 },
        ],
        contadores: [{ item: 1, paginas: 98112, cores: null }],
        estadoDeErro: null,
        mensagens: Array.from({ length: 40 }, (_, i) => (i === 0 ? longo : ` Mensagem ${i} `)),
      },
      MOMENTO,
    );
    expect(leituras.map(({ metrica, item }) => `${metrica}:${item ?? ''}`)).toEqual([
      'snmp.resposta:',
      'impressora.serie:',
      'impressora.suprimento:2',
      'impressora.contador:1',
      'impressora.mensagens:',
    ]);
    expect(leituras[1]?.valor).toBe('x'.repeat(200));
    expect(leituras[2]?.detalhes).toEqual({
      descricao: 'x'.repeat(200),
      capacidade: 100,
      nivel: -2,
    });
    expect(leituras[3]).not.toHaveProperty('detalhes');
    const mensagens = leituras[4]?.valor as string[];
    expect(mensagens).toHaveLength(32);
    expect(mensagens.slice(0, 2)).toEqual(['x'.repeat(200), 'Mensagem 1']);
    expect(comoALeLe(leituras).ok).toBe(true);
  });
});
