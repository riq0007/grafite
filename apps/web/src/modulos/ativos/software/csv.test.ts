// O CSV do "Exportar" do software (spec distribuicao-de-software, "Histórico das distribuições" e
// "Matriz do software"; change software-por-pacote): o separador ";" e o BOM, que o Excel em
// português abre certo, e as aspas só na célula que precisa. O BOM dos textos esperados sai do
// código, como no fonte, para nenhuma edição o perder sem o teste ver.
import { describe, expect, it } from 'vitest';
import { paraCsv } from './csv.ts';

const BOM = String.fromCharCode(0xfeff);

describe('o CSV do Exportar', () => {
  it('o primeiro caractere é o BOM, o U+FEFF', () => {
    expect(paraCsv([['Máquina']]).charCodeAt(0)).toBe(0xfeff);
    expect(paraCsv([]).charCodeAt(0)).toBe(0xfeff);
  });

  it('separa por ";", fecha cada linha com CRLF e começa pelo BOM', () => {
    expect(
      paraCsv([
        ['Máquina', 'Situação'],
        ['PC-FIN-17', 'Falhou'],
      ]),
    ).toBe(`${BOM}Máquina;Situação\r\nPC-FIN-17;Falhou\r\n`);
  });

  it('põe aspas na célula com ";", aspas ou quebra de linha, e dobra as aspas de dentro', () => {
    expect(paraCsv([['a;b', 'diz "oi"', 'duas\nlinhas', 'simples']])).toBe(
      `${BOM}"a;b";"diz ""oi""";"duas\nlinhas";simples\r\n`,
    );
  });

  it('o vazio e o número viram texto, e a célula que parece fórmula ganha o apóstrofo', () => {
    expect(paraCsv([[null, 1603, '=SOMA(A1)', '+1', '-2', '@x']])).toBe(
      `${BOM};1603;'=SOMA(A1);'+1;'-2;'@x\r\n`,
    );
  });

  it('a tabulação e o retorno de carro no começo também ganham o apóstrofo, e no meio, não', () => {
    expect(paraCsv([['\tSOMA(A1)', '\r=1', 'a\tb']])).toBe(`${BOM}'\tSOMA(A1);"'\r=1";a\tb\r\n`);
  });
});
