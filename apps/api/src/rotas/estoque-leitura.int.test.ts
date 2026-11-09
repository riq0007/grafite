// O mínimo e as leituras do estoque pela API (spec estoque, "Mínimo do consumível no local" e "Quem
// vê e quem movimenta o estoque"; modulo-operacao, "Tela do estoque", "Movimentações" e "Estoque
// abaixo do mínimo no Início"; eventos-em-tempo-real; auditoria, "Eventos do estoque registrados";
// change p4c-estoque, design, decisão 5): o mínimo com o abaixo do mínimo, os saldos e as
// movimentações com os filtros e o cursor, dentro do alcance da conta, e quem recebe o evento.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gravarEstado } from '../../test/alertas.ts';
import {
  criarConsumivel,
  criarFornecedor,
  definirSaldo,
  type EstoqueDeTeste,
  montarEstoque,
  type UsuarioDoEstoque,
} from '../../test/estoque.ts';
import { abrirEventos } from '../../test/eventos.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarConta,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.estoque-leitura.local';

let api: ApiDeTeste;
let e: EstoqueDeTeste;
/** Elisa só vê o estoque de Campinas. */
let elisa: Entrada;

beforeAll(async () => {
  api = await abrirApi();
  e = await montarEstoque(api, host);
  const deCampinas = await criarPerfil(api, e.org, {
    nome: 'Estoque de Campinas',
    permissoes: ['estoque.ver'],
  });
  const conta = await criarConta(api, e.org, { usuario: 'elisa', nome: 'Elisa Prado' });
  await atribuir(api, e.org, {
    perfilId: deCampinas,
    contaId: conta.id,
    localId: e.locais.campinas,
  });
  elisa = await e.cliente.entrar('elisa');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, e.org, (tx) => tx.delete(eventos));
});

let codigos = 0;
async function tonerNovo() {
  codigos += 1;
  const codigo = `Q${2600 + codigos}A`;
  return { id: await criarConsumivel(api, e.org, { codigo }), codigo };
}

const consultar = (url: string, usuario: UsuarioDoEstoque | Entrada = 'carla') =>
  e.cliente.consultar(url, typeof usuario === 'string' ? e.entradas[usuario] : usuario);

const definirMinimo = (
  consumivelId: string,
  localId: string,
  minimo: unknown,
  usuario: UsuarioDoEstoque = 'carla',
) =>
  e.cliente.enviar('PUT', `/estoque/minimos/${consumivelId}/${localId}`, e.entradas[usuario], {
    minimo,
  });

const lancar = (caminho: string, pedido: object, usuario: UsuarioDoEstoque = 'ana') =>
  e.cliente.enviar('POST', `/estoque/${caminho}`, e.entradas[usuario], pedido);

const entradaDe = (consumivel: string, quantidade: number, pedido: object = {}) =>
  lancar('entradas', {
    consumivel,
    quantidade,
    destino: e.locais.almoxarifado,
    fornecedor: e.fornecedores.hp,
    notaFiscal: '12345',
    ...pedido,
  });

