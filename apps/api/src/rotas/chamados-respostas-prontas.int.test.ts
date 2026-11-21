// As respostas prontas pela API (spec chamados, "Respostas prontas"; change chamados-da-ti, tarefa
// 4.4), para quem configura os chamados: a lista na ordem, o cadastro pela conferência do domínio,
// com o rótulo único e os tipos só entre os Em uso e os Inativos, a remoção, a ordem e o limite de
// 100 na organização, que a trava das respostas prontas segura com duas criações ao mesmo tempo.
// Tudo com a auditoria e o evento dos ajustes.
import { eventos, naOrganizacao, respostasProntas, tiposDeChamado } from '@grafite/db';
import { asc, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  esperarNaTrava,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { criarTiposDeFabrica } from '../chamados/fabrica.ts';
import { travar } from '../travas.ts';

const host = 'grafite.chamados-respostas-prontas.local';
const ATOR = { tipo: 'sistema', descricao: 'teste das respostas prontas' } as const;
const DA_LISTA = 'Escolha os tipos da lista.';
const REPETIDO = 'Já existe uma resposta pronta com esse rótulo.';
const LIMITE = 'A organização já tem 100 respostas prontas.';
const ORDEM = 'A ordem precisa ter todas as respostas prontas, uma vez cada.';
const NAO_ENCONTRADA = 'Resposta pronta não encontrada.';
const AJUSTES = {
  tipo: 'ajustes-dos-chamados.mudaram',
  permissoes: ['chamados.ver', 'chamados.atender', 'chamados.configurar'],
};

interface Pedido {
  rotulo: string;
  texto: string;
  esperaAResposta: boolean;
  opcoes?: string[];
  tipos: string[];
}

interface RespostaLida {
  id: string;
  rotulo: string;
  texto: string;
  esperaAResposta: boolean;
  opcoes: string[];
  tipos: { id: string; nome: string }[];
}

let api: ApiDeTeste;
let org = '';
let outra = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
/** Os tipos de fábrica pelo nome; o Rede e internet fica Inativo. */
const tipos: Record<string, string> = {};
let rascunho = '';
let daOutra = '';
let ana = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const id = (nome: string) => tipos[nome] ?? '';
const listar = (usuario = 'ana') => cliente.consultar('/chamados/respostas-prontas', como(usuario));
const criar = (pedido: Pedido, usuario = 'ana') =>
  cliente.enviar('POST', '/chamados/respostas-prontas', como(usuario), pedido);
const salvar = (resposta: string, pedido: Pedido, usuario = 'ana') =>
  cliente.enviar('PUT', `/chamados/respostas-prontas/${resposta}`, como(usuario), pedido);
const remover = (resposta: string, usuario = 'ana') =>
  cliente.enviar('DELETE', `/chamados/respostas-prontas/${resposta}`, como(usuario));
const ordenar = (ids: string[], usuario = 'ana') =>
  cliente.enviar('PUT', '/chamados/respostas-prontas/ordem', como(usuario), { ids });

const PRINT: Pedido = {
  rotulo: 'Pedir o print do erro',
  texto: 'Oi, {nome}! Pode mandar um print do erro?',
  esperaAResposta: true,
  tipos: [],
};
const caminho = (): Pedido => ({
  rotulo: 'Pedir o caminho da pasta',
  texto: '{nome}, qual o caminho da pasta?',
  esperaAResposta: true,
  tipos: [id('Acesso e senha')],
});
const REINICIAR: Pedido = {
  rotulo: 'Reiniciar o computador',
  texto: 'Reinicie o computador e veja se resolve.',
  esperaAResposta: false,
  tipos: [],
};

/** A resposta criada, que o teste precisa para seguir. */
async function criada(pedido: Pedido): Promise<RespostaLida> {
  const r = await criar(pedido);
  if (r.statusCode !== 201) throw new Error(`A resposta não foi criada: ${r.body}`);
  return r.json();
}

const naLista = async (): Promise<RespostaLida[]> => (await listar()).json().respostas;

/** As respostas gravadas direto no banco, numeradas a partir de 1. */
const inserir = (quantas: number, de = org) =>
  naOrganizacao(api.banco, de, async (tx) =>
    (
      await tx
        .insert(respostasProntas)
        .values(
          Array.from({ length: quantas }, (_, i) => ({
            orgId: de,
            rotulo: `Resposta ${i + 1}`,
            rotuloNormalizado: `resposta ${i + 1}`,
            texto: 'Oi, {nome}!',
            ordem: i + 1,
          })),
        )
        .returning({ id: respostasProntas.id })
    ).map(({ id: gravada }) => gravada),
  );

const gravadas = () =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [contagem] = await tx.select({ total: count() }).from(respostasProntas);
    return contagem?.total ?? 0;
  });

