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
