// Os indicadores pela API (spec indicadores, "Quem vê os indicadores", "Alertas que entram nos
// indicadores" e os quatro indicadores; change p3d-indicadores, design, decisões 1 e 6): os alertas
// dos últimos 60 dias pelo alcance da conta, as metas da organização, o alvo com o local e quem
// reconheceu pelo nome atual.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AlertasDeTeste,
  criarAlerta,
  criarAtivoDoTipo,
  criarColetor,
  criarRegra,
  criarTipo,
  desligarModulos,
  montarAlertas,
  type UsuarioDosAlertas,
} from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';

const host = 'grafite.indicadores.local';
const ORGANIZACAO = { tipo: 'organizacao', id: null } as const;
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

let api: ApiDeTeste;
let alertas: AlertasDeTeste;
const ids: Record<string, string> = {};

const antes = (ms: number) => new Date(api.relogio.agora().getTime() - ms);

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  const { org } = alertas;
  const impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['snmp.suprimentos'],
  });
  ids.doRh = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora do RH',
    patrimonio: 'PAT-00412',
    localId: alertas.jundiai,
  });
  ids.deCampinas = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora de Campinas',
    patrimonio: 'PAT-00500',
    localId: alertas.campinas,
  });
  ids.coletor = await criarColetor(api, org, { nome: 'Coletor de Jundiaí' });
  ids.toner = await criarRegra(api, org, {
    nome: 'Toner em 10% ou menos',
    condicao: 'toner.nivel',
    parametros: { limite: 10, folga: 5 },
    duracao: 0,
    severidade: 'critico',
    escopo: ORGANIZACAO,
  });
  ids.offline = await criarRegra(api, org, {
    nome: 'Ativo offline',
    condicao: 'rede.offline',
    parametros: {},
    duracao: 5,
    severidade: 'atencao',
    escopo: ORGANIZACAO,
  });
  ids.semContato = await criarRegra(api, org, {
    nome: 'Coletor sem contato',
    condicao: 'coletor.sem-contato',
    parametros: { minutos: 10 },
    duracao: 0,
    severidade: 'critico',
    escopo: ORGANIZACAO,
  });

  // O toner do RH, trocado depois de 1 dia, reconhecido por Ana em 10 min.
  ids.trocadoNoRh = await criarAlerta(api, org, {
    regraId: ids.toner,
    ativoId: ids.doRh,
    item: '1',
    texto: 'Black Toner Cartridge em 8%',
    abertoHa: (5 * DIA) / MINUTO,
    reconhecidoPor: alertas.contas.ana.id,
    reconhecidoEm: antes(5 * DIA - 10 * MINUTO),
    situacao: 'resolvido',
    resolvidoEm: antes(4 * DIA),
    comoTerminou: 'voltou-ao-normal',
  });
  // O toner de Campinas, trocado depois de 4 dias, sem reconhecimento.
  ids.trocadoEmCampinas = await criarAlerta(api, org, {
    regraId: ids.toner,
    ativoId: ids.deCampinas,
    item: '1',
    texto: 'Black Toner Cartridge em 6%',
    abertoHa: (6 * DIA) / MINUTO,
    situacao: 'resolvido',
    resolvidoEm: antes(2 * DIA),
    comoTerminou: 'voltou-ao-normal',
  });
  // Regra que deixou de valer: o magenta de Campinas, reconhecido por Bruno em 45 min, não entra no
  // toner, mas entra no Crítico.
  ids.magenta = await criarAlerta(api, org, {
    regraId: ids.toner,
    ativoId: ids.deCampinas,
    item: '3',
    texto: 'Magenta Toner Cartridge em 5%',
    abertoHa: (8 * DIA) / MINUTO,
    reconhecidoPor: alertas.contas.bruno.id,
    reconhecidoEm: antes(8 * DIA - 45 * MINUTO),
    situacao: 'resolvido',
    resolvidoEm: antes(7 * DIA),
    comoTerminou: 'regra-deixou-de-valer',
  });
  // Toner ainda esperando: o ciano do RH, aberto há 3 dias.
  ids.esperando = await criarAlerta(api, org, {
    regraId: ids.toner,
    ativoId: ids.doRh,
    item: '2',
    texto: 'Cyan Toner Cartridge em 7%',
    abertoHa: (3 * DIA) / MINUTO,
  });
  // O coletor sem contato há 2 h, sem reconhecimento.
  ids.doColetor = await criarAlerta(api, org, {
    regraId: ids.semContato,
    coletorId: ids.coletor,
    texto: 'Coletor sem contato',
    abertoHa: 120,
  });
  // A impressora de Campinas ficou 18 h sem responder.
  await criarAlerta(api, org, {
    regraId: ids.offline,
    ativoId: ids.deCampinas,
    texto: 'Sem resposta ao ping',
    severidade: 'atencao',
    abertoHa: (10 * DIA) / MINUTO,
    situacao: 'resolvido',
    resolvidoEm: antes(10 * DIA - 18 * HORA),
    comoTerminou: 'voltou-ao-normal',
  });
  // Ativo em manutenção: as quedas da impressora do RH abriram com ela silenciada.
  for (const dias of [9, 6, 3]) {
    await criarAlerta(api, org, {
      regraId: ids.offline,
      ativoId: ids.doRh,
      texto: 'Sem resposta ao ping',
      severidade: 'atencao',
      abertoHa: (dias * DIA) / MINUTO,
      abertoNoSilencio: true,
      situacao: 'resolvido',
      resolvidoEm: antes(dias * DIA - DIA),
      comoTerminou: 'voltou-ao-normal',
    });
  }
});

