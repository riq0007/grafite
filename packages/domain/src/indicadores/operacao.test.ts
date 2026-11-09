// O cálculo dos indicadores da operação sobre as OS e as saídas do período (spec
// indicadores-da-operacao, "Período dos indicadores da operação", "Tempo de resolução das OS", "OS
// repetidas" e "Páginas por toner"; change p4f-indicadores-da-operacao, design, decisões 1 a 3).
import { describe, expect, it } from 'vitest';
import type { CorDeConsumivel } from '../consumiveis/consumivel.ts';
import type { SituacaoDaOrdem } from '../ordens/ordens.ts';
import { periodoDosIndicadores } from './calculo.ts';
import {
  calcularIndicadoresDaOperacao,
  indicadorDaResolucao,
  indicadorDasPaginas,
  indicadorDasRepetidas,
  type OrdemParaOsIndicadores,
  type SaidaDeTonerParaOsIndicadores,
} from './operacao.ts';

const AGORA = new Date('2026-10-22T12:00:00.000Z');
const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const MINUTOS_DO_DIA = 24 * 60;
const PERIODO = periodoDosIndicadores(AGORA);

/** O momento de `dias` atrás. */
const ha = (dias: number) => new Date(AGORA.getTime() - dias * DIA);

const NB0031 = { id: 'nb0031', rotulo: 'NB-0031' };
const PAT00412 = { id: 'pat00412', rotulo: 'PAT-00412' };

type Ativo = typeof NB0031;

/**
 * Uma OS do NB-0031, aberta há `abertaHa` dias e, com `resolvidaHa`, resolvida; o histórico é o da
 * abertura e o da resolução, se não vier outro.
 */
function os(
  numero: number,
  {
    abertaHa,
    resolvidaHa,
    situacao,
    ativo = NB0031,
    problema = 'Não liga',
    historico,
  }: {
    abertaHa: number;
    resolvidaHa?: number;
    situacao?: SituacaoDaOrdem;
    ativo?: Ativo;
    problema?: string;
    historico?: { situacao: SituacaoDaOrdem; ha: number }[];
  },
): OrdemParaOsIndicadores<Ativo> {
  const resolvida = resolvidaHa === undefined ? null : ha(resolvidaHa);
  return {
    id: `o${numero}`,
    numero,
    problema,
    situacao: situacao ?? (resolvida ? 'resolvida' : 'aberta'),
    ativoChave: ativo.id,
    ativo,
    abertaEm: ha(abertaHa),
    resolvidaEm: resolvida,
    historico: (
      historico ?? [
        { situacao: 'aberta', ha: abertaHa },
        ...(resolvidaHa === undefined ? [] : [{ situacao: 'resolvida' as const, ha: resolvidaHa }]),
      ]
    ).map(({ situacao: daMudanca, ha: quando }) => ({ situacao: daMudanca, mudadaEm: ha(quando) })),
  };
}

const META_DE_3_DIAS = 3 * MINUTOS_DO_DIA;

