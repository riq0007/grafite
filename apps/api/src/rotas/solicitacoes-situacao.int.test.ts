// A situação das solicitações pela API (spec solicitacoes, "Situação da solicitação", "Pedido ao
// fornecedor", "Alteração da solicitação" e "Mudança da situação em lote"; auditoria, "Eventos das
// solicitações registrados"; change p4d-solicitacoes, design, decisão 5): a mudança de uma, o pedido
// ao fornecedor, a conclusão, o cancelamento e o lote, em que cada uma muda ou fica como estava.
import { auditoria, eventos, movimentosDoEstoque, naOrganizacao, solicitacoes } from '@grafite/db';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';
import {
  montarSolicitacoes,
  type SolicitacoesDeTeste,
  type UsuarioDasSolicitacoes,
} from '../../test/solicitacoes.ts';

const host = 'grafite.solicitacoes-situacao.local';

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

async function toner(usuario: UsuarioDasSolicitacoes = 'carla'): Promise<number> {
  const r = await enviar(
    '/solicitacoes',
    {
      tipo: 'toner',
      pessoa: s.pessoas.joana,
      impressoras: [s.ativos.pat00412],
      itens: [{ impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 }],
    },
    usuario,
  );
  return r.json().numero;
}

async function conserto(): Promise<number> {
  const r = await enviar('/solicitacoes', {
    tipo: 'conserto',
    pessoa: s.pessoas.joana,
    ativo: s.ativos.nb0031,
    defeito: 'Não liga',
  });
  return r.json().numero;
}

const situacao = (numero: number, nova: string) =>
  enviar(`/solicitacoes/${numero}/situacao`, { situacao: nova });

const pedido = (numero: number, corpo: object) => enviar(`/solicitacoes/${numero}/pedido`, corpo);

const lote = (corpo: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  enviar('/solicitacoes/situacao', corpo, usuario);

describe('situação de uma solicitação', () => {
  it('Notebook consertado: em atendimento e depois concluído, com o que foi feito', async () => {
    const numero = await conserto();
    const atendendo = await situacao(numero, 'em-atendimento');
    expect(atendendo.statusCode).toBe(200);
    expect(atendendo.json().situacao).toBe('em-atendimento');
    const r = await enviar(`/solicitacoes/${numero}/conclusao`, {
      oQueFoiFeito: 'Fonte trocada',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'concluida',
      oQueFoiFeito: 'Fonte trocada',
      encerradaPor: { id: s.contas.carla, nome: 'Carla Dias' },
      encerradaEm: api.relogio.agora().toISOString(),
    });
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'solicitacao.concluida',
        antes: { situacao: 'em-atendimento' },
        depois: { situacao: 'concluida', oQueFoiFeito: 'Fonte trocada' },
      },
    ]);
  });

  it('Pedido cancelado com o motivo, e o Cancelamento sem o motivo', async () => {
    const numero = await toner();
    const semMotivo = await enviar(`/solicitacoes/${numero}/cancelamento`, { motivo: ' ' });
    expect(semMotivo.statusCode).toBe(400);
    expect(semMotivo.json().campos).toEqual({ motivo: 'Informe o motivo do cancelamento.' });
    const r = await enviar(`/solicitacoes/${numero}/cancelamento`, {
      motivo: 'Pedido em duplicidade',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'cancelada',
      motivoDoCancelamento: 'Pedido em duplicidade',
      encerradaPor: { nome: 'Carla Dias' },
    });
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'solicitacao.cancelada',
        antes: { situacao: 'aberta' },
        depois: { situacao: 'cancelada', motivoDoCancelamento: 'Pedido em duplicidade' },
      },
    ]);
  });

  it('Concluída não muda, e Concluída não se altera', async () => {
    const numero = await conserto();
    await enviar(`/solicitacoes/${numero}/conclusao`, {});
    const mudar = await situacao(numero, 'em-atendimento');
    expect(mudar.statusCode).toBe(409);
    expect(mudar.json().detail).toBe(`A solicitação ${numero} já está concluída.`);
    const cancelar = await enviar(`/solicitacoes/${numero}/cancelamento`, { motivo: 'Errado' });
    expect(cancelar.json().detail).toBe(`A solicitação ${numero} já está concluída.`);
    const alterar = await s.cliente.enviar('PATCH', `/solicitacoes/${numero}`, s.entradas.carla, {
      tipo: 'conserto',
      pessoa: s.pessoas.joana,
      ativo: s.ativos.nb0031,
      defeito: 'Não liga',
      observacao: 'Mudou',
    });
    expect(alterar.statusCode).toBe(409);
    expect(alterar.json().detail).toBe(`A solicitação ${numero} já está concluída.`);
  });

  it('Conserto aguardando entrega, a mesma situação e o toner concluído fora da entrega', async () => {
    const numeroDoConserto = await conserto();
    const aguardando = await situacao(numeroDoConserto, 'aguardando-entrega');
    expect(aguardando.statusCode).toBe(409);
    expect(aguardando.json().detail).toBe('Aguardando entrega vale só para toner e equipamento.');
    await situacao(numeroDoConserto, 'em-atendimento');
    const mesma = await situacao(numeroDoConserto, 'em-atendimento');
    expect(mesma.json().detail).toBe(`A solicitação ${numeroDoConserto} já está em atendimento.`);
    const numeroDoToner = await toner();
    const concluir = await enviar(`/solicitacoes/${numeroDoToner}/conclusao`, {});
    expect(concluir.statusCode).toBe(409);
    expect(concluir.json().detail).toBe('O toner se conclui pela entrega dos itens.');
  });
});

