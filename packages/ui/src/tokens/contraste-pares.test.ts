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

describe('as cores da aba', () => {
  it('o "Trocar" sob o ponteiro é medido sobre o bloco, e o escolhido apertado, sobre o fundo', () => {
    const cores = {
      pressionado: 'rgba(238, 239, 241, 0.1)',
      abaFundo: '#004f9d',
      abaBloco: '#0064b6',
    };
    const fundoDoPar = (uso: string) => PARES.find((p) => p.uso === uso)?.fundo(cores);
    expect(fundoDoPar('texto da aba sobre o bloco da aba pressionado (Trocar)')).toEqual({
      camada: 'rgba(238, 239, 241, 0.1)',
      sobre: '#0064b6',
    });
    expect(
      fundoDoPar('texto da aba sobre o fundo da aba pressionado (tipo, cartão e chip escolhidos)'),
    ).toEqual({ camada: 'rgba(238, 239, 241, 0.1)', sobre: '#004f9d' });
  });

  it('cada combinação traz as cores da aba do tema', () => {
    const cores = coresDaCombinacao('papel', 'azul');
    expect(cores.abaFundo).toBe(temas.papel.aba.fundo);
    expect(cores.abaFundo2).toBe(temas.papel.aba.fundo2);
    expect(cores.abaContorno).toBe(temas.papel.aba.contorno);
    expect(cores.abaSobreAtencao).toBe(temas.papel.aba.sobreAtencao);
  });

  it('entram nos pares: o texto sobre os fundos e o bloco, soltos e pressionados, o selo e o contorno', () => {
    expect(PARES.map((par) => par.uso).filter((uso) => uso.includes('aba'))).toEqual([
      'texto da aba sobre o fundo da aba (faixa, número e escolhido)',
      'texto da aba sobre o fundo da aba pressionado (tipo, cartão e chip escolhidos)',
      'texto da aba sobre o fundo 2 da aba (pílula da trilha)',
      'texto da aba sobre o bloco da aba (quem pede)',
      'texto da aba sobre o bloco da aba pressionado (Trocar)',
      'texto sobre a atenção da aba (selo)',
      'contorno da aba contra a superfície',
      'contorno da aba contra a superfície 2 (ícone do tipo e "Nenhum")',
      'contorno da aba contra a superfície elevada (moldura)',
    ]);
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
