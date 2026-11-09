import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  carregar,
  type EtapaDaChegada,
  marcarChegada,
  type SituacaoDoCarregamento,
} from './etapas.ts';

/** Uma espera que o teste termina quando quer. */
function espera() {
  let terminar = () => {};
  const promessa = new Promise<void>((resolver) => {
    terminar = resolver;
  });
  return { promessa, terminar };
}

/** Deixa as promessas já resolvidas andarem, sem passar o relógio. */
const andar = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-chegada');
});

/** A chegada do F1c: o Grafite e as preferências, e depois "Pronto". */
function chegadaDoF1c(etapasExtras: EtapaDaChegada[] = []) {
  const grafite = espera();
  const preferencias = espera();
  const pronto = espera();
  const situacoes: SituacaoDoCarregamento[] = [];
  const inicio = Date.now();
  const resultado = carregar(
    [
      { rotulo: 'Carregando o Grafite', pronta: () => grafite.promessa },
      { rotulo: 'Carregando suas preferências', pronta: () => preferencias.promessa },
      ...etapasExtras,
    ],
    {
      pronto: () => pronto.promessa,
      inicio,
      agora: () => Date.now(),
      aoMudar: (situacao) => situacoes.push(situacao),
    },
  );
  const etapasVistas = () =>
    situacoes.map((situacao) => situacao.etapa).filter((etapa, i, todas) => etapa !== todas[i - 1]);
  return { grafite, preferencias, pronto, situacoes, etapasVistas, resultado };
}