describe('pedido ao fornecedor', () => {
  it('Toner pedido à locadora e OS informada depois', async () => {
    const numero = await toner();
    const inativo = await pedido(numero, { fornecedor: s.fornecedores.locadora });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({
      fornecedor: 'O fornecedor escolhido está inativo. Escolha um fornecedor ativo.',
    });
    const sem = await pedido(numero, { os: 'OS-7781' });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().campos).toEqual({ fornecedor: 'Escolha o fornecedor.' });
    const r = await pedido(numero, { fornecedor: s.fornecedores.hp, os: 'OS-7781' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'aguardando-entrega',
      fornecedor: { id: s.fornecedores.hp, nome: 'HP Brasil' },
      osDoFornecedor: 'OS-7781',
    });
    const corrigido = await pedido(numero, { fornecedor: s.fornecedores.hp, os: 'OS-7790' });
    expect(corrigido.json().osDoFornecedor).toBe('OS-7790');
    expect(await auditoriaDaRequisicao(api, s.org, corrigido)).toMatchObject([
      {
        acao: 'solicitacao.pedida',
        antes: { osDoFornecedor: 'OS-7781' },
        depois: { osDoFornecedor: 'OS-7790' },
      },
    ]);
  });

  it('o conserto não tem o pedido ao fornecedor', async () => {
    const numero = await conserto();
    const r = await pedido(numero, { fornecedor: s.fornecedores.hp });
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe('Aguardando entrega vale só para toner e equipamento.');
  });
});

