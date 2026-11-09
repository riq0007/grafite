// As pessoas pela API (spec administracao-de-pessoas): a lista em ordem alfabética, paginada pelo
// cursor, com a busca sem acento e os filtros, só com as pessoas que a conta pode ver.
import {
  atribuicoes,
  auditoria,
  codigosDeRecuperacao,
  contas,
  doisPassos,
  membrosDoGrupo,
  naOrganizacao,
  pessoas,
  sessoes,
  tentativasDeEntrada,
} from '@grafite/db';
import { textoDeBusca } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarGrupo,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
  incluirNoGrupo,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.pessoas.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const ids: Record<string, string> = {};
const entradas: Record<string, Entrada> = {};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: ids.jundiai });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });

  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const leitor = await criarPerfil(api, org, { nome: 'Leitor', permissoes: ['pessoas.ver'] });

  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administrador, contaId: ana.id });
  const bruno = await criarConta(api, org, {
    usuario: 'bruno',
    nome: 'Bruno Costa',
    localId: ids.jundiai,
  });
  await atribuir(api, org, { perfilId: leitor, contaId: bruno.id, localId: ids.jundiai });
  await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha', localId: ids.campinas });

  const joao = await criarConta(api, org, {
    usuario: 'jsilva',
    nome: 'João da Silva',
    matricula: '004512',
    email: 'joao.silva@empresa.com',
    localId: ids.expedicao,
  });
  ids.joao = joao.pessoaId;
  ids.contaDoJoao = joao.id;
  ids.carla = await criarPessoa(api, org, { nome: 'Carla Dias', localId: ids.campinas });
  ids.erica = await criarPessoa(api, org, {
    nome: 'Érica Lima',
    localId: ids.jundiai,
    situacao: 'inativa',
  });
  ids.fabio = await criarPessoa(api, org, { nome: 'Fábio Mendes' });
  const gustavo = await criarConta(api, org, {
    usuario: 'gustavo',
    nome: 'Gustavo Alves',
    localId: ids.expedicao,
  });
  ids.gustavo = gustavo.pessoaId;
  await naOrganizacao(api.banco, org, (tx) =>
    tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, gustavo.id)),
  );

  // 120 pessoas do lote, com um nome repetido, para a paginação.
  await naOrganizacao(api.banco, org, async (tx) => {
    const nomes = Array.from({ length: 120 }, (_, i) => `Lote ${String(i + 1).padStart(3, '0')}`);
    nomes.push('Lote 050');
    await tx.insert(pessoas).values(
      nomes.map((nome) => ({
        orgId: org,
        nome,
        busca: textoDeBusca({ nome, email: null, matricula: null }),
      })),
    );
  });

  for (const usuario of ['ana', 'bruno', 'davi']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

interface ItemDaLista {
  id: string;
  nome: string;
  situacao: string;
  local: { id: string; caminho: string; situacao: string } | null;
  conta: { id: string; usuario: string | null; situacao: string } | null;
}

async function listar(usuario: string, filtros: Record<string, string> = {}) {
  const r = await cliente.consultar(`/pessoas?${new URLSearchParams(filtros)}`, como(usuario));
  expect(r.statusCode).toBe(200);
  return r.json() as { itens: ItemDaLista[]; proximo: string | null; total: number };
}

const nomes = (lista: { itens: ItemDaLista[] }) => lista.itens.map((item) => item.nome);

describe('GET /pessoas', () => {
  it('lista em ordem alfabética, paginada pelo cursor, sem pular nem repetir ninguém', async () => {
    const vistas: ItemDaLista[] = [];
    const tamanhos: number[] = [];
    let cursor: string | null = null;
    do {
      const filtros: Record<string, string> = { busca: 'lote', ...(cursor ? { cursor } : {}) };
      const pagina = await listar('ana', filtros);
      expect(pagina.total).toBe(121);
      tamanhos.push(pagina.itens.length);
      vistas.push(...pagina.itens);
      cursor = pagina.proximo;
    } while (cursor);
    expect(tamanhos).toEqual([50, 50, 21]);
    expect(new Set(vistas.map((item) => item.id)).size).toBe(121);
    const ordem = vistas.map((item) => item.nome);
    expect(ordem).toEqual([...ordem].sort());
    expect(ordem.filter((nome) => nome === 'Lote 050')).toHaveLength(2);
  });

  it('traz na última página o resto, com o cursor da próxima nulo', async () => {
    const primeira = await listar('ana', { busca: 'lote', limite: '100' });
    expect(primeira.itens).toHaveLength(100);
    const ultima = await listar('ana', {
      busca: 'lote',
      limite: '100',
      cursor: primeira.proximo ?? '',
    });
    expect(ultima.itens).toHaveLength(21);
    expect(ultima.proximo).toBeNull();
  });

  it('recusa mais de 100 por página e o cursor ilegível', async () => {
    const grande = await cliente.consultar('/pessoas?limite=500', como('ana'));
    expect(grande.statusCode).toBe(400);
    expect(grande.json()).toMatchObject({
      type: 'urn:grafite:problema:dados-invalidos',
      campos: { limite: 'Use até 100 itens por página.' },
    });
    const ilegivel = await cliente.consultar('/pessoas?cursor=nada', como('ana'));
    expect(ilegivel.statusCode).toBe(400);
    expect(ilegivel.json().campos).toEqual({ cursor: 'A lista mudou. Recarregue a lista.' });
  });

  it('busca sem acento, com as palavras em qualquer ordem, no nome, na matrícula, no e-mail e no usuário', async () => {
    for (const busca of ['silva joao', 'JOÃO SÍLVA', '004512', 'joao.silva@empresa', 'jsilva']) {
      expect(nomes(await listar('ana', { busca }))).toEqual(['João da Silva']);
    }
    expect(nomes(await listar('ana', { busca: 'silva carla' }))).toEqual([]);
  });

  it('filtra pela situação: ativas por padrão, inativas ou todas', async () => {
    expect(nomes(await listar('ana', { busca: 'erica' }))).toEqual([]);
    expect(nomes(await listar('ana', { busca: 'erica', situacao: 'inativas' }))).toEqual([
      'Érica Lima',
    ]);
    const todas = await listar('ana', { situacao: 'todas', limite: '100' });
    expect(nomes(todas)).toContain('Érica Lima');
    expect(nomes(todas)).toContain('Ana Souza');
    expect(nomes(await listar('ana', { situacao: 'inativas' }))).toEqual(['Érica Lima']);
  });

  it('filtra por conta', async () => {
    const semLote = (lista: { itens: ItemDaLista[] }) =>
      nomes(lista).filter((nome) => !nome.startsWith('Lote'));
    expect(semLote(await listar('ana', { conta: 'com' }))).toEqual([
      'Ana Souza',
      'Bruno Costa',
      'Davi Rocha',
      'Gustavo Alves',
      'João da Silva',
    ]);
    expect(semLote(await listar('ana', { conta: 'sem', limite: '100' }))).toEqual([
      'Carla Dias',
      'Fábio Mendes',
    ]);
  });

  it('filtra pelo local, com tudo o que está dentro dele', async () => {
    const lista = await listar('ana', { local: ids.jundiai ?? '' });
    expect(nomes(lista)).toEqual(['Bruno Costa', 'Gustavo Alves', 'João da Silva']);
    expect(lista.total).toBe(3);
  });

  it('mostra só as pessoas do ramo de quem vê num local, sem as pessoas sem local', async () => {
    const lista = await listar('bruno', { situacao: 'todas' });
    expect(nomes(lista)).toEqual(['Bruno Costa', 'Érica Lima', 'Gustavo Alves', 'João da Silva']);
    expect(lista.total).toBe(4);
    expect(nomes(await listar('bruno', { local: ids.campinas ?? '' }))).toEqual([]);
  });

  it('traz o local de trabalho com o caminho e o resumo da conta em cada linha', async () => {
    const [joao] = (await listar('ana', { busca: 'joao' })).itens;
    expect(joao).toMatchObject({
      id: ids.joao,
      nome: 'João da Silva',
      matricula: '004512',
      email: 'joao.silva@empresa.com',
      situacao: 'ativa',
      local: { id: ids.expedicao, caminho: 'Jundiaí › Expedição', situacao: 'ativo' },
      conta: { id: ids.contaDoJoao, usuario: 'jsilva', situacao: 'ativa' },
    });
    const [carla] = (await listar('ana', { busca: 'carla' })).itens;
    expect(carla).toMatchObject({ conta: null });
    const [gustavo] = (await listar('ana', { busca: 'gustavo' })).itens;
    expect(gustavo?.conta).toMatchObject({ usuario: 'gustavo', situacao: 'inativa' });
    const [fabio] = (await listar('ana', { busca: 'fabio' })).itens;
    expect(fabio?.local).toBeNull();
  });

  it('exige pessoas.ver', async () => {
    const r = await cliente.consultar('/pessoas', como('davi'));
    expect(r.statusCode).toBe(403);
    expect(r.json().permissao).toBe('pessoas.ver');
  });
});

describe('cadastro, leitura e edição da pessoa', () => {
  beforeAll(async () => {
    const editor = await criarPerfil(api, org, {
      nome: 'Editor de pessoas',
      permissoes: ['pessoas.editar'],
    });
    const elisa = await criarConta(api, org, {
      usuario: 'elisa',
      nome: 'Elisa Prado',
      localId: ids.jundiai,
    });
    await atribuir(api, org, { perfilId: editor, contaId: elisa.id, localId: ids.jundiai });
    entradas.elisa = await cliente.entrar('elisa');
    ids.doca = await criarLocal(api, org, {
      nome: 'Doca 3',
      paiId: ids.expedicao,
      situacao: 'inativo',
    });
  });

  const cadastrar = (usuario: string, pedido: object) =>
    cliente.enviar('POST', '/pessoas', como(usuario), pedido);
  const ler = (usuario: string, id: string) => cliente.consultar(`/pessoas/${id}`, como(usuario));
  const editar = (usuario: string, id: string, pedido: object) =>
    cliente.enviar('PATCH', `/pessoas/${id}`, como(usuario), pedido);

  it('cadastra a pessoa, ativa e sem conta, no local do escopo de quem cadastra', async () => {
    const r = await cadastrar('elisa', {
      nome: '  João   Pereira ',
      matricula: '0099',
      email: ' joao.pereira@empresa.com ',
      telefone: '(11) 4521-0000',
      localId: ids.expedicao,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({
      id: expect.any(String),
      nome: 'João Pereira',
      email: 'joao.pereira@empresa.com',
      matricula: '0099',
      telefone: '(11) 4521-0000',
      situacao: 'ativa',
      local: { id: ids.expedicao, caminho: 'Jundiaí › Expedição', situacao: 'ativo' },
      foto: null,
      conta: null,
      permite: {
        editar: true,
        inativar: true,
        reativar: false,
        anonimizar: false,
        criarConta: false,
        administrarConta: false,
      },
    });
    expect(nomes(await listar('ana', { busca: '0099' }))).toEqual(['João Pereira']);
  });

  it('recusa o cadastro fora do escopo e sem local para quem edita só num ramo', async () => {
    const fora = await cadastrar('elisa', { nome: 'Fora', localId: ids.campinas });
    expect(fora.statusCode).toBe(403);
    const semLocal = await cadastrar('elisa', { nome: 'Sem local' });
    expect(semLocal.statusCode).toBe(403);
    expect((await cadastrar('ana', { nome: 'Sem local' })).statusCode).toBe(201);
  });

  it('recusa a matrícula repetida no campo da matrícula', async () => {
    const r = await cadastrar('ana', { nome: 'Outra pessoa', matricula: '004512' });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:conflito',
      detail: 'Esta matrícula já é de outra pessoa.',
      campos: { matricula: 'Esta matrícula já é de outra pessoa.' },
    });
  });

  it('recusa os campos pelas regras da pessoa', async () => {
    const r = await cadastrar('ana', { nome: ' ', email: 'joao', telefone: 'ramal 20' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:dados-invalidos',
      campos: {
        nome: 'Informe o nome.',
        email: 'Informe um e-mail válido, como nome@empresa.com.br.',
        telefone: 'Use só números, espaços, parênteses, + e hífen.',
      },
    });
  });

  it('recusa o local inativo e o que não existe', async () => {
    const inativo = await cadastrar('ana', { nome: 'Na doca', localId: ids.doca });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({
      localId: 'O local escolhido está inativo. Escolha um local ativo.',
    });
    const inexistente = await cadastrar('ana', {
      nome: 'Em lugar nenhum',
      localId: '0199a000-0000-7000-8000-000000000000',
    });
    expect(inexistente.statusCode).toBe(404);
  });

  it('lê a pessoa do escopo e recusa a de fora do ramo', async () => {
    const joao = await ler('bruno', ids.joao ?? '');
    expect(joao.statusCode).toBe(200);
    expect(joao.json()).toMatchObject({
      nome: 'João da Silva',
      conta: { usuario: 'jsilva', situacao: 'ativa' },
      permite: { editar: false, inativar: false, administrarConta: false },
    });
    const carla = await ler('bruno', ids.carla ?? '');
    expect(carla.statusCode).toBe(403);
    expect(carla.json().permissao).toBe('pessoas.ver');
    expect((await ler('bruno', ids.fabio ?? '')).statusCode).toBe(403);
    expect((await ler('ana', '0199a000-0000-7000-8000-000000000000')).statusCode).toBe(404);
  });

  it('diz o que a conta pode fazer com cada pessoa', async () => {
    expect((await ler('ana', ids.carla ?? '')).json().permite).toEqual({
      editar: true,
      inativar: true,
      reativar: false,
      anonimizar: false,
      criarConta: true,
      administrarConta: false,
    });
    expect((await ler('ana', ids.joao ?? '')).json().permite).toMatchObject({
      criarConta: false,
      administrarConta: true,
    });
    expect((await ler('ana', ids.erica ?? '')).json().permite).toMatchObject({
      inativar: false,
      reativar: true,
      anonimizar: true,
    });
    const [ana] = (await listar('ana', { busca: 'ana souza' })).itens;
    expect((await ler('ana', ana?.id ?? '')).json().permite).toMatchObject({
      editar: true,
      inativar: false,
      administrarConta: false,
    });
  });

  it('edita a pessoa do escopo, com o antes → depois na auditoria', async () => {
    const r = await editar('elisa', ids.joao ?? '', { email: 'joao@empresa.com' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ nome: 'João da Silva', email: 'joao@empresa.com' });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'pessoa.alterada',
        alvoTipo: 'pessoa',
        alvoId: ids.joao,
        antes: { email: 'joao.silva@empresa.com', local: 'Jundiaí › Expedição' },
        depois: { email: 'joao@empresa.com', local: 'Jundiaí › Expedição' },
      },
    ]);
    expect(nomes(await listar('ana', { busca: 'joao@empresa' }))).toEqual(['João da Silva']);
  });

  it('recusa a edição da pessoa de fora do ramo, sem mudar nada', async () => {
    const r = await editar('elisa', ids.carla ?? '', { nome: 'Carla Souza' });
    expect(r.statusCode).toBe(403);
    expect((await ler('ana', ids.carla ?? '')).json().nome).toBe('Carla Dias');
  });

  it('exige a permissão no local antigo e no novo para mudar o local', async () => {
    const paraFora = await editar('elisa', ids.joao ?? '', { localId: ids.campinas });
    expect(paraFora.statusCode).toBe(403);
    expect((await ler('ana', ids.joao ?? '')).json().local.id).toBe(ids.expedicao);
    const deFora = await editar('elisa', ids.carla ?? '', { localId: ids.jundiai });
    expect(deFora.statusCode).toBe(403);

    const r = await editar('ana', ids.carla ?? '', { localId: ids.jundiai });
    expect(r.json().local).toMatchObject({ id: ids.jundiai, caminho: 'Jundiaí' });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        antes: { localId: ids.campinas, local: 'Campinas' },
        depois: { localId: ids.jundiai, local: 'Jundiaí' },
      },
    ]);
    expect((await editar('elisa', ids.carla ?? '', { telefone: '2040' })).statusCode).toBe(200);
  });

  it('registra o cadastro na auditoria, sem o texto de busca', async () => {
    const r = await cadastrar('ana', {
      nome: 'Lia Moura',
      matricula: 'A-77',
      localId: ids.campinas,
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([
      expect.objectContaining({
        acao: 'pessoa.criada',
        alvoTipo: 'pessoa',
        alvoId: r.json().id,
        antes: null,
        depois: {
          nome: 'Lia Moura',
          email: null,
          matricula: 'A-77',
          localId: ids.campinas,
          local: 'Campinas',
          telefone: null,
          situacao: 'ativa',
        },
      }),
    ]);
  });
});