describe('o tempo de resolução das OS', () => {
  it('Mediana das OS resolvidas: lista a que passou da meta', () => {
    const resultado = indicadorDaResolucao(
      [
        os(10, { abertaHa: 10, resolvidaHa: 9 }),
        os(11, { abertaHa: 12, resolvidaHa: 10 }),
        os(12, { abertaHa: 20, resolvidaHa: 14 }),
      ],
      PERIODO,
      META_DE_3_DIAS,
    );
    expect(resultado).toMatchObject({
      valor: 2 * MINUTOS_DO_DIA,
      base: 3,
      situacao: 'dentro',
      mais: 0,
    });
    expect(resultado.itens).toEqual([
      {
        id: 'o12',
        numero: 12,
        problema: 'Não liga',
        ativo: NB0031,
        minutos: 6 * MINUTOS_DO_DIA,
        emAberto: false,
        esperaPelaPeca: 0,
        esperaPeloFornecedor: 0,
      },
    ]);
  });

  it('Comparação com os 30 dias anteriores: o anterior é a mediana das resolvidas nele', () => {
    const resultado = indicadorDaResolucao(
      [
        os(20, { abertaHa: 7, resolvidaHa: 5 }),
        // Resolvida há 35 dias, no período anterior, depois de 4,5 dias.
        os(8, { abertaHa: 39.5, resolvidaHa: 35 }),
      ],
      PERIODO,
      META_DE_3_DIAS,
    );
    expect(resultado.valor).toBe(2 * MINUTOS_DO_DIA);
    expect(resultado.anterior).toBe(4.5 * MINUTOS_DO_DIA);
  });

  it('Espera pelo fornecedor: a lista diz quanto foi espera, pela peça e pelo fornecedor', () => {
    const resultado = indicadorDaResolucao(
      [
        os(12, {
          abertaHa: 10,
          resolvidaHa: 4,
          historico: [
            { situacao: 'aberta', ha: 10 },
            { situacao: 'em-atendimento', ha: 9.5 },
            { situacao: 'aguardando-peca', ha: 9 },
            { situacao: 'aguardando-fornecedor', ha: 8.5 },
            { situacao: 'em-atendimento', ha: 4.5 },
            { situacao: 'resolvida', ha: 4 },
          ],
        }),
      ],
      PERIODO,
      META_DE_3_DIAS,
    );
    expect(resultado.itens).toEqual([
      expect.objectContaining({
        numero: 12,
        minutos: 6 * MINUTOS_DO_DIA,
        esperaPelaPeca: 0.5 * MINUTOS_DO_DIA,
        esperaPeloFornecedor: 4 * MINUTOS_DO_DIA,
      }),
    ]);
  });

  it('OS ainda em aberto: vem antes das resolvidas, com a espera até agora', () => {
    const resultado = indicadorDaResolucao(
      [
        os(12, { abertaHa: 20, resolvidaHa: 14 }),
        os(20, {
          abertaHa: 5,
          situacao: 'aguardando-peca',
          historico: [
            { situacao: 'aberta', ha: 5 },
            { situacao: 'aguardando-peca', ha: 2 },
          ],
        }),
        // Em aberto, mas dentro da meta: fica fora da lista.
        os(21, { abertaHa: 1 }),
        os(19, { abertaHa: 8 }),
      ],
      PERIODO,
      META_DE_3_DIAS,
    );
    expect(
      resultado.itens.map(({ numero, minutos, emAberto, esperaPelaPeca }) => ({
        numero,
        dias: minutos / MINUTOS_DO_DIA,
        emAberto,
        pecaEmDias: esperaPelaPeca / MINUTOS_DO_DIA,
      })),
    ).toEqual([
      { numero: 19, dias: 8, emAberto: true, pecaEmDias: 0 },
      { numero: 20, dias: 5, emAberto: true, pecaEmDias: 2 },
      { numero: 12, dias: 6, emAberto: false, pecaEmDias: 0 },
    ]);
    // Só a 12 foi resolvida no período.
    expect(resultado.base).toBe(1);
  });

  it('OS aberta por engano: a encerrada sem resolver não entra na mediana nem na lista', () => {
    const resultado = indicadorDaResolucao(
      [
        os(15, {
          abertaHa: 9,
          situacao: 'encerrada',
          historico: [
            { situacao: 'aberta', ha: 9 },
            { situacao: 'encerrada', ha: 8 },
          ],
        }),
      ],
      PERIODO,
      META_DE_3_DIAS,
    );
    expect(resultado).toMatchObject({ valor: null, base: 0, situacao: 'sem-dado', itens: [] });
  });

  it('a reaberta conta da abertura até a última resolução, e a encerrada depois de resolvida entra', () => {
    const resultado = indicadorDaResolucao(
      [
        os(12, {
          abertaHa: 10,
          resolvidaHa: 2,
          historico: [
            { situacao: 'aberta', ha: 10 },
            { situacao: 'resolvida', ha: 8 },
            { situacao: 'em-atendimento', ha: 6 },
            { situacao: 'resolvida', ha: 2 },
          ],
        }),
        os(13, {
          abertaHa: 6,
          resolvidaHa: 5,
          situacao: 'encerrada',
          historico: [
            { situacao: 'aberta', ha: 6 },
            { situacao: 'resolvida', ha: 5 },
            { situacao: 'encerrada', ha: 4 },
          ],
        }),
      ],
      PERIODO,
      META_DE_3_DIAS,
    );
    expect(resultado.base).toBe(2);
    expect(resultado.valor).toBe(((8 + 1) / 2) * MINUTOS_DO_DIA);
    expect(resultado.situacao).toBe('fora');
  });

  it('sem nenhuma OS resolvida no período, não tem dado', () => {
    expect(indicadorDaResolucao([], PERIODO, META_DE_3_DIAS)).toEqual({
      valor: null,
      anterior: null,
      base: 0,
      situacao: 'sem-dado',
      itens: [],
      mais: 0,
    });
  });
});

