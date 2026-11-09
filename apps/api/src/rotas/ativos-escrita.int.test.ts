// A escrita dos ativos pela API (spec cadastro-de-ativos; design do P1b, decisões 4 a 9): o
// cadastro e a edição conferidos pelo domínio, com os obrigatórios, o modelo do tipo, as
// referências ativas, o patrimônio único, o escopo pelo local de antes e de depois, os restritos, o
// estado e as travas de cada campo, a auditoria e o evento.
import { ativos, auditoria, campos, eventos, naOrganizacao } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  criarPessoa,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.ativos-escrita.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const cadastrar = (pedido: object, usuario = 'ana') =>
  cliente.enviar('POST', '/ativos', como(usuario), pedido);
const editar = (ativoId: string, pedido: object, usuario = 'ana') =>
  cliente.enviar('PATCH', `/ativos/${ativoId}`, como(usuario), pedido);

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: id('jundiai') });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  ids.fechado = await criarLocal(api, org, { nome: 'Galpão fechado', situacao: 'inativo' });

  const catalogo = await criarPerfil(api, org, {
    nome: 'Catálogo',
    permissoes: ['catalogo.administrar', 'modelos.editar'],
  });
  const tudo = await criarPerfil(api, org, {
    nome: 'Ativos',
    permissoes: ['ativos.editar', 'ativos.restritos'],
  });
  const editarAtivos = await criarPerfil(api, org, {
    nome: 'Editar',
    permissoes: ['ativos.editar'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ids.contaDaAna = ana.id;
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  await atribuir(api, org, { perfilId: catalogo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: editarAtivos, contaId: bruno.id, localId: id('jundiai') });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);

  ids.joao = await criarPessoa(api, org, { nome: 'João da Silva' });
  ids.saiu = await criarPessoa(api, org, { nome: 'Paulo Saiu', situacao: 'inativa' });

  // O catálogo pela API, como a organização o monta.
  const campo = async (pedido: object) =>
    (await cliente.enviar('POST', '/campos', como('ana'), pedido)).json().id as string;
  ids.ip = await campo({ rotulo: 'IP', tipo: 'ip', grupo: 'Rede' });
  ids.criticidade = await campo({
    rotulo: 'Criticidade',
    tipo: 'lista',
    configuracao: {
      opcoes: [
        { rotulo: 'Alta', situacao: 'ativa' },
        { rotulo: 'Baixa', situacao: 'ativa' },
      ],
    },
  });
  ids.custo = await campo({ rotulo: 'Custo do contrato', tipo: 'moeda', restrito: true });
  ids.codigo = await campo({ rotulo: 'Código interno', tipo: 'texto', restrito: true });
  ids.vizinha = await campo({ rotulo: 'Impressora vizinha', tipo: 'ativo' });
  const tipo = async (pedido: object) =>
    (await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), pedido)).json().id as string;
  ids.impressora = await tipo({
    nome: 'Impressora',
    icone: 'impressora',
    campos: [
      { campoId: id('ip'), obrigatorio: true },
      { campoId: id('criticidade'), obrigatorio: false },
      { campoId: id('custo'), obrigatorio: false },
      { campoId: id('codigo'), obrigatorio: false },
      { campoId: id('vizinha'), obrigatorio: false },
    ],
  });
  ids.computador = await tipo({ nome: 'Computador', icone: 'computador' });
  ids.camera = await tipo({ nome: 'Câmera', icone: 'camera' });
  await cliente.enviar('POST', `/tipos-de-ativo/${id('camera')}/inativacao`, como('ana'));
  const modelo = async (pedido: object) =>
    (await cliente.enviar('POST', '/modelos', como('ana'), pedido)).json().id as string;
  ids.m404 = await modelo({ tipoId: id('impressora'), fabricante: 'HP', nome: 'LaserJet M404' });
  ids.m402 = await modelo({ tipoId: id('impressora'), fabricante: 'HP', nome: 'LaserJet M402' });
  await cliente.enviar('POST', `/modelos/${id('m402')}/inativacao`, como('ana'));
  ids.optiplex = await modelo({ tipoId: id('computador'), fabricante: 'Dell', nome: 'OptiPlex' });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({
        tipo: eventos.tipo,
        alvoTipo: eventos.alvoTipo,
        alvoId: eventos.alvoId,
        permissao: eventos.permissao,
        locais: eventos.locais,
      })
      .from(eventos),
  );

