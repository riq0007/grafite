// A gestão das plantas pela API (spec mapa-da-planta, "Exclusão da planta" e "Substituição do
// desenho"; change gestao-das-plantas, design, decisões 2 a 4): a planta enviada por engano sai com
// o desenho e as posições, e os ativos ficam; quem não edita o mapa não exclui.
import {
  ativos,
  eventos,
  naOrganizacao,
  plantas,
  posicoesNaPlanta,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
} from '../../test/integracao.ts';
import { chaveDoModeloDaPlanta } from '../arquivos/armazenamento.ts';

const host = 'grafite.plantas.local';
let api: ApiDeTeste;
let org = '';
const impressoras: string[] = [];
const entradas: Record<string, Entrada> = {};
let cliente: ReturnType<typeof clienteDaApi>;

/** O modelo do PMG, com a largura e a profundidade dadas. */
const modeloDoPmg = (largura = 120, profundidade = 80) => ({
  id: 'planta-exemplo',
  width: largura,
  depth: profundidade,
  layers: [{ name: 'PAREDES', segments: [0, 0, largura, 0, largura, 0, largura, profundidade] }],
  walls: [],
  labels: [{ text: 'WC M', x: 10.5, z: 20.25 }],
  machines: [],
});

const ana = () => entradas.ana as Entrada;
const bruno = () => entradas.bruno as Entrada;

async function cadastrar(nome: string, modelo: object = modeloDoPmg()) {
  const r = await cliente.enviarBytes(
    'POST',
    `/mapa/plantas?nome=${encodeURIComponent(nome)}&fonte=planta.json`,
    ana(),
    Buffer.from(JSON.stringify(modelo)),
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}

async function posicionar(planta: string, ativo: string, x: number, z: number) {
  const r = await cliente.enviar('PUT', `/mapa/plantas/${planta}/posicoes`, ana(), {
    alvo: { tipo: 'ativo', id: ativo },
    x,
    z,
  });
  expect(r.statusCode, r.body).toBe(204);
}

const nomesDasPlantas = async (entrada: Entrada) =>
  ((await cliente.consultar('/mapa/plantas', entrada)).json().plantas as { nome: string }[]).map(
    ({ nome }) => nome,
  );

const posicoesDa = (planta: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(posicoesNaPlanta).where(eq(posicoesNaPlanta.plantaId, planta)),
  );

const eventosDoMapa = async () =>
  (await naOrganizacao(api.banco, org, (tx) => tx.select().from(eventos))).filter(
    ({ tipo }) => tipo === 'mapa.mudou',
  ).length;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const edita = await criarPerfil(api, org, {
    nome: 'Mapa',
    permissoes: ['mapa.editar', 'ativos.ver'],
  });
  const ve = await criarPerfil(api, org, {
    nome: 'Vê o mapa',
    permissoes: ['mapa.ver', 'ativos.ver'],
  });
  for (const usuario of ['ana', 'bruno']) {
    const conta = await criarConta(api, org, { usuario });
    await atribuir(api, org, { perfilId: usuario === 'ana' ? edita : ve, contaId: conta.id });
    entradas[usuario] = await cliente.entrar(usuario);
  }
  await naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Impressora',
        nomeNormalizado: normalizarTexto('Impressora'),
        icone: 'impressora',
      })
      .returning({ id: tiposDeAtivo.id });
    for (const nome of ['Impressora da expedição', 'Impressora do RH']) {
      const [linha] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: '',
          nome,
          patrimonio: `PAT-${impressoras.length}`,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      impressoras.push(linha?.id ?? '');
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('a exclusão da planta', () => {
  it('Planta enviada por engano: saem a planta, o desenho e as posições, e os ativos ficam', async () => {
    const planta = await cadastrar('Teste');
    await posicionar(planta, impressoras[0] as string, 10, 20);
    await posicionar(planta, impressoras[1] as string, 30, 40);
    const chave = chaveDoModeloDaPlanta(org, planta);
    expect(await api.armazenamento.abrir(chave)).not.toBeNull();
    const eventosAntes = await eventosDoMapa();

    const r = await cliente.enviar('DELETE', `/mapa/plantas/${planta}`, ana());
    expect(r.statusCode, r.body).toBe(204);

    expect(await nomesDasPlantas(ana())).not.toContain('Teste');
    expect(await posicoesDa(planta)).toEqual([]);
    expect(await api.armazenamento.abrir(chave)).toBeNull();
    // Os ativos que estavam posicionados continuam cadastrados.
    const restantes = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ id: ativos.id }).from(ativos),
    );
    expect(restantes.map(({ id }) => id).sort()).toEqual([...impressoras].sort());
    // A auditoria guarda o nome, as medidas e quantas posições foram apagadas.
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      acao: 'planta.excluida',
      alvoTipo: 'planta',
      alvoId: planta,
      antes: { nome: 'Teste', largura: 120, profundidade: 80, posicoes: 2 },
    });
    // E as telas abertas ficam sabendo.
    expect(await eventosDoMapa()).toBe(eventosAntes + 1);
  });

  it('Exclusão sem a permissão: 403, e a planta continua', async () => {
    const planta = await cadastrar('Jundiaí');
    const r = await cliente.enviar('DELETE', `/mapa/plantas/${planta}`, bruno());
    expect(r.statusCode).toBe(403);
    expect(await nomesDasPlantas(ana())).toContain('Jundiaí');
    expect(await api.armazenamento.abrir(chaveDoModeloDaPlanta(org, planta))).not.toBeNull();
  });

  it('a planta que não existe responde 404', async () => {
    const r = await cliente.enviar(
      'DELETE',
      '/mapa/plantas/0199d3a0-0000-7000-8000-00000000dead',
      ana(),
    );
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Planta não encontrada.');
  });

  it('a planta inativa e a que falhou também se excluem', async () => {
    const inativa = await cadastrar('Galpão antigo');
    await cliente.enviar('PATCH', `/mapa/plantas/${inativa}`, ana(), { situacao: 'inativa' });
    const falhou = await cadastrar('Com defeito');
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(plantas)
        .set({ situacao: 'falhou', erro: 'DXF sem linhas.' })
        .where(eq(plantas.id, falhou)),
    );
    for (const planta of [inativa, falhou]) {
      const r = await cliente.enviar('DELETE', `/mapa/plantas/${planta}`, ana());
      expect(r.statusCode, r.body).toBe(204);
    }
    const nomes = await nomesDasPlantas(ana());
    expect(nomes).not.toContain('Galpão antigo');
    expect(nomes).not.toContain('Com defeito');
  });
});

