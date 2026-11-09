// O estado da sessão com a foto e as preferências (specs entrada-e-sessoes e
// preferencias-da-interface; design do F2c, decisões 3 e 4): os padrões da organização sempre, e a
// conta, a pessoa, a foto e as preferências dela só com a sessão que vale.
import { arquivos, contas, naOrganizacao, organizacoes, pessoas } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.estado-da-sessao.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const ana = { id: '', pessoaId: '', fotoId: '' };

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const conta = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ana.id = conta.id;
  ana.pessoaId = conta.pessoaId;
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await ativarDoisPassos(api, org, bruno.id);
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx
      .update(organizacoes)
      .set({ preferencias: { aparencia: { tema: 'nevoa', destaque: 'roxo' } } });
    await tx
      .update(contas)
      .set({ preferencias: { dock: { posicao: 'esquerda' } } })
      .where(eq(contas.id, conta.id));
    await tx
      .update(contas)
      .set({ preferencias: { aparencia: { tema: 'papel' } } })
      .where(eq(contas.id, bruno.id));
    const [foto] = await tx
      .insert(arquivos)
      .values({ orgId: org, tipo: 'image/webp', bytes: 100, largura: 64, altura: 64 })
      .returning();
    ana.fotoId = foto?.id ?? '';
    await tx.update(pessoas).set({ fotoId: ana.fotoId }).where(eq(pessoas.id, conta.pessoaId));
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('estado da sessão', () => {
  it('sem sessão, traz os padrões válidos da organização e nenhuma sessão', async () => {
    const r = await cliente.consultar('/sessao', SEM_ENTRADA);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      ambiente: 'desenvolvimento',
      organizacao: {
        nome: 'Empresa',
        preferencias: { aparencia: { tema: 'nevoa' } },
        operaOServidor: false,
        modulosDesligados: [],
      },
      sessao: null,
    });
  });

  it('com a sessão que vale, traz a conta, a pessoa, a foto e as preferências dela', async () => {
    const entrada = await cliente.entrar('ana');
    const r = await cliente.consultar('/sessao', entrada);
    expect(r.json().organizacao.preferencias).toEqual({ aparencia: { tema: 'nevoa' } });
    expect(r.json().sessao.conta).toEqual({
      id: ana.id,
      usuario: 'ana',
      nome: 'Ana Souza',
      pessoaId: ana.pessoaId,
      foto: { id: ana.fotoId },
      preferencias: { dock: { posicao: 'esquerda' } },
    });
  });

  it('a entrada já responde com a foto e as preferências', async () => {
    const r = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      headers: { host, 'sec-fetch-site': 'same-origin' },
      payload: { usuario: 'ana', senha: 'cavalo bateria grampo correto' },
    });
    expect(r.json().sessao.conta).toMatchObject({
      foto: { id: ana.fotoId },
      preferencias: { dock: { posicao: 'esquerda' } },
    });
  });

  it('com a sessão pendente, não traz a conta, a pessoa, a foto nem as preferências', async () => {
    const r = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      headers: { host, 'sec-fetch-site': 'same-origin' },
      payload: { usuario: 'bruno', senha: 'cavalo bateria grampo correto' },
    });
    expect(r.json().sessao.pendencia).toBe('segundo-passo');
    expect(r.json().sessao.conta).toEqual({
      id: null,
      usuario: 'bruno',
      nome: 'Bruno Costa',
      pessoaId: null,
      foto: null,
      preferencias: null,
    });
    expect(r.json().organizacao.preferencias).toEqual({ aparencia: { tema: 'nevoa' } });
  });

  it('a conta sem foto traz a foto nula', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(pessoas).set({ fotoId: null }).where(eq(pessoas.id, ana.pessoaId)),
    );
    const entrada = await cliente.entrar('ana');
    const r = await cliente.consultar('/sessao', entrada);
    expect(r.json().sessao.conta.foto).toBeNull();
  });
});
