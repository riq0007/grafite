// Os anexos colados (spec modulo-chat, "Caixa de escrever do chat", "Colar um print" e "Colar de
// uma planilha"; change chat-com-chamados, design, decisão 15, "colar e soltar", tarefa 4.19): o
// nome da imagem colada, no fuso da conta, e o que a colagem anexa.
import { describe, expect, it } from 'vitest';
import { arquivosColados, type Colado, nomeDaImagemColada } from './colar.ts';

/** O que se colou: o texto, por tipo, e os arquivos. */
const colado = (arquivos: File[], textos: Record<string, string> = {}): Colado => ({
  files: arquivos as unknown as FileList,
  getData: (tipo: string) => textos[tipo] ?? '',
});

/** 22/11/2026, 14:05:33 em São Paulo. */
const AS_14_05_33 = new Date('2026-11-22T17:05:33.000Z');

const print = () => new File([new Uint8Array(1200)], 'image.png', { type: 'image/png' });

describe('o nome da imagem colada', () => {
  it('tem a data e a hora, com pontos, no fuso da conta', () => {
    expect(nomeDaImagemColada(AS_14_05_33, 'America/Sao_Paulo', 'png')).toBe(
      'Imagem colada 22-11-2026 14.05.33.png',
    );
    expect(nomeDaImagemColada(AS_14_05_33, 'America/Manaus', 'png')).toBe(
      'Imagem colada 22-11-2026 13.05.33.png',
    );
  });

  it('vira o dia no fuso, e a meia-noite é 00', () => {
    const virada = new Date('2026-11-23T03:00:07.000Z');
    expect(nomeDaImagemColada(virada, 'America/Sao_Paulo', 'png')).toBe(
      'Imagem colada 23-11-2026 00.00.07.png',
    );
    expect(nomeDaImagemColada(virada, 'America/Manaus', 'jpg')).toBe(
      'Imagem colada 22-11-2026 23.00.07.jpg',
    );
  });
});

describe('o que a colagem anexa', () => {
  it('o print, sem o texto, com o nome de quando foi colado', () => {
    const colados = arquivosColados(colado([print()]), AS_14_05_33, 'America/Sao_Paulo');
    expect(colados?.map(({ name, type, size }) => ({ name, type, size }))).toEqual([
      { name: 'Imagem colada 22-11-2026 14.05.33.png', type: 'image/png', size: 1200 },
    ]);
  });

  it('a célula da planilha, que vai com a imagem dela, cola o texto, sem anexo', () => {
    const celula = colado([print()], {
      'text/plain': 'R$ 1.234,56',
      'text/html': '<td>R$ 1.234,56</td>',
    });
    expect(arquivosColados(celula, AS_14_05_33, 'America/Sao_Paulo')).toBeNull();
  });

  it('o texto sozinho cola o texto', () => {
    const texto = colado([], { 'text/plain': 'A impressora parou de novo.' });
    expect(arquivosColados(texto, AS_14_05_33, 'America/Sao_Paulo')).toBeNull();
  });

  it('a imagem copiada de uma página, só com o HTML junto, anexa a imagem', () => {
    const daPagina = colado([print()], { 'text/html': '<img src="https://exemplo.test/a.png">' });
    expect(
      arquivosColados(daPagina, AS_14_05_33, 'America/Sao_Paulo')?.map(({ name }) => name),
    ).toEqual(['Imagem colada 22-11-2026 14.05.33.png']);
  });

  it('o texto só de espaços não conta: a imagem entra', () => {
    const comEspacos = colado([print()], { 'text/plain': ' \r\n' });
    expect(arquivosColados(comEspacos, AS_14_05_33, 'America/Sao_Paulo')).toHaveLength(1);
  });

  it('os arquivos copiados das pastas entram com o nome deles, na ordem', () => {
    const relatorio = new File(['%PDF'], 'relatorio.pdf', { type: 'application/pdf' });
    const foto = new File(['x'], 'foto-da-impressora.jpg', { type: 'image/jpeg' });
    const colados = arquivosColados(colado([relatorio, foto]), AS_14_05_33, 'America/Sao_Paulo');
    expect(colados).toEqual([relatorio, foto]);
  });

  it('o arquivo copiado de uma pasta, com o nome dele como texto, entra como anexo', () => {
    // O Finder e os gerenciadores de arquivos do Linux põem o nome, ou o caminho, como texto.
    const relatorio = new File(['%PDF'], 'relatorio.pdf', { type: 'application/pdf' });
    const doFinder = colado([relatorio], { 'text/plain': 'relatorio.pdf' });
    expect(arquivosColados(doFinder, AS_14_05_33, 'America/Sao_Paulo')).toEqual([relatorio]);
    const foto = new File(['x'], 'foto-da-impressora.jpg', { type: 'image/jpeg' });
    const comAImagem = colado([print(), foto], {
      'text/plain': '/home/ana/foto-da-impressora.jpg',
    });
    expect(
      arquivosColados(comAImagem, AS_14_05_33, 'America/Sao_Paulo')?.map(({ name }) => name),
    ).toEqual(['Imagem colada 22-11-2026 14.05.33.png', 'foto-da-impressora.jpg']);
  });

  it('só a imagem que o navegador nomeia ganha o nome novo, com a extensão dela', () => {
    const jpg = new File(['x'], 'image.jpg', { type: 'image/jpeg' });
    const pdf = new File(['%PDF'], 'image.pdf', { type: 'application/pdf' });
    const colados = arquivosColados(colado([jpg, pdf]), AS_14_05_33, 'America/Sao_Paulo');
    expect(colados?.map(({ name }) => name)).toEqual([
      'Imagem colada 22-11-2026 14.05.33.jpg',
      'image.pdf',
    ]);
  });

  it('sem arquivo e sem texto, nada a anexar', () => {
    expect(arquivosColados(colado([]), AS_14_05_33, 'America/Sao_Paulo')).toBeNull();
  });
});