describe('inativação e reativação da pessoa', () => {
  const sessoesDaKatia: Entrada[] = [];

  beforeAll(async () => {
    const editorGeral = await criarPerfil(api, org, {
      nome: 'Editor geral',
      permissoes: ['pessoas.editar'],
    });
    const otavio = await criarConta(api, org, { usuario: 'otavio', nome: 'Otávio Reis' });
    await atribuir(api, org, { perfilId: editorGeral, contaId: otavio.id });
    entradas.otavio = await cliente.entrar('otavio');
    const katia = await criarConta(api, org, {
      usuario: 'katia',
      nome: 'Kátia Nunes',
      localId: ids.jundiai,
    });
    ids.katia = katia.pessoaId;
    ids.contaDaKatia = katia.id;
    sessoesDaKatia.push(await cliente.entrar('katia'), await cliente.entrar('katia'));
  });

  const inativar = (usuario: string, id: string) =>
    cliente.enviar('POST', `/pessoas/${id}/inativacao`, como(usuario));
  const reativar = (usuario: string, id: string) =>
    cliente.enviar('POST', `/pessoas/${id}/reativacao`, como(usuario));

  it('inativa a pessoa e a conta dela, encerrando as sessões com conta-inativada', async () => {
    const r = await inativar('ana', ids.katia ?? '');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'inativa',
      conta: { usuario: 'katia', situacao: 'inativa' },
      permite: { inativar: false, reativar: true },
    });
    for (const entrada of sessoesDaKatia) {
      expect((await cliente.consultar('/conta', entrada)).statusCode).toBe(401);
    }
    const encerradas = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ motivo: sessoes.motivoDoFim })
        .from(sessoes)
        .where(eq(sessoes.contaId, ids.contaDaKatia ?? '')),
    );
    expect(encerradas).toEqual([{ motivo: 'conta-inativada' }, { motivo: 'conta-inativada' }]);
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros.map((registro) => registro.acao).sort()).toEqual([
      'conta.inativada',
      'pessoa.inativada',
      'sessao.encerrada',
      'sessao.encerrada',
    ]);
    expect(registros.find((registro) => registro.acao === 'pessoa.inativada')).toMatchObject({
      alvoId: ids.katia,
      antes: { situacao: 'ativa' },
      depois: { situacao: 'inativa' },
    });
    expect(registros.find((registro) => registro.acao === 'conta.inativada')).toMatchObject({
      alvoId: ids.contaDaKatia,
      antes: { situacao: 'ativa' },
      depois: { situacao: 'inativa' },
    });
    await expect(cliente.entrar('katia')).rejects.toThrow('credenciais-invalidas');
  });

  it('reativa a pessoa sem reativar a conta', async () => {
    const r = await reativar('ana', ids.katia ?? '');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ situacao: 'ativa', conta: { situacao: 'inativa' } });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'pessoa.reativada', antes: { situacao: 'inativa' }, depois: { situacao: 'ativa' } },
    ]);
    expect(nomes(await listar('ana', { busca: 'katia' }))).toEqual(['Kátia Nunes']);
    await expect(cliente.entrar('katia')).rejects.toThrow('credenciais-invalidas');
  });

  it('inativa a pessoa sem conta', async () => {
    const r = await inativar('ana', ids.fabio ?? '');
    expect(r.json()).toMatchObject({ situacao: 'inativa', conta: null });
    expect((await auditoriaDaRequisicao(api, org, r)).map((registro) => registro.acao)).toEqual([
      'pessoa.inativada',
    ]);
  });

  it('recusa a própria pessoa', async () => {
    const [ana] = (await listar('ana', { busca: 'ana souza' })).itens;
    const r = await inativar('ana', ana?.id ?? '');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:propria-conta',
      detail: 'Use outra conta para inativar a sua.',
    });
  });

  it('recusa deixar a organização sem ninguém para administrar os acessos, sem mudar nada', async () => {
    const [ana] = (await listar('ana', { busca: 'ana souza' })).itens;
    const r = await inativar('otavio', ana?.id ?? '');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:ultimo-administrador',
      detail: 'A organização ficaria sem ninguém para administrar os acessos.',
    });
    expect((await cliente.consultar('/conta', como('ana'))).statusCode).toBe(200);
    expect((await listar('ana', { busca: 'ana souza' })).itens[0]).toMatchObject({
      situacao: 'ativa',
      conta: { situacao: 'ativa' },
    });
  });

  it('exige a permissão no local da pessoa', async () => {
    const [davi] = (await listar('ana', { busca: 'davi' })).itens;
    expect((await inativar('elisa', davi?.id ?? '')).statusCode).toBe(403);
    expect((await reativar('elisa', ids.erica ?? '')).statusCode).toBe(200);
  });
});

