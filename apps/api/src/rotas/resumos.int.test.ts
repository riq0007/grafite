// O resumo de cada registro, para o cartão da referência (spec componentes-base, "Referência com
// cartão"; change relacoes-vivas, design, decisão 1): a pessoa, o local, o modelo, o tipo e o ativo,
// com as contagens no escopo de quem vê e `recortada` quando o escopo recorta o total, sem dizer o
// total. Os ativos contados são os ativos, sem os inativos, e as pessoas, as ativas.
import {
  ativos,
  ligacoesDeAtivos,
  modelos,
  naOrganizacao,
  organizacoes,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.resumos.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const id = (nome: string) => ids[nome] ?? '';
const resumo = (caminho: string, usuario = 'ana') => cliente.consultar(caminho, como(usuario));

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);

  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: id('jundiai') });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });

  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['pessoas.ver', 'ativos.ver'],
  });
  const ver = await criarPerfil(api, org, {
    nome: 'Ver em Jundiaí',
    permissoes: ['pessoas.ver', 'ativos.ver'],
  });
  const soAtivos = await criarPerfil(api, org, { nome: 'Só ativos', permissoes: ['ativos.ver'] });
  const soPessoas = await criarPerfil(api, org, {
    nome: 'Só pessoas',
    permissoes: ['pessoas.ver'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: tudo, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: ver, contaId: bruno.id, localId: id('jundiai') });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: soAtivos, contaId: carla.id });
  const dora = await criarConta(api, org, { usuario: 'dora', nome: 'Dora Reis' });
  await atribuir(api, org, { perfilId: soPessoas, contaId: dora.id });
  for (const usuario of ['ana', 'bruno', 'carla', 'dora']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }

  ids.maria = await criarPessoa(api, org, { nome: 'Maria Souza', localId: id('expedicao') });
  ids.joao = await criarPessoa(api, org, { nome: 'João Lima', localId: id('campinas') });

  await naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Impressora',
        nomeNormalizado: 'impressora',
        icone: 'impressora',
      })
      .returning({ id: tiposDeAtivo.id });
    ids.impressora = tipo?.id ?? '';
    const [modelo] = await tx
      .insert(modelos)
      .values({
        orgId: org,
        tipoId: id('impressora'),
        fabricante: 'HP',
        fabricanteNormalizado: 'hp',
        nome: 'LaserJet M404',
        nomeNormalizado: 'laserjet m404',
        busca: 'hp laserjet m404',
      })
      .returning({ id: modelos.id });
    ids.m404 = modelo?.id ?? '';
    const ativo = async (nome: string, colunas: Partial<typeof ativos.$inferInsert>) => {
      const [criado] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: id('impressora'),
          busca: normalizarTexto(nome),
          ...colunas,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      ids[nome] = criado?.id ?? '';
    };
    await ativo('almox', {
      modeloId: id('m404'),
      patrimonio: 'PAT-00412',
      patrimonioNormalizado: 'pat-00412',
      localId: id('expedicao'),
      responsavelId: id('maria'),
    });
    await ativo('recepcao', {
      modeloId: id('m404'),
      localId: id('campinas'),
      responsavelId: id('maria'),
    });
    await ativo('matriz', { nome: 'Matriz', localId: id('jundiai'), responsavelId: id('joao') });
    await ativo('velha', {
      modeloId: id('m404'),
      localId: id('expedicao'),
      responsavelId: id('maria'),
      situacao: 'inativo',
    });
    const [a, b] = [id('almox'), id('matriz')].sort();
    await tx.insert(ligacoesDeAtivos).values({ orgId: org, ativoA: a ?? '', ativoB: b ?? '' });
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('o resumo da pessoa', () => {
  it('o nome, o local de trabalho, a conta e os ativos sob responsabilidade', async () => {
    const r = await resumo(`/pessoas/${id('maria')}/resumo`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      id: id('maria'),
      nome: 'Maria Souza',
      situacao: 'ativa',
      foto: null,
      local: { id: id('expedicao'), caminho: 'Jundiaí › Expedição' },
      temConta: false,
      ativos: { quantos: 2, recortada: false },
    });
  });

  it('a contagem no escopo de quem vê, recortada, sem dizer o total', async () => {
    const r = await resumo(`/pessoas/${id('maria')}/resumo`, 'bruno');
    expect(r.json().ativos).toEqual({ quantos: 1, recortada: true });
  });

  it('sem ver ativos, sem os ativos', async () => {
    const r = await resumo(`/pessoas/${id('maria')}/resumo`, 'dora');
    expect(r.statusCode).toBe(200);
    expect(r.json().ativos).toBeNull();
  });

  it('sem ver a pessoa no local dela, não há resumo', async () => {
    expect((await resumo(`/pessoas/${id('joao')}/resumo`, 'bruno')).statusCode).toBe(403);
    expect((await resumo(`/pessoas/${id('maria')}/resumo`, 'carla')).statusCode).toBe(403);
  });

  it('com o módulo Ativos desligado, sem os ativos', async () => {
    const desligar = (desligados: string[]) =>
      naOrganizacao(api.banco, org, (tx) =>
        tx
          .update(organizacoes)
          .set({ modulosDesligados: desligados })
          .where(eq(organizacoes.id, org)),
      );
    await desligar(['ativos']);
    try {
      expect((await resumo(`/pessoas/${id('maria')}/resumo`)).json().ativos).toBeNull();
      expect((await resumo(`/locais/${id('jundiai')}/resumo`)).json().ativos).toBeNull();
      const { locais } = (await resumo('/locais/contagens')).json();
      expect(locais.every((local: { ativos: unknown }) => local.ativos === null)).toBe(true);
    } finally {
      await desligar([]);
    }
  });
});

