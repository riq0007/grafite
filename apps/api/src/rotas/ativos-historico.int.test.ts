// O histórico do ativo pela API (spec cadastro-de-ativos, "Histórico do ativo"; design do P1d,
// decisão 6): os registros da auditoria do ativo, do mais novo para o mais antigo, para quem vê o
// ativo, com quem fez pelo nome atual, as mudanças campo a campo e as travas; os restritos escondidos
// de quem não os vê, nos registros novos, pela lista que a gravação guarda, e nos antigos, pelos
// rótulos restritos de hoje e pelos antigos deles; as ligações com o outro ativo; e o nome do ativo
// no alvo da consulta da auditoria.
import { auditoria, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { imagemDeTeste } from '../../test/imagens.ts';
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
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.ativos-historico.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const editar = (ativoId: string, pedido: object) =>
  cliente.enviar('PATCH', `/ativos/${ativoId}`, como('ana'), pedido);

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.almoxarifado = await criarLocal(api, org, { nome: 'Almoxarifado', paiId: id('jundiai') });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: id('jundiai') });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['ativos.editar', 'ativos.restritos', 'catalogo.administrar', 'auditoria.ver'],
  });
  const ver = await criarPerfil(api, org, { nome: 'Ver', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ids.contaDaAna = ana.id;
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: ver, contaId: bruno.id, localId: id('jundiai') });
  await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  for (const usuario of ['ana', 'bruno', 'carla'])
    entradas[usuario] = await cliente.entrar(usuario);

  // O campo restrito nasce como "Custo" e é renomeado: a auditoria do catálogo guarda o rótulo antigo.
  const custo = await cliente.enviar('POST', '/campos', como('ana'), {
    rotulo: 'Custo',
    tipo: 'moeda',
    restrito: true,
  });
  ids.custo = custo.json().id;
  await cliente.enviar('PATCH', `/campos/${id('custo')}`, como('ana'), {
    rotulo: 'Custo do contrato',
  });
  const tipo = await cliente.enviar('POST', '/tipos-de-ativo', como('ana'), {
    nome: 'Impressora',
    icone: 'impressora',
    campos: [{ campoId: id('custo'), obrigatorio: false }],
  });
  const cadastrar = async (valores: object) =>
    (
      await cliente.enviar('POST', '/ativos', como('ana'), { tipoId: tipo.json().id, valores })
    ).json().id as string;
  ids.impressora = await cadastrar({
    'ativo.nome': 'Impressora da expedição',
    'ativo.patrimonio': 'PAT-00412',
    'ativo.local': id('almoxarifado'),
  });
  ids.deCampinas = await cadastrar({
    'ativo.nome': 'Impressora de Campinas',
    'ativo.local': id('campinas'),
  });
});

afterAll(async () => {
  await api?.fechar();
});

interface ItemDoHistorico {
  acao: string;
  rotulo: string;
  quem: string;
  momento: string;
  mudancas: { campo: string; antes: string | null; depois: string | null }[];
  travas: { ligadas: string[]; desligadas: string[] };
  outro: { id: string | null; rotulo: string } | null;
}

async function historico(ativoId: string, usuario: string, consulta = '') {
  const r = await cliente.consultar(`/ativos/${ativoId}/historico${consulta}`, como(usuario));
  expect(r.statusCode).toBe(200);
  return r.json() as { itens: ItemDoHistorico[]; proximo: string | null };
}

const mudancasDo = (item: ItemDoHistorico | undefined) =>
  item?.mudancas.map((mudanca) => mudanca.campo);

