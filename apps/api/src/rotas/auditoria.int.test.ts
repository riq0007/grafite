// A consulta da auditoria (spec consulta-da-auditoria; design do F2b, decisões 12 e 13): do mais
// recente ao mais antigo, ou ao contrário, com o cursor que não pula nem repete, os filtros, o total
// com teto, os nomes atuais de quem fez e do alvo, e só para quem tem auditoria.ver.
import { naOrganizacao, type Transacao } from '@grafite/db';
import type { AcaoDaAuditoria } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  novoIp,
  SEM_ENTRADA,
  SENHA_DE_TESTE,
} from '../../test/integracao.ts';
import { type EventoDeAuditoria, registrarNaAuditoria } from '../auditoria.ts';

const host = 'grafite.consulta-auditoria.local';
const BASE = new Date('2026-09-01T12:00:00.000Z').getTime();
const SEGUNDO = 1000;

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const ids: Record<string, string> = {};
const entradas: Record<string, Entrada> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ids.ana = ana.id;
  await atribuir(api, org, { perfilId: administrador, contaId: ana.id });
  const joao = await criarConta(api, org, { usuario: 'jsilva', nome: 'João da Silva' });
  ids.joao = joao.pessoaId;
  ids.contaDoJoao = joao.id;
  await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' });
  for (const usuario of ['ana', 'davi']) entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

interface Registro {
  id: string;
  momento: string;
  acao: string;
  rotulo: string;
  ator: { tipo: string; id?: string; nome?: string; usuario?: string | null; descricao?: string };
  alvo: { tipo: string; id: string | null; nome: string | null; usuario: string | null };
  antes: unknown;
  depois: unknown;
  dados: unknown;
  ip: string | null;
  codigoDeRastreio: string | null;
}

interface Pagina {
  itens: Registro[];
  proximo: string | null;
  total: number;
  maisDe: boolean;
}

async function consultar(filtros: Record<string, string | string[]>, usuario = 'ana') {
  const parametros = new URLSearchParams();
  for (const [nome, valor] of Object.entries(filtros)) {
    for (const um of [valor].flat()) parametros.append(nome, um);
  }
  const r = await cliente.consultar(`/auditoria?${parametros}`, como(usuario));
  expect(r.statusCode).toBe(200);
  return r.json() as Pagina;
}

/** Registros com o momento e o código de rastreio dados, direto pela gravação da API. */
function registrar(
  tx: Transacao,
  {
    acao = 'local.criado',
    segundo,
    rastreio,
  }: { acao?: AcaoDaAuditoria; segundo: number; rastreio: string },
) {
  // Qualquer ação, com um público de evento qualquer, que estes testes não conferem.
  return registrarNaAuditoria(tx, {
    acao,
    ator: { tipo: 'sistema', descricao: 'comando no servidor: teste' },
    alvo: { tipo: 'local' },
    dados: { segundo },
    origem: { ip: '10.1.2.3', codigoDeRastreio: rastreio },
    momento: new Date(BASE + segundo * SEGUNDO),
    saida: { publico: { todas: true } },
  } as EventoDeAuditoria);
}

