// A OS pela solicitação de conserto (spec ordens-de-servico, "OS pela solicitação de conserto";
// solicitacoes, "Conserto com a ordem de serviço"; auditoria, "Eventos das ordens de serviço
// registrados"; change p4e-ordens-de-servico, design, decisões 3 e 4): a abertura pela solicitação,
// que passa a Em atendimento, a solicitação que segue a OS e não muda por si, também no lote, e a
// conclusão e o cancelamento que a OS faz nela.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';
import { montarOrdens, type OrdensDeTeste } from '../../test/ordens.ts';
import type { UsuarioDasSolicitacoes } from '../../test/solicitacoes.ts';

const host = 'grafite.ordens-solicitacao.local';

let api: ApiDeTeste;
let s: OrdensDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  s = await montarOrdens(api, host);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
});

const enviar = (caminho: string, corpo: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('POST', caminho, s.entradas[usuario], corpo);

const solicitacao = (numero: number) =>
  s.cliente.consultar(`/solicitacoes/${numero}`, s.entradas.carla).then((r) => r.json());

/** Registra um conserto do NB-0031, pedido pela Joana, e devolve o número. */
async function conserto(): Promise<number> {
  const r = await enviar('/solicitacoes', {
    tipo: 'conserto',
    pessoa: s.pessoas.joana,
    ativo: s.ativos.nb0031,
    defeito: 'Não liga',
  });
  return r.json().numero;
}

const abrirOS = (numero: number, usuario: UsuarioDasSolicitacoes = 'carla') =>
  enviar(`/solicitacoes/${numero}/ordem`, {}, usuario);

describe('OS pela solicitação de conserto', () => {
  it('Conserto vira OS: com o ativo e o defeito, ligada à solicitação, que passa a Em atendimento', async () => {
    const numero = await conserto();
    const r = await abrirOS(numero);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      situacao: 'aberta',
      ativo: { id: s.ativos.nb0031, patrimonio: 'NB-0031' },
      problema: 'Não liga',
      local: { id: s.locais.expedicao },
      solicitacao: { numero, pessoa: { id: s.pessoas.joana, nome: 'Joana Prado' } },
    });
    expect(await solicitacao(numero)).toMatchObject({ situacao: 'em-atendimento' });
  });

  it('OS pela solicitação na auditoria: a abertura da OS e a mudança da solicitação, com a OS', async () => {
    const numero = await conserto();
    await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
    const r = await abrirOS(numero);
    const registros = await auditoriaDaRequisicao(api, s.org, r);
    expect(registros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          acao: 'ordem.aberta',
          depois: expect.objectContaining({ solicitacao: numero, problema: 'Não liga' }),
        }),
        expect.objectContaining({
          acao: 'solicitacao.situacao',
          antes: { situacao: 'aberta' },
          depois: { situacao: 'em-atendimento', ordem: r.json().numero },
        }),
      ]),
    );
    const gravados = await naOrganizacao(api.banco, s.org, (tx) =>
      tx.select({ tipo: eventos.tipo }).from(eventos),
    );
    expect(gravados.map(({ tipo }) => tipo).sort()).toEqual([
      'ordens.mudaram',
      'solicitacoes.mudaram',
    ]);
  });

  it('Conserto já com a OS, o toner e a solicitação encerrada: recusados', async () => {
    const numero = await conserto();
    const os = (await abrirOS(numero)).json().numero;
    const segunda = await abrirOS(numero);
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().detail).toBe(`A solicitação ${numero} já tem a OS ${os}.`);

    const toner = (
      await enviar('/solicitacoes', {
        tipo: 'toner',
        pessoa: s.pessoas.joana,
        impressoras: [s.ativos.pat00412],
        itens: [{ impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 }],
      })
    ).json().numero;
    const doToner = await abrirOS(toner);
    expect(doToner.statusCode).toBe(409);
    expect(doToner.json().detail).toBe('A OS nasce só da solicitação de conserto.');

    const cancelada = await conserto();
    await enviar(`/solicitacoes/${cancelada}/cancelamento`, { motivo: 'Pedido em duplicidade' });
    const daCancelada = await abrirOS(cancelada);
    expect(daCancelada.statusCode).toBe(409);
    expect(daCancelada.json().detail).toBe(`A solicitação ${cancelada} já está cancelada.`);
    expect((await abrirOS(999_999)).statusCode).toBe(404);
  });

  it('quem não atende as OS não abre a OS pela solicitação', async () => {
    const numero = await conserto();
    expect((await abrirOS(numero, 'eva')).statusCode).toBe(403);
    expect((await abrirOS(numero, 'bruno')).statusCode).toBe(403);
    expect(await solicitacao(numero)).toMatchObject({ situacao: 'aberta' });
  });
});