describe('a substituição do desenho', () => {
  const substituir = (planta: string, arquivo: object | Buffer, entrada: Entrada = ana()) =>
    cliente.enviarBytes(
      'PUT',
      `/mapa/plantas/${planta}/modelo?fonte=novo.json`,
      entrada,
      Buffer.isBuffer(arquivo) ? arquivo : Buffer.from(JSON.stringify(arquivo)),
    );

  const rotulosDoModelo = async (planta: string) =>
    (await cliente.consultar(`/mapa/plantas/${planta}/modelo`, ana())).json().rotulos as unknown[];

  it('Desenho corrigido: o desenho e as contagens mudam, e o nome e as posições ficam', async () => {
    const planta = await cadastrar('Jundiaí · Térreo');
    await posicionar(planta, impressoras[0] as string, 10, 20);
    await posicionar(planta, impressoras[1] as string, 30, 40);
    const eventosAntes = await eventosDoMapa();
    const novo = {
      ...modeloDoPmg(),
      labels: [
        { text: 'WC M', x: 10.5, z: 20.25 },
        { text: 'Copa', x: 5, z: 5 },
      ],
    };

    const r = await substituir(planta, novo);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      planta: {
        id: planta,
        nome: 'Jundiaí · Térreo',
        largura: 120,
        profundidade: 80,
        situacao: 'ativa',
        fonte: 'novo.json',
        contagens: { rotulos: 2 },
      },
      posicoesFora: 0,
    });
    const posicoes = (await posicoesDa(planta)).map(({ x, z }) => `${x},${z}`).sort();
    expect(posicoes).toEqual(['10,20', '30,40']);
    expect(await rotulosDoModelo(planta)).toHaveLength(2);
    // A auditoria guarda as medidas e as contagens de antes e de depois.
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      acao: 'planta.desenho-substituido',
      alvoTipo: 'planta',
      alvoId: planta,
      antes: { largura: 120, profundidade: 80, rotulos: 1, fonte: 'planta.json' },
      depois: { largura: 120, profundidade: 80, rotulos: 2, fonte: 'novo.json' },
    });
    expect(await eventosDoMapa()).toBe(eventosAntes + 1);
  });

  it('Arquivo recusado na substituição: a planta continua com o desenho de antes', async () => {
    const planta = await cadastrar('Com PDF');
    const r = await substituir(planta, Buffer.from('%PDF-1.7 binário'));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.arquivo).toBe('Envie o desenho em DXF ou o modelo da planta em JSON.');
    expect(await rotulosDoModelo(planta)).toEqual([{ texto: 'WC M', x: 10.5, z: 20.25 }]);
    expect(await auditoriaDaRequisicao(api, org, r)).toEqual([]);
  });

  it('Planta que falhou, corrigida: passa a ativa; a inativa continua inativa', async () => {
    const falhou = await cadastrar('Anexo');
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(plantas)
        .set({ situacao: 'falhou', erro: 'DXF sem linhas.' })
        .where(eq(plantas.id, falhou)),
    );
    const corrigida = await substituir(falhou, modeloDoPmg(60, 40));
    expect(corrigida.statusCode, corrigida.body).toBe(200);
    expect(corrigida.json().planta).toMatchObject({
      situacao: 'ativa',
      erro: null,
      largura: 60,
      profundidade: 40,
    });

    const inativa = await cadastrar('Galpão fechado');
    await cliente.enviar('PATCH', `/mapa/plantas/${inativa}`, ana(), { situacao: 'inativa' });
    const trocada = await substituir(inativa, modeloDoPmg(60, 40));
    expect(trocada.json().planta.situacao).toBe('inativa');
  });

  it('Posições fora do desenho novo: a resposta diz quantas são, e elas continuam', async () => {
    const planta = await cadastrar('Encolhida');
    await posicionar(planta, impressoras[0] as string, 100, 70);
    await posicionar(planta, impressoras[1] as string, 30, 20);
    const r = await substituir(planta, modeloDoPmg(60, 40));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().posicoesFora).toBe(1);
    expect(await posicoesDa(planta)).toHaveLength(2);
    const registros = await auditoriaDaRequisicao(api, org, r);
    expect(registros[0]?.depois).toMatchObject({ largura: 60, profundidade: 40, posicoesFora: 1 });
  });

  it('quem só vê o mapa não substitui, e a planta que não existe responde 404', async () => {
    const planta = await cadastrar('Só para ver');
    expect((await substituir(planta, modeloDoPmg(60, 40), bruno())).statusCode).toBe(403);
    const semPlanta = await substituir('0199d3a0-0000-7000-8000-00000000dead', modeloDoPmg());
    expect(semPlanta.statusCode).toBe(404);
  });

  // O navegador guarda o modelo, que é grande, e confere com o servidor se ele mudou: o desenho
  // substituído chega na leitura seguinte, sem esperar a validade do que estava guardado.
  it('o modelo relido depois da troca vem novo, e o mesmo desenho responde 304', async () => {
    const planta = await cadastrar('Com etiqueta');
    const primeira = await cliente.consultar(`/mapa/plantas/${planta}/modelo`, ana());
    expect(primeira.headers['cache-control']).toBe('private, no-cache');
    const etiqueta = String(primeira.headers.etag);
    expect(etiqueta).toMatch(/^W\/".+"$/);
    const mesma = await api.app.inject({
      method: 'GET',
      url: `/mapa/plantas/${planta}/modelo`,
      headers: { host, cookie: ana().cookie, 'if-none-match': etiqueta },
    });
    expect(mesma.statusCode).toBe(304);
    expect(mesma.body).toBe('');

    api.relogio.avancar(60_000);
    await substituir(planta, modeloDoPmg(60, 40));
    const depois = await api.app.inject({
      method: 'GET',
      url: `/mapa/plantas/${planta}/modelo`,
      headers: { host, cookie: ana().cookie, 'if-none-match': etiqueta },
    });
    expect(depois.statusCode).toBe(200);
    expect(depois.json().largura).toBe(60);
    expect(depois.headers.etag).not.toBe(etiqueta);
  });
});

// A confirmação da exclusão diz quantas posições saem (spec mapa-da-planta, "Exclusão da planta"):
// a lista traz a contagem de cada planta para quem edita o mapa.
describe('as posições de cada planta na lista', () => {
  it('quem edita vê quantas posições a planta tem; quem só vê o mapa, não', async () => {
    const planta = await cadastrar('Com posições');
    await posicionar(planta, impressoras[0] as string, 10, 20);
    await posicionar(planta, impressoras[1] as string, 30, 40);
    const vazia = await cadastrar('Sem posições');
    type Linha = { id: string; posicoes: number | null };
    const daAna = (await cliente.consultar('/mapa/plantas', ana())).json().plantas as Linha[];
    expect(daAna.find(({ id }) => id === planta)?.posicoes).toBe(2);
    expect(daAna.find(({ id }) => id === vazia)?.posicoes).toBe(0);
    const doBruno = (await cliente.consultar('/mapa/plantas', bruno())).json().plantas as Linha[];
    expect(doBruno.find(({ id }) => id === planta)?.posicoes).toBeNull();
  });
});
