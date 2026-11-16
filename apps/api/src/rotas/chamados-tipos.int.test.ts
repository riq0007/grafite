// A lista e a ordem dos tipos de chamado pela API (spec tipos-de-chamado, "Tipo de chamado" e
// "Rascunho, duplicar e descartar"; spec chamados, a auditoria e os eventos; change chamados-da-ti,
// design, decisão 18): a lista, para quem configura os chamados, com os abertos e os abertos nos
// últimos 365 dias de cada tipo; a ordem, com todos os tipos uma vez cada, a auditoria e o evento
// dos ajustes; a conta sem `chamados.configurar`; e o módulo desligado.
import {
  auditoria,
  chamados,
  eventos,
  naOrganizacao,
  type Transacao,
  tiposDeChamado,
} from '@grafite/db';
import { TIPOS_DE_CHAMADO_DE_FABRICA } from '@grafite/domain';
import { asc, eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarTipo, desligarModulos } from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  esperarNaTrava,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { criarTiposDeFabrica } from '../chamados/fabrica.ts';

const host = 'grafite.chamados-tipos.local';
const DIA = 24 * 60 * 60 * 1000;
const ATOR = { tipo: 'sistema', descricao: 'teste dos tipos de chamado' } as const;
const ORDEM_INVALIDA = 'A ordem precisa ter todos os tipos, uma vez cada.';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const tipos: Record<string, string> = {};
let daOutra = '';
let renato = '';
let pessoa = '';
let numero = 1000;

interface TipoNaLista {
  id: string;
  nome: string;
  ordem: number;
}

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const listar = (usuario = 'ana') => cliente.consultar('/chamados/tipos', como(usuario));
const ordenar = (ids: string[], usuario = 'ana') =>
  cliente.enviar('PUT', '/chamados/tipos/ordem', como(usuario), { ids });
const naLista = async (): Promise<TipoNaLista[]> => (await listar()).json().tipos;

/** Os tipos da organização do contexto, na ordem. */
const tiposNaOrdem = (tx: Transacao) =>
  tx
    .select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome })
    .from(tiposDeChamado)
    .orderBy(asc(tiposDeChamado.ordem));

/**
 * Um chamado direto no banco, aberto pela TI há tantos milissegundos: na triagem, em atendimento
 * com Renato ou resolvido por ele.
 */
const chamado = (
  tipo: string,
  situacao: 'triagem' | 'em-atendimento' | 'resolvido',
  abertoHa: number,
) => {
  const abertoEm = new Date(api.relogio.agora().getTime() - abertoHa);
  return naOrganizacao(api.banco, org, (tx) =>
    tx.insert(chamados).values({
      orgId: org,
      numero: ++numero,
      tipoId: tipo,
      titulo: 'Impressora manchando',
      tituloNormalizado: 'impressora manchando',
      pessoaId: pessoa,
      origem: 'ti',
      abertoPor: renato,
      abertoEm,
      formulario: { titulo: { comecaPeloTipo: true, campoId: null }, campos: [] },
      situacao,
      responsavelId: situacao === 'em-atendimento' ? renato : null,
      responsavelDesde: situacao === 'em-atendimento' ? abertoEm : null,
      prazo: {
        modo: 'horario',
        respostaMin: 30,
        resolucaoMin: 480,
        resposta: { valor: 30, unidade: 'min' },
        resolucao: { valor: 8, unidade: 'h' },
      },
      relogioDesde: situacao === 'resolvido' ? null : abertoEm,
      primeiraRespostaEm: abertoEm,
      resolvidoEm: situacao === 'resolvido' ? abertoEm : null,
      resolvidoPor: situacao === 'resolvido' ? renato : null,
    }),
  );
};

