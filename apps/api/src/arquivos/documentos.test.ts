// A conferência dos documentos dos campos de arquivo (spec arquivos-e-imagens, "Arquivos aceitos";
// design do P1d, decisão 5): o tipo pelo conteúdo, e nunca pelo nome; as recusas; e o nome guardado,
// sem o caminho e com a extensão do tipo conferido. Os arquivos são montados no próprio teste.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  cfb,
  doc,
  docx,
  odp,
  ods,
  odt,
  pacoteOdf,
  ppt,
  pptx,
  xls,
  xlsx,
  zip,
} from '../../test/documentos.ts';
import { imagemDeTeste } from '../../test/imagens.ts';
import type { ProblemaDaApi } from '../problemas.ts';
import { conferirDocumento, LIMITE_DO_DOCUMENTO, nomeDoArquivo } from './documentos.ts';

/** A recusa da conferência, com o status e a mensagem. */
function recusa(conteudo: Buffer, nome = 'arquivo') {
  try {
    conferirDocumento(conteudo, nome);
  } catch (erro) {
    const { status, detalhe } = (erro as ProblemaDaApi).dados;
    return { status, detalhe };
  }
  throw new Error('A conferência aceitou o arquivo.');
}

const NAO_ACEITO = {
  status: 415,
  detalhe:
    'Formato não aceito. Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.',
};

const imagens: Record<string, Buffer> = {};

beforeAll(async () => {
  const imagem = () => imagemDeTeste(16, 16);
  imagens.png = await imagem().png().toBuffer();
  imagens.jpeg = await imagem().jpeg().toBuffer();
  imagens.webp = await imagem().webp().toBuffer();
  imagens.avif = await imagem().avif().toBuffer();
});

/** Windows-1252: "Manutenção – R$ 80,00", com o travessão no 0x96. */
const textoEm1252 = Buffer.concat([
  Buffer.from('Manuten', 'latin1'),
  Buffer.from([0xe7, 0xe3]),
  Buffer.from('o ', 'latin1'),
  Buffer.from([0x96]),
  Buffer.from(' R$ 80,00\r\n', 'latin1'),
]);

