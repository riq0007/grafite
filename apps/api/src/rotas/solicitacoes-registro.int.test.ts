// O registro e a alteração das solicitações pela API (spec solicitacoes, "Solicitação", "Itens do
// toner", "Contador congelado na solicitação", "Alteração da solicitação" e "Quem vê e quem atende
// as solicitações"; auditoria, "Eventos das solicitações registrados"; eventos-em-tempo-real,
// "Evento de saída gravado com a mudança"; change p4d-solicitacoes, design, decisões 2, 3 e 6).
import { eventos, impressorasDasSolicitacoes, naOrganizacao, solicitacoes } from '@grafite/db';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gravarEstado } from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';
import {
  montarSolicitacoes,
  type SolicitacoesDeTeste,
  type UsuarioDasSolicitacoes,
} from '../../test/solicitacoes.ts';

const host = 'grafite.solicitacoes-registro.local';

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

const registrar = (pedido: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('POST', '/solicitacoes', s.entradas[usuario], pedido);

const alterar = (numero: number, pedido: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('PATCH', `/solicitacoes/${numero}`, s.entradas[usuario], pedido);

/** O toner da PAT-00412, pedido pela Joana, com 1 preto. */
const tonerDa412 = (extra: object = {}) => ({
  tipo: 'toner',
  pessoa: s.pessoas.joana,
  impressoras: [s.ativos.pat00412],
  itens: [{ impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 }],
  ...extra,
});

const quantas = async () => {
  const [linha] = await naOrganizacao(api.banco, s.org, (tx) =>
    tx.select({ total: count() }).from(solicitacoes),
  );
  return linha?.total ?? 0;
};

const eventosGravados = () =>
  naOrganizacao(api.banco, s.org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, permissao: eventos.permissao, locais: eventos.locais })
      .from(eventos),
  );

const contadorDe = async (ativoId: string, item: string, valor: number, lidoEm: Date) =>
  gravarEstado(api, s.org, {
    ativoId,
    coletorId: s.coletor,
    metrica: 'impressora.contador',
    item,
    momento: lidoEm,
    valorNumero: valor,
  });

