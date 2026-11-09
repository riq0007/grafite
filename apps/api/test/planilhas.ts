// As planilhas dos testes da importação, montadas na hora com a estrutura que o Excel, o LibreOffice
// e o Google Planilhas gravam: o pacote com o `[Content_Types].xml`, o `xl/workbook.xml` com as abas,
// as relações, os textos compartilhados e uma aba por arquivo. Nenhum binário fica no repositório.
import { type EntradaDoZip, zip } from './documentos.ts';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export interface AbaDeTeste {
  nome: string;
  /** O XML do `<sheetData>`, como o Excel grava. */
  dados: string;
  oculta?: boolean;
}

export interface PlanilhaDeTeste {
  abas: readonly AbaDeTeste[];
  /** Os `<si>` dos textos compartilhados, na ordem dos índices. */
  compartilhados?: readonly string[];
  /** O arquivo de cada aba, na ordem das abas; sem ele, `sheet1.xml`, `sheet2.xml`... */
  arquivos?: readonly string[];
  /** O caminho nas relações: relativo à pasta `xl/` (o Excel) ou absoluto (outros). */
  caminhoAbsoluto?: boolean;
}

/** Um XLSX com as abas dadas, na ordem em que aparecem no Excel. */
export function planilhaXlsx({
  abas,
  compartilhados,
  arquivos,
  caminhoAbsoluto = false,
}: PlanilhaDeTeste): Buffer {
  const nomes = abas.map((_, i) => arquivos?.[i] ?? `sheet${i + 1}.xml`);
  const entradas: EntradaDoZip[] = [
    {
      nome: '[Content_Types].xml',
      conteudo: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`,
    },
    {
      nome: '_rels/.rels',
      conteudo: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nome: 'xl/workbook.xml',
      conteudo: `${XML}<workbook xmlns="${NS}" xmlns:r="${NS_R}"><bookViews><workbookView/></bookViews><sheets>${abas
        .map(
          (aba, i) =>
            `<sheet name="${aba.nome}" sheetId="${i + 1}"${aba.oculta ? ' state="hidden"' : ''} r:id="rIdAba${i + 1}"/>`,
        )
        .join('')}</sheets></workbook>`,
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      conteudo: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nomes
        .map(
          (nome, i) =>
            `<Relationship Id="rIdAba${i + 1}" Type="${NS_R}/worksheet" Target="${caminhoAbsoluto ? '/xl/' : ''}worksheets/${nome}"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rIdTextos" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    },
    ...abas.map((aba, i) => ({
      nome: `xl/worksheets/${nomes[i]}`,
      conteudo: `${XML}<worksheet xmlns="${NS}" xmlns:r="${NS_R}"><dimension ref="A1"/><sheetData>${aba.dados}</sheetData></worksheet>`,
    })),
  ];
  if (compartilhados) {
    entradas.push({
      nome: 'xl/sharedStrings.xml',
      conteudo: `${XML}<sst xmlns="${NS}" count="${compartilhados.length}" uniqueCount="${compartilhados.length}">${compartilhados.join('')}</sst>`,
    });
  }
  return zip(entradas);
}

/** Uma linha do `<sheetData>`, com as células já em XML. */
export const linha = (numero: number, ...celulas: string[]) =>
  `<row r="${numero}">${celulas.join('')}</row>`;

/** A célula de um texto compartilhado, pelo índice. */
export const compartilhado = (ref: string, indice: number) =>
  `<c r="${ref}" t="s"><v>${indice}</v></c>`;

/** A célula de um número. */
export const numero = (ref: string, valor: number | string) => `<c r="${ref}"><v>${valor}</v></c>`;

/** A célula de um texto na própria célula, como o LibreOffice às vezes grava. */
export const textoNaCelula = (ref: string, texto: string) =>
  `<c r="${ref}" t="inlineStr"><is><t>${texto}</t></is></c>`;

/** O XLSX simples de uma aba, com os textos compartilhados e os números da tabela dada. */
export function xlsxDeTabela(tabela: readonly (readonly (string | number | null)[])[]): Buffer {
  const textos: string[] = [];
  const indice = new Map<string, number>();
  const letra = (posicao: number) => String.fromCharCode(65 + posicao);
  const dados = tabela
    .map((celulas, i) =>
      linha(
        i + 1,
        ...celulas.flatMap((celula, posicao) => {
          const ref = `${letra(posicao)}${i + 1}`;
          if (celula === null) return [];
          if (typeof celula === 'number') return [numero(ref, celula)];
          if (!indice.has(celula)) {
            indice.set(celula, textos.length);
            textos.push(`<si><t xml:space="preserve">${escaparXml(celula)}</t></si>`);
          }
          return [compartilhado(ref, indice.get(celula) ?? 0)];
        }),
      ),
    )
    .join('');
  return planilhaXlsx({ abas: [{ nome: 'Planilha1', dados }], compartilhados: textos });
}

const escaparXml = (texto: string) =>
  texto.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** O CSV como o Excel em português grava: ponto e vírgula, CRLF e Windows-1252. */
export function csvDoExcel(tabela: readonly (readonly string[])[]): Buffer {
  const texto = tabela
    .map((celulas) =>
      celulas
        .map((celula) => (/[;"\r\n]/.test(celula) ? `"${celula.replaceAll('"', '""')}"` : celula))
        .join(';'),
    )
    .join('\r\n');
  return emWindows1252(texto);
}

/** Os bytes de cada caractere no Windows-1252, como o decodificador o lê. */
const DO_WINDOWS_1252 = new Map(
  Array.from({ length: 256 }, (_, byte) => [
    new TextDecoder('windows-1252').decode(Uint8Array.of(byte)),
    byte,
  ]),
);

/** O texto em Windows-1252, como "›", que não existe no Latin-1; outro caractere é erro do teste. */
export function emWindows1252(texto: string): Buffer {
  return Buffer.from(
    [...texto].map((caractere) => {
      const byte = DO_WINDOWS_1252.get(caractere);
      if (byte === undefined) throw new Error(`"${caractere}" não existe no Windows-1252.`);
      return byte;
    }),
  );
}
