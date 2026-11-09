// A sondagem do Control iD (spec saude-do-control-id, "Sondagem dos controles"; change
// p2c-saude-do-control-id, design, decisões 1 e 4), contra o simulador da API do Control iD: o
// controle que responde, com o firmware pelos dois nomes; o login recusado, pelo 401 e pela resposta
// sem a sessão; o que não responde, com a tentativa a mais; a resposta inesperada, pelo 404 e pelo
// corpo que não é JSON; a saída da sessão, mesmo com a leitura falhando; e as leituras que o lote
// aceita.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { lerLote } from '@grafite/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  iniciarSimuladorControlId,
  type ModoDoSimulador,
  type SimuladorControlId,
} from '../test/simulador-control-id.ts';
import { leiturasDoControle, type SondagemLida, sondarControle } from './control-id.ts';

const GRAVACOES = join(import.meta.dirname, '..', 'test', 'gravacoes', 'control-id');
const USUARIO = 'admin';
const SENHA = 'senha-do-controle';
const ATIVO = '0199d3a0-0000-7000-8000-0000000000d1';
const MOMENTO = new Date('2026-10-14T13:20:00.000Z');
const QUANDO = MOMENTO.toISOString();
/**
 * A espera dos controles que respondem: o simulador responde na hora, mas o executor do CI carregado
 * já fez o logout, que vai sem tentativa a mais, passar de 300 ms (change testes-sob-carga, decisão 5).
 */
const ESPERAS = { espera: 5_000, esperaDaTentativa: 50 };
/** A espera curta do controle que não responde, que confere o tempo esgotado sem esperar 10 s. */
const ESPERAS_DO_CALADO = { espera: 300, esperaDaTentativa: 50 };

const abertos: { fechar: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((aberto) => aberto.fechar()));
});

async function simulador(
  modo: ModoDoSimulador = 'aceita',
  gravacao = 'idaccess-pro.json',
): Promise<SimuladorControlId> {
  const iniciado = await iniciarSimuladorControlId({
    gravacao: { arquivo: join(GRAVACOES, gravacao) },
    usuario: USUARIO,
    senha: SENHA,
    modo,
  });
  abertos.push(iniciado);
  return iniciado;
}

/** Um servidor que responde como o teste pede, para o que o simulador não faz. */
async function servidor(
  responder: (caminho: string) => { status: number; corpo: string },
): Promise<{ porta: number; caminhos: string[] }> {
  const caminhos: string[] = [];
  const http: Server = createServer((pedido, resposta) => {
    const caminho = new URL(pedido.url ?? '/', 'http://x').pathname;
    caminhos.push(caminho);
    pedido.resume();
    pedido.on('end', () => {
      const { status, corpo } = responder(caminho);
      resposta.writeHead(status, { 'content-type': 'text/html' });
      resposta.end(corpo);
    });
  });
  await new Promise<void>((pronto) => http.listen(0, '127.0.0.1', pronto));
  abertos.push({
    fechar: () =>
      new Promise<void>((pronto) => {
        http.closeAllConnections();
        http.close(() => pronto());
      }),
  });
  return { porta: (http.address() as AddressInfo).port, caminhos };
}

const sondar = (porta: number, senha = SENHA) =>
  sondarControle({ ip: '127.0.0.1', porta, usuario: USUARIO, senha, ...ESPERAS });

