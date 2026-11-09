// A saída e a transferência do estoque pela API (spec estoque, "Movimentação do estoque", "Saldo
// que nunca fica negativo", "Contador de páginas na saída" e "Quem vê e quem movimenta o estoque";
// auditoria, "Eventos do estoque registrados"; change p4c-estoque, design, decisões 3 a 5): o ativo
// que a conta vê, o contador de páginas lido na hora, a ordem dos locais da transferência e os
// lançamentos ao mesmo tempo.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gravarEstado } from '../../test/alertas.ts';
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

const host = 'grafite.estoque-saida.local';

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

let codigos = 0;
/** Um consumível só do teste, com o saldo dado no Almoxarifado de Jundiaí. */
async function tonerCom(saldo: number, situacao: 'ativo' | 'inativo' = 'ativo') {
  codigos += 1;
  const codigo = `CE${300 + codigos}A`;
  const id = await criarConsumivel(api, e.org, { codigo, situacao });
  await definirSaldo(api, e.org, { consumivelId: id, localId: e.locais.almoxarifado, saldo });
  return { id, codigo };
}

const saida = (pedido: object, usuario: UsuarioDoEstoque = 'carla') =>
  e.cliente.enviar('POST', '/estoque/saidas', e.entradas[usuario], {
    quantidade: 1,
    origem: e.locais.almoxarifado,
    ativo: e.ativos.pat00412,
    ...pedido,
  });

const transferencia = (pedido: object, usuario: UsuarioDoEstoque = 'carla') =>
  e.cliente.enviar('POST', '/estoque/transferencias', e.entradas[usuario], {
    quantidade: 3,
    origem: e.locais.almoxarifado,
    destino: e.locais.expedicao,
    ...pedido,
  });

const saldoDe = async (consumivelId: string, localId: string) =>
  (await saldosDa(api, e.org)).find(
    (linha) => linha.consumivelId === consumivelId && linha.localId === localId,
  )?.saldo ?? 0;

const eventosGravados = () =>
  naOrganizacao(api.banco, e.org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, permissao: eventos.permissao, locais: eventos.locais })
      .from(eventos),
  );

