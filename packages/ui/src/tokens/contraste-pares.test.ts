import { describe, expect, it } from 'vitest';
import { avaliar, avaliarTudo, coresDaCombinacao, PARES } from './contraste-pares.ts';
import { temas } from './temas.ts';

describe('avaliar', () => {
  it('aponta o par reprovado com a razão medida, arredondada para baixo', () => {
    expect(
      avaliar({ fundo: '#ffffff', texto: '#777777' }, [
        {
          uso: 'texto sobre fundo',
          frente: (c) => c.texto ?? '',
          fundo: (c) => c.fundo ?? '',
          minimo: 4.5,
        },
      ]),
    ).toEqual([{ uso: 'texto sobre fundo', razao: 4.47, minimo: 4.5, passou: false }]);
  });

  it('mede sobre o fundo translúcido já composto', () => {
    // rgba(0,0,0,0,5) sobre branco = #808080; preto sobre #808080 = 5,32:1
    expect(
      avaliar({ fundo: '#ffffff', material: 'rgba(0, 0, 0, 0.5)', texto: '#000000' }, [
        {
          uso: 'texto sobre material',
          frente: (c) => c.texto ?? '',
          fundo: (c) => ({ camada: c.material ?? '', sobre: c.fundo ?? '' }),
          minimo: 4.5,
        },
      ]),
    ).toEqual([{ uso: 'texto sobre material', razao: 5.31, minimo: 4.5, passou: true }]);
  });
});

describe('os rótulos das situações', () => {
  it('são medidos sobre o fundo gerado da situação, e não sobre uma tinta fixa', () => {
    const cores = {
      atencao: '#7b5100',
      atencaoFundo: 'rgba(208, 144, 30, 0.26)',
      superficie: '#fdfcfa',
      superficie2: '#f5f3ef',
    };
    const fundoDoPar = (uso: string) => PARES.find((p) => p.uso === uso)?.fundo(cores);
    expect(fundoDoPar('rótulo de atenção sobre a superfície tingida')).toEqual({
      camada: 'rgba(208, 144, 30, 0.26)',
      sobre: '#fdfcfa',
    });
    expect(fundoDoPar('rótulo de atenção sobre a superfície 2 tingida')).toEqual({
      camada: 'rgba(208, 144, 30, 0.26)',
      sobre: '#f5f3ef',
    });
  });

  it('cada combinação traz o fundo gerado de cada situação', () => {
    const cores = coresDaCombinacao('papel', 'azul');
    for (const [id, situacao] of Object.entries(temas.papel.situacoes)) {
      expect(cores[`${id}Fundo`], id).toBe(situacao.fundo);
    }
  });
});

describe('as 24 combinações de tema × destaque', () => {
  it('passam em todos os pares de uso', () => {
    const reprovados = avaliarTudo()
      .filter((r) => !r.passou)
      .map((r) => `${r.tema}/${r.destaque}: ${r.uso} = ${r.razao} (mínimo ${r.minimo})`);
    expect(reprovados).toEqual([]);
  });
});
