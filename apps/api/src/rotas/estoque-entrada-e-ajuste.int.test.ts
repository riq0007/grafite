// A entrada e o ajuste do estoque pela API (spec estoque, "Movimentação do estoque", "Saldo que nunca
// fica negativo", "Mínimo do consumível no local" e "Quem vê e quem movimenta o estoque"; change
// p4c-estoque, design, decisões 3 e 5): o lançamento numa transação, com as recusas no campo, os
// inativos que cada tipo aceita, o saldo condicional, o momento do abaixo do mínimo, a auditoria, o
// evento para quem vê o estoque dos locais e o 403 fora do alcance.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  criarConsumivel,
  definirSaldo,
  type EstoqueDeTeste,
  montarEstoque,
  movimentosDa,
  saldosDa,
  type UsuarioDoEstoque,
} from '../../test/estoque.ts';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';

const host = 'grafite.estoque-entrada.local';

let api: ApiDeTeste;
let e: EstoqueDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  e = await montarEstoque(api, host);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, e.org, (tx) => tx.delete(eventos));
});

const lancar = (caminho: string, pedido: object, usuario: UsuarioDoEstoque = 'carla') =>
  e.cliente.enviar('POST', `/estoque/${caminho}`, e.entradas[usuario], pedido);

const entrada = (pedido: object = {}, usuario: UsuarioDoEstoque = 'carla') =>
  lancar(
    'entradas',
    {
      consumivel: e.consumiveis.cf258a,
      quantidade: 10,
      destino: e.locais.almoxarifado,
      fornecedor: e.fornecedores.hp,
      notaFiscal: '12345',
      ...pedido,
    },
    usuario,
  );

const ajuste = (pedido: object = {}, usuario: UsuarioDoEstoque = 'carla') =>
  lancar(
    'ajustes',
    {
      consumivel: e.consumiveis.cf258a,
      quantidade: 1,
      local: e.locais.almoxarifado,
      direcao: 'retirar',
      motivo: 'inventario',
      ...pedido,
    },
    usuario,
  );

const eventosGravados = () =>
  naOrganizacao(api.banco, e.org, (tx) =>
    tx
      .select({
        tipo: eventos.tipo,
        alvoTipo: eventos.alvoTipo,
        alvoId: eventos.alvoId,
        permissao: eventos.permissao,
        locais: eventos.locais,
      })
      .from(eventos),
  );

const saldoDe = async (consumivelId: string, localId: string) =>
  (await saldosDa(api, e.org)).find(
    (linha) => linha.consumivelId === consumivelId && linha.localId === localId,
  );

/** Um consumível só deste teste, para o saldo começar do zero. */
let codigos = 0;
const codigoDoUltimo = () => `TN${1000 + codigos}`;
function consumivelNovo(situacao: 'ativo' | 'inativo' = 'ativo') {
  codigos += 1;
  return criarConsumivel(api, e.org, { codigo: codigoDoUltimo(), situacao });
}