const linhasNaOrdem = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ rotulo: respostasProntas.rotulo, ordem: respostasProntas.ordem })
      .from(respostasProntas)
      .orderBy(asc(respostasProntas.ordem)),
  );

/** O que a requisição registrou na auditoria. */
const acoesDa = async (resposta: { headers: Record<string, unknown> }) =>
  (await auditoriaDaRequisicao(api, org, resposta)).map(
    ({ acao, alvoTipo, alvoId, atorContaId, antes, depois }) => ({
      acao,
      alvoTipo,
      alvoId,
      atorContaId,
      antes,
      depois,
    }),
  );

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, permissoes: eventos.permissoes }).from(eventos),
  );

/**
 * Outra transação pega a trava das respostas prontas e a segura até a função devolvida soltá-la:
 * as criações enviadas enquanto isso param na trava, na ordem em que chegaram.
 */
async function segurarATrava(): Promise<() => Promise<void>> {
  let soltar = () => {};
  let presa = () => {};
  const travada = new Promise<void>((resolve) => {
    presa = resolve;
  });
  const segurando = naOrganizacao(api.banco, org, async (tx) => {
    await travar(tx, 'respostas-prontas');
    presa();
    await new Promise<void>((resolve) => {
      soltar = resolve;
    });
  });
  await travada;
  return async () => {
    soltar();
    await segurando;
  };
}

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  outra = await criarOrganizacao(api, {
    nome: 'Outra',
    enderecos: ['grafite.chamados-respostas-prontas-outra.local'],
  });
  const momento = api.relogio.agora();
  for (const de of [org, outra]) {
    await naOrganizacao(api.banco, de, (tx) => criarTiposDeFabrica(tx, { ator: ATOR, momento }));
  }
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx
      .update(tiposDeChamado)
      .set({ situacao: 'inativo' })
      .where(eq(tiposDeChamado.nome, 'Rede e internet'));
    for (const tipo of await tx
      .select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome })
      .from(tiposDeChamado)) {
      tipos[tipo.nome] = tipo.id;
    }
  });
  daOutra = await naOrganizacao(
    api.banco,
    outra,
    async (tx) => (await tx.select({ id: tiposDeChamado.id }).from(tiposDeChamado))[0]?.id ?? '',
  );

  cliente = clienteDaApi(api, host);
  // Ana configura os chamados; Renato os atende, sem configurar.
  const configura = await criarPerfil(api, org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  ana = (await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' })).id;
  const renato = (await criarConta(api, org, { usuario: 'renato', nome: 'Renato Alves' })).id;
  await atribuir(api, org, { perfilId: configura, contaId: ana });
  await atribuir(api, org, { perfilId: atende, contaId: renato });
  for (const usuario of ['ana', 'renato']) entradas[usuario] = await cliente.entrar(usuario);

  // O "Novo tipo" fica no Rascunho, fora da lista dos tipos da resposta.
  const novo = await cliente.enviar('POST', '/chamados/tipos', como('ana'));
  rascunho = novo.json().id;
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  for (const de of [org, outra]) {
    await naOrganizacao(api.banco, de, async (tx) => {
      await tx.delete(respostasProntas);
      await tx.delete(eventos);
    });
  }
});

