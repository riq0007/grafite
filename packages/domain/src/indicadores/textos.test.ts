// O texto dos valores, das metas e da notificação dos indicadores (spec indicadores, "Período dos
// indicadores" e "Indicador fora da meta avisa"; change p3d-indicadores, design, decisões 2 e 4; spec
// indicadores-da-operacao; change p4f-indicadores-da-operacao, design, decisões 4 e 8).
import { describe, expect, it } from 'vitest';
import {
  DEFINICOES_DOS_INDICADORES,
  INDICADORES,
  INDICADORES_DA_OPERACAO,
  INDICADORES_DOS_ALERTAS,
} from './indicadores.ts';
import {
  destinoDoIndicador,
  focoDoIndicador,
  motivoSemValorDaOperacao,
  notificacaoDoIndicador,
  textoDaBaseDaOperacao,
  textoDaMeta,
  textoDaMudancaDaMeta,
  textoDaPorcentagem,
  textoDoTempo,
  textoDoValor,
} from './textos.ts';

describe('textoDoTempo', () => {
  it.each([
    [0, 'menos de 1 min'],
    [0.6, 'menos de 1 min'],
    [1, '1 min'],
    [32, '32 min'],
    [59.4, '59 min'],
    // Arredondado para 60 min, já é 1 h.
    [59.6, '1 h'],
    [60, '1 h'],
    [72, '1,2 h'],
    [90, '1,5 h'],
    // Arredondado para 24 h, já é 1 dia.
    [1439, '1 dia'],
    [1440, '1 dia'],
    [2160, '1,5 dia'],
    [2880, '2 dias'],
    [3312, '2,3 dias'],
    [4608, '3,2 dias'],
    [43_200, '30 dias'],
  ])('%s min é "%s"', (minutos, texto) => {
    expect(textoDoTempo(minutos)).toBe(texto);
  });
});

describe('textoDaPorcentagem', () => {
  it.each([
    [975, '97,5%'],
    [990, '99%'],
    [999, '99,9%'],
    [900, '90%'],
    [1000, '100%'],
  ])('%s por mil é "%s"', (porMil, texto) => {
    expect(textoDaPorcentagem(porMil)).toBe(texto);
  });
});

describe('a meta e o valor em texto', () => {
  it('escreve a meta na unidade do indicador', () => {
    expect(textoDaMeta('toner', 2880)).toBe('2 dias');
    expect(textoDaMeta('critico', 30)).toBe('30 min');
    expect(textoDaMeta('disponibilidade', 995)).toBe('99,5%');
    expect(textoDaMeta('que-voltam', 3)).toBe('3 vezes');
    expect(textoDaMeta('resolucao-das-os', 4320)).toBe('3 dias');
    expect(textoDaMeta('os-repetidas', 2)).toBe('2 OS');
    expect(textoDaMeta('paginas-por-toner', 800)).toBe('80%');
    expect(textoDaMeta('paginas-por-toner', 805)).toBe('80,5%');
  });

  it('escreve os limites como a mensagem da recusa', () => {
    for (const indicador of INDICADORES) {
      const {
        limites: [minimo, maximo],
        limitesEmTexto,
      } = DEFINICOES_DOS_INDICADORES[indicador];
      // As quantidades dizem a unidade só no máximo: "entre 2 e 20 vezes".
      const soONumero = indicador === 'que-voltam' || indicador === 'os-repetidas';
      const deTexto = soONumero ? String(minimo) : textoDaMeta(indicador, minimo);
      expect(limitesEmTexto).toEqual([deTexto, textoDaMeta(indicador, maximo)]);
    }
  });

  it('escreve o valor do tempo e a quantidade de ativos', () => {
    expect(textoDoValor('toner', 2160)).toBe('1,5 dia');
    expect(textoDoValor('critico', 0.3)).toBe('menos de 1 min');
    expect(textoDoValor('disponibilidade', 1)).toBe('1 ativo');
    expect(textoDoValor('disponibilidade', 2)).toBe('2 ativos');
    expect(textoDoValor('que-voltam', 0)).toBe('0 ativos');
  });

  it('escreve o valor dos indicadores da operação, com os toners no singular e no plural', () => {
    expect(textoDoValor('resolucao-das-os', 6048)).toBe('4,2 dias');
    expect(textoDoValor('os-repetidas', 1)).toBe('1 ativo');
    expect(textoDoValor('os-repetidas', 3)).toBe('3 ativos');
    expect(textoDoValor('paginas-por-toner', 1)).toBe('1 toner');
    expect(textoDoValor('paginas-por-toner', 2)).toBe('2 toners');
  });

  it('escreve a mudança da meta como a auditoria a guarda', () => {
    expect(textoDaMudancaDaMeta('toner', 2880, 1440)).toBe('2 dias → 1 dia');
    expect(textoDaMudancaDaMeta('disponibilidade', 990, 995)).toBe('99% → 99,5%');
    // Meta mudada, da spec: as OS repetidas de 2 OS para 3 OS.
    expect(textoDaMudancaDaMeta('os-repetidas', 2, 3)).toBe('2 OS → 3 OS');
  });
});

