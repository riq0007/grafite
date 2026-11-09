// A meta de um indicador pela API (spec indicadores, "Metas da organização", e auditoria, "Meta de
// indicador registrada"; change p3d-indicadores, design, decisão 6): quem administra os alertas muda
// a meta dentro dos limites, com a auditoria do "antes → depois" e o evento para quem vê os alertas.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AlertasDeTeste, montarAlertas, type UsuarioDosAlertas } from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';

const host = 'grafite.metas.local';

let api: ApiDeTeste;
let alertas: AlertasDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
});

afterAll(async () => {
  await api?.fechar();
});

const mudar = (indicador: string, meta: unknown, usuario: UsuarioDosAlertas = 'ana') =>
  alertas.cliente.enviar('PUT', `/alertas/indicadores/${indicador}/meta`, alertas.como(usuario), {
    meta,
  });

const metaNaTela = async (indicador: string) =>
  (await alertas.cliente.consultar('/alertas/indicadores', alertas.como('ana'))).json().indicadores[
    indicador
  ].meta;

const eventosGravados = () =>
  naOrganizacao(api.banco, alertas.org, (tx) =>
    tx
      .select({
        tipo: eventos.tipo,
        alvoTipo: eventos.alvoTipo,
        permissao: eventos.permissao,
        locais: eventos.locais,
      })
      .from(eventos),
  );

describe('PUT /alertas/indicadores/{indicador}/meta', () => {
  it('Meta mudada: vale nos indicadores, com a auditoria e o evento', async () => {
    await naOrganizacao(api.banco, alertas.org, (tx) => tx.delete(eventos));
    const r = await mudar('toner', 1440);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ indicador: 'toner', meta: 1440, metaDeFabrica: 2880 });
    expect(await metaNaTela('toner')).toBe(1440);
    // Meta do toner mudada: a auditoria guarda quem, o indicador e o "antes → depois".
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toMatchObject([
      {
        acao: 'meta-de-indicador.alterada',
        atorContaId: alertas.contas.ana.id,
        alvoTipo: 'indicador',
        antes: { meta: '2 dias' },
        depois: { meta: '1 dia' },
        dados: { indicador: 'Tempo de atendimento do toner' },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'metas.mudaram', alvoTipo: 'indicador', permissao: 'alertas.ver', locais: null },
    ]);

    const deNovo = await mudar('toner', 2880);
    expect(deNovo.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, alertas.org, deNovo)).toMatchObject([
      { antes: { meta: '1 dia' }, depois: { meta: '2 dias' } },
    ]);
  });

  it('a mesma meta não grava nada', async () => {
    await mudar('critico', 15);
    await naOrganizacao(api.banco, alertas.org, (tx) => tx.delete(eventos));
    const r = await mudar('critico', 15);
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, alertas.org, r)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('Meta fora dos limites: recusa com a mensagem do limite', async () => {
    const r = await mudar('disponibilidade', 1000);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ meta: 'A meta deve ficar entre 90% e 99,9%.' });
    expect((await mudar('que-voltam', 2.5)).json().campos).toEqual({
      meta: 'A meta deve ficar entre 2 e 20 vezes.',
    });
    expect(await metaNaTela('disponibilidade')).toBe(990);
  });

  it('Quem só vê os alertas: a mudança é recusada com 403', async () => {
    expect((await mudar('toner', 1440, 'davi')).statusCode).toBe(403);
    expect((await mudar('toner', 1440, 'bruno')).statusCode).toBe(403);
  });

  it('diz que não acha um indicador que não existe, nem um da operação', async () => {
    for (const indicador of ['toner-colorido', 'paginas-por-toner']) {
      const r = await mudar(indicador, 500);
      expect(r.statusCode).toBe(404);
      expect(r.json().detail).toBe('Indicador não encontrado.');
    }
  });
});