describe('o cadastro', () => {
  it('cria as respostas no fim da ordem, com os tipos pelo nome, a auditoria e o evento', async () => {
    const r = await criar(PRINT);
    expect(r.statusCode, r.body).toBe(201);
    const print: RespostaLida = r.json();
    expect(print).toEqual({
      id: expect.any(String),
      rotulo: 'Pedir o print do erro',
      texto: 'Oi, {nome}! Pode mandar um print do erro?',
      esperaAResposta: true,
      opcoes: [],
      tipos: [],
    });
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'resposta-pronta.criada',
        alvoTipo: 'resposta-pronta',
        alvoId: print.id,
        atorContaId: ana,
        antes: null,
        depois: {
          rotulo: 'Pedir o print do erro',
          texto: 'Oi, {nome}! Pode mandar um print do erro?',
          esperaAResposta: true,
          opcoes: [],
          tipos: [],
        },
      },
    ]);

    // Resposta pronta nova: "Pedir o caminho da pasta", com "Espera a resposta", só no Acesso e
    // senha. O Inativo também entra na lista dos tipos.
    const pasta = await criada(caminho());
    expect(pasta.tipos).toEqual([{ id: id('Acesso e senha'), nome: 'Acesso e senha' }]);
    const rede = await criada({ ...REINICIAR, tipos: [id('Rede e internet'), id('Computador')] });
    // Os tipos vêm na ordem dos tipos, e não na do pedido.
    expect(rede.tipos.map(({ nome }) => nome)).toEqual(['Computador', 'Rede e internet']);

    expect(await naLista()).toEqual([print, pasta, rede]);
    expect(await eventosGravados()).toEqual([AJUSTES, AJUSTES, AJUSTES]);
  });

  it('grava o rótulo numa linha, o texto sem as pontas e os tipos sem repetir', async () => {
    const r = await criar({
      rotulo: '  Pedir   o print  ',
      texto: '\n  Oi, {nome}!\n\nPode mandar?  \n',
      esperaAResposta: false,
      tipos: [id('Software'), id('Software').toUpperCase()],
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      rotulo: 'Pedir o print',
      texto: 'Oi, {nome}!\n\nPode mandar?',
      tipos: [{ id: id('Software'), nome: 'Software' }],
    });
  });

  it('altera a resposta, com o antes e o depois na auditoria', async () => {
    const print = await criada(PRINT);
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const r = await salvar(print.id, {
      ...PRINT,
      texto: 'Oi, {nome}! Manda um print da tela inteira?',
      tipos: [id('Software')],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      ...print,
      texto: 'Oi, {nome}! Manda um print da tela inteira?',
      tipos: [{ id: id('Software'), nome: 'Software' }],
    });
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'resposta-pronta.alterada',
        alvoTipo: 'resposta-pronta',
        alvoId: print.id,
        atorContaId: ana,
        antes: {
          rotulo: 'Pedir o print do erro',
          texto: 'Oi, {nome}! Pode mandar um print do erro?',
          esperaAResposta: true,
          opcoes: [],
          tipos: [],
        },
        depois: {
          rotulo: 'Pedir o print do erro',
          texto: 'Oi, {nome}! Manda um print da tela inteira?',
          esperaAResposta: true,
          opcoes: [],
          tipos: ['Software'],
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES]);
    expect(await naLista()).toEqual([r.json()]);
  });

  it('a resposta igual à gravada não grava nada', async () => {
    const pasta = await criada(caminho());
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const r = await salvar(pasta.id, { ...caminho(), rotulo: ' Pedir o caminho  da pasta ' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual(pasta);
    expect(await acoesDa(r)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('remove a resposta, com o que ela era na auditoria', async () => {
    const print = await criada(PRINT);
    const pasta = await criada(caminho());
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const r = await remover(pasta.id);
    expect(r.statusCode, r.body).toBe(204);
    expect(await naLista()).toEqual([print]);
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'resposta-pronta.removida',
        alvoTipo: 'resposta-pronta',
        alvoId: pasta.id,
        atorContaId: ana,
        antes: {
          rotulo: 'Pedir o caminho da pasta',
          texto: '{nome}, qual o caminho da pasta?',
          esperaAResposta: true,
          opcoes: [],
          tipos: ['Acesso e senha'],
        },
        depois: null,
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES]);

    const deNovo = await remover(pasta.id);
    expect(deNovo.statusCode).toBe(404);
    expect(deNovo.json().detail).toBe(NAO_ENCONTRADA);
  });
});

describe('as recusas', () => {
  it('as recusas do rótulo e do texto ficam no campo, e nada é gravado', async () => {
    const vazia = await criar({ ...PRINT, rotulo: ' ', texto: '\n' });
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json().campos).toEqual({ rotulo: 'Escreva o rótulo.', texto: 'Escreva o texto.' });
    const longa = await criar({ ...PRINT, rotulo: 'a'.repeat(61), texto: 'a'.repeat(2001) });
    expect(longa.statusCode).toBe(400);
    expect(longa.json().campos).toEqual({
      rotulo: 'Use até 60 caracteres.',
      texto: 'Use até 2.000 caracteres.',
    });

    const print = await criada(PRINT);
    const alterada = await salvar(print.id, { ...PRINT, texto: '' });
    expect(alterada.statusCode).toBe(400);
    expect(alterada.json().campos).toEqual({ texto: 'Escreva o texto.' });
    expect(await naLista()).toEqual([print]);
    expect(await eventosGravados()).toEqual([AJUSTES]);
  });

  it('o rótulo repetido, sem acento e em qualquer caixa, é recusado no rótulo', async () => {
    const print = await criada(PRINT);
    const reiniciar = await criada(REINICIAR);
    const nova = await criar({ ...REINICIAR, rotulo: 'PEDIR o print do érro' });
    expect(nova.statusCode).toBe(409);
    expect(nova.json()).toMatchObject({ detail: REPETIDO, campos: { rotulo: REPETIDO } });
    const alterada = await salvar(reiniciar.id, { ...REINICIAR, rotulo: 'Pedir o print do erro' });
    expect(alterada.statusCode).toBe(409);
    expect(alterada.json().campos).toEqual({ rotulo: REPETIDO });
    expect(await naLista()).toEqual([print, reiniciar]);
  });

  it('os tipos só entre os Em uso e os Inativos: o Rascunho e o tipo de outra organização são recusados', async () => {
    for (const tipo of [rascunho, daOutra, '0193a1b2-0000-7000-8000-00000000abcd']) {
      const r = await criar({ ...PRINT, tipos: [id('Software'), tipo] });
      expect(r.statusCode, tipo).toBe(400);
      expect(r.json().campos).toEqual({ tipos: DA_LISTA });
    }
    const print = await criada({ ...PRINT, tipos: [id('Rede e internet')] });
    const alterada = await salvar(print.id, { ...PRINT, tipos: [rascunho] });
    expect(alterada.statusCode).toBe(400);
    expect(alterada.json().campos).toEqual({ tipos: DA_LISTA });
    expect(await naLista()).toEqual([print]);
  });
});

