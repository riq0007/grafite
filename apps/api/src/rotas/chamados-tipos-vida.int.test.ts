// A vida do tipo de chamado pela API (spec tipos-de-chamado, "Tipo de chamado", "Prazo e
// atendimento do tipo", "O que acontece depois" e "Rascunho, duplicar e descartar"; change
// chamados-da-ti, tarefa 4.2): o "Novo tipo" e o duplicar, como Rascunho, com o número seguinte no
// nome e o nome cortado nos 40 caracteres; a gravação pela conferência do domínio, com o contexto
// lido na transação; o "Criar o tipo" e o reativar, que conferem como a gravação; o inativar, sem
// conferir; e o descartar do Rascunho. Tudo com a auditoria e o evento dos ajustes.
import { contas, eventos, horarioDaTi, naOrganizacao, tiposDeChamado } from '@grafite/db';
import { eq, notInArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarTipo, desligarModulos } from '../../test/alertas.ts';
import { pedidoDoTipo } from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  esperarNaTrava,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { criarTiposDeFabrica, linhasDosTiposDeFabrica } from '../chamados/fabrica.ts';

const host = 'grafite.chamados-tipos-vida.local';
const ATOR = { tipo: 'sistema', descricao: 'teste da vida dos tipos de chamado' } as const;
const QUEM_ATENDE = 'Escolha uma conta que atende os chamados.';
const SEM_AS_SOLICITACOES =
  "Só quem atende as solicitações em todos os locais liga o 'Gera uma Solicitação'.";
const NAO_E_RASCUNHO = 'Este tipo não é mais um rascunho.';
const AJUSTES = 'ajustes-dos-chamados.mudaram';

interface Referencia {
  id: string;
  nome: string;
}

/** O tipo como a API o devolve. */
interface TipoLido {
  id: string;
  nome: string;
  icone: string;
  frase: string | null;
  situacao: string;
  ordem: number;
  prazo: {
    modo: string;
    resposta: { valor: number; unidade: string };
    resolucao: { valor: number; unidade: string };
  };
  atendePorPadrao: Referencia | null;
  semNinguem: string;
  podeVirarOs: boolean;
  geraSolicitacao: string;
  tipoDeAtivoDoEquipamento: Referencia | null;
  pedeOAtivo: boolean;
  apareceParaOColaborador: boolean;
  soATiAbre: boolean;
  campos: number;
  duplicadoDe: string | null;
  abertos: number;
  noUltimoAno: number;
}

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
/** Os tipos de fábrica pelo nome. */
const tipos: Record<string, string> = {};
/** As contas pelo usuário. */
const contasDe: Record<string, string> = {};
let notebook = '';
let monitor = '';
let matricial = '';
let daOutra = '';
let contaDaOutra = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const listar = async (usuario = 'ana'): Promise<TipoLido[]> =>
  (await cliente.consultar('/chamados/tipos', como(usuario))).json().tipos;
async function tipoNaLista(nome: string): Promise<TipoLido> {
  const tipo = (await listar()).find((de) => de.nome === nome);
  if (!tipo) throw new Error(`O tipo ${nome} não está na lista.`);
  return tipo;
}

const novoTipo = (usuario = 'ana') => cliente.enviar('POST', '/chamados/tipos', como(usuario));
const duplicar = (id: string, usuario = 'ana') =>
  cliente.enviar('POST', `/chamados/tipos/${id}/duplicacao`, como(usuario));
const salvar = (id: string, pedido: Pedido, usuario = 'ana') =>
  cliente.enviar('PUT', `/chamados/tipos/${id}`, como(usuario), pedido);
const criarOTipo = (id: string, pedido: Pedido, usuario = 'ana') =>
  cliente.enviar('POST', `/chamados/tipos/${id}/criacao`, como(usuario), pedido);
const inativar = (id: string, usuario = 'ana') =>
  cliente.enviar('POST', `/chamados/tipos/${id}/inativacao`, como(usuario));
const reativar = (id: string, usuario = 'ana') =>
  cliente.enviar('POST', `/chamados/tipos/${id}/reativacao`, como(usuario));
const descartar = (id: string, usuario = 'ana') =>
  cliente.enviar('DELETE', `/chamados/tipos/${id}`, como(usuario));

/** O pedido da gravação a partir do tipo lido, como a tela o manda. */
const pedidoDe = (tipo: TipoLido) => pedidoDoTipo(tipo);
type Pedido = ReturnType<typeof pedidoDe>;

