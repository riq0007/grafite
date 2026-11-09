// O estoque nos outros cadastros pela API (spec consumiveis, "Quem vê e quem edita os consumíveis";
// cadastro-de-ativos, "Consumíveis compatíveis na ficha do ativo"; fornecedores, "Consumíveis do
// fornecedor"; modulo-operacao, "Lançamento das movimentações" e "Estoque na ficha do consumível";
// change p4c-estoque, design, decisão 6): a escolha dos consumíveis sem `consumiveis.ver`, os ativos
// para a saída com os compatíveis, o estoque na ficha do consumível, o saldo dos compatíveis na ficha
// do ativo e os consumíveis e as entradas do fornecedor.
import {
  consumiveisDosModelos,
  fornecedoresDosConsumiveis,
  movimentosDoEstoque,
  naOrganizacao,
} from '@grafite/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo, criarModelo } from '../../test/alertas.ts';
import {
  criarConsumivel,
  definirSaldo,
  type EstoqueDeTeste,
  montarEstoque,
  type UsuarioDoEstoque,
} from '../../test/estoque.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.estoque-referencias.local';

let api: ApiDeTeste;
let e: EstoqueDeTeste;
/** Fábio vê os fornecedores, sem os consumíveis e sem o estoque; Gil vê só os ativos. */
const outras = {} as Record<'fabio' | 'gil', Entrada>;
let cf258x = '';
let pat00500 = '';

beforeAll(async () => {
  api = await abrirApi();
  e = await montarEstoque(api, host);
  for (const [usuario, nome, permissao] of [
    ['fabio', 'Fábio Reis', 'fornecedores.ver'],
    ['gil', 'Gil Matos', 'ativos.ver'],
  ] as const) {
    const perfil = await criarPerfil(api, e.org, {
      nome: `Só ${permissao}`,
      permissoes: [permissao],
    });
    const conta = await criarConta(api, e.org, { usuario, nome });
    await atribuir(api, e.org, { perfilId: perfil, contaId: conta.id });
    outras[usuario] = await e.cliente.entrar(usuario);
  }
  cf258x = await criarConsumivel(api, e.org, { codigo: 'CF258X', nome: 'HP 58X' });
  await naOrganizacao(api.banco, e.org, async (tx) => {
    await tx.insert(consumiveisDosModelos).values({
      orgId: e.org,
      consumivelId: e.consumiveis.cf258a,
      modeloId: e.modelos.m404,
    });
    await tx.insert(fornecedoresDosConsumiveis).values([
      { orgId: e.org, consumivelId: e.consumiveis.cf258a, fornecedorId: e.fornecedores.hp },
      { orgId: e.org, consumivelId: cf258x, fornecedorId: e.fornecedores.hp },
      { orgId: e.org, consumivelId: e.consumiveis.cf280a, fornecedorId: e.fornecedores.hp },
    ]);
  });
  // Uma impressora de outro modelo, em Jundiaí, que não serve o CF258A.
  const m428 = await criarModelo(api, e.org, { tipoId: e.tipos.impressora, nome: 'LaserJet M428' });
  pat00500 = await criarAtivoDoTipo(api, e.org, {
    tipoId: e.tipos.impressora,
    modeloId: m428,
    patrimonio: 'PAT-00500',
    localId: e.locais.almoxarifado,
  });
  for (const [localId, saldo] of [
    [e.locais.almoxarifado, 7],
    [e.locais.expedicao, 2],
    [e.locais.almoxarifadoDeCampinas, 5],
  ] as const) {
    await definirSaldo(api, e.org, { consumivelId: e.consumiveis.cf258a, localId, saldo });
  }
});

afterAll(async () => {
  await api?.fechar();
});

const consultar = (url: string, usuario: UsuarioDoEstoque | Entrada = 'carla') =>
  e.cliente.consultar(url, typeof usuario === 'string' ? e.entradas[usuario] : usuario);