describe('solicitação que segue a OS', () => {
  it('Conserto que segue a OS: a solicitação não muda por si', async () => {
    const numero = await conserto();
    const os = (await abrirOS(numero)).json().numero;
    const segue = `A solicitação ${numero} segue a OS ${os}.`;
    const conclusao = await enviar(`/solicitacoes/${numero}/conclusao`, {
      oQueFoiFeito: 'Fonte trocada',
    });
    expect(conclusao.statusCode).toBe(409);
    expect(conclusao.json().detail).toBe(segue);
    const cancelamento = await enviar(`/solicitacoes/${numero}/cancelamento`, { motivo: 'Outro' });
    expect(cancelamento.json().detail).toBe(segue);
    const situacao = await enviar(`/solicitacoes/${numero}/situacao`, {
      situacao: 'aguardando-entrega',
    });
    expect(situacao.json().detail).toBe(segue);
    const alteracao = await s.cliente.enviar('PATCH', `/solicitacoes/${numero}`, s.entradas.carla, {
      tipo: 'conserto',
      pessoa: s.pessoas.joana,
      ativo: s.ativos.nb0031,
      defeito: 'Não liga nunca',
    });
    expect(alteracao.statusCode).toBe(409);
    expect(alteracao.json().detail).toBe(segue);
    expect(await solicitacao(numero)).toMatchObject({ situacao: 'em-atendimento' });
  });

  it('Conserto com a OS no lote: as outras mudam, e ela fica como estava', async () => {
    const numero = await conserto();
    const os = (await abrirOS(numero)).json().numero;
    const outra = await conserto();
    const r = await enviar('/solicitacoes/situacao', {
      numeros: [numero, outra],
      situacao: 'cancelada',
      motivo: 'Pedido em duplicidade',
    });
    expect(r.json()).toEqual({
      mudaram: 1,
      recusadas: [{ numero, mensagem: `A solicitação ${numero} segue a OS ${os}.` }],
      texto: `1 solicitação mudou. A ${numero} não: segue a OS ${os}.`,
    });
  });

  it('Conserto sem a OS: muda como antes', async () => {
    const numero = await conserto();
    await enviar(`/solicitacoes/${numero}/situacao`, { situacao: 'em-atendimento' });
    const r = await enviar(`/solicitacoes/${numero}/conclusao`, { oQueFoiFeito: 'Cabo trocado' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ situacao: 'concluida', oQueFoiFeito: 'Cabo trocado' });
  });

  it('OS resolvida conclui o conserto, e a reabertura e a nova resolução não o mudam', async () => {
    const numero = await conserto();
    const os = (await abrirOS(numero)).json().numero;
    const resolvida = await enviar(`/ordens/${os}/resolucao`, { solucao: 'Fonte trocada' });
    expect(resolvida.statusCode).toBe(200);
    const concluida = {
      situacao: 'concluida',
      oQueFoiFeito: 'Fonte trocada',
      encerradaPor: { id: s.contas.carla, nome: 'Carla Dias' },
      encerradaEm: api.relogio.agora().toISOString(),
    };
    expect(await solicitacao(numero)).toMatchObject(concluida);
    expect(await auditoriaDaRequisicao(api, s.org, resolvida)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ acao: 'ordem.resolvida' }),
        expect.objectContaining({
          acao: 'solicitacao.concluida',
          depois: { situacao: 'concluida', oQueFoiFeito: 'Fonte trocada', ordem: os },
        }),
      ]),
    );
    await enviar(`/ordens/${os}/reabertura`, { motivo: 'Voltou a desligar sozinho' });
    expect(await solicitacao(numero)).toMatchObject(concluida);
    const deNovo = await enviar(`/ordens/${os}/resolucao`, { solucao: 'Placa trocada' });
    expect(deNovo.statusCode).toBe(200);
    expect(await solicitacao(numero)).toMatchObject(concluida);
    const encerrada = await enviar(`/ordens/${os}/encerramento`, { semResolver: false });
    expect(encerrada.statusCode).toBe(200);
    expect(await solicitacao(numero)).toMatchObject(concluida);
  });

  it('OS encerrada sem resolver cancela o conserto, com o mesmo motivo', async () => {
    const numero = await conserto();
    const os = (await abrirOS(numero)).json().numero;
    const r = await enviar(`/ordens/${os}/encerramento`, {
      semResolver: true,
      motivo: 'Equipamento substituído',
    });
    expect(r.statusCode).toBe(200);
    expect(await solicitacao(numero)).toMatchObject({
      situacao: 'cancelada',
      motivoDoCancelamento: 'Equipamento substituído',
      encerradaPor: { id: s.contas.carla },
    });
  });
});
