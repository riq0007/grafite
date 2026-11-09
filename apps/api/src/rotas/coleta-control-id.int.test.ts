// A sondagem do Control iD pela API (spec coletor-local, "Configuração da coleta", saude-do-control-id,
// "Login de cada controle" e "Sondagem dos controles", e cofre-de-segredos, "Login do Control iD
// usado pelo coletor"; change p2c-saude-do-control-id, design, decisão 3): o alvo do controle traz a
// sondagem a cada 5 minutos, com a porta do tipo e o login decifrado só para o coletor, sem revelação
// na auditoria: o ligado ao próprio controle ou o do tipo. Com dois ligados, ou com o do tipo inativo
// e nenhum ligado, o controle fica sem a sondagem; com o Cofre desligado, o login continua.
import { randomUUID } from 'node:crypto';
import {
  ativos,
  auditoria,
  campos,
  estadoDosAtivos,
  eventos,
  naOrganizacao,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CofreDeTeste,
  ligarOCofre,
  montarCofre,
  mudarSituacaoDoSegredo,
} from '../../test/cofre.ts';
import { type ApiDeTeste, abrirApi, clienteDoColetor } from '../../test/integracao.ts';
import { criarColetor } from '../coleta/coletores.ts';

const host = 'grafite.coleta-control-id.local';
const TOKEN = `token-do-coletor-dos-controles-${'x'.repeat(40)}`;
const SENHA_DO_TIPO = 's3nha-dos-controles';
const SENHA_PROPRIA = 's3nha-da-portaria-norte';

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
        icone: 'generico',
        capacidades,
        configuracaoDasCapacidades: configuracao,
      })
      .returning({ id: tiposDeAtivo.id });
    return linha?.id ?? '';
  });
}

async function ativo(tipoId: string, ip: string | null) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId,
        busca: '',
        valores: ip === null ? {} : { [id('ip')]: ip },
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return linha?.id ?? '';
  });
}

