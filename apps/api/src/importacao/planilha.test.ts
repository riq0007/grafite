// A leitura da planilha da importação (spec importacao-de-ativos, "Planilha da importação"; design do
// P1e, decisão 2): o XLSX pela primeira aba e o CSV pelo texto, conferidos pelo conteúdo, com os
// títulos na primeira linha, o número de cada linha como na planilha e os limites. As planilhas são
// montadas no próprio teste.
import { describe, expect, it } from 'vitest';
import { docx, zip } from '../../test/documentos.ts';
import {
  compartilhado,
  csvDoExcel,
  linha,
  numero,
  planilhaXlsx,
  textoNaCelula,
  xlsxDeTabela,
} from '../../test/planilhas.ts';
import type { ProblemaDaApi } from '../problemas.ts';
import { LIMITE_DA_PLANILHA, lerPlanilha } from './planilha.ts';

/** A recusa da leitura, com o status e a mensagem. */
function recusa(conteudo: Buffer, opcoes?: Parameters<typeof lerPlanilha>[1]) {
  try {
    lerPlanilha(conteudo, opcoes);
  } catch (erro) {
    const { status, detalhe } = (erro as ProblemaDaApi).dados;
    return { status, detalhe };
  }
  throw new Error('A leitura aceitou a planilha.');
}

const NAO_ACEITO = { status: 415, detalhe: 'Formato não aceito. Envie a planilha em XLSX ou CSV.' };
const SEM_LINHAS = { status: 400, detalhe: 'A planilha não tem linhas para importar.' };

describe('XLSX', () => {
  it('lê a primeira aba, com os textos compartilhados, os números e os números das linhas', () => {
    const conteudo = planilhaXlsx({
      abas: [
        {
          nome: 'Computadores',
          dados: [
            linha(1, compartilhado('A1', 0), compartilhado('B1', 1), compartilhado('C1', 2)),
            linha(2, compartilhado('A2', 3), numero('B2', 1.024), numero('C2', 45567)),
            // A linha 3 não existe no XML: o Excel pula a vazia.
            linha(4, compartilhado('A4', 4), numero('C4', '1e3')),
          ].join(''),
        },
        { nome: 'Outra', dados: linha(1, numero('A1', 99)) },
      ],
      compartilhados: [
        '<si><t>Patrimônio</t></si>',
        '<si><t>Memória (GB)</t></si>',
        '<si><t>Data de compra</t></si>',
        '<si><t>PAT-00412</t></si>',
        '<si><t xml:space="preserve">  PAT-00413 </t></si>',
      ],
    });
    expect(lerPlanilha(conteudo)).toEqual({
      titulos: ['Patrimônio', 'Memória (GB)', 'Data de compra'],
      linhas: [
        { linha: 2, celulas: ['PAT-00412', 1.024, 45567] },
        { linha: 4, celulas: ['PAT-00413', null, 1000] },
      ],
    });
  });

  it('a primeira aba é a primeira do livro, e não a do primeiro arquivo, e pula a oculta', () => {
    const conteudo = planilhaXlsx({
      abas: [
        { nome: 'Ajuda', dados: linha(1, textoNaCelula('A1', 'Leia-me')), oculta: true },
        {
          nome: 'Ativos',
          dados:
            linha(1, textoNaCelula('A1', 'Hostname')) + linha(2, textoNaCelula('A2', 'IMP-01')),
        },
        { nome: 'Outra', dados: linha(1, textoNaCelula('A1', 'Série')) },
      ],
      arquivos: ['sheet3.xml', 'sheet1.xml', 'sheet2.xml'],
      caminhoAbsoluto: true,
    });
    expect(lerPlanilha(conteudo)).toEqual({
      titulos: ['Hostname'],
      linhas: [{ linha: 2, celulas: ['IMP-01'] }],
    });
  });

  it('lê o texto com formatação, sem o fonético, as entidades e o escape do OOXML', () => {
    const conteudo = planilhaXlsx({
      abas: [
        {
          nome: 'Planilha1',
          dados:
            linha(1, compartilhado('A1', 0), compartilhado('B1', 1)) +
            linha(
              2,
              compartilhado('A2', 2),
              textoNaCelula('B2', 'Linha 1_x000D_\nLinha 2 &amp; &#233;'),
            ),
        },
      ],
      compartilhados: [
        '<si><t>Nome</t></si>',
        '<si><t>Observação</t></si>',
        '<si><r><rPr><b/></rPr><t>Impressora</t></r><r><t xml:space="preserve"> do &lt;RH&gt;</t></r><rPh sb="0" eb="1"><t>インサツ</t></rPh></si>',
      ],
    });
    expect(lerPlanilha(conteudo).linhas).toEqual([
      { linha: 2, celulas: ['Impressora do <RH>', 'Linha 1\r\nLinha 2 & é'] },
    ]);
  });

  it('lê o texto de fórmula, o booleano, o erro e a célula sem valor', () => {
    const conteudo = planilhaXlsx({
      abas: [
        {
          nome: 'Planilha1',
          dados:
            linha(
              1,
              textoNaCelula('A1', 'A'),
              textoNaCelula('B1', 'B'),
              textoNaCelula('C1', 'C'),
              textoNaCelula('D1', 'D'),
              textoNaCelula('E1', 'E'),
            ) +
            linha(
              2,
              '<c r="A2" t="str"><f>CONCAT("IMP-";"01")</f><v>IMP-01</v></c>',
              '<c r="B2" t="b"><v>1</v></c>',
              '<c r="C2" t="b"><v>0</v></c>',
              '<c r="D2" t="e"><v>#N/D</v></c>',
              '<c r="E2" s="3"/>',
            ),
        },
      ],
    });
    expect(lerPlanilha(conteudo).linhas).toEqual([
      { linha: 2, celulas: ['IMP-01', 'VERDADEIRO', 'FALSO', '#N/D', null] },
    ]);
  });

  it('recusa a planilha que descompacta além do limite', () => {
    const grande = Array.from({ length: 200 }, (_, i) =>
      linha(i + 1, textoNaCelula(`A${i + 1}`, `Valor ${i} ${'x'.repeat(50)}`)),
    ).join('');
    const conteudo = planilhaXlsx({ abas: [{ nome: 'Planilha1', dados: grande }] });
    expect(recusa(conteudo, { limiteDescompactado: 4096 })).toEqual({
      status: 400,
      detalhe: 'A planilha é grande demais para importar. Divida-a em partes menores.',
    });
  });

  it('recusa o pacote do Office que não é planilha e o ZIP comum', () => {
    expect(recusa(docx())).toEqual(NAO_ACEITO);
    expect(recusa(zip([{ nome: 'leia-me.txt', conteudo: 'oi' }]))).toEqual(NAO_ACEITO);
  });
});