describe('histórico do ativo', () => {
  it('do mais novo para o mais antigo, com quem fez, o momento e cada campo que mudou', async () => {
    await editar(id('impressora'), { valores: { 'ativo.local': id('expedicao') } });
    const { itens } = await historico(id('impressora'), 'bruno');
    expect(itens[0]).toMatchObject({
      acao: 'ativo.alterado',
      rotulo: 'Ativo alterado',
      quem: 'Ana Souza',
      momento: '2026-10-02T12:00:00.000Z',
      mudancas: [
        { campo: 'Local', antes: 'Jundiaí › Almoxarifado', depois: 'Jundiaí › Expedição' },
      ],
      travas: { ligadas: [], desligadas: [] },
      outro: null,
    });
    expect(itens.at(-1)).toMatchObject({ acao: 'ativo.criado', rotulo: 'Ativo cadastrado' });
    expect(mudancasDo(itens.at(-1))).toEqual(
      expect.arrayContaining(['Nome', 'Patrimônio', 'Local']),
    );
  });

  it('a gravação guarda os rótulos restritos da visão', async () => {
    const r = await editar(id('impressora'), {
      valores: { [id('custo')]: 'R$ 1.000,00', 'ativo.hostname': 'IMP-01' },
    });
    expect(await auditoriaDaRequisicao(api, org, r)).toMatchObject([
      { depois: { restritos: ['Custo do contrato'] } },
    ]);
  });

  it('sem os restritos, a mudança restrita sai do registro', async () => {
    const [deAna] = (await historico(id('impressora'), 'ana')).itens;
    expect(mudancasDo(deAna)).toEqual(['Hostname', 'Custo do contrato']);
    const [deBruno] = (await historico(id('impressora'), 'bruno')).itens;
    expect(mudancasDo(deBruno)).toEqual(['Hostname']);
  });

  it('o registro que só mudou restritos sai do histórico de quem não os vê', async () => {
    await editar(id('impressora'), { valores: { [id('custo')]: 'R$ 1.200,00' } });
    await editar(id('impressora'), { travas: { [id('custo')]: true } });
    const deAna = (await historico(id('impressora'), 'ana')).itens;
    expect(deAna[0]?.travas).toEqual({ ligadas: ['Custo do contrato'], desligadas: [] });
    expect(deAna[1]?.mudancas).toEqual([
      { campo: 'Custo do contrato', antes: 'R$ 1.000,00', depois: 'R$ 1.200,00' },
    ]);
    const deBruno = (await historico(id('impressora'), 'bruno')).itens;
    expect(deBruno).toHaveLength(deAna.length - 2);
    expect(mudancasDo(deBruno[0])).toEqual(['Hostname']);
  });

  it('nos registros antigos, sem a lista, valem os rótulos restritos de hoje e os antigos', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(auditoria).values({
        orgId: org,
        momento: new Date('2026-09-01T12:00:00.000Z'),
        acao: 'ativo.alterado',
        atorTipo: 'conta',
        atorContaId: id('contaDaAna'),
        alvoTipo: 'ativo',
        alvoId: id('impressora'),
        antes: { tipo: 'Impressora', situacao: 'ativo', campos: { Custo: 'R$ 1,00' } },
        depois: {
          tipo: 'Impressora',
          situacao: 'ativo',
          campos: { Custo: 'R$ 2,00', 'Custo do contrato': 'R$ 3,00', 'Número de série': 'X1' },
        },
      }),
    );
    const deBruno = (await historico(id('impressora'), 'bruno')).itens;
    expect(mudancasDo(deBruno.at(-1))).toEqual(['Número de série']);
    const deAna = (await historico(id('impressora'), 'ana')).itens;
    expect(mudancasDo(deAna.at(-1))).toEqual(['Custo', 'Custo do contrato', 'Número de série']);
  });

  it('as ligações mostram o outro ativo pelo nome atual, ou fora do acesso', async () => {
    const ligacao = await cliente.enviar(
      'POST',
      `/ativos/${id('impressora')}/ligacoes`,
      como('ana'),
      { outroId: id('deCampinas') },
    );
    expect(ligacao.statusCode).toBe(201);
    await editar(id('deCampinas'), { valores: { 'ativo.nome': 'Impressora do galpão' } });
    const [deAna] = (await historico(id('impressora'), 'ana')).itens;
    expect(deAna).toMatchObject({
      acao: 'ativo.ligado',
      rotulo: 'Ligação feita',
      mudancas: [],
      outro: { id: ids.deCampinas, rotulo: 'Impressora do galpão' },
    });
    const [deBruno] = (await historico(id('impressora'), 'bruno')).itens;
    expect(deBruno?.outro).toEqual({ id: null, rotulo: 'Ativo fora do seu acesso' });
  });

  it('a troca da imagem do ativo entra no histórico', async () => {
    await cliente.enviarBytes(
      'PUT',
      `/ativos/${id('impressora')}/imagem`,
      como('ana'),
      await imagemDeTeste(64, 64).png().toBuffer(),
    );
    const [item] = (await historico(id('impressora'), 'bruno')).itens;
    expect(item).toMatchObject({ acao: 'imagem-do-ativo.trocada', mudancas: [], outro: null });
  });

  it('vem em páginas pelo cursor, e a página pode vir menor que o limite', async () => {
    const inteiro = (await historico(id('impressora'), 'bruno')).itens;
    const juntos: ItemDoHistorico[] = [];
    let consulta = '?limite=1';
    let menores = 0;
    for (let pagina = 0; pagina < 50; pagina += 1) {
      const { itens, proximo } = await historico(id('impressora'), 'bruno', consulta);
      juntos.push(...itens);
      if (itens.length === 0) menores += 1;
      if (!proximo) break;
      consulta = `?limite=1&cursor=${encodeURIComponent(proximo)}`;
    }
    expect(juntos).toEqual(inteiro);
    expect(menores).toBeGreaterThan(0);
  });

  it('pede ativos.ver no local do ativo, sem precisar de auditoria.ver', async () => {
    expect(
      (await cliente.consultar(`/ativos/${id('impressora')}/historico`, como('carla'))).statusCode,
    ).toBe(403);
    expect(
      (await cliente.consultar(`/ativos/${id('deCampinas')}/historico`, como('bruno'))).statusCode,
    ).toBe(403);
    expect(
      (
        await cliente.consultar(
          '/ativos/0199a6e0-0000-7000-8000-000000000999/historico',
          como('ana'),
        )
      ).statusCode,
    ).toBe(404);
  });
});

describe('o ativo na consulta da auditoria', () => {
  it('o alvo ativo vem com o nome atual dele', async () => {
    const r = await cliente.consultar(`/auditoria?alvo=ativo:${id('deCampinas')}`, como('ana'));
    expect(r.statusCode).toBe(200);
    expect(r.json().itens[0].alvo).toEqual({
      tipo: 'ativo',
      id: ids.deCampinas,
      nome: 'Impressora do galpão',
      usuario: null,
    });
  });
});
