// A própria foto e a foto na anonimização (specs administracao-de-pessoas e arquivos-e-imagens;
// design do F2c, decisão 8): a conta troca e remove a foto da própria pessoa sem permissão, só com
// a sessão que vale, e a anonimização tira a foto, que deixa de ser entregue na hora.
import { arquivos, eventos, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { imagemDeTeste } from '../../test/imagens.ts';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.foto-da-conta.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
/** Administradora. */
let ana: Entrada;
/** Sem nenhuma permissão. */
let davi: Entrada;
const davis = { contaId: '', pessoaId: '' };

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const conta = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administrador, contaId: conta.id });
  const doDavi = await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' });
  davis.contaId = doDavi.id;
  davis.pessoaId = doDavi.pessoaId;
  ana = await cliente.entrar('ana');
  davi = await cliente.entrar('davi');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const png = () => imagemDeTeste(120, 80).png().toBuffer();

const trocarAPropria = async (entrada: Entrada) =>
  cliente.enviarBytes('PUT', '/conta/foto', entrada, await png());

const registro = (id: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select().from(arquivos).where(eq(arquivos.id, id));
    return linha;
  });

describe('a própria foto', () => {
  it('a conta sem nenhuma permissão troca a foto da própria pessoa', async () => {
    const r = await trocarAPropria(davi);
    expect(r.statusCode).toBe(200);
    const foto = r.json().foto;
    expect(foto).toEqual({ id: expect.any(String) });
    expect(await registro(foto.id)).toMatchObject({ enviadoPor: davis.contaId, removidoEm: null });
    const entregue = await cliente.consultar(`/conta/foto/${foto.id}/64`, davi);
    expect(entregue.statusCode).toBe(200);
    expect(entregue.headers['content-type']).toBe('image/webp');
    expect((await sharp(entregue.rawPayload).metadata()).width).toBe(64);
    expect((await cliente.consultar('/sessao', davi)).json().sessao.conta.foto).toEqual(foto);
  });

  it('a troca é auditada, e o evento da pessoa vai também para a própria conta', async () => {
    const r = await trocarAPropria(davi);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'foto.trocada',
        atorContaId: davis.contaId,
        alvoTipo: 'pessoa',
        alvoId: davis.pessoaId,
      },
    ]);
    const gravados = await naOrganizacao(api.banco, org, (tx) => tx.select().from(eventos));
    expect(gravados).toMatchObject([
      { tipo: 'pessoas.mudaram', alvoId: davis.pessoaId, contas: [davis.contaId] },
    ]);
  });

  it('remove a própria foto, que deixa de ser entregue', async () => {
    const foto = (await trocarAPropria(davi)).json().foto.id;
    const r = await cliente.enviar('DELETE', '/conta/foto', davi);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ foto: null });
    expect(await registro(foto)).toMatchObject({ removidoEm: api.relogio.agora() });
    expect((await cliente.consultar(`/conta/foto/${foto}/64`, davi)).statusCode).toBe(404);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([{ acao: 'foto.removida' }]);
  });

  it('a foto de outra pessoa pelo endereço da própria responde 404', async () => {
    const pessoa = await criarPessoa(api, org, { nome: 'Érica Lima' });
    const daErica = (
      await cliente.enviarBytes('PUT', `/pessoas/${pessoa}/foto`, ana, await png())
    ).json().foto.id;
    const r = await cliente.consultar(`/conta/foto/${daErica}/64`, davi);
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ detail: 'Imagem não encontrada.' });
  });

  it('a sessão pendente é recusada, sem gravar nada', async () => {
    const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
    await ativarDoisPassos(api, org, bruno.id);
    const pendente = await cliente.entrar('bruno');
    const r = await trocarAPropria(pendente);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ pendencia: 'segundo-passo' });
    expect((await cliente.enviar('DELETE', '/conta/foto', pendente)).statusCode).toBe(403);
    const arquivo = '0199a6e0-0000-7000-8000-000000000f01';
    expect((await cliente.consultar(`/conta/foto/${arquivo}/64`, pendente)).statusCode).toBe(403);
  });
});

describe('a foto na anonimização', () => {
  it('a anonimização tira a foto, marca o arquivo como removido, e o endereço responde 404', async () => {
    const pessoa = await criarPessoa(api, org, { nome: 'João da Silva' });
    const foto = (
      await cliente.enviarBytes('PUT', `/pessoas/${pessoa}/foto`, ana, await png())
    ).json().foto.id;
    await cliente.enviar('POST', `/pessoas/${pessoa}/inativacao`, ana);
    const r = await cliente.enviar('POST', `/pessoas/${pessoa}/anonimizacao`, ana);
    expect(r.statusCode).toBe(200);
    expect(r.json().foto).toBeNull();
    expect(await registro(foto)).toMatchObject({
      removidoEm: api.relogio.agora(),
      apagadoEm: null,
    });
    const [auditado] = await auditoriaDaRequisicao(api, org, r);
    expect(auditado?.dados).toMatchObject({ camposApagados: expect.arrayContaining(['foto']) });
    const entrega = await cliente.consultar(`/pessoas/${pessoa}/foto/${foto}/64`, ana);
    expect(entrega.statusCode).toBe(404);
    expect(entrega.json()).toMatchObject({ detail: 'Imagem não encontrada.' });
  });
});
