// A coleta SNMP das impressoras pela API (spec coletor-local, "Configuração da coleta",
// impressoras-por-snmp, "Leitura das impressoras", e cofre-de-segredos, "Comunidade SNMP usada pelo
// coletor"; change p2b-impressoras-por-snmp, design, decisão 4): o alvo da impressora traz o SNMP a
// cada 10 minutos, com a versão do tipo e a comunidade decifrada só para o coletor, sem revelação na
// auditoria; sem segredo, ou com ele inativo, vale a public, e com o Cofre desligado a escolhida
// continua.
import { randomUUID } from 'node:crypto';
import {
  ativos,
  auditoria,
  campos,
  estadoDosAtivos,
  naOrganizacao,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CofreDeTeste,
  ligarOCofre,
  montarCofre,
  mudarSituacaoDoSegredo,
} from '../../test/cofre.ts';
import { type ApiDeTeste, abrirApi, clienteDoColetor } from '../../test/integracao.ts';
import { criarColetor } from '../coleta/coletores.ts';

const host = 'grafite.coleta-snmp.local';
const TOKEN = `token-do-coletor-de-jundiai-${'x'.repeat(40)}`;
const COMUNIDADE = 'c0mun1dade-das-impressoras';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';
const ids: Record<string, string> = {};
const id = (nome: string) => ids[nome] ?? '';

async function tipo(nome: string, capacidades: string[], configuracao: Record<string, unknown>) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        icone: 'impressora',
        capacidades,
        configuracaoDasCapacidades: configuracao,
      })
      .returning({ id: tiposDeAtivo.id });
    return linha?.id ?? '';
  });
}

async function ativo(tipoId: string, ip: string) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId,
        busca: '',
        valores: { [id('ip')]: ip },
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return linha?.id ?? '';
  });
}

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip' })
      .returning({ id: campos.id });
    ids.ip = ip?.id ?? '';
  });
  const segredo = await cofre.cliente.enviar('POST', '/cofre/segredos', cofre.como('ana'), {
    nome: 'Comunidade das impressoras',
    tipo: 'comunidade-snmp',
    classificacao: 'equipamento',
    valor: COMUNIDADE,
  });
  expect(segredo.statusCode, segredo.body).toBe(201);
  ids.comunidade = segredo.json().id;
  ids.impressora = await tipo('Impressora', ['rede.disponibilidade', 'snmp.suprimentos'], {
    'rede.disponibilidade': { campoDoIp: id('ip') },
    'snmp.suprimentos': { campoDoIp: id('ip'), versao: '2c', segredoId: id('comunidade') },
  });
  ids.publica = await tipo('Impressora térmica', ['snmp.suprimentos'], {
    'snmp.suprimentos': { campoDoIp: id('ip'), versao: '1', segredoId: null },
  });
  ids.soPing = await tipo('Switch', ['rede.disponibilidade'], {
    'rede.disponibilidade': { campoDoIp: id('ip') },
  });
  ids.pat412 = await ativo(id('impressora'), '10.0.5.20');
  ids.termica = await ativo(id('publica'), '10.0.5.30');
  ids.switch = await ativo(id('soPing'), '10.0.5.40');
  ids.coletor = await naOrganizacao(api.banco, org, async (tx) => {
    const criado = await criarColetor(tx, {
      nome: 'Coletor de Jundiaí',
      faixas: ['10.0.5.0/24'],
      token: TOKEN,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    });
    return criado.id;
  });
});

afterAll(async () => {
  await api?.fechar();
});

const coletor = () => clienteDoColetor(api, host, TOKEN);

async function coletasDe(ativoId: string) {
  const r = await coletor().configuracao();
  expect(r.statusCode, r.body).toBe(200);
  const alvos = r.json().alvos as { ativoId: string; ip: string; coletas: object[] }[];
  return alvos.filter((alvo) => alvo.ativoId === ativoId);
}