/**
 * O que a auditoria guarda do tipo: os nomes de quem atende e do tipo de ativo no lugar das contas
 * e dos ids, sem o formulário, que tem a ação própria, e sem as contagens.
 */
const visaoDe = ({
  id: _id,
  campos: _campos,
  duplicadoDe: _duplicadoDe,
  abertos: _abertos,
  noUltimoAno: _noUltimoAno,
  atendePorPadrao,
  tipoDeAtivoDoEquipamento,
  ...resto
}: TipoLido) => ({
  ...resto,
  atendePorPadrao: atendePorPadrao?.nome ?? null,
  tipoDeAtivoDoEquipamento: tipoDeAtivoDoEquipamento?.nome ?? null,
});

const mudarNoBanco = (id: string, valores: Partial<typeof tiposDeChamado.$inferInsert>) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.update(tiposDeChamado).set(valores).where(eq(tiposDeChamado.id, id)),
  );

const situacaoDaConta = (usuario: string, situacao: 'ativa' | 'inativa') =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .update(contas)
      .set({ situacao })
      .where(eq(contas.id, contasDe[usuario] ?? '')),
  );

const linhaDoTipo = (id: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select().from(tiposDeChamado).where(eq(tiposDeChamado.id, id));
    return linha;
  });

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
  naOrganizacao(api.banco, org, async (tx) =>
    (await tx.select({ tipo: eventos.tipo }).from(eventos)).map(({ tipo }) => tipo),
  );

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const outra = await criarOrganizacao(api, {
    nome: 'Outra',
    enderecos: ['grafite.chamados-tipos-vida-outra.local'],
  });
  const momento = api.relogio.agora();
  for (const de of [org, outra]) {
    await naOrganizacao(api.banco, de, (tx) => criarTiposDeFabrica(tx, { ator: ATOR, momento }));
  }
  for (const { id, nome } of await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome }).from(tiposDeChamado),
  )) {
    tipos[nome] = id;
  }
  daOutra = await naOrganizacao(
    api.banco,
    outra,
    async (tx) => (await tx.select({ id: tiposDeChamado.id }).from(tiposDeChamado))[0]?.id ?? '',
  );

  notebook = await criarTipo(api, org, { nome: 'Notebook' });
  monitor = await criarTipo(api, org, { nome: 'Monitor' });
  matricial = await criarTipo(api, org, { nome: 'Impressora matricial', situacao: 'inativo' });

  cliente = clienteDaApi(api, host);
  // Ana configura os chamados e atende as solicitações na organização; Bruno também configura, mas
  // atende as solicitações só em Campinas. Paula, Diego e Renato atendem os chamados, Renato só em
  // Campinas, e Fernanda não atende nada.
  const campinas = await criarLocal(api, org, { nome: 'Campinas' });
  const configura = await criarPerfil(api, org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const solicitacoes = await criarPerfil(api, org, {
    nome: 'Atende as solicitações',
    permissoes: ['solicitacoes.atender'],
  });
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  for (const [usuario, nome] of [
    ['ana', 'Ana Souza'],
    ['bruno', 'Bruno Costa'],
    ['paula', 'Paula Lima'],
    ['diego', 'Diego Martins'],
    ['renato', 'Renato Alves'],
    ['fernanda', 'Fernanda Rocha'],
  ] as const) {
    contasDe[usuario] = (await criarConta(api, org, { usuario, nome })).id;
  }
  await atribuir(api, org, { perfilId: configura, contaId: contasDe.ana });
  await atribuir(api, org, { perfilId: solicitacoes, contaId: contasDe.ana });
  await atribuir(api, org, { perfilId: configura, contaId: contasDe.bruno });
  await atribuir(api, org, {
    perfilId: solicitacoes,
    contaId: contasDe.bruno,
    localId: campinas,
  });
  await atribuir(api, org, { perfilId: atende, contaId: contasDe.paula });
  await atribuir(api, org, { perfilId: atende, contaId: contasDe.diego });
  await atribuir(api, org, { perfilId: atende, contaId: contasDe.renato, localId: campinas });
  for (const usuario of ['ana', 'bruno', 'paula'])
    entradas[usuario] = await cliente.entrar(usuario);

  // Olívia atende os chamados da outra organização.
  const atendeNaOutra = await criarPerfil(api, outra, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  contaDaOutra = (await criarConta(api, outra, { usuario: 'olivia', nome: 'Olívia Prado' })).id;
  await atribuir(api, outra, { perfilId: atendeNaOutra, contaId: contaDaOutra });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  // Cada teste começa dos 9 tipos de fábrica como a lista os cria, sem os que os outros testes
  // criaram, com Diego ativo e sem eventos.
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.update(tiposDeChamado).set({ duplicadoDe: null });
    await tx.delete(tiposDeChamado).where(notInArray(tiposDeChamado.id, Object.values(tipos)));
    for (const linha of linhasDosTiposDeFabrica()) {
      await tx
        .update(tiposDeChamado)
        .set({
          ...linha,
          formulario: { ...linha.formulario },
          atendePorPadrao: null,
          tipoDeAtivoDoEquipamento: null,
        })
        .where(eq(tiposDeChamado.id, tipos[linha.nome] ?? ''));
    }
    await tx
      .update(contas)
      .set({ situacao: 'ativa' })
      .where(eq(contas.id, contasDe.diego ?? ''));
    await tx.delete(horarioDaTi);
    await tx.delete(eventos);
  });
});

