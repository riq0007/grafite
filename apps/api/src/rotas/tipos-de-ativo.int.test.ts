// Os tipos de ativo e as capacidades pela API (spec catalogo-de-ativos; design do P1a, decisões 1,
// 4, 7, 8 e 10): a leitura por qualquer sessão, com o que a conta pode; o cadastro e a edição com
// `catalogo.administrar`, com o nome único sem diferenciar acento, o ícone, as capacidades com código
// e a lista de campos; a inativação e a reativação; e cada mudança na auditoria, com o evento.
import { campos, eventos, naOrganizacao } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.tipos.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

/** Um campo da organização, direto no banco: as rotas dos campos são de outra tarefa. */
async function criarCampo(
  rotulo: string,
  situacao: 'ativo' | 'inativo' = 'ativo',
  tipo: 'texto' | 'ip' = 'texto',
) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [campo] = await tx
      .insert(campos)
      .values({
        orgId: org,
        rotulo,
        rotuloNormalizado: normalizarTexto(rotulo),
        tipo,
        situacao,
      })
      .returning({ id: campos.id });
    return campo?.id ?? '';
  });
}

const situacaoDoCampo = (id: string, situacao: 'ativo' | 'inativo') =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.update(campos).set({ situacao }).where(eq(campos.id, id)),
  );

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const catalogo = await criarPerfil(api, org, {
    nome: 'Catálogo',
    permissoes: ['catalogo.administrar'],
  });
  const modelos = await criarPerfil(api, org, { nome: 'Modelos', permissoes: ['modelos.editar'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: catalogo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: modelos, contaId: bruno.id });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);
  ids.ip = await criarCampo('IP');
  ids.mac = await criarCampo('Endereço MAC');
  ids.tensao = await criarCampo('Tensão');
  ids.antigo = await criarCampo('Campo antigo', 'inativo');
  ids.ipDaRede = await criarCampo('IP da rede', 'ativo', 'ip');
  ids.ipDaGerencia = await criarCampo('IP da gerência', 'ativo', 'ip');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
});

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const cadastrar = (usuario: string, pedido: object) =>
  cliente.enviar('POST', '/tipos-de-ativo', como(usuario), pedido);
const editar = (usuario: string, id: string, pedido: object) =>
  cliente.enviar('PATCH', `/tipos-de-ativo/${id}`, como(usuario), pedido);
const acao = (usuario: string, id: string, caminho: string) =>
  cliente.enviar('POST', `/tipos-de-ativo/${id}/${caminho}`, como(usuario));

let nomes = 0;
async function tipoNovo(pedido: object = {}) {
  nomes += 1;
  const r = await cadastrar('ana', { nome: `Tipo ${nomes}`, icone: 'generico', ...pedido });
  expect(r.statusCode).toBe(201);
  return r.json() as { id: string; campos: { campoId: string; obrigatorio: boolean }[] };
}

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, alvoTipo: eventos.alvoTipo, todas: eventos.todas })
      .from(eventos),
  );

describe('capacidades', () => {
  it('qualquer sessão lê as capacidades com código, com os campos de cada uma', async () => {
    const r = await cliente.consultar('/capacidades', como('carla'));
    expect(r.statusCode).toBe(200);
    const [inventario] = r.json().capacidades;
    expect(inventario).toMatchObject({
      chave: 'hardware.inventario',
      nome: 'Inventário de hardware',
    });
    // A identificação e a rede vêm antes do processador (change cadastrar-computadores-pelo-agente).
    expect(inventario.campos).toHaveLength(13);
    expect(inventario.campos[4]).toEqual({
      chave: 'hardware.memoria',
      rotulo: 'Memória (GB)',
      tipo: 'inteiro',
      grupo: 'Hardware',
      configuracao: { minimo: 0, maximo: 100_000 },
      escrita: 'automatica',
    });
  });
});

