// A retomada da conexão de eventos (spec eventos-em-tempo-real; design do F2c, decisão 11): pelo
// Last-Event-ID, que o EventSource manda sozinho, ou por ?desde=, a API reenvia os eventos a partir
// de 30 s antes do último recebido, só os que a conta pode receber; o último desconhecido ou com
// mais de 24 h leva a reiniciar.
import { randomBytes } from 'node:crypto';
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirEventos, type FluxoDeEventos } from '../../test/eventos.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.eventos-retomada.local';
const SEGUNDO = 1000;
const HORA = 60 * 60 * SEGUNDO;

let api: ApiDeTeste;
let org = '';
let ana: Entrada;
let bruno: Entrada;
const ids: Record<string, string> = {};
const abertos: FluxoDeEventos[] = [];

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const leitura = await criarPerfil(api, org, { nome: 'Leitura', permissoes: ['pessoas.ver'] });
  const daAna = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: leitura, contaId: daAna.id });
  const doBruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: leitura, contaId: doBruno.id, localId: ids.jundiai });
  ana = await cliente.entrar('ana');
  bruno = await cliente.entrar('bruno');
});

afterAll(async () => {
  for (const fluxo of abertos) fluxo.fechar();
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

/** Um uuidv7 de um momento dado, com o resto aleatório. */
function uuidv7Em(momento: Date): string {
  const tempo = momento.getTime().toString(16).padStart(12, '0');
  const resto = randomBytes(10).toString('hex');
  return `${tempo.slice(0, 8)}-${tempo.slice(8, 12)}-7${resto.slice(0, 3)}-8${resto.slice(3, 6)}-${resto.slice(6, 18)}`;
}

/** Um evento gravado como se tivesse sido incluído no momento dado. */
async function gravarEm(
  momento: Date,
  publico: { todas?: boolean; permissao?: 'pessoas.ver'; locais?: string[] } = {
    todas: true,
  },
): Promise<string> {
  const id = uuidv7Em(momento);
  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(eventos).values({
      id,
      orgId: org,
      momento,
      tipo: publico.todas ? 'padroes.mudaram' : 'pessoas.mudaram',
      alvoTipo: publico.todas ? 'organizacao' : 'pessoa',
      alvoId: publico.todas ? org : uuidv7Em(momento),
      todas: publico.todas ?? false,
      permissao: publico.permissao ?? null,
      locais: publico.locais ?? null,
    }),
  );
  return id;
}

/** Espera os avisos e o fluxo assentarem. */
const assentar = () => new Promise((resolve) => setTimeout(resolve, 300));

async function retomar(entrada: Entrada, ultimo: string, como: 'cabecalho' | 'parametro') {
  // Os avisos dos eventos recém-gravados chegam antes: só a retomada pode entregá-los.
  await assentar();
  const fluxo = await abrirEventos(
    api,
    host,
    entrada,
    como === 'cabecalho'
      ? { cabecalhos: { 'last-event-id': ultimo } }
      : { caminho: `/eventos?desde=${encodeURIComponent(ultimo)}` },
  );
  abertos.push(fluxo);
  expect(fluxo.status).toBe(200);
  return fluxo;
}

const recebidos = (fluxo: FluxoDeEventos) =>
  fluxo.mensagens.filter((m) => m.evento).map((m) => m.id ?? m.evento);

describe('a retomada da conexão de eventos', () => {
  it.each(['cabecalho', 'parametro'] as const)(
    'reenvia, pelo %s, os eventos a partir de 30 s antes do último recebido, em ordem',
    async (como) => {
      const agora = Date.now();
      const antigo = await gravarEm(new Date(agora - 45 * SEGUNDO));
      const naMargem = await gravarEm(new Date(agora - 25 * SEGUNDO));
      const ultimo = await gravarEm(new Date(agora - 5 * SEGUNDO));
      const perdido = await gravarEm(new Date(agora - 1 * SEGUNDO));
      const fluxo = await retomar(ana, ultimo, como);
      await vi.waitFor(() => expect(recebidos(fluxo)).toEqual([naMargem, perdido]));
      expect(recebidos(fluxo)).not.toContain(antigo);
    },
  );

  it('reenvia só os eventos que a conta pode receber', async () => {
    const agora = Date.now();
    const ultimo = await gravarEm(new Date(agora - 10 * SEGUNDO));
    const deJundiai = await gravarEm(new Date(agora - 5 * SEGUNDO), {
      permissao: 'pessoas.ver',
      locais: [String(ids.jundiai)],
    });
    await gravarEm(new Date(agora - 4 * SEGUNDO), {
      permissao: 'pessoas.ver',
      locais: [String(ids.campinas)],
    });
    const fluxo = await retomar(bruno, ultimo, 'cabecalho');
    await assentar();
    expect(recebidos(fluxo)).toEqual([deJundiai]);
  });

  it('o último evento desconhecido leva a reiniciar', async () => {
    const fluxo = await retomar(ana, uuidv7Em(new Date()), 'cabecalho');
    await vi.waitFor(() => expect(recebidos(fluxo)).toEqual(['reiniciar']));
    const lixo = await retomar(ana, 'nao-e-um-evento', 'parametro');
    await vi.waitFor(() => expect(recebidos(lixo)).toEqual(['reiniciar']));
  });

  it('o último evento com mais de 24 h leva a reiniciar', async () => {
    const ultimo = await gravarEm(new Date(api.relogio.agora().getTime() - 25 * HORA));
    const fluxo = await retomar(ana, ultimo, 'cabecalho');
    await vi.waitFor(() => expect(recebidos(fluxo)).toEqual(['reiniciar']));
  });

  it('sem o último evento, não reenvia nada', async () => {
    await gravarEm(new Date(Date.now() - 5 * SEGUNDO));
    await assentar();
    const fluxo = await abrirEventos(api, host, ana);
    abertos.push(fluxo);
    await assentar();
    expect(recebidos(fluxo)).toEqual([]);
  });
});
