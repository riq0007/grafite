// O mapa da planta pela API (spec mapa-da-planta; change p7-mapa-da-planta, design, decisões 1 a
// 4): a planta do PMG importada, o formato recusado, a impressora posicionada, quem só vê, a
// impressora offline no mapa e quem não tem a permissão.
import { ativos, estadoDosAtivos, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';
import { criarColetor } from '../coleta/coletores.ts';

const host = 'grafite.mapa.local';
let api: ApiDeTeste;
let org = '';
let impressora = '';
let coletor = '';
const entradas: Record<string, Entrada> = {};
let cliente: ReturnType<typeof clienteDaApi>;
let planta = '';

const PMG = {
  id: 'planta-exemplo',
  width: 120,
  depth: 80,
  layers: [
    { name: 'PAREDES', segments: [0, 0, 120, 0, 120, 0, 120, 80] },
    { name: 'PORTAS', segments: [10, 10, 12, 10] },
  ],
  walls: [],
  labels: [{ text: 'WC M', x: 10.5, z: 20.25 }],
  machines: [{ name: 'Máquina 1', x: 60.5, z: 40.25, width: 2.4, depth: 2.4, height: 2 }],
};

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
  for (const usuario of ['ana', 'bruno', 'carla']) {
    const conta = await criarConta(api, org, { usuario });
    if (usuario === 'ana') await atribuir(api, org, { perfilId: edita, contaId: conta.id });
    if (usuario === 'bruno') await atribuir(api, org, { perfilId: ve, contaId: conta.id });
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
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId: tipo?.id ?? '',
        busca: '',
        nome: 'Impressora da expedição',
        patrimonio: 'PAT-00412',
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    impressora = linha?.id ?? '';
    const criado = await criarColetor(tx, {
      nome: 'Coletor',
      faixas: ['10.0.0.0/8'],
      token: `token-do-mapa-${'x'.repeat(40)}`,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    });
    coletor = criado.id;
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('as plantas', () => {
  it('Planta do PMG importada, e o Formato recusado', async () => {
    const r = await cliente.enviarBytes(
      'POST',
      `/mapa/plantas?nome=${encodeURIComponent('Jundiaí')}&fonte=planta-exemplo.json`,
      entradas.ana as Entrada,
      Buffer.from(JSON.stringify(PMG)),
    );
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      nome: 'Jundiaí',
      largura: 120,
      profundidade: 80,
      situacao: 'ativa',
      contagens: { segmentos: 3, rotulos: 1, camadas: 2, maquinas: 1 },
    });
    planta = r.json().id;
    const modelo = await cliente.consultar(
      `/mapa/plantas/${planta}/modelo`,
      entradas.bruno as Entrada,
    );
    expect(modelo.statusCode).toBe(200);
    expect(modelo.json().rotulos).toEqual([{ texto: 'WC M', x: 10.5, z: 20.25 }]);
    const pdf = await cliente.enviarBytes(
      'POST',
      '/mapa/plantas?nome=PDF',
      entradas.ana as Entrada,
      Buffer.from('%PDF-1.7 binário'),
    );
    expect(pdf.statusCode).toBe(400);
    expect(pdf.json().campos.arquivo).toBe('Envie o desenho em DXF ou o modelo da planta em JSON.');
  });
});

describe('as posições e os marcadores', () => {
  it('Impressora posicionada, e Quem só vê o mapa', async () => {
    const r = await cliente.enviar(
      'PUT',
      `/mapa/plantas/${planta}/posicoes`,
      entradas.ana as Entrada,
      {
        alvo: { tipo: 'ativo', id: impressora },
        x: 70,
        z: 90,
      },
    );
    expect(r.statusCode, r.body).toBe(204);
    const marcadores = await cliente.consultar(
      `/mapa/plantas/${planta}/marcadores`,
      entradas.bruno as Entrada,
    );
    expect(marcadores.json()).toMatchObject({
      camadas: ['Ativos'],
      // O que a conta posiciona, quem edita o mapa: o tipo do alvo de cada camada que ela vê.
      posicionaveis: [{ tipo: 'ativo', camada: 'Ativos' }],
      podeEditar: false,
      marcadores: [
        {
          alvo: { tipo: 'ativo', id: impressora },
          camada: 'Ativos',
          rotulo: 'Impressora da expedição',
          detalhe: 'PAT-00412',
          x: 70,
          z: 90,
          situacao: { texto: 'Sem coleta', tom: 'neutra' },
          acoes: [{ rotulo: 'Abrir ficha', destino: `/ativos/${impressora}` }],
        },
      ],
    });
    const deBruno = await cliente.enviar(
      'PUT',
      `/mapa/plantas/${planta}/posicoes`,
      entradas.bruno as Entrada,
      {
        alvo: { tipo: 'ativo', id: impressora },
        x: 1,
        z: 1,
      },
    );
    expect(deBruno.statusCode).toBe(403);
  });

  it('Impressora offline no mapa', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(estadoDosAtivos).values({
        orgId: org,
        ativoId: impressora,
        metrica: 'rede.disponibilidade',
        momento: api.relogio.agora(),
        valorTexto: 'offline',
        situacao: 'valida',
        desde: api.relogio.agora(),
        coletorId: coletor,
      } as typeof estadoDosAtivos.$inferInsert),
    );
    const marcadores = await cliente.consultar(
      `/mapa/plantas/${planta}/marcadores`,
      entradas.bruno as Entrada,
    );
    expect(marcadores.json().marcadores[0].situacao).toEqual({ texto: 'Offline', tom: 'critico' });
  });

  it('Sem permissão: 403, e tirar do mapa apaga só a posição', async () => {
    const r = await cliente.consultar(
      `/mapa/plantas/${planta}/marcadores`,
      entradas.carla as Entrada,
    );
    expect(r.statusCode).toBe(403);
    const tirada = await cliente.enviar(
      'DELETE',
      `/mapa/plantas/${planta}/posicoes/ativo/${impressora}`,
      entradas.ana as Entrada,
    );
    expect(tirada.statusCode).toBe(204);
    const marcadores = await cliente.consultar(
      `/mapa/plantas/${planta}/marcadores`,
      entradas.ana as Entrada,
    );
    expect(marcadores.json().marcadores).toEqual([]);
  });
});
