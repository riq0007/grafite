// O SVG enviado (spec arquivos-e-imagens; design do F2c, decisão 7): sanitizado antes de ser
// gravado, sem scripts, eventos, objetos estrangeiros nem referências externas, com o desenho que
// sobra igual, e as miniaturas desenhadas a partir dele.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProblemaDaApi } from '../problemas.ts';
import { tratarImagem } from './imagens.ts';

const svg = (corpo: string, atributos = 'width="100" height="50" viewBox="0 0 100 50"') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${atributos}>${corpo}</svg>`,
  );

const texto = async (conteudo: Buffer) =>
  (await tratarImagem(conteudo)).variantes.completa.toString('utf8');

async function recusa(conteudo: Buffer) {
  const erro = (await tratarImagem(conteudo).catch((e: unknown) => e)) as ProblemaDaApi;
  return { status: erro.dados?.status, detalhe: erro.dados?.detalhe };
}

const ILEGIVEL = {
  status: 400,
  detalhe: 'Não foi possível ler a imagem. O arquivo pode estar corrompido.',
};

/** A cor do pixel no meio da imagem. */
async function corNoMeio(imagem: Buffer) {
  const { data, info } = await sharp(imagem).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

// O primeiro SVG carrega o jsdom e o DOMPurify, o que leva segundos com a máquina ocupada pela
// suíte inteira: a carga fica aqui, fora do tempo de cada teste. Com outros jobs do CI na mesma
// máquina, passou de 60 s (change integracao-sob-carga).
beforeAll(() => tratarImagem(svg('<rect width="100" height="50"/>')), 120_000);

// Um servidor local que conta as requisições: o SVG que aponta para ele não pode ser buscado.
let servidor: Server | undefined;
let pedidos = 0;
let externo = '';

beforeAll(async () => {
  servidor = createServer((_pedido, resposta) => {
    pedidos += 1;
    resposta.end();
  });
  const aberto = servidor;
  await new Promise<void>((pronto) => aberto.listen(0, '127.0.0.1', pronto));
  externo = `http://127.0.0.1:${(aberto.address() as AddressInfo).port}`;
});

// Fecha só o servidor que o preparo abriu: com o preparo do SVG falhando antes, ele não existe, e a
// falha aparece sozinha, com a causa.
afterAll(async () => {
  const aberto = servidor;
  if (aberto) await new Promise((fechado) => aberto.close(fechado));
});