describe('conferirDocumento', () => {
  it('reconhece o PDF e as imagens pela assinatura', () => {
    expect(conferirDocumento(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n'), 'nota.pdf')).toEqual({
      tipo: 'application/pdf',
      extensao: '.pdf',
    });
    expect(conferirDocumento(imagens.png ?? Buffer.alloc(0), 'a')).toEqual({
      tipo: 'image/png',
      extensao: '.png',
    });
    expect(conferirDocumento(imagens.jpeg ?? Buffer.alloc(0), 'a')).toEqual({
      tipo: 'image/jpeg',
      extensao: '.jpg',
    });
    expect(conferirDocumento(imagens.webp ?? Buffer.alloc(0), 'a')).toEqual({
      tipo: 'image/webp',
      extensao: '.webp',
    });
    expect(conferirDocumento(imagens.avif ?? Buffer.alloc(0), 'a')).toEqual({
      tipo: 'image/avif',
      extensao: '.avif',
    });
  });

  it('reconhece os pacotes do Office pelas pastas e os do LibreOffice pelo mimetype', () => {
    const tipos = [docx(), xlsx(), pptx(), odt(), ods(), odp()].map((conteudo) =>
      conferirDocumento(conteudo, 'documento'),
    );
    expect(tipos).toEqual([
      {
        tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extensao: '.docx',
      },
      {
        tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extensao: '.xlsx',
      },
      {
        tipo: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extensao: '.pptx',
      },
      { tipo: 'application/vnd.oasis.opendocument.text', extensao: '.odt' },
      { tipo: 'application/vnd.oasis.opendocument.spreadsheet', extensao: '.ods' },
      { tipo: 'application/vnd.oasis.opendocument.presentation', extensao: '.odp' },
    ]);
  });

  it('reconhece os formatos antigos do Office pelos fluxos da raiz do CFB', () => {
    expect(conferirDocumento(doc(), 'laudo.doc')).toEqual({
      tipo: 'application/msword',
      extensao: '.doc',
    });
    expect(conferirDocumento(xls(), 'inventario.xls')).toEqual({
      tipo: 'application/vnd.ms-excel',
      extensao: '.xls',
    });
    // O Excel 5 chama o fluxo da pasta de "Book".
    expect(conferirDocumento(cfb(['Book']), 'antigo.xls').extensao).toBe('.xls');
    expect(conferirDocumento(ppt(), 'apresentacao.ppt')).toEqual({
      tipo: 'application/vnd.ms-powerpoint',
      extensao: '.ppt',
    });
    // Uma planilha embutida num documento fica num armazenamento, e não muda o tipo.
    const comPlanilha = cfb([
      'WordDocument',
      { armazenamento: 'ObjectPool', fluxos: ['Workbook'] },
    ]);
    expect(conferirDocumento(comPlanilha, 'laudo.doc').extensao).toBe('.doc');
  });

  it('o ZIP é aceito sem abrir o conteúdo, e o pacote de outro tipo é ZIP', () => {
    const fotos = zip([
      { nome: 'fotos/frente.jpg', conteudo: 'x' },
      { nome: 'fotos/verso.jpg', conteudo: 'y' },
    ]);
    expect(conferirDocumento(fotos, 'fotos.zip')).toEqual({
      tipo: 'application/zip',
      extensao: '.zip',
    });
    expect(
      conferirDocumento(pacoteOdf('application/vnd.oasis.opendocument.graphics'), 'a').extensao,
    ).toBe('.zip');
    // O ZIP com um programa dentro também: ele é entregue só para baixar.
    expect(conferirDocumento(zip([{ nome: 'setup.exe', conteudo: 'MZ' }]), 'a').extensao).toBe(
      '.zip',
    );
  });

  it('o texto em UTF-8 ou em Windows-1252 é texto, e o CSV vem do nome', () => {
    const utf8 = Buffer.from('\ufeffPatrimônio;Local\r\nPAT-00412;Expedição\r\n', 'utf8');
    expect(conferirDocumento(utf8, 'inventario.csv')).toEqual({
      tipo: 'text/csv',
      extensao: '.csv',
    });
    expect(conferirDocumento(textoEm1252, 'INVENTARIO.CSV')).toEqual({
      tipo: 'text/csv',
      extensao: '.csv',
    });
    expect(conferirDocumento(textoEm1252, 'manutencao.txt')).toEqual({
      tipo: 'text/plain',
      extensao: '.txt',
    });
    expect(conferirDocumento(Buffer.from('Remove-Item -Recurse .\\temp\n'), 'limpeza.ps1')).toEqual(
      { tipo: 'text/plain', extensao: '.txt' },
    );
  });

  it('recusa o programa, mesmo com o nome de um PDF, e o binário que não é de um formato aceito', () => {
    const programa = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62), Buffer.from('PE\0\0')]);
    expect(recusa(programa, 'nota.pdf')).toEqual(NAO_ACEITO);
    expect(recusa(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]))).toEqual(NAO_ACEITO);
    expect(recusa(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00', 'latin1'))).toEqual(NAO_ACEITO);
    // O texto em Windows-1252 não tem os caracteres de controle nem os códigos que ele não define.
    expect(recusa(Buffer.from([0x41, 0x1b, 0x81, 0x42]))).toEqual(NAO_ACEITO);
  });

  it('recusa o CFB que não é do Office, como um instalador, e o que não se lê', () => {
    const instalador = cfb(['\u0005SummaryInformation', '䡀㬿䅤䈯䠶', '䡀㼿䕷䑬㭪䗤䠤']);
    expect(recusa(instalador, 'setup.msi')).toEqual(NAO_ACEITO);
    // O nome do fluxo do Word só vale na raiz.
    expect(recusa(cfb([{ armazenamento: 'Objeto', fluxos: ['WordDocument'] }]))).toEqual(
      NAO_ACEITO,
    );
    expect(recusa(doc().subarray(0, 600), 'cortado.doc')).toEqual(NAO_ACEITO);
  });

  it('recusa o ZIP sem o diretório central', () => {
    const cortado = docx().subarray(0, 200);
    expect(recusa(cortado, 'cortado.docx')).toEqual(NAO_ACEITO);
  });

  it('recusa o arquivo vazio e o que passa de 25 MB', () => {
    expect(recusa(Buffer.alloc(0), 'vazio.pdf')).toEqual({
      status: 400,
      detalhe: 'O arquivo está vazio.',
    });
    expect(recusa(Buffer.alloc(LIMITE_DO_DOCUMENTO + 1, 0x61), 'grande.txt')).toEqual({
      status: 413,
      detalhe: 'O arquivo passa de 25 MB.',
    });
    expect(conferirDocumento(Buffer.alloc(LIMITE_DO_DOCUMENTO, 0x61), 'no-limite.txt').tipo).toBe(
      'text/plain',
    );
  });
});

describe('nomeDoArquivo', () => {
  it('guarda o nome com a extensão do tipo conferido', () => {
    expect(nomeDoArquivo('nota-fiscal-1234.pdf', '.pdf')).toBe('nota-fiscal-1234.pdf');
    expect(nomeDoArquivo('Nota Fiscal.PDF', '.pdf')).toBe('Nota Fiscal.PDF');
    expect(nomeDoArquivo('limpeza.ps1', '.txt')).toBe('limpeza.ps1.txt');
    expect(nomeDoArquivo('nota', '.pdf')).toBe('nota.pdf');
    expect(nomeDoArquivo('foto.jpeg', '.jpg')).toBe('foto.jpeg');
    expect(nomeDoArquivo('foto.png', '.jpg')).toBe('foto.png.jpg');
  });

  it('tira o caminho e os caracteres de controle, e não fica sem nome', () => {
    expect(nomeDoArquivo('C:\\Users\\ana\\Desktop\\laudo.docx', '.docx')).toBe('laudo.docx');
    expect(nomeDoArquivo('../../etc/passwd', '.txt')).toBe('passwd.txt');
    expect(nomeDoArquivo('nota\u0000\u0007\u202efdp.exe', '.pdf')).toBe('notafdp.exe.pdf');
    expect(nomeDoArquivo('   ', '.pdf')).toBe('arquivo.pdf');
    expect(nomeDoArquivo('.pdf', '.pdf')).toBe('arquivo.pdf');
    expect(nomeDoArquivo('pasta/', '.zip')).toBe('arquivo.zip');
  });

  it('corta em 200 caracteres, sem perder a extensão nem partir um caractere', () => {
    const longo = nomeDoArquivo(`${'a'.repeat(300)}.pdf`, '.pdf');
    expect(longo).toHaveLength(200);
    expect(longo.endsWith('a.pdf')).toBe(true);
    const comEmoji = nomeDoArquivo(`${'😀'.repeat(250)}.txt`, '.txt');
    expect([...comEmoji]).toHaveLength(200);
    expect(comEmoji.endsWith('😀.txt')).toBe(true);
  });
});
