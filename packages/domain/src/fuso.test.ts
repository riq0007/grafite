import { afterEach, describe, expect, it, vi } from 'vitest';
import { comecoDoDia, relogioDoFuso } from './fuso.ts';

describe('comecoDoDia', () => {
  it('é a meia-noite do dia no relógio do fuso', () => {
    const agora = new Date('2026-10-02T14:00:00Z');
    expect(comecoDoDia(agora, 'America/Sao_Paulo')).toEqual(new Date('2026-10-02T03:00:00Z'));
    expect(comecoDoDia(agora, 'UTC')).toEqual(new Date('2026-10-02T00:00:00Z'));
  });

  it('o dia é o do fuso, e não o de UTC', () => {
    // 02:00 em UTC ainda é 23:00 do dia anterior em São Paulo, e 20:00 já é o dia seguinte em Tóquio.
    expect(comecoDoDia(new Date('2026-10-02T02:00:00Z'), 'America/Sao_Paulo')).toEqual(
      new Date('2026-10-01T03:00:00Z'),
    );
    expect(comecoDoDia(new Date('2026-10-02T20:00:00Z'), 'Asia/Tokyo')).toEqual(
      new Date('2026-10-02T15:00:00Z'),
    );
  });

  it('a própria meia-noite começa o dia', () => {
    const meiaNoite = new Date('2026-10-02T03:00:00Z');
    expect(comecoDoDia(meiaNoite, 'America/Sao_Paulo')).toEqual(meiaNoite);
  });
});

/**
 * Conta os formatos que o Intl monta, montando-os de verdade. A troca é uma função que devolve o
 * formato, porque o código o monta com `new`: a seta não aceita o `new`, e a classe sairia com o
 * protótipo do espião.
 */
function contarOsFormatosMontados() {
  const Original = Intl.DateTimeFormat;
  function montar(...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
    return new Original(...args);
  }
  return vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(montar);
}

describe('o formato do relógio do fuso', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o mesmo fuso em outra caixa lê o mesmo relógio, sem guardar outro formato', () => {
    const momento = new Date('2026-10-02T14:00:00Z');
    const esperado = relogioDoFuso(momento, 'America/Sao_Paulo');
    // O apelido também lê o mesmo relógio, mas fica fora da conta: o nome que o Intl devolve para
    // ele é do motor. O Node de hoje devolve "America/Sao_Paulo"; a regra nova do ECMA-402 (a da
    // proposta canonical-tz, que veio com o Temporal) devolve o próprio apelido, só com a caixa
    // certa. Nos dois, fica no máximo um formato por nome que o Intl conhece.
    expect(relogioDoFuso(momento, 'Brazil/East')).toEqual(esperado);
    const montar = contarOsFormatosMontados();
    // A caixa, todo motor acerta.
    const outrasCaixas = ['america/sao_paulo', 'AMERICA/SAO_PAULO'];
    for (const _volta of [1, 2]) {
      for (const fuso of outrasCaixas) {
        expect(relogioDoFuso(momento, fuso)).toEqual(esperado);
      }
    }
    // Cada pedido monta o formato de novo, e ele fica guardado pelo nome que o Intl devolve.
    // Guardados pelo texto pedido, os outros jeitos seriam montados só na primeira volta, e cada
    // caixa nova, vinda da consulta, ficaria na memória.
    expect(montar).toHaveBeenCalledTimes(outrasCaixas.length * 2);
    montar.mockClear();
    expect(relogioDoFuso(momento, 'America/Sao_Paulo')).toEqual(esperado);
    expect(montar).not.toHaveBeenCalled();
  });

  it('o fuso pedido pela primeira vez noutro jeito guarda o formato pelo nome do Intl', () => {
    const momento = new Date('2026-10-02T14:00:00Z');
    // O primeiro pedido de Auckland vem em minúsculas: o formato fica guardado como
    // "Pacific/Auckland".
    const emMinusculas = relogioDoFuso(momento, 'pacific/auckland');
    const montar = contarOsFormatosMontados();
    expect(relogioDoFuso(momento, 'Pacific/Auckland')).toEqual(emMinusculas);
    expect(montar).not.toHaveBeenCalled();
    // E o texto pedido não ficou guardado: pedi-lo de novo monta o formato outra vez.
    expect(relogioDoFuso(momento, 'pacific/auckland')).toEqual(emMinusculas);
    expect(montar).toHaveBeenCalledTimes(1);
  });
});