describe('o resumo do local', () => {
  it('o caminho, os ativos e as pessoas, aqui e com os de dentro', async () => {
    const r = await resumo(`/locais/${id('jundiai')}/resumo`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      id: id('jundiai'),
      caminho: 'Jundiaí',
      tipo: 'unidade',
      situacao: 'ativo',
      ativos: {
        aqui: { quantos: 1, recortada: false },
        comOsDeDentro: { quantos: 2, recortada: false },
      },
      pessoas: {
        aqui: { quantos: 0, recortada: false },
        comOsDeDentro: { quantos: 1, recortada: false },
      },
    });
  });

  it('fora do escopo, a contagem recortada; sem ver pessoas, sem elas', async () => {
    const deBruno = await resumo(`/locais/${id('campinas')}/resumo`, 'bruno');
    expect(deBruno.json().ativos.aqui).toEqual({ quantos: 0, recortada: true });
    expect(deBruno.json().pessoas.aqui).toEqual({ quantos: 0, recortada: true });
    expect((await resumo(`/locais/${id('campinas')}/resumo`, 'carla')).json().pessoas).toBeNull();
    expect((await resumo(`/locais/${id('campinas')}/resumo`, 'dora')).json()).toMatchObject({
      ativos: null,
      pessoas: { aqui: { quantos: 1, recortada: false } },
    });
  });
});

describe('as contagens dos locais (decisão 6)', () => {
  const doLocal = (lista: { id: string }[], nome: string) =>
    lista.find((local) => local.id === id(nome));

  it('cada local da árvore com os ativos e as pessoas, aqui e com os de dentro', async () => {
    const r = await resumo('/locais/contagens');
    expect(r.statusCode).toBe(200);
    const { locais } = r.json();
    expect(locais).toHaveLength(3);
    expect(doLocal(locais, 'jundiai')).toEqual({
      id: id('jundiai'),
      ativos: {
        aqui: { quantos: 1, recortada: false },
        comOsDeDentro: { quantos: 2, recortada: false },
      },
      pessoas: {
        aqui: { quantos: 0, recortada: false },
        comOsDeDentro: { quantos: 1, recortada: false },
      },
    });
    expect(doLocal(locais, 'expedicao')).toMatchObject({
      ativos: { aqui: { quantos: 1 }, comOsDeDentro: { quantos: 1 } },
      pessoas: { aqui: { quantos: 1 }, comOsDeDentro: { quantos: 1 } },
    });
  });

  it('no escopo de quem vê, com o recorte dito, e sem o que a conta não vê', async () => {
    const deBruno = (await resumo('/locais/contagens', 'bruno')).json().locais;
    expect(doLocal(deBruno, 'campinas')).toEqual({
      id: id('campinas'),
      ativos: {
        aqui: { quantos: 0, recortada: true },
        comOsDeDentro: { quantos: 0, recortada: true },
      },
      pessoas: {
        aqui: { quantos: 0, recortada: true },
        comOsDeDentro: { quantos: 0, recortada: true },
      },
    });
    expect(doLocal(deBruno, 'jundiai')).toMatchObject({
      ativos: { comOsDeDentro: { quantos: 2, recortada: false } },
    });
    const deCarla = (await resumo('/locais/contagens', 'carla')).json().locais;
    expect(doLocal(deCarla, 'jundiai')).toMatchObject({ pessoas: null });
    const deDora = (await resumo('/locais/contagens', 'dora')).json().locais;
    expect(doLocal(deDora, 'jundiai')).toMatchObject({ ativos: null });
  });
});