describe('carregar', () => {
  it('passa pelas etapas na ordem e termina com "Pronto"', async () => {
    const chegada = chegadaDoF1c();
    expect(chegada.situacoes.at(-1)?.etapa).toBe('Carregando o Grafite');
    chegada.grafite.terminar();
    await andar();
    expect(chegada.situacoes.at(-1)?.etapa).toBe('Carregando suas preferências');
    chegada.preferencias.terminar();
    await andar();
    expect(chegada.situacoes.at(-1)?.etapa).toBe('Pronto');
    chegada.pronto.terminar();
    await chegada.resultado;
    expect(chegada.etapasVistas()).toEqual([
      'Carregando o Grafite',
      'Carregando suas preferências',
      'Pronto',
    ]);
  });

  it('a barra é a fração das etapas concluídas e fica parada enquanto uma demora', async () => {
    const chegada = chegadaDoF1c();
    const barra = () => chegada.situacoes.at(-1)?.progresso;
    expect(barra()).toBe(0);
    chegada.grafite.terminar();
    await andar();
    expect(barra()).toBeCloseTo(1 / 3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(barra()).toBeCloseTo(1 / 3);
    chegada.preferencias.terminar();
    await andar();
    expect(barra()).toBeCloseTo(2 / 3);
    chegada.pronto.terminar();
    await chegada.resultado;
    expect(barra()).toBe(1);
    const progressos = chegada.situacoes.map((situacao) => situacao.progresso);
    expect(progressos).toEqual([...progressos].sort((a, b) => a - b));
  });

  it('uma etapa acrescentada aparece na sua vez, antes de "Pronto"', async () => {
    const sessao = espera();
    const chegada = chegadaDoF1c([{ rotulo: 'Validando sessão', pronta: () => sessao.promessa }]);
    chegada.grafite.terminar();
    chegada.preferencias.terminar();
    await andar();
    expect(chegada.situacoes.at(-1)).toMatchObject({ etapa: 'Validando sessão', progresso: 0.5 });
    sessao.terminar();
    chegada.pronto.terminar();
    await chegada.resultado;
    expect(chegada.etapasVistas()).toEqual([
      'Carregando o Grafite',
      'Carregando suas preferências',
      'Validando sessão',
      'Pronto',
    ]);
  });

  it('a etapa que não vale nesta chegada termina na hora, sem aparecer', async () => {
    const sessao = espera();
    let comSessao = true;
    const alertas = vi.fn(() => Promise.resolve());
    const chegada = chegadaDoF1c([
      { rotulo: 'Validando sessão', pronta: () => sessao.promessa },
      { rotulo: 'Conectando alertas', vale: () => comSessao, pronta: alertas },
    ]);
    chegada.grafite.terminar();
    chegada.preferencias.terminar();
    await andar();
    expect(chegada.situacoes.at(-1)).toMatchObject({ etapa: 'Validando sessão', progresso: 0.4 });
    comSessao = false;
    sessao.terminar();
    await andar();
    expect(chegada.situacoes.at(-1)).toMatchObject({ etapa: 'Pronto', progresso: 0.8 });
    chegada.pronto.terminar();
    await chegada.resultado;
    expect(alertas).not.toHaveBeenCalled();
    expect(chegada.etapasVistas()).toEqual([
      'Carregando o Grafite',
      'Carregando suas preferências',
      'Validando sessão',
      'Pronto',
    ]);
    expect(chegada.situacoes.at(-1)?.progresso).toBe(1);
  });

  it('numa chegada de 300 ms, a camada não aparece', async () => {
    const chegada = chegadaDoF1c();
    await vi.advanceTimersByTimeAsync(300);
    chegada.grafite.terminar();
    chegada.preferencias.terminar();
    chegada.pronto.terminar();
    expect(await chegada.resultado).toEqual({ apareceu: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(chegada.situacoes.some((situacao) => situacao.visivel)).toBe(false);
  });

  it('numa chegada lenta, a camada aparece aos 500 ms, com a etapa em andamento', async () => {
    const chegada = chegadaDoF1c();
    await vi.advanceTimersByTimeAsync(499);
    expect(chegada.situacoes.at(-1)?.visivel).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(chegada.situacoes.at(-1)).toEqual({
      etapa: 'Carregando o Grafite',
      progresso: 0,
      visivel: true,
    });
    chegada.grafite.terminar();
    chegada.preferencias.terminar();
    chegada.pronto.terminar();
    expect(await chegada.resultado).toEqual({ apareceu: true });
  });

  it('se o código chega aos 300 ms, a camada aparece 200 ms depois', async () => {
    const situacoes: SituacaoDoCarregamento[] = [];
    const pronto = espera();
    const resultado = carregar([], {
      pronto: () => pronto.promessa,
      inicio: Date.now() - 300,
      agora: () => Date.now(),
      aoMudar: (situacao) => situacoes.push(situacao),
    });
    await vi.advanceTimersByTimeAsync(199);
    expect(situacoes.at(-1)?.visivel).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(situacoes.at(-1)?.visivel).toBe(true);
    pronto.terminar();
    expect(await resultado).toEqual({ apareceu: true });
  });

  it('com o relógio em fração de ms, a camada não aparece antes dos 500 ms', async () => {
    // O navegador trunca o atraso do setTimeout para ms inteiros, como o relógio falso.
    const situacoes: SituacaoDoCarregamento[] = [];
    const pronto = espera();
    const resultado = carregar([], {
      pronto: () => pronto.promessa,
      inicio: Date.now() - 0.6,
      agora: () => Date.now(),
      aoMudar: (situacao) => situacoes.push(situacao),
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(situacoes.at(-1)?.visivel).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(situacoes.at(-1)?.visivel).toBe(true);
    pronto.terminar();
    expect(await resultado).toEqual({ apareceu: true });
  });

  it('se o código chega depois dos 500 ms, a camada já está à vista desde o começo', async () => {
    const situacoes: SituacaoDoCarregamento[] = [];
    const resultado = carregar([], {
      pronto: () => Promise.resolve(),
      inicio: Date.now() - 800,
      agora: () => Date.now(),
      aoMudar: (situacao) => situacoes.push(situacao),
    });
    expect(situacoes[0]).toEqual({ etapa: 'Pronto', progresso: 0, visivel: true });
    expect(await resultado).toEqual({ apareceu: true });
  });

  it('marca o <html> como carregando enquanto as etapas correm', async () => {
    const chegada = chegadaDoF1c();
    expect(document.documentElement.getAttribute('data-chegada')).toBe('carregando');
    chegada.grafite.terminar();
    chegada.preferencias.terminar();
    await andar();
    expect(document.documentElement.getAttribute('data-chegada')).toBe('carregando');
    chegada.pronto.terminar();
    await chegada.resultado;
  });
});

describe('marcarChegada', () => {
  it('escreve o estado da chegada no <html>, que o CSS da casca lê', () => {
    for (const estado of ['carregando', 'boas-vindas', 'montando', 'pronta'] as const) {
      marcarChegada(estado);
      expect(document.documentElement.getAttribute('data-chegada')).toBe(estado);
    }
  });
});
