// As preferências da conta (spec preferencias-da-interface; design do F2c, decisão 3): a mudança
// chega como merge patch e a resposta é a camada da conta. Um campo inválido recusa o pedido
// inteiro, nada vai para a auditoria, e o evento vai só para as sessões da conta.
import { contas, eventos, naOrganizacao } from '@grafite/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.preferencias.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let anaId = '';
let ana: Entrada;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  anaId = (await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' })).id;
  ana = await cliente.entrar('ana');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(eventos);
    await tx
      .update(contas)
      .set({ preferencias: { dock: { posicao: 'esquerda' } } })
      .where(eq(contas.id, anaId));
  });
});

const mudar = (entrada: Entrada, mudancas: unknown) =>
  cliente.enviar('PATCH', '/conta/preferencias', entrada, { mudancas });

const salvas = (contaId: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .select({ preferencias: contas.preferencias })
      .from(contas)
      .where(eq(contas.id, contaId));
    return linha?.preferencias;
  });

/**
 * Espera até `quantas` transações estarem paradas, esperando uma trava do banco. A consulta vai
 * pelo papel da aplicação, o único que enxerga a espera das conexões dela.
 */
async function esperarNaTrava(quantas: number) {
  for (let tentativa = 0; tentativa < 250; tentativa += 1) {
    const { rows } = await api.banco.execute<{ esperando: number }>(
      sql`select count(*)::int as esperando from pg_stat_activity where wait_event_type = 'Lock'`,
    );
    if ((rows[0]?.esperando ?? 0) >= quantas) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`As ${quantas} transações não chegaram a esperar a trava.`);
}