describe('ordem e paginação', () => {
  it('vem do mais recente ao mais antigo, e se inverte', async () => {
    await naOrganizacao(api.banco, org, async (tx) => {
      for (const segundo of [2, 1, 3]) await registrar(tx, { segundo, rastreio: 'ORDM-0001' });
    });
    const segundos = (pagina: Pagina) =>
      pagina.itens.map((item) => (item.dados as { segundo: number }).segundo);
    expect(segundos(await consultar({ rastreio: 'ORDM-0001' }))).toEqual([3, 2, 1]);
    expect(segundos(await consultar({ rastreio: 'ORDM-0001', ordem: 'antigos' }))).toEqual([
      1, 2, 3,
    ]);
  });

  it('pagina pelo cursor sem pular nem repetir, mesmo com registros novos no topo', async () => {
    await naOrganizacao(api.banco, org, async (tx) => {
      for (let segundo = 100; segundo < 220; segundo += 1) {
        await registrar(tx, { segundo, rastreio: 'CURS-0001' });
      }
    });
    const primeira = await consultar({ rastreio: 'CURS-0001' });
    expect(primeira.itens).toHaveLength(50);
    expect(primeira.total).toBe(120);
    await naOrganizacao(api.banco, org, async (tx) => {
      for (let segundo = 500; segundo < 505; segundo += 1) {
        await registrar(tx, { segundo, rastreio: 'CURS-0001' });
      }
    });
    const vistos = [...primeira.itens];
    let cursor = primeira.proximo;
    while (cursor) {
      const pagina = await consultar({ rastreio: 'CURS-0001', cursor });
      expect(pagina.total).toBe(125);
      vistos.push(...pagina.itens);
      cursor = pagina.proximo;
    }
    const segundos = vistos.map((item) => (item.dados as { segundo: number }).segundo);
    expect(segundos).toEqual(Array.from({ length: 120 }, (_, i) => 219 - i));
  });

  it('não pula registros que diferem por microssegundos', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx.execute(sql`
        insert into auditoria (org_id, momento, acao, ator_tipo, alvo_tipo, codigo_de_rastreio)
        select app.current_org(), ${new Date(BASE).toISOString()}::timestamptz + n * interval '1 microsecond',
          'local.criado', 'anonimo', 'local', 'MICR-0001'
        from generate_series(1, 3) as n`),
    );
    const vistos: string[] = [];
    let cursor: string | null = null;
    do {
      const filtros: Record<string, string> = { rastreio: 'MICR-0001', limite: '1' };
      if (cursor) filtros.cursor = cursor;
      const pagina = await consultar(filtros);
      vistos.push(...pagina.itens.map((item) => item.id));
      cursor = pagina.proximo;
    } while (cursor);
    expect(new Set(vistos).size).toBe(3);
  });

  it('recusa mais de 100 por página e o cursor ilegível', async () => {
    const grande = await cliente.consultar('/auditoria?limite=101', como('ana'));
    expect(grande.json().campos).toEqual({ limite: 'Use até 100 itens por página.' });
    const ilegivel = await cliente.consultar('/auditoria?cursor=x', como('ana'));
    expect(ilegivel.json().campos).toEqual({ cursor: 'A lista mudou. Recarregue a lista.' });
  });
});

describe('filtros', () => {
  beforeAll(async () => {
    await naOrganizacao(api.banco, org, async (tx) => {
      await registrar(tx, { acao: 'entrada.recusada', segundo: 1000, rastreio: 'FILT-0001' });
      await registrar(tx, { acao: 'entrada.recusada', segundo: 2000, rastreio: 'FILT-0002' });
      await registrar(tx, { acao: 'senha.trocada', segundo: 2000, rastreio: 'FILT-0003' });
      await registrar(tx, { acao: 'entrada.recusada', segundo: 3000, rastreio: 'FILT-0004' });
    });
  });

  it('filtra o período, com as pontas incluídas, e a ação, no conjunto inteiro', async () => {
    const pagina = await consultar({
      acao: 'entrada.recusada',
      de: new Date(BASE + 1000 * SEGUNDO).toISOString(),
      ate: new Date(BASE + 2000 * SEGUNDO).toISOString(),
    });
    expect(pagina.itens.map((item) => item.codigoDeRastreio)).toEqual(['FILT-0002', 'FILT-0001']);
    expect(pagina.total).toBe(2);
  });

  it('filtra pelo código de rastreio, sem diferenciar maiúsculas', async () => {
    const pagina = await consultar({ rastreio: ' filt-0003 ' });
    expect(pagina.itens).toMatchObject([
      { acao: 'senha.trocada', rotulo: 'Senha trocada', codigoDeRastreio: 'FILT-0003' },
    ]);
  });

  it('filtra por quem fez e pelos alvos, que se somam', async () => {
    const editada = await cliente.enviar('PATCH', `/pessoas/${ids.joao}`, como('ana'), {
      email: 'joao@empresa.com',
    });
    expect(editada.statusCode).toBe(200);
    const alterada = await cliente.enviar('PATCH', `/contas/${ids.contaDoJoao}`, como('ana'), {
      exigeDoisPassos: true,
    });
    expect(alterada.statusCode).toBe(200);
    const doJoao = await consultar({
      alvo: [`pessoa:${ids.joao}`, `conta:${ids.contaDoJoao}`],
    });
    expect(doJoao.itens.map((item) => item.acao)).toEqual(['conta.alterada', 'pessoa.alterada']);
    const daAna = await consultar({ ator: ids.ana ?? '', acao: 'pessoa.alterada' });
    expect(daAna.itens).toHaveLength(1);
    const invalido = await cliente.consultar('/auditoria?alvo=pessoa', como('ana'));
    expect(invalido.statusCode).toBe(400);
  });
});