describe('a base e o motivo sem valor dos indicadores da operação', () => {
  it('diz a base do cálculo de cada um, no singular e no plural', () => {
    expect(textoDaBaseDaOperacao('resolucao-das-os', 12)).toBe('Mediana de 12 OS resolvidas');
    expect(textoDaBaseDaOperacao('resolucao-das-os', 1)).toBe('Mediana de 1 OS resolvida');
    expect(textoDaBaseDaOperacao('os-repetidas', 34)).toBe('34 ativos com OS no período');
    expect(textoDaBaseDaOperacao('os-repetidas', 1)).toBe('1 ativo com OS no período');
    expect(textoDaBaseDaOperacao('paginas-por-toner', 8)).toBe(
      '8 toners trocados com o total de páginas',
    );
    expect(textoDaBaseDaOperacao('paginas-por-toner', 1)).toBe(
      '1 toner trocado com o total de páginas',
    );
  });

  it('diz o motivo no lugar do número: sem dado, ou nada na lista', () => {
    expect(motivoSemValorDaOperacao('resolucao-das-os', 4320, 0)).toBe(
      'Nenhuma OS resolvida nos últimos 30 dias.',
    );
    expect(motivoSemValorDaOperacao('os-repetidas', 2, 5)).toBe(
      'Nenhum ativo com 2 OS nos últimos 30 dias.',
    );
    // Sem nenhum toner medido, falta o dado; com os toners medidos, nenhum ficou abaixo.
    expect(motivoSemValorDaOperacao('paginas-por-toner', 800, 0)).toBe(
      'Nenhum toner trocado com o total de páginas nos últimos 30 dias.',
    );
    expect(motivoSemValorDaOperacao('paginas-por-toner', 800, 8)).toBe(
      'Nenhum toner abaixo de 80% do rendimento.',
    );
  });
});

describe('notificacaoDoIndicador', () => {
  it('diz o tempo do toner e a meta, com a decisão e o endereço com o foco', () => {
    expect(notificacaoDoIndicador('toner', 4608, 2880)).toEqual({
      titulo: 'Tempo de atendimento do toner fora da meta: 3,2 dias, com a meta de 2 dias',
      descricao:
        'Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.',
      destino: '/alertas/indicadores?foco=indicador-toner',
      origem: 'Alertas',
    });
  });

  it('diz o tempo até reconhecer o Crítico', () => {
    expect(notificacaoDoIndicador('critico', 72, 30).titulo).toBe(
      'Tempo até reconhecer o Crítico fora da meta: 1,2 h, com a meta de 30 min',
    );
  });

  it('conta os ativos no singular e no plural', () => {
    expect(notificacaoDoIndicador('disponibilidade', 1, 990).titulo).toBe(
      'Disponibilidade fora da meta: 1 ativo abaixo de 99%',
    );
    expect(notificacaoDoIndicador('disponibilidade', 2, 990).titulo).toBe(
      'Disponibilidade fora da meta: 2 ativos abaixo de 99%',
    );
    expect(notificacaoDoIndicador('que-voltam', 1, 3).titulo).toBe(
      'Alertas que voltam fora da meta: 1 ativo com o mesmo alerta 3 vezes ou mais',
    );
    expect(notificacaoDoIndicador('que-voltam', 4, 3).titulo).toBe(
      'Alertas que voltam fora da meta: 4 ativos com o mesmo alerta 3 vezes ou mais',
    );
  });

  it('leva à tela dos indicadores com o foco de cada um', () => {
    expect(INDICADORES_DOS_ALERTAS.map(focoDoIndicador)).toEqual([
      'indicador-toner',
      'indicador-critico',
      'indicador-disponibilidade',
      'indicador-que-voltam',
    ]);
    expect(destinoDoIndicador('que-voltam')).toBe('/alertas/indicadores?foco=indicador-que-voltam');
  });

  it('Resolução sai da meta: diz o tempo e a meta, com a origem e a tela do Operação', () => {
    expect(notificacaoDoIndicador('resolucao-das-os', 6048, 4320)).toEqual({
      titulo: 'Tempo de resolução das OS fora da meta: 4,2 dias, com a meta de 3 dias',
      descricao:
        'Veja onde as OS esperam: deixe no estoque as peças que mais faltam, ou cobre os fornecedores que mais demoram.',
      destino: '/operacao/indicadores?foco=indicador-resolucao-das-os',
      origem: 'Operação',
    });
  });

  it('conta os ativos das OS repetidas e os toners no singular e no plural', () => {
    expect(notificacaoDoIndicador('os-repetidas', 1, 2).titulo).toBe(
      'OS repetidas fora da meta: 1 ativo com 2 OS ou mais',
    );
    expect(notificacaoDoIndicador('os-repetidas', 2, 2).titulo).toBe(
      'OS repetidas fora da meta: 2 ativos com 2 OS ou mais',
    );
    expect(notificacaoDoIndicador('paginas-por-toner', 1, 800).titulo).toBe(
      'Páginas por toner fora da meta: 1 toner abaixo de 80% do rendimento',
    );
    expect(notificacaoDoIndicador('paginas-por-toner', 3, 800).titulo).toBe(
      'Páginas por toner fora da meta: 3 toners abaixo de 80% do rendimento',
    );
  });

  it('leva os da operação à tela dos indicadores do Operação', () => {
    expect(INDICADORES_DA_OPERACAO.map(destinoDoIndicador)).toEqual([
      '/operacao/indicadores?foco=indicador-resolucao-das-os',
      '/operacao/indicadores?foco=indicador-os-repetidas',
      '/operacao/indicadores?foco=indicador-paginas-por-toner',
    ]);
  });
});