describe('o SVG', () => {
  it('é reconhecido pelo texto, depois do BOM, da declaração XML e dos comentários', async () => {
    const conteudo = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<!-- logotipo -->\n'),
      svg('<rect width="100" height="50" fill="#f00"/>'),
    ]);
    expect(await tratarImagem(conteudo)).toMatchObject({
      origem: 'svg',
      tipo: 'image/svg+xml',
      largura: 100,
      altura: 50,
    });
  });

  it('perde o <script> e o onload, e o desenho continua igual', async () => {
    const limpo = await texto(
      svg(
        '<script>alert(1)</script><rect width="100" height="50" fill="#f00" onclick="roubar()"/>',
        'width="100" height="50" viewBox="0 0 100 50" onload="alert(2)"',
      ),
    );
    expect(limpo).not.toMatch(/script|alert|onload|onclick|roubar/);
    expect(limpo).toContain('viewBox="0 0 100 50"');
    expect(limpo).toContain('<rect width="100" height="50" fill="#f00"/>');
  });

  it('mantém as referências internas, como o gradiente, o recorte e o use', async () => {
    const limpo = await texto(
      svg(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient>' +
          '<clipPath id="c"><rect width="50" height="50"/></clipPath>' +
          '<circle id="p" r="5"/></defs>' +
          '<style>.a{fill:url(#g)}</style>' +
          '<rect class="a" width="100" height="50" clip-path="url(#c)"/><use href="#p"/>',
      ),
    );
    expect(limpo).toContain('<linearGradient id="g">');
    expect(limpo).toContain('<clipPath id="c">');
    expect(limpo).toContain('clip-path="url(#c)"');
    expect(limpo).toContain('<use href="#p"/>');
    expect(limpo).toContain('<style>.a{fill:url(#g)}</style>');
  });

  it('perde a imagem externa e toda referência para fora, sem o servidor buscar nada', async () => {
    const limpo = await texto(
      svg(
        `<image href="${externo}/foto.png" width="10" height="10"/>` +
          '<image xlink:href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/>' +
          `<use xlink:href="${externo}/simbolos.svg#a"/>` +
          `<style>@import url(${externo}/estilo.css); .b{fill:red}</style>` +
          `<rect width="100" height="50" fill="url(${externo}/g.svg#g)" style="stroke:url('${externo}/s.svg#s')"/>`,
      ),
    );
    expect(pedidos).toBe(0);
    expect(limpo).not.toContain('127.0.0.1');
    expect(limpo).not.toContain('data:');
    expect(limpo).not.toContain('@import');
    expect(limpo).toContain('<rect width="100" height="50" fill="none" style="stroke:none"/>');
  });

  it('perde o foreignObject, com o HTML de dentro', async () => {
    const limpo = await texto(
      svg(
        '<foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml">' +
          '<a href="https://exemplo.com">Clique</a></div></foreignObject><circle r="10"/>',
      ),
    );
    expect(limpo).not.toMatch(/foreignObject|Clique|exemplo/);
    expect(limpo).toContain('<circle r="10"/>');
  });

  it('perde o elemento desconhecido inteiro, sem soltar o desenho que o navegador não mostraria', async () => {
    const limpo = await texto(
      svg(
        '<desconhecido><rect width="100" height="50" fill="#f00"/></desconhecido>' +
          '<inkscape:camada xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">' +
          '<rect width="10" height="10"/></inkscape:camada><circle r="10"/>',
      ),
    );
    expect(limpo).not.toMatch(/desconhecido|inkscape|<rect/);
    expect(limpo).toContain('<circle r="10"/>');
  });

  it('sem desenho depois da sanitização, é recusado como um arquivo que não se consegue ler', async () => {
    expect(
      await recusa(svg('<script>alert(1)</script><foreignObject><p>Oi</p></foreignObject>')),
    ).toEqual(ILEGIVEL);
    expect(await recusa(svg('<defs><rect width="10" height="10"/></defs>'))).toEqual(ILEGIVEL);
    expect(await recusa(svg(`<image href="${externo}/foto.png"/>`))).toEqual(ILEGIVEL);
  });

  it('mal formado, é recusado como um arquivo que não se consegue ler', async () => {
    expect(
      await recusa(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>')),
    ).toEqual(ILEGIVEL);
  });

  it('que declara mais de 50 megapixels é recusado como grande demais', async () => {
    expect(
      await recusa(svg('<rect width="10" height="10"/>', 'width="20000" height="20000"')),
    ).toEqual({
      status: 400,
      detalhe: 'A imagem é grande demais. Envie uma de até 50 megapixels.',
    });
  });

  it('ganha as miniaturas desenhadas a partir do SVG sanitizado', async () => {
    const { variantes } = await tratarImagem(
      svg('<rect width="1000" height="500" fill="#f00"/>', 'width="1000" height="500"'),
    );
    for (const [lado, largura, altura] of [
      ['512', 512, 256],
      ['256', 256, 128],
      ['128', 128, 64],
      ['64', 64, 32],
    ] as const) {
      const miniatura = variantes[lado];
      expect(await sharp(miniatura).metadata()).toMatchObject({
        format: 'webp',
        width: largura,
        height: altura,
      });
      const [vermelho, verde, azul] = await corNoMeio(miniatura);
      expect(vermelho).toBeGreaterThan(200);
      expect(verde).toBeLessThan(40);
      expect(azul).toBeLessThan(40);
    }
  });

  it('pequeno, não é ampliado nas miniaturas', async () => {
    const { variantes } = await tratarImagem(
      svg('<rect width="100" height="100"/>', 'width="100" height="100"'),
    );
    expect(await sharp(variantes['512']).metadata()).toMatchObject({ width: 100, height: 100 });
    expect(await sharp(variantes['64']).metadata()).toMatchObject({ width: 64, height: 64 });
  });
});