describe('a referência ao responsável (decisão 2)', () => {
  const verResponsavel = async (usuario: string) => {
    const r = await resumo('/ativos?situacao=todos', usuario);
    return Object.fromEntries(
      r
        .json()
        .itens.map((item: { id: string; permite: { verResponsavel: boolean } }) => [
          item.id,
          item.permite.verResponsavel,
        ]),
    );
  };

  it('a lista e a ficha dizem se a conta vê a pessoa responsável, no local de trabalho dela', async () => {
    expect(await verResponsavel('ana')).toMatchObject({
      [id('almox')]: true,
      [id('matriz')]: true,
    });
    // Bruno vê pessoas só em Jundiaí: Maria, da Expedição, sim; João, de Campinas, não.
    expect(await verResponsavel('bruno')).toMatchObject({
      [id('almox')]: true,
      [id('matriz')]: false,
    });
    expect(await verResponsavel('carla')).toMatchObject({ [id('almox')]: false });
    const ficha = await resumo(`/ativos/${id('matriz')}`, 'bruno');
    expect(ficha.json().permite.verResponsavel).toBe(false);
    expect(ficha.json().responsavel).toEqual({ id: id('joao'), nome: 'João Lima' });
  });
});

describe('o local sem os de dentro (decisão 3)', () => {
  const rotulos = async (operador: string) => {
    const filtros = JSON.stringify([{ chave: 'ativo.local', operador, local: id('jundiai') }]);
    const r = await resumo(`/ativos?filtros=${encodeURIComponent(filtros)}&ordem=ativo.rotulo`);
    expect(r.statusCode).toBe(200);
    return r.json().itens.map((item: { rotulo: string }) => item.rotulo);
  };

  it('o operador igual traz só os ativos do próprio local; o em, os de dentro também', async () => {
    expect(await rotulos('igual')).toEqual(['Matriz']);
    expect(await rotulos('em')).toEqual(['HP LaserJet M404', 'Matriz']);
  });
});

describe('o resumo do modelo, o do tipo e o do ativo', () => {
  it('o modelo com o tipo e os ativos ativos dele, no escopo de quem vê', async () => {
    const r = await resumo(`/modelos/${id('m404')}/resumo`);
    expect(r.json()).toEqual({
      id: id('m404'),
      fabricante: 'HP',
      nome: 'LaserJet M404',
      imagem: null,
      situacao: 'ativo',
      tipo: { id: id('impressora'), nome: 'Impressora', icone: 'impressora' },
      ativos: { quantos: 2, recortada: false },
    });
    expect((await resumo(`/modelos/${id('m404')}/resumo`, 'bruno')).json().ativos).toEqual({
      quantos: 1,
      recortada: true,
    });
    expect((await resumo(`/modelos/${id('m404')}/resumo`, 'dora')).json().ativos).toBeNull();
  });

  it('o tipo com o ícone, a situação e os ativos ativos dele, no escopo de quem vê', async () => {
    const r = await resumo(`/tipos-de-ativo/${id('impressora')}/resumo`);
    expect(r.json()).toEqual({
      id: id('impressora'),
      nome: 'Impressora',
      icone: 'impressora',
      situacao: 'ativo',
      ativos: { quantos: 3, recortada: false },
    });
    const deBruno = await resumo(`/tipos-de-ativo/${id('impressora')}/resumo`, 'bruno');
    expect(deBruno.json().ativos).toEqual({ quantos: 2, recortada: true });
  });

  it('o ativo com o tipo, o patrimônio, o local, a situação e os ligados', async () => {
    const r = await resumo(`/ativos/${id('almox')}/resumo`);
    expect(r.json()).toEqual({
      id: id('almox'),
      rotulo: 'HP LaserJet M404',
      tipo: { id: id('impressora'), nome: 'Impressora', icone: 'impressora' },
      modelo: { id: id('m404'), fabricante: 'HP', nome: 'LaserJet M404', imagem: null },
      imagem: null,
      patrimonio: 'PAT-00412',
      local: { id: id('expedicao'), caminho: 'Jundiaí › Expedição' },
      responsavel: { id: id('maria'), nome: 'Maria Souza' },
      situacao: 'ativo',
      uso: 'em-uso',
      ligados: 1,
    });
    expect((await resumo(`/ativos/${id('recepcao')}/resumo`, 'bruno')).statusCode).toBe(403);
    expect((await resumo(`/ativos/${id('almox')}/resumo`, 'dora')).statusCode).toBe(403);
  });
});