describe('escolha dos consumíveis', () => {
  it('Almoxarife sem os consumíveis: escolhe o CF258A pelo código entre os ativos', async () => {
    const r = await consultar('/consumiveis/escolha?busca=cf 258');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      consumiveis: [
        { id: e.consumiveis.cf258a, codigo: 'CF258A', nome: 'HP 58A', tipo: 'toner', cor: 'preto' },
        { id: cf258x, codigo: 'CF258X', nome: 'HP 58X', tipo: 'toner', cor: 'preto' },
      ],
    });
    const pelonome = (await consultar('/consumiveis/escolha?busca=hp 58x')).json();
    expect(pelonome.consumiveis.map((c: { codigo: string }) => c.codigo)).toEqual(['CF258X']);
    const todos = (await consultar('/consumiveis/escolha', outras.gil)).json();
    expect(todos.consumiveis.map((c: { codigo: string }) => c.codigo)).not.toContain('CF280A');
  });

  it('traz o consumível pedido pelo id, mesmo inativo, para o lançamento aberto pelo endereço', async () => {
    const r = await consultar(`/consumiveis/escolha?id=${e.consumiveis.cf280a}`);
    expect(r.json()).toEqual({
      consumiveis: [
        { id: e.consumiveis.cf280a, codigo: 'CF280A', nome: null, tipo: 'toner', cor: 'preto' },
      ],
    });
    const outro = '0190a0b0-0000-7000-8000-000000000000';
    expect((await consultar(`/consumiveis/escolha?id=${outro}`)).json()).toEqual({
      consumiveis: [],
    });
  });
});

describe('ativos para a saída', () => {
  it('Impressoras sugeridas na saída: os de modelo compatível primeiro, entre os que a conta vê', async () => {
    const r = await consultar(`/estoque/ativos-para-saida?consumivel=${e.consumiveis.cf258a}`);
    expect(r.statusCode).toBe(200);
    expect(r.json().ativos).toEqual([
      {
        id: e.ativos.pat00412,
        rotulo: 'HP LaserJet M404',
        patrimonio: 'PAT-00412',
        local: { id: e.locais.expedicao, caminho: 'Jundiaí › Expedição' },
        sugerido: true,
      },
      expect.objectContaining({ id: pat00500, patrimonio: 'PAT-00500', sugerido: false }),
    ]);
    const daAna = (
      await consultar(`/estoque/ativos-para-saida?consumivel=${e.consumiveis.cf258a}`, 'ana')
    ).json();
    expect(daAna.ativos.map((a: { patrimonio: string }) => a.patrimonio)).toEqual([
      'PAT-00412',
      'PAT-00977',
      'PAT-00500',
    ]);
    const pelaBusca = (await consultar('/estoque/ativos-para-saida?busca=00500')).json();
    expect(pelaBusca.ativos.map((a: { id: string }) => a.id)).toEqual([pat00500]);
    expect((await consultar('/estoque/ativos-para-saida', 'bruno')).statusCode).toBe(403);
  });
});

describe('estoque na ficha do consumível', () => {
  it('CF258A em dois locais: os saldos do alcance, a soma e as últimas movimentações', async () => {
    await e.cliente.enviar('POST', '/estoque/entradas', e.entradas.carla, {
      consumivel: e.consumiveis.cf258a,
      quantidade: 1,
      destino: e.locais.expedicao,
      fornecedor: e.fornecedores.hp,
      notaFiscal: 'NF-9',
    });
    await e.cliente.enviar('POST', '/estoque/saidas', e.entradas.carla, {
      consumivel: e.consumiveis.cf258a,
      quantidade: 1,
      origem: e.locais.expedicao,
      ativo: e.ativos.pat00412,
    });
    const r = await consultar(`/consumiveis/${e.consumiveis.cf258a}/estoque`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      saldos: [
        { local: { caminho: 'Jundiaí › Almoxarifado' }, saldo: 7, situacao: 'em-estoque' },
        { local: { caminho: 'Jundiaí › Expedição' }, saldo: 2 },
      ],
      soma: 9,
      movimentos: [{ tipo: 'saida' }, { tipo: 'entrada', notaFiscal: 'NF-9' }],
      permite: { movimentar: true },
    });
    const doBruno = (
      await consultar(`/consumiveis/${e.consumiveis.cf258a}/estoque`, 'bruno')
    ).json();
    expect(doBruno).toMatchObject({ soma: 14, permite: { movimentar: false } });
    expect(
      (await consultar(`/consumiveis/${e.consumiveis.cf258a}/estoque`, 'davi')).statusCode,
    ).toBe(403);
    const outro = '0190a0b0-0000-7000-8000-000000000000';
    expect((await consultar(`/consumiveis/${outro}/estoque`)).statusCode).toBe(404);
  });

  it('traz só as 10 movimentações mais novas', async () => {
    const toner = await criarConsumivel(api, e.org, { codigo: 'CE285A' });
    for (let i = 0; i < 12; i += 1) {
      await e.cliente.enviar('POST', '/estoque/ajustes', e.entradas.ana, {
        consumivel: toner,
        quantidade: 1,
        local: e.locais.almoxarifado,
        direcao: 'acrescentar',
        motivo: 'inventario',
      });
    }
    const r = (await consultar(`/consumiveis/${toner}/estoque`, 'ana')).json();
    expect(r.movimentos).toHaveLength(10);
    expect(r.soma).toBe(12);
  });
});

