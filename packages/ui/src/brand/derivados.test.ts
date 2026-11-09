import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { temas } from '../tokens/temas.ts';
import { arquivosDaMarca, iconeMascaravel } from './gerar-marca.ts';

const raiz = resolve(fileURLToPath(import.meta.url), '../../../../..');
const arquivos = arquivosDaMarca();

/** Largura e altura de um PNG, pelo cabeçalho IHDR. */
const dimensoesDoPng = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

describe('derivados da marca', () => {
  it('todos saem da fonte: gerar de novo produz exatamente os arquivos gravados', () => {
    expect(arquivos.size).toBe(13);
    for (const [caminho, conteudo] of arquivos) {
      const gravado = readFileSync(join(raiz, caminho));
      expect(gravado.equals(Buffer.from(conteudo)), caminho).toBe(true);
    }
  });

  it('há símbolo, logotipo, marca e as versões monocromáticas', () => {
    for (const nome of ['simbolo', 'logotipo', 'marca', 'marca-escura', 'marca-clara']) {
      expect([...arquivos.keys()]).toContain(`packages/ui/src/brand/${nome}.svg`);
    }
  });

  it('o favicon SVG acompanha o tema do sistema; o ICO tem 16, 32 e 48 px', () => {
    const svg = String(arquivos.get('apps/web/public/favicon.svg'));
    expect(svg).toContain('prefers-color-scheme: dark');
    const ico = Buffer.from(arquivos.get('apps/web/public/favicon.ico') as Buffer);
    expect(ico.readUInt16LE(2)).toBe(1);
    const quantos = ico.readUInt16LE(4);
    const lados = Array.from({ length: quantos }, (_, i) => ico.readUInt8(6 + i * 16));
    expect(lados).toEqual([16, 32, 48]);
  });

  it('os ícones da PWA têm 192 e 512 px', () => {
    const png = (nome: string) =>
      Buffer.from(arquivos.get(`apps/web/public/icones/${nome}`) as Buffer);
    expect(dimensoesDoPng(png('pwa-192.png'))).toEqual([192, 192]);
    expect(dimensoesDoPng(png('pwa-512.png'))).toEqual([512, 512]);
    expect(dimensoesDoPng(png('pwa-maskable-512.png'))).toEqual([512, 512]);
  });

  it('o manifesto da PWA declara os ícones gerados, com as cores do tema padrão', () => {
    const manifesto = JSON.parse(String(arquivos.get('apps/web/public/manifest.webmanifest'))) as {
      name: string;
      lang: string;
      background_color: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; purpose: string }>;
    };
    expect(manifesto.name).toBe('Grafite');
    expect(manifesto.lang).toBe('pt-BR');
    expect(manifesto.background_color).toBe(temas.grafite.cores.fundo);
    expect(manifesto.theme_color).toBe(temas.grafite.cores.fundo);
    expect(manifesto.icons.map((icone) => `${icone.sizes} ${icone.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
    for (const icone of manifesto.icons) {
      expect([...arquivos.keys()]).toContain(`apps/web/public${icone.src}`);
    }
  });

  it('no maskable, o desenho fica dentro da área segura (círculo de 80% do ícone)', () => {
    const lado = 512;
    const { pixels } = new Resvg(iconeMascaravel(lado)).render();
    const [fr, fg, fb] = [pixels[0], pixels[1], pixels[2]];
    const raioSeguro = lado * 0.4;
    let foraDaArea = 0;
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const i = (y * lado + x) * 4;
        const diferente = pixels[i] !== fr || pixels[i + 1] !== fg || pixels[i + 2] !== fb;
        const distancia = Math.hypot(x + 0.5 - lado / 2, y + 0.5 - lado / 2);
        if (diferente && distancia > raioSeguro) foraDaArea++;
      }
    }
    expect(foraDaArea).toBe(0);
  });
});
