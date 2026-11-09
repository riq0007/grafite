// O código do segundo passo na entrada (spec verificacao-em-dois-passos): o código do app ou um de
// recuperação, nunca o mesmo duas vezes, cinco erros encerram a sessão pendente, e a sessão que
// passa a valer ganha um token novo.
import {
  auditoria,
  codigosDeRecuperacao,
  naOrganizacao,
  notificacoes,
  tentativasDeEntrada,
} from '@grafite/db';
import { and, eq, ne } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  criarConta,
  criarOrganizacao,
} from '../../test/integracao.ts';
import { hashDoCodigo } from '../acesso/codigos.ts';
import { gerarCodigoTotp } from '../acesso/totp.ts';

const host = 'grafite.segundo-passo.local';
const senha = 'cavalo bateria grampo correto';

let api: ApiDeTeste;
let org = '';
let ipDoCaso = 0;
const novoIp = () => `10.2.${Math.floor(++ipDoCaso / 250)}.${ipDoCaso % 250}`;
const contas: Record<string, { id: string; chaveDoApp: Buffer; codigos: string[] }> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  for (const usuario of ['davi', 'eva', 'fabio', 'gil', 'helena', 'igor']) {
    const conta = await criarConta(api, org, { usuario, senha });
    contas[usuario] = { id: conta.id, ...(await ativarDoisPassos(api, org, conta.id)) };
  }
  await criarConta(api, org, { usuario: 'sem.dois.passos', senha });
});

afterAll(async () => {
  await api?.fechar();
});

/** As notificações da conta, como a central as mostraria. */
const notificacoesDa = (contaId: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({
        severidade: notificacoes.severidade,
        titulo: notificacoes.titulo,
        descricao: notificacoes.descricao,
        origem: notificacoes.origem,
        destino: notificacoes.destino,
        alertaId: notificacoes.alertaId,
      })
      .from(notificacoes)
      .where(eq(notificacoes.contaId, contaId)),
  );

interface Entrada {
  cookie: string;
  csrf: string;
}

async function entrar(usuario: string): Promise<Entrada> {
  const r = await api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha },
  });
  return {
    cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
    csrf: r.json().sessao.csrf,
  };
}

function mandarCodigo({ cookie, csrf }: Entrada, codigo: string) {
  return api.app.inject({
    method: 'POST',
    url: '/sessao/segundo-passo',
    remoteAddress: novoIp(),
    headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
    payload: { codigo },
  });
}

const sessaoDo = async (cookie: string) =>
  (
    await api.app.inject({
      method: 'GET',
      url: '/sessao',
      remoteAddress: novoIp(),
      headers: { host, cookie },
    })
  ).json().sessao;

const codigoDoApp = (usuario: string) =>
  gerarCodigoTotp(contas[usuario]?.chaveDoApp ?? Buffer.alloc(0), api.relogio.agora().getTime());

const registros = (acao: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(auditoria).where(eq(auditoria.acao, acao)).orderBy(auditoria.id),
  );