describe('CSV', () => {
  it('lê o CSV do Excel em português: ponto e vírgula, CRLF e Windows-1252', () => {
    const conteudo = csvDoExcel([
      ['Patrimônio', 'Localização'],
      ['PAT-00412', 'Jundiaí › Expedição'.replace('›', '>')],
    ]);
    expect(lerPlanilha(conteudo)).toEqual({
      titulos: ['Patrimônio', 'Localização'],
      linhas: [{ linha: 2, celulas: ['PAT-00412', 'Jundiaí > Expedição'] }],
    });
  });

  it('lê o UTF-8 com o BOM, as aspas com o separador, a quebra de linha e as aspas dobradas', () => {
    const texto = '﻿Nome;Observação\n"Impressora; do RH";"Linha 1\nLinha 2 com ""aspas"""\n';
    expect(lerPlanilha(Buffer.from(texto, 'utf8'))).toEqual({
      titulos: ['Nome', 'Observação'],
      linhas: [{ linha: 2, celulas: ['Impressora; do RH', 'Linha 1\nLinha 2 com "aspas"'] }],
    });
  });

  it('acha o separador na linha dos títulos: vírgula e tabulação', () => {
    expect(lerPlanilha(Buffer.from('Série,Hostname\nBRJ1,IMP-01\n')).linhas).toEqual([
      { linha: 2, celulas: ['BRJ1', 'IMP-01'] },
    ]);
    expect(lerPlanilha(Buffer.from('Série\tHostname\r\nBRJ1\tIMP-01')).linhas).toEqual([
      { linha: 2, celulas: ['BRJ1', 'IMP-01'] },
    ]);
  });

  it('o número de cada linha conta o registro, mesmo com a quebra dentro das aspas', () => {
    const texto = 'Nome;Obs\n"A";"1\n2"\n\nB;3\n';
    expect(lerPlanilha(Buffer.from(texto)).linhas).toEqual([
      { linha: 2, celulas: ['A', '1\n2'] },
      { linha: 4, celulas: ['B', '3'] },
    ]);
  });

  it('recusa o PDF, mesmo só com texto, e o binário', () => {
    expect(recusa(Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'))).toEqual(NAO_ACEITO);
    expect(recusa(Buffer.from([0x00, 0x01, 0x02, 0xff]))).toEqual(NAO_ACEITO);
  });
});

describe('títulos, linhas e limites', () => {
  it('o título vazio vira "Coluna" e a letra, e a coluna sem título com valor também entra', () => {
    const conteudo = xlsxDeTabela([
      ['Patrimônio', null, 'Local'],
      ['PAT-1', 'x', 'Jundiaí', 'sobra'],
    ]);
    expect(lerPlanilha(conteudo)).toEqual({
      titulos: ['Patrimônio', 'Coluna B', 'Local', 'Coluna D'],
      linhas: [{ linha: 2, celulas: ['PAT-1', 'x', 'Jundiaí', 'sobra'] }],
    });
  });

  it('pula as linhas inteiramente vazias e as de antes dos títulos', () => {
    const texto = ';;\nPatrimônio;Local\n;\nPAT-1;Jundiaí\n ; \n';
    expect(lerPlanilha(Buffer.from(texto))).toEqual({
      titulos: ['Patrimônio', 'Local'],
      linhas: [{ linha: 4, celulas: ['PAT-1', 'Jundiaí'] }],
    });
  });

  it('recusa a planilha sem linhas de dados, e o arquivo vazio', () => {
    expect(recusa(Buffer.from('Patrimônio;Local\n'))).toEqual(SEM_LINHAS);
    expect(recusa(Buffer.alloc(0))).toEqual(SEM_LINHAS);
    expect(recusa(xlsxDeTabela([['Patrimônio']]))).toEqual(SEM_LINHAS);
  });

  it('recusa mais de 5.000 linhas e mais de 200 colunas', () => {
    const linhas = ['Patrimônio', ...Array.from({ length: 5001 }, (_, i) => `PAT-${i}`)].join('\n');
    expect(recusa(Buffer.from(linhas))).toEqual({
      status: 400,
      detalhe: 'A planilha passa de 5.000 linhas. Divida-a em partes menores.',
    });
    const colunas = Array.from({ length: 201 }, (_, i) => `C${i}`).join(';');
    expect(recusa(Buffer.from(`${colunas}\n${colunas}`))).toEqual({
      status: 400,
      detalhe: 'A planilha passa de 200 colunas.',
    });
  });

  it('recusa a planilha de mais de 10 MB', () => {
    expect(recusa(Buffer.alloc(LIMITE_DA_PLANILHA + 1, 0x41))).toEqual({
      status: 413,
      detalhe: 'A planilha passa de 10 MB.',
    });
  });
});