describe('nomes, dispositivo e total', () => {
  it('mostra o nome atual de quem fez e do alvo', async () => {
    const renomeada = await cliente.enviar('PATCH', `/pessoas/${ids.joao}`, como('ana'), {
      nome: 'João Pedro da Silva',
    });
    expect(renomeada.statusCode).toBe(200);
    const pagina = await consultar({ alvo: `conta:${ids.contaDoJoao}` });
    expect(pagina.itens[0]).toMatchObject({
      acao: 'conta.alterada',
      rotulo: 'Conta alterada',
      ator: { tipo: 'conta', id: ids.ana, nome: 'Ana Souza', usuario: 'ana' },
      alvo: {
        tipo: 'conta',
        id: ids.contaDoJoao,
        nome: 'João Pedro da Silva',
        usuario: 'jsilva',
      },
      antes: { exigeDoisPassos: false },
      depois: { exigeDoisPassos: true },
      codigoDeRastreio: expect.stringMatching(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/),
    });
    const dePessoa = await consultar({ alvo: `pessoa:${ids.joao}`, acao: 'pessoa.alterada' });
    expect(dePessoa.itens.map((item) => item.alvo.nome)).toEqual([
      'João Pedro da Silva',
      'João Pedro da Silva',
    ]);
  });

  it('mostra quem fez como o comando no servidor ou sem sessão', async () => {
    const [comando] = (await consultar({ rastreio: 'FILT-0001' })).itens;
    expect(comando?.ator).toEqual({ tipo: 'sistema', descricao: 'comando no servidor: teste' });
    await naOrganizacao(api.banco, org, (tx) =>
      registrarNaAuditoria(tx, {
        acao: 'entrada.recusada',
        ator: { tipo: 'anonimo' },
        alvo: { tipo: 'conta' },
        origem: { codigoDeRastreio: 'ANON-0001' },
        momento: new Date(BASE),
      }),
    );
    const [anonimo] = (await consultar({ rastreio: 'ANON-0001' })).itens;
    expect(anonimo).toMatchObject({ ator: { tipo: 'anonimo' }, alvo: { tipo: 'conta', id: null } });
  });

  it('mostra o dispositivo da sessão', async () => {
    const r = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      remoteAddress: novoIp(),
      headers: {
        host,
        'sec-fetch-site': 'same-origin',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      },
      payload: { usuario: 'davi', senha: SENHA_DE_TESTE },
    });
    const pagina = await consultar({
      rastreio: String(r.headers['x-codigo-de-rastreio']),
      acao: 'sessao.iniciada',
    });
    expect(pagina.itens[0]?.alvo).toMatchObject({ tipo: 'sessao', nome: 'Chrome no Windows' });
  });

  it('mostra o nome anonimizado de quem fez, depois da anonimização', async () => {
    const rui = await criarConta(api, org, { usuario: 'rui', nome: 'Rui Barros' });
    const entrada = await cliente.entrar('rui');
    await cliente.enviar('DELETE', '/sessao', entrada);
    for (const acao of ['inativacao', 'anonimizacao']) {
      const r = await cliente.enviar('POST', `/pessoas/${rui.pessoaId}/${acao}`, como('ana'));
      expect(r.statusCode).toBe(200);
    }
    const pagina = await consultar({ ator: rui.id });
    expect(pagina.itens.length).toBeGreaterThan(0);
    for (const item of pagina.itens) {
      expect(item.ator.nome).toMatch(/^Pessoa anonimizada [0-9A-Z]{4}$/);
      expect(item.ator.usuario).toBeNull();
    }
  });

  it('conta exato até 10.000 e diz "mais de" acima disso', async () => {
    const cheia = await criarOrganizacao(api, {
      nome: 'Cheia',
      enderecos: ['grafite.consulta-auditoria-cheia.local'],
    });
    const clienteDaCheia = clienteDaApi(api, 'grafite.consulta-auditoria-cheia.local');
    const administrador = await criarPerfil(api, cheia, {
      nome: 'Administrador',
      administrador: true,
    });
    const zeca = await criarConta(api, cheia, { usuario: 'zeca' });
    await atribuir(api, cheia, { perfilId: administrador, contaId: zeca.id });
    await naOrganizacao(api.banco, cheia, (tx) =>
      tx.execute(sql`
        insert into auditoria (org_id, momento, acao, ator_tipo, alvo_tipo)
        select app.current_org(), ${new Date(BASE).toISOString()}::timestamptz + n * interval '1 second',
          'entrada.recusada', 'anonimo', 'conta'
        from generate_series(1, 10001) as n`),
    );
    const entrada = await clienteDaCheia.entrar('zeca');
    const total = async (filtros: Record<string, string>) =>
      (
        await clienteDaCheia.consultar(`/auditoria?${new URLSearchParams(filtros)}`, entrada)
      ).json();
    expect(await total({ acao: 'entrada.recusada', limite: '1' })).toMatchObject({
      total: 10000,
      maisDe: true,
    });
    expect(
      await total({
        acao: 'entrada.recusada',
        de: new Date(BASE + 2 * SEGUNDO).toISOString(),
        limite: '1',
      }),
    ).toMatchObject({ total: 10000, maisDe: false });
  });
});

