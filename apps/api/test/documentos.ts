// Os documentos dos testes, montados na hora com a estrutura que o Office e o LibreOffice gravam:
// nenhum arquivo binário fica no repositório. O ZIP com o diretório central; os pacotes do Office
// com o `[Content_Types].xml` e as pastas `word/`, `xl/` e `ppt/`; os do LibreOffice com o
// `mimetype` primeiro e sem compressão; e o CFB dos formatos antigos do Office, com os fluxos.
import { crc32, deflateRawSync } from 'node:zlib';

export interface EntradaDoZip {
  nome: string;
  conteudo: string | Buffer;
  /** Sem compressão, como o `mimetype` dos pacotes do LibreOffice. */
  guardada?: boolean;
}

/** Um ZIP com as entradas na ordem dada, os nomes em UTF-8 e o diretório central no fim. */
export function zip(entradas: readonly EntradaDoZip[]): Buffer {
  const partes: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  for (const entrada of entradas) {
    const nome = Buffer.from(entrada.nome, 'utf8');
    const dados = Buffer.isBuffer(entrada.conteudo)
      ? entrada.conteudo
      : Buffer.from(entrada.conteudo, 'utf8');
    const metodo = entrada.guardada ? 0 : 8;
    const gravado = entrada.guardada ? dados : deflateRawSync(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc32(dados), 14);
    local.writeUInt32LE(gravado.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc32(dados), 16);
    central.writeUInt32LE(gravado.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    partes.push(local, nome, gravado);
    centrais.push(central, nome);
    deslocamento += local.length + nome.length + gravado.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...partes, diretorio, fim]);
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Um pacote do Office com a parte principal na pasta dada, como o Word, o Excel e o PowerPoint. */
function pacoteDoOffice(principal: string, tipoDaPrincipal: string, outras: EntradaDoZip[]) {
  return zip([
    {
      nome: '[Content_Types].xml',
      conteudo: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${principal}" ContentType="${tipoDaPrincipal}"/></Types>`,
    },
    {
      nome: '_rels/.rels',
      conteudo: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${principal}"/></Relationships>`,
    },
    { nome: principal, conteudo: `${XML}<documento/>` },
    ...outras,
    { nome: 'docProps/core.xml', conteudo: `${XML}<cp:coreProperties/>` },
  ]);
}

export const docx = () =>
  pacoteDoOffice(
    'word/document.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    [{ nome: 'word/styles.xml', conteudo: `${XML}<w:styles/>` }],
  );

export const xlsx = () =>
  pacoteDoOffice(
    'xl/workbook.xml',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    [{ nome: 'xl/worksheets/sheet1.xml', conteudo: `${XML}<worksheet/>` }],
  );

export const pptx = () =>
  pacoteDoOffice(
    'ppt/presentation.xml',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
    [{ nome: 'ppt/slides/slide1.xml', conteudo: `${XML}<p:sld/>` }],
  );

/** Um pacote do LibreOffice: o `mimetype` primeiro, sem compressão, e o manifesto. */
export const pacoteOdf = (mimetype: string) =>
  zip([
    { nome: 'mimetype', conteudo: mimetype, guardada: true },
    { nome: 'content.xml', conteudo: `${XML}<office:document-content/>` },
    { nome: 'styles.xml', conteudo: `${XML}<office:document-styles/>` },
    { nome: 'META-INF/manifest.xml', conteudo: `${XML}<manifest:manifest/>` },
  ]);

export const odt = () => pacoteOdf('application/vnd.oasis.opendocument.text');
export const ods = () => pacoteOdf('application/vnd.oasis.opendocument.spreadsheet');
export const odp = () => pacoteOdf('application/vnd.oasis.opendocument.presentation');

/** Um fluxo na raiz do CFB, ou um armazenamento com os fluxos dele. */
export type ItemDoCfb = string | { armazenamento: string; fluxos: readonly string[] };

const SETOR = 512;
const LIVRE = 0xffffffff;
const FIM_DA_CADEIA = 0xfffffffe;
const SETOR_DA_FAT = 0xfffffffd;
const NENHUM = 0xffffffff;

/**
 * Um CFB de setores de 512 bytes, com os fluxos vazios, como os do Office 97-2003: a FAT no setor 0
 * e o diretório a partir do setor 1. Os irmãos de cada nível ficam encadeados pela direita.
 */
export function cfb(itens: readonly ItemDoCfb[]): Buffer {
  const entradas: { nome: string; tipo: 1 | 2 | 5; filho: number; direita: number }[] = [
    { nome: 'Root Entry', tipo: 5, filho: NENHUM, direita: NENHUM },
  ];
  const nivel = (nomes: readonly ItemDoCfb[]): number => {
    const ids = nomes.map((item) => {
      const id = entradas.length;
      if (typeof item === 'string') {
        entradas.push({ nome: item, tipo: 2, filho: NENHUM, direita: NENHUM });
      } else {
        entradas.push({ nome: item.armazenamento, tipo: 1, filho: NENHUM, direita: NENHUM });
        const filho = nivel(item.fluxos);
        const armazenamento = entradas[id];
        if (armazenamento) armazenamento.filho = filho;
      }
      return id;
    });
    ids.forEach((id, i) => {
      const entrada = entradas[id];
      if (entrada) entrada.direita = ids[i + 1] ?? NENHUM;
    });
    return ids[0] ?? NENHUM;
  };
  const raiz = entradas[0];
  if (raiz) raiz.filho = nivel(itens);

  const setoresDoDiretorio = Math.ceil(entradas.length / 4);
  const cabecalho = Buffer.alloc(SETOR);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(cabecalho, 0);
  cabecalho.writeUInt16LE(0x3e, 24);
  cabecalho.writeUInt16LE(3, 26);
  cabecalho.writeUInt16LE(0xfffe, 28);
  cabecalho.writeUInt16LE(9, 30);
  cabecalho.writeUInt16LE(6, 32);
  cabecalho.writeUInt32LE(1, 44);
  cabecalho.writeUInt32LE(1, 48);
  cabecalho.writeUInt32LE(4096, 56);
  cabecalho.writeUInt32LE(FIM_DA_CADEIA, 60);
  cabecalho.writeUInt32LE(FIM_DA_CADEIA, 68);
  cabecalho.writeUInt32LE(0, 76);
  for (let i = 1; i < 109; i += 1) cabecalho.writeUInt32LE(LIVRE, 76 + i * 4);

  const fat = Buffer.alloc(SETOR, 0xff);
  fat.writeUInt32LE(SETOR_DA_FAT, 0);
  for (let i = 0; i < setoresDoDiretorio; i += 1) {
    fat.writeUInt32LE(i === setoresDoDiretorio - 1 ? FIM_DA_CADEIA : i + 2, (i + 1) * 4);
  }

  const diretorio = Buffer.alloc(setoresDoDiretorio * SETOR);
  for (let i = 0; i < setoresDoDiretorio * 4; i += 1) {
    const base = i * 128;
    const entrada = entradas[i];
    diretorio.writeUInt32LE(NENHUM, base + 68);
    diretorio.writeUInt32LE(entrada?.direita ?? NENHUM, base + 72);
    diretorio.writeUInt32LE(entrada?.filho ?? NENHUM, base + 76);
    if (!entrada) continue;
    const nome = Buffer.from(`${entrada.nome}\0`, 'utf16le');
    nome.copy(diretorio, base);
    diretorio.writeUInt16LE(nome.length, base + 64);
    diretorio.writeUInt8(entrada.tipo, base + 66);
    diretorio.writeUInt8(1, base + 67);
    diretorio.writeUInt32LE(FIM_DA_CADEIA, base + 116);
  }
  return Buffer.concat([cabecalho, fat, diretorio]);
}

export const doc = () => cfb(['1Table', 'WordDocument', '\u0005SummaryInformation']);
export const xls = () => cfb(['Workbook', '\u0005SummaryInformation']);
export const ppt = () => cfb(['Current User', 'PowerPoint Document', 'Pictures']);