describe('mínimo do consumível no local', () => {
  it('Mínimo mudado: grava o mínimo, com o antes e o depois na auditoria', async () => {
    const toner = await tonerNovo();
    await definirSaldo(api, e.org, {
      consumivelId: toner.id,
      localId: e.locais.almoxarifado,
      saldo: 6,
      minimo: 5,
    });
    const r = await definirMinimo(toner.id, e.locais.almoxarifado, 8);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      saldo: 6,
      minimo: 8,
      situacao: 'abaixo-do-minimo',
      abaixoDesde: api.relogio.agora().toISOString(),
      permite: { movimentar: true },
    });
    const [registro] = await auditoriaDaRequisicao(api, e.org, r);
    expect(registro).toMatchObject({
      acao: 'estoque.minimo',
      alvoTipo: 'consumivel',
      alvoId: toner.id,
      antes: { minimo: 5 },
      depois: { minimo: 8 },
      dados: { consumivel: toner.codigo, local: 'Jundiaí › Almoxarifado' },
    });
    expect(
      await naOrganizacao(api.banco, e.org, (tx) =>
        tx.select({ locais: eventos.locais, permissao: eventos.permissao }).from(eventos),
      ),
    ).toEqual([{ locais: [e.locais.almoxarifado], permissao: 'estoque.ver' }]);
  });

  it('Mínimo zerado: deixa de ficar abaixo do mínimo, e a situação segue o saldo', async () => {
    const toner = await tonerNovo();
    await definirSaldo(api, e.org, {
      consumivelId: toner.id,
      localId: e.locais.almoxarifado,
      saldo: 2,
      minimo: 5,
      abaixoDesde: new Date('2026-10-01T08:00:00.000Z'),
    });
    const r = await definirMinimo(toner.id, e.locais.almoxarifado, 0);
    expect(r.json()).toMatchObject({
      saldo: 2,
      minimo: 0,
      situacao: 'em-estoque',
      abaixoDesde: null,
    });
  });

  it('nasce a linha no primeiro mínimo, e o mesmo mínimo não grava nada', async () => {
    const toner = await tonerNovo();
    const r = await definirMinimo(toner.id, e.locais.expedicao, 2);
    expect(r.json()).toMatchObject({
      local: { id: e.locais.expedicao, caminho: 'Jundiaí › Expedição' },
      saldo: 0,
      minimo: 2,
      situacao: 'sem-estoque',
      abaixoDesde: api.relogio.agora().toISOString(),
    });
    const igual = await definirMinimo(toner.id, e.locais.expedicao, 2);
    expect(igual.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, e.org, igual)).toEqual([]);
  });

  it('recusa o mínimo fora da faixa, fora do alcance e de quem só vê', async () => {
    const toner = await tonerNovo();
    for (const minimo of [-1, 100_001, 2.5, null]) {
      const r = await definirMinimo(toner.id, e.locais.almoxarifado, minimo);
      expect(r.statusCode).toBe(400);
      expect(r.json().campos).toEqual({ minimo: 'Use um número inteiro de 0 a 100.000.' });
    }
    expect((await definirMinimo(toner.id, e.locais.almoxarifadoDeCampinas, 3)).statusCode).toBe(
      403,
    );
    expect((await definirMinimo(toner.id, e.locais.almoxarifado, 3, 'bruno')).statusCode).toBe(403);
    const outro = '0190a0b0-0000-7000-8000-000000000000';
    expect((await definirMinimo(outro, e.locais.almoxarifado, 3)).statusCode).toBe(404);
    expect((await definirMinimo(toner.id, outro, 3, 'ana')).statusCode).toBe(404);
  });
});

