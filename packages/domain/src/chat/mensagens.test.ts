import { describe, expect, it } from 'vitest';
import {
  citacoesDeChamados,
  comecoDoTexto,
  conferirMensagem,
  conferirReacao,
  ESPECIES_DO_CHAT,
  REACOES_DE_SEMPRE,
} from './mensagens.ts';

describe('a mensagem', () => {
  it('aceita de 1 a 4.000 caracteres, sem os espaços das pontas', () => {
    expect(conferirMensagem({ texto: '  Você já falou com a TI?\n', anexos: 0 })).toEqual({
      ok: true,
      texto: 'Você já falou com a TI?',
    });
    expect(conferirMensagem({ texto: 'a', anexos: 0 })).toEqual({ ok: true, texto: 'a' });
    expect(conferirMensagem({ texto: 'a'.repeat(4000), anexos: 0 }).ok).toBe(true);
  });

  it('conta em caracteres, e não nas unidades do UTF-16', () => {
    expect(conferirMensagem({ texto: '🖨️'.repeat(2000), anexos: 0 }).ok).toBe(true);
    expect(conferirMensagem({ texto: `${'é'.repeat(4000)}`, anexos: 0 }).ok).toBe(true);
    expect(conferirMensagem({ texto: '😀'.repeat(4001), anexos: 0 })).toEqual({
      ok: false,
      erro: 'Use até 4.000 caracteres.',
    });
  });

  it('recusa a vazia, a longa e a com anexos demais, com as frases da spec', () => {
    expect(conferirMensagem({ texto: '', anexos: 0 })).toEqual({
      ok: false,
      erro: 'Escreva a mensagem.',
    });
    expect(conferirMensagem({ texto: ' \n\t ', anexos: 1 })).toEqual({
      ok: false,
      erro: 'Escreva a mensagem.',
    });
    expect(conferirMensagem({ texto: 'a'.repeat(4001), anexos: 0 })).toEqual({
      ok: false,
      erro: 'Use até 4.000 caracteres.',
    });
    expect(conferirMensagem({ texto: 'Os prints', anexos: 5 }).ok).toBe(true);
    expect(conferirMensagem({ texto: 'Os prints', anexos: 6 })).toEqual({
      ok: false,
      erro: 'Anexe até 5 arquivos.',
    });
  });

  it('as espécies das mensagens do chat, com os textos do banco', () => {
    expect(ESPECIES_DO_CHAT).toEqual(['mensagem', 'evento']);
  });
});

describe('a reação', () => {
  const tres = [...REACOES_DE_SEMPRE];

  it('aceita as três de sempre e a escrita, de 1 a 20 caracteres sem os espaços das pontas', () => {
    expect(tres).toEqual(['+1', 'ok', 'visto']);
    for (const texto of tres) expect(conferirReacao(texto, [])).toEqual({ ok: true, texto });
    expect(conferirReacao('  Também manchou ', [])).toEqual({ ok: true, texto: 'Também manchou' });
    expect(conferirReacao('a'.repeat(20), []).ok).toBe(true);
    expect(conferirReacao('👍'.repeat(20), []).ok).toBe(true);
  });

  it('recusa a vazia e a longa, com as frases da spec', () => {
    expect(conferirReacao('   ', [])).toEqual({ ok: false, erro: 'Escreva a reação.' });
    expect(conferirReacao('a'.repeat(21), [])).toEqual({
      ok: false,
      erro: 'Use até 20 caracteres.',
    });
  });

  it('um texto novo não entra na mensagem com 10 textos diferentes; o que já está nela soma', () => {
    const dez = ['+1', 'ok', 'visto', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(conferirReacao('h', dez)).toEqual({
      ok: false,
      erro: 'A mensagem já tem 10 reações diferentes.',
    });
    expect(conferirReacao('+1', dez)).toEqual({ ok: true, texto: '+1' });
    expect(conferirReacao(' visto ', dez)).toEqual({ ok: true, texto: 'visto' });
  });

  it('o teto conta os textos diferentes, e não as reações de cada conta', () => {
    const repetidos = ['+1', '+1', '+1', 'ok', 'ok', 'visto', 'visto', 'a', 'a', 'b'];
    expect(conferirReacao('Também manchou', repetidos).ok).toBe(true);
  });
});

describe('o começo do texto', () => {
  it('o texto curto fica como está, numa linha só', () => {
    expect(comecoDoTexto('  Passo aí em 10 minutos.\nPode ser?  ')).toBe(
      'Passo aí em 10 minutos. Pode ser?',
    );
    const centoEVinte = 'a'.repeat(120);
    expect(comecoDoTexto(centoEVinte)).toBe(centoEVinte);
  });

  it('o longo é cortado no fim da última palavra que cabe, com as reticências, em até 120', () => {
    const palavras = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(' ');
    const comeco = comecoDoTexto(palavras);
    expect([...comeco].length).toBeLessThanOrEqual(120);
    expect(comeco.endsWith('…')).toBe(true);
    const semReticencias = comeco.slice(0, -1);
    expect(palavras.startsWith(`${semReticencias} `)).toBe(true);
    expect(semReticencias.endsWith(' ')).toBe(false);
  });

  it('o corte que cai num espaço fica com a palavra inteira de antes', () => {
    // A segunda palavra acaba no 119º caractere, e o 120º é o espaço: ela cabe inteira.
    const antes = `${'b'.repeat(50)} ${'c'.repeat(68)}`;
    expect(comecoDoTexto(`${antes} depois`)).toBe(`${antes}…`);
  });

  it('a palavra maior que o começo é cortada no meio', () => {
    expect(comecoDoTexto('x'.repeat(200))).toBe(`${'x'.repeat(119)}…`);
  });

  it('conta em caracteres, e não nas unidades do UTF-16', () => {
    const comeco = comecoDoTexto(`${'é'.repeat(60)} ${'😀'.repeat(80)}`);
    expect(comeco).toBe(`${'é'.repeat(60)}…`);
  });
});

describe('as citações de chamados', () => {
  const trechos = (texto: string) =>
    citacoesDeChamados(texto).map(({ numero, inicio, fim }) => [numero, texto.slice(inicio, fim)]);

  it('Chip na equipe: o "#" seguido do número, separado das outras palavras', () => {
    expect(trechos('a impressora já está no #1045')).toEqual([[1045, '#1045']]);
    expect(trechos('#1045, #1046. (#1047) e #1048!')).toEqual([
      [1045, '#1045'],
      [1046, '#1046'],
      [1047, '#1047'],
      [1048, '#1048'],
    ]);
  });

  it('o "#" colado numa palavra, o número com zero à esquerda e o que não cabe não citam', () => {
    expect(trechos('abc#1045 #1045abc é#1045 ##1045 #01045 #0 #_1 #1234567890')).toEqual([]);
    expect(trechos('sem número # aqui')).toEqual([]);
  });

  it('valem os 10 primeiros números diferentes, cada um em todas as vezes que aparece', () => {
    const doze = Array.from({ length: 12 }, (_, i) => `#${1001 + i}`).join(' ');
    expect(citacoesDeChamados(`${doze} #1001`).map(({ numero }) => numero)).toEqual([
      1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1001,
    ]);
  });

  it('os índices são os do texto, também depois de um emoji', () => {
    const texto = '😀 no #1045';
    expect(trechos(texto)).toEqual([[1045, '#1045']]);
  });
});