describe('entrada no estoque', () => {
  it('Entrada de toners: soma no saldo do destino, com o fornecedor, a nota, quem lançou e quando', async () => {
    const toner = await consumivelNovo();
    const r = await entrada({ consumivel: toner, observacao: '  Pedido 778  ' });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({
      movimento: {
        id: expect.any(String),
        tipo: 'entrada',
        consumivel: expect.objectContaining({ id: toner, abrir: false }),
        quantidade: 10,
        origem: null,
        destino: { id: e.locais.almoxarifado, caminho: 'Jundiaí › Almoxarifado' },
        fornecedor: { id: e.fornecedores.hp, nome: 'HP Brasil', abrir: false },
        notaFiscal: '12345',
        ativo: null,
        contador: null,
        motivo: null,
        observacao: 'Pedido 778',
        lancadoPor: { id: e.contas.carla, nome: 'Carla Dias' },
        momento: api.relogio.agora().toISOString(),
      },
      saldos: [
        expect.objectContaining({
          consumivel: expect.objectContaining({ id: toner }),
          local: { id: e.locais.almoxarifado, caminho: 'Jundiaí › Almoxarifado' },
          saldo: 10,
          minimo: 0,
          situacao: 'em-estoque',
          abaixoDesde: null,
          permite: { movimentar: true },
        }),
      ],
    });
    expect((await entrada({ consumivel: toner, quantidade: 5 })).statusCode).toBe(201);
    expect(await saldoDe(toner, e.locais.almoxarifado)).toMatchObject({ saldo: 15 });
  });

  it('a administradora abre o consumível e o fornecedor; a almoxarife, não', async () => {
    const r = await entrada({}, 'ana');
    expect(r.statusCode).toBe(201);
    expect(r.json().movimento.consumivel).toEqual({
      id: e.consumiveis.cf258a,
      codigo: 'CF258A',
      nome: 'HP 58A',
      tipo: 'toner',
      cor: 'preto',
      situacao: 'ativo',
      abrir: true,
    });
    expect(r.json().movimento.fornecedor).toMatchObject({ abrir: true });
  });

  it('registra a entrada na auditoria, no consumível, e avisa quem vê o estoque do destino', async () => {
    const r = await entrada();
    const [registro] = await auditoriaDaRequisicao(api, e.org, r);
    expect(registro).toMatchObject({
      acao: 'estoque.entrada',
      atorContaId: e.contas.carla,
      alvoTipo: 'consumivel',
      alvoId: e.consumiveis.cf258a,
      depois: {
        consumivel: 'CF258A',
        quantidade: 10,
        destino: 'Jundiaí › Almoxarifado',
        fornecedor: 'HP Brasil',
        notaFiscal: '12345',
      },
    });
    expect(await eventosGravados()).toEqual([
      {
        tipo: 'estoque.mudou',
        alvoTipo: 'consumivel',
        alvoId: e.consumiveis.cf258a,
        permissao: 'estoque.ver',
        locais: [e.locais.almoxarifado],
      },
    ]);
  });

  it('recusa os campos pelo domínio, no campo, sem lançar nada', async () => {
    const antes = (await movimentosDa(api, e.org)).length;
    const r = await lancar('entradas', { quantidade: 0, notaFiscal: 'N'.repeat(41) });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      consumivel: 'Escolha o consumível.',
      quantidade: 'Use um número inteiro de 1 a 100.000.',
      destino: 'Escolha o local.',
      fornecedor: 'Escolha o fornecedor.',
      notaFiscal: 'Use até 40 caracteres.',
    });
    expect((await entrada({ quantidade: 2.5 })).json().campos).toEqual({
      quantidade: 'Use um número inteiro de 1 a 100.000.',
    });
    expect((await entrada({ notaFiscal: '   ' })).json().campos).toEqual({
      notaFiscal: 'Informe o número da nota fiscal.',
    });
    expect((await movimentosDa(api, e.org)).length).toBe(antes);
  });

  it('recusa o consumível, o local e o fornecedor que não existem', async () => {
    const outro = '0190a0b0-0000-7000-8000-000000000000';
    expect((await entrada({ consumivel: outro }, 'ana')).json().campos).toEqual({
      consumivel: 'Consumível não encontrado.',
    });
    expect((await entrada({ destino: outro }, 'ana')).json().campos).toEqual({
      destino: 'Local não encontrado.',
    });
    expect((await entrada({ fornecedor: outro }, 'ana')).json().campos).toEqual({
      fornecedor: 'Fornecedor não encontrado.',
    });
  });

  it('Fornecedor inativo na entrada: recusa no campo Fornecedor, e nada é lançado', async () => {
    const antes = (await movimentosDa(api, e.org)).length;
    const r = await entrada({ fornecedor: e.fornecedores.locadora });
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({
      fornecedor: 'O fornecedor escolhido está inativo. Escolha um fornecedor ativo.',
    });
    expect((await movimentosDa(api, e.org)).length).toBe(antes);
  });

  it('recusa a entrada do consumível inativo e no local inativo', async () => {
    expect((await entrada({ consumivel: e.consumiveis.cf280a })).json().campos).toEqual({
      consumivel: 'O consumível escolhido está inativo. Escolha um consumível ativo.',
    });
    expect((await entrada({ destino: e.locais.deposito })).json().campos).toEqual({
      destino: 'O local escolhido está inativo. Escolha um local ativo.',
    });
  });

  it('Almoxarife de Jundiaí: lança nos locais de Jundiaí, e não nos de Campinas', async () => {
    expect((await entrada({ destino: e.locais.expedicao })).statusCode).toBe(201);
    const antes = (await movimentosDa(api, e.org)).length;
    const r = await entrada({ destino: e.locais.almoxarifadoDeCampinas });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ permissao: 'estoque.movimentar' });
    expect((await movimentosDa(api, e.org)).length).toBe(antes);
    expect(await eventosGravados()).toEqual([
      expect.objectContaining({ locais: [e.locais.expedicao] }),
    ]);
  });

  it('recusa com 403 quem só vê o estoque e quem não o vê', async () => {
    expect((await entrada({}, 'bruno')).statusCode).toBe(403);
    expect((await entrada({}, 'davi')).statusCode).toBe(403);
  });
});

