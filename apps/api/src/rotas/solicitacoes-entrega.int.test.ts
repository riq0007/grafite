// A entrega do toner pela API (spec solicitacoes, "Entrega do toner" e "Alteração da solicitação";
// spec estoque, "Movimentação do estoque" e "Saldo que nunca fica negativo"; change
// p4d-solicitacoes, design, decisão 4): do estoque, pelo lançamento da saída da P4c na transação da
// entrega, ou pelo fornecedor, sem movimentação; tudo ou nada; e o item entregue, que não muda.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gravarEstado } from '../../test/alertas.ts';
import { definirSaldo, movimentosDa, saldosDa } from '../../test/estoque.ts';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';
import {
  montarSolicitacoes,
  type SolicitacoesDeTeste,
  type UsuarioDasSolicitacoes,
} from '../../test/solicitacoes.ts';

const host = 'grafite.solicitacoes-entrega.local';

let api: ApiDeTeste;
let s: SolicitacoesDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  s = await montarSolicitacoes(api, host);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
});

const enviar = (caminho: string, corpo: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('POST', caminho, s.entradas[usuario], corpo);

interface Pedido {
  impressora: string;
  quantidade: number;
}

/** O item como a solicitação lida o traz. */
interface ItemLido {
  quantidade: number;
  entrega: object | null;
}

/** Um toner preto para cada impressora dada, e os ids dos itens na ordem delas. */
async function toner(pedidos: Pedido[]) {
  const r = await enviar('/solicitacoes', {
    tipo: 'toner',
    pessoa: s.pessoas.joana,
    impressoras: pedidos.map(({ impressora }) => impressora),
    itens: pedidos.map(({ impressora, quantidade }) => ({ impressora, cor: 'preto', quantidade })),
  });
  expect(r.statusCode).toBe(201);
  const solicitacao = r.json();
  const itens: string[] = solicitacao.impressoras.map(
    ({ itens: [item] }: { itens: { id: string }[] }) => item?.id ?? '',
  );
  return { numero: solicitacao.numero as number, itens };
}

const entregar = (numero: number, entregas: object[], usuario: UsuarioDasSolicitacoes = 'carla') =>
  enviar(`/solicitacoes/${numero}/entrega`, { entregas }, usuario);

const doEstoque = (item: string) => ({
  item,
  origem: 'estoque',
  consumivel: s.consumiveis.cf258a,
  local: s.locais.almoxarifado,
});

const saldoNoAlmoxarifado = async () =>
  (await saldosDa(api, s.org)).find(
    ({ consumivelId, localId }) =>
      consumivelId === s.consumiveis.cf258a && localId === s.locais.almoxarifado,
  )?.saldo ?? 0;

const comSaldo = (saldo: number) =>
  definirSaldo(api, s.org, {
    consumivelId: s.consumiveis.cf258a,
    localId: s.locais.almoxarifado,
    saldo,
  });

describe('entrega do estoque', () => {
  it('Toner do estoque: lança a saída para a impressora, com o total de páginas e o número, e conclui', async () => {
    await comSaldo(6);
    const lidoEm = new Date('2026-10-02T14:32:00.000Z');
    await gravarEstado(api, s.org, {
      ativoId: s.ativos.pat00412,
      coletorId: s.coletor,
      metrica: 'impressora.contador',
      item: '1',
      momento: lidoEm,
      valorNumero: 45_210,
    });
    const { numero, itens } = await toner([{ impressora: s.ativos.pat00412, quantidade: 1 }]);
    const r = await entregar(numero, itens.map(doEstoque));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'concluida',
      encerradaPor: { nome: 'Carla Dias' },
      impressoras: [
        {
          itens: [
            {
              consumivel: { codigo: 'CF258A' },
              entrega: {
                origem: 'estoque',
                local: { id: s.locais.almoxarifado, caminho: 'Jundiaí › Almoxarifado' },
                fornecedor: null,
                entreguePor: { nome: 'Carla Dias' },
                entregueEm: api.relogio.agora().toISOString(),
              },
            },
          ],
        },
      ],
    });
    expect(await saldoNoAlmoxarifado()).toBe(5);
    const saida = (await movimentosDa(api, s.org)).at(-1);
    expect(saida).toMatchObject({
      id: r.json().impressoras[0].itens[0].entrega.movimento,
      tipo: 'saida',
      ativoId: s.ativos.pat00412,
      origemId: s.locais.almoxarifado,
      quantidade: 1,
      observacao: `Solicitação ${numero}`,
      contadorPaginas: 45_210,
    });
    const registros = await auditoriaDaRequisicao(api, s.org, r);
    expect(registros.map(({ acao }) => acao)).toEqual(['estoque.saida', 'solicitacao.entregue']);
    expect(registros[1]).toMatchObject({
      antes: { situacao: 'aberta' },
      depois: {
        situacao: 'concluida',
        entregues: ['PAT-00412: 1 Preto do estoque, CF258A de Jundiaí › Almoxarifado'],
      },
    });
  });

  it('Entrega maior que o saldo: recusa no item, e nenhum item é entregue', async () => {
    await comSaldo(2);
    const { numero, itens } = await toner([
      { impressora: s.ativos.pat00412, quantidade: 2 },
      { impressora: s.ativos.pat00415, quantidade: 1 },
    ]);
    const r = await entregar(numero, itens.map(doEstoque));
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({
      'entregas.1.quantidade': 'O saldo do CF258A em Jundiaí › Almoxarifado é 0.',
    });
    expect(await saldoNoAlmoxarifado()).toBe(2);
    const alterada = await s.cliente.enviar('PATCH', `/solicitacoes/${numero}`, s.entradas.carla, {
      tipo: 'toner',
      pessoa: s.pessoas.joana,
      impressoras: [s.ativos.pat00412, s.ativos.pat00415],
      itens: [
        { impressora: s.ativos.pat00412, cor: 'preto', quantidade: 2 },
        { impressora: s.ativos.pat00415, cor: 'preto', quantidade: 1 },
      ],
    });
    expect(
      alterada
        .json()
        .impressoras.map(({ itens: [item] }: { itens: { entrega: unknown }[] }) => item?.entrega),
    ).toEqual([null, null]);
  });

  it('Entrega em parte, e Impressora com item entregue: fica, e a cor entregue não volta', async () => {
    await comSaldo(5);
    const { numero, itens } = await toner([
      { impressora: s.ativos.pat00412, quantidade: 1 },
      { impressora: s.ativos.pat00415, quantidade: 1 },
    ]);
    const r = await entregar(numero, [doEstoque(itens[0] ?? '')]);
    expect(r.statusCode).toBe(200);
    expect(r.json().situacao).toBe('aguardando-entrega');
    expect(r.json().impressoras[1].itens[0].entrega).toBeNull();

    const semAImpressora = await s.cliente.enviar(
      'PATCH',
      `/solicitacoes/${numero}`,
      s.entradas.carla,
      {
        tipo: 'toner',
        pessoa: s.pessoas.joana,
        impressoras: [s.ativos.pat00415],
        itens: [{ impressora: s.ativos.pat00415, cor: 'preto', quantidade: 1 }],
      },
    );
    expect(semAImpressora.statusCode).toBe(409);
    expect(semAImpressora.json().campos).toEqual({
      impressoras: 'PAT-00412 tem item entregue e fica na solicitação.',
    });
    const corEntregue = await s.cliente.enviar(
      'PATCH',
      `/solicitacoes/${numero}`,
      s.entradas.carla,
      {
        tipo: 'toner',
        pessoa: s.pessoas.joana,
        impressoras: [s.ativos.pat00412, s.ativos.pat00415],
        itens: [
          { impressora: s.ativos.pat00412, cor: 'preto', quantidade: 3 },
          { impressora: s.ativos.pat00415, cor: 'preto', quantidade: 1 },
        ],
      },
    );
    expect(corEntregue.statusCode).toBe(400);
    expect(corEntregue.json().campos).toEqual({
      'itens.0.cor': 'Essa cor já está pedida para essa impressora.',
    });
    const deNovo = await entregar(numero, [doEstoque(itens[0] ?? '')]);
    expect(deNovo.statusCode).toBe(409);
    expect(deNovo.json().campos).toEqual({ 'entregas.0.item': 'O item já foi entregue.' });

    // Impressora já entregue na alteração: ela fica sem item pendente, e o resto muda.
    const doResto = await s.cliente.enviar('PATCH', `/solicitacoes/${numero}`, s.entradas.carla, {
      tipo: 'toner',
      pessoa: s.pessoas.joana,
      impressoras: [s.ativos.pat00412, s.ativos.pat00415],
      itens: [{ impressora: s.ativos.pat00415, cor: 'preto', quantidade: 2 }],
    });
    expect(doResto.statusCode).toBe(200);
    expect(
      doResto
        .json()
        .impressoras.map(({ itens: daImpressora }: { itens: ItemLido[] }) =>
          daImpressora.map(({ quantidade, entrega }) => [quantidade, entrega !== null]),
        ),
    ).toEqual([[[1, true]], [[2, false]]]);
  });

  it('Sem movimentar o estoque: a API recusa a entrega do estoque com 403, e a do fornecedor passa', async () => {
    await comSaldo(5);
    const { numero, itens } = await toner([{ impressora: s.ativos.pat00412, quantidade: 1 }]);
    const doEstoqueDaEva = await entregar(numero, itens.map(doEstoque), 'eva');
    expect(doEstoqueDaEva.statusCode).toBe(403);
    expect(await saldoNoAlmoxarifado()).toBe(5);
    const peloFornecedor = await entregar(
      numero,
      itens.map((item) => ({ item, origem: 'fornecedor', fornecedor: s.fornecedores.hp })),
      'eva',
    );
    expect(peloFornecedor.statusCode).toBe(200);
    expect(peloFornecedor.json().situacao).toBe('concluida');
  });
});

