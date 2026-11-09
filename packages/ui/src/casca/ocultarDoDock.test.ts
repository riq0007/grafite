import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarOcultarDoDock, type OcultarDoDock } from './ocultarDoDock.ts';

let ocultar: OcultarDoDock;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  ocultar.descartar();
  vi.useRealTimers();
});

describe('ocultar automático do dock', () => {
  it('desligado, o dock fica sempre visível', () => {
    ocultar = criarOcultarDoDock({ ligado: false, aoMudar: () => {} });
    ocultar.entrarNoDock();
    ocultar.sairDoDock();
    vi.advanceTimersByTime(5000);
    expect(ocultar.visivel).toBe(true);
  });

  it('ligado, o dock começa escondido e aparece quando o ponteiro chega à faixa da borda', () => {
    ocultar = criarOcultarDoDock({ ligado: true, aoMudar: () => {} });
    expect(ocultar.visivel).toBe(false);
    ocultar.entrarNaFaixa();
    expect(ocultar.visivel).toBe(true);
  });

  it('esconde 650 ms depois de o ponteiro sair do dock', () => {
    const mudancas: boolean[] = [];
    ocultar = criarOcultarDoDock({ ligado: true, aoMudar: (visivel) => mudancas.push(visivel) });
    ocultar.entrarNaFaixa();
    ocultar.entrarNoDock();
    ocultar.sairDoDock();
    vi.advanceTimersByTime(649);
    expect(ocultar.visivel).toBe(true);
    vi.advanceTimersByTime(1);
    expect(ocultar.visivel).toBe(false);
    expect(mudancas).toEqual([true, false]);
  });

  it('continua visível se o ponteiro voltar antes dos 650 ms', () => {
    ocultar = criarOcultarDoDock({ ligado: true, aoMudar: () => {} });
    ocultar.entrarNoDock();
    ocultar.sairDoDock();
    vi.advanceTimersByTime(300);
    ocultar.entrarNoDock();
    vi.advanceTimersByTime(5000);
    expect(ocultar.visivel).toBe(true);
  });

  it('com o foco do teclado dentro, fica visível; sem ele, esconde depois de 650 ms', () => {
    ocultar = criarOcultarDoDock({ ligado: true, aoMudar: () => {} });
    ocultar.focoEntrou();
    expect(ocultar.visivel).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(ocultar.visivel).toBe(true);
    ocultar.focoSaiu();
    vi.advanceTimersByTime(650);
    expect(ocultar.visivel).toBe(false);
  });

  it('com um menu aberto, fica visível mesmo com o ponteiro fora', () => {
    ocultar = criarOcultarDoDock({ ligado: true, aoMudar: () => {} });
    ocultar.entrarNoDock();
    ocultar.menuAbriu();
    ocultar.sairDoDock();
    vi.advanceTimersByTime(5000);
    expect(ocultar.visivel).toBe(true);
    ocultar.menuFechou();
    vi.advanceTimersByTime(650);
    expect(ocultar.visivel).toBe(false);
  });

  it('não esconde ao fechar o menu se o ponteiro ainda está no dock', () => {
    ocultar = criarOcultarDoDock({ ligado: true, aoMudar: () => {} });
    ocultar.entrarNoDock();
    ocultar.menuAbriu();
    ocultar.menuFechou();
    vi.advanceTimersByTime(5000);
    expect(ocultar.visivel).toBe(true);
  });

  it('desligar com o dock escondido mostra o dock na hora', () => {
    ocultar = criarOcultarDoDock({ ligado: true, aoMudar: () => {} });
    expect(ocultar.visivel).toBe(false);
    ocultar.ligar(false);
    expect(ocultar.visivel).toBe(true);
  });
});
