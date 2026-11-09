import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OLA } from './gerado/ola.ts';
import {
  arquivosDesatualizados,
  MARGEM_DO_OLA,
  marcaSvg,
  moduloDoOla,
  olaEmCurvas,
} from './gerar-marca.ts';

const ola = olaEmCurvas();

describe('olá das boas-vindas', () => {
  it('traz as letras e o acento em caminhos separados, o acento sem entrar nas letras', () => {
    expect(ola.letras).toMatch(/^M[\d.-]/);
    expect(ola.acento).toMatch(/^M[\d.-]/);
    expect(ola.letras).not.toContain(ola.acento);
    // O "o", o "l" e o "a" são desenhados na ordem da escrita, cada um com o seu contorno.
    expect(ola.letras.match(/M/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('põe o acento sobre o "a", acima dele', () => {
    const { acento, a } = ola.caixas;
    expect(acento.x1).toBeLessThan(a.x2);
    expect(acento.x2).toBeGreaterThan(a.x1);
    expect(acento.y2).toBeLessThanOrEqual(a.y1);
  });

  it('mede o desenho pelas letras e pelo acento, com a margem em volta', () => {
    const { letras, acento } = ola.caixas;
    const esquerda = Math.min(letras.x1, acento.x1);
    const topo = Math.min(letras.y1, acento.y1);
    expect(esquerda).toBeCloseTo(MARGEM_DO_OLA, 1);
    expect(topo).toBeCloseTo(MARGEM_DO_OLA, 1);
    expect(ola.largura).toBeCloseTo(Math.max(letras.x2, acento.x2) + MARGEM_DO_OLA, 1);
    expect(ola.altura).toBeCloseTo(Math.max(letras.y2, acento.y2) + MARGEM_DO_OLA, 1);
    // A escrita é mais larga do que alta, como no protótipo.
    expect(ola.largura).toBeGreaterThan(ola.altura);
  });

  it('o arquivo gerado traz as mesmas medidas e os mesmos caminhos', () => {
    expect(OLA).toEqual({
      largura: ola.largura,
      altura: ola.altura,
      letras: ola.letras,
      acento: ola.acento,
    });
  });
});

describe('verificação da marca', () => {
  let pasta = '';

  afterEach(() => {
    if (pasta) rmSync(pasta, { recursive: true, force: true });
  });

  it('reprova o olá desatualizado e aprova o resto', async () => {
    pasta = mkdtempSync(join(tmpdir(), 'grafite-marca-'));
    // Dois dos arquivos da marca bastam: gerar os ícones em PNG só deixaria o teste lento.
    const arquivos = new Map<string, string>([
      ['packages/ui/src/brand/marca.svg', marcaSvg()],
      ['packages/ui/src/brand/gerado/ola.ts', moduloDoOla(ola)],
    ]);
    for (const [caminho, conteudo] of arquivos) {
      await mkdir(dirname(join(pasta, caminho)), { recursive: true });
      writeFileSync(join(pasta, caminho), conteudo);
    }
    expect(await arquivosDesatualizados(arquivos, pasta)).toEqual([]);
    const caminhoDoOla = 'packages/ui/src/brand/gerado/ola.ts';
    writeFileSync(
      join(pasta, caminhoDoOla),
      String(arquivos.get(caminhoDoOla)).replace(/largura: [\d.]+/, 'largura: 1'),
    );
    expect(await arquivosDesatualizados(arquivos, pasta)).toEqual([caminhoDoOla]);
  });
});