describe('saldos do estoque', () => {
  it('Toners abaixo do mínimo: traz os abaixo e os sem estoque com o mínimo', async () => {
    const toner = await tonerNovo();
    await definirSaldo(api, e.org, {
      consumivelId: toner.id,
      localId: e.locais.almoxarifado,
      saldo: 2,
      minimo: 5,
      abaixoDesde: new Date('2026-10-01T08:00:00.000Z'),
    });
    await definirSaldo(api, e.org, {
      consumivelId: toner.id,
      localId: e.locais.expedicao,
      saldo: 0,
      minimo: 2,
      abaixoDesde: new Date('2026-10-01T09:00:00.000Z'),
    });
    const outro = await tonerNovo();
    await definirSaldo(api, e.org, {
      consumivelId: outro.id,
      localId: e.locais.almoxarifado,
      saldo: 9,
      minimo: 5,
    });
    const r = await consultar(
      `/estoque/saldos?situacao=abaixo-do-minimo&busca=${toner.codigo.toLowerCase()}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      total: 2,
      proximo: null,
      permite: { movimentar: true },
      itens: [
        {
          consumivel: { id: toner.id, codigo: toner.codigo, abrir: false },
          local: { caminho: 'Jundiaí › Almoxarifado' },
          saldo: 2,
          minimo: 5,
          situacao: 'abaixo-do-minimo',
        },
        {
          local: { caminho: 'Jundiaí › Expedição' },
          saldo: 0,
          minimo: 2,
          situacao: 'sem-estoque',
        },
      ],
    });
    const semEstoque = await consultar(
      `/estoque/saldos?situacao=sem-estoque&consumivel=${toner.id}`,
    );
    expect(semEstoque.json().itens.map((s: { saldo: number }) => s.saldo)).toEqual([0]);
  });

  it('Almoxarife de Jundiaí: vê os saldos de Jundiaí, e não os de Campinas', async () => {
    const toner = await tonerNovo();
    for (const localId of [e.locais.almoxarifado, e.locais.almoxarifadoDeCampinas]) {
      await definirSaldo(api, e.org, { consumivelId: toner.id, localId, saldo: 3 });
    }
    const daCarla = await consultar(`/estoque/saldos?consumivel=${toner.id}`);
    expect(
      daCarla.json().itens.map((s: { local: { caminho: string } }) => s.local.caminho),
    ).toEqual(['Jundiaí › Almoxarifado']);
    const daAna = await consultar(`/estoque/saldos?consumivel=${toner.id}`, 'ana');
    expect(daAna.json().itens.map((s: { local: { caminho: string } }) => s.local.caminho)).toEqual([
      'Campinas › Almoxarifado',
      'Jundiaí › Almoxarifado',
    ]);
    expect(daAna.json().itens[0].permite).toEqual({ movimentar: true });
    const doBruno = await consultar(`/estoque/saldos?consumivel=${toner.id}`, 'bruno');
    expect(doBruno.json()).toMatchObject({
      permite: { movimentar: false },
      itens: [{ permite: { movimentar: false } }, { permite: { movimentar: false } }],
    });
  });

  it('filtra pelo local, com os de dentro, e pelo tipo, e pagina pelo código e pelo caminho', async () => {
    const [a, b] = [await tonerNovo(), await tonerNovo()];
    for (const toner of [a, b]) {
      for (const localId of [e.locais.almoxarifado, e.locais.expedicao]) {
        await definirSaldo(api, e.org, { consumivelId: toner.id, localId, saldo: 1 });
      }
    }
    const busca = `busca=Q26`;
    const primeira = await consultar(`/estoque/saldos?${busca}&local=${e.locais.jundiai}&limite=3`);
    const pagina1 = primeira.json();
    expect(pagina1.total).toBeGreaterThanOrEqual(4);
    expect(pagina1.itens).toHaveLength(3);
    const lidos = [...pagina1.itens];
    let proximo: string | null = pagina1.proximo;
    while (proximo) {
      const seguinte = (
        await consultar(
          `/estoque/saldos?${busca}&local=${e.locais.jundiai}&limite=3&cursor=${proximo}`,
        )
      ).json();
      lidos.push(...seguinte.itens);
      proximo = seguinte.proximo;
    }
    const chaves = lidos.map(
      (s: { consumivel: { codigo: string }; local: { caminho: string } }) =>
        `${s.consumivel.codigo} ${s.local.caminho}`,
    );
    expect(chaves).toEqual([...chaves].sort((x, y) => x.localeCompare(y, 'pt-BR')));
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves).toEqual(
      expect.arrayContaining([
        `${a.codigo} Jundiaí › Almoxarifado`,
        `${a.codigo} Jundiaí › Expedição`,
        `${b.codigo} Jundiaí › Almoxarifado`,
        `${b.codigo} Jundiaí › Expedição`,
      ]),
    );
    const daExpedicao = await consultar(
      `/estoque/saldos?consumivel=${a.id}&local=${e.locais.expedicao}&tipo=toner`,
    );
    expect(daExpedicao.json().itens).toHaveLength(1);
    const deCilindro = await consultar(`/estoque/saldos?consumivel=${a.id}&tipo=cilindro`);
    expect(deCilindro.json().itens).toEqual([]);
  });
});

describe('abaixo do mínimo, para o Início', () => {
  it('traz os pares abaixo do mínimo do alcance, os mais antigos primeiro', async () => {
    const toner = await tonerNovo();
    await definirSaldo(api, e.org, {
      consumivelId: toner.id,
      localId: e.locais.expedicao,
      saldo: 1,
      minimo: 3,
      abaixoDesde: new Date('2026-09-30T10:00:00.000Z'),
    });
    await definirSaldo(api, e.org, {
      consumivelId: toner.id,
      localId: e.locais.almoxarifadoDeCampinas,
      saldo: 0,
      minimo: 3,
      abaixoDesde: new Date('2026-09-29T10:00:00.000Z'),
    });
    const daCarla = (await consultar('/estoque/abaixo-do-minimo')).json();
    const doToner = (itens: { consumivel: { id: string }; saldo: number }[]) =>
      itens.filter((item) => item.consumivel.id === toner.id);
    expect(doToner(daCarla.itens)).toEqual([
      expect.objectContaining({
        local: { id: e.locais.expedicao, caminho: 'Jundiaí › Expedição' },
        saldo: 1,
        minimo: 3,
        abaixoDesde: '2026-09-30T10:00:00.000Z',
      }),
    ]);
    const daAna = (await consultar('/estoque/abaixo-do-minimo', 'ana')).json();
    expect(doToner(daAna.itens).map((item) => item.saldo)).toEqual([0, 1]);
    expect((await consultar('/estoque/abaixo-do-minimo', 'davi')).statusCode).toBe(403);
  });
});

describe('movimentações do estoque', () => {
  it('Entradas da HP Brasil: filtra o tipo e o fornecedor, com a nota de cada uma', async () => {
    const toner = await tonerNovo();
    const outro = await criarFornecedor(api, e.org, { nome: 'Distribuidora Sul' });
    await entradaDe(toner.id, 5, { notaFiscal: 'NF-1' });
    await entradaDe(toner.id, 4, { fornecedor: outro, notaFiscal: 'NF-2' });
    await lancar('ajustes', {
      consumivel: toner.id,
      quantidade: 1,
      local: e.locais.almoxarifado,
      direcao: 'retirar',
      motivo: 'perda',
    });
    const r = await consultar(
      `/estoque/movimentos?tipo=entrada&fornecedor=${e.fornecedores.hp}&consumivel=${toner.id}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.json().itens).toEqual([
      expect.objectContaining({
        tipo: 'entrada',
        quantidade: 5,
        notaFiscal: 'NF-1',
        fornecedor: { id: e.fornecedores.hp, nome: 'HP Brasil', abrir: false },
      }),
    ]);
  });

  it('Fornecedor como referência: quem não vê os fornecedores lê o nome, sem a ficha', async () => {
    const toner = await tonerNovo();
    await entradaDe(toner.id, 2);
    const daCarla = (await consultar(`/estoque/movimentos?consumivel=${toner.id}`)).json();
    expect(daCarla.itens[0].fornecedor).toEqual({
      id: e.fornecedores.hp,
      nome: 'HP Brasil',
      abrir: false,
    });
    const daAna = (await consultar(`/estoque/movimentos?consumivel=${toner.id}`, 'ana')).json();
    expect(daAna.itens[0].fornecedor.abrir).toBe(true);
  });

  it('Toners da PAT-00412: as saídas para o ativo, com o contador de cada uma', async () => {
    const toner = await tonerNovo();
    await entradaDe(toner.id, 5);
    await gravarEstado(api, e.org, {
      ativoId: e.ativos.pat00412,
      coletorId: e.coletor,
      metrica: 'impressora.contador',
      item: '1',
      momento: new Date('2026-10-02T11:00:00.000Z'),
      valorNumero: 40_000,
    });
    const saida = (ativo: string) =>
      lancar('saidas', {
        consumivel: toner.id,
        quantidade: 1,
        origem: e.locais.almoxarifado,
        ativo,
      });
    await saida(e.ativos.pat00412);
    await saida(e.ativos.deCampinas);
    const r = await consultar(`/estoque/movimentos?ativo=${e.ativos.pat00412}`, 'ana');
    expect(r.json().itens).toEqual([
      expect.objectContaining({
        tipo: 'saida',
        consumivel: expect.objectContaining({ id: toner.id }),
        ativo: expect.objectContaining({ patrimonio: 'PAT-00412' }),
        contador: { paginas: 40_000, lidoEm: '2026-10-02T11:00:00.000Z' },
      }),
    ]);
  });

  it('mostra só as movimentações com a origem ou o destino no alcance, e filtra pelo local', async () => {
    const toner = await tonerNovo();
    await entradaDe(toner.id, 5, { destino: e.locais.almoxarifadoDeCampinas });
    await lancar('transferencias', {
      consumivel: toner.id,
      quantidade: 2,
      origem: e.locais.almoxarifadoDeCampinas,
      destino: e.locais.expedicao,
    });
    const tipos = (r: { json: () => { itens: { tipo: string }[] } }) =>
      r.json().itens.map((item) => item.tipo);
    expect(tipos(await consultar(`/estoque/movimentos?consumivel=${toner.id}`))).toEqual([
      'transferencia',
    ]);
    expect(tipos(await consultar(`/estoque/movimentos?consumivel=${toner.id}`, elisa))).toEqual([
      'transferencia',
      'entrada',
    ]);
    expect(
      tipos(
        await consultar(
          `/estoque/movimentos?consumivel=${toner.id}&local=${e.locais.campinas}`,
          'ana',
        ),
      ),
    ).toEqual(['transferencia', 'entrada']);
    expect(
      tipos(
        await consultar(
          `/estoque/movimentos?consumivel=${toner.id}&local=${e.locais.expedicao}`,
          'ana',
        ),
      ),
    ).toEqual(['transferencia']);
  });

  it('filtra pelo período e pagina da mais nova para a mais antiga', async () => {
    const toner = await tonerNovo();
    const inicio = api.relogio.agora();
    for (let i = 1; i <= 5; i += 1) {
      api.relogio.avancar(60_000);
      await entradaDe(toner.id, i);
    }
    const ate = api.relogio.agora();
    api.relogio.avancar(60_000);
    await entradaDe(toner.id, 6);
    const de = new Date(inicio.getTime() + 120_000).toISOString();
    const filtro = `consumivel=${toner.id}&de=${de}&ate=${ate.toISOString()}`;
    const primeira = (await consultar(`/estoque/movimentos?${filtro}&limite=2`, 'ana')).json();
    expect(primeira.total).toBe(4);
    const segunda = (
      await consultar(`/estoque/movimentos?${filtro}&limite=2&cursor=${primeira.proximo}`, 'ana')
    ).json();
    expect(segunda.proximo).toBeNull();
    expect(
      [...primeira.itens, ...segunda.itens].map((item: { quantidade: number }) => item.quantidade),
    ).toEqual([5, 4, 3, 2]);
  });
});