describe('cadastro', () => {
  it('cadastra o tipo com o ícone e os campos em ordem, com a auditoria e o evento', async () => {
    const r = await cadastrar('ana', {
      nome: ' Impressora ',
      icone: 'impressora',
      campos: [
        { campoId: ids.ip, obrigatorio: true },
        { campoId: ids.mac, obrigatorio: false },
      ],
    });
    expect(r.statusCode).toBe(201);
    ids.impressora = r.json().id;
    expect(r.json()).toEqual({
      id: expect.any(String),
      nome: 'Impressora',
      icone: 'impressora',
      capacidades: [],
      configuracaoDasCapacidades: {},
      campos: [
        { campoId: ids.ip, obrigatorio: true },
        { campoId: ids.mac, obrigatorio: false },
      ],
      situacao: 'ativo',
      primeiroCartao: null,
      permite: { editar: true },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'tipo-de-ativo.criado',
        alvoTipo: 'tipo-de-ativo',
        alvoId: ids.impressora,
        depois: {
          nome: 'Impressora',
          icone: 'impressora',
          capacidades: [],
          campos: [
            { rotulo: 'IP', obrigatorio: true },
            { rotulo: 'Endereço MAC', obrigatorio: false },
          ],
          situacao: 'ativo',
        },
      },
    ]);
    expect(await eventosGravados()).toEqual([
      { tipo: 'catalogo.mudou', alvoTipo: 'tipo-de-ativo', todas: true },
    ]);
  });

  it('recusa o nome repetido, também com outro acento', async () => {
    await tipoNovo({ nome: 'Câmera', icone: 'camera' });
    const r = await cadastrar('ana', { nome: 'camera', icone: 'camera' });
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({ nome: 'Já existe um tipo com este nome.' });
  });

  it('recusa o ícone e a capacidade desconhecidos, e o nome vazio', async () => {
    const icone = await cadastrar('ana', { nome: 'Foguete', icone: 'foguete' });
    expect(icone.statusCode).toBe(400);
    expect(icone.json().campos).toEqual({ icone: 'Escolha o ícone do tipo.' });
    const capacidade = await cadastrar('ana', {
      nome: 'Impressora a laser',
      icone: 'impressora',
      capacidades: ['rede.wifi'],
    });
    expect(capacidade.statusCode).toBe(400);
    expect(capacidade.json().campos).toEqual({
      capacidades: 'Capacidade desconhecida: rede.wifi.',
    });
    const vazio = await cadastrar('ana', { nome: ' ', icone: 'generico' });
    expect(vazio.json().campos).toEqual({ nome: 'Informe o nome do tipo.' });
  });

  it('recusa a inclusão de um campo inativo', async () => {
    const r = await cadastrar('ana', {
      nome: 'Nobreak',
      icone: 'nobreak',
      campos: [{ campoId: ids.antigo, obrigatorio: false }],
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ campos: 'O campo Campo antigo está inativo.' });
  });

  it('liga o inventário de hardware, sem repetir a capacidade', async () => {
    const tipo = await tipoNovo({ icone: 'computador' });
    const r = await editar('ana', tipo.id, {
      capacidades: ['hardware.inventario', 'hardware.inventario'],
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().capacidades).toEqual(['hardware.inventario']);
  });
});

describe('lista de campos do tipo', () => {
  it('reescreve a lista em ordem, com o antes → depois na auditoria', async () => {
    const tipo = await tipoNovo({ campos: [{ campoId: ids.ip, obrigatorio: true }] });
    const r = await editar('ana', tipo.id, {
      campos: [
        { campoId: ids.mac, obrigatorio: false },
        { campoId: ids.ip, obrigatorio: false },
      ],
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().campos).toEqual([
      { campoId: ids.mac, obrigatorio: false },
      { campoId: ids.ip, obrigatorio: false },
    ]);
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'tipo-de-ativo.alterado',
        antes: { campos: [{ rotulo: 'IP', obrigatorio: true }] },
        depois: {
          campos: [
            { rotulo: 'Endereço MAC', obrigatorio: false },
            { rotulo: 'IP', obrigatorio: false },
          ],
        },
      },
    ]);
  });

  it('mantém o campo inativo que já estava no tipo, e recusa a inclusão nova dele', async () => {
    const tipo = await tipoNovo({ campos: [{ campoId: ids.tensao, obrigatorio: false }] });
    const outro = await tipoNovo();
    await situacaoDoCampo(ids.tensao ?? '', 'inativo');
    try {
      const reordenado = await editar('ana', tipo.id, {
        campos: [
          { campoId: ids.ip, obrigatorio: false },
          { campoId: ids.tensao, obrigatorio: false },
        ],
      });
      expect(reordenado.statusCode).toBe(200);
      const incluido = await editar('ana', outro.id, {
        campos: [{ campoId: ids.tensao, obrigatorio: false }],
      });
      expect(incluido.statusCode).toBe(400);
      expect(incluido.json().campos).toEqual({ campos: 'O campo Tensão está inativo.' });
    } finally {
      await situacaoDoCampo(ids.tensao ?? '', 'ativo');
    }
  });

  it('duas gravações ao mesmo tempo: a última vale inteira, sem campo repetido', async () => {
    const tipo = await tipoNovo();
    const primeira = [
      { campoId: ids.ip, obrigatorio: true },
      { campoId: ids.mac, obrigatorio: false },
    ];
    const segunda = [
      { campoId: ids.mac, obrigatorio: true },
      { campoId: ids.tensao, obrigatorio: false },
      { campoId: ids.ip, obrigatorio: false },
    ];
    const respostas = await Promise.all([
      editar('ana', tipo.id, { campos: primeira }),
      editar('ana', tipo.id, { campos: segunda }),
    ]);
    expect(respostas.map((r) => r.statusCode)).toEqual([200, 200]);
    const lido = (await cliente.consultar('/tipos-de-ativo', como('ana')))
      .json()
      .tipos.find((t: { id: string }) => t.id === tipo.id);
    expect([primeira, segunda]).toContainEqual(lido.campos);
  });

  it('recusa o campo repetido e o que não é da organização', async () => {
    const tipo = await tipoNovo();
    const repetido = await editar('ana', tipo.id, {
      campos: [
        { campoId: ids.ip, obrigatorio: false },
        { campoId: ids.ip, obrigatorio: true },
      ],
    });
    expect(repetido.json().campos).toEqual({ campos: 'O campo IP aparece duas vezes.' });
    const estranho = await editar('ana', tipo.id, {
      campos: [{ campoId: '0199a3f0-0000-7000-8000-00000000abcd', obrigatorio: false }],
    });
    expect(estranho.json().campos).toEqual({ campos: 'Campo não encontrado.' });
  });
});