describe('permissão e contas para o filtro', () => {
  it('exige auditoria.ver e registra a recusa', async () => {
    const r = await cliente.consultar('/auditoria', como('davi'));
    expect(r.statusCode).toBe(403);
    expect(r.json().permissao).toBe('auditoria.ver');
    const recusas = await consultar({ rastreio: String(r.headers['x-codigo-de-rastreio']) });
    expect(recusas.itens).toMatchObject([
      { acao: 'permissao.recusada', rotulo: 'Permissão recusada' },
    ]);
    expect((await cliente.consultar('/auditoria/contas', como('davi'))).statusCode).toBe(403);
  });

  it('lista as contas para o filtro, inclusive as inativas e as anonimizadas', async () => {
    const r = await cliente.consultar('/auditoria/contas', como('ana'));
    expect(r.statusCode).toBe(200);
    const nomes = (r.json().itens as { nome: string }[]).map((conta) => conta.nome);
    expect(nomes).toEqual(
      expect.arrayContaining(['Ana Souza', 'Davi Rocha', 'João Pedro da Silva']),
    );
    expect(nomes.some((nome) => nome.startsWith('Pessoa anonimizada'))).toBe(true);
    // Sem o texto, as primeiras em ordem alfabética, para a escolha abrir com as opções à vista.
    expect(nomes[0]).toBe('Ana Souza');
    const busca = await cliente.consultar('/auditoria/contas?busca=jsil', como('ana'));
    expect(busca.json().itens).toEqual([
      {
        id: ids.contaDoJoao,
        nome: 'João Pedro da Silva',
        usuario: 'jsilva',
        situacao: 'ativa',
      },
    ]);
  });
});
