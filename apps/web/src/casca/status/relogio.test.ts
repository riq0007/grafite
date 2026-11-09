import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vigiarOMinuto } from './relogio.ts';

describe('virada do minuto', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('avisa exatamente na virada do minuto, e depois a cada minuto', () => {
    vi.setSystemTime(new Date(2026, 8, 24, 14, 32, 30, 500));
    const aoVirar = vi.fn();
    const parar = vigiarOMinuto(aoVirar);
    vi.advanceTimersByTime(29_499);
    expect(aoVirar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aoVirar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(aoVirar).toHaveBeenCalledTimes(2);
    parar();
  });

  it('se realinha à virada quando um aviso atrasa, como depois de o computador dormir', () => {
    vi.setSystemTime(new Date(2026, 8, 24, 14, 32, 0));
    const aoVirar = vi.fn();
    const parar = vigiarOMinuto(aoVirar);
    vi.advanceTimersByTime(60_000);
    expect(aoVirar).toHaveBeenCalledTimes(1);
    // O relógio do sistema salta 20 s à frente sem os temporizadores andarem.
    vi.setSystemTime(new Date(2026, 8, 24, 14, 33, 20));
    vi.advanceTimersByTime(60_000);
    expect(aoVirar).toHaveBeenCalledTimes(2);
    // O próximo aviso já cai na virada seguinte: 14:35:00.
    const agora = Date.now();
    vi.advanceTimersByTime(new Date(2026, 8, 24, 14, 35, 0).getTime() - agora - 1);
    expect(aoVirar).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(aoVirar).toHaveBeenCalledTimes(3);
    parar();
  });

  it('parar desliga os avisos', () => {
    vi.setSystemTime(new Date(2026, 8, 24, 14, 32, 0));
    const aoVirar = vi.fn();
    vigiarOMinuto(aoVirar)();
    vi.advanceTimersByTime(180_000);
    expect(aoVirar).not.toHaveBeenCalled();
  });
});