describe('inativação e reativação', () => {
  it('inativa e reativa, com a auditoria, e repetir não grava nada', async () => {
    const tipo = await tipoNovo();
    const inativado = await acao('ana', tipo.id, 'inativacao');
    expect(inativado.statusCode).toBe(200);
    expect(inativado.json().situacao).toBe('inativo');
    expect(await auditoriaDaRequisicao(api, org, inativado)).toMatchObject([
      {
        acao: 'tipo-de-ativo.inativado',
        antes: { situacao: 'ativo' },
        depois: { situacao: 'inativo' },
      },
    ]);
    const deNovo = await acao('ana', tipo.id, 'inativacao');
    expect(await auditoriaDaRequisicao(api, org, deNovo)).toEqual([]);
    const reativado = await acao('ana', tipo.id, 'reativacao');
    expect(reativado.json().situacao).toBe('ativo');
  });

  it('o tipo de outra organização ou que não existe responde 404', async () => {
    const r = await acao('ana', '0199a3f0-0000-7000-8000-00000000abcd', 'inativacao');
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Tipo de ativo não encontrado.');
  });
});

describe('leitura e permissão', () => {
  it('qualquer sessão lê os tipos, com o que a conta pode', async () => {
    const r = await cliente.consultar('/tipos-de-ativo', como('carla'));
    expect(r.statusCode).toBe(200);
    expect(r.json().permite).toEqual({ cadastrar: false });
    expect(r.json().tipos.find((t: { id: string }) => t.id === ids.impressora)).toMatchObject({
      nome: 'Impressora',
      permite: { editar: false },
    });
    const daAna = await cliente.consultar('/tipos-de-ativo', como('ana'));
    expect(daAna.json().permite).toEqual({ cadastrar: true });
  });

  it('lista os tipos pelo nome, sem diferenciar acento', async () => {
    const r = await cliente.consultar('/tipos-de-ativo', como('ana'));
    const nomesDaLista = r.json().tipos.map((t: { nome: string }) => normalizarTexto(t.nome));
    expect(nomesDaLista).toEqual([...nomesDaLista].sort());
  });

  it('sem catalogo.administrar, recusa a mudança com 403 e audita a recusa', async () => {
    for (const usuario of ['bruno', 'carla']) {
      const r = await cadastrar(usuario, { nome: 'Rack de parede', icone: 'rack' });
      expect(r.statusCode).toBe(403);
      expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
        { acao: 'permissao.recusada' },
      ]);
    }
    const edicao = await editar('bruno', ids.impressora ?? '', { nome: 'Impressoras' });
    expect(edicao.statusCode).toBe(403);
  });
});