describe('entrega pelo fornecedor', () => {
  it('Toner que veio da locadora: entregue pelo fornecedor do pedido, sem movimentação', async () => {
    const { numero, itens } = await toner([{ impressora: s.ativos.pat00412, quantidade: 1 }]);
    const semFornecedor = await entregar(
      numero,
      itens.map((item) => ({ item, origem: 'fornecedor' })),
    );
    expect(semFornecedor.statusCode).toBe(400);
    expect(semFornecedor.json().campos).toEqual({
      'entregas.0.fornecedor': 'Escolha o fornecedor.',
    });
    await enviar(`/solicitacoes/${numero}/pedido`, {
      fornecedor: s.fornecedores.hp,
      os: 'OS-7781',
    });
    const movimentosAntes = (await movimentosDa(api, s.org)).length;
    const r = await entregar(
      numero,
      itens.map((item) => ({ item, origem: 'fornecedor' })),
    );
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'concluida',
      impressoras: [
        {
          itens: [
            {
              entrega: {
                origem: 'fornecedor',
                local: null,
                movimento: null,
                fornecedor: { id: s.fornecedores.hp, nome: 'HP Brasil' },
              },
            },
          ],
        },
      ],
    });
    expect((await movimentosDa(api, s.org)).length).toBe(movimentosAntes);
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'solicitacao.entregue',
        depois: { entregues: ['PAT-00412: 1 Preto pela HP Brasil'] },
      },
    ]);
  });

  it('recusa o item de outra solicitação, a entrega vazia e o conserto', async () => {
    const um = await toner([{ impressora: s.ativos.pat00412, quantidade: 1 }]);
    const outro = await toner([{ impressora: s.ativos.pat00412, quantidade: 1 }]);
    const deOutra = await entregar(um.numero, [doEstoque(outro.itens[0] ?? '')]);
    expect(deOutra.statusCode).toBe(400);
    expect(deOutra.json().campos).toEqual({ 'entregas.0.item': 'Item não encontrado.' });
    const vazia = await entregar(um.numero, []);
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json().campos).toEqual({ itens: 'Escolha os itens a entregar.' });
    const conserto = (
      await enviar('/solicitacoes', {
        tipo: 'conserto',
        pessoa: s.pessoas.joana,
        ativo: s.ativos.nb0031,
        defeito: 'Não liga',
      })
    ).json().numero;
    const r = await entregar(conserto, [doEstoque(um.itens[0] ?? '')]);
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe('A entrega vale só para o toner.');
  });
});