describe('a coleta SNMP na configuração do coletor', () => {
  it('o alvo da impressora traz o ping a cada 2 minutos e o SNMP a cada 10, com a comunidade do cofre', async () => {
    expect(await coletasDe(id('pat412'))).toEqual([
      {
        ativoId: id('pat412'),
        ip: '10.0.5.20',
        coletas: [
          { tipo: 'ping', intervalo: 120 },
          { tipo: 'snmp', intervalo: 600, versao: '2c', comunidade: COMUNIDADE },
        ],
      },
    ]);
  });

  it('sem o segredo, a comunidade é a public, na versão do tipo', async () => {
    expect(await coletasDe(id('termica'))).toEqual([
      {
        ativoId: id('termica'),
        ip: '10.0.5.30',
        coletas: [{ tipo: 'snmp', intervalo: 600, versao: '1', comunidade: 'public' }],
      },
    ]);
  });

  it('com o segredo inativo, a configuração seguinte traz a public', async () => {
    await mudarSituacaoDoSegredo(api, org, id('comunidade'), 'inativo');
    try {
      const [alvo] = await coletasDe(id('pat412'));
      expect(alvo?.coletas).toContainEqual({
        tipo: 'snmp',
        intervalo: 600,
        versao: '2c',
        comunidade: 'public',
      });
    } finally {
      await mudarSituacaoDoSegredo(api, org, id('comunidade'), 'ativo');
    }
  });

  it('com o Cofre desligado, a comunidade escolhida continua', async () => {
    await ligarOCofre(api, org, false);
    try {
      const [alvo] = await coletasDe(id('pat412'));
      expect(alvo?.coletas).toContainEqual({
        tipo: 'snmp',
        intervalo: 600,
        versao: '2c',
        comunidade: COMUNIDADE,
      });
    } finally {
      await ligarOCofre(api, org, true);
    }
  });

  it('decifrar a comunidade para o coletor não registra revelação na auditoria', async () => {
    const doSegredo = () =>
      naOrganizacao(api.banco, org, (tx) =>
        tx
          .select({ acao: auditoria.acao })
          .from(auditoria)
          .where(eq(auditoria.alvoId, id('comunidade'))),
      );
    const antes = await doSegredo();
    await coletasDe(id('pat412'));
    expect(await doSegredo()).toEqual(antes);
    expect(antes.map((registro) => registro.acao)).not.toContain('segredo.revelado');
  });
});

