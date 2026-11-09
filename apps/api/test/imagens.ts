// As imagens dos testes, geradas na hora: nenhum arquivo binário fica no repositório.
import { crc32 } from 'node:zlib';
import sharp from 'sharp';

/**
 * Uma imagem com ruído, que não comprime a quase nada: cortar o arquivo corta o desenho. A primeira
 * metade das linhas é mais clara que a segunda, para o teste saber onde fica o topo.
 */
export function imagemDeTeste(largura: number, altura: number) {
  const dados = Buffer.alloc(largura * altura * 3);
  for (let i = 0; i < dados.length; i += 1) {
    const clara = Math.floor(i / 3 / largura) < altura / 2;
    dados[i] = ((i * 7919) % 64) + (clara ? 160 : 16);
  }
  return sharp(dados, { raw: { width: largura, height: altura, channels: 3 } });
}

/** Um PNG pequeno que declara no cabeçalho as dimensões dadas, como uma bomba de descompressão. */
export async function pngQueDeclara(largura: number, altura: number): Promise<Buffer> {
  const png = Buffer.from(await imagemDeTeste(2, 2).png().toBuffer());
  // O IHDR começa no byte 8: tamanho (4), tipo (4), largura (4), altura (4)... e o CRC no fim.
  png.writeUInt32BE(largura, 16);
  png.writeUInt32BE(altura, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
}

const caixa = (tipo: string, ...partes: Buffer[]) => {
  const corpo = Buffer.concat(partes);
  const cabecalho = Buffer.alloc(8);
  cabecalho.writeUInt32BE(8 + corpo.length, 0);
  cabecalho.write(tipo, 4, 'latin1');
  return Buffer.concat([cabecalho, corpo]);
};
const caixaCompleta = (tipo: string, versao: number, ...partes: Buffer[]) =>
  caixa(tipo, Buffer.from([versao, 0, 0, 0]), ...partes);
const u16 = (n: number) => Buffer.from([n >> 8, n & 0xff]);
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

/**
 * Um HEIC mínimo: o contêiner HEIF com uma imagem HEVC das dimensões dadas, que se lê pelo
 * cabeçalho. O desenho não existe, como num HEIC que o servidor não sabe decodificar.
 */
export function heicDeTeste(largura: number, altura: number): Buffer {
  const dados = Buffer.alloc(16);
  // A configuração do HEVC sem os conjuntos de parâmetros: perfil Main, 8 bits, 4:2:0.
  const hvcC = caixa(
    'hvcC',
    Buffer.from([1, 1, 0x60, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 0x5a, 0xf0, 0, 0xfc, 0xfd, 0xf8, 0xf8]),
    Buffer.from([0, 0, 0x0f, 0]),
  );
  const montar = (inicioDosDados: number) => [
    caixa('ftyp', Buffer.from('heic'), u32(0), Buffer.from('mif1heic')),
    caixaCompleta(
      'meta',
      0,
      caixaCompleta('hdlr', 0, u32(0), Buffer.from('pict'), Buffer.alloc(13)),
      caixaCompleta('pitm', 0, u16(1)),
      caixaCompleta(
        'iloc',
        0,
        Buffer.from([0x44, 0]),
        u16(1),
        u16(1),
        u16(0),
        u16(1),
        u32(inicioDosDados),
        u32(dados.length),
      ),
      caixaCompleta(
        'iinf',
        0,
        u16(1),
        caixaCompleta('infe', 2, u16(1), u16(0), Buffer.from('hvc1'), Buffer.from([0])),
      ),
      caixa(
        'iprp',
        caixa('ipco', hvcC, caixaCompleta('ispe', 0, u32(largura), u32(altura))),
        caixaCompleta('ipma', 0, u32(1), u16(1), Buffer.from([2, 0x81, 0x02])),
      ),
    ),
  ];
  const tamanhoDoCabecalho = Buffer.concat(montar(0)).length;
  return Buffer.concat([...montar(tamanhoDoCabecalho + 8), caixa('mdat', dados)]);
}

/** Se o EXIF tem a localização: o ponteiro para o bloco do GPS (0x8825), em qualquer ordem de bytes. */
export function temLocalizacao(exif: Buffer | undefined): boolean {
  if (!exif) return false;
  return exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88]));
}
