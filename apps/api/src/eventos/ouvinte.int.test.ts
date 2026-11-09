// O ouvinte do banco (spec eventos-em-tempo-real; design do F2c, decisão 10): o LISTEN num cliente
// próprio, fora do pool, que entrega cada evento depois do commit e, se a ligação cai, a refaz com
// intervalos crescentes e avisa que eventos podem ter se perdido.
import { naOrganizacao, type Transacao } from '@grafite/db';
import type { EventoDeSaida } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { criarOuvinte, type OuvinteDoBanco } from './ouvinte.ts';
import { registrarEvento } from './saida.ts';

let api: ApiDeTeste;
let org = '';
let ouvinte: OuvinteDoBanco | undefined;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: ['grafite.ouvinte.local'] });
});

afterEach(async () => {
  await ouvinte?.parar();
  ouvinte = undefined;
});

afterAll(async () => {
  await api?.fechar();
});

function ouvir() {
  const recebidos: EventoDeSaida[] = [];
  const religou = vi.fn();
  const avisar = vi.fn();
  ouvinte = criarOuvinte({
    conectar: () => new pg.Client({ connectionString: inject('urlApp') }),
    aoEvento: (evento) => recebidos.push(evento),
    aoReligar: religou,
    avisar,
    esperaInicial: 50,
  });
  return { recebidos, religou, avisar, ouvinte };
}

const gravar = (tx: Transacao) =>
  registrarEvento(tx, {
    tipo: 'padroes.mudaram',
    alvo: { tipo: 'organizacao', id: org },
    publico: { todas: true },
  });

describe('o ouvinte do banco', () => {
  it('entrega o evento depois do commit, e nunca antes', async () => {
    const { recebidos, ouvinte: ligado } = ouvir();
    await ligado.iniciar();
    expect(ligado.ligado()).toBe(true);
    await naOrganizacao(api.banco, org, async (tx) => {
      await gravar(tx);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(recebidos).toEqual([]);
    });
    await vi.waitFor(() => expect(recebidos).toHaveLength(1), { timeout: 2000 });
    expect(recebidos[0]).toMatchObject({
      id: expect.any(String),
      orgId: org,
      momento: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      tipo: 'padroes.mudaram',
      alvo: { tipo: 'organizacao', id: org },
      publico: { todas: true },
    });
  });

  it('a transação desfeita não entrega nada', async () => {
    const { recebidos, ouvinte: ligado } = ouvir();
    await ligado.iniciar();
    await expect(
      naOrganizacao(api.banco, org, async (tx) => {
        await gravar(tx);
        throw new Error('desfeita');
      }),
    ).rejects.toThrow('desfeita');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(recebidos).toEqual([]);
  });

  it('a ligação derrubada pelo banco é refeita, seguida de reiniciar, e volta a entregar', async () => {
    const { recebidos, religou, avisar, ouvinte: ligado } = ouvir();
    await ligado.iniciar();
    expect(religou).not.toHaveBeenCalled();
    // O papel da aplicação encerra a própria ligação do LISTEN, como um banco que reinicia.
    await api.banco.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity
        where usename = current_user and pid <> pg_backend_pid() and query = 'LISTEN grafite_eventos'`,
    );
    await vi.waitFor(() => expect(religou).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(avisar).toHaveBeenCalled();
    expect(ligado.ligado()).toBe(true);
    await naOrganizacao(api.banco, org, gravar);
    await vi.waitFor(() => expect(recebidos).toHaveLength(1), { timeout: 2000 });
  });

  it('parado, não religa', async () => {
    const { religou, ouvinte: ligado } = ouvir();
    await ligado.iniciar();
    await ligado.parar();
    expect(ligado.ligado()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(religou).not.toHaveBeenCalled();
  });
});
