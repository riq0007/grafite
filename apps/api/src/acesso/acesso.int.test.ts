// O acesso efetivo na sessão (specs permissoes, entrada-e-sessoes e verificacao-em-dois-passos): o
// estado da sessão traz as permissões com o escopo, toda mudança vale na requisição seguinte, e um
// perfil que exige os dois passos faz uma sessão que vale pedir o cadastro, sem mudar o fim dela.
import { naOrganizacao, perfis, sessoes } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarGrupo,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  incluirNoGrupo,
} from '../../test/integracao.ts';
import { decodificarBase32, gerarCodigoTotp } from './totp.ts';

const host = 'grafite.acesso.local';
const senha = 'cavalo bateria grampo correto';

let api: ApiDeTeste;
let org = '';
let jundiai = '';
const contas: Record<string, string> = {};
let ipDoCaso = 0;
const novoIp = () => `10.7.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;

interface Entrada {
  cookie: string;
  csrf: string;
}

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  for (const usuario of ['bruno', 'davi', 'eva', 'fabio', 'gil']) {
    contas[usuario] = (await criarConta(api, org, { usuario, senha })).id;
  }
});

afterAll(async () => {
  await api?.fechar();
});

async function entrar(usuario: string) {
  const r = await api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha },
  });
  return {
    resposta: r,
    entrada: {
      cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
      csrf: r.json().sessao?.csrf ?? '',
    } satisfies Entrada,
  };
}

const consultar = (url: string, { cookie }: Entrada) =>
  api.app.inject({ method: 'GET', url, remoteAddress: novoIp(), headers: { host, cookie } });

const enviar = (url: string, { cookie, csrf }: Entrada, payload: object = {}) =>
  api.app.inject({
    method: 'POST',
    url,
    remoteAddress: novoIp(),
    headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
    payload,
  });

describe('acesso no estado da sessão', () => {
  it('traz as permissões efetivas com o escopo de cada uma', async () => {
    const tecnico = await criarPerfil(api, org, {
      nome: 'Técnico',
      permissoes: ['pessoas.ver', 'locais.editar'],
    });
    await atribuir(api, org, { perfilId: tecnico, contaId: contas.bruno, localId: jundiai });
    const { entrada } = await entrar('bruno');
    const r = await consultar('/sessao', entrada);
    expect(r.json().sessao.acesso).toEqual({
      permissoes: [
        { chave: 'pessoas.ver', organizacao: false, locais: [jundiai] },
        { chave: 'locais.editar', organizacao: false, locais: [jundiai] },
      ],
    });
  });

  it('traz os perfis dados pelo grupo', async () => {
    const auditor = await criarPerfil(api, org, { nome: 'Auditor', permissoes: ['auditoria.ver'] });
    const grupo = await criarGrupo(api, org, { nome: 'Auditoria interna' });
    await atribuir(api, org, { perfilId: auditor, grupoId: grupo });
    await incluirNoGrupo(api, org, { grupoId: grupo, contaId: contas.gil ?? '' });
    const { resposta } = await entrar('gil');
    expect(resposta.json().sessao.acesso.permissoes).toEqual([
      { chave: 'auditoria.ver', organizacao: true, locais: [] },
    ]);
  });

  it('muda já na requisição seguinte quando o perfil muda', async () => {
    const perfil = await criarPerfil(api, org, { nome: 'Leitor', permissoes: ['pessoas.ver'] });
    await atribuir(api, org, { perfilId: perfil, contaId: contas.davi });
    const { entrada } = await entrar('davi');
    expect((await consultar('/sessao', entrada)).json().sessao.acesso.permissoes).toEqual([
      { chave: 'pessoas.ver', organizacao: true, locais: [] },
    ]);
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(perfis)
        .set({ permissoes: ['auditoria.ver'] })
        .where(eq(perfis.id, perfil)),
    );
    expect((await consultar('/sessao', entrada)).json().sessao.acesso.permissoes).toEqual([
      { chave: 'auditoria.ver', organizacao: true, locais: [] },
    ]);
  });
});

describe('dois passos exigidos pelo perfil', () => {
  const exigente = () =>
    criarPerfil(api, org, { nome: `Exigente ${++ipDoCaso}`, exigeDoisPassos: true });

  it('pede o cadastro na entrada da conta que o perfil obriga', async () => {
    await atribuir(api, org, { perfilId: await exigente(), contaId: contas.fabio });
    const { resposta } = await entrar('fabio');
    expect(resposta.json().sessao).toMatchObject({
      pendencia: 'cadastrar-dois-passos',
      acesso: { permissoes: [] },
    });
  });

  it('faz a sessão que vale pedir o cadastro, sem mudar o fim, e o cadastro a devolve', async () => {
    const { entrada } = await entrar('eva');
    const antes = (await consultar('/sessao', entrada)).json().sessao;
    expect(antes.pendencia).toBeNull();

    const perfil = await exigente();
    await atribuir(api, org, { perfilId: perfil, contaId: contas.eva });
    const pendente = (await consultar('/sessao', entrada)).json().sessao;
    expect(pendente).toMatchObject({
      pendencia: 'cadastrar-dois-passos',
      expiraEm: antes.expiraEm,
    });
    expect((await consultar('/conta/sessoes', entrada)).json()).toMatchObject({
      pendencia: 'cadastrar-dois-passos',
    });

    const [ativadaAntes] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ ativadaEm: sessoes.ativadaEm })
        .from(sessoes)
        .where(eq(sessoes.contaId, contas.eva ?? '')),
    );
    const cadastro = (await enviar('/conta/dois-passos/cadastro', entrada)).json();
    const codigo = gerarCodigoTotp(
      decodificarBase32(cadastro.chave.replaceAll(' ', '')),
      api.relogio.agora().getTime(),
    );
    const confirmacao = await enviar('/conta/dois-passos/confirmacao', entrada, { codigo });
    expect(confirmacao.statusCode).toBe(200);
    expect(confirmacao.json().sessao).toMatchObject({ pendencia: null, expiraEm: antes.expiraEm });
    expect(confirmacao.headers['set-cookie']).toBeUndefined();
    const [ativadaDepois] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ ativadaEm: sessoes.ativadaEm })
        .from(sessoes)
        .where(eq(sessoes.contaId, contas.eva ?? '')),
    );
    expect(ativadaDepois?.ativadaEm).toEqual(ativadaAntes?.ativadaEm);
    expect((await consultar('/conta/sessoes', entrada)).statusCode).toBe(200);

    const conta = (await consultar('/conta', entrada)).json();
    expect(conta.doisPassos).toMatchObject({
      situacao: 'ativa',
      exigida: true,
      exigidaPor: { conta: false, perfis: [expect.stringMatching(/^Exigente/)] },
    });

    const desativacao = await enviar('/conta/dois-passos/desativacao', entrada, {
      codigo: gerarCodigoTotp(
        decodificarBase32(cadastro.chave.replaceAll(' ', '')),
        api.relogio.agora().getTime() + 30_000,
      ),
    });
    expect(desativacao.statusCode).toBe(409);
    expect(desativacao.json().type).toBe('urn:grafite:problema:dois-passos-exigidos');
  });
});
