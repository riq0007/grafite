// A compatibilidade dos consumíveis com os modelos (spec consumiveis, "Compatibilidade com os
// modelos" e "Quem vê e quem edita os consumíveis"; spec cadastro-de-ativos, "Consumíveis
// compatíveis na ficha do ativo"; change p4b-consumiveis, design, decisões 4 e 5): os modelos para
// escolher, a conferência do modelo que entra, os compatíveis do modelo como referência e os do
// modelo do ativo na ficha dele, só com a capacidade no tipo e o Operação ligado.
import { naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.compatibilidade.local';
const CAPACIDADE = 'consumiveis.compatibilidade';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas = {} as Record<'ana' | 'bruno' | 'davi', Entrada>;
const ids = {} as Record<
  | 'impressora'
  | 'notebook'
  | 'm404'
  | 'm428'
  | 'm500'
  | 'latitude'
  | 'pat412'
  | 'pat900'
  | 'notebookDaAna'
  | 'cf258a'
  | 'cf258x'
  | 'cf232a',
  string
>;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  // Ana edita os consumíveis e vê os ativos; Bruno vê as impressoras de Campinas, sem ver os
  // consumíveis; Davi só vê os consumíveis.
  const operacao = await criarPerfil(api, org, {
    nome: 'Operação',
    permissoes: ['consumiveis.editar', 'ativos.ver'],
  });
  const campo = await criarPerfil(api, org, { nome: 'Campo', permissoes: ['ativos.ver'] });
  const leitura = await criarPerfil(api, org, {
    nome: 'Leitura',
    permissoes: ['consumiveis.ver'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Lima' });
  const davi = await criarConta(api, org, { usuario: 'davi', nome: 'Davi Rocha' });
  await atribuir(api, org, { perfilId: operacao, contaId: ana.id });
  await atribuir(api, org, { perfilId: campo, contaId: bruno.id, localId: campinas });
  await atribuir(api, org, { perfilId: leitura, contaId: davi.id });
  for (const usuario of ['ana', 'bruno', 'davi'] as const) {
    entradas[usuario] = await cliente.entrar(usuario);
  }

  ids.impressora = await criarTipo(api, org, { nome: 'Impressora', capacidades: [CAPACIDADE] });
  ids.notebook = await criarTipo(api, org, { nome: 'Notebook' });
  ids.m404 = await criarModelo(api, org, { tipoId: ids.impressora, nome: 'LaserJet M404' });
  ids.m428 = await criarModelo(api, org, { tipoId: ids.impressora, nome: 'LaserJet M428' });
  ids.m500 = await criarModelo(api, org, {
    tipoId: ids.impressora,
    nome: 'LaserJet M500',
    situacao: 'inativo',
  });
  ids.latitude = await criarModelo(api, org, {
    tipoId: ids.notebook,
    fabricante: 'Dell',
    nome: 'Latitude 5440',
  });
  ids.pat412 = await criarAtivoDoTipo(api, org, {
    tipoId: ids.impressora,
    modeloId: ids.m404,
    patrimonio: 'PAT-00412',
    localId: campinas,
  });
  ids.pat900 = await criarAtivoDoTipo(api, org, {
    tipoId: ids.impressora,
    patrimonio: 'PAT-00900',
    localId: campinas,
  });
  ids.notebookDaAna = await criarAtivoDoTipo(api, org, {
    tipoId: ids.notebook,
    modeloId: ids.latitude,
    patrimonio: 'PAT-00700',
    localId: campinas,
  });

  const cadastrar = async (pedido: object) => {
    const r = await cliente.enviar('POST', '/consumiveis', entradas.ana, pedido);
    expect(r.statusCode, r.body).toBe(201);
    return r.json().id as string;
  };
  ids.cf258a = await cadastrar({
    codigo: 'CF258A',
    nome: 'HP 58A',
    tipo: 'toner',
    cor: 'preto',
    rendimento: 3000,
    modelos: [ids.m404, ids.m428],
  });
  ids.cf232a = await cadastrar({ codigo: 'CF232A', tipo: 'cilindro', modelos: [ids.m404] });
  ids.cf258x = await cadastrar({ codigo: 'CF258X', tipo: 'toner', modelos: [ids.m404] });
  const inativo = await cadastrar({ codigo: 'CF230A', tipo: 'toner', modelos: [ids.m404] });
  await cliente.enviar('POST', `/consumiveis/${inativo}/inativacao`, entradas.ana);
});

afterAll(async () => {
  await api?.fechar();
});

const compativeisDoModelo = (modeloId: string, usuario: keyof typeof entradas = 'ana') =>
  cliente.consultar(`/modelos/${modeloId}/consumiveis`, entradas[usuario]);
const fichaDoAtivo = (ativoId: string, usuario: keyof typeof entradas = 'ana') =>
  cliente.consultar(`/ativos/${ativoId}`, entradas[usuario]);
const capacidadesDaImpressora = (capacidades: string[]) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.update(tiposDeAtivo).set({ capacidades }).where(eq(tiposDeAtivo.id, ids.impressora)),
  );

const codigos = (consumiveis: { codigo: string }[] | null) =>
  consumiveis?.map(({ codigo }) => codigo) ?? null;

describe('os modelos para escolher', () => {
  it('são os modelos ativos dos tipos com a capacidade, para quem edita os consumíveis', async () => {
    const r = await cliente.consultar('/consumiveis/modelos', entradas.ana);
    expect(r.statusCode).toBe(200);
    expect(r.json().modelos).toEqual([
      {
        id: ids.m404,
        fabricante: 'HP',
        nome: 'LaserJet M404',
        tipo: { id: ids.impressora, nome: 'Impressora' },
      },
      {
        id: ids.m428,
        fabricante: 'HP',
        nome: 'LaserJet M428',
        tipo: { id: ids.impressora, nome: 'Impressora' },
      },
    ]);
    expect((await cliente.consultar('/consumiveis/modelos', entradas.davi)).statusCode).toBe(403);
  });
});

describe('a conferência do modelo que entra', () => {
  it('Modelo de outro tipo: recusa o modelo sem a capacidade e o inativo, no campo', async () => {
    const outroTipo = await cliente.enviar('POST', '/consumiveis', entradas.ana, {
      codigo: 'X100',
      tipo: 'toner',
      modelos: [ids.latitude],
    });
    expect(outroTipo.statusCode).toBe(400);
    expect(outroTipo.json().campos).toEqual({
      modelos: 'O modelo escolhido não é de um tipo com consumíveis compatíveis.',
    });
    const inativo = await cliente.enviar('PATCH', `/consumiveis/${ids.cf258x}`, entradas.ana, {
      modelos: [ids.m404, ids.m500],
    });
    expect(inativo.statusCode).toBe(400);
    expect(inativo.json().campos).toEqual({
      modelos: 'O modelo escolhido está inativo. Escolha um modelo ativo.',
    });
  });

  it('mantém o modelo que já estava, mesmo depois de inativado', async () => {
    const m700 = await criarModelo(api, org, { tipoId: ids.impressora, nome: 'LaserJet M700' });
    const toner = (
      await cliente.enviar('POST', '/consumiveis', entradas.ana, {
        codigo: 'CF214A',
        tipo: 'toner',
        modelos: [m700],
      })
    ).json();
    await naOrganizacao(api.banco, org, (tx) =>
      tx.execute(`update modelos set situacao = 'inativo' where id = '${m700}'`),
    );
    const r = await cliente.enviar('PATCH', `/consumiveis/${toner.id}`, entradas.ana, {
      nome: 'HP 14A',
      modelos: [m700],
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().modelos).toMatchObject([{ id: m700, situacao: 'inativo' }]);
  });
});

describe('os compatíveis do modelo', () => {
  it('Toner em dois modelos: os ativos que têm o modelo, pelo tipo e pelo código', async () => {
    const r = await compativeisDoModelo(ids.m404);
    expect(r.statusCode).toBe(200);
    expect(codigos(r.json().consumiveis)).toEqual(['CF258A', 'CF258X', 'CF232A']);
    expect(r.json().consumiveis[0]).toEqual({
      id: ids.cf258a,
      codigo: 'CF258A',
      nome: 'HP 58A',
      tipo: 'toner',
      cor: 'preto',
      rendimento: 3000,
      saldo: null,
    });
    expect(codigos((await compativeisDoModelo(ids.m428)).json().consumiveis)).toEqual(['CF258A']);
    expect(codigos((await fichaDoAtivo(ids.pat412)).json().consumiveisCompativeis)).toEqual([
      'CF258A',
      'CF258X',
      'CF232A',
    ]);
  });

  it('o modelo de um tipo sem a capacidade não tem compatíveis, e o ativo sem modelo tem a lista vazia', async () => {
    expect((await compativeisDoModelo(ids.latitude)).json()).toEqual({ consumiveis: null });
    expect((await fichaDoAtivo(ids.notebookDaAna)).json().consumiveisCompativeis).toBeNull();
    expect((await fichaDoAtivo(ids.pat900)).json().consumiveisCompativeis).toEqual([]);
  });

  it('Técnico sem a permissão: quem vê o ativo vê os compatíveis, sem ver os consumíveis', async () => {
    expect(
      codigos((await fichaDoAtivo(ids.pat412, 'bruno')).json().consumiveisCompativeis),
    ).toEqual(['CF258A', 'CF258X', 'CF232A']);
    expect((await compativeisDoModelo(ids.m404, 'bruno')).statusCode).toBe(200);
    expect((await cliente.consultar('/consumiveis', entradas.bruno)).statusCode).toBe(403);
  });

  it('Compatibilidade desligada: esconde os compatíveis e guarda os modelos dos consumíveis', async () => {
    await capacidadesDaImpressora([]);
    expect((await compativeisDoModelo(ids.m404)).json()).toEqual({ consumiveis: null });
    expect((await fichaDoAtivo(ids.pat412)).json().consumiveisCompativeis).toBeNull();
    const ficha = (await cliente.consultar(`/consumiveis/${ids.cf258a}`, entradas.ana)).json();
    expect(ficha.modelos.map(({ id }: { id: string }) => id)).toEqual([ids.m404, ids.m428]);
    await capacidadesDaImpressora([CAPACIDADE]);
    expect(codigos((await compativeisDoModelo(ids.m404)).json().consumiveis)).toHaveLength(3);
  });

  it('Operação desligado: a ficha do ativo não traz os compatíveis, e a referência é recusada', async () => {
    await desligarModulos(api, org, ['operacao']);
    expect((await fichaDoAtivo(ids.pat412)).json().consumiveisCompativeis).toBeNull();
    expect((await compativeisDoModelo(ids.m404)).statusCode).toBe(403);
    await desligarModulos(api, org, []);
    expect(codigos((await fichaDoAtivo(ids.pat412)).json().consumiveisCompativeis)).toHaveLength(3);
  });

  it('responde 404 ao modelo que não existe', async () => {
    const r = await compativeisDoModelo('00000000-0000-7000-8000-000000000003');
    expect(r.statusCode).toBe(404);
  });
});
