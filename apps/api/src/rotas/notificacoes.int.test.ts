// As notificações pela API (spec notificacoes, "Notificações gravadas no servidor" e "Ações do
// alerta na notificação"; change p3b-notificacoes-no-servidor, design, decisões 5 a 7): o
// `notificar`, a lista da conta com os filtros, o cursor e a contagem das não lidas, o alerta atual
// de cada uma e a leitura de uma e de todas, com o evento das sessões da conta.
import {
  eventos,
  naOrganizacao,
  notificacoes as tabelaDasNotificacoes,
  alertas as tabelaDosAlertas,
} from '@grafite/db';
import type { NovaNotificacao } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type AlertasDeTeste,
  criarAlerta,
  criarAtivoDoTipo,
  criarRegra,
  criarTipo,
  montarAlertas,
  type UsuarioDosAlertas,
} from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi, SEM_ENTRADA } from '../../test/integracao.ts';
import { notificar } from '../notificacoes/notificar.ts';

const host = 'grafite.notificacoes.local';
const MINUTO = 60_000;

let api: ApiDeTeste;
let alertas: AlertasDeTeste;
let regra = '';
let impressora = '';

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  const { org } = alertas;
  const tipo = await criarTipo(api, org, { capacidades: ['snmp.suprimentos'] });
  impressora = await criarAtivoDoTipo(api, org, {
    tipoId: tipo,
    nome: 'Impressora do RH',
    patrimonio: 'PAT-00412',
    localId: alertas.jundiai,
  });
  regra = await criarRegra(api, org, {
    nome: 'Toner em 10% ou menos',
    condicao: 'toner.nivel',
    parametros: { limite: 10, folga: 5 },
    duracao: 0,
    severidade: 'critico',
    escopo: { tipo: 'organizacao', id: null },
  });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, alertas.org, async (tx) => {
    await tx.delete(eventos);
    await tx.delete(tabelaDasNotificacoes);
    await tx.delete(tabelaDosAlertas);
  });
});

const da = (usuario: UsuarioDosAlertas, dados: Partial<NovaNotificacao> = {}): NovaNotificacao => ({
  contaId: alertas.contas[usuario].id,
  severidade: 'critico',
  titulo: 'Black Toner Cartridge em 8%',
  descricao: 'Impressora do RH · PAT-00412',
  origem: 'Alertas',
  destino: `/ativos/${impressora}`,
  alertaId: null,
  ...dados,
});

/** Grava as notificações como um módulo, no momento do relógio, e avança um minuto depois. */
async function gravar(...novas: NovaNotificacao[]) {
  await naOrganizacao(api.banco, alertas.org, (tx) => notificar(tx, novas, api.relogio.agora()));
  api.relogio.avancar(MINUTO);
}

const listar = (usuario: UsuarioDosAlertas, consulta = '') =>
  alertas.cliente.consultar(`/notificacoes${consulta}`, alertas.como(usuario));
