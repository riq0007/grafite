// O CSV do "Exportar" do software (spec distribuicao-de-software, "Histórico das distribuições" e
// "Matriz do software"; change software-por-pacote): o separador ";" e o BOM, que o Excel em
// português abre certo, e as aspas só na célula que precisa.
import { describe, expect, it } from 'vitest';
import { paraCsv } from './csv.ts';

describe('o CSV do Exportar', () => {
  it('separa por ";", fecha cada linha com CRLF e começa pelo BOM', () => {
    expect(
      paraCsv([
        ['Máquina', 'Situação'],
        ['PC-FIN-17', 'Falhou'],
      ]),
    ).toBe('﻿Máquina;Situação\r\nPC-FIN-17;Falhou\r\n');
  });

  it('põe aspas na célula com ";", aspas ou quebra de linha, e dobra as aspas de dentro', () => {
    expect(paraCsv([['a;b', 'diz "oi"', 'duas\nlinhas', 'simples']])).toBe(
      '﻿"a;b";"diz ""oi""";"duas\nlinhas";simples\r\n',
    );
  });

  it('o vazio e o número viram texto, e a célula que parece fórmula ganha o apóstrofo', () => {
    expect(paraCsv([[null, 1603, '=SOMA(A1)', '+1', '-2', '@x']])).toBe(
      "﻿;1603;'=SOMA(A1);'+1;'-2;'@x\r\n",
    );
  });
});
