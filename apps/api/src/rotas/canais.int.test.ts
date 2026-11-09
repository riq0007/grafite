// Os canais da conta e os aparelhos do push pela API (spec notificacoes, "Aparelhos do push" e
// "Canais desligados sem configuração"; change p3c-email-e-push, design, decisão 8): o que cada
// canal tem para a conta, a inscrição do aparelho num serviço de push conhecido, a troca da mesma
// inscrição, a retirada só pela própria conta e a inativação da conta, que apaga as inscrições.
import { inscricoesDePush, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parDoPush } from '../../test/canais.ts';
import {
  type ApiDeTeste,
  abrirApi,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  type Entrada,
} from '../../test/integracao.ts';
import { inativarConta } from '../acesso/inativacao.ts';
import type { CarteiroDeEmail } from '../canais/email.ts';
import { criarEntregadorDePush } from '../canais/push.ts';

const host = 'grafite.canais.local';
const CHAVES = parDoPush();
const carteiro: CarteiroDeEmail = { enviar: async () => {}, fechar: () => {} };

let api: ApiDeTeste;
let org = '';
let ana = { id: '', entrada: { cookie: '', csrf: '' } as Entrada };
let bruno = { id: '', entrada: { cookie: '', csrf: '' } as Entrada };
let cliente: ReturnType<typeof clienteDaApi>;

/** As chaves de uma inscrição, no formato do navegador: 65 e 16 bytes em base64url. */
const chaves = (letra = 'A') => ({ p256dh: `B${letra.repeat(86)}`, auth: letra.repeat(22) });

const inscricao = (endpoint: string, aparelho = 'Chrome no Android', letra = 'A') => ({
  endpoint,
  chaves: chaves(letra),
  aparelho,
});

const FCM = 'https://fcm.googleapis.com/fcm/send/aparelho-da-ana';

beforeAll(async () => {
  api = await abrirApi({
    canais: {
      carteiro,
      entregador: criarEntregadorDePush({ ...CHAVES, contato: 'mailto:ti@empresa.com.br' }),
    },
  });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const contaDaAna = await criarConta(api, org, {
    usuario: 'ana',
    nome: 'Ana Souza',
    email: 'ana.souza@empresa.com.br',
  });
  const contaDoBruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Lima' });
  ana = { id: contaDaAna.id, entrada: await cliente.entrar('ana') };
  bruno = { id: contaDoBruno.id, entrada: await cliente.entrar('bruno') };
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(inscricoesDePush));
});

const canais = (entrada: Entrada) => cliente.consultar('/conta/canais', entrada);
const inscrever = (entrada: Entrada, corpo: object) =>
  cliente.enviar('POST', '/conta/push', entrada, corpo);

describe('canais da conta', () => {
  it('o e-mail da pessoa e o push com a chave pública, ainda sem aparelhos', async () => {
    const r = await canais(ana.entrada);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      email: { situacao: 'ligado', endereco: 'ana.souza@empresa.com.br' },
      push: { situacao: 'ligado', chavePublica: CHAVES.chavePublica, aparelhos: [] },
    });
  });

  it('a pessoa sem e-mail fica sem o e-mail', async () => {
    expect((await canais(bruno.entrada)).json().email).toEqual({
      situacao: 'sem-email',
      endereco: null,
    });
  });
});

