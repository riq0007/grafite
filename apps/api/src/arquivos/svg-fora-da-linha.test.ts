// O SVG enviado é sanitizado numa linha de execução própria (change ci-no-executor-proprio, design,
// decisão 6): o jsdom leva segundos para carregar no primeiro SVG, e no Windows chegou a 16 s, com a
// API parada para todos. Este arquivo roda num processo só dele, com o jsdom ainda fora da memória.
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { sanitizarSvg } from './svg.ts';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

it('sanitiza o primeiro SVG sem carregar o jsdom na linha da API nem parar o laço de eventos', async () => {
  let anterior = performance.now();
  let maiorAtraso = 0;
  const relogio = setInterval(() => {
    const agora = performance.now();
    maiorAtraso = Math.max(maiorAtraso, agora - anterior);
    anterior = agora;
  }, 10);
  try {
    expect(await sanitizarSvg(SVG)).toContain('<rect');
  } finally {
    clearInterval(relogio);
  }
  const carregados = Object.keys(createRequire(import.meta.url).cache);
  expect(carregados.filter((caminho) => /[\\/]jsdom[\\/]/.test(caminho))).toEqual([]);
  expect(maiorAtraso).toBeLessThan(1000);
}, 60_000);
