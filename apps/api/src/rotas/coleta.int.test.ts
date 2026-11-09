// A conversa do coletor com a API (spec coletor-local, "Identificação do coletor na API" e
// "Configuração da coleta"; design do P2a, decisões 1, 2 e 6): o coletor fala pelo endereço da
// organização e se identifica pelo token, sem sessão; o último contato e a versão ficam gravados; e a
// configuração traz os ativos que ele coleta, pela faixa mais específica que alcança o IP de cada um.
import { randomUUID } from 'node:crypto';
import {
  ativos,
  campos,
  coletores,
  estadoDosAtivos,
  eventos,
  leituras,
  lotesDaColeta,
  naOrganizacao,
  organizacoes,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  clienteDoColetor,
  criarConta,
  criarOrganizacao,
  criarPerfil,
} from '../../test/integracao.ts';
import { criarColetor } from '../coleta/coletores.ts';

const host = 'grafite.coleta.local';
const outroHost = 'grafite.coleta-b.local';

let api: ApiDeTeste;
let org = '';
let outra = '';
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const id = (nome: string) => ids[nome] ?? '';
const token = (nome: string) => tokens[nome] ?? '';

async function novoColetor(orgId: string, nome: string, faixas: string[]) {
  tokens[nome] = `token-${normalizarTexto(nome).replaceAll(' ', '-')}-${'x'.repeat(40)}`;
  const coletor = await naOrganizacao(api.banco, orgId, (tx) =>
    criarColetor(tx, {
      nome,
      faixas,
      token: token(nome),
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    }),
  );
  ids[nome] = coletor.id;
}

/** Um ativo, direto no banco, do tipo e com o IP dados. */
function criarAtivo(
  tipoId: string,
  ip: string | null,
  situacao: 'ativo' | 'inativo' = 'ativo',
  nome: string | null = null,
) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [ativo] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId,
        nome,
        busca: nome ? normalizarTexto(nome) : '',
        situacao,
        valores: ip ? { [id('ip')]: ip } : {},
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return ativo?.id ?? '';
  });
}

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  outra = await criarOrganizacao(api, { nome: 'Outra', enderecos: [outroHost] });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });

  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip' })
      .returning({ id: campos.id });
    ids.ip = ip?.id ?? '';
    const tipo = async (nome: string, comPing: boolean) => {
      const [linha] = await tx
        .insert(tiposDeAtivo)
        .values({
          orgId: org,
          nome,
          nomeNormalizado: normalizarTexto(nome),
          icone: 'impressora',
          capacidades: comPing ? ['rede.disponibilidade'] : [],
          configuracaoDasCapacidades: comPing
            ? { 'rede.disponibilidade': { campoDoIp: id('ip') } }
            : {},
        })
        .returning({ id: tiposDeAtivo.id });
      return linha?.id ?? '';
    };
    ids.impressora = await tipo('Impressora', true);
    ids.tipoComputador = await tipo('Computador', false);
  });

  await novoColetor(org, 'Coletor da unidade', ['10.0.0.0/16']);
  await novoColetor(org, 'Coletor da expedição', ['10.0.5.0/24']);
  await novoColetor(org, 'Coletor parado', ['10.0.0.0/8']);
  await naOrganizacao(api.banco, org, (tx) =>
    tx
      .update(coletores)
      .set({ situacao: 'inativo' })
      .where(eq(coletores.id, id('Coletor parado'))),
  );
  await novoColetor(outra, 'Coletor da outra', ['10.0.0.0/8']);

  ids.daExpedicao = await criarAtivo(id('impressora'), '10.0.5.20');
  ids.daUnidade = await criarAtivo(id('impressora'), '10.0.6.1');
  ids.longe = await criarAtivo(id('impressora'), '10.9.0.5');
  ids.inativa = await criarAtivo(id('impressora'), '10.0.5.21', 'inativo');
  ids.semIp = await criarAtivo(id('impressora'), null);
  ids.computador = await criarAtivo(id('tipoComputador'), '10.0.5.22');
});

afterAll(async () => {
  await api?.fechar();
});

const contato = async (nome: string) => {
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ em: coletores.ultimoContatoEm, versao: coletores.versao })
      .from(coletores)
      .where(eq(coletores.id, id(nome))),
  );
  return linha;
};