describe('saída do estoque', () => {
  it('Saída para a impressora: tira do saldo da origem e mostra o ativo', async () => {
    const toner = await tonerCom(4);
    const r = await saida({ consumivel: toner.id });
    expect(r.statusCode).toBe(201);
    expect(r.json().movimento).toMatchObject({
      tipo: 'saida',
      quantidade: 1,
      origem: { id: e.locais.almoxarifado, caminho: 'Jundiaí › Almoxarifado' },
      destino: null,
      ativo: {
        id: e.ativos.pat00412,
        rotulo: 'HP LaserJet M404',
        patrimonio: 'PAT-00412',
        abrir: true,
      },
      contador: null,
    });
    expect(r.json().saldos).toEqual([expect.objectContaining({ saldo: 3 })]);
    expect(await saldoDe(toner.id, e.locais.almoxarifado)).toBe(3);
  });

  it('Saída registrada: a auditoria guarda o consumível, a quantidade, a origem e o ativo', async () => {
    const toner = await tonerCom(2);
    const r = await saida({ consumivel: toner.id }, 'ana');
    const [registro] = await auditoriaDaRequisicao(api, e.org, r);
    expect(registro).toMatchObject({
      acao: 'estoque.saida',
      atorContaId: e.contas.ana,
      alvoTipo: 'consumivel',
      alvoId: toner.id,
      momento: api.relogio.agora(),
      depois: {
        consumivel: toner.codigo,
        quantidade: 1,
        origem: 'Jundiaí › Almoxarifado',
        ativo: 'HP LaserJet M404 · PAT-00412',
      },
    });
    expect(await eventosGravados()).toEqual([
      { tipo: 'estoque.mudou', permissao: 'estoque.ver', locais: [e.locais.almoxarifado] },
    ]);
  });

  it('Toner trocado na impressora monitorada: guarda o total de páginas lido e o momento', async () => {
    const toner = await tonerCom(2);
    const lidoEm = new Date('2026-10-02T14:32:00.000Z');
    await gravarEstado(api, e.org, {
      ativoId: e.ativos.pat00412,
      coletorId: e.coletor,
      metrica: 'impressora.contador',
      item: '2',
      momento: lidoEm,
      valorNumero: 8_120,
    });
    await gravarEstado(api, e.org, {
      ativoId: e.ativos.pat00412,
      coletorId: e.coletor,
      metrica: 'impressora.contador',
      item: '1',
      momento: lidoEm,
      valorNumero: 45_210,
    });
    const r = await saida({ consumivel: toner.id });
    expect(r.json().movimento.contador).toEqual({
      paginas: 45_210,
      lidoEm: lidoEm.toISOString(),
    });
    const [registro] = await auditoriaDaRequisicao(api, e.org, r);
    expect(registro?.depois).toMatchObject({
      contador: 45_210,
      contadorLidoEm: lidoEm.toISOString(),
    });
    // O total sem leitura válida não vai para a saída.
    await gravarEstado(api, e.org, {
      ativoId: e.ativos.pat00412,
      coletorId: e.coletor,
      metrica: 'impressora.contador',
      item: '1',
      momento: lidoEm,
      situacao: 'sem-dado',
    });
    expect((await saida({ consumivel: toner.id })).json().movimento.contador).toBeNull();
  });

  it('Ativo sem leitura: a saída é lançada sem o contador', async () => {
    const toner = await tonerCom(1);
    const r = await saida({ consumivel: toner.id, ativo: e.ativos.deCampinas }, 'ana');
    expect(r.statusCode).toBe(201);
    expect(r.json().movimento.contador).toBeNull();
  });

  it('Saída maior que o saldo: recusa com o saldo, e o saldo continua', async () => {
    const toner = await tonerCom(2);
    const r = await saida({ consumivel: toner.id, quantidade: 3 });
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({
      quantidade: `O saldo do ${toner.codigo} em Jundiaí › Almoxarifado é 2.`,
    });
    expect(await saldoDe(toner.id, e.locais.almoxarifado)).toBe(2);
  });

  it('Duas saídas ao mesmo tempo: uma é lançada, a outra é recusada pelo saldo', async () => {
    const toner = await tonerCom(1);
    const respostas = await Promise.all([
      saida({ consumivel: toner.id }, 'ana'),
      saida({ consumivel: toner.id }, 'carla'),
    ]);
    expect(respostas.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await saldoDe(toner.id, e.locais.almoxarifado)).toBe(0);
    const lancadas = (await movimentosDa(api, e.org)).filter(
      (movimento) => movimento.consumivelId === toner.id,
    );
    expect(lancadas).toHaveLength(1);
  });

  it('Toner que saiu de linha: a saída do inativo é lançada, e a entrada é recusada', async () => {
    const toner = await tonerCom(4, 'inativo');
    expect((await saida({ consumivel: toner.id })).statusCode).toBe(201);
    const entrada = await e.cliente.enviar('POST', '/estoque/entradas', e.entradas.carla, {
      consumivel: toner.id,
      quantidade: 1,
      destino: e.locais.almoxarifado,
      fornecedor: e.fornecedores.hp,
      notaFiscal: '12345',
    });
    expect(entrada.json().campos).toEqual({
      consumivel: 'O consumível escolhido está inativo. Escolha um consumível ativo.',
    });
  });

  it('recusa o ativo inativo, o que a conta não vê e o que não existe', async () => {
    const toner = await tonerCom(5);
    const inativo = await saida({ consumivel: toner.id, ativo: e.ativos.inativa });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({ ativo: 'O ativo escolhido está inativo.' });
    const deOutraUnidade = await saida({ consumivel: toner.id, ativo: e.ativos.deCampinas });
    expect(deOutraUnidade.statusCode).toBe(400);
    expect(deOutraUnidade.json().campos).toEqual({ ativo: 'Ativo não encontrado.' });
    const semAtivo = await saida({ consumivel: toner.id, ativo: null });
    expect(semAtivo.json().campos).toEqual({ ativo: 'Escolha o ativo.' });
    expect(await saldoDe(toner.id, e.locais.almoxarifado)).toBe(5);
  });

  it('Saída sem a permissão: quem só vê o estoque recebe 403', async () => {
    const toner = await tonerCom(1);
    expect((await saida({ consumivel: toner.id }, 'bruno')).statusCode).toBe(403);
    expect(await saldoDe(toner.id, e.locais.almoxarifado)).toBe(1);
  });
});