describe('saldo dos compatíveis na ficha do ativo', () => {
  it('Toner em estoque: o CF258A mostra a soma nos locais que a conta vê', async () => {
    const daCarla = (await consultar(`/ativos/${e.ativos.pat00412}`)).json();
    expect(daCarla.consumiveisCompativeis).toEqual([
      expect.objectContaining({ id: e.consumiveis.cf258a, codigo: 'CF258A', saldo: 9 }),
    ]);
    const daAna = (await consultar(`/ativos/${e.ativos.pat00412}`, 'ana')).json();
    expect(daAna.consumiveisCompativeis[0].saldo).toBe(14);
    const doGil = (await consultar(`/ativos/${e.ativos.pat00412}`, outras.gil)).json();
    expect(doGil.consumiveisCompativeis[0].saldo).toBeNull();
  });
});

describe('consumíveis e entradas do fornecedor', () => {
  it('Toners da HP Brasil: os consumíveis ativos e as entradas no alcance, com a última', async () => {
    // As entradas de outros dias, direto no livro-razão, sem mexer no relógio das sessões.
    await naOrganizacao(api.banco, e.org, (tx) =>
      tx.insert(movimentosDoEstoque).values(
        (
          [
            [e.locais.almoxarifado, '2026-10-10T12:00:00.000Z'],
            [e.locais.almoxarifadoDeCampinas, '2026-10-11T12:00:00.000Z'],
            [e.locais.expedicao, '2026-10-12T12:00:00.000Z'],
          ] as const
        ).map(([destinoId, dia]) => ({
          orgId: e.org,
          tipo: 'entrada' as const,
          consumivelId: cf258x,
          quantidade: 1,
          destinoId,
          fornecedorId: e.fornecedores.hp,
          notaFiscal: '777',
          lancadoPor: e.contas.ana,
          momento: new Date(dia),
        })),
      ),
    );
    const consumiveis = await consultar(`/fornecedores/${e.fornecedores.hp}/consumiveis`, 'ana');
    expect(consumiveis.statusCode).toBe(200);
    expect(consumiveis.json()).toEqual({
      consumiveis: [
        { id: e.consumiveis.cf258a, codigo: 'CF258A', nome: 'HP 58A', tipo: 'toner', cor: 'preto' },
        { id: cf258x, codigo: 'CF258X', nome: 'HP 58X', tipo: 'toner', cor: 'preto' },
      ],
    });
    const entradas = (await consultar(`/fornecedores/${e.fornecedores.hp}/entradas`, 'ana')).json();
    expect(entradas).toEqual({ entradas: 4, ultima: '2026-10-12T12:00:00.000Z' });
    const daCarla = (await consultar(`/fornecedores/${e.fornecedores.hp}/entradas`)).json();
    expect(daCarla).toEqual({ entradas: 3, ultima: '2026-10-12T12:00:00.000Z' });
    const semNenhuma = (
      await consultar(`/fornecedores/${e.fornecedores.locadora}/entradas`, 'ana')
    ).json();
    expect(semNenhuma).toEqual({ entradas: 0, ultima: null });
  });

  it('Sem ver os consumíveis: quem vê só os fornecedores recebe 403 nas duas', async () => {
    expect(
      (await consultar(`/fornecedores/${e.fornecedores.hp}/consumiveis`, outras.fabio)).statusCode,
    ).toBe(403);
    expect(
      (await consultar(`/fornecedores/${e.fornecedores.hp}/entradas`, outras.fabio)).statusCode,
    ).toBe(403);
  });
});