describe('PATCH /conta/preferencias', () => {
  it('aplica a mudança como merge patch e devolve a camada da conta', async () => {
    const r = await mudar(ana, { aparencia: { tema: 'papel' }, dock: { tamanho: 36 } });
    expect(r.statusCode).toBe(200);
    const camada = { aparencia: { tema: 'papel' }, dock: { posicao: 'esquerda', tamanho: 36 } };
    expect(r.json()).toEqual(camada);
    expect(await salvas(anaId)).toEqual(camada);
  });

  it('o null tira o campo, e a seção que fica vazia sai', async () => {
    await mudar(ana, { aparencia: { tema: 'papel', raio: 8 } });
    const r = await mudar(ana, { aparencia: { raio: null }, dock: { posicao: null } });
    expect(r.json()).toEqual({ aparencia: { tema: 'papel' } });
    expect(await salvas(anaId)).toEqual({ aparencia: { tema: 'papel' } });
  });

  it('o null na seção tira a seção inteira, como o "Restaurar"', async () => {
    const r = await mudar(ana, { dock: null });
    expect(r.json()).toEqual({});
    expect(await salvas(anaId)).toEqual({});
  });

  it('um campo inválido recusa o pedido inteiro, com a mensagem no campo', async () => {
    const r = await mudar(ana, { dock: { tamanho: 90 }, aparencia: { tema: 'papel' } });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:dados-invalidos',
      campos: { 'mudancas.dock.tamanho': 'Use de 28 a 64.' },
    });
    expect(await salvas(anaId)).toEqual({ dock: { posicao: 'esquerda' } });
  });

  it('o modo Foco grava na conta, só ligado ou desligado', async () => {
    const r = await mudar(ana, { notificacoes: { foco: true } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ dock: { posicao: 'esquerda' }, notificacoes: { foco: true } });
    expect((await mudar(ana, { notificacoes: { foco: 'sim' } })).statusCode).toBe(400);
  });

  it('as escolhas do e-mail e do push gravam na conta, com o resumo só desligado ou diário', async () => {
    const r = await mudar(ana, {
      notificacoes: { emailCritico: false, resumo: 'desligado', pushAtencao: true },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      dock: { posicao: 'esquerda' },
      notificacoes: { emailCritico: false, resumo: 'desligado', pushAtencao: true },
    });
    const semanal = await mudar(ana, { notificacoes: { resumo: 'semanal' } });
    expect(semanal.statusCode).toBe(400);
    expect(semanal.json().campos).toHaveProperty(['mudancas.notificacoes.resumo']);
  });

  // Spec preferencias-da-interface, "Tema e destaque personalizados nas preferências".
  it('o tema e o destaque personalizados gravam inteiros, e o tom desconhecido recusa', async () => {
    const aparencia = {
      tema: 'personalizado',
      personalizado: { tom: 'claro', matiz: 80, tingimento: 30, contraste: 60 },
      destaque: 'personalizado',
      destaquePersonalizado: { matiz: 155, intensidade: 70 },
    };
    const r = await mudar(ana, { aparencia });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ dock: { posicao: 'esquerda' }, aparencia });
    const sepia = await mudar(ana, {
      aparencia: { personalizado: { ...aparencia.personalizado, tom: 'sépia' } },
    });
    expect(sepia.statusCode).toBe(400);
    expect(sepia.json().campos).toHaveProperty(['mudancas.aparencia.personalizado.tom']);
    expect(await salvas(anaId)).toEqual({ dock: { posicao: 'esquerda' }, aparencia });
  });

  // Spec preferencias-da-interface, "Blocos do Início nas preferências".
  it('os blocos do Início gravam inteiros, e o bloco repetido recusa', async () => {
    const blocos = [
      { id: 'ativos.suprimentos', visivel: true },
      { id: 'gestao.backups', visivel: false },
    ];
    const r = await mudar(ana, { inicio: { blocos } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ dock: { posicao: 'esquerda' }, inicio: { blocos } });
    const repetido = await mudar(ana, { inicio: { blocos: [...blocos, blocos[0]] } });
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json().campos).toHaveProperty(['mudancas.inicio.blocos']);
    expect(await salvas(anaId)).toEqual({ dock: { posicao: 'esquerda' }, inicio: { blocos } });
  });

  it('um ajuste desconhecido também recusa o pedido inteiro', async () => {
    const r = await mudar(ana, { dock: { cor: 'azul' }, aparencia: { tema: 'papel' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toHaveProperty(['mudancas.dock']);
    expect(await salvas(anaId)).toEqual({ dock: { posicao: 'esquerda' } });
  });

  it('duas gravações ao mesmo tempo em campos diferentes não se atropelam', async () => {
    // A linha da conta fica presa até as duas gravações estarem esperando por ela. Assim elas
    // correm juntas, e a segunda só pode ler a linha depois de a primeira gravar.
    let soltar = () => {};
    let presa = () => {};
    const linhaPresa = new Promise<void>((resolve) => {
      presa = resolve;
    });
    const segurando = naOrganizacao(api.banco, org, async (tx) => {
      await tx.select().from(contas).where(eq(contas.id, anaId)).for('update');
      presa();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await linhaPresa;
    const pedidos = Promise.all([
      mudar(ana, { aparencia: { tema: 'oled' } }),
      mudar(ana, { dock: { tamanho: 40 } }),
    ]);
    try {
      await esperarNaTrava(2);
    } finally {
      soltar();
      await segurando;
    }
    const [tema, tamanho] = await pedidos;
    expect([tema.statusCode, tamanho.statusCode]).toEqual([200, 200]);
    expect(await salvas(anaId)).toEqual({
      aparencia: { tema: 'oled' },
      dock: { posicao: 'esquerda', tamanho: 40 },
    });
  });

  it('não vai para a auditoria', async () => {
    const r = await mudar(ana, { aparencia: { tema: 'papel' } });
    expect(r.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
  });

  it('grava o evento preferencias.mudaram só para as sessões da conta', async () => {
    await mudar(ana, { aparencia: { tema: 'papel' } });
    const gravados = await naOrganizacao(api.banco, org, (tx) => tx.select().from(eventos));
    expect(gravados).toMatchObject([
      {
        tipo: 'preferencias.mudaram',
        alvoTipo: 'conta',
        alvoId: anaId,
        todas: false,
        permissao: null,
        locais: null,
        contas: [anaId],
        sessoes: null,
      },
    ]);
  });

  it('a sessão pendente é recusada', async () => {
    const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
    await ativarDoisPassos(api, org, bruno.id);
    const r = await mudar(await cliente.entrar('bruno'), { aparencia: { tema: 'papel' } });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:pendencia',
      pendencia: 'segundo-passo',
    });
    expect(await salvas(bruno.id)).toEqual({});
  });

  it('sem sessão, é recusada com 401', async () => {
    const r = await mudar(SEM_ENTRADA, { aparencia: { tema: 'papel' } });
    expect(r.statusCode).toBe(401);
  });
});