describe('POST /sessao/segundo-passo', () => {
  it('o código do app faz a sessão valer, com um token e um CSRF novos, e o cookie antigo deixa de valer', async () => {
    const entrada = await entrar('davi');
    const r = await mandarCodigo(entrada, codigoDoApp('davi'));
    expect(r.statusCode).toBe(200);
    expect(r.json().sessao).toMatchObject({ conta: { usuario: 'davi' }, pendencia: null });
    const cookieNovo = String(r.headers['set-cookie']).split(';')[0] ?? '';
    expect(cookieNovo).not.toBe(entrada.cookie);
    expect(r.json().sessao.csrf).not.toBe(entrada.csrf);
    expect(await sessaoDo(entrada.cookie)).toBeNull();
    expect(await sessaoDo(cookieNovo)).toMatchObject({ pendencia: null });
    const [concluida] = (await registros('entrada.concluida')).slice(-1);
    expect(concluida).toMatchObject({ atorTipo: 'conta', atorContaId: contas.davi?.id });
  });

  it('o mesmo código do app não é aceito duas vezes', async () => {
    const codigo = codigoDoApp('eva');
    expect((await mandarCodigo(await entrar('eva'), codigo)).statusCode).toBe(200);
    const r = await mandarCodigo(await entrar('eva'), codigo);
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:codigo-invalido',
      detail: 'Código incorreto.',
    });
  });

  it('um código de recuperação serve uma vez, e a resposta diz quantos restam', async () => {
    const codigo = contas.fabio?.codigos[0] ?? '';
    const r = await mandarCodigo(await entrar('fabio'), codigo.toUpperCase());
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ sessao: { pendencia: null }, codigosRestantes: 9 });
    expect((await mandarCodigo(await entrar('fabio'), codigo)).statusCode).toBe(401);
    const [usado] = (await registros('codigo-de-recuperacao.usado')).slice(-1);
    expect(usado).toMatchObject({ atorContaId: contas.fabio?.id, dados: { restantes: 9 } });
    // Ainda restam códigos: nada vai para a central.
    expect(await notificacoesDa(contas.fabio?.id ?? '')).toEqual([]);
  });

  it('com o último código de recuperação, restam 0, e a conta ganha a notificação', async () => {
    const conta = contas.gil;
    const ultimo = conta?.codigos[0] ?? '';
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(codigosDeRecuperacao)
        .set({ usadoEm: api.relogio.agora() })
        .where(
          and(
            eq(codigosDeRecuperacao.contaId, conta?.id ?? ''),
            ne(codigosDeRecuperacao.hash, hashDoCodigo(ultimo)),
          ),
        ),
    );
    const r = await mandarCodigo(await entrar('gil'), ultimo);
    expect(r.statusCode).toBe(200);
    expect(r.json().codigosRestantes).toBe(0);
    expect(await notificacoesDa(conta?.id ?? '')).toEqual([
      {
        severidade: 'atencao',
        titulo: 'Este era o seu último código de recuperação. Gere novos na sua conta.',
        descricao: null,
        origem: 'Conta',
        destino: '/ajustes/conta',
        alertaId: null,
      },
    ]);
  });

  it('cinco códigos errados encerram a sessão pendente', async () => {
    const entrada = await entrar('helena');
    for (let i = 0; i < 4; i++) {
      expect((await mandarCodigo(entrada, '000000')).statusCode).toBe(401);
    }
    const r = await mandarCodigo(entrada, '000000');
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:tentativas-esgotadas',
      detail: 'Códigos errados demais. Entre de novo.',
    });
    expect(await sessaoDo(entrada.cookie)).toBeNull();
    const [encerrada] = (await registros('sessao.encerrada')).slice(-1);
    expect(encerrada?.dados).toEqual({ motivo: 'tentativas-esgotadas' });
    const recusas = (await registros('segundo-passo.recusado')).filter(
      (r) => r.atorContaId === contas.helena?.id,
    );
    expect(recusas).toHaveLength(5);
  });

  it('cada código errado conta como recusa no bloqueio do usuário', async () => {
    const entrada = await entrar('igor');
    await mandarCodigo(entrada, '000000');
    await mandarCodigo(entrada, '111111');
    const [tentativa] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(tentativasDeEntrada).where(eq(tentativasDeEntrada.usuario, 'igor')),
    );
    expect(tentativa?.falhasSeguidas).toBe(2);
  });

  it('a sessão que não espera o código não usa esta rota', async () => {
    const entrada = await entrar('sem.dois.passos');
    const r = await mandarCodigo(entrada, '123456');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:sem-pendencia' });
  });

  it('sem o token CSRF, o código não é conferido', async () => {
    const entrada = await entrar('davi');
    const r = await mandarCodigo({ ...entrada, csrf: 'outro' }, codigoDoApp('davi'));
    expect(r.statusCode).toBe(403);
  });
});