describe('aparelhos do push', () => {
  it('inscreve o aparelho, que aparece na lista da conta', async () => {
    const r = await inscrever(ana.entrada, inscricao(FCM));
    expect(r.statusCode).toBe(201);
    const aparelho = r.json();
    expect(aparelho).toMatchObject({
      aparelho: 'Chrome no Android',
      endpoint: FCM,
      ultimoEnvioEm: null,
    });
    expect((await canais(ana.entrada)).json().push.aparelhos).toEqual([aparelho]);
    expect((await canais(bruno.entrada)).json().push.aparelhos).toEqual([]);
  });

  it('o mesmo endereço troca a inscrição, também quando outra conta entra no navegador', async () => {
    await inscrever(ana.entrada, inscricao(FCM));
    const r = await inscrever(bruno.entrada, inscricao(FCM, 'Chrome no Android', 'C'));
    expect(r.statusCode).toBe(201);
    expect((await canais(ana.entrada)).json().push.aparelhos).toEqual([]);
    expect((await canais(bruno.entrada)).json().push.aparelhos).toHaveLength(1);
    const linhas = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(inscricoesDePush).where(eq(inscricoesDePush.endpoint, FCM)),
    );
    expect(linhas).toEqual([
      expect.objectContaining({ contaId: bruno.id, p256dh: chaves('C').p256dh }),
    ]);
  });

  it.each([
    'http://10.0.0.5/admin',
    'https://push.exemplo.test/aparelho',
    'https://fcm.googleapis.com.exemplo.test/aparelho',
  ])('recusa o endereço %s, fora dos serviços de push', async (endpoint) => {
    const r = await inscrever(ana.entrada, inscricao(endpoint));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      endpoint: 'Use o endereço de um serviço de push dos navegadores.',
    });
    expect((await canais(ana.entrada)).json().push.aparelhos).toEqual([]);
  });

  it('recusa as chaves fora do formato e o aparelho sem nome', async () => {
    const r = await inscrever(ana.entrada, {
      endpoint: FCM,
      chaves: { p256dh: 'curta', auth: 'curta' },
      aparelho: '',
    });
    expect(r.statusCode).toBe(400);
    expect(Object.keys(r.json().campos).sort()).toEqual([
      'aparelho',
      'chaves.auth',
      'chaves.p256dh',
    ]);
  });

  it('tira o aparelho da própria conta', async () => {
    const { id } = (await inscrever(ana.entrada, inscricao(FCM))).json();
    const r = await cliente.enviar('DELETE', `/conta/push/${id}`, ana.entrada);
    expect(r.statusCode).toBe(204);
    expect((await canais(ana.entrada)).json().push.aparelhos).toEqual([]);
  });

  it('o aparelho de outra conta responde 404 e continua inscrito', async () => {
    const { id } = (await inscrever(ana.entrada, inscricao(FCM))).json();
    const r = await cliente.enviar('DELETE', `/conta/push/${id}`, bruno.entrada);
    expect(r.statusCode).toBe(404);
    expect((await canais(ana.entrada)).json().push.aparelhos).toHaveLength(1);
  });

  it('a conta inativada perde os aparelhos dela', async () => {
    await inscrever(bruno.entrada, inscricao('https://fcm.googleapis.com/fcm/send/do-bruno'));
    await inscrever(ana.entrada, inscricao(FCM));
    await naOrganizacao(api.banco, org, (tx) =>
      inativarConta(tx, {
        contaId: bruno.id,
        ator: { tipo: 'conta', contaId: ana.id },
        momento: api.relogio.agora(),
      }),
    );
    const linhas = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ contaId: inscricoesDePush.contaId }).from(inscricoesDePush),
    );
    expect(linhas).toEqual([{ contaId: ana.id }]);
  });
});

describe('canais desligados', () => {
  it('sem a configuração, os dois ficam sem configuração, e nenhum aparelho é inscrito', async () => {
    const semCanais = await abrirApi();
    try {
      const outraOrg = await criarOrganizacao(semCanais, {
        nome: 'Sem canais',
        enderecos: ['grafite.sem-canais.local'],
      });
      await criarConta(semCanais, outraOrg, { usuario: 'eva', email: 'eva@empresa.com.br' });
      const doServidor = clienteDaApi(semCanais, 'grafite.sem-canais.local');
      const eva = await doServidor.entrar('eva');
      expect((await doServidor.consultar('/conta/canais', eva)).json()).toEqual({
        email: { situacao: 'sem-configuracao', endereco: 'eva@empresa.com.br' },
        push: { situacao: 'sem-configuracao', chavePublica: null, aparelhos: [] },
      });
      const r = await doServidor.enviar('POST', '/conta/push', eva, inscricao(FCM));
      expect(r.statusCode).toBe(409);
      expect(r.json().detail).toBe('Os avisos no celular não estão configurados neste servidor.');
    } finally {
      await semCanais.fechar();
    }
  });

  it('o ambiente de teste não envia, mesmo com os canais', async () => {
    const doTeste = await abrirApi({
      ambiente: 'teste',
      canais: {
        carteiro,
        entregador: criarEntregadorDePush({ ...CHAVES, contato: 'mailto:ti@empresa.com.br' }),
      },
    });
    try {
      const outraOrg = await criarOrganizacao(doTeste, {
        nome: 'Do teste',
        enderecos: ['grafite-teste.canais.local'],
      });
      await criarConta(doTeste, outraOrg, { usuario: 'eva', email: 'eva@empresa.com.br' });
      const doServidor = clienteDaApi(doTeste, 'grafite-teste.canais.local');
      const eva = await doServidor.entrar('eva');
      expect((await doServidor.consultar('/conta/canais', eva)).json()).toEqual({
        email: { situacao: 'ambiente-de-teste', endereco: 'eva@empresa.com.br' },
        push: { situacao: 'ambiente-de-teste', chavePublica: null, aparelhos: [] },
      });
      const r = await doServidor.enviar('POST', '/conta/push', eva, inscricao(FCM));
      expect(r.statusCode).toBe(409);
      expect(r.json().detail).toBe('O ambiente de teste não envia e-mail nem avisos no celular.');
    } finally {
      await doTeste.fechar();
    }
  });
});