describe('o "Novo tipo"', () => {
  it('cria o Rascunho com os padrões da spec, no fim da ordem, com a auditoria e o evento', async () => {
    const r = await novoTipo();
    expect(r.statusCode, r.body).toBe(201);
    const novo: TipoLido = r.json();
    expect(novo).toEqual({
      id: expect.any(String),
      nome: 'Novo tipo',
      icone: 'reticencias',
      frase: null,
      situacao: 'rascunho',
      ordem: 10,
      prazo: {
        modo: 'horario',
        resposta: { valor: 1, unidade: 'h' },
        resolucao: { valor: 1, unidade: 'd' },
      },
      atendePorPadrao: null,
      semNinguem: 'triagem',
      podeVirarOs: false,
      geraSolicitacao: 'nao',
      tipoDeAtivoDoEquipamento: null,
      pedeOAtivo: false,
      apareceParaOColaborador: true,
      soATiAbre: false,
      campos: 0,
      duplicadoDe: null,
      abertos: 0,
      noUltimoAno: 0,
    });
    expect(await linhaDoTipo(novo.id)).toMatchObject({
      formulario: { titulo: { comecaPeloTipo: true, campoId: null }, campos: [] },
      criadoPor: contasDe.ana,
      criadoEm: api.relogio.agora(),
    });
    expect((await listar()).at(-1)).toEqual(novo);
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'tipo-de-chamado.criado',
        alvoTipo: 'tipo-de-chamado',
        alvoId: novo.id,
        atorContaId: contasDe.ana,
        antes: null,
        depois: visaoDe(novo),
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES]);
  });

  it('o segundo "Novo tipo" ganha o número seguinte', async () => {
    expect((await novoTipo()).json().nome).toBe('Novo tipo');
    const r = await novoTipo();
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ nome: 'Novo tipo 2', ordem: 11 });
  });

  it('dois "Novo tipo" ao mesmo tempo, em duas conexões, dão "Novo tipo" e "Novo tipo 2"', async () => {
    // Outra transação grava um "Novo tipo" e o segura: os dois pedidos acham o nome livre e param
    // no índice único, esperando por ela. Quando ela desiste, um dos pedidos fica com o nome, e o
    // outro bate no `tipos_de_chamado_nome_unico` e tenta o número seguinte, sem erro.
    const [linha] = linhasDosTiposDeFabrica();
    if (!linha) throw new Error('Faltam os tipos de fábrica.');
    class Desistiu extends Error {}
    let soltar = () => {};
    let preso = () => {};
    const nomePreso = new Promise<void>((resolve) => {
      preso = resolve;
    });
    const segurando = naOrganizacao(api.banco, org, async (tx) => {
      await tx.insert(tiposDeChamado).values({
        ...linha,
        orgId: org,
        nome: 'Novo tipo',
        nomeNormalizado: 'novo tipo',
        situacao: 'rascunho',
        ordem: 99,
        formulario: { ...linha.formulario },
      });
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
      throw new Desistiu();
    }).catch((erro: unknown) => {
      if (!(erro instanceof Desistiu)) throw erro;
    });
    await nomePreso;
    const pedidos = [novoTipo(), novoTipo()];
    try {
      await esperarNaTrava(api, 2);
    } finally {
      soltar();
      await segurando;
    }
    const respostas = await Promise.all(pedidos);
    expect(respostas.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(respostas.map((r) => r.json().nome).sort()).toEqual(['Novo tipo', 'Novo tipo 2']);
  });
});