afterAll(async () => {
  await api?.fechar();
});

const consultar = (usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.consultar('/alertas/indicadores', alertas.como(usuario));

describe('GET /alertas/indicadores', () => {
  it('calcula os quatro com os alertas da organização inteira, as metas e o período', async () => {
    const r = await consultar();
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.periodo).toEqual({
      inicio: antes(30 * DIA).toISOString(),
      fim: api.relogio.agora().toISOString(),
    });
    expect(corpo.permite).toEqual({ mudarMeta: true });

    // Toner ainda esperando: vem primeiro, e o de Campinas passou da meta de 2 dias.
    expect(corpo.indicadores.toner).toMatchObject({
      meta: 2880,
      metaDeFabrica: 2880,
      valor: 2.5 * 24 * 60,
      anterior: null,
      base: 2,
      situacao: 'fora',
      mais: 0,
    });
    expect(corpo.indicadores.toner.itens).toEqual([
      {
        alerta: { id: ids.esperando, texto: 'Cyan Toner Cartridge em 7%' },
        alvo: {
          tipo: 'ativo',
          id: ids.doRh,
          nome: 'Impressora do RH',
          local: 'Jundiaí',
        },
        minutos: 3 * 24 * 60,
        esperando: true,
        reconhecidoPor: null,
      },
      expect.objectContaining({
        alerta: { id: ids.trocadoEmCampinas, texto: 'Black Toner Cartridge em 6%' },
        minutos: 4 * 24 * 60,
        esperando: false,
      }),
    ]);

    // O Crítico trocado sem reconhecimento não entra; o do RH esperou 10 min, o magenta 45 min, o
    // do coletor 2 h e o ciano 3 dias.
    expect(corpo.indicadores.critico).toMatchObject({
      meta: 30,
      valor: (45 + 120) / 2,
      base: 4,
      situacao: 'fora',
    });
    expect(
      corpo.indicadores.critico.itens.map((item: { alerta: { id: string }; minutos: number }) => [
        item.alerta.id,
        item.minutos,
      ]),
    ).toEqual([
      [ids.esperando, 3 * 24 * 60],
      [ids.doColetor, 120],
      [ids.magenta, 45],
    ]);
    expect(corpo.indicadores.critico.itens[1].alvo).toEqual({
      tipo: 'coletor',
      id: ids.coletor,
      nome: 'Coletor de Jundiaí',
    });

    // Ativo em manutenção: as quedas do RH abriram no silêncio e não entram.
    expect(corpo.indicadores.disponibilidade).toMatchObject({
      meta: 990,
      valor: 1,
      base: 1,
      situacao: 'fora',
    });
    expect(corpo.indicadores.disponibilidade.itens).toEqual([
      {
        alvo: {
          tipo: 'ativo',
          id: ids.deCampinas,
          nome: 'Impressora de Campinas',
          local: 'Campinas',
        },
        porMil: 975,
        minutosForaDoAr: 18 * 60,
      },
    ]);
    expect(corpo.indicadores['que-voltam']).toMatchObject({
      meta: 3,
      valor: 0,
      situacao: 'dentro',
      itens: [],
    });
  });

  it('traz quem reconheceu pelo nome atual', async () => {
    const r = await consultar();
    const magenta = r
      .json()
      .indicadores.critico.itens.find(
        (item: { alerta: { id: string } }) => item.alerta.id === ids.magenta,
      );
    expect(magenta).toMatchObject({ reconhecidoPor: 'Bruno Lima', esperando: false });
  });

  it('Conta de um local: calcula só com os alertas dos ativos de Campinas, sem os do coletor', async () => {
    const r = await consultar('bruno');
    expect(r.statusCode).toBe(200);
    const { indicadores, permite } = r.json();
    expect(permite).toEqual({ mudarMeta: false });
    expect(indicadores.toner).toMatchObject({ valor: 4 * 24 * 60, base: 1, situacao: 'fora' });
    expect(indicadores.critico).toMatchObject({ valor: 45, base: 1, situacao: 'fora' });
    expect(indicadores.disponibilidade).toMatchObject({ valor: 1 });
  });

  it('quem só vê os alertas vê os indicadores, sem mudar a meta', async () => {
    const r = await consultar('davi');
    expect(r.statusCode).toBe(200);
    expect(r.json().permite).toEqual({ mudarMeta: false });
  });

  it('recusa quem não vê os alertas', async () => {
    expect((await consultar('carla')).statusCode).toBe(403);
  });

  it('recusa com o módulo Alertas desligado', async () => {
    await desligarModulos(api, alertas.org, ['alertas']);
    try {
      const r = await consultar();
      expect(r.statusCode).toBe(403);
      expect(r.json().type).toBe('urn:grafite:problema:modulo-desligado');
    } finally {
      await desligarModulos(api, alertas.org, []);
    }
  });
});
