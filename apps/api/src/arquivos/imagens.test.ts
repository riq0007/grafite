// O tratamento das imagens (spec arquivos-e-imagens; design do F2c, decisão 7): o tipo pelo
// conteúdo, os limites, a regravação sem metadados, de pé e com no máximo 2048 px, e as miniaturas.
// As imagens são geradas no próprio teste.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { heicDeTeste, imagemDeTeste, pngQueDeclara, temLocalizacao } from '../../test/imagens.ts';
import type { ProblemaDaApi } from '../problemas.ts';
import { limitarA, tratarImagem } from './imagens.ts';

const dimensoes = async (imagem: Buffer) => {
  const { width, height, format } = await sharp(imagem).metadata();
  return { formato: format, largura: width, altura: height };
};

/** O brilho médio de uma faixa de 50 px de largura, de cima a baixo, pelo primeiro canal. */
async function brilhoDaFaixa(imagem: Buffer, esquerda: number) {
  const { height = 0 } = await sharp(imagem).metadata();
  const { data, info } = await sharp(imagem)
    .extract({ left: esquerda, top: 0, width: 50, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let soma = 0;
  for (let i = 0; i < data.length; i += info.channels) soma += data[i] ?? 0;
  return soma / (data.length / info.channels);
}

/** A recusa do tratamento, com o status e a mensagem. */
async function recusa(conteudo: Buffer) {
  const erro = (await tratarImagem(conteudo).catch((e: unknown) => e)) as ProblemaDaApi;
  return { status: erro.dados?.status, detalhe: erro.dados?.detalhe };
}

const FORMATO_NAO_ACEITO = {
  status: 415,
  detalhe: 'Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.',
};
const ILEGIVEL = {
  status: 400,
  detalhe: 'Não foi possível ler a imagem. O arquivo pode estar corrompido.',
};

describe('tratarImagem', () => {
  it('reconhece o PNG pelo conteúdo, como o enviado com o nome de JPG', async () => {
    const tratada = await tratarImagem(await imagemDeTeste(40, 30).png().toBuffer());
    expect(tratada).toMatchObject({ origem: 'png', tipo: 'image/webp', largura: 40, altura: 30 });
    expect(await dimensoes(tratada.variantes.completa)).toEqual({
      formato: 'webp',
      largura: 40,
      altura: 30,
    });
  });

  it.each([
    ['o JPG', () => imagemDeTeste(40, 30).jpeg().toBuffer(), 'jpeg'],
    ['o WebP', () => imagemDeTeste(40, 30).webp().toBuffer(), 'webp'],
    ['o AVIF', () => imagemDeTeste(40, 30).avif().toBuffer(), 'avif'],
  ])('aceita %s', async (_nome, gerar, origem) => {
    expect(await tratarImagem(await gerar())).toMatchObject({ origem, tipo: 'image/webp' });
  });

  it('recusa o executável com nome de imagem, com 415', async () => {
    const executavel = Buffer.concat([
      Buffer.from('\x7fELF\x02\x01\x01\0', 'latin1'),
      Buffer.alloc(512),
    ]);
    expect(await recusa(executavel)).toEqual(FORMATO_NAO_ACEITO);
  });

  it.each([
    ['o GIF', () => imagemDeTeste(20, 20).gif().toBuffer()],
    ['o TIFF', () => imagemDeTeste(20, 20).tiff().toBuffer()],
    ['o HEIC', async () => heicDeTeste(640, 480)],
  ])('recusa %s com 415', async (_nome, gerar) => {
    expect(await recusa(await gerar())).toEqual(FORMATO_NAO_ACEITO);
  });

  it('recusa mais de 10 MB com 413, sem ler a imagem', async () => {
    const png = await imagemDeTeste(10, 10).png().toBuffer();
    const pesada = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024 + 1 - png.length)]);
    expect(await recusa(pesada)).toEqual({ status: 413, detalhe: 'A imagem passa de 10 MB.' });
  });

  it.each([
    [10_000, 5_001],
    [20_000, 20_000],
  ])('recusa %i × %i px pelo cabeçalho, sem decodificar', async (largura, altura) => {
    expect(await recusa(await pngQueDeclara(largura, altura))).toEqual({
      status: 400,
      detalhe: 'A imagem é grande demais. Envie uma de até 50 megapixels.',
    });
  });

  it('recusa o PNG cortado no meio como um arquivo que não se consegue ler', async () => {
    const png = await imagemDeTeste(300, 200).png().toBuffer();
    expect(await recusa(png.subarray(0, Math.floor(png.length / 2)))).toEqual(ILEGIVEL);
  });

  it('recusa o PNG cortado no cabeçalho da mesma forma', async () => {
    const png = await imagemDeTeste(300, 200).png().toBuffer();
    expect(await recusa(png.subarray(0, 40))).toEqual(ILEGIVEL);
  });

  it('a foto com localização e tirada de lado sai sem metadados e de pé', async () => {
    // Guardada deitada (300 × 100, a metade de cima clara), marcada para girar 90° à direita.
    const foto = await imagemDeTeste(300, 100)
      .jpeg()
      .withExif({
        IFD0: { Make: 'Celular', Model: 'X1', Artist: 'Ana Souza' },
        IFD3: {
          GPSLatitudeRef: 'S',
          GPSLatitude: '23/1 33/1 0/1',
          GPSLongitudeRef: 'W',
          GPSLongitude: '46/1 38/1 0/1',
        },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect(temLocalizacao((await sharp(foto).metadata()).exif)).toBe(true);

    const { completa } = (await tratarImagem(foto)).variantes;
    const metadados = await sharp(completa).metadata();
    expect(metadados).toMatchObject({ width: 100, height: 300 });
    expect(metadados.exif).toBeUndefined();
    expect(metadados.xmp).toBeUndefined();
    expect(metadados.icc).toBeUndefined();
    expect(metadados.orientation).toBeUndefined();
    // De pé, a parte clara (o topo de quem fotografou deitado) fica à direita.
    expect(await brilhoDaFaixa(completa, 50)).toBeGreaterThan(
      (await brilhoDaFaixa(completa, 0)) + 100,
    );
  });

  it('reduz a 2048 px no maior lado, sem ampliar a menor', async () => {
    const larga = await tratarImagem(await imagemDeTeste(4096, 1024).png().toBuffer());
    expect(larga).toMatchObject({ largura: 2048, altura: 512 });
    expect(await dimensoes(larga.variantes.completa)).toMatchObject({ largura: 2048, altura: 512 });
    const alta = await tratarImagem(await imagemDeTeste(600, 3000).jpeg().toBuffer());
    expect(alta).toMatchObject({ largura: 410, altura: 2048 });
  });

  it('as miniaturas da imagem larga cabem no quadrado e mantêm a proporção', async () => {
    const { variantes } = await tratarImagem(await imagemDeTeste(1000, 500).png().toBuffer());
    expect(await dimensoes(variantes['512'])).toEqual({
      formato: 'webp',
      largura: 512,
      altura: 256,
    });
    expect(await dimensoes(variantes['256'])).toMatchObject({ largura: 256, altura: 128 });
    expect(await dimensoes(variantes['128'])).toMatchObject({ largura: 128, altura: 64 });
    expect(await dimensoes(variantes['64'])).toMatchObject({ largura: 64, altura: 32 });
  });

  it('as miniaturas da imagem pequena não a ampliam', async () => {
    const { variantes } = await tratarImagem(await imagemDeTeste(100, 100).png().toBuffer());
    for (const lado of ['512', '256', '128'] as const) {
      expect(await dimensoes(variantes[lado])).toMatchObject({ largura: 100, altura: 100 });
    }
    expect(await dimensoes(variantes['64'])).toMatchObject({ largura: 64, altura: 64 });
  });
});

describe('limitarA', () => {
  it('deixa só o número dado de tarefas ao mesmo tempo, e a próxima entra quando uma acaba', async () => {
    const vez = limitarA(2);
    const soltar: (() => void)[] = [];
    let rodando = 0;
    let maximo = 0;
    const tarefa = () =>
      vez(async () => {
        rodando += 1;
        maximo = Math.max(maximo, rodando);
        await new Promise<void>((resolve) => soltar.push(resolve));
        rodando -= 1;
      });
    const tarefas = [tarefa(), tarefa(), tarefa(), tarefa()];
    await new Promise((resolve) => setImmediate(resolve));
    expect(soltar).toHaveLength(2);
    soltar.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(soltar).toHaveLength(2);
    while (soltar.length > 0) {
      soltar.shift()?.();
      await new Promise((resolve) => setImmediate(resolve));
    }
    await Promise.all(tarefas);
    expect(maximo).toBe(2);
  });

  it('a tarefa que falha também libera a vez', async () => {
    const vez = limitarA(1);
    await expect(vez(async () => Promise.reject(new Error('falhou')))).rejects.toThrow('falhou');
    await expect(vez(async () => 'seguiu')).resolves.toBe('seguiu');
  });
});