describe('o duplicar', () => {
  it('copia tudo do Computador, com o formulário e quem atende, como Rascunho no fim', async () => {
    await mudarNoBanco(tipos.Computador ?? '', {
      atendePorPadrao: contasDe.renato,
      semNinguem: 'fica',
    });
    const origem = await tipoNaLista('Computador');
    const r = await duplicar(origem.id);
    expect(r.statusCode, r.body).toBe(201);
    const copia: TipoLido = r.json().tipo;
    expect(r.json().solicitacaoDesligada).toBe(false);
    expect(copia).toEqual({
      ...origem,
      id: expect.any(String),
      nome: 'Computador (cópia)',
      situacao: 'rascunho',
      ordem: 10,
      duplicadoDe: origem.id,
    });
    const daCopia = await linhaDoTipo(copia.id);
    expect(daCopia?.formulario).toEqual((await linhaDoTipo(origem.id))?.formulario);
    expect(daCopia?.criadoPor).toBe(contasDe.ana);
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'tipo-de-chamado.criado',
        alvoTipo: 'tipo-de-chamado',
        alvoId: copia.id,
        atorContaId: contasDe.ana,
        antes: null,
        depois: { ...visaoDe(copia), duplicadoDe: 'Computador' },
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES]);
  });

  it('duplicar de novo dá "(cópia 2)", e a solicitação segue para quem atende em todos os locais', async () => {
    expect((await duplicar(tipos.Toner ?? '')).json().tipo.nome).toBe('Toner (cópia)');
    const r = await duplicar(tipos.Toner ?? '');
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toEqual({
      tipo: expect.objectContaining({
        nome: 'Toner (cópia 2)',
        geraSolicitacao: 'toner',
        pedeOAtivo: true,
      }),
      solicitacaoDesligada: false,
    });
  });

  it('corta o nome da origem para a cópia caber nos 40 caracteres', async () => {
    await mudarNoBanco(tipos.Impressora ?? '', {
      nome: 'Impressora multifuncional da recepção',
      nomeNormalizado: 'impressora multifuncional da recepcao',
    });
    const r = await duplicar(tipos.Impressora ?? '');
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().tipo.nome).toBe('Impressora multifuncional da rec (cópia)');
  });

  it('Bruno, que atende as solicitações só em Campinas, duplica o Toner sem a solicitação', async () => {
    const r = await duplicar(tipos.Toner ?? '', 'bruno');
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toEqual({
      tipo: expect.objectContaining({
        nome: 'Toner (cópia)',
        geraSolicitacao: 'nao',
        tipoDeAtivoDoEquipamento: null,
        pedeOAtivo: true,
        duplicadoDe: tipos.Toner,
      }),
      solicitacaoDesligada: true,
    });
  });

  it('Bruno duplica um tipo de Equipamento: a cópia nasce com o "não" e sem o tipo de ativo', async () => {
    const troca = tipos['Troca de equipamento'] ?? '';
    await mudarNoBanco(troca, {
      geraSolicitacao: 'equipamento',
      tipoDeAtivoDoEquipamento: notebook,
    });
    const doBruno = await duplicar(troca, 'bruno');
    expect(doBruno.statusCode, doBruno.body).toBe(201);
    expect(doBruno.json()).toEqual({
      tipo: expect.objectContaining({
        nome: 'Troca de equipamento (cópia)',
        geraSolicitacao: 'nao',
        tipoDeAtivoDoEquipamento: null,
      }),
      solicitacaoDesligada: true,
    });
    // A de Ana, que atende as solicitações na organização, segue com o Notebook.
    const daAna = await duplicar(troca);
    expect(daAna.json()).toEqual({
      tipo: expect.objectContaining({
        nome: 'Troca de equipamento (cópia 2)',
        geraSolicitacao: 'equipamento',
        tipoDeAtivoDoEquipamento: { id: notebook, nome: 'Notebook' },
      }),
      solicitacaoDesligada: false,
    });
  });

  it('o duplicar que espera o descartar da origem responde 404', async () => {
    // Outra transação descarta um Rascunho e segura a linha apagada até o duplicar estar esperando
    // por ela. Depois do descarte, o duplicar não acha mais a origem, e a cópia não chega a nascer.
    const rascunho: TipoLido = (await novoTipo()).json();
    let soltar = () => {};
    let presa = () => {};
    const linhaPresa = new Promise<void>((resolve) => {
      presa = resolve;
    });
    const descartando = naOrganizacao(api.banco, org, async (tx) => {
      await tx.delete(tiposDeChamado).where(eq(tiposDeChamado.id, rascunho.id));
      presa();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await linhaPresa;
    const pedido = duplicar(rascunho.id);
    try {
      await esperarNaTrava(api);
    } finally {
      soltar();
      await descartando;
    }
    const r = await pedido;
    expect(r.statusCode, r.body).toBe(404);
    expect(r.json().detail).toBe('Tipo de chamado não encontrado.');
    expect((await listar()).map(({ nome }) => nome)).not.toContain('Novo tipo (cópia)');
  });
});