describe('as OS repetidas', () => {
  it('Problema que voltou: conta o ativo com as OS dele', () => {
    const resultado = indicadorDasRepetidas(
      [
        os(12, { abertaHa: 20, resolvidaHa: 18 }),
        os(20, { abertaHa: 3, problema: 'Não liga de novo' }),
        os(21, { abertaHa: 2, ativo: PAT00412, problema: 'Atolando papel' }),
      ],
      PERIODO,
      2,
    );
    expect(resultado).toMatchObject({ valor: 1, base: 2, situacao: 'fora', mais: 0 });
    expect(resultado.itens).toEqual([
      {
        ativo: NB0031,
        quantas: 2,
        ordens: [
          { id: 'o12', numero: 12, problema: 'Não liga' },
          { id: 'o20', numero: 20, problema: 'Não liga de novo' },
        ],
        ultimaEm: ha(3),
      },
    ]);
  });

  it('OS no ativo errado: a encerrada sem resolver não conta', () => {
    const resultado = indicadorDasRepetidas(
      [
        os(15, {
          abertaHa: 9,
          situacao: 'encerrada',
          historico: [
            { situacao: 'aberta', ha: 9 },
            { situacao: 'encerrada', ha: 9 },
          ],
        }),
        os(16, { abertaHa: 8 }),
      ],
      PERIODO,
      2,
    );
    expect(resultado).toMatchObject({ valor: 0, base: 1, situacao: 'dentro', itens: [] });
  });

  it('lista do ativo com mais OS para o com menos e, no empate, da última mais recente', () => {
    const outro = { id: 'nb0040', rotulo: 'NB-0040' };
    const resultado = indicadorDasRepetidas(
      [
        os(1, { abertaHa: 20, ativo: PAT00412 }),
        os(2, { abertaHa: 15, ativo: PAT00412 }),
        os(3, { abertaHa: 25 }),
        os(4, { abertaHa: 4 }),
        os(5, { abertaHa: 6, ativo: outro }),
        os(6, { abertaHa: 5, ativo: outro }),
        os(7, { abertaHa: 1, ativo: outro }),
      ],
      PERIODO,
      2,
    );
    expect(resultado.itens.map(({ ativo, quantas }) => [ativo.rotulo, quantas])).toEqual([
      ['NB-0040', 3],
      ['NB-0031', 2],
      ['PAT-00412', 2],
    ]);
  });

  it('compara com os ativos repetidos do período anterior', () => {
    const resultado = indicadorDasRepetidas(
      [os(1, { abertaHa: 40 }), os(2, { abertaHa: 35 }), os(3, { abertaHa: 2 })],
      PERIODO,
      2,
    );
    expect(resultado).toMatchObject({ valor: 0, anterior: 1, situacao: 'dentro' });
  });
});

const CF258A = {
  id: 'cf258a',
  codigo: 'CF258A',
  cor: 'preto' as CorDeConsumivel,
  rendimento: 3000,
};
const CF258X = {
  id: 'cf258x',
  codigo: 'CF258X',
  cor: 'preto' as CorDeConsumivel,
  rendimento: 6000,
};
const CF411A = {
  id: 'cf411a',
  codigo: 'CF411A',
  cor: 'ciano' as CorDeConsumivel,
  rendimento: 2300,
};

type Impressora = typeof PAT00412;

let saidas = 0;

/** A saída de um toner para a impressora há `ha` dias, com o total de páginas lido nela. */
function saida(
  consumivel: {
    id: string;
    codigo: string;
    cor: CorDeConsumivel | null;
    rendimento: number | null;
  },
  quando: number,
  totalDePaginas: number | null,
  {
    impressora = PAT00412,
    quantidade = 1,
    contaVe = true,
  }: { impressora?: Impressora; quantidade?: number; contaVe?: boolean } = {},
): SaidaDeTonerParaOsIndicadores<Impressora> {
  saidas += 1;
  return {
    id: `m${saidas}`,
    impressoraChave: impressora.id,
    impressora,
    consumivel,
    quantidade,
    momento: ha(quando),
    totalDePaginas,
    contaVe,
  };
}

const META_DE_80 = 800;