describe('ajuste do estoque', () => {
  it('Ajuste do inventário: retira do saldo, com o motivo', async () => {
    const toner = await consumivelNovo();
    await definirSaldo(api, e.org, {
      consumivelId: toner,
      localId: e.locais.almoxarifado,
      saldo: 8,
    });
    const r = await ajuste({ consumivel: toner });
    expect(r.statusCode).toBe(201);
    expect(r.json().movimento).toMatchObject({
      tipo: 'ajuste',
      quantidade: 1,
      origem: { id: e.locais.almoxarifado, caminho: 'Jundiaí › Almoxarifado' },
      destino: null,
      motivo: 'inventario',
    });
    expect(r.json().saldos).toEqual([expect.objectContaining({ saldo: 7 })]);
    const [registro] = await auditoriaDaRequisicao(api, e.org, r);
    expect(registro).toMatchObject({
      acao: 'estoque.ajuste',
      depois: { quantidade: 1, origem: 'Jundiaí › Almoxarifado', motivo: 'inventario' },
    });
  });

  it('acrescenta no destino, com o motivo Outro e a observação', async () => {
    const toner = await consumivelNovo();
    const r = await ajuste({
      consumivel: toner,
      quantidade: 3,
      direcao: 'acrescentar',
      motivo: 'outro',
      observacao: 'Achado na sala do CPD',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().movimento).toMatchObject({
      origem: null,
      destino: { id: e.locais.almoxarifado },
      motivo: 'outro',
      observacao: 'Achado na sala do CPD',
    });
    expect(await saldoDe(toner, e.locais.almoxarifado)).toMatchObject({ saldo: 3 });
  });

  it('Ajuste sem a observação: recusa no campo Observação, e nada é lançado', async () => {
    const antes = (await movimentosDa(api, e.org)).length;
    const r = await ajuste({ motivo: 'outro', observacao: '  ' });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ observacao: 'Descreva o motivo na observação.' });
    const semDirecao = await ajuste({ direcao: null, motivo: null });
    expect(semDirecao.json().campos).toEqual({
      direcao: 'Escolha se o ajuste acrescenta ou retira.',
      motivo: 'Escolha o motivo.',
    });
    expect((await movimentosDa(api, e.org)).length).toBe(antes);
  });

  it('recusa retirar mais que o saldo, com o saldo lido na hora, no campo Quantidade', async () => {
    const toner = await consumivelNovo();
    await definirSaldo(api, e.org, {
      consumivelId: toner,
      localId: e.locais.almoxarifado,
      saldo: 2,
    });
    const r = await ajuste({ consumivel: toner, quantidade: 3 });
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({
      quantidade: `O saldo do ${codigoDoUltimo()} em Jundiaí › Almoxarifado é 2.`,
    });
    expect(await saldoDe(toner, e.locais.almoxarifado)).toMatchObject({ saldo: 2 });
    const semSaldo = await ajuste({ consumivel: toner, local: e.locais.expedicao });
    expect(semSaldo.json().campos).toEqual({
      quantidade: `O saldo do ${codigoDoUltimo()} em Jundiaí › Expedição é 0.`,
    });
  });

  it('retira o que sobrou do consumível inativo e do local inativo, e não acrescenta neles', async () => {
    const antigo = await consumivelNovo('inativo');
    await definirSaldo(api, e.org, { consumivelId: antigo, localId: e.locais.deposito, saldo: 4 });
    const r = await ajuste({
      consumivel: antigo,
      local: e.locais.deposito,
      quantidade: 4,
      motivo: 'devolucao-ao-fornecedor',
    });
    expect(r.statusCode).toBe(201);
    expect(await saldoDe(antigo, e.locais.deposito)).toMatchObject({ saldo: 0 });
    const acrescentar = await ajuste({
      consumivel: antigo,
      local: e.locais.deposito,
      direcao: 'acrescentar',
    });
    expect(acrescentar.statusCode).toBe(409);
    expect(acrescentar.json().campos).toEqual({
      consumivel: 'O consumível escolhido está inativo. Escolha um consumível ativo.',
      local: 'O local escolhido está inativo. Escolha um local ativo.',
    });
  });

  it('marca o momento em que o saldo fica abaixo do mínimo e o limpa quando volta', async () => {
    const toner = await consumivelNovo();
    await definirSaldo(api, e.org, {
      consumivelId: toner,
      localId: e.locais.almoxarifado,
      saldo: 5,
      minimo: 5,
    });
    const abaixo = await ajuste({ consumivel: toner, motivo: 'perda' });
    expect(abaixo.json().saldos).toEqual([
      expect.objectContaining({
        saldo: 4,
        minimo: 5,
        situacao: 'abaixo-do-minimo',
        abaixoDesde: api.relogio.agora().toISOString(),
      }),
    ]);
    const desde = api.relogio.agora();
    api.relogio.avancar(60_000);
    const continua = await ajuste({ consumivel: toner, motivo: 'avaria' });
    expect(continua.json().saldos).toEqual([
      expect.objectContaining({ saldo: 3, abaixoDesde: desde.toISOString() }),
    ]);
    const repoe = await entrada({ consumivel: toner, quantidade: 10 });
    expect(repoe.json().saldos).toEqual([
      expect.objectContaining({ saldo: 13, situacao: 'em-estoque', abaixoDesde: null }),
    ]);
  });
});