describe('a gravação', () => {
  it('grava o tipo numa linha, com a auditoria do antes e do depois e o evento', async () => {
    const antes = await tipoNaLista('Impressora');
    // Renato atende os chamados só em Campinas, e isso basta para atender um tipo por padrão.
    const r = await salvar(antes.id, {
      ...pedidoDe(antes),
      nome: '  Impressora   e copiadora ',
      frase: 'Mancha, atola  ou não imprime ',
      atendePorPadrao: contasDe.renato ?? '',
      semNinguem: 'fica',
    });
    expect(r.statusCode, r.body).toBe(200);
    const depois: TipoLido = r.json();
    expect(depois).toEqual({
      ...antes,
      nome: 'Impressora e copiadora',
      frase: 'Mancha, atola ou não imprime',
      atendePorPadrao: { id: contasDe.renato, nome: 'Renato Alves' },
      semNinguem: 'fica',
    });
    expect(await linhaDoTipo(antes.id)).toMatchObject({
      nomeNormalizado: 'impressora e copiadora',
    });
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'tipo-de-chamado.alterado',
        alvoTipo: 'tipo-de-chamado',
        alvoId: antes.id,
        atorContaId: contasDe.ana,
        antes: visaoDe(antes),
        depois: visaoDe(depois),
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES]);
  });

  it('o "Salvar" do Rascunho aceita a frase vazia e o deixa Rascunho', async () => {
    const novo: TipoLido = (await novoTipo()).json();
    const r = await salvar(novo.id, {
      ...pedidoDe(novo),
      nome: 'Impressora da recepção',
      frase: null,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      nome: 'Impressora da recepção',
      frase: null,
      situacao: 'rascunho',
    });
  });

  it('a mesma gravação não grava nada', async () => {
    const antes = await tipoNaLista('Impressora');
    const r = await salvar(antes.id, pedidoDe(antes));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual(antes);
    expect(await acoesDa(r)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('recusa por campo, com as frases da spec, sem gravar nada', async () => {
    const antes = await tipoNaLista('Acesso e senha');
    const r = await salvar(antes.id, {
      ...pedidoDe(antes),
      nome: '   ',
      icone: 'foguete',
      frase: '',
      prazo: {
        modo: 'horario',
        resposta: { valor: 10, unidade: 'h' },
        resolucao: { valor: 8, unidade: 'h' },
      },
      // Fernanda não atende os chamados; a matricial está inativa; e o formulário do Acesso e
      // senha não tem o campo Ativo.
      atendePorPadrao: contasDe.fernanda ?? '',
      geraSolicitacao: 'equipamento',
      tipoDeAtivoDoEquipamento: matricial,
      pedeOAtivo: true,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      nome: 'Escreva o nome.',
      icone: 'Escolha o ícone.',
      frase: 'Escreva a frase.',
      resposta: 'A resposta passa da resolução. Use uma resposta menor.',
      atendePorPadrao: QUEM_ATENDE,
      tipoDeAtivoDoEquipamento: 'Escolha o tipo de ativo do equipamento.',
      pedeOAtivo: 'Pede o ativo: inclua no formulário um campo Ativo obrigatório.',
    });
    expect(await tipoNaLista('Acesso e senha')).toEqual(antes);
    expect(await acoesDa(r)).toEqual([]);
  });

  it('recusa a conta de outra organização em quem atende por padrão', async () => {
    const antes = await tipoNaLista('Impressora');
    const r = await salvar(antes.id, { ...pedidoDe(antes), atendePorPadrao: contaDaOutra });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ atendePorPadrao: QUEM_ATENDE });
  });

  it('o nome repetido é recusado no nome, sem diferenciar acento e maiúsculas', async () => {
    const antes = await tipoNaLista('Impressora');
    const r = await salvar(antes.id, { ...pedidoDe(antes), nome: 'TONÉR' });
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({ nome: 'Já existe um tipo com esse nome.' });
    expect(await tipoNaLista('Impressora')).toEqual(antes);
  });

  it('compara a resposta e a resolução pelo dia útil do horário da TI da organização', async () => {
    // Das 08:00 às 12:00, o dia útil tem 4 h, e 5 h passam de 1 dia útil.
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(horarioDaTi).values({
        orgId: org,
        dias: [1, 2, 3, 4, 5],
        inicio: 8 * 60,
        fim: 12 * 60,
        fuso: 'America/Sao_Paulo',
        cargaCheia: 5,
      }),
    );
    const antes = await tipoNaLista('Outro');
    const pedido = {
      ...pedidoDe(antes),
      prazo: {
        modo: 'horario',
        resposta: { valor: 5, unidade: 'h' },
        resolucao: { valor: 1, unidade: 'd' },
      },
    };
    const r = await salvar(antes.id, pedido);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      resposta: 'A resposta passa da resolução. Use uma resposta menor.',
    });
    // Sem a linha, vale o padrão, das 08:00 às 18:00, e as 5 h cabem no dia útil de 10 h.
    await naOrganizacao(api.banco, org, (tx) => tx.delete(horarioDaTi));
    const semALinha = await salvar(antes.id, pedido);
    expect(semALinha.statusCode, semALinha.body).toBe(200);
  });

  it('a conta de quem atende por padrão desativada é recusada na gravação seguinte', async () => {
    await mudarNoBanco(tipos.Impressora ?? '', { atendePorPadrao: contasDe.diego });
    await situacaoDaConta('diego', 'inativa');
    const antes = await tipoNaLista('Impressora');
    const r = await salvar(antes.id, { ...pedidoDe(antes), frase: 'Mancha ou atola' });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ atendePorPadrao: QUEM_ATENDE });
  });
});