describe('registro das solicitações', () => {
  it('Toner pedido pela Joana: nasce Aberta, com o número seguinte, quem pediu e quem registrou', async () => {
    const r = await registrar(tonerDa412());
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      tipo: 'toner',
      situacao: 'aberta',
      pessoa: { id: s.pessoas.joana, nome: 'Joana Prado' },
      registradaPor: { id: s.contas.carla, nome: 'Carla Dias' },
      registradaEm: api.relogio.agora().toISOString(),
      locais: [{ id: s.locais.expedicao, caminho: 'Jundiaí › Expedição' }],
      semLocal: false,
      impressoras: [
        {
          ativo: {
            id: s.ativos.pat00412,
            rotulo: 'HP LaserJet M404',
            patrimonio: 'PAT-00412',
            abrir: true,
          },
          itens: [
            {
              cor: 'preto',
              quantidade: 1,
              consumivel: { id: s.consumiveis.cf258a, codigo: 'CF258A', abrir: false },
              entrega: null,
            },
          ],
        },
      ],
      permite: { atender: true },
    });
    const seguinte = await registrar(tonerDa412());
    expect(seguinte.json().numero).toBe(r.json().numero + 1);
  });

  it('com dois registros ao mesmo tempo, os números não se repetem', async () => {
    const [um, outro] = await Promise.all([registrar(tonerDa412()), registrar(tonerDa412())]);
    expect([um.statusCode, outro.statusCode]).toEqual([201, 201]);
    const numeros = [um.json().numero, outro.json().numero].sort((a, b) => a - b);
    expect(numeros[1] - numeros[0]).toBe(1);
  });

  it('Quem pediu em texto livre e a pessoa inativa: recusados no campo, sem registrar nada', async () => {
    const antes = await quantas();
    const textoLivre = await registrar(tonerDa412({ pessoa: null, pedidaPor: 'Joana Prado' }));
    expect(textoLivre.statusCode).toBe(400);
    expect(textoLivre.json().campos).toEqual({ pessoa: 'Escolha quem pediu.' });
    const inativa = await registrar(tonerDa412({ pessoa: s.pessoas.marcos }));
    expect(inativa.statusCode).toBe(409);
    expect(inativa.json().campos).toEqual({
      pessoa: 'A pessoa escolhida está inativa. Escolha uma pessoa ativa.',
    });
    expect(await quantas()).toBe(antes);
  });

  it('Conserto do notebook: com o ativo, o defeito e o local dele', async () => {
    const r = await registrar({
      tipo: 'conserto',
      pessoa: s.pessoas.joana,
      ativo: s.ativos.nb0031,
      defeito: 'Não liga',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      tipo: 'conserto',
      ativo: { id: s.ativos.nb0031, rotulo: 'Dell Latitude 5440', patrimonio: 'NB-0031' },
      defeito: 'Não liga',
      locais: [{ caminho: 'Jundiaí › Expedição' }],
      impressoras: [],
    });
  });

  it('Equipamento para a Expedição: com o tipo, a quantidade, o motivo e o local', async () => {
    const r = await registrar({
      tipo: 'equipamento',
      pessoa: s.pessoas.joana,
      tipoDeAtivo: s.tipos.notebook,
      quantidade: 2,
      motivo: 'Dois contratados novos',
      local: s.locais.expedicao,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      tipo: 'equipamento',
      tipoDeAtivo: { id: s.tipos.notebook, nome: 'Notebook' },
      quantidade: 2,
      motivo: 'Dois contratados novos',
      local: { id: s.locais.expedicao, caminho: 'Jundiaí › Expedição' },
    });
  });

  it('Ativo sem consumíveis, a impressora inativa e a que a conta não vê', async () => {
    const notebook = await registrar(
      tonerDa412({
        impressoras: [s.ativos.nb0031],
        itens: [{ impressora: s.ativos.nb0031, cor: 'preto', quantidade: 1 }],
      }),
    );
    expect(notebook.statusCode).toBe(409);
    expect(notebook.json().campos).toEqual({ 'impressoras.0': 'NB-0031 não usa consumíveis.' });
    const inativa = await registrar(
      tonerDa412({
        impressoras: [s.ativos.inativa],
        itens: [{ impressora: s.ativos.inativa, cor: 'preto', quantidade: 1 }],
      }),
    );
    expect(inativa.json().campos).toEqual({ 'impressoras.0': 'O ativo escolhido está inativo.' });
    const deCampinas = await registrar(
      tonerDa412({
        impressoras: [s.ativos.deCampinas],
        itens: [{ impressora: s.ativos.deCampinas, cor: 'preto', quantidade: 1 }],
      }),
    );
    expect(deCampinas.statusCode).toBe(400);
    expect(deCampinas.json().campos).toEqual({ 'impressoras.0': 'Impressora não encontrada.' });
  });

  it('recusa no campo a cor repetida e o consumível que não é compatível da cor', async () => {
    const repetida = await registrar(
      tonerDa412({
        itens: [
          { impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 },
          { impressora: s.ativos.pat00412, cor: 'preto', quantidade: 2 },
        ],
      }),
    );
    expect(repetida.statusCode).toBe(400);
    expect(repetida.json().campos).toEqual({
      'itens.1.cor': 'Essa cor já está pedida para essa impressora.',
    });
    const foraDaCor = await registrar(
      tonerDa412({
        itens: [
          {
            impressora: s.ativos.pat00412,
            cor: 'ciano',
            quantidade: 1,
            consumivel: s.consumiveis.cf258a,
          },
        ],
      }),
    );
    expect(foraDaCor.statusCode).toBe(409);
    expect(foraDaCor.json().campos).toEqual({
      'itens.0.consumivel': 'Escolha um compatível dessa cor.',
    });
  });

  it('Toner registrado: a auditoria guarda o número, quem pediu, a impressora e o item', async () => {
    const r = await registrar(tonerDa412(), 'ana');
    const [registro] = await auditoriaDaRequisicao(api, s.org, r);
    expect(registro).toMatchObject({
      acao: 'solicitacao.registrada',
      alvoTipo: 'solicitacao',
      alvoId: r.json().id,
      depois: {
        numero: r.json().numero,
        tipo: 'toner',
        pessoa: 'Joana Prado',
        impressoras: ['HP LaserJet M404 · PAT-00412'],
        itens: 'PAT-00412: 1 Preto',
      },
    });
  });

  it('Solicitação registrada com a lista aberta: o evento vai para quem vê as solicitações dos locais', async () => {
    await registrar(tonerDa412());
    expect(await eventosGravados()).toEqual([
      {
        tipo: 'solicitacoes.mudaram',
        permissao: 'solicitacoes.ver',
        locais: [s.locais.expedicao],
      },
    ]);
  });
});