describe('disponibilidade na rede', () => {
  const comOIp = (campoDoIp: string) => ({ 'rede.disponibilidade': { campoDoIp } });

  it('a lista das capacidades diz que a disponibilidade pede o campo de IP', async () => {
    const r = await cliente.consultar('/capacidades', como('carla'));
    const disponibilidade = r
      .json()
      .capacidades.find(
        (capacidade: { chave: string }) => capacidade.chave === 'rede.disponibilidade',
      );
    expect(disponibilidade).toEqual({
      chave: 'rede.disponibilidade',
      nome: 'Disponibilidade na rede',
      descricao: 'Confere pelo ping, a cada 2 minutos, se o ativo responde na rede.',
      campos: [],
      configuracao: 'campo-de-ip',
    });
  });

  it('liga a disponibilidade escolhendo o campo de IP, com a configuração na auditoria', async () => {
    const r = await cadastrar('ana', {
      nome: 'Impressora com ping',
      icone: 'impressora',
      capacidades: ['rede.disponibilidade'],
      campos: [{ campoId: ids.ipDaRede }, { campoId: ids.ipDaGerencia }],
      configuracaoDasCapacidades: comOIp(ids.ipDaGerencia ?? ''),
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      capacidades: ['rede.disponibilidade'],
      configuracaoDasCapacidades: comOIp(ids.ipDaGerencia ?? ''),
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'tipo-de-ativo.criado',
        depois: { capacidades: ['rede.disponibilidade'], ipDaDisponibilidade: 'IP da gerência' },
      },
    ]);
    const lido = (await cliente.consultar('/tipos-de-ativo', como('carla')))
      .json()
      .tipos.find((tipo: { id: string }) => tipo.id === r.json().id);
    expect(lido.configuracaoDasCapacidades).toEqual(comOIp(ids.ipDaGerencia ?? ''));
  });

  it('recusa ligar sem o campo, com um campo que não é IP e com um campo fora do tipo', async () => {
    const pedido = {
      nome: 'Switch com ping',
      icone: 'switch',
      capacidades: ['rede.disponibilidade'],
      campos: [{ campoId: ids.ipDaRede }, { campoId: ids.mac }],
    };
    const semCampo = await cadastrar('ana', pedido);
    expect(semCampo.statusCode).toBe(400);
    expect(semCampo.json().campos).toEqual({
      configuracaoDasCapacidades: 'Escolha o campo de IP que o ping usa.',
    });
    const naoEIp = await cadastrar('ana', {
      ...pedido,
      configuracaoDasCapacidades: comOIp(ids.mac ?? ''),
    });
    expect(naoEIp.json().campos).toEqual({
      configuracaoDasCapacidades: 'O campo Endereço MAC não é do tipo IP.',
    });
    const foraDoTipo = await cadastrar('ana', {
      ...pedido,
      configuracaoDasCapacidades: comOIp(ids.ipDaGerencia ?? ''),
    });
    expect(foraDoTipo.json().campos).toEqual({
      configuracaoDasCapacidades: 'Escolha um campo de IP que esteja no tipo.',
    });
  });

  it('recusa tirar do tipo o campo que é o IP, e desligar a disponibilidade esquece o campo', async () => {
    const tipo = await tipoNovo({
      capacidades: ['rede.disponibilidade'],
      campos: [{ campoId: ids.ipDaRede }, { campoId: ids.tensao }],
      configuracaoDasCapacidades: comOIp(ids.ipDaRede ?? ''),
    });
    const semOIp = await editar('ana', tipo.id, { campos: [{ campoId: ids.tensao }] });
    expect(semOIp.statusCode).toBe(400);
    expect(semOIp.json().campos).toEqual({
      campos:
        'O campo IP da rede é o IP da disponibilidade neste tipo: escolha outro antes de tirá-lo.',
    });

    const desligada = await editar('ana', tipo.id, {
      capacidades: [],
      campos: [{ campoId: ids.tensao }],
    });
    expect(desligada.statusCode).toBe(200);
    expect(desligada.json()).toMatchObject({ capacidades: [], configuracaoDasCapacidades: {} });
    expect(await auditoriaDaRequisicao(api, org, desligada)).toMatchObject([
      {
        acao: 'tipo-de-ativo.alterado',
        antes: { ipDaDisponibilidade: 'IP da rede' },
        depois: { ipDaDisponibilidade: null },
      },
    ]);
  });

  it('troca o campo de IP do ping sem mudar as capacidades', async () => {
    const tipo = await tipoNovo({
      capacidades: ['rede.disponibilidade'],
      campos: [{ campoId: ids.ipDaRede }, { campoId: ids.ipDaGerencia }],
      configuracaoDasCapacidades: comOIp(ids.ipDaRede ?? ''),
    });
    const r = await editar('ana', tipo.id, {
      configuracaoDasCapacidades: comOIp(ids.ipDaGerencia ?? ''),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().configuracaoDasCapacidades).toEqual(comOIp(ids.ipDaGerencia ?? ''));
  });
});