describe('a sondagem do Control iD', () => {
  it('o controle que responde dá o firmware, o produto e a série, e a sondagem sai da sessão', async () => {
    const controle = await simulador();
    expect(await sondar(controle.porta)).toEqual({
      situacao: 'respondendo',
      firmware: '6.12.2',
      produto: 'iDAccess Pro',
      serie: '0M0400/123456',
    });
    expect(controle.sessoesAbertas()).toBe(0);
    expect(controle.pedidos().map(({ caminho }) => caminho)).toEqual([
      '/login.fcgi',
      '/system_information.fcgi',
      '/logout.fcgi',
    ]);
    expect(controle.pedidos()[0]?.corpo).toEqual({ login: USUARIO, password: SENHA });
  });

  it('o firmware vem pelos dois nomes, e o que o controle não informa fica vazio', async () => {
    expect(await sondar((await simulador('aceita', 'idflex.json')).porta)).toEqual({
      situacao: 'respondendo',
      firmware: '5.8.1',
      produto: 'iDFlex',
      serie: '0M0300/654321',
    });
    expect(await sondar((await simulador('aceita', 'so-firmware.json')).porta)).toEqual({
      situacao: 'respondendo',
      firmware: '4.1.0',
      produto: null,
      serie: null,
    });
  });

  it('o login recusado, pelo 401 e pela resposta sem a sessão, e a senha errada', async () => {
    expect(await sondar((await simulador('recusa')).porta)).toEqual({
      situacao: 'login-recusado',
    });
    expect(await sondar((await simulador('sem-sessao')).porta)).toEqual({
      situacao: 'login-recusado',
    });
    const controle = await simulador();
    expect(await sondar(controle.porta, 'senha-trocada-no-controle')).toEqual({
      situacao: 'login-recusado',
    });
    expect(controle.pedidos()).toHaveLength(1);
  });

  it('o controle que não responde, nem na tentativa a mais, e a conexão recusada', async () => {
    const calado = await simulador('cala');
    expect(
      await sondarControle({
        ip: '127.0.0.1',
        porta: calado.porta,
        usuario: USUARIO,
        senha: SENHA,
        ...ESPERAS_DO_CALADO,
      }),
    ).toEqual({ situacao: 'sem-resposta' });
    expect(calado.pedidos()).toHaveLength(2);
    const fechado = await servidor(() => ({ status: 200, corpo: '' }));
    await abertos.pop()?.fechar();
    expect(await sondar(fechado.porta)).toEqual({ situacao: 'sem-resposta' });
  });

  it('a resposta inesperada, pelo 404 de outro equipamento e pelo corpo que não é JSON', async () => {
    const impressora = await simulador('outro');
    expect(await sondar(impressora.porta)).toEqual({
      situacao: 'resposta-inesperada',
      etapa: 'login',
      codigo: 404,
    });
    const pagina = await servidor(() => ({ status: 200, corpo: '<html>Login</html>' }));
    expect(await sondar(pagina.porta)).toEqual({
      situacao: 'resposta-inesperada',
      etapa: 'login',
      codigo: 200,
    });
  });

  it('sai da sessão mesmo quando a leitura das informações falha', async () => {
    const quebrado = await servidor((caminho) =>
      caminho === '/login.fcgi'
        ? { status: 200, corpo: '{"session":"s1"}' }
        : caminho === '/system_information.fcgi'
          ? { status: 500, corpo: 'erro' }
          : { status: 200, corpo: '{}' },
    );
    expect(await sondar(quebrado.porta)).toEqual({
      situacao: 'resposta-inesperada',
      etapa: 'informacoes',
      codigo: 500,
    });
    expect(quebrado.caminhos).toEqual(['/login.fcgi', '/system_information.fcgi', '/logout.fcgi']);
  });
});

describe('as leituras da sondagem', () => {
  const comoALeLe = (leituras: unknown[]) =>
    lerLote({ chave: '0199d3a0-0000-7000-8000-0000000000c2', leituras }, MOMENTO);
  const leitura = (metrica: string, valor: unknown, extras: object = {}) => ({
    ativoId: ATIVO,
    metrica,
    momento: QUANDO,
    valor,
    ...extras,
  });

  it('o controle que responde dá a sondagem, o firmware com o produto e a série', () => {
    const leituras = leiturasDoControle(
      ATIVO,
      {
        situacao: 'respondendo',
        firmware: '6.12.2',
        produto: 'iDAccess Pro',
        serie: '0M0400/123456',
      },
      MOMENTO,
    );
    expect(leituras).toEqual([
      leitura('controlid.sondagem', 'respondendo'),
      leitura('controlid.firmware', '6.12.2', { detalhes: { produto: 'iDAccess Pro' } }),
      leitura('controlid.serie', '0M0400/123456'),
    ]);
    expect(comoALeLe(leituras).ok).toBe(true);
  });

  it('o firmware que não vem fica sem valor, e sem a série não há leitura dela', () => {
    expect(
      leiturasDoControle(
        ATIVO,
        { situacao: 'respondendo', firmware: null, produto: null, serie: null },
        MOMENTO,
      ),
    ).toEqual([leitura('controlid.sondagem', 'respondendo'), leitura('controlid.firmware', null)]);
  });

  it('as outras situações dão só a sondagem, a inesperada com a etapa e o código', () => {
    const lidas: [SondagemLida | null, object][] = [
      [{ situacao: 'login-recusado' }, leitura('controlid.sondagem', 'login-recusado')],
      [{ situacao: 'sem-resposta' }, leitura('controlid.sondagem', 'sem-resposta')],
      [
        { situacao: 'resposta-inesperada', etapa: 'login', codigo: 404 },
        leitura('controlid.sondagem', 'resposta-inesperada', {
          detalhes: { etapa: 'login', codigo: 404 },
        }),
      ],
      [
        { situacao: 'resposta-inesperada', etapa: 'informacoes', codigo: null },
        leitura('controlid.sondagem', 'resposta-inesperada', {
          detalhes: { etapa: 'informacoes' },
        }),
      ],
      [null, leitura('controlid.sondagem', null)],
    ];
    for (const [lida, esperada] of lidas) {
      const leituras = leiturasDoControle(ATIVO, lida, MOMENTO);
      expect(leituras).toEqual([esperada]);
      expect(comoALeLe(leituras).ok).toBe(true);
    }
  });

  it('o texto que não cabe no lote é cortado em 100 caracteres', () => {
    const longo = 'x'.repeat(150);
    const leituras = leiturasDoControle(
      ATIVO,
      { situacao: 'respondendo', firmware: longo, produto: longo, serie: longo },
      MOMENTO,
    );
    expect(leituras.slice(1)).toEqual([
      leitura('controlid.firmware', 'x'.repeat(100), { detalhes: { produto: 'x'.repeat(100) } }),
      leitura('controlid.serie', 'x'.repeat(100)),
    ]);
    expect(comoALeLe(leituras).ok).toBe(true);
  });
});