describe('o "Gera uma Solicitação" de quem atende as solicitações só em Campinas', () => {
  it('Bruno não liga a solicitação de Equipamento nem troca o tipo de ativo dela', async () => {
    const computador = await tipoNaLista('Computador');
    const ligar = await salvar(
      computador.id,
      {
        ...pedidoDe(computador),
        geraSolicitacao: 'equipamento',
        tipoDeAtivoDoEquipamento: notebook,
      },
      'bruno',
    );
    expect(ligar.statusCode).toBe(400);
    expect(ligar.json().campos).toEqual({ geraSolicitacao: SEM_AS_SOLICITACOES });

    const troca = tipos['Troca de equipamento'] ?? '';
    await mudarNoBanco(troca, {
      geraSolicitacao: 'equipamento',
      tipoDeAtivoDoEquipamento: notebook,
    });
    const daTroca = await tipoNaLista('Troca de equipamento');
    const trocar = await salvar(
      troca,
      { ...pedidoDe(daTroca), tipoDeAtivoDoEquipamento: monitor },
      'bruno',
    );
    expect(trocar.statusCode).toBe(400);
    expect(trocar.json().campos).toEqual({ geraSolicitacao: SEM_AS_SOLICITACOES });
    expect(await tipoNaLista('Troca de equipamento')).toEqual(daTroca);
  });

  it('Bruno muda a frase do Toner, que já gera, e desliga a solicitação dele', async () => {
    const toner = await tipoNaLista('Toner');
    const frase = await salvar(
      toner.id,
      { ...pedidoDe(toner), frase: 'Sem toner ou a cópia saiu fraca' },
      'bruno',
    );
    expect(frase.statusCode, frase.body).toBe(200);
    expect(frase.json()).toMatchObject({
      frase: 'Sem toner ou a cópia saiu fraca',
      geraSolicitacao: 'toner',
    });
    const desligar = await salvar(
      toner.id,
      { ...pedidoDe(frase.json()), geraSolicitacao: 'nao' },
      'bruno',
    );
    expect(desligar.statusCode, desligar.body).toBe(200);
    expect(desligar.json()).toMatchObject({ geraSolicitacao: 'nao' });
  });
});