describe('o limite de 100 respostas', () => {
  it('a centésima primeira é recusada com a frase da spec, e a remoção abre a vaga', async () => {
    const [primeira] = await inserir(100);
    const r = await criar(PRINT);
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe(LIMITE);
    expect(await gravadas()).toBe(100);

    expect((await remover(primeira ?? '')).statusCode).toBe(204);
    const vaga = await criar(PRINT);
    expect(vaga.statusCode, vaga.body).toBe(201);
    // A nova vai para o fim da ordem, depois da centésima.
    expect((await linhasNaOrdem()).at(-1)).toEqual({ rotulo: 'Pedir o print do erro', ordem: 101 });
  });

  it('duas criações ao mesmo tempo com 99: a segunda espera a primeira e é recusada', async () => {
    // As duas param na trava de outra transação. Sem a trava na criação, as duas contariam 99, e a
    // organização ficaria com 101 respostas.
    await inserir(99);
    const soltar = await segurarATrava();
    let primeira: ReturnType<typeof criar> | undefined;
    let segunda: ReturnType<typeof criar> | undefined;
    try {
      primeira = criar(PRINT);
      await esperarNaTrava(api, 1);
      segunda = criar(REINICIAR);
      await esperarNaTrava(api, 2);
    } finally {
      await soltar();
    }
    const [rPrimeira, rSegunda] = await Promise.all([primeira, segunda]);
    expect(rPrimeira?.statusCode, rPrimeira?.body).toBe(201);
    expect(rSegunda?.statusCode, rSegunda?.body).toBe(409);
    expect(rSegunda?.json().detail).toBe(LIMITE);
    expect(await gravadas()).toBe(100);
  });
});

