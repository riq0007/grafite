// As sugestões dos campos Ativo e Local pela pessoa do chamado (spec tipos-de-chamado, "Campos do
// formulário"; change chamados-da-ti, tarefa 4.8): os ativos sob a responsabilidade dela, depois os
// do local de trabalho dela, só os ativos que quem abre vê, e o local de trabalho dela.
import { ativos, naOrganizacao } from '@grafite/db';
import { rotuloDoAtivo } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo, criarModelo, criarTipo, desligarModulos } from '../../test/alertas.ts';
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

const host = 'grafite.chamados-sugestoes.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};

const id = (chave: string) => ids[chave] ?? '';
const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;

const sugestoes = (usuario: string, consulta: string) =>
  cliente.consultar(`/chamados/sugestoes?${consulta}`, como(usuario));

/** As mesmas sugestões, pela rota da prévia do colaborador, de quem configura. */
const sugestoesDaPrevia = (usuario: string, consulta: string) =>
  cliente.consultar(`/chamados/tipos/sugestoes?${consulta}`, como(usuario));

const LASERJET = rotuloDoAtivo({
  nome: null,
  modelo: { fabricante: 'HP', nome: 'LaserJet M404' },
  tipo: { nome: 'Impressora' },
});

/** O ativo como a sugestão o traz. */
const sugerido = (
  chave: string,
  patrimonio: string,
  motivo: 'responsavel' | 'local',
  { rotulo = LASERJET, tipo = 'impressora' }: { rotulo?: string; tipo?: string } = {},
) => ({ id: id(chave), rotulo, patrimonio, tipoId: id(tipo), motivo });

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.financeiro = await criarLocal(api, org, { nome: 'Financeiro', paiId: id('jundiai') });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  ids.sorocaba = await criarLocal(api, org, {
    nome: 'Sorocaba',
    tipo: 'unidade',
    situacao: 'inativo',
  });

  // As pessoas: Fernanda, do Financeiro; Rita, sem local; Otávio, de Sorocaba, que está inativa; e
  // Igor, do Almoxarifado, que tem muitos ativos.
  ids.fernanda = await criarPessoa(api, org, { nome: 'Fernanda Rocha', localId: id('financeiro') });
  ids.rita = await criarPessoa(api, org, { nome: 'Rita Moraes' });
  ids.otavio = await criarPessoa(api, org, { nome: 'Otávio Nunes', localId: id('sorocaba') });
  ids.almoxarifado = await criarLocal(api, org, { nome: 'Almoxarifado', paiId: id('jundiai') });
  ids.igor = await criarPessoa(api, org, { nome: 'Igor Lima', localId: id('almoxarifado') });

  ids.impressora = await criarTipo(api, org, { nome: 'Impressora' });
  ids.computador = await criarTipo(api, org, { nome: 'Computador' });
  const laserjet = await criarModelo(api, org, {
    tipoId: id('impressora'),
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  const ativo = async (
    chave: string,
    {
      patrimonio,
      localId,
      responsavel = null,
      computador = false,
      situacao = 'ativo',
    }: {
      patrimonio: string;
      localId: string | null;
      responsavel?: string | null;
      computador?: boolean;
      situacao?: 'ativo' | 'inativo';
    },
  ) => {
    ids[chave] = await criarAtivoDoTipo(api, org, {
      tipoId: id(computador ? 'computador' : 'impressora'),
      patrimonio,
      localId,
      situacao,
      ...(computador ? { nome: `Notebook ${patrimonio}` } : { modeloId: laserjet }),
    });
    if (responsavel) {
      await naOrganizacao(api.banco, org, (tx) =>
        tx
          .update(ativos)
          .set({ responsavelId: responsavel })
          .where(eq(ativos.id, id(chave))),
      );
    }
  };
  // Sob a responsabilidade de Fernanda: o notebook e uma impressora do Financeiro, a impressora
  // que foi para Campinas e a que está sem local.
  await ativo('nb231', {
    patrimonio: 'NB-0231',
    localId: id('financeiro'),
    responsavel: id('fernanda'),
    computador: true,
  });
  await ativo('pat150', {
    patrimonio: 'PAT-00150',
    localId: id('financeiro'),
    responsavel: id('fernanda'),
  });
  await ativo('pat300', {
    patrimonio: 'PAT-00300',
    localId: id('campinas'),
    responsavel: id('fernanda'),
  });
  await ativo('pat400', { patrimonio: 'PAT-00400', localId: null, responsavel: id('fernanda') });
  await ativo('pat410', {
    patrimonio: 'PAT-00410',
    localId: id('financeiro'),
    responsavel: id('fernanda'),
    situacao: 'inativo',
  });
  // No Financeiro, sem ser dela: uma impressora, um computador e uma impressora inativa.
  await ativo('pat137', { patrimonio: 'PAT-00137', localId: id('financeiro') });
  await ativo('pat170', { patrimonio: 'PAT-00170', localId: id('financeiro'), computador: true });
  await ativo('pat160', {
    patrimonio: 'PAT-00160',
    localId: id('financeiro'),
    situacao: 'inativo',
  });
  // Em Jundiaí, fora do Financeiro, e em Sorocaba.
  await ativo('pat100', { patrimonio: 'PAT-00100', localId: id('jundiai') });
  await ativo('pat500', { patrimonio: 'PAT-00500', localId: id('sorocaba') });
  // Os do Almoxarifado, mais do que o limite, e um de Igor em Campinas.
  for (let n = 1; n <= 12; n += 1) {
    await ativo(`alm${n}`, {
      patrimonio: `ALM-${String(n).padStart(3, '0')}`,
      localId: id('almoxarifado'),
    });
  }
  await ativo('pat320', {
    patrimonio: 'PAT-00320',
    localId: id('campinas'),
    responsavel: id('igor'),
  });
  // Júlia, de Campinas, responde pelos 12 do Almoxarifado.
  ids.julia = await criarPessoa(api, org, { nome: 'Júlia Prado', localId: id('campinas') });
  await naOrganizacao(api.banco, org, (tx) =>
    tx
      .update(ativos)
      .set({ responsavelId: id('julia') })
      .where(eq(ativos.localId, id('almoxarifado'))),
  );

  // Ana atende e vê os ativos na organização; Diego atende e vê os ativos de Jundiaí; Heitor atende
  // Jundiaí sem ver os ativos; Carla só vê os chamados; Lívia configura os chamados e vê os ativos
  // na organização, sem atender.
  cliente = clienteDaApi(api, host);
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  const veOsAtivos = await criarPerfil(api, org, {
    nome: 'Vê os ativos',
    permissoes: ['ativos.ver'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Vê os chamados', permissoes: ['chamados.ver'] });
  const configura = await criarPerfil(api, org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const contas = {
    ana: (await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' })).id,
    diego: (await criarConta(api, org, { usuario: 'diego', nome: 'Diego Ramos' })).id,
    heitor: (await criarConta(api, org, { usuario: 'heitor', nome: 'Heitor Alves' })).id,
    carla: (await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' })).id,
    livia: (await criarConta(api, org, { usuario: 'livia', nome: 'Lívia Prates' })).id,
  };
  await atribuir(api, org, { perfilId: atende, contaId: contas.ana });
  await atribuir(api, org, { perfilId: veOsAtivos, contaId: contas.ana });
  await atribuir(api, org, { perfilId: atende, contaId: contas.diego, localId: id('jundiai') });
  await atribuir(api, org, { perfilId: veOsAtivos, contaId: contas.diego, localId: id('jundiai') });
  await atribuir(api, org, { perfilId: atende, contaId: contas.heitor, localId: id('jundiai') });
  await atribuir(api, org, { perfilId: ve, contaId: contas.carla });
  await atribuir(api, org, { perfilId: configura, contaId: contas.livia });
  await atribuir(api, org, { perfilId: veOsAtivos, contaId: contas.livia });
  for (const usuario of Object.keys(contas)) entradas[usuario] = await cliente.entrar(usuario);
});

describe('as sugestões da pessoa', () => {
  it('os ativos sob a responsabilidade dela primeiro, depois os do local de trabalho, e o local', async () => {
    const r = await sugestoes('ana', `pessoa=${id('fernanda')}`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      local: { id: id('financeiro'), nome: 'Jundiaí › Financeiro' },
      // Pelo patrimônio, em cada grupo; sem os inativos, sem repetir a impressora dela que está no
      // Financeiro, e sem os de Jundiaí fora do Financeiro.
      ativos: [
        sugerido('nb231', 'NB-0231', 'responsavel', {
          rotulo: 'Notebook NB-0231',
          tipo: 'computador',
        }),
        sugerido('pat150', 'PAT-00150', 'responsavel'),
        sugerido('pat300', 'PAT-00300', 'responsavel'),
        sugerido('pat400', 'PAT-00400', 'responsavel'),
        sugerido('pat137', 'PAT-00137', 'local'),
        sugerido('pat170', 'PAT-00170', 'local', {
          rotulo: 'Notebook PAT-00170',
          tipo: 'computador',
        }),
      ],
    });
  });

  it('os tipos de ativo do campo filtram as sugestões', async () => {
    const r = await sugestoes('ana', `pessoa=${id('fernanda')}&tipos=${id('impressora')}`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().ativos.map(({ patrimonio }: { patrimonio: string }) => patrimonio)).toEqual([
      'PAT-00150',
      'PAT-00300',
      'PAT-00400',
      'PAT-00137',
    ]);

    const dosDois = await sugestoes(
      'ana',
      `pessoa=${id('fernanda')}&tipos=${id('impressora')},${id('computador')}`,
    );
    expect(dosDois.json().ativos).toHaveLength(6);
  });

  it('só os ativos que quem abre vê', async () => {
    // Diego vê os ativos de Jundiaí: nem a impressora de Campinas, nem a sem local.
    const deDiego = await sugestoes('diego', `pessoa=${id('fernanda')}`);
    expect(deDiego.statusCode, deDiego.body).toBe(200);
    expect(deDiego.json()).toEqual({
      local: { id: id('financeiro'), nome: 'Jundiaí › Financeiro' },
      ativos: [
        sugerido('nb231', 'NB-0231', 'responsavel', {
          rotulo: 'Notebook NB-0231',
          tipo: 'computador',
        }),
        sugerido('pat150', 'PAT-00150', 'responsavel'),
        sugerido('pat137', 'PAT-00137', 'local'),
        sugerido('pat170', 'PAT-00170', 'local', {
          rotulo: 'Notebook PAT-00170',
          tipo: 'computador',
        }),
      ],
    });

    // Heitor não vê os ativos: fica só o local.
    const deHeitor = await sugestoes('heitor', `pessoa=${id('fernanda')}`);
    expect(deHeitor.json()).toEqual({
      local: { id: id('financeiro'), nome: 'Jundiaí › Financeiro' },
      ativos: [],
    });
  });

  it('a pessoa sem local e a do local inativo não têm o local sugerido', async () => {
    const semLocal = await sugestoes('ana', `pessoa=${id('rita')}`);
    expect(semLocal.json()).toEqual({ local: null, ativos: [] });

    // O local de Otávio está inativo, e o campo Local só aceita o ativo; o ativo de lá continua.
    const deSorocaba = await sugestoes('ana', `pessoa=${id('otavio')}`);
    expect(deSorocaba.json()).toEqual({
      local: null,
      ativos: [sugerido('pat500', 'PAT-00500', 'local')],
    });
  });

  it('as sugestões param em 10, com os ativos dela primeiro', async () => {
    const r = await sugestoes('ana', `pessoa=${id('igor')}`);
    expect(r.json().ativos.map(({ patrimonio }: { patrimonio: string }) => patrimonio)).toEqual([
      'PAT-00320',
      'ALM-001',
      'ALM-002',
      'ALM-003',
      'ALM-004',
      'ALM-005',
      'ALM-006',
      'ALM-007',
      'ALM-008',
      'ALM-009',
    ]);

    // Os 12 de Júlia passam do limite: ficam os 10 primeiros, e nenhum do local dela.
    const deJulia = await sugestoes('ana', `pessoa=${id('julia')}`);
    expect(deJulia.json().ativos).toEqual(
      Array.from({ length: 10 }, (_, indice) =>
        expect.objectContaining({
          patrimonio: `ALM-${String(indice + 1).padStart(3, '0')}`,
          motivo: 'responsavel',
        }),
      ),
    );
  });
});

// Quem configura vê o formulário como uma pessoa (spec modulo-chamados, "Construtor do formulário"):
// a prévia pede as sugestões pela rota dos tipos, com `chamados.configurar`, e recebe as mesmas da
// abertura, também só com os ativos que a conta vê.
describe('as sugestões da prévia do colaborador', () => {
  it('quem só configura recebe as sugestões da pessoa pela rota da prévia', async () => {
    const daAbertura = await sugestoes('ana', `pessoa=${id('fernanda')}`);
    const daPrevia = await sugestoesDaPrevia('livia', `pessoa=${id('fernanda')}`);
    expect(daPrevia.statusCode, daPrevia.body).toBe(200);
    expect(daPrevia.json()).toEqual(daAbertura.json());

    // A rota da abertura continua pedindo `chamados.atender`.
    const pelaAbertura = await sugestoes('livia', `pessoa=${id('fernanda')}`);
    expect(pelaAbertura.statusCode).toBe(403);
  });

  it('quem não configura não pede as sugestões da prévia', async () => {
    const r = await sugestoesDaPrevia('carla', `pessoa=${id('fernanda')}`);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:sem-permissao' });
  });
});

describe('as recusas das sugestões', () => {
  it('a pessoa que falta, a fora do formato e a que não existe', async () => {
    const semPessoa = await sugestoes('ana', '');
    expect(semPessoa.statusCode).toBe(400);
    expect(semPessoa.json()).toMatchObject({
      type: 'urn:grafite:problema:dados-invalidos',
      campos: { pessoa: 'Pessoa não encontrada.' },
    });
    const foraDoFormato = await sugestoes('ana', 'pessoa=fernanda');
    expect(foraDoFormato.json()).toMatchObject({ campos: { pessoa: 'Pessoa não encontrada.' } });

    const naoExiste = await sugestoes('ana', 'pessoa=00000000-0000-4000-8000-000000000000');
    expect(naoExiste.statusCode).toBe(404);
    expect(naoExiste.json()).toMatchObject({ detail: 'Pessoa não encontrada.' });
  });

  it('o tipo de ativo fora do formato', async () => {
    const r = await sugestoes('ana', `pessoa=${id('fernanda')}&tipos=${id('impressora')},nada`);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ campos: { tipos: 'Tipo de ativo não encontrado.' } });
  });

  it('quem só vê os chamados não pede as sugestões', async () => {
    const r = await sugestoes('carla', `pessoa=${id('fernanda')}`);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:sem-permissao' });
  });

  it('com o módulo desligado, as sugestões respondem que ele está desligado', async () => {
    await desligarModulos(api, org, ['chamados']);
    const r = await sugestoes('ana', `pessoa=${id('fernanda')}`);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:modulo-desligado' });
    const daPrevia = await sugestoesDaPrevia('livia', `pessoa=${id('fernanda')}`);
    expect(daPrevia.json()).toMatchObject({ type: 'urn:grafite:problema:modulo-desligado' });
  });
});