describe('o "Criar o tipo"', () => {
  it('o Equipamento novo, duplicado do Computador, entra em uso com o formulário copiado', async () => {
    const emUso = async () =>
      (await listar()).filter(({ situacao }) => situacao !== 'rascunho').length;
    const copia: TipoLido = (await duplicar(tipos.Computador ?? '')).json().tipo;
    expect(await emUso()).toBe(9);
    const r = await criarOTipo(copia.id, { ...pedidoDe(copia), nome: 'Equipamento novo' });
    expect(r.statusCode, r.body).toBe(200);
    const criado: TipoLido = r.json();
    expect(criado).toEqual({ ...copia, nome: 'Equipamento novo', situacao: 'em-uso' });
    expect((await linhaDoTipo(copia.id))?.formulario).toEqual(
      (await linhaDoTipo(tipos.Computador ?? ''))?.formulario,
    );
    expect(await emUso()).toBe(10);
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'tipo-de-chamado.alterado',
        alvoTipo: 'tipo-de-chamado',
        alvoId: copia.id,
        atorContaId: contasDe.ana,
        antes: visaoDe(copia),
        depois: visaoDe(criado),
      },
    ]);
  });

  it('pede a frase, que o Rascunho deixa vazia', async () => {
    const novo: TipoLido = (await novoTipo()).json();
    const r = await criarOTipo(novo.id, pedidoDe(novo));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ frase: 'Escreva a frase.' });
    expect((await tipoNaLista('Novo tipo')).situacao).toBe('rascunho');
  });

  it('Bruno cria o tipo do Rascunho que Ana duplicou do Toner, com a solicitação que ele já gerava', async () => {
    // Ana, que atende as solicitações na organização, duplicou o Toner com a solicitação ligada. O
    // "Criar o tipo" de Bruno, que as atende só em Campinas, não a liga: o Rascunho já era assim.
    const copia: TipoLido = (await duplicar(tipos.Toner ?? '')).json().tipo;
    expect(copia.geraSolicitacao).toBe('toner');
    const r = await criarOTipo(copia.id, pedidoDe(copia), 'bruno');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ situacao: 'em-uso', geraSolicitacao: 'toner' });
  });

  it('o tipo que já saiu do Rascunho não se cria de novo', async () => {
    const impressora = await tipoNaLista('Impressora');
    const r = await criarOTipo(impressora.id, pedidoDe(impressora));
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe(NAO_E_RASCUNHO);
  });
});

describe('o inativar e o reativar', () => {
  it('inativa sem conferir e só reativa com quem atende ativo, com a auditoria', async () => {
    const telefone = tipos.Telefone ?? '';
    await mudarNoBanco(telefone, { atendePorPadrao: contasDe.diego });
    const emUso = await tipoNaLista('Telefone');
    await situacaoDaConta('diego', 'inativa');

    const inativado = await inativar(telefone);
    expect(inativado.statusCode, inativado.body).toBe(200);
    const inativo: TipoLido = inativado.json();
    expect(inativo).toEqual({ ...emUso, situacao: 'inativo' });
    expect(await acoesDa(inativado)).toEqual([
      {
        acao: 'tipo-de-chamado.inativado',
        alvoTipo: 'tipo-de-chamado',
        alvoId: telefone,
        atorContaId: contasDe.ana,
        antes: visaoDe(emUso),
        depois: visaoDe(inativo),
      },
    ]);

    const recusado = await reativar(telefone);
    expect(recusado.statusCode).toBe(400);
    expect(recusado.json().campos).toEqual({ atendePorPadrao: QUEM_ATENDE });
    expect((await tipoNaLista('Telefone')).situacao).toBe('inativo');
    expect(await acoesDa(recusado)).toEqual([]);

    await situacaoDaConta('diego', 'ativa');
    const reativado = await reativar(telefone);
    expect(reativado.statusCode, reativado.body).toBe(200);
    expect(reativado.json()).toEqual(emUso);
    expect(await acoesDa(reativado)).toEqual([
      {
        acao: 'tipo-de-chamado.reativado',
        alvoTipo: 'tipo-de-chamado',
        alvoId: telefone,
        atorContaId: contasDe.ana,
        antes: visaoDe(inativo),
        depois: visaoDe(emUso),
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES, AJUSTES]);
  });

  it('inativar o inativo e reativar o Em uso não gravam nada', async () => {
    const impressora = tipos.Impressora ?? '';
    const emUso = await reativar(impressora);
    expect(emUso.statusCode, emUso.body).toBe(200);
    expect(emUso.json().situacao).toBe('em-uso');
    expect(await acoesDa(emUso)).toEqual([]);
    expect((await inativar(impressora)).statusCode).toBe(200);
    const deNovo = await inativar(impressora);
    expect(deNovo.statusCode, deNovo.body).toBe(200);
    expect(deNovo.json().situacao).toBe('inativo');
    expect(await acoesDa(deNovo)).toEqual([]);
  });

  it('Bruno reativa o Toner inativo, que já gerava a solicitação', async () => {
    const toner = tipos.Toner ?? '';
    expect((await inativar(toner, 'bruno')).statusCode).toBe(200);
    const r = await reativar(toner, 'bruno');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ situacao: 'em-uso', geraSolicitacao: 'toner' });
  });

  it('o Rascunho não se inativa nem se reativa', async () => {
    const novo: TipoLido = (await novoTipo()).json();
    for (const r of [await inativar(novo.id), await reativar(novo.id)]) {
      expect(r.statusCode).toBe(409);
      expect(r.json().detail).toBe("O rascunho entra em uso pelo 'Criar o tipo'.");
    }
    expect((await tipoNaLista('Novo tipo')).situacao).toBe('rascunho');
  });
});