// O lote das impressoras (spec coletor-local, "Lotes de leituras", leituras-e-estado, "Estado atual",
// e impressoras-por-snmp, "Número de série pela coleta"; change p2b-impressoras-por-snmp, design,
// decisão 7).
describe('o lote das impressoras', () => {
  const TONER = { descricao: 'Black Toner Cartridge', capacidade: 1000, nivel: 80 };
  const CILINDRO = { descricao: 'Imaging Drum Unit', capacidade: 20000, nivel: 12000 };
  const momento = () => new Date(api.relogio.agora().getTime() - 60_000).toISOString();
  const leitura = (ativoId: string, metrica: string, valor: unknown, extras: object = {}) => ({
    ativoId,
    metrica,
    momento: momento(),
    valor,
    ...extras,
  });
  const lote = (...leituras: object[]) => coletor().lote({ chave: randomUUID(), leituras });

  it('grava o estado de cada suprimento e contador à parte, com o item e os detalhes', async () => {
    const r = await lote(
      leitura(id('pat412'), 'snmp.resposta', 'respondeu'),
      leitura(id('pat412'), 'impressora.suprimento', 8, { item: '1', detalhes: TONER }),
      leitura(id('pat412'), 'impressora.suprimento', 60, { item: '2', detalhes: CILINDRO }),
      leitura(id('pat412'), 'impressora.contador', 12500, { item: '1', detalhes: { cores: 1 } }),
      leitura(id('pat412'), 'impressora.condicoes', ['sem-papel']),
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ gravadas: 5, ignoradas: 0, repetido: false });
    const estado = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({
          metrica: estadoDosAtivos.metrica,
          item: estadoDosAtivos.item,
          valorNumero: estadoDosAtivos.valorNumero,
          valorTexto: estadoDosAtivos.valorTexto,
          detalhes: estadoDosAtivos.detalhes,
        })
        .from(estadoDosAtivos)
        .where(eq(estadoDosAtivos.ativoId, id('pat412')))
        .orderBy(asc(estadoDosAtivos.metrica), asc(estadoDosAtivos.item)),
    );
    expect(estado).toEqual([
      {
        metrica: 'impressora.condicoes',
        item: '',
        valorNumero: null,
        valorTexto: '["sem-papel"]',
        detalhes: null,
      },
      {
        metrica: 'impressora.contador',
        item: '1',
        valorNumero: 12500,
        valorTexto: null,
        detalhes: { cores: 1 },
      },
      {
        metrica: 'impressora.suprimento',
        item: '1',
        valorNumero: 8,
        valorTexto: null,
        detalhes: TONER,
      },
      {
        metrica: 'impressora.suprimento',
        item: '2',
        valorNumero: 60,
        valorTexto: null,
        detalhes: CILINDRO,
      },
      {
        metrica: 'snmp.resposta',
        item: '',
        valorNumero: null,
        valorTexto: 'respondeu',
        detalhes: null,
      },
    ]);
  });

  it('a leitura SNMP de quem não é alvo da coleta SNMP é ignorada, e a do ping dele fica', async () => {
    const r = await lote(
      leitura(id('switch'), 'snmp.resposta', 'respondeu'),
      leitura(id('switch'), 'impressora.suprimento', 50, { item: '1', detalhes: TONER }),
      leitura(id('switch'), 'rede.disponibilidade', 'online'),
      // A térmica é alvo só do SNMP: o ping dela é ignorado.
      leitura(id('termica'), 'rede.disponibilidade', 'online'),
      leitura(id('termica'), 'snmp.resposta', 'nao-respondeu'),
    );
    expect(r.json()).toEqual({ gravadas: 2, ignoradas: 3, repetido: false });
  });

  it('o número de série lido grava o campo com a origem coleta, a auditoria pelo coletor e o evento', async () => {
    const r = await lote(leitura(id('pat412'), 'impressora.serie', 'VNB3K12345'));
    expect(r.json()).toMatchObject({ gravadas: 1 });
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ serie: ativos.serie, estado: ativos.estado, busca: ativos.busca })
        .from(ativos)
        .where(eq(ativos.id, id('pat412'))),
    );
    expect(linha?.serie).toBe('VNB3K12345');
    expect(linha?.busca).toContain('vnb3k12345');
    const estado = (linha?.estado ?? {}) as Record<string, object>;
    expect(estado['ativo.serie']).toMatchObject({
      origem: 'coleta',
      autorId: null,
      coletorId: id('coletor'),
      trava: false,
    });
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({
          acao: auditoria.acao,
          atorTipo: auditoria.atorTipo,
          atorDescricao: auditoria.atorDescricao,
          depois: auditoria.depois,
        })
        .from(auditoria)
        .where(and(eq(auditoria.alvoId, id('pat412')), eq(auditoria.acao, 'ativo.alterado'))),
    );
    expect(registros).toMatchObject([
      {
        acao: 'ativo.alterado',
        atorTipo: 'sistema',
        atorDescricao: 'coletor: Coletor de Jundiaí',
        depois: { campos: { 'Número de série': 'VNB3K12345' } },
      },
    ]);
    // A mesma série de novo não grava nada.
    await lote(leitura(id('pat412'), 'impressora.serie', 'VNB3K12345'));
    const depois = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ acao: auditoria.acao })
        .from(auditoria)
        .where(and(eq(auditoria.alvoId, id('pat412')), eq(auditoria.acao, 'ativo.alterado'))),
    );
    expect(depois).toHaveLength(1);
  });

  it('a série travada continua, e nada vai para a auditoria', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(ativos)
        .set({
          serie: 'ABC123',
          estado: {
            'ativo.serie': { origem: 'manual', momento: null, autorId: null, trava: true },
          },
        })
        .where(eq(ativos.id, id('termica'))),
    );
    await lote(leitura(id('termica'), 'impressora.serie', 'VNB3K99999'));
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ serie: ativos.serie })
        .from(ativos)
        .where(eq(ativos.id, id('termica'))),
    );
    expect(linha?.serie).toBe('ABC123');
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ acao: auditoria.acao })
        .from(auditoria)
        .where(and(eq(auditoria.alvoId, id('termica')), eq(auditoria.acao, 'ativo.alterado'))),
    );
    expect(registros).toEqual([]);
  });
});