describe('quem recebe o evento do estoque', () => {
  it('Saída lançada com o estoque aberto: recebe quem vê o estoque do local, e não quem vê outro', async () => {
    const toner = await tonerNovo();
    await definirSaldo(api, e.org, {
      consumivelId: toner.id,
      localId: e.locais.almoxarifado,
      saldo: 3,
    });
    const doBruno = await abrirEventos(api, host, e.entradas.bruno);
    const daElisa = await abrirEventos(api, host, elisa);
    try {
      await vi.waitFor(() => {
        expect(doBruno.mensagens.length).toBeGreaterThan(0);
        expect(daElisa.mensagens.length).toBeGreaterThan(0);
      });
      await lancar('saidas', {
        consumivel: toner.id,
        quantidade: 1,
        origem: e.locais.almoxarifado,
        ativo: e.ativos.pat00412,
      });
      await entradaDe(toner.id, 1, { destino: e.locais.almoxarifadoDeCampinas });
      const doEstoque = (fluxo: typeof doBruno) =>
        fluxo.mensagens.filter((mensagem) => mensagem.evento === 'estoque.mudou');
      await vi.waitFor(() => expect(doEstoque(doBruno)).toHaveLength(2), { timeout: 2000 });
      await vi.waitFor(() => expect(doEstoque(daElisa)).toHaveLength(1), { timeout: 2000 });
      expect(doEstoque(daElisa)[0]?.dados).toEqual({
        id: expect.any(String),
        tipo: 'estoque.mudou',
        momento: expect.any(String),
        alvo: { tipo: 'consumivel', id: toner.id },
      });
    } finally {
      doBruno.fechar();
      daElisa.fechar();
    }
  });
});