/** Uma impressora válida em Expedição, com o pedido dado por cima. */
const impressora = (valores: Record<string, unknown> = {}, extras: object = {}) => ({
  tipoId: id('impressora'),
  valores: { 'ativo.local': id('expedicao'), [id('ip')]: '10.0.0.5', ...valores },
  ...extras,
});

let patrimonios = 0;
const novoPatrimonio = () => `PAT-${String(++patrimonios).padStart(5, '0')}`;

describe('cadastro', () => {
  it('cadastra o ativo com os valores lidos, o uso padrão, o estado, a auditoria e o evento', async () => {
    const r = await cadastrar(
      impressora(
        {
          'ativo.patrimonio': ' PAT-00412 ',
          'ativo.responsavel': id('joao'),
          [id('criticidade')]: 'alta',
        },
        { modeloId: id('m404') },
      ),
    );
    expect(r.statusCode).toBe(201);
    ids.almox = r.json().id;
    const opcaoAlta = r.json().valores[id('criticidade')];
    expect(r.json()).toMatchObject({
      rotulo: 'HP LaserJet M404',
      patrimonio: 'PAT-00412',
      uso: 'em-uso',
      situacao: 'ativo',
      local: { id: id('expedicao'), caminho: 'Jundiaí › Expedição' },
      responsavel: { id: id('joao'), nome: 'João da Silva' },
      valores: {
        'ativo.patrimonio': 'PAT-00412',
        'ativo.uso': 'em-uso',
        'ativo.local': id('expedicao'),
        'ativo.responsavel': id('joao'),
        [id('ip')]: '10.0.0.5',
      },
      permite: { editar: true, verRestritos: true, editarRestritos: true, verResponsavel: false },
    });
    expect(opcaoAlta).toEqual(expect.any(String));
    const estado = r.json().estado;
    for (const chave of [
      'ativo.modelo',
      'ativo.patrimonio',
      'ativo.uso',
      'ativo.local',
      'ativo.responsavel',
      id('ip'),
      id('criticidade'),
    ]) {
      expect(estado[chave], chave).toEqual({
        origem: 'manual',
        momento: expect.any(String),
        autor: { id: id('contaDaAna'), nome: 'Ana Souza' },
        trava: false,
      });
    }
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'ativo.criado',
        alvoTipo: 'ativo',
        alvoId: ids.almox,
        depois: {
          tipo: 'Impressora',
          modelo: 'HP LaserJet M404',
          situacao: 'ativo',
          campos: {
            Patrimônio: 'PAT-00412',
            'Situação de uso': 'Em uso',
            Local: 'Jundiaí › Expedição',
            Responsável: 'João da Silva',
            IP: '10.0.0.5',
            Criticidade: 'Alta',
          },
          travados: [],
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      {
        tipo: 'ativos.mudaram',
        alvoTipo: 'ativo',
        alvoId: ids.almox,
        permissao: 'ativos.ver',
        locais: [id('expedicao')],
      },
    ]);
  });

  it('cobra os obrigatórios e recusa pela chave do campo, com o motivo do motor', async () => {
    const r = await cadastrar({
      tipoId: id('impressora'),
      valores: { 'ativo.local': id('expedicao'), 'ativo.vida-util': '700' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      [`valores.${id('ip')}`]: 'Preencha este campo.',
      'valores.ativo.vida-util': expect.any(String),
    });
    const fora = await cadastrar(impressora({ 'hardware.processador': 'Core i5' }));
    expect(fora.json().campos).toEqual({
      'valores.hardware.processador': 'Este campo não é do tipo do ativo.',
    });
  });

  it('recusa o tipo inativo, o modelo de outro tipo e o modelo inativo', async () => {
    const camera = await cadastrar({ tipoId: id('camera'), valores: {} });
    expect(camera.statusCode).toBe(409);
    expect(camera.json().campos).toEqual({ tipoId: 'O tipo Câmera está inativo.' });
    const outroTipo = await cadastrar(impressora({}, { modeloId: id('optiplex') }));
    expect(outroTipo.statusCode).toBe(400);
    expect(outroTipo.json().campos).toEqual({
      modeloId: 'O modelo escolhido não é do tipo do ativo.',
    });
    const inativo = await cadastrar(impressora({}, { modeloId: id('m402') }));
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({
      modeloId: 'O modelo escolhido está inativo. Escolha um modelo ativo.',
    });
  });

  it('recusa o patrimônio repetido, também com outra caixa', async () => {
    const r = await cadastrar(impressora({ 'ativo.patrimonio': 'pat-00412' }));
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({
      'valores.ativo.patrimonio': 'Já existe um ativo com este patrimônio.',
    });
  });

  it('recusa o local e a pessoa inativos', async () => {
    const local = await cadastrar(impressora({ 'ativo.local': id('fechado') }));
    expect(local.statusCode).toBe(409);
    expect(local.json().campos).toEqual({
      'valores.ativo.local': 'O local escolhido está inativo. Escolha um local ativo.',
    });
    const pessoa = await cadastrar(impressora({ 'ativo.responsavel': id('saiu') }));
    expect(pessoa.statusCode).toBe(409);
    expect(pessoa.json().campos).toEqual({
      'valores.ativo.responsavel': 'A pessoa escolhida está inativa. Escolha uma pessoa ativa.',
    });
  });

  it('cadastra só no local do alcance: o ativo sem local pede a organização inteira', async () => {
    expect(
      (await cadastrar(impressora({ 'ativo.patrimonio': novoPatrimonio() }), 'bruno')).statusCode,
    ).toBe(201);
    expect(
      (await cadastrar(impressora({ 'ativo.local': id('campinas') }), 'bruno')).statusCode,
    ).toBe(403);
    expect((await cadastrar(impressora({ 'ativo.local': null }), 'bruno')).statusCode).toBe(403);
    expect((await cadastrar(impressora(), 'carla')).statusCode).toBe(403);
  });
});