// O painel Suprimentos na ficha e as colunas Suprimentos e Total de páginas (spec
// impressoras-por-snmp, "Painel Suprimentos", e cadastro-de-ativos; change p2b-impressoras-por-snmp,
// design, decisão 8).
describe('o painel Suprimentos e as colunas', () => {
  const TONER = { descricao: 'Black Toner Cartridge', capacidade: 1000, nivel: 80 };
  const CILINDRO = { descricao: 'Imaging Drum Unit', capacidade: 20000, nivel: 24000 };
  const lote = (...leituras: object[]) => coletor().lote({ chave: randomUUID(), leituras });
  const quando = (minutos: number) =>
    new Date(api.relogio.agora().getTime() - minutos * 60_000).toISOString();
  const leitura = (
    ativoId: string,
    metrica: string,
    valor: unknown,
    extras: object = {},
    momento = quando(1),
  ) => ({ ativoId, metrica, momento, valor, ...extras });
  const ficha = async (ativoId: string) =>
    (await cofre.cliente.consultar(`/ativos/${ativoId}`, cofre.como('ana'))).json();

  it('a ficha da impressora mostra a resposta, os suprimentos, os contadores, as condições e as mensagens', async () => {
    const pat = await ativo(id('impressora'), '10.0.5.50');
    const M = quando(1);
    const r = await lote(
      leitura(pat, 'snmp.resposta', 'respondeu'),
      leitura(pat, 'impressora.suprimento', 8, { item: '1', detalhes: TONER }),
      leitura(pat, 'impressora.suprimento', null, {
        item: '2',
        detalhes: { descricao: 'Cyan', capacidade: -2, nivel: -3 },
      }),
      leitura(pat, 'impressora.suprimento', null, {
        item: '3',
        detalhes: { descricao: 'Fuser Kit', capacidade: 100000, nivel: -2 },
      }),
      leitura(pat, 'impressora.suprimento', 120, { item: '10', detalhes: CILINDRO }),
      leitura(pat, 'impressora.contador', 12500, { item: '1', detalhes: { cores: 4 } }),
      leitura(pat, 'impressora.contador', 2300, { item: '2' }),
      leitura(pat, 'impressora.condicoes', ['sem-papel', 'tampa-aberta']),
      leitura(pat, 'impressora.mensagens', ['Modo de economia de energia']),
    );
    expect(r.json()).toMatchObject({ gravadas: 9, ignoradas: 0 });
    expect((await ficha(pat)).painelDeSuprimentos).toEqual({
      motivo: null,
      resposta: { situacao: 'respondeu', momento: M, desde: M, coletor: 'Coletor de Jundiaí' },
      suprimentos: [
        {
          item: '1',
          descricao: 'Black Toner Cartridge',
          tipo: 'toner',
          nivel: { tipo: 'medido', percentual: 8 },
          momento: M,
        },
        {
          item: '2',
          descricao: 'Cyan',
          tipo: 'toner',
          nivel: { tipo: 'ha-suprimento' },
          momento: M,
        },
        {
          item: '3',
          descricao: 'Fuser Kit',
          tipo: 'fusor',
          nivel: { tipo: 'sem-dado' },
          momento: M,
        },
        {
          item: '10',
          descricao: 'Imaging Drum Unit',
          tipo: 'cilindro',
          nivel: { tipo: 'inconsistente', valor: 120 },
          momento: M,
        },
      ],
      contadores: [
        { item: '1', rotulo: 'Total de páginas', paginas: 12500, inconsistente: false, momento: M },
        { item: '2', rotulo: 'Páginas coloridas', paginas: 2300, inconsistente: false, momento: M },
      ],
      paginasEmPretoEBranco: 10200,
      condicoes: {
        itens: [
          { chave: 'sem-papel', rotulo: 'Sem papel', severidade: 'critico' },
          { chave: 'tampa-aberta', rotulo: 'Tampa aberta', severidade: 'critico' },
        ],
        momento: M,
      },
      mensagens: { itens: ['Modo de economia de energia'], momento: M },
      menor: { nivel: 8, descricao: 'Black Toner Cartridge', momento: M },
      total: { paginas: 12500, momento: M },
    });
  });

  it('sem resposta, mostra "não respondeu" desde a leitura, com os suprimentos da última resposta', async () => {
    const pat = await ativo(id('impressora'), '10.0.5.51');
    const antes = quando(15);
    const agora = quando(5);
    await lote(
      leitura(pat, 'snmp.resposta', 'respondeu', {}, antes),
      leitura(pat, 'impressora.suprimento', 40, { item: '1', detalhes: TONER }, antes),
    );
    await lote(leitura(pat, 'snmp.resposta', 'nao-respondeu', {}, agora));
    const painel = (await ficha(pat)).painelDeSuprimentos;
    expect(painel.resposta).toEqual({
      situacao: 'nao-respondeu',
      momento: agora,
      desde: agora,
      coletor: 'Coletor de Jundiaí',
    });
    expect(painel.suprimentos).toEqual([
      expect.objectContaining({
        item: '1',
        nivel: { tipo: 'medido', percentual: 40 },
        momento: antes,
      }),
    ]);
  });

  it('sem leitura, diz por que não foi verificada; o ativo de outro tipo e o inativo não têm o painel', async () => {
    const nova = await ativo(id('impressora'), '10.0.5.52');
    expect((await ficha(nova)).painelDeSuprimentos).toEqual({
      motivo: 'Aguardando a primeira leitura.',
      resposta: null,
      suprimentos: [],
      contadores: [],
      paginasEmPretoEBranco: null,
      condicoes: null,
      mensagens: null,
      menor: null,
      total: null,
    });
    const longe = await ativo(id('impressora'), '10.9.0.5');
    expect((await ficha(longe)).painelDeSuprimentos.motivo).toBe(
      'Nenhum coletor alcança o IP 10.9.0.5.',
    );
    expect((await ficha(id('switch'))).painelDeSuprimentos).toBeNull();
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(ativos).set({ situacao: 'inativo' }).where(eq(ativos.id, nova)),
    );
    expect((await ficha(nova)).painelDeSuprimentos).toBeNull();
  });

  it('as colunas Suprimentos e Total de páginas ordenam pelo número e filtram "de e até"', async () => {
    const baixa = await ativo(id('impressora'), '10.0.5.60');
    const cheia = await ativo(id('impressora'), '10.0.5.61');
    await lote(
      leitura(baixa, 'snmp.resposta', 'respondeu'),
      leitura(cheia, 'snmp.resposta', 'respondeu'),
      leitura(baixa, 'impressora.suprimento', 15, { item: '1', detalhes: TONER }),
      leitura(baixa, 'impressora.suprimento', 70, { item: '2', detalhes: CILINDRO }),
      leitura(baixa, 'impressora.contador', 900, { item: '1' }),
      leitura(cheia, 'impressora.suprimento', 95, { item: '1', detalhes: TONER }),
      leitura(cheia, 'impressora.contador', 50000, { item: '1' }),
    );
    const lista = async (parametros: Record<string, string>) => {
      const r = await cofre.cliente.consultar(
        `/ativos?${new URLSearchParams({
          colunas: 'coleta.suprimentos,coleta.paginas',
          limite: '100',
          ...parametros,
        }).toString()}`,
        cofre.como('ana'),
      );
      expect(r.statusCode, r.body).toBe(200);
      return r.json().itens as { id: string; suprimentos?: unknown }[];
    };
    const ate20 = await lista({
      ordem: 'coleta.suprimentos',
      direcao: 'crescente',
      filtros: JSON.stringify([{ chave: 'coleta.suprimentos', operador: 'entre', ate: 20 }]),
    });
    type ItemComSuprimentos = {
      menor: { nivel: number } | null;
      total: { paginas: number } | null;
    };
    const niveis = ate20.map((item) => (item.suprimentos as ItemComSuprimentos).menor?.nivel ?? -1);
    expect(niveis.every((nivel) => nivel >= 0 && nivel <= 20)).toBe(true);
    expect(niveis).toEqual([...niveis].sort((a, b) => a - b));
    expect(ate20.map((item) => item.id)).toContain(baixa);
    expect(ate20.map((item) => item.id)).not.toContain(cheia);
    expect(ate20.find((item) => item.id === baixa)?.suprimentos).toEqual({
      menor: { nivel: 15, descricao: 'Black Toner Cartridge', momento: quando(1) },
      total: { paginas: 900, momento: quando(1) },
    });
    const pelasPaginas = await lista({
      ordem: 'coleta.paginas',
      direcao: 'decrescente',
      filtros: JSON.stringify([{ chave: 'coleta.paginas', operador: 'entre', de: 800 }]),
    });
    const paginas = pelasPaginas.map(
      (item) => (item.suprimentos as ItemComSuprimentos).total?.paginas ?? -1,
    );
    expect(pelasPaginas[0]?.id).toBe(cheia);
    expect(pelasPaginas.at(-1)?.id).toBe(baixa);
    expect(paginas).toEqual([...paginas].sort((a, b) => b - a));
  });
});