async function segredo(
  nome: string,
  identificador: string,
  valor: string,
  { tipo: doTipo = 'conta-administrativa', ativoIds = [] as string[] } = {},
) {
  const r = await cofre.cliente.enviar('POST', '/cofre/segredos', cofre.como('ana'), {
    nome,
    tipo: doTipo,
    classificacao: 'equipamento',
    identificador,
    ativoIds,
    valor,
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
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
  ids.admin = await segredo('Admin dos controles', 'admin', SENHA_DO_TIPO);
  ids.antigo = await segredo('Admin antigo', 'antigo', 'senha-antiga');
  ids.controle = await tipo('Controle de acesso', ['rede.disponibilidade', 'controlid.saude'], {
    'rede.disponibilidade': { campoDoIp: id('ip') },
    'controlid.saude': { campoDoIp: id('ip'), porta: 80, segredoId: id('admin') },
  });
  ids.doLoginAntigo = await tipo('Controle da garagem', ['controlid.saude'], {
    'controlid.saude': { campoDoIp: id('ip'), porta: 8080, segredoId: id('antigo') },
  });
  ids.soPing = await tipo('Switch', ['rede.disponibilidade'], {
    'rede.disponibilidade': { campoDoIp: id('ip') },
  });
  ids.switch = await ativo(id('soPing'), '10.0.5.90');
  ids.pat777 = await ativo(id('controle'), '10.0.5.77');
  ids.pat778 = await ativo(id('controle'), '10.0.5.78');
  ids.pat779 = await ativo(id('controle'), '10.0.5.79');
  ids.garagem = await ativo(id('doLoginAntigo'), '10.0.5.80');
  ids.garagemComProprio = await ativo(id('doLoginAntigo'), '10.0.5.81');
  ids.portaria = await segredo('Portaria norte', 'portaria', SENHA_PROPRIA, {
    tipo: 'usuario-e-senha',
    ativoIds: [id('pat778')],
  });
  await segredo('Portaria sul', 'sul', 'senha-sul', { ativoIds: [id('pat779')] });
  await segredo('Portaria leste', 'leste', 'senha-leste', { ativoIds: [id('pat779')] });
  // O Wi-Fi ligado ao controle não é um login: não conta.
  await segredo('Wi-Fi da portaria', 'portaria-wifi', 'senha-wifi', {
    tipo: 'wi-fi',
    ativoIds: [id('pat777')],
  });
  await segredo('Garagem', 'garagem', 'senha-da-garagem', {
    ativoIds: [id('garagemComProprio')],
  });
  await mudarSituacaoDoSegredo(api, org, id('antigo'), 'inativo');
  ids.coletor = await naOrganizacao(api.banco, org, async (tx) => {
    const criado = await criarColetor(tx, {
      nome: 'Coletor dos controles',
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

/** As coletas do ativo na configuração do coletor, ou nenhuma, quando ele não é alvo. */
async function coletasDe(ativoId: string) {
  const r = await coletor().configuracao();
  expect(r.statusCode, r.body).toBe(200);
  const alvos = r.json().alvos as { ativoId: string; ip: string; coletas: object[] }[];
  return alvos.find((alvo) => alvo.ativoId === ativoId)?.coletas ?? [];
}

const sondagem = (usuario: string, senha: string, porta = 80) => ({
  tipo: 'controlid',
  intervalo: 300,
  porta,
  usuario,
  senha,
});

describe('a sondagem do Control iD na configuração do coletor', () => {
  it('o alvo do controle traz o ping a cada 2 minutos e a sondagem a cada 5, com a porta e o login do tipo', async () => {
    expect(await coletasDe(id('pat777'))).toEqual([
      { tipo: 'ping', intervalo: 120 },
      sondagem('admin', SENHA_DO_TIPO),
    ]);
  });

  it('o login ligado ao próprio controle vale no lugar do do tipo', async () => {
    expect(await coletasDe(id('pat778'))).toContainEqual(sondagem('portaria', SENHA_PROPRIA));
  });

  it('com dois logins ligados, o controle fica só com o ping', async () => {
    expect(await coletasDe(id('pat779'))).toEqual([{ tipo: 'ping', intervalo: 120 }]);
  });

  it('com o login do tipo inativo, só o controle com o login próprio é sondado', async () => {
    expect(await coletasDe(id('garagem'))).toEqual([]);
    expect(await coletasDe(id('garagemComProprio'))).toEqual([
      sondagem('garagem', 'senha-da-garagem', 8080),
    ]);
    await mudarSituacaoDoSegredo(api, org, id('admin'), 'inativo');
    try {
      expect(await coletasDe(id('pat777'))).toEqual([{ tipo: 'ping', intervalo: 120 }]);
      expect(await coletasDe(id('pat778'))).toContainEqual(sondagem('portaria', SENHA_PROPRIA));
    } finally {
      await mudarSituacaoDoSegredo(api, org, id('admin'), 'ativo');
    }
  });

  it('com o Cofre desligado, o login continua', async () => {
    await ligarOCofre(api, org, false);
    try {
      expect(await coletasDe(id('pat777'))).toContainEqual(sondagem('admin', SENHA_DO_TIPO));
    } finally {
      await ligarOCofre(api, org, true);
    }
  });

  it('decifrar o login para o coletor não registra revelação na auditoria', async () => {
    const dosSegredos = () =>
      naOrganizacao(api.banco, org, (tx) =>
        tx
          .select({ acao: auditoria.acao })
          .from(auditoria)
          .where(inArray(auditoria.alvoId, [id('admin'), id('portaria')])),
      );
    const antes = await dosSegredos();
    await coletasDe(id('pat777'));
    await coletasDe(id('pat778'));
    expect(await dosSegredos()).toEqual(antes);
    expect(antes.map((registro) => registro.acao)).not.toContain('segredo.revelado');
  });
});

// O lote dos controles (spec coletor-local, "Lotes de leituras", leituras-e-estado, "Estado atual", e
// saude-do-control-id, "Número de série pela sondagem"; change p2c-saude-do-control-id, design,
// decisão 6).
describe('o lote dos controles', () => {
  const momento = () => new Date(api.relogio.agora().getTime() - 60_000).toISOString();
  const leitura = (ativoId: string, metrica: string, valor: unknown, extras: object = {}) => ({
    ativoId,
    metrica,
    momento: momento(),
    valor,
    ...extras,
  });
  const lote = (...leituras: object[]) => coletor().lote({ chave: randomUUID(), leituras });

  it('grava o estado da sondagem, do firmware com o produto e da série', async () => {
    const r = await lote(
      leitura(id('pat777'), 'controlid.sondagem', 'respondendo'),
      leitura(id('pat777'), 'controlid.firmware', '6.12.2', {
        detalhes: { produto: 'iDAccess Pro' },
      }),
      leitura(id('pat778'), 'controlid.sondagem', 'resposta-inesperada', {
        detalhes: { etapa: 'login', codigo: 404 },
      }),
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ gravadas: 3, ignoradas: 0, repetido: false });
    const estado = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({
          ativoId: estadoDosAtivos.ativoId,
          metrica: estadoDosAtivos.metrica,
          valorTexto: estadoDosAtivos.valorTexto,
          detalhes: estadoDosAtivos.detalhes,
        })
        .from(estadoDosAtivos)
        .where(inArray(estadoDosAtivos.ativoId, [id('pat777'), id('pat778')]))
        .orderBy(asc(estadoDosAtivos.ativoId), asc(estadoDosAtivos.metrica)),
    );
    expect(estado).toEqual(
      [
        {
          ativoId: id('pat777'),
          metrica: 'controlid.firmware',
          valorTexto: '6.12.2',
          detalhes: { produto: 'iDAccess Pro' },
        },
        {
          ativoId: id('pat777'),
          metrica: 'controlid.sondagem',
          valorTexto: 'respondendo',
          detalhes: null,
        },
        {
          ativoId: id('pat778'),
          metrica: 'controlid.sondagem',
          valorTexto: 'resposta-inesperada',
          detalhes: { etapa: 'login', codigo: 404 },
        },
      ].sort((a, b) => (a.ativoId === b.ativoId ? 0 : a.ativoId < b.ativoId ? -1 : 1)),
    );
  });

  it('a leitura da sondagem de quem não é alvo dela é ignorada, e a do ping dele fica', async () => {
    const r = await lote(
      leitura(id('switch'), 'controlid.sondagem', 'respondendo'),
      leitura(id('switch'), 'controlid.serie', 'SERIE-DO-SWITCH'),
      leitura(id('switch'), 'rede.disponibilidade', 'online'),
    );
    expect(r.json()).toEqual({ gravadas: 1, ignoradas: 2, repetido: false });
  });

  it('o número de série do controle grava o campo com a origem coleta, a auditoria pelo coletor e o evento', async () => {
    const r = await lote(leitura(id('pat777'), 'controlid.serie', '0M0400/123456'));
    expect(r.json()).toMatchObject({ gravadas: 1 });
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ serie: ativos.serie, estado: ativos.estado })
        .from(ativos)
        .where(eq(ativos.id, id('pat777'))),
    );
    expect(linha?.serie).toBe('0M0400/123456');
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
          atorTipo: auditoria.atorTipo,
          atorDescricao: auditoria.atorDescricao,
          depois: auditoria.depois,
        })
        .from(auditoria)
        .where(and(eq(auditoria.alvoId, id('pat777')), eq(auditoria.acao, 'ativo.alterado'))),
    );
    expect(registros).toMatchObject([
      {
        atorTipo: 'sistema',
        atorDescricao: 'coletor: Coletor dos controles',
        depois: { campos: { 'Número de série': '0M0400/123456' } },
      },
    ]);
    const doAtivo = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ tipo: eventos.tipo })
        .from(eventos)
        .where(eq(eventos.alvoId, id('pat777'))),
    );
    expect(doAtivo.map((evento) => evento.tipo)).toContain('ativos.mudaram');
  });

  it('a série que a coleta já gravou muda quando o controle informa outra', async () => {
    const pat = await ativo(id('controle'), '10.0.5.95');
    await lote(leitura(pat, 'controlid.serie', 'SERIE-ANTIGA'));
    await lote(leitura(pat, 'controlid.serie', '0M0400/123456'));
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ serie: ativos.serie }).from(ativos).where(eq(ativos.id, pat)),
    );
    expect(linha?.serie).toBe('0M0400/123456');
  });

  it('a série travada no controle continua, e nada vai para a auditoria', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(ativos)
        .set({
          serie: 'ABC123',
          estado: {
            'ativo.serie': { origem: 'manual', momento: null, autorId: null, trava: true },
          },
        })
        .where(eq(ativos.id, id('pat778'))),
    );
    await lote(leitura(id('pat778'), 'controlid.serie', '0M0400/999999'));
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ serie: ativos.serie })
        .from(ativos)
        .where(eq(ativos.id, id('pat778'))),
    );
    expect(linha?.serie).toBe('ABC123');
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ acao: auditoria.acao })
        .from(auditoria)
        .where(and(eq(auditoria.alvoId, id('pat778')), eq(auditoria.acao, 'ativo.alterado'))),
    );
    expect(registros).toEqual([]);
  });
});

