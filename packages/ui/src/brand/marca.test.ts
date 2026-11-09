import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compor, contraste } from '../tokens/contraste.ts';
import { type IdDoTema, temas } from '../tokens/temas.ts';
import { COR_DA_MARCA } from './simbolo.ts';

const pasta = dirname(fileURLToPath(import.meta.url));
const ler = (nome: string) => readFileSync(join(pasta, nome), 'utf8');

describe('marca.svg', () => {
  it('existe, tem viewBox e herda a cor de onde é usada', () => {
    expect(existsSync(join(pasta, 'marca.svg'))).toBe(true);
    const svg = ler('marca.svg');
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
    expect(svg).toContain('currentColor');
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('a palavra vira curva: não depende da fonte instalada', () => {
    const svg = ler('marca.svg');
    expect(svg).not.toContain('<text');
    expect(svg.match(/<path/g)?.length ?? 0).toBeGreaterThan(1);
  });
});

describe('contraste da marca nos seis temas', () => {
  it('a cor da marca tem pelo menos 3:1 sobre o fundo, a superfície e a barra', () => {
    for (const id of Object.keys(temas) as IdDoTema[]) {
      const c = temas[id].cores;
      const cor = c[COR_DA_MARCA];
      for (const [onde, fundo] of [
        ['fundo', c.fundo],
        ['superfície', c.superficie],
        ['barra', compor(c.barra, c.fundo)],
      ] as const) {
        expect(contraste(cor, fundo), `${id} sobre ${onde}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