describe('edição', () => {
  const ficha = (ativoId: string, usuario = 'ana') =>
    cliente.consultar(`/ativos/${ativoId}`, como(usuario));

  it('grava só o que mudou, com o estado das chaves gravadas, e o igual ao guardado não muda nada', async () => {
    const antes = (await ficha(id('almox'))).json();
    const r = await editar(id('almox'), {
      valores: { 'ativo.hostname': 'IMP-ALMOX-01', [id('ip')]: '10.0.0.5' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().valores['ativo.hostname']).toBe('IMP-ALMOX-01');
    expect(r.json().estado['ativo.hostname']).toMatchObject({ origem: 'manual', trava: false });
    expect(r.json().estado[id('ip')]).toEqual(antes.estado[id('ip')]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { acao: 'ativo.alterado', antes: { campos: { IP: '10.0.0.5' } } },
    ]);

    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    const igual = await editar(id('almox'), {
      valores: { 'ativo.hostname': 'IMP-ALMOX-01', [id('ip')]: '10.0.0.5' },
    });
    expect(igual.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, org, igual)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('a opção inativada continua guardada, e escolhê-la de novo é recusado', async () => {
    const alta = (await ficha(id('almox'))).json().valores[id('criticidade')];
    const mudou = await editar(id('almox'), { valores: { [id('criticidade')]: 'Baixa' } });
    const baixa = mudou.json().valores[id('criticidade')];
    expect(baixa).not.toBe(alta);
    await naOrganizacao(api.banco, org, async (tx) => {
      const [campo] = await tx
        .select({ configuracao: campos.configuracao })
        .from(campos)
        .where(eq(campos.id, id('criticidade')));
      const opcoes = ((campo?.configuracao.opcoes ?? []) as { id: string; situacao: string }[]).map(
        (opcao) => (opcao.id === baixa ? { ...opcao, situacao: 'inativa' } : opcao),
      );
      await tx
        .update(campos)
        .set({ configuracao: { opcoes } })
        .where(eq(campos.id, id('criticidade')));
    });
    // O formulário reenvia o valor guardado: não é mudança, e a edição do resto passa.
    const resto = await editar(id('almox'), {
      valores: { [id('criticidade')]: baixa, 'ativo.serie': 'BR12345' },
    });
    expect(resto.statusCode).toBe(200);
    expect(resto.json().valores[id('criticidade')]).toBe(baixa);
    await editar(id('almox'), { valores: { [id('criticidade')]: 'Alta' } });
    const deNovo = await editar(id('almox'), { valores: { [id('criticidade')]: 'Baixa' } });
    expect(deNovo.statusCode).toBe(400);
    expect(deNovo.json().campos).toEqual({
      [`valores.${id('criticidade')}`]: 'A opção Baixa está inativa.',
    });
  });

  it('não deixa esvaziar um obrigatório, e esvazia um opcional', async () => {
    const vazio = await editar(id('almox'), { valores: { [id('ip')]: '' } });
    expect(vazio.statusCode).toBe(400);
    expect(vazio.json().campos).toEqual({ [`valores.${id('ip')}`]: 'Preencha este campo.' });
    const semSerie = await editar(id('almox'), { valores: { 'ativo.serie': '' } });
    expect(semSerie.statusCode).toBe(200);
    expect(semSerie.json().valores['ativo.serie']).toBeUndefined();
  });

  it('trava e destrava sem mudar o momento nem o autor, e a gravação manual mantém a trava', async () => {
    const antes = (await ficha(id('almox'))).json().estado['ativo.local'];
    const travou = await editar(id('almox'), {
      travas: { 'ativo.local': true, 'ativo.nome': true },
    });
    expect(travou.statusCode).toBe(200);
    expect(travou.json().estado['ativo.local']).toEqual({ ...antes, trava: true });
    expect(travou.json().estado['ativo.nome']).toEqual({
      origem: null,
      momento: null,
      autor: null,
      trava: true,
    });
    expect(await auditoriaDaRequisicao(api, org, travou)).toMatchObject([
      { acao: 'ativo.alterado', depois: { travados: ['Nome', 'Local'] } },
    ]);
    const mudou = await editar(id('almox'), { valores: { 'ativo.local': id('jundiai') } });
    expect(mudou.json().estado['ativo.local']).toMatchObject({ origem: 'manual', trava: true });
    await editar(id('almox'), { valores: { 'ativo.local': id('expedicao') } });
  });

  it('muda e tira o modelo, com o estado dele', async () => {
    const tirou = await editar(id('almox'), { modeloId: null });
    expect(tirou.json().modelo).toBeNull();
    expect(tirou.json().rotulo).toBe('Impressora');
    expect(tirou.json().estado['ativo.modelo']).toMatchObject({ origem: 'manual' });
    const voltou = await editar(id('almox'), { modeloId: id('m404') });
    expect(voltou.json().rotulo).toBe('HP LaserJet M404');
  });

  it('recusa a referência ao próprio ativo e a um ativo inativo', async () => {
    const proprio = await editar(id('almox'), { valores: { [id('vizinha')]: id('almox') } });
    expect(proprio.statusCode).toBe(400);
    expect(proprio.json().campos).toEqual({
      [`valores.${id('vizinha')}`]: 'Um ativo não pode se referir a si mesmo.',
    });
    const velha = await cadastrar(impressora({ 'ativo.nome': 'Matricial' }));
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(ativos).set({ situacao: 'inativo' }).where(eq(ativos.id, velha.json().id)),
    );
    const inativo = await editar(id('almox'), { valores: { [id('vizinha')]: velha.json().id } });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({
      [`valores.${id('vizinha')}`]: 'O ativo escolhido está inativo.',
    });
  });

  it('recusa o ativo de um tipo que o campo não aceita, e o escolhido antes continua', async () => {
    const novo = async (caminho: string, pedido: object, metodo: 'POST' | 'PATCH' = 'POST') => {
      const r = await cliente.enviar(metodo, caminho, como('ana'), pedido);
      expect(r.statusCode).toBeLessThan(300);
      return r.json().id as string;
    };
    const notebook = await novo('/tipos-de-ativo', { nome: 'Notebook', icone: 'notebook' });
    const campo = await novo('/campos', {
      rotulo: 'Computador do monitor',
      tipo: 'ativo',
      configuracao: { tipos: [id('computador')] },
    });
    const monitor = await novo('/tipos-de-ativo', {
      nome: 'Monitor',
      icone: 'monitor',
      campos: [{ campoId: campo, obrigatorio: false }],
    });
    const computador = (
      await cadastrar({ tipoId: id('computador'), valores: { 'ativo.nome': 'PC do caixa' } })
    ).json().id;
    const laser = (await cadastrar(impressora({ 'ativo.nome': 'Laser do caixa' }))).json().id;
    const chave = `valores.${campo}`;

    const recusado = await cadastrar({ tipoId: monitor, valores: { [campo]: laser } });
    expect(recusado.statusCode).toBe(400);
    expect(recusado.json().campos).toEqual({ [chave]: 'Escolha um ativo do tipo Computador.' });
    const tela = await cadastrar({ tipoId: monitor, valores: { [campo]: computador } });
    expect(tela.statusCode).toBe(201);

    await novo(
      `/campos/${campo}`,
      { configuracao: { tipos: [notebook, id('computador')] } },
      'PATCH',
    );
    const varios = await cadastrar({ tipoId: monitor, valores: { [campo]: laser } });
    expect(varios.json().campos).toEqual({
      [chave]: 'Escolha um ativo de um destes tipos: Notebook, Computador.',
    });

    // O computador deixa de ser aceito, e o monitor que já aponta para um continua apontando.
    await novo(`/campos/${campo}`, { configuracao: { tipos: [notebook] } }, 'PATCH');
    const editado = await editar(tela.json().id, {
      valores: { [campo]: computador, 'ativo.nome': 'Monitor do caixa' },
    });
    expect(editado.statusCode).toBe(200);
    expect(editado.json().valores[campo]).toBe(computador);
  });

  it('a mudança de local pede ativos.editar nos dois locais', async () => {
    const r = await editar(id('almox'), { valores: { 'ativo.local': id('campinas') } }, 'bruno');
    expect(r.statusCode).toBe(403);
    const recusas = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ acao: auditoria.acao })
        .from(auditoria)
        .where(and(eq(auditoria.acao, 'permissao.recusada'))),
    );
    expect(recusas.length).toBeGreaterThan(0);
    const ok = await editar(id('almox'), { valores: { 'ativo.local': id('jundiai') } }, 'bruno');
    expect(ok.statusCode).toBe(200);
    const evento = (await eventosGravados()).at(-1);
    expect(evento).toMatchObject({
      permissao: 'ativos.ver',
      locais: [id('expedicao'), id('jundiai')],
    });
    await editar(id('almox'), { valores: { 'ativo.local': id('expedicao') } });
  });

  it('os restritos pedem ativos.restritos para gravar e travar, e ficam fora da busca', async () => {
    const valor = await editar(id('almox'), { valores: { [id('custo')]: '10,00' } }, 'bruno');
    expect(valor.statusCode).toBe(403);
    const trava = await editar(id('almox'), { travas: { [id('custo')]: true } }, 'bruno');
    expect(trava.statusCode).toBe(403);
    const daAna = await editar(id('almox'), {
      valores: { [id('custo')]: '10,00', [id('codigo')]: 'XPTO-77', 'ativo.serie': 'BR12345' },
    });
    expect(daAna.statusCode).toBe(200);
    expect(daAna.json().valores[id('custo')]).toBe(10);
    const busca = await cliente.consultar('/ativos?busca=xpto', como('ana'));
    expect(busca.json().itens).toEqual([]);
    const pelaSerie = await cliente.consultar('/ativos?busca=br12345', como('ana'));
    expect(pelaSerie.json().itens.map((item: { id: string }) => item.id)).toEqual([id('almox')]);
  });

  it('duas edições ao mesmo tempo gravam uma sobre a outra, sem perder chave', async () => {
    const [uma, outra] = await Promise.all([
      editar(id('almox'), { valores: { 'ativo.contrato': 'CT-2026-01' } }),
      editar(id('almox'), { valores: { 'ativo.nota-fiscal': 'NF 123' } }),
    ]);
    expect(uma?.statusCode).toBe(200);
    expect(outra?.statusCode).toBe(200);
    const final = (await ficha(id('almox'))).json();
    expect(final.valores['ativo.contrato']).toBe('CT-2026-01');
    expect(final.valores['ativo.nota-fiscal']).toBe('NF 123');
  });

  it('o tipo não muda, e o ativo que não existe é 404', async () => {
    const r = await editar(id('almox'), { tipoId: id('computador') });
    expect(r.statusCode).toBe(400);
    const inexistente = await editar('0199a6e0-0000-7000-8000-000000000999', {
      valores: { 'ativo.nome': 'X' },
    });
    expect(inexistente.statusCode).toBe(404);
  });

  it('a busca acha o ativo pelo hostname gravado', async () => {
    const r = await cliente.consultar(
      `/ativos?busca=${encodeURIComponent(normalizarTexto('imp-almox'))}`,
      como('ana'),
    );
    expect(r.json().itens.map((item: { id: string }) => item.id)).toEqual([id('almox')]);
  });
});
