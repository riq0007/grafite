// O teste dos canais (spec notificacoes, "Teste dos canais"; change p3c-email-e-push, design,
// decisão 9): o e-mail e o aviso de teste vão na hora, pelo carteiro e pelo entregador, sem gravar
// notificação, com o resultado na resposta e um teste de cada canal a cada 30 s por conta.
import { inscricoesDePush, naOrganizacao, notificacoes } from '@grafite/db';
import { pushDeTeste } from '@grafite/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parDoPush, servicoDePushFalso, servidorDeEmail } from '../../test/canais.ts';
import {
  type ApiDeTeste,
  abrirApi,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  type Entrada,
} from '../../test/integracao.ts';
import { criarCarteiroDeEmail } from '../canais/email.ts';
import { criarEntregadorDePush } from '../canais/push.ts';

const host = 'grafite.teste-dos-canais.local';
const SENHA = ['senha', 'do', 'smtp'].join('-');
const REMETENTE = 'Grafite <grafite@empresa.com.br>';
const TRINTA_SEGUNDOS = 30_000;

let smtp: Awaited<ReturnType<typeof servidorDeEmail>>;
let servico: Awaited<ReturnType<typeof servicoDePushFalso>>;
let api: ApiDeTeste;
let org = '';
let ana = '';
let anaEntrada: Entrada;
let brunoEntrada: Entrada;
let cliente: ReturnType<typeof clienteDaApi>;

beforeAll(async () => {
  smtp = await servidorDeEmail({ senha: SENHA });
  servico = await servicoDePushFalso();
  api = await abrirApi({
    canais: {
      carteiro: criarCarteiroDeEmail({ urlSmtp: smtp.url(), remetente: REMETENTE }),
      entregador: criarEntregadorDePush(
        { ...parDoPush(), contato: 'mailto:ti@empresa.com.br' },
        { extras: [servico.origem], agente: servico.agente },
      ),
    },
  });
  org = await criarOrganizacao(api, { nome: 'Empresa dos testes', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ana = (
    await criarConta(api, org, {
      usuario: 'ana',
      nome: 'Ana Souza',
      email: 'ana.souza@empresa.com.br',
    })
  ).id;
  await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Lima' });
  anaEntrada = await cliente.entrar('ana');
  brunoEntrada = await cliente.entrar('bruno');
});

afterAll(async () => {
  await api?.fechar();
  await smtp?.fechar();
  await servico?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(inscricoesDePush));
  smtp.mensagens.length = 0;
  // Cada teste começa longe do anterior: o limite de um teste a cada 30 s não passa de um ao outro.
  api.relogio.avancar(TRINTA_SEGUNDOS);
});

const testarEmail = (entrada: Entrada) =>
  cliente.enviar('POST', '/conta/canais/email/teste', entrada);
const testarPush = (entrada: Entrada) =>
  cliente.enviar('POST', '/conta/canais/push/teste', entrada);

async function inscrever() {
  const aparelho = servico.aparelho();
  await naOrganizacao(api.banco, org, (tx) =>
    tx
      .insert(inscricoesDePush)
      .values({ orgId: org, contaId: ana, ...aparelho.inscricao, aparelho: 'Chrome no Android' }),
  );
  return aparelho;
}

describe('teste do e-mail', () => {
  it('manda o e-mail de teste para a pessoa, na hora, sem notificação', async () => {
    const r = await testarEmail(anaEntrada);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ endereco: 'ana.souza@empresa.com.br' });
    const [email] = smtp.mensagens;
    expect(email?.subject).toBe('Teste do e-mail do Grafite');
    expect(email?.to && 'text' in email.to ? email.to.text : '').toBe('ana.souza@empresa.com.br');
    const gravadas = await naOrganizacao(api.banco, org, (tx) => tx.select().from(notificacoes));
    expect(gravadas).toEqual([]);
  });

  it('um teste de cada canal a cada 30 s', async () => {
    expect((await testarEmail(anaEntrada)).statusCode).toBe(200);
    const deNovo = await testarEmail(anaEntrada);
    expect(deNovo.statusCode).toBe(429);
    expect(deNovo.json().detail).toBe('Espere 30 s para mandar outro teste.');
    api.relogio.avancar(TRINTA_SEGUNDOS);
    expect((await testarEmail(anaEntrada)).statusCode).toBe(200);
  });

  it('a pessoa sem e-mail não tem para onde mandar', async () => {
    const r = await testarEmail(brunoEntrada);
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe(
      'A pessoa da sua conta não tem e-mail. Peça à administração para cadastrar o seu e-mail.',
    );
  });

  it('a recusa do servidor de e-mail volta com o motivo e o código de rastreio', async () => {
    const recusado = await abrirApi({
      canais: {
        carteiro: criarCarteiroDeEmail({
          urlSmtp: smtp.url(['outra', 'senha'].join('-')),
          remetente: REMETENTE,
        }),
      },
    });
    try {
      const outraOrg = await criarOrganizacao(recusado, {
        nome: 'Recusada',
        enderecos: ['grafite.recusado.local'],
      });
      await criarConta(recusado, outraOrg, { usuario: 'eva', email: 'eva@empresa.com.br' });
      const doRecusado = clienteDaApi(recusado, 'grafite.recusado.local');
      const r = await doRecusado.enviar(
        'POST',
        '/conta/canais/email/teste',
        await doRecusado.entrar('eva'),
      );
      expect(r.statusCode).toBe(502);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:canal-recusou',
        detail: 'O servidor de e-mail recusou a autenticação.',
        codigoDeRastreio: expect.any(String),
      });
    } finally {
      await recusado.fechar();
    }
  });
});

describe('teste do push', () => {
  it('manda o aviso de teste para cada aparelho, sem notificação', async () => {
    const celular = await inscrever();
    const computador = await inscrever();
    const r = await testarPush(anaEntrada);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ aparelhos: 2 });
    expect(celular.recebidos()).toEqual([pushDeTeste()]);
    expect(computador.recebidos()).toEqual([pushDeTeste()]);
  });

  it('o aparelho que deixou de existir sai, e conta só o que recebeu', async () => {
    const perdido = await inscrever();
    servico.responder(perdido.caminho, 410);
    await inscrever();
    const r = await testarPush(anaEntrada);
    expect(r.json()).toEqual({ aparelhos: 1 });
    const restantes = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(inscricoesDePush),
    );
    expect(restantes).toHaveLength(1);
  });

  it('sem aparelho inscrito, pede um antes', async () => {
    const r = await testarPush(anaEntrada);
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe('Inscreva um aparelho antes de mandar o aviso de teste.');
  });

  it('o serviço de push que recusa todos volta com o motivo', async () => {
    const recusado = await inscrever();
    servico.responder(recusado.caminho, 503);
    const r = await testarPush(anaEntrada);
    expect(r.statusCode).toBe(502);
    expect(r.json().detail).toBe('O serviço de push recusou o aviso de teste.');
  });
});