const ler = (id: string, usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.enviar('POST', `/notificacoes/${id}/leitura`, alertas.como(usuario));
const lerTodas = (usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.enviar('POST', '/notificacoes/leitura', alertas.como(usuario));

const titulos = (r: { json: () => { itens: { titulo: string }[] } }) =>
  r.json().itens.map(({ titulo }) => titulo);

const avisos = () =>
  naOrganizacao(api.banco, alertas.org, (tx) =>
    tx.select({ tipo: eventos.tipo, contas: eventos.contas }).from(eventos),
  );

describe('notificar', () => {
  it('grava as notificações em lotes, com um evento só para as contas notificadas', async () => {
    const muitas = Array.from({ length: 1_200 }, (_, i) =>
      da(i % 2 === 0 ? 'ana' : 'davi', { titulo: `Alerta ${i}` }),
    );
    await gravar(...muitas);
    const gravadas = await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx.select({ id: tabelaDasNotificacoes.id }).from(tabelaDasNotificacoes),
    );
    expect(gravadas).toHaveLength(1_200);
    const eventosGravados = await avisos();
    expect(eventosGravados).toHaveLength(1);
    expect(eventosGravados[0]?.tipo).toBe('notificacoes.mudaram');
    expect([...(eventosGravados[0]?.contas ?? [])].sort()).toEqual(
      [alertas.contas.ana.id, alertas.contas.davi.id].sort(),
    );
  });

  it('sem notificação nenhuma, não grava evento', async () => {
    await gravar();
    expect(await avisos()).toEqual([]);
  });
});

describe('GET /notificacoes', () => {
  it('lista as da conta, da mais recente para a mais antiga, com a contagem das não lidas', async () => {
    await gravar(da('ana', { titulo: 'Primeira' }));
    await gravar(da('ana', { titulo: 'Segunda', severidade: 'info', descricao: null }));
    await gravar(da('davi', { titulo: 'Do Davi' }));
    const r = await listar('ana');
    expect(r.statusCode).toBe(200);
    expect(titulos(r)).toEqual(['Segunda', 'Primeira']);
    expect(r.json()).toMatchObject({ naoLidas: 2, proximo: null });
    expect(r.json().itens[1]).toEqual({
      id: expect.any(String),
      severidade: 'critico',
      titulo: 'Primeira',
      descricao: 'Impressora do RH · PAT-00412',
      origem: 'Alertas',
      destino: `/ativos/${impressora}`,
      criadaEm: expect.any(String),
      lida: false,
      alerta: null,
    });
    expect(titulos(await listar('davi'))).toEqual(['Do Davi']);
    expect(titulos(await listar('carla'))).toEqual([]);
  });

  it('filtra pela severidade e pelas não lidas no servidor, e a contagem é de todas', async () => {
    await gravar(da('ana', { titulo: 'Crítica' }));
    await gravar(da('ana', { titulo: 'Informação', severidade: 'info' }));
    await gravar(da('ana', { titulo: 'Lida', severidade: 'info' }));
    const lida = (await listar('ana')).json().itens[0].id;
    await ler(lida);
    expect(titulos(await listar('ana', '?severidade=critico'))).toEqual(['Crítica']);
    const naoLidas = await listar('ana', '?naoLidas=true');
    expect(titulos(naoLidas)).toEqual(['Informação', 'Crítica']);
    expect(naoLidas.json().naoLidas).toBe(2);
    expect((await listar('ana', '?severidade=grave')).statusCode).toBe(400);
  });

  it('pagina pelo cursor, sem pular nem repetir', async () => {
    for (const titulo of ['1', '2', '3', '4', '5']) await gravar(da('ana', { titulo }));
    const primeira = await listar('ana', '?limite=2');
    expect(titulos(primeira)).toEqual(['5', '4']);
    const segunda = await listar('ana', `?limite=2&cursor=${primeira.json().proximo}`);
    expect(titulos(segunda)).toEqual(['3', '2']);
    const terceira = await listar('ana', `?limite=2&cursor=${segunda.json().proximo}`);
    expect(titulos(terceira)).toEqual(['1']);
    expect(terceira.json().proximo).toBeNull();
  });

  it('traz o alerta atual, com o que a conta pode tratar', async () => {
    const alertaId = await criarAlerta(api, alertas.org, {
      regraId: regra,
      ativoId: impressora,
      texto: 'Black Toner Cartridge em 8%',
    });
    await gravar(da('ana', { alertaId }), da('davi', { alertaId }), da('bruno', { alertaId }));
    expect((await listar('ana')).json().itens[0].alerta).toEqual({
      id: alertaId,
      situacao: 'aberto',
      reconhecido: null,
      adiado: null,
      permite: { tratar: true },
    });
    // Davi só vê os alertas, e Bruno os trata só em Campinas: a impressora é de Jundiaí.
    expect((await listar('davi')).json().itens[0].alerta.permite).toEqual({ tratar: false });
    expect((await listar('bruno')).json().itens[0].alerta.permite).toEqual({ tratar: false });

    await alertas.cliente.enviar(
      'POST',
      `/alertas/${alertaId}/reconhecimento`,
      alertas.como('ana'),
    );
    await alertas.cliente.enviar('POST', `/alertas/${alertaId}/adiamento`, alertas.como('ana'), {
      minutos: 15,
    });
    const tratado = (await listar('davi')).json().itens[0].alerta;
    expect(tratado.reconhecido).toEqual({ nome: 'Ana Souza', em: expect.any(String) });
    expect(tratado.adiado).toEqual({ ate: expect.any(String), nome: 'Ana Souza' });

    // O adiamento vencido não aparece, e o resolvido diz que se resolveu.
    api.relogio.avancar(16 * MINUTO);
    await naOrganizacao(api.banco, alertas.org, (tx) =>
      tx
        .update(tabelaDosAlertas)
        .set({
          situacao: 'resolvido',
          resolvidoEm: api.relogio.agora(),
          comoTerminou: 'voltou-ao-normal',
        })
        .where(eq(tabelaDosAlertas.id, alertaId)),
    );
    expect((await listar('davi')).json().itens[0].alerta).toMatchObject({
      situacao: 'resolvido',
      adiado: null,
    });
  });

  it('sem sessão, responde 401', async () => {
    expect((await alertas.cliente.consultar('/notificacoes', SEM_ENTRADA)).statusCode).toBe(401);
  });
});

describe('leitura', () => {
  it('marca uma como lida, e de novo sem erro, com o evento só na mudança', async () => {
    await gravar(da('ana', { titulo: 'Uma' }), da('ana', { titulo: 'Outra' }));
    await naOrganizacao(api.banco, alertas.org, (tx) => tx.delete(eventos));
    const id = (await listar('ana')).json().itens[0].id;
    expect((await ler(id)).statusCode).toBe(204);
    const depois = await listar('ana');
    expect(depois.json().naoLidas).toBe(1);
    expect(depois.json().itens[0].lida).toBe(true);
    expect((await ler(id)).statusCode).toBe(204);
    expect(await avisos()).toEqual([
      { tipo: 'notificacoes.mudaram', contas: [alertas.contas.ana.id] },
    ]);
  });

  it('a notificação de outra conta responde 404 e continua não lida', async () => {
    await gravar(da('ana'));
    const id = (await listar('ana')).json().itens[0].id;
    const r = await ler(id, 'davi');
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Notificação não encontrada.');
    expect((await listar('ana')).json().naoLidas).toBe(1);
  });

  it('marca todas as não lidas da conta e diz quantas', async () => {
    await gravar(da('ana'), da('ana'), da('ana'), da('davi'));
    const r = await lerTodas();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ lidas: 3 });
    expect((await listar('ana')).json().naoLidas).toBe(0);
    expect((await listar('davi')).json().naoLidas).toBe(1);
    expect((await lerTodas()).json()).toEqual({ lidas: 0 });
  });
});
