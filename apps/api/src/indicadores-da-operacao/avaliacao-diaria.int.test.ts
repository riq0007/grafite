// A avaliação diária dos indicadores da operação (spec indicadores-da-operacao, "Indicador da
// operação fora da meta avisa"; change p4f-indicadores-da-operacao, design, decisão 8): às 07:00,
// com o Operação ligado, cada organização avalia os indicadores da operação com todas as OS e as
// saídas dela e notifica quem administra a operação quando um sai da meta, uma vez a cada saída.
import { consumiveis, indicadoresDaOrganizacao, naOrganizacao, notificacoes } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { desligarModulos, gravarEstado } from '../../test/alertas.ts';
import { definirSaldo } from '../../test/estoque.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import { montarOrdens, type OrdensDeTeste } from '../../test/ordens.ts';
import {
  TAREFA_DA_AVALIACAO_DOS_INDICADORES,
  tarefasDosIndicadores,
} from '../alertas/indicadores-diarios.ts';
import type { DefinicaoDeTarefa } from '../fila/tarefas.ts';

const host = 'grafite.avaliacao-da-operacao.local';

const DIA = 24 * 60 * 60 * 1000;

const RESOLUCAO = 'Tempo de resolução das OS fora da meta: 4,2 dias, com a meta de 3 dias';
const PAGINAS = 'Páginas por toner fora da meta: 1 toner abaixo de 80% do rendimento';

let api: ApiDeTeste;
let s: OrdensDeTeste;

const enviar = (caminho: string, corpo: object) =>
  s.cliente.enviar('POST', caminho, s.entradas.carla, corpo);

/** A troca do toner preto da PAT-00412, com o total de páginas lido na hora. */
async function trocarToner(totalDePaginas: number) {
  await gravarEstado(api, s.org, {
    ativoId: s.ativos.pat00412,
    coletorId: s.coletor,
    metrica: 'impressora.contador',
    item: '1',
    momento: api.relogio.agora(),
    valorNumero: totalDePaginas,
  });
  const r = await enviar('/estoque/saidas', {
    consumivel: s.consumiveis.cf258a,
    quantidade: 1,
    origem: s.locais.almoxarifado,
    ativo: s.ativos.pat00412,
  });
  expect(r.statusCode).toBe(201);
}

beforeAll(async () => {
  api = await abrirApi();
  s = await montarOrdens(api, host);
  await naOrganizacao(api.banco, s.org, (tx) =>
    tx
      .update(consumiveis)
      .set({ rendimento: 3000 })
      .where(eq(consumiveis.id, s.consumiveis.cf258a)),
  );
  await definirSaldo(api, s.org, {
    consumivelId: s.consumiveis.cf258a,
    localId: s.locais.almoxarifado,
    saldo: 10,
  });
  // Uma OS resolvida em 4,2 dias, acima da meta de fábrica de 3 dias, e um toner que rendeu 1.850
  // das 3.000 páginas, abaixo de 80%.
  await trocarToner(40_000);
  const { numero } = (
    await enviar('/ordens', { ativo: s.ativos.nb0031, problema: 'Não liga' })
  ).json();
  api.relogio.avancar(4.2 * DIA);
  s.entradas.carla = await s.cliente.entrar('carla');
  expect((await enviar(`/ordens/${numero}/resolucao`, { solucao: 'Feito' })).statusCode).toBe(200);
  await trocarToner(41_850);
  api.relogio.avancar(60_000);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, s.org, async (tx) => {
    await tx.delete(notificacoes);
    await tx.delete(indicadoresDaOrganizacao);
  });
});

/** A avaliação da organização, como a fila a roda. */
function avaliar() {
  const tarefa = tarefasDosIndicadores({
    banco: api.banco,
    armazenamento: api.armazenamento,
    agora: api.relogio.agora,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    enviar: async () => null,
  }).find(({ nome }) => nome === TAREFA_DA_AVALIACAO_DOS_INDICADORES) as DefinicaoDeTarefa;
  return tarefa.trabalho(
    { orgId: s.org },
    { tarefaId: 'teste', tentativa: 0, sinal: new AbortController().signal },
  );
}

const notificacoesGravadas = () =>
  naOrganizacao(api.banco, s.org, (tx) =>
    tx
      .select({
        contaId: notificacoes.contaId,
        severidade: notificacoes.severidade,
        titulo: notificacoes.titulo,
        descricao: notificacoes.descricao,
        origem: notificacoes.origem,
        destino: notificacoes.destino,
        alertaId: notificacoes.alertaId,
      })
      .from(notificacoes)
      .orderBy(notificacoes.titulo),
  );

const marcas = () =>
  naOrganizacao(api.banco, s.org, (tx) =>
    tx
      .select({
        indicador: indicadoresDaOrganizacao.indicador,
        fora: indicadoresDaOrganizacao.foraDaMetaDesde,
      })
      .from(indicadoresDaOrganizacao)
      .orderBy(indicadoresDaOrganizacao.indicador),
  );

describe('avaliação diária dos indicadores da operação', () => {
  it('Resolução sai da meta: notifica quem administra a operação, com a origem "Operação"', async () => {
    await avaliar();
    expect(await notificacoesGravadas()).toEqual([
      {
        contaId: s.contas.ana,
        severidade: 'atencao',
        titulo: PAGINAS,
        descricao:
          'Confira a qualidade do consumível e do fornecedor, e a configuração da impressora.',
        origem: 'Operação',
        destino: '/operacao/indicadores?foco=indicador-paginas-por-toner',
        alertaId: null,
      },
      {
        contaId: s.contas.ana,
        severidade: 'atencao',
        titulo: RESOLUCAO,
        descricao:
          'Veja onde as OS esperam: deixe no estoque as peças que mais faltam, ou cobre os fornecedores que mais demoram.',
        origem: 'Operação',
        destino: '/operacao/indicadores?foco=indicador-resolucao-das-os',
        alertaId: null,
      },
    ]);
    // As OS repetidas ficam dentro da meta, sem a marca.
    expect(await marcas()).toEqual([
      { indicador: 'paginas-por-toner', fora: api.relogio.agora() },
      { indicador: 'resolucao-das-os', fora: api.relogio.agora() },
    ]);
  });

  it('Continua fora da meta: no dia seguinte, com o toner ainda abaixo, nada sai de novo', async () => {
    await avaliar();
    await naOrganizacao(api.banco, s.org, (tx) => tx.delete(notificacoes));
    api.relogio.avancar(DIA);
    await avaliar();
    expect(await notificacoesGravadas()).toEqual([]);
    expect((await marcas()).map(({ indicador }) => indicador)).toEqual([
      'paginas-por-toner',
      'resolucao-das-os',
    ]);
  });

  it('Módulo desligado: os indicadores da operação não são avaliados, e nada é notificado', async () => {
    await desligarModulos(api, s.org, ['operacao']);
    try {
      await avaliar();
      expect(await notificacoesGravadas()).toEqual([]);
      expect(await marcas()).toEqual([]);
    } finally {
      await desligarModulos(api, s.org, []);
    }
  });

  it('com o Alertas desligado, os indicadores da operação continuam avaliados', async () => {
    await desligarModulos(api, s.org, ['alertas']);
    try {
      await avaliar();
      expect((await notificacoesGravadas()).map(({ titulo }) => titulo)).toEqual([
        PAGINAS,
        RESOLUCAO,
      ]);
    } finally {
      await desligarModulos(api, s.org, []);
    }
  });
});