describe('transferência no estoque', () => {
  it('Transferência para a Expedição: uma movimentação só, com a origem e o destino', async () => {
    const toner = await tonerCom(8);
    const r = await transferencia({ consumivel: toner.id });
    expect(r.statusCode).toBe(201);
    expect(r.json().movimento).toMatchObject({
      tipo: 'transferencia',
      quantidade: 3,
      origem: { id: e.locais.almoxarifado, caminho: 'Jundiaí › Almoxarifado' },
      destino: { id: e.locais.expedicao, caminho: 'Jundiaí › Expedição' },
    });
    expect(r.json().saldos).toEqual([
      expect.objectContaining({
        local: expect.objectContaining({ id: e.locais.almoxarifado }),
        saldo: 5,
      }),
      expect.objectContaining({
        local: expect.objectContaining({ id: e.locais.expedicao }),
        saldo: 3,
      }),
    ]);
    expect(await eventosGravados()).toEqual([
      {
        tipo: 'estoque.mudou',
        permissao: 'estoque.ver',
        locais: [e.locais.almoxarifado, e.locais.expedicao],
      },
    ]);
    const [registro] = await auditoriaDaRequisicao(api, e.org, r);
    expect(registro).toMatchObject({
      acao: 'estoque.transferencia',
      depois: { origem: 'Jundiaí › Almoxarifado', destino: 'Jundiaí › Expedição', quantidade: 3 },
    });
  });

  it('Transferência para outra unidade: 403 fora do alcance, e nada é lançado', async () => {
    const toner = await tonerCom(8);
    const r = await transferencia({
      consumivel: toner.id,
      destino: e.locais.almoxarifadoDeCampinas,
    });
    expect(r.statusCode).toBe(403);
    expect(await saldoDe(toner.id, e.locais.almoxarifado)).toBe(8);
    expect(
      (await movimentosDa(api, e.org)).filter((movimento) => movimento.consumivelId === toner.id),
    ).toEqual([]);
  });

  it('recusa o destino igual à origem, o destino inativo e o consumível inativo', async () => {
    const toner = await tonerCom(8);
    expect(
      (await transferencia({ consumivel: toner.id, destino: e.locais.almoxarifado })).json().campos,
    ).toEqual({ destino: 'Escolha um destino diferente da origem.' });
    expect(
      (await transferencia({ consumivel: toner.id, destino: e.locais.deposito })).json().campos,
    ).toEqual({ destino: 'O local escolhido está inativo. Escolha um local ativo.' });
    const antigo = await tonerCom(2, 'inativo');
    expect((await transferencia({ consumivel: antigo.id, quantidade: 1 })).json().campos).toEqual({
      consumivel: 'O consumível escolhido está inativo. Escolha um consumível ativo.',
    });
  });

  it('tira do local inativo o que sobrou nele', async () => {
    codigos += 1;
    const id = await criarConsumivel(api, e.org, { codigo: `CE${300 + codigos}A` });
    await definirSaldo(api, e.org, { consumivelId: id, localId: e.locais.deposito, saldo: 2 });
    const r = await transferencia({ consumivel: id, origem: e.locais.deposito, quantidade: 2 });
    expect(r.statusCode).toBe(201);
    expect(await saldoDe(id, e.locais.deposito)).toBe(0);
    expect(await saldoDe(id, e.locais.expedicao)).toBe(2);
  });

  it('duas transferências em sentidos opostos ao mesmo tempo não se travam', async () => {
    const toner = await tonerCom(10);
    await definirSaldo(api, e.org, {
      consumivelId: toner.id,
      localId: e.locais.expedicao,
      saldo: 10,
    });
    const respostas = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        i % 2 === 0
          ? transferencia({ consumivel: toner.id, quantidade: 1 }, 'ana')
          : transferencia(
              {
                consumivel: toner.id,
                quantidade: 1,
                origem: e.locais.expedicao,
                destino: e.locais.almoxarifado,
              },
              'carla',
            ),
      ),
    );
    expect(respostas.map((r) => r.statusCode)).toEqual([201, 201, 201, 201, 201, 201]);
    expect(await saldoDe(toner.id, e.locais.almoxarifado)).toBe(10);
    expect(await saldoDe(toner.id, e.locais.expedicao)).toBe(10);
  });
});