describe('identificação do coletor', () => {
  it('pede a configuração pelo endereço da organização e grava o último contato e a versão', async () => {
    const r = await clienteDoColetor(api, host, token('Coletor da unidade')).configuracao();
    expect(r.statusCode).toBe(200);
    expect(await contato('Coletor da unidade')).toEqual({
      em: api.relogio.agora(),
      versao: '0.3.0',
    });
  });

  it('grava o contato no máximo uma vez por minuto, ou quando a versão muda', async () => {
    const pedir = (versao = '0.3.0') =>
      clienteDoColetor(api, host, token('Coletor da expedição'), versao).configuracao();
    await pedir();
    const primeiro = await contato('Coletor da expedição');
    api.relogio.avancar(30_000);
    await pedir();
    expect(await contato('Coletor da expedição')).toEqual(primeiro);
    await pedir('0.4.0');
    expect(await contato('Coletor da expedição')).toEqual({
      em: api.relogio.agora(),
      versao: '0.4.0',
    });
    api.relogio.avancar(61_000);
    await pedir('0.4.0');
    expect((await contato('Coletor da expedição'))?.em).toEqual(api.relogio.agora());
  });

  it('recusa o token de outra organização, o do coletor inativo, o trocado e o ausente', async () => {
    const recusas = [
      await clienteDoColetor(api, host, token('Coletor da outra')).configuracao(),
      await clienteDoColetor(api, outroHost, token('Coletor da unidade')).configuracao(),
      await clienteDoColetor(api, host, token('Coletor parado')).configuracao(),
      await clienteDoColetor(api, host, 'token-que-ninguem-tem').configuracao(),
      await clienteDoColetor(api, host, '').configuracao({ authorization: '' }),
    ];
    for (const r of recusas) {
      expect(r.statusCode).toBe(401);
      expect(r.json().detail).toBe('Token do coletor recusado.');
    }
  });

  it('não aceita a sessão de uma conta, e as telas não aceitam o token do coletor', async () => {
    const carla = await clienteDaApi(api, host).entrar('carla');
    const comSessao = await clienteDoColetor(api, host, '').configuracao({
      authorization: '',
      cookie: carla.cookie,
    });
    expect(comSessao.statusCode).toBe(401);
    const tela = await api.app.inject({
      method: 'GET',
      url: '/ativos',
      headers: { host, authorization: `Bearer ${token('Coletor da unidade')}` },
    });
    expect(tela.statusCode).toBe(401);
  });
});

describe('configuração da coleta', () => {
  const alvos = async (nome: string) => {
    const r = await clienteDoColetor(api, host, token(nome)).configuracao();
    expect(r.statusCode).toBe(200);
    return r.json();
  };

  it('traz as faixas do coletor e os ativos dele, pela faixa mais específica', async () => {
    expect(await alvos('Coletor da expedição')).toEqual({
      faixas: ['10.0.5.0/24'],
      alvos: [
        {
          ativoId: id('daExpedicao'),
          ip: '10.0.5.20',
          coletas: [{ tipo: 'ping', intervalo: 120 }],
        },
      ],
      proximaEm: 300,
    });
    expect(
      (await alvos('Coletor da unidade')).alvos.map((alvo: { ativoId: string }) => alvo.ativoId),
    ).toEqual([id('daUnidade')]);
  });

  it('deixa de fora o ativo inativo, o sem IP, o de tipo sem a disponibilidade e o longe', async () => {
    const todos = [
      ...(await alvos('Coletor da expedição')).alvos,
      ...(await alvos('Coletor da unidade')).alvos,
    ].map((alvo: { ativoId: string }) => alvo.ativoId);
    for (const fora of ['inativa', 'semIp', 'computador', 'longe']) {
      expect(todos).not.toContain(id(fora));
    }
  });

  it('com o módulo Ativos desligado, a configuração vem sem alvos', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(organizacoes)
        .set({ modulosDesligados: ['ativos'] })
        .where(eq(organizacoes.id, org)),
    );
    try {
      expect((await alvos('Coletor da expedição')).alvos).toEqual([]);
    } finally {
      await naOrganizacao(api.banco, org, (tx) =>
        tx.update(organizacoes).set({ modulosDesligados: [] }).where(eq(organizacoes.id, org)),
      );
    }
  });
});