// O primeiro cartão da ficha (spec catalogo-de-ativos, "Primeiro cartão da ficha"; change
// primeiro-cartao-da-ficha, design, decisões 1 e 6).
describe('primeiro cartão da ficha', () => {
  // Uma função: os ids dos campos só existem depois do beforeAll.
  const ping = () => ({
    capacidades: ['rede.disponibilidade'],
    campos: [{ campoId: ids.ipDaRede }],
    configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: ids.ipDaRede } },
  });

  it('o tipo novo fica no automático, e a escolha da Visão geral vai à resposta e à auditoria', async () => {
    const tipo = await tipoNovo(ping());
    expect((tipo as { primeiroCartao?: unknown }).primeiroCartao).toBeNull();
    const r = await editar('ana', tipo.id, { primeiroCartao: 'visao-geral' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().primeiroCartao).toBe('visao-geral');
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      {
        acao: 'tipo-de-ativo.alterado',
        antes: { primeiroCartao: null },
        depois: { primeiroCartao: 'visao-geral' },
      },
    ]);
    const lido = (await cliente.consultar('/tipos-de-ativo', como('carla')))
      .json()
      .tipos.find((item: { id: string }) => item.id === tipo.id);
    expect(lido.primeiroCartao).toBe('visao-geral');
  });

  it('escolhe uma capacidade ligada, e desligá-la volta ao automático', async () => {
    const r = await cadastrar('ana', {
      nome: 'Switch do primeiro cartão',
      icone: 'switch',
      ...ping(),
      primeiroCartao: 'rede.disponibilidade',
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().primeiroCartao).toBe('rede.disponibilidade');
    const desligada = await editar('ana', r.json().id, {
      capacidades: [],
      configuracaoDasCapacidades: {},
    });
    expect(desligada.statusCode, desligada.body).toBe(200);
    expect(desligada.json().primeiroCartao).toBeNull();
  });

  it('recusa o que não é a Visão geral nem uma capacidade com cartão', async () => {
    const tipo = await tipoNovo(ping());
    for (const primeiroCartao of ['acesso.vnc', 'organizacao:Rede']) {
      const r = await editar('ana', tipo.id, { primeiroCartao });
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({
        primeiroCartao: 'Escolha a Visão geral ou uma capacidade do tipo com cartão na ficha.',
      });
    }
  });
});

describe('acesso remoto', () => {
  const comOIpDaRede = () => ({ 'rede.disponibilidade': { campoDoIp: ids.ipDaRede ?? '' } });

  it('liga com a disponibilidade, na porta 5900 de fábrica, e troca a porta', async () => {
    const r = await cadastrar('ana', {
      nome: 'Computador com VNC',
      icone: 'generico',
      capacidades: ['rede.disponibilidade', 'acesso.vnc'],
      campos: [{ campoId: ids.ipDaRede }],
      configuracaoDasCapacidades: comOIpDaRede(),
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().configuracaoDasCapacidades).toEqual({
      ...comOIpDaRede(),
      'acesso.vnc': { porta: 5900 },
    });
    const trocada = await editar('ana', r.json().id, {
      configuracaoDasCapacidades: { ...comOIpDaRede(), 'acesso.vnc': { porta: 5901 } },
    });
    expect(trocada.statusCode).toBe(200);
    expect(trocada.json().configuracaoDasCapacidades['acesso.vnc']).toEqual({ porta: 5901 });
  });

  it('recusa sem a disponibilidade na rede e com a porta fora dos limites', async () => {
    const semDisponibilidade = await cadastrar('ana', {
      nome: 'Computador sem ping',
      icone: 'generico',
      capacidades: ['acesso.vnc'],
    });
    expect(semDisponibilidade.statusCode).toBe(400);
    expect(semDisponibilidade.json().campos).toEqual({
      configuracaoDasCapacidades:
        'Ligue a disponibilidade na rede no tipo: o acesso remoto usa o mesmo IP.',
    });
    const foraDosLimites = await cadastrar('ana', {
      nome: 'Computador na porta errada',
      icone: 'generico',
      capacidades: ['rede.disponibilidade', 'acesso.vnc'],
      campos: [{ campoId: ids.ipDaRede }],
      configuracaoDasCapacidades: { ...comOIpDaRede(), 'acesso.vnc': { porta: 70000 } },
    });
    expect(foraDosLimites.statusCode).toBe(400);
    expect(foraDosLimites.json().campos).toEqual({
      configuracaoDasCapacidades: 'Informe a porta de 1 a 65535.',
    });
  });
});