describe('mudança da situação em lote', () => {
  it('Lote aplicado, e Lote na auditoria: uma por solicitação', async () => {
    const numeros = [await toner(), await conserto(), await toner()];
    const r = await lote({ numeros, situacao: 'em-atendimento' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      mudaram: 3,
      recusadas: [],
      texto: '3 solicitações mudaram.',
    });
    const registros = await auditoriaDaRequisicao(api, s.org, r);
    expect(registros).toHaveLength(3);
    expect(registros.every(({ acao }) => acao === 'solicitacao.situacao')).toBe(true);
    expect(registros[0]).toMatchObject({
      antes: { situacao: 'aberta' },
      depois: { situacao: 'em-atendimento' },
    });
  });

  it('Uma que não pode mudar fica como estava, com o motivo no retorno', async () => {
    const concluida = await conserto();
    await enviar(`/solicitacoes/${concluida}/conclusao`, {});
    const outras = [await conserto(), await conserto()];
    const r = await lote({
      numeros: [...outras, concluida, 999_999],
      situacao: 'cancelada',
      motivo: 'Feriado',
    });
    expect(r.json()).toEqual({
      mudaram: 2,
      recusadas: [
        { numero: concluida, mensagem: `A solicitação ${concluida} já está concluída.` },
        { numero: 999_999, mensagem: 'Solicitação não encontrada.' },
      ],
      texto: `2 solicitações mudaram. A ${concluida} não: já está concluída. A 999999 não: não foi encontrada.`,
    });
  });

  it('Toners entregues pela locadora e Toner sem fornecedor no lote', async () => {
    const pedidos = [await toner(), await toner()];
    for (const numero of pedidos) {
      await pedido(numero, { fornecedor: s.fornecedores.hp, os: `OS-${numero}` });
    }
    const semFornecedor = await toner();
    const movimentosAntes = await naOrganizacao(api.banco, s.org, (tx) =>
      tx.select({ total: count() }).from(movimentosDoEstoque),
    );
    const r = await lote({ numeros: [...pedidos, semFornecedor], situacao: 'concluida' });
    expect(r.json()).toMatchObject({
      mudaram: 2,
      texto: `2 solicitações mudaram. A ${semFornecedor} não: o toner sem fornecedor se conclui pela entrega.`,
    });
    const concluida = await s.cliente.enviar(
      'PATCH',
      `/solicitacoes/${pedidos[0]}`,
      s.entradas.carla,
      {
        tipo: 'toner',
        pessoa: s.pessoas.joana,
        impressoras: [s.ativos.pat00412],
        itens: [{ impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 }],
      },
    );
    expect(concluida.statusCode).toBe(409);
    const movimentosDepois = await naOrganizacao(api.banco, s.org, (tx) =>
      tx.select({ total: count() }).from(movimentosDoEstoque),
    );
    expect(movimentosDepois).toEqual(movimentosAntes);
    const registros = await auditoriaDaRequisicao(api, s.org, r);
    expect(registros).toHaveLength(2);
    expect(registros[0]).toMatchObject({
      acao: 'solicitacao.concluida',
      depois: { situacao: 'concluida', entreguePeloFornecedor: 'HP Brasil' },
    });
  });

  it('pede o motivo no cancelamento, até 200 números, e deixa a que a conta não atende', async () => {
    const semMotivo = await lote({ numeros: [await conserto()], situacao: 'cancelada' });
    expect(semMotivo.statusCode).toBe(400);
    expect(semMotivo.json().campos).toEqual({ motivo: 'Informe o motivo do cancelamento.' });
    const muitos = await lote({
      numeros: Array.from({ length: 201 }, (_, i) => i + 1),
      situacao: 'em-atendimento',
    });
    expect(muitos.statusCode).toBe(400);
    const deDoisLocais = (
      await enviar(
        '/solicitacoes',
        {
          tipo: 'toner',
          pessoa: s.pessoas.joana,
          impressoras: [s.ativos.pat00412, s.ativos.deCampinas],
          itens: [
            { impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 },
            { impressora: s.ativos.deCampinas, cor: 'preto', quantidade: 1 },
          ],
        },
        'ana',
      )
    ).json().numero;
    const r = await lote({ numeros: [deDoisLocais], situacao: 'em-atendimento' });
    expect(r.json().texto).toBe(
      `Nenhuma solicitação mudou. A ${deDoisLocais} não: você não atende todos os locais dela.`,
    );
  });

  it('cada solicitação que mudou grava o evento para os locais dela', async () => {
    const numero = await conserto();
    await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
    await lote({ numeros: [numero], situacao: 'em-atendimento' });
    const gravados = await naOrganizacao(api.banco, s.org, (tx) =>
      tx
        .select({ tipo: eventos.tipo, permissao: eventos.permissao, locais: eventos.locais })
        .from(eventos),
    );
    expect(gravados).toEqual([
      { tipo: 'solicitacoes.mudaram', permissao: 'solicitacoes.ver', locais: [s.locais.expedicao] },
    ]);
    const [{ total } = { total: 0 }] = await naOrganizacao(api.banco, s.org, (tx) =>
      tx
        .select({ total: count() })
        .from(auditoria)
        .where(eq(auditoria.acao, 'solicitacao.situacao')),
    );
    expect(total).toBeGreaterThan(0);
  });

  it('Solicitação pelo número na auditoria: cada registro dela traz o número, o tipo e quem pediu', async () => {
    const numero = await conserto();
    await lote({ numeros: [numero], situacao: 'em-atendimento' });
    const [{ id } = { id: '' }] = await naOrganizacao(api.banco, s.org, (tx) =>
      tx.select({ id: solicitacoes.id }).from(solicitacoes).where(eq(solicitacoes.numero, numero)),
    );
    const r = await s.cliente.consultar(`/auditoria?alvo=solicitacao:${id}`, s.entradas.ana);
    expect(r.statusCode).toBe(200);
    const itens: { acao: string; alvo: { tipo: string; nome: string | null } }[] = r.json().itens;
    expect(itens.map(({ acao }) => acao).sort()).toEqual([
      'solicitacao.registrada',
      'solicitacao.situacao',
    ]);
    for (const { alvo } of itens) {
      expect(alvo).toMatchObject({
        tipo: 'solicitacao',
        nome: `${numero} · Conserto · Joana Prado`,
      });
    }
  });
});