describe('lotes', () => {
  const daExpedicao = () => clienteDoColetor(api, host, token('Coletor da expedição'));
  const minutosAtras = (minutos: number) =>
    new Date(api.relogio.agora().getTime() - minutos * 60_000).toISOString();
  const leitura = (
    ativoId: string,
    minutos: number,
    valor: string | number | null,
    metrica = 'rede.disponibilidade',
  ) => ({ ativoId, metrica, momento: minutosAtras(minutos), valor });
  const lote = (...itens: ReturnType<typeof leitura>[]) => ({
    chave: randomUUID(),
    leituras: itens,
  });

  const novoAlvo = (ip: string) => criarAtivo(id('impressora'), ip);
  const serie = (ativoId: string) =>
    naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({
          metrica: leituras.metrica,
          valorTexto: leituras.valorTexto,
          valorNumero: leituras.valorNumero,
          situacao: leituras.situacao,
        })
        .from(leituras)
        .where(eq(leituras.ativoId, ativoId))
        .orderBy(asc(leituras.momento), asc(leituras.metrica)),
    );
  const estado = async (ativoId: string, metrica = 'rede.disponibilidade') => {
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({
          momento: estadoDosAtivos.momento,
          desde: estadoDosAtivos.desde,
          valorTexto: estadoDosAtivos.valorTexto,
          valorNumero: estadoDosAtivos.valorNumero,
          situacao: estadoDosAtivos.situacao,
        })
        .from(estadoDosAtivos)
        .where(and(eq(estadoDosAtivos.ativoId, ativoId), eq(estadoDosAtivos.metrica, metrica))),
    );
    return linha;
  };
  const eventosDaDisponibilidade = () =>
    naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({
          alvoId: eventos.alvoId,
          permissao: eventos.permissao,
          locais: eventos.locais,
        })
        .from(eventos)
        .where(eq(eventos.tipo, 'disponibilidade.mudou')),
    );
  const limparEventos = () => naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));

  it('grava o lote numa transação, e o reenvio da mesma chave não duplica nada', async () => {
    const alvo = await novoAlvo('10.0.5.30');
    const pedido = lote(leitura(alvo, 1, 'online'), leitura(alvo, 1, 3.5, 'rede.latencia'));
    const primeiro = await daExpedicao().lote(pedido);
    expect(primeiro.statusCode).toBe(200);
    expect(primeiro.json()).toEqual({ gravadas: 2, ignoradas: 0, repetido: false });
    const reenvio = await daExpedicao().lote(pedido);
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json()).toEqual({ gravadas: 2, ignoradas: 0, repetido: true });
    expect(await serie(alvo)).toEqual([
      {
        metrica: 'rede.disponibilidade',
        valorTexto: 'online',
        valorNumero: null,
        situacao: 'valida',
      },
      { metrica: 'rede.latencia', valorTexto: null, valorNumero: 3.5, situacao: 'valida' },
    ]);
    const [guardado] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ gravadas: lotesDaColeta.gravadas, coletorId: lotesDaColeta.coletorId })
        .from(lotesDaColeta)
        .where(eq(lotesDaColeta.chave, pedido.chave)),
    );
    expect(guardado).toEqual({ gravadas: 2, coletorId: id('Coletor da expedição') });
  });

  it('ignora a leitura do ativo que não existe, do inativo e do que é de outro coletor', async () => {
    const alvo = await novoAlvo('10.0.5.31');
    const r = await daExpedicao().lote(
      lote(
        leitura(alvo, 1, 'online'),
        leitura(id('daUnidade'), 1, 'online'),
        leitura(id('inativa'), 1, 'online'),
        leitura(randomUUID(), 1, 'offline'),
      ),
    );
    expect(r.json()).toEqual({ gravadas: 1, ignoradas: 3, repetido: false });
    expect(await serie(id('daUnidade'))).toEqual([]);
  });

  it('recusa o lote com a leitura do futuro, a métrica desconhecida ou mais de 1.000 leituras', async () => {
    const alvo = await novoAlvo('10.0.5.32');
    const futuro = await daExpedicao().lote(
      lote(leitura(alvo, 1, 'online'), leitura(alvo, -10, 'online')),
    );
    expect(futuro.statusCode).toBe(400);
    expect(futuro.json().detail).toBe('Leitura 2: o momento está mais de 5 minutos no futuro.');
    const desconhecida = await daExpedicao().lote(lote(leitura(alvo, 1, 50, 'snmp.toner')));
    expect(desconhecida.json().detail).toBe('Leitura 1: métrica desconhecida: snmp.toner.');
    const muitas = await daExpedicao().lote(
      lote(...Array.from({ length: 1001 }, () => leitura(alvo, 1, 'online'))),
    );
    expect(muitas.statusCode).toBe(400);
    expect(muitas.json().detail).toBe('O lote tem mais de 1.000 leituras.');
    expect(await serie(alvo)).toEqual([]);
  });

  it('o estado atual guarda a leitura mais recente, com o desde, e a atrasada só entra na série', async () => {
    const alvo = await novoAlvo('10.0.5.33');
    await daExpedicao().lote(lote(leitura(alvo, 4, 'online')));
    await daExpedicao().lote(lote(leitura(alvo, 3, 'offline')));
    await daExpedicao().lote(lote(leitura(alvo, 1, 'offline')));
    const agora = api.relogio.agora().getTime();
    expect(await estado(alvo)).toEqual({
      momento: new Date(agora - 60_000),
      desde: new Date(agora - 3 * 60_000),
      valorTexto: 'offline',
      valorNumero: null,
      situacao: 'valida',
    });
    // Da fila em disco: uma leitura de antes da de agora.
    await daExpedicao().lote(lote(leitura(alvo, 2, 'online')));
    expect((await estado(alvo))?.valorTexto).toBe('offline');
    expect(await serie(alvo)).toHaveLength(4);
  });

  it('o evento disponibilidade.mudou sai só na transição, para quem vê ativos no local do ativo', async () => {
    const alvo = await novoAlvo('10.0.5.34');
    await limparEventos();
    await daExpedicao().lote(lote(leitura(alvo, 3, 'online')));
    expect(await eventosDaDisponibilidade()).toEqual([
      { alvoId: alvo, permissao: 'ativos.ver', locais: [null] },
    ]);
    await limparEventos();
    await daExpedicao().lote(
      lote(leitura(alvo, 2, 'online'), leitura(alvo, 2, 4, 'rede.latencia')),
    );
    expect(await eventosDaDisponibilidade()).toEqual([]);
    await daExpedicao().lote(lote(leitura(alvo, 1, null)));
    expect(await eventosDaDisponibilidade()).toHaveLength(1);
    expect(await estado(alvo)).toMatchObject({ valorTexto: null, situacao: 'sem-dado' });
  });

  it('a latência fora da faixa fica inconsistente, sem recusar o lote', async () => {
    const alvo = await novoAlvo('10.0.5.35');
    const r = await daExpedicao().lote(lote(leitura(alvo, 1, -5, 'rede.latencia')));
    expect(r.json()).toEqual({ gravadas: 1, ignoradas: 0, repetido: false });
    expect(await estado(alvo, 'rede.latencia')).toMatchObject({
      valorNumero: -5,
      situacao: 'inconsistente',
    });
  });
});