describe('o descartar', () => {
  it('apaga o Rascunho, com a auditoria do que ele era', async () => {
    const novo: TipoLido = (await novoTipo()).json();
    const r = await descartar(novo.id);
    expect(r.statusCode, r.body).toBe(204);
    expect((await listar()).map(({ id }) => id)).not.toContain(novo.id);
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'tipo-de-chamado.descartado',
        alvoTipo: 'tipo-de-chamado',
        alvoId: novo.id,
        atorContaId: contasDe.ana,
        antes: visaoDe(novo),
        depois: null,
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES, AJUSTES]);
  });

  it('o tipo Em uso não se descarta', async () => {
    const r = await descartar(tipos.Impressora ?? '');
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe(NAO_E_RASCUNHO);
  });

  it('descartar a origem de outra cópia solta a marca da cópia', async () => {
    const primeira: TipoLido = (await duplicar(tipos.Toner ?? '')).json().tipo;
    const segunda: TipoLido = (await duplicar(primeira.id)).json().tipo;
    expect(segunda.duplicadoDe).toBe(primeira.id);
    expect((await descartar(primeira.id)).statusCode).toBe(204);
    expect((await tipoNaLista(segunda.nome)).duplicadoDe).toBeNull();
  });
});

describe('quem pode, o tipo que não existe e o módulo', () => {
  it('Conta sem chamados.configurar: as rotas da vida do tipo respondem 403', async () => {
    const impressora = await tipoNaLista('Impressora');
    const pedido = pedidoDe(impressora);
    for (const r of [
      await novoTipo('paula'),
      await duplicar(impressora.id, 'paula'),
      await salvar(impressora.id, pedido, 'paula'),
      await criarOTipo(impressora.id, pedido, 'paula'),
      await inativar(impressora.id, 'paula'),
      await reativar(impressora.id, 'paula'),
      await descartar(impressora.id, 'paula'),
    ]) {
      expect(r.statusCode).toBe(403);
    }
    expect(await tipoNaLista('Impressora')).toEqual(impressora);
  });

  it('o tipo de outra organização responde 404, com a frase do domínio', async () => {
    const pedido = pedidoDe(await tipoNaLista('Impressora'));
    for (const r of [
      await duplicar(daOutra),
      await salvar(daOutra, pedido),
      await criarOTipo(daOutra, pedido),
      await inativar(daOutra),
      await reativar(daOutra),
      await descartar(daOutra),
    ]) {
      expect(r.statusCode).toBe(404);
      expect(r.json().detail).toBe('Tipo de chamado não encontrado.');
    }
  });

  it('recusa as rotas com o módulo Chamados desligado', async () => {
    const impressora = await tipoNaLista('Impressora');
    const pedido = pedidoDe(impressora);
    await desligarModulos(api, org, ['chamados']);
    try {
      for (const r of [
        await novoTipo(),
        await duplicar(impressora.id),
        await salvar(impressora.id, pedido),
        await criarOTipo(impressora.id, pedido),
        await inativar(impressora.id),
        await reativar(impressora.id),
        await descartar(impressora.id),
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