// A saúde do Control iD na ficha e na coluna (spec saude-do-control-id, "Situação do Control iD", e
// cadastro-de-ativos; change p2c-saude-do-control-id, design, decisão 7).
describe('a saúde do Control iD na ficha e na coluna', () => {
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
  const ficha = async (ativoId: string) => {
    const r = await cofre.cliente.consultar(`/ativos/${ativoId}`, cofre.como('ana'));
    expect(r.statusCode, r.body).toBe(200);
    return r.json();
  };

  it('a ficha do controle que responde mostra a situação, o último contato, o firmware, o produto, o login do tipo e o coletor', async () => {
    const pat = await ativo(id('controle'), '10.0.5.100');
    const M = quando(1);
    await lote(
      leitura(pat, 'controlid.sondagem', 'respondendo', {}, M),
      leitura(pat, 'controlid.firmware', '6.12.2', { detalhes: { produto: 'iDAccess Pro' } }, M),
    );
    expect((await ficha(pat)).controlId).toEqual({
      situacao: 'respondendo',
      momento: M,
      desde: M,
      motivo: null,
      ultimoContato: M,
      firmware: '6.12.2',
      produto: 'iDAccess Pro',
      login: 'tipo',
      coletor: 'Coletor dos controles',
    });
  });

  it('o controle que deixa de responder mostra desde quando, com o último contato e o firmware da resposta', async () => {
    const pat = await ativo(id('controle'), '10.0.5.101');
    const antes = quando(10);
    const agora = quando(5);
    await lote(
      leitura(pat, 'controlid.sondagem', 'respondendo', {}, antes),
      leitura(pat, 'controlid.firmware', '6.12.2', { detalhes: { produto: 'iDFlex' } }, antes),
    );
    await lote(leitura(pat, 'controlid.sondagem', 'sem-resposta', {}, agora));
    expect((await ficha(pat)).controlId).toEqual({
      situacao: 'sem-resposta',
      momento: agora,
      desde: agora,
      motivo: null,
      ultimoContato: antes,
      firmware: '6.12.2',
      produto: 'iDFlex',
      login: 'tipo',
      coletor: 'Coletor dos controles',
    });
  });

  it('o login próprio diz de onde vem, e cada motivo do "Não verificado"', async () => {
    expect((await ficha(id('pat778'))).controlId).toMatchObject({ login: 'controle' });
    expect((await ficha(id('pat779'))).controlId).toMatchObject({
      situacao: 'nao-verificado',
      motivo: 'Há mais de um login ligado a este controle no cofre.',
      login: null,
    });
    expect((await ficha(id('garagem'))).controlId).toMatchObject({
      situacao: 'nao-verificado',
      motivo: 'O login escolhido no tipo está inativo.',
    });
    const novo = await ativo(id('controle'), '10.0.5.102');
    expect((await ficha(novo)).controlId).toMatchObject({
      situacao: 'nao-verificado',
      motivo: 'Aguardando a primeira sondagem.',
      momento: null,
      ultimoContato: null,
    });
    const longe = await ativo(id('controle'), '10.9.0.5');
    expect((await ficha(longe)).controlId.motivo).toBe('Nenhum coletor alcança o IP 10.9.0.5.');
    const semIp = await ativo(id('controle'), null);
    expect((await ficha(semIp)).controlId).toMatchObject({
      situacao: 'nao-verificado',
      motivo: 'Sem IP',
    });
    expect((await ficha(id('switch'))).controlId).toBeNull();
  });

  it('a coluna Control iD filtra "é qualquer de", conta cada situação e ordena com o que pede atenção primeiro', async () => {
    const semResposta = await ativo(id('controle'), '10.0.5.110');
    const recusado = await ativo(id('controle'), '10.0.5.111');
    const respondendo = await ativo(id('controle'), '10.0.5.112');
    await lote(
      leitura(semResposta, 'controlid.sondagem', 'sem-resposta', {}, quando(3)),
      leitura(recusado, 'controlid.sondagem', 'login-recusado', {}, quando(2)),
      leitura(respondendo, 'controlid.sondagem', 'respondendo', {}, quando(1)),
    );
    const lista = async (parametros: Record<string, string>) => {
      const r = await cofre.cliente.consultar(
        `/ativos?${new URLSearchParams({
          colunas: 'coleta.control-id',
          limite: '100',
          ...parametros,
        }).toString()}`,
        cofre.como('ana'),
      );
      expect(r.statusCode, r.body).toBe(200);
      return r.json().itens as { id: string; controlId?: { situacao: string } | null }[];
    };
    const filtro = {
      chave: 'coleta.control-id',
      operador: 'qualquer',
      valores: ['sem-resposta', 'login-recusado'],
    };
    const filtrados = await lista({ filtros: JSON.stringify([filtro]) });
    expect(filtrados.map((item) => item.id)).toEqual(
      expect.arrayContaining([semResposta, recusado]),
    );
    expect(filtrados.map((item) => item.id)).not.toContain(respondendo);
    expect(
      filtrados.every((item) =>
        ['sem-resposta', 'login-recusado'].includes(item.controlId?.situacao ?? ''),
      ),
    ).toBe(true);

    const ordenados = await lista({ ordem: 'coleta.control-id', direcao: 'crescente' });
    const posicao = (ativoId: string) => ordenados.findIndex((item) => item.id === ativoId);
    expect(posicao(semResposta)).toBeLessThan(posicao(recusado));
    expect(posicao(recusado)).toBeLessThan(posicao(respondendo));
    expect(posicao(respondendo)).toBeLessThan(posicao(id('pat779')));

    const contagens = await cofre.cliente.consultar(
      `/ativos/contagens?${new URLSearchParams({ coluna: 'coleta.control-id' }).toString()}`,
      cofre.como('ana'),
    );
    expect(contagens.statusCode, contagens.body).toBe(200);
    const opcoes = contagens.json().opcoes as { valor: string; quantos: number }[];
    expect(opcoes.find((opcao) => opcao.valor === 'login-recusado')?.quantos).toBeGreaterThan(0);
    expect(opcoes.find((opcao) => opcao.valor === 'nao-verificado')?.quantos).toBeGreaterThan(0);
  });
});