const acoesDaOrdem = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({
        acao: auditoria.acao,
        alvoTipo: auditoria.alvoTipo,
        alvoId: auditoria.alvoId,
        antes: auditoria.antes,
        depois: auditoria.depois,
      })
      .from(auditoria)
      .where(like(auditoria.acao, 'tipos-de-chamado.%'))
      .orderBy(asc(auditoria.momento), asc(auditoria.id)),
  );

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, permissoes: eventos.permissoes }).from(eventos),
  );

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const outra = await criarOrganizacao(api, {
    nome: 'Outra',
    enderecos: ['grafite.chamados-tipos-outra.local'],
  });
  const momento = api.relogio.agora();
  for (const de of [org, outra]) {
    await naOrganizacao(api.banco, de, (tx) => criarTiposDeFabrica(tx, { ator: ATOR, momento }));
  }
  daOutra = await naOrganizacao(
    api.banco,
    outra,
    async (tx) => (await tiposNaOrdem(tx))[0]?.id ?? '',
  );
  for (const { id, nome } of await naOrganizacao(api.banco, org, tiposNaOrdem)) tipos[nome] = id;

  cliente = clienteDaApi(api, host);
  // Ana configura os chamados; Bruno e Renato os atendem, sem configurar.
  const configura = await criarPerfil(api, org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  renato = (await criarConta(api, org, { usuario: 'renato', nome: 'Renato Alves' })).id;
  pessoa = (await criarConta(api, org, { usuario: 'fernanda', nome: 'Fernanda Rocha' })).pessoaId;
  await atribuir(api, org, { perfilId: configura, contaId: ana.id });
  await atribuir(api, org, { perfilId: atende, contaId: bruno.id });
  await atribuir(api, org, { perfilId: atende, contaId: renato });
  for (const usuario of ['ana', 'bruno']) entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

describe('a lista dos tipos', () => {
  it('traz os tipos na ordem, com o prazo, quem atende, os campos e as chaves', async () => {
    // O Telefone é atendido por Renato; a Troca de equipamento gera a solicitação de um Notebook.
    const notebook = await criarTipo(api, org, { nome: 'Notebook' });
    await naOrganizacao(api.banco, org, async (tx) => {
      await tx
        .update(tiposDeChamado)
        .set({ atendePorPadrao: renato })
        .where(eq(tiposDeChamado.id, tipos.Telefone ?? ''));
      await tx
        .update(tiposDeChamado)
        .set({ geraSolicitacao: 'equipamento', tipoDeAtivoDoEquipamento: notebook })
        .where(eq(tiposDeChamado.id, tipos['Troca de equipamento'] ?? ''));
    });

    const r = await listar();
    expect(r.statusCode, r.body).toBe(200);
    const lista = r.json().tipos;
    expect(lista.map(({ nome }: TipoNaLista) => nome)).toEqual(
      TIPOS_DE_CHAMADO_DE_FABRICA.map(({ nome }) => nome),
    );
    const impressora = TIPOS_DE_CHAMADO_DE_FABRICA[2];
    expect(lista[2]).toEqual({
      id: tipos.Impressora,
      nome: 'Impressora',
      icone: 'impressora',
      frase: 'Mancha, atola ou não imprime',
      situacao: 'em-uso',
      ordem: 3,
      prazo: impressora?.prazo,
      atendePorPadrao: null,
      semNinguem: impressora?.semNinguem,
      podeVirarOs: impressora?.podeVirarOs,
      geraSolicitacao: 'nao',
      tipoDeAtivoDoEquipamento: null,
      pedeOAtivo: true,
      apareceParaOColaborador: impressora?.apareceParaOColaborador,
      soATiAbre: false,
      campos: impressora?.formulario.campos.length,
      duplicadoDe: null,
      abertos: 0,
      noUltimoAno: 0,
    });
    expect(lista[6]).toMatchObject({
      nome: 'Telefone',
      atendePorPadrao: { id: renato, nome: 'Renato Alves' },
    });
    expect(lista[8]).toMatchObject({
      nome: 'Troca de equipamento',
      soATiAbre: true,
      geraSolicitacao: 'equipamento',
      tipoDeAtivoDoEquipamento: { id: notebook, nome: 'Notebook' },
    });
  });

  it('conta os abertos e os abertos nos últimos 365 dias de cada tipo', async () => {
    const impressora = tipos.Impressora ?? '';
    await chamado(impressora, 'em-atendimento', 10 * DIA);
    await chamado(impressora, 'triagem', 2 * 365 * DIA);
    await chamado(impressora, 'resolvido', 100 * DIA);
    // O aberto há 365 dias exatos ainda conta; o aberto um segundo antes, não.
    await chamado(impressora, 'resolvido', 365 * DIA);
    await chamado(impressora, 'resolvido', 365 * DIA + 1000);
    await chamado(tipos.Toner ?? '', 'resolvido', 30 * DIA);

    const lista = (await listar()).json().tipos;
    const contagem = (nome: string) => {
      const tipo = lista.find((de: TipoNaLista) => de.nome === nome);
      return [tipo?.abertos, tipo?.noUltimoAno];
    };
    expect(contagem('Impressora')).toEqual([2, 3]);
    expect(contagem('Toner')).toEqual([0, 1]);
    expect(contagem('Telefone')).toEqual([0, 0]);
  });

  it('mostra o Rascunho, sem a frase e com a origem do duplicar', async () => {
    await naOrganizacao(api.banco, org, async (tx) => {
      const [toner] = await tx
        .select()
        .from(tiposDeChamado)
        .where(eq(tiposDeChamado.id, tipos.Toner ?? ''));
      if (!toner) throw new Error('O Toner não foi lido.');
      const { id, ...doToner } = toner;
      await tx.insert(tiposDeChamado).values({
        ...doToner,
        nome: 'Toner (cópia)',
        nomeNormalizado: 'toner (copia)',
        frase: null,
        situacao: 'rascunho',
        ordem: 10,
        duplicadoDe: id,
      });
    });
    const lista = (await listar()).json().tipos;
    expect(lista).toHaveLength(10);
    expect(lista[9]).toMatchObject({
      nome: 'Toner (cópia)',
      frase: null,
      situacao: 'rascunho',
      ordem: 10,
      duplicadoDe: tipos.Toner,
      campos: TIPOS_DE_CHAMADO_DE_FABRICA[0]?.formulario.campos.length,
    });
  });
});

describe('a ordem dos tipos', () => {
  it('reordena com todos os tipos, com a auditoria e o evento dos ajustes', async () => {
    const antes = await naLista();
    const [toner, computador, impressora, ...resto] = antes;
    const r = await ordenar(
      [impressora, toner, computador, ...resto].map((tipo) => tipo?.id ?? ''),
    );
    expect(r.statusCode, r.body).toBe(200);
    const depois: TipoNaLista[] = r.json().tipos;
    expect(depois.map(({ nome, ordem }) => [nome, ordem])).toEqual(
      ['Impressora', 'Toner', 'Computador', ...resto.map(({ nome }) => nome)].map(
        (nome, posicao) => [nome, posicao + 1],
      ),
    );
    expect((await naLista()).map(({ nome }) => nome)).toEqual(depois.map(({ nome }) => nome));
    expect(await acoesDaOrdem()).toEqual([
      {
        acao: 'tipos-de-chamado.ordenados',
        alvoTipo: 'tipos-de-chamado',
        alvoId: null,
        antes: { ordem: antes.map(({ nome }) => nome) },
        depois: { ordem: depois.map(({ nome }) => nome) },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      {
        tipo: 'ajustes-dos-chamados.mudaram',
        permissoes: ['chamados.ver', 'chamados.atender', 'chamados.configurar'],
      },
    ]);
  });

  it('a mesma ordem não grava nada', async () => {
    const antes = await acoesDaOrdem();
    const r = await ordenar((await naLista()).map(({ id }) => id));
    expect(r.statusCode, r.body).toBe(200);
    expect(await acoesDaOrdem()).toEqual(antes);
    expect(await eventosGravados()).toEqual([]);
  });

  it('a ordem que espera outra gravação lê a ordem que ela deixou', async () => {
    // Outra transação troca os dois primeiros tipos de lugar e segura as linhas até a ordem estar
    // esperando por elas. A ordem pede a sequência de antes da troca: depois da espera, ela tem
    // de ver a troca, desfazê-la e registrar na auditoria a ordem que a outra deixou.
    const antes = await naLista();
    const [primeiro, segundo, ...resto] = antes;
    if (!primeiro || !segundo) throw new Error('Faltam tipos na lista.');
    let soltar = () => {};
    let presas = () => {};
    const linhasPresas = new Promise<void>((resolve) => {
      presas = resolve;
    });
    const segurando = naOrganizacao(api.banco, org, async (tx) => {
      await tx.update(tiposDeChamado).set({ ordem: 2 }).where(eq(tiposDeChamado.id, primeiro.id));
      await tx.update(tiposDeChamado).set({ ordem: 1 }).where(eq(tiposDeChamado.id, segundo.id));
      presas();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await linhasPresas;
    const pedido = ordenar(antes.map(({ id }) => id));
    try {
      await esperarNaTrava(api);
    } finally {
      soltar();
      await segurando;
    }
    const r = await pedido;
    expect(r.statusCode, r.body).toBe(200);
    expect((await naLista()).map(({ nome }) => nome)).toEqual(antes.map(({ nome }) => nome));
    expect((await acoesDaOrdem()).at(-1)).toMatchObject({
      antes: { ordem: [segundo.nome, primeiro.nome, ...resto.map(({ nome }) => nome)] },
      depois: { ordem: antes.map(({ nome }) => nome) },
    });
  });

  it('recusa a ordem sem um tipo, com um repetido ou com o tipo de outra organização', async () => {
    const ids = (await naLista()).map(({ id }) => id);
    for (const errada of [ids.slice(1), [...ids, ids[0] ?? ''], [...ids.slice(1), daOutra]]) {
      const r = await ordenar(errada);
      expect(r.statusCode).toBe(400);
      expect(r.json().campos).toEqual({ ids: ORDEM_INVALIDA });
    }
    expect((await naLista()).map(({ id }) => id)).toEqual(ids);
  });
});

describe('quem pode e o módulo', () => {
  it('Conta sem chamados.configurar: a lista e a ordem respondem 403', async () => {
    expect((await listar('bruno')).statusCode).toBe(403);
    expect((await ordenar(Object.values(tipos), 'bruno')).statusCode).toBe(403);
  });

  it('recusa as rotas com o módulo Chamados desligado', async () => {
    await desligarModulos(api, org, ['chamados']);
    for (const r of [await listar(), await ordenar(Object.values(tipos))]) {
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:modulo-desligado',
        detail: 'O módulo Chamados está desligado nesta organização.',
      });
    }
    await desligarModulos(api, org, []);
    expect((await listar()).statusCode).toBe(200);
  });
});
