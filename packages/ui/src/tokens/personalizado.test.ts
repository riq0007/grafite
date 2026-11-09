// O tema e o destaque personalizados, gerados no navegador (spec design-tokens, "Tema e destaque
// personalizados em tempo de execução"; change tema-personalizado, design, decisões 2 e 6).
import { describe, expect, it } from 'vitest';
import { contraste } from './contraste.ts';
import { destaqueDoTema } from './destaques.ts';
import {
  destaqueDeFabrica,
  destaquePersonalizado,
  lapisDoContraste,
  temaPersonalizado,
  trilhaDasMatizes,
  variaveisDeCor,
} from './personalizado.ts';
import { temas } from './temas.ts';

const GRAFITE = { tom: 'escuro', matiz: 265, tingimento: 10, contraste: 45 } as const;

describe('temaPersonalizado', () => {
  it('nos padrões, é o Grafite: as cores, as sombras, as situações e os dados', () => {
    const tema = temaPersonalizado(GRAFITE);
    expect(tema.cores).toEqual(temas.grafite.cores);
    expect(tema.sombraMaterial).toBe(temas.grafite.sombraMaterial);
    expect(tema.situacoes).toEqual(temas.grafite.situacoes);
    expect(tema.dados).toEqual(temas.grafite.dados);
  });

  it('montar o próprio tema: claro, na matiz 80, com o texto a pelo menos 7:1', () => {
    const tema = temaPersonalizado({ tom: 'claro', matiz: 80, tingimento: 40, contraste: 45 });
    expect(tema.tom).toBe('claro');
    expect(contraste(tema.cores.texto, tema.cores.superficie)).toBeGreaterThanOrEqual(7);
    expect(contraste(tema.cores.texto2, tema.cores.superficie)).toBeGreaterThanOrEqual(4.5);
  });

  it('a mesma entrada devolve o mesmo tema, sem gerar de novo', () => {
    expect(temaPersonalizado({ ...GRAFITE, matiz: 100 })).toBe(
      temaPersonalizado({ ...GRAFITE, matiz: 100 }),
    );
  });
});

describe('destaquePersonalizado', () => {
  it('na matiz 258 com 85% de intensidade, é o azul do tema', () => {
    expect(destaquePersonalizado(temas.grafite, { matiz: 258, intensidade: 85 })).toEqual(
      destaqueDoTema('grafite', 'azul'),
    );
  });

  it('com a intensidade 0, é o monocromático em qualquer matiz', () => {
    expect(destaquePersonalizado(temas.nevoa, { matiz: 140, intensidade: 0 })).toEqual(
      destaqueDoTema('nevoa', 'grafite'),
    );
  });
});

describe('destaqueDeFabrica', () => {
  it('num tema de fábrica, é o mesmo destaque do tokens.css', () => {
    expect(destaqueDeFabrica(temas.papel, 'laranja')).toEqual(destaqueDoTema('papel', 'laranja'));
  });
});

describe('variaveisDeCor', () => {
  const variaveis = variaveisDeCor(temas.nevoa, destaqueDoTema('nevoa', 'verde'));

  it('traz as cores do tema, das situações, dos dados e do destaque, como o tokens.css', () => {
    expect(variaveis['--cor-fundo']).toBe(temas.nevoa.cores.fundo);
    expect(variaveis['--cor-superficie-afundada']).toBe(temas.nevoa.cores.superficieAfundada);
    expect(variaveis['--cor-ok-fundo']).toBe(temas.nevoa.situacoes.ok.fundo);
    expect(variaveis['--cor-serie-1']).toBe(temas.nevoa.dados.series[0]);
    expect(variaveis['--cor-tinta-ciano']).toBe(temas.nevoa.dados.tintas.ciano);
    expect(variaveis['--cor-destaque']).toBe(destaqueDoTema('nevoa', 'verde').destaque);
    expect(variaveis['--sombra-elevada']).toBe(temas.nevoa.sombraElevada);
  });

  it('só as variáveis de cor e de sombra, com valores que o anti-flash aceita', () => {
    expect(variaveis).not.toHaveProperty('color-scheme');
    for (const [nome, valor] of Object.entries(variaveis)) {
      expect(nome).toMatch(/^--(cor|sombra)-[a-z0-9-]+$/);
      expect(valor, nome).toMatch(/^[#\w\s(),.%-]+$/);
    }
  });
});

describe('lapisDoContraste', () => {
  it('a dureza do lápis, de 2H a 4B, com o HB no padrão', () => {
    const faixas: Array<[number, string]> = [
      [0, '2H'],
      [19, '2H'],
      [20, 'H'],
      [34, 'H'],
      [35, 'HB'],
      [45, 'HB'],
      [54, 'HB'],
      [55, 'B'],
      [69, 'B'],
      [70, '2B'],
      [84, '2B'],
      [85, '4B'],
      [100, '4B'],
    ];
    for (const [valor, lapis] of faixas) expect(lapisDoContraste(valor), String(valor)).toBe(lapis);
  });
});

describe('trilhaDasMatizes', () => {
  it('o gradiente da volta das matizes, de 30 em 30 graus, em hexadecimal', () => {
    const trilha = trilhaDasMatizes(0.7, 0.12);
    expect(trilha.startsWith('linear-gradient(to right, ')).toBe(true);
    expect(trilha.match(/#[0-9a-f]{6}/g)).toHaveLength(13);
  });
});