describe('disponibilidade na lista e na ficha', () => {
  const pedido = (leituras: object[]) => ({ chave: randomUUID(), leituras });
  const minutosAtras = (minutos: number) =>
    new Date(api.relogio.agora().getTime() - minutos * 60_000).toISOString();
  const ler = (
    ativoId: string,
    minutos: number,
    valor: string | number | null,
    metrica = 'rede.disponibilidade',
  ) => ({
    ativoId,
    metrica,
    momento: minutosAtras(minutos),
    valor,
  });
  let dani: Awaited<ReturnType<ReturnType<typeof clienteDaApi>['entrar']>>;
  const lista = async (parametros: Record<string, string>) => {
    const busca = new URLSearchParams({ busca: 'painel', limite: '50', ...parametros });
    const r = await clienteDaApi(api, host).consultar(`/ativos?${busca}`, dani);
    expect(r.statusCode).toBe(200);
    return r.json().itens as { id: string; disponibilidade?: Record<string, unknown> | null }[];
  };

  beforeAll(async () => {
    const ver = await criarPerfil(api, org, { nome: 'Ver ativos', permissoes: ['ativos.ver'] });
    const conta = await criarConta(api, org, { usuario: 'dani', nome: 'Dani Rocha' });
    await atribuir(api, org, { perfilId: ver, contaId: conta.id });
    dani = await clienteDaApi(api, host).entrar('dani');
    ids.online = await criarAtivo(id('impressora'), '10.0.5.40', 'ativo', 'Painel online');
    ids.offline = await criarAtivo(id('impressora'), '10.0.5.41', 'ativo', 'Painel offline');
    ids.offlineAntes = await criarAtivo(
      id('impressora'),
      '10.0.5.42',
      'ativo',
      'Painel caiu antes',
    );
    ids.aguardando = await criarAtivo(id('impressora'), '10.0.5.43', 'ativo', 'Painel novo');
    ids.semColetor = await criarAtivo(id('impressora'), '10.9.0.9', 'ativo', 'Painel longe');
    ids.semIpPainel = await criarAtivo(id('impressora'), null, 'ativo', 'Painel sem IP');
    ids.computadorPainel = await criarAtivo(
      id('tipoComputador'),
      '10.0.5.44',
      'ativo',
      'Painel do PC',
    );
    const coletor = clienteDoColetor(api, host, token('Coletor da expedição'));
    await coletor.lote(
      pedido([
        ler(id('online'), 1, 'online'),
        ler(id('online'), 1, 3, 'rede.latencia'),
        ler(id('offline'), 1, 'offline'),
        ler(id('offlineAntes'), 3, 'offline'),
      ]),
    );
  });

  it('a lista traz a situação de cada ativo, com o desde, a latência e o motivo', async () => {
    const itens = await lista({ colunas: 'coleta.disponibilidade' });
    const de = (nome: string) => itens.find((item) => item.id === id(nome))?.disponibilidade;
    expect(de('online')).toEqual({
      situacao: 'online',
      momento: minutosAtras(1),
      desde: minutosAtras(1),
      motivo: null,
      latencia: { valor: 3, inconsistente: false },
      coletor: 'Coletor da expedição',
    });
    expect(de('offline')).toMatchObject({ situacao: 'offline', latencia: null });
    expect(de('aguardando')).toEqual({
      situacao: 'nao-verificado',
      momento: null,
      desde: null,
      motivo: 'Aguardando a primeira leitura.',
      latencia: null,
      coletor: null,
    });
    expect(de('semColetor')).toMatchObject({ motivo: 'Nenhum coletor alcança o IP 10.9.0.9.' });
    expect(de('semIpPainel')).toMatchObject({ situacao: 'nao-verificado', motivo: 'Sem IP' });
    expect(de('computadorPainel')).toBeNull();
  });

  it('filtra pela situação no servidor, com o filtro no formato das visões', async () => {
    const filtros = JSON.stringify([
      {
        chave: 'coleta.disponibilidade',
        operador: 'qualquer',
        valores: ['offline', 'nao-verificado'],
      },
    ]);
    const ids = (await lista({ filtros })).map((item) => item.id);
    expect(ids.sort()).toEqual(
      [
        id('offline'),
        id('offlineAntes'),
        id('aguardando'),
        id('semColetor'),
        id('semIpPainel'),
      ].sort(),
    );
  });

  it('ordena pela disponibilidade: os offline primeiro, e entre eles o de leitura mais antiga', async () => {
    const ordem = (await lista({ ordem: 'coleta.disponibilidade', direcao: 'crescente' })).map(
      (item) => item.id,
    );
    expect(ordem.slice(0, 3)).toEqual([id('offlineAntes'), id('offline'), id('online')]);
    expect(ordem.at(-1)).toBe(id('computadorPainel'));
  });

  it('a ficha traz a disponibilidade, com o coletor da última leitura', async () => {
    const r = await clienteDaApi(api, host).consultar(`/ativos/${id('offline')}`, dani);
    expect(r.statusCode).toBe(200);
    expect(r.json().disponibilidade).toEqual({
      situacao: 'offline',
      momento: minutosAtras(1),
      desde: minutosAtras(1),
      motivo: null,
      latencia: null,
      coletor: 'Coletor da expedição',
    });
  });
});