describe('a ordem', () => {
  it('reordena com todas as respostas, com a auditoria; a mesma ordem não grava nada', async () => {
    const print = await criada(PRINT);
    const pasta = await criada(caminho());
    const reiniciar = await criada(REINICIAR);
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));

    const r = await ordenar([reiniciar.id, print.id, pasta.id]);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ respostas: [reiniciar, print, pasta] });
    expect(await naLista()).toEqual([reiniciar, print, pasta]);
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'respostas-prontas.ordenadas',
        alvoTipo: 'respostas-prontas',
        alvoId: null,
        atorContaId: ana,
        antes: {
          ordem: ['Pedir o print do erro', 'Pedir o caminho da pasta', 'Reiniciar o computador'],
        },
        depois: {
          ordem: ['Reiniciar o computador', 'Pedir o print do erro', 'Pedir o caminho da pasta'],
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES]);

    const igual = await ordenar([reiniciar.id, print.id, pasta.id]);
    expect(igual.statusCode, igual.body).toBe(200);
    expect(await acoesDa(igual)).toEqual([]);
    expect(await eventosGravados()).toEqual([AJUSTES]);
  });

  it('a ordem que espera outra gravação lê a ordem que ela deixou', async () => {
    // Outra transação troca as duas primeiras de lugar e segura as linhas até a ordem estar
    // esperando por elas. A ordem pede a sequência de antes da troca: depois da espera, ela tem de
    // ver a troca, desfazê-la e registrar na auditoria a ordem que a outra deixou.
    const print = await criada(PRINT);
    const pasta = await criada(caminho());
    const reiniciar = await criada(REINICIAR);
    let soltar = () => {};
    let presas = () => {};
    const linhasPresas = new Promise<void>((resolve) => {
      presas = resolve;
    });
    const segurando = naOrganizacao(api.banco, org, async (tx) => {
      await tx.update(respostasProntas).set({ ordem: 2 }).where(eq(respostasProntas.id, print.id));
      await tx.update(respostasProntas).set({ ordem: 1 }).where(eq(respostasProntas.id, pasta.id));
      presas();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await linhasPresas;
    const pedido = ordenar([print.id, pasta.id, reiniciar.id]);
    try {
      await esperarNaTrava(api);
    } finally {
      soltar();
      await segurando;
    }
    const r = await pedido;
    expect(r.statusCode, r.body).toBe(200);
    expect(await naLista()).toEqual([print, pasta, reiniciar]);
    expect((await acoesDa(r))[0]).toMatchObject({
      antes: {
        ordem: ['Pedir o caminho da pasta', 'Pedir o print do erro', 'Reiniciar o computador'],
      },
      depois: {
        ordem: ['Pedir o print do erro', 'Pedir o caminho da pasta', 'Reiniciar o computador'],
      },
    });
  });

  it('recusa a ordem sem uma das respostas, com uma repetida ou com uma de outra organização', async () => {
    const print = await criada(PRINT);
    const pasta = await criada(caminho());
    const [deOutra] = await inserir(1, outra);
    for (const ids of [[print.id], [print.id, print.id], [print.id, pasta.id, deOutra ?? '']]) {
      const r = await ordenar(ids);
      expect(r.statusCode).toBe(400);
      expect(r.json().campos).toEqual({ ids: ORDEM });
    }
    expect(await naLista()).toEqual([print, pasta]);
  });
});

describe('quem pode, a resposta que não existe e o módulo', () => {
  it('Conta sem chamados.configurar: as rotas respondem 403', async () => {
    const print = await criada(PRINT);
    for (const r of [
      await listar('renato'),
      await criar(REINICIAR, 'renato'),
      await salvar(print.id, { ...PRINT, texto: 'Outro texto.' }, 'renato'),
      await remover(print.id, 'renato'),
      await ordenar([print.id], 'renato'),
    ]) {
      expect(r.statusCode).toBe(403);
    }
    expect(await naLista()).toEqual([print]);
  });

  it('a resposta de outra organização responde 404, com a frase do domínio', async () => {
    const [deOutra] = await inserir(1, outra);
    for (const r of [await salvar(deOutra ?? '', PRINT), await remover(deOutra ?? '')]) {
      expect(r.statusCode).toBe(404);
      expect(r.json().detail).toBe(NAO_ENCONTRADA);
    }
  });

  it('recusa as rotas com o módulo Chamados desligado', async () => {
    const print = await criada(PRINT);
    await desligarModulos(api, org, ['chamados']);
    try {
      for (const r of [
        await listar(),
        await criar(REINICIAR),
        await salvar(print.id, PRINT),
        await remover(print.id),
        await ordenar([print.id]),
      ]) {
        expect(r.statusCode).toBe(403);
        expect(r.json()).toMatchObject({
          type: 'urn:grafite:problema:modulo-desligado',
          detail: 'O módulo Chamados está desligado nesta organização.',
        });
      }
    } finally {
      await desligarModulos(api, org, []);
    }
  });
});