// O tipo sem login (change login-de-cada-controle, design, decisões 1 e 2).
describe('o tipo sem login', () => {
  it('só o controle com login próprio é sondado, e o outro fica sem login na ficha e na coluna', async () => {
    const faceId = await tipo('Face ID', ['controlid.saude'], {
      'controlid.saude': { campoDoIp: id('ip'), porta: 80, segredoId: null },
    });
    const semLogin = await ativo(faceId, '10.0.5.120');
    const comProprio = await ativo(faceId, '10.0.5.121');
    await segredo('Face da recepção', 'recepcao', 'senha-da-recepcao', { ativoIds: [comProprio] });

    expect(await coletasDe(semLogin)).toEqual([]);
    expect(await coletasDe(comProprio)).toEqual([sondagem('recepcao', 'senha-da-recepcao')]);

    const ficha = await cofre.cliente.consultar(`/ativos/${semLogin}`, cofre.como('ana'));
    expect(ficha.statusCode, ficha.body).toBe(200);
    expect(ficha.json().controlId).toMatchObject({
      situacao: 'nao-verificado',
      motivo: 'Sem login: escolha o login deste controle ou o do tipo.',
      login: null,
    });

    // Com uma sondagem, o controle com login próprio sai do "Não verificado"; o sem login, não.
    const sondado = await coletor().lote({
      chave: randomUUID(),
      leituras: [
        {
          ativoId: comProprio,
          metrica: 'controlid.sondagem',
          momento: new Date(api.relogio.agora().getTime() - 60_000).toISOString(),
          valor: 'respondendo',
        },
      ],
    });
    expect(sondado.statusCode, sondado.body).toBe(200);
    const filtro = {
      chave: 'coleta.control-id',
      operador: 'qualquer',
      valores: ['nao-verificado'],
    };
    const lista = await cofre.cliente.consultar(
      `/ativos?${new URLSearchParams({
        colunas: 'coleta.control-id',
        limite: '100',
        filtros: JSON.stringify([filtro]),
      }).toString()}`,
      cofre.como('ana'),
    );
    expect(lista.statusCode, lista.body).toBe(200);
    const itens = lista.json().itens as { id: string }[];
    expect(itens.map((item) => item.id)).toContain(semLogin);
    expect(itens.map((item) => item.id)).not.toContain(comProprio);
  });
});