describe('contador congelado', () => {
  it('Impressora sem coleta, Contador na abertura, Coleta depois do registro e Impressora incluída depois', async () => {
    const semColeta = await registrar(
      tonerDa412({
        impressoras: [s.ativos.pat00415],
        itens: [{ impressora: s.ativos.pat00415, cor: 'preto', quantidade: 1 }],
      }),
    );
    expect(semColeta.json().impressoras[0].contador).toBeNull();

    const lidoEm = new Date('2026-10-02T14:02:00.000Z');
    await contadorDe(s.ativos.pat00412, '1', 48_210, lidoEm);
    const r = await registrar(tonerDa412());
    const numero = r.json().numero;
    expect(r.json().impressoras[0].contador).toEqual({
      paginas: 48_210,
      lidoEm: lidoEm.toISOString(),
    });

    await contadorDe(s.ativos.pat00412, '1', 48_900, new Date('2026-10-02T15:00:00.000Z'));
    const depoisDaColeta = await alterar(numero, tonerDa412({ observacao: 'Urgente' }));
    expect(depoisDaColeta.statusCode).toBe(200);
    expect(depoisDaColeta.json().impressoras[0].contador.paginas).toBe(48_210);

    const lidoDepois = new Date('2026-10-02T15:30:00.000Z');
    await contadorDe(s.ativos.pat00415, '1', 7_000, lidoDepois);
    const incluida = await alterar(
      numero,
      tonerDa412({
        impressoras: [s.ativos.pat00412, s.ativos.pat00415],
        itens: [
          { impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 },
          { impressora: s.ativos.pat00415, cor: 'preto', quantidade: 2 },
        ],
      }),
    );
    expect(incluida.statusCode).toBe(200);
    expect(
      incluida
        .json()
        .impressoras.map(
          ({ ativo, contador }: { ativo: { patrimonio: string }; contador: unknown }) => [
            ativo.patrimonio,
            contador,
          ],
        ),
    ).toEqual([
      ['PAT-00412', { paginas: 48_210, lidoEm: lidoEm.toISOString() }],
      ['PAT-00415', { paginas: 7_000, lidoEm: lidoDepois.toISOString() }],
    ]);
    // O evento da alteração vai para os locais de antes e os de depois.
    expect((await eventosGravados()).at(-1)).toEqual({
      tipo: 'solicitacoes.mudaram',
      permissao: 'solicitacoes.ver',
      locais: [s.locais.expedicao, s.locais.almoxarifado],
    });
  });
});

describe('alteração das solicitações', () => {
  it('Quantidade corrigida antes da entrega: a auditoria guarda o antes e o depois, e o pedido igual não grava nada', async () => {
    const numero = (await registrar(tonerDa412())).json().numero;
    const r = await alterar(
      numero,
      tonerDa412({ itens: [{ impressora: s.ativos.pat00412, cor: 'preto', quantidade: 2 }] }),
    );
    expect(r.statusCode).toBe(200);
    expect(r.json().impressoras[0].itens[0].quantidade).toBe(2);
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'solicitacao.alterada',
        antes: { itens: 'PAT-00412: 1 Preto' },
        depois: { itens: 'PAT-00412: 2 Preto' },
      },
    ]);
    const igual = await alterar(
      numero,
      tonerDa412({ itens: [{ impressora: s.ativos.pat00412, cor: 'preto', quantidade: 2 }] }),
    );
    expect(igual.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, s.org, igual)).toEqual([]);
  });

  it('não muda o tipo, e a que não existe é não encontrada', async () => {
    const numero = (await registrar(tonerDa412())).json().numero;
    const outroTipo = await alterar(numero, {
      tipo: 'conserto',
      pessoa: s.pessoas.joana,
      ativo: s.ativos.nb0031,
      defeito: 'Não liga',
    });
    expect(outroTipo.statusCode).toBe(400);
    expect(outroTipo.json().campos).toEqual({ tipo: 'O tipo da solicitação não muda.' });
    const inexistente = await alterar(999_999, tonerDa412());
    expect(inexistente.statusCode).toBe(404);
  });

  it('só quem atende todos os locais altera a solicitação de dois locais', async () => {
    const duas = await registrar(
      tonerDa412({
        impressoras: [s.ativos.pat00412, s.ativos.deCampinas],
        itens: [
          { impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 },
          { impressora: s.ativos.deCampinas, cor: 'preto', quantidade: 1 },
        ],
      }),
      'ana',
    );
    expect(duas.statusCode).toBe(201);
    expect(duas.json().locais.map(({ caminho }: { caminho: string }) => caminho)).toEqual([
      'Jundiaí › Expedição',
      'Campinas › Almoxarifado',
    ]);
    const carla = await alterar(duas.json().numero, tonerDa412({ observacao: 'Urgente' }));
    expect(carla.statusCode).toBe(403);
    const ana = await alterar(
      duas.json().numero,
      tonerDa412({
        observacao: 'Urgente',
        impressoras: [s.ativos.pat00412, s.ativos.deCampinas],
        itens: [
          { impressora: s.ativos.pat00412, cor: 'preto', quantidade: 1 },
          { impressora: s.ativos.deCampinas, cor: 'preto', quantidade: 1 },
        ],
      }),
      'ana',
    );
    expect(ana.statusCode).toBe(200);
    const congeladas = await naOrganizacao(api.banco, s.org, (tx) =>
      tx
        .select({ id: impressorasDasSolicitacoes.id })
        .from(impressorasDasSolicitacoes)
        .where(eq(impressorasDasSolicitacoes.solicitacaoId, duas.json().id)),
    );
    expect(congeladas).toHaveLength(2);
  });
});