describe('anonimização da pessoa', () => {
  let rui = { pessoa: '', conta: '' };

  beforeAll(async () => {
    const leitor = await criarPerfil(api, org, {
      nome: 'Plantonista',
      permissoes: ['pessoas.ver'],
    });
    const plantao = await criarGrupo(api, org, { nome: 'Plantão' });
    const conta = await criarConta(api, org, {
      usuario: 'rui.barros',
      nome: 'Rui Barros',
      email: 'rui.barros@empresa.com',
      matricula: '7788',
      localId: ids.jundiai,
    });
    rui = { pessoa: conta.pessoaId, conta: conta.id };
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(pessoas).set({ telefone: '(11) 98888-7777' }).where(eq(pessoas.id, rui.pessoa)),
    );
    await ativarDoisPassos(api, org, rui.conta);
    await atribuir(api, org, { perfilId: leitor, contaId: rui.conta, localId: ids.jundiai });
    await incluirNoGrupo(api, org, { grupoId: plantao, contaId: rui.conta });
    // Uma entrada pendente do segundo passo e uma senha errada, que deixam sessão e tentativa.
    await cliente.entrar('rui.barros');
    await expect(cliente.entrar('rui.barros', 'senha errada')).rejects.toThrow();
    const inativada = await cliente.enviar(
      'POST',
      `/pessoas/${rui.pessoa}/inativacao`,
      como('ana'),
    );
    expect(inativada.statusCode).toBe(200);
  });

  const anonimizar = (usuario: string, id: string) =>
    cliente.enviar('POST', `/pessoas/${id}/anonimizacao`, como(usuario));

  it('recusa a pessoa ativa', async () => {
    const r = await anonimizar('ana', ids.katia ?? '');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:pessoa-ativa',
      detail: 'Inative a pessoa antes de anonimizá-la.',
    });
  });

  it('recusa a própria pessoa', async () => {
    const [ana] = (await listar('ana', { busca: 'ana souza' })).itens;
    const r = await anonimizar('ana', ana?.id ?? '');
    expect(r.json()).toMatchObject({
      type: 'urn:grafite:problema:propria-conta',
      detail: 'Use outra conta para anonimizar a sua.',
    });
  });

  it('exige pessoas.anonimizar', async () => {
    expect((await anonimizar('elisa', rui.pessoa)).statusCode).toBe(403);
    const r = await anonimizar('otavio', rui.pessoa);
    expect(r.statusCode).toBe(403);
    expect(r.json().permissao).toBe('pessoas.anonimizar');
  });

  it('apaga os dados pessoais da pessoa, da conta, das sessões e das tentativas, sem volta', async () => {
    const r = await anonimizar('ana', rui.pessoa);
    expect(r.statusCode).toBe(200);
    const anonimizada = r.json();
    expect(anonimizada).toMatchObject({
      id: rui.pessoa,
      email: null,
      matricula: null,
      telefone: null,
      local: null,
      situacao: 'anonimizada',
      conta: { id: rui.conta, usuario: null, situacao: 'anonimizada' },
      permite: {
        editar: false,
        inativar: false,
        reativar: false,
        anonimizar: false,
        criarConta: false,
        administrarConta: false,
      },
    });
    expect(anonimizada.nome).toMatch(/^Pessoa anonimizada [0-9A-HJKMNP-TV-Z]{4}$/);

    const banco = await naOrganizacao(api.banco, org, async (tx) => ({
      pessoa: (await tx.select().from(pessoas).where(eq(pessoas.id, rui.pessoa)))[0],
      conta: (await tx.select().from(contas).where(eq(contas.id, rui.conta)))[0],
      doisPassos: await tx.select().from(doisPassos).where(eq(doisPassos.contaId, rui.conta)),
      codigos: await tx
        .select()
        .from(codigosDeRecuperacao)
        .where(eq(codigosDeRecuperacao.contaId, rui.conta)),
      sessoes: await tx
        .select({ ip: sessoes.ip, agente: sessoes.agente })
        .from(sessoes)
        .where(eq(sessoes.contaId, rui.conta)),
      tentativas: await tx
        .select()
        .from(tentativasDeEntrada)
        .where(eq(tentativasDeEntrada.usuario, 'rui.barros')),
      atribuicoes: await tx
        .select({ encerradaEm: atribuicoes.encerradaEm })
        .from(atribuicoes)
        .where(eq(atribuicoes.contaId, rui.conta)),
      participacoes: await tx
        .select({ encerradaEm: membrosDoGrupo.encerradaEm })
        .from(membrosDoGrupo)
        .where(eq(membrosDoGrupo.contaId, rui.conta)),
    }));
    expect(banco.pessoa).toMatchObject({
      nome: anonimizada.nome,
      email: null,
      matricula: null,
      localId: null,
      telefone: null,
      busca: anonimizada.nome.toLowerCase(),
      situacao: 'anonimizada',
      anonimizadaEm: api.relogio.agora(),
    });
    expect(banco.conta).toMatchObject({
      usuario: null,
      hashSenha: null,
      exigeDoisPassos: false,
      situacao: 'anonimizada',
    });
    expect(banco.doisPassos).toEqual([]);
    expect(banco.codigos).toEqual([]);
    expect(banco.sessoes.length).toBeGreaterThan(0);
    expect(banco.sessoes.every((sessao) => sessao.ip === null && sessao.agente === null)).toBe(
      true,
    );
    expect(banco.tentativas).toEqual([]);
    expect(banco.atribuicoes.every((atribuicao) => atribuicao.encerradaEm !== null)).toBe(true);
    expect(banco.participacoes.every((membro) => membro.encerradaEm !== null)).toBe(true);
  });

  it('registra a anonimização com os campos apagados, sem os valores deles', async () => {
    const [registro] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'pessoa.anonimizada')),
    );
    expect(registro).toMatchObject({
      alvoTipo: 'pessoa',
      alvoId: rui.pessoa,
      antes: null,
      depois: null,
      dados: {
        camposApagados: [
          'nome',
          'email',
          'matricula',
          'localId',
          'telefone',
          'usuario',
          'senha',
          'doisPassos',
          'codigosDeRecuperacao',
          'ipEDispositivoDasSessoes',
          'tentativasDeEntrada',
        ],
        conta: rui.conta,
      },
    });
    const daRequisicao = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.codigoDeRastreio, registro?.codigoDeRastreio ?? '')),
    );
    expect(daRequisicao.map((linha) => linha.acao).sort()).toEqual([
      'atribuicao.encerrada',
      'membro.retirado',
      'pessoa.anonimizada',
    ]);
    const texto = JSON.stringify(daRequisicao);
    for (const dado of ['Rui', 'rui.barros', '7788', '98888', 'empresa.com']) {
      expect(texto).not.toContain(dado);
    }
  });

  it('deixa o usuário livre para outra pessoa', async () => {
    const outra = await criarConta(api, org, { usuario: 'rui.barros', nome: 'Rui Outro' });
    expect(outra.usuario).toBe('rui.barros');
  });

  it('não deixa editar, inativar, reativar nem anonimizar de novo', async () => {
    const recusas = [
      await cliente.enviar('PATCH', `/pessoas/${rui.pessoa}`, como('ana'), { nome: 'Rui' }),
      await cliente.enviar('POST', `/pessoas/${rui.pessoa}/reativacao`, como('ana')),
      await cliente.enviar('POST', `/pessoas/${rui.pessoa}/inativacao`, como('ana')),
      await anonimizar('ana', rui.pessoa),
    ];
    for (const r of recusas) {
      expect(r.statusCode).toBe(409);
      expect(r.json().type).toBe('urn:grafite:problema:conflito');
    }
    expect(recusas[0]?.json().detail).toBe('Esta pessoa foi anonimizada e não muda mais.');
  });

  it('passa pela conferência do último administrador', async () => {
    // Uma organização que já ficou sem quem administre os acessos: nenhuma mudança de acesso passa.
    const outraOrg = await criarOrganizacao(api, {
      nome: 'Sem administrador',
      enderecos: ['grafite.pessoas-sem-admin.local'],
    });
    const outroCliente = clienteDaApi(api, 'grafite.pessoas-sem-admin.local');
    const anonimizador = await criarPerfil(api, outraOrg, {
      nome: 'Anonimizador',
      permissoes: ['pessoas.anonimizar'],
    });
    const yara = await criarConta(api, outraOrg, { usuario: 'yara' });
    await atribuir(api, outraOrg, { perfilId: anonimizador, contaId: yara.id });
    const xavier = await criarPessoa(api, outraOrg, { nome: 'Xavier', situacao: 'inativa' });
    const r = await outroCliente.enviar(
      'POST',
      `/pessoas/${xavier}/anonimizacao`,
      await outroCliente.entrar('yara'),
    );
    expect(r.statusCode).toBe(409);
    expect(r.json().type).toBe('urn:grafite:problema:ultimo-administrador');
  });
});