describe('as páginas por toner', () => {
  it('Toner que rendeu pouco: conta e lista o toner, com as páginas sobre o rendimento', () => {
    const resultado = indicadorDasPaginas(
      [saida(CF258A, 40, 40_000), saida(CF258A, 5, 41_850)],
      PERIODO,
      META_DE_80,
    );
    expect(resultado).toMatchObject({ valor: 1, base: 1, situacao: 'fora', mais: 0 });
    expect(resultado.itens).toEqual([
      {
        impressora: PAT00412,
        consumivel: { id: 'cf258a', codigo: 'CF258A' },
        paginas: 1850,
        rendimento: 3000,
        porMil: 617,
        trocadoEm: ha(5),
      },
    ]);
  });

  it('Troca sem o total de páginas: o toner não entra, e o indicador fica sem dado', () => {
    expect(
      indicadorDasPaginas([saida(CF258A, 40, 40_000), saida(CF258A, 5, null)], PERIODO, META_DE_80),
    ).toEqual({ valor: null, anterior: null, base: 0, situacao: 'sem-dado', itens: [], mais: 0 });
  });

  it('Saída de dois toners: o toner dela não entra', () => {
    const resultado = indicadorDasPaginas(
      [saida(CF258A, 40, 40_000, { quantidade: 2 }), saida(CF258A, 5, 41_850)],
      PERIODO,
      META_DE_80,
    );
    expect(resultado).toMatchObject({ valor: null, base: 0, situacao: 'sem-dado' });
  });

  it('Compatível na troca: as páginas do original contam até a saída do compatível', () => {
    const resultado = indicadorDasPaginas(
      [saida(CF258A, 40, 40_000), saida(CF258X, 5, 42_700)],
      PERIODO,
      META_DE_80,
    );
    // 2.700 de 3.000 páginas: 90%, acima da meta.
    expect(resultado).toMatchObject({ valor: 0, base: 1, situacao: 'dentro', itens: [] });
  });

  it('não mede o toner sem rendimento, o total menor na troca nem a troca que a conta não vê', () => {
    const semRendimento = { ...CF258A, id: 'sem', rendimento: null };
    const resultado = indicadorDasPaginas(
      [
        saida(semRendimento, 50, 10_000),
        saida(CF258A, 45, 11_000),
        // A impressora trocou de placa: o total voltou.
        saida(CF258A, 30, 500),
        saida(CF258A, 20, 1_000),
        saida(CF258A, 10, 1_300, { contaVe: false }),
      ],
      PERIODO,
      META_DE_80,
    );
    // O toner sem rendimento não mede, o total voltou na troca de 30 dias atrás e a de 10 dias
    // atrás a conta não vê: só entra o toner trocado há 20 dias, com 500 de 3.000 páginas.
    expect(resultado).toMatchObject({ valor: 1, base: 1, anterior: null });
    expect(resultado.itens.map(({ paginas, trocadoEm }) => [paginas, trocadoEm])).toEqual([
      [500, ha(20)],
    ]);
  });

  it('cada cor tem a vida dela: o ciano não troca o preto', () => {
    const resultado = indicadorDasPaginas(
      [saida(CF258A, 40, 40_000), saida(CF411A, 20, 40_900), saida(CF258A, 5, 43_000)],
      PERIODO,
      META_DE_80,
    );
    expect(resultado).toMatchObject({ valor: 0, base: 1, situacao: 'dentro' });
  });

  it('a saída anterior que a conta não vê vale pelo total e pelo consumível', () => {
    const resultado = indicadorDasPaginas(
      [saida(CF258A, 40, 40_000, { contaVe: false }), saida(CF258A, 5, 41_850)],
      PERIODO,
      META_DE_80,
    );
    expect(resultado).toMatchObject({ valor: 1, base: 1 });
  });

  it('Lista longa: lista os 20 que renderam menos, com quantos ficaram de fora', () => {
    const impressoras = Array.from({ length: 23 }, (_, indice) => ({
      id: `imp${indice}`,
      rotulo: `PAT-${String(indice).padStart(5, '0')}`,
    }));
    const resultado = indicadorDasPaginas(
      impressoras.flatMap((impressora, indice) => [
        saida(CF258A, 40, 10_000, { impressora }),
        saida(CF258A, 5, 10_000 + 100 * (indice + 1), { impressora }),
      ]),
      PERIODO,
      META_DE_80,
    );
    expect(resultado).toMatchObject({ valor: 23, base: 23, mais: 3 });
    expect(resultado.itens).toHaveLength(20);
    expect(resultado.itens[0]?.paginas).toBe(100);
    expect(resultado.itens.at(-1)?.paginas).toBe(2000);
  });

  it('compara com os toners abaixo da meta trocados no período anterior', () => {
    const resultado = indicadorDasPaginas(
      [saida(CF258A, 70, 0), saida(CF258A, 40, 1_000), saida(CF258A, 5, 3_900)],
      PERIODO,
      META_DE_80,
    );
    expect(resultado).toMatchObject({ valor: 0, anterior: 1, base: 1, situacao: 'dentro' });
  });
});

describe('calcularIndicadoresDaOperacao', () => {
  it('calcula os três com as metas da organização, no período até agora', () => {
    const resultado = calcularIndicadoresDaOperacao(
      {
        ordens: [os(12, { abertaHa: 6, resolvidaHa: 2 }), os(13, { abertaHa: 3 })],
        saidas: [saida(CF258A, 40, 40_000), saida(CF258A, 5, 41_850)],
      },
      {
        agora: AGORA,
        metas: {
          'resolucao-das-os': 3 * MINUTOS_DO_DIA,
          'os-repetidas': 2,
          'paginas-por-toner': 800,
        },
      },
    );
    expect(resultado.periodo).toEqual(PERIODO);
    expect(resultado['resolucao-das-os']).toMatchObject({
      valor: 4 * MINUTOS_DO_DIA,
      situacao: 'fora',
    });
    expect(resultado['os-repetidas']).toMatchObject({ valor: 1, situacao: 'fora' });
    expect(resultado['paginas-por-toner']).toMatchObject({ valor: 1, situacao: 'fora' });
  });
});
