// O pacote na tela e os programas da máquina frente à base (spec distribuicao-de-software, "Tela da
// base"; spec inventario-pelo-agente, "Softwares na ficha do ativo"; change software-por-pacote,
// design, decisões 4 e 13).
import { describe, expect, it } from 'vitest';
import {
  frenteABase,
  monograma,
  ordenarFrenteABase,
  textoFrenteABase,
  tipoDoPacote,
} from './base.ts';

describe('tipoDoPacote', () => {
  it('vem da extensão do arquivo, longo na ficha e curto nas listas', () => {
    const casos: [string | null, string, string][] = [
      ['chrome-131.msi', 'Instalador MSI', 'MSI'],
      ['Setup.EXE', 'Instalador EXE', 'EXE'],
      ['aplicativo.msix', 'Pacote MSIX', 'MSIX'],
      ['instalar.ps1', 'Roteiro do PowerShell', 'PS1'],
      ['instalar.bat', 'Roteiro em lote', 'BAT'],
      ['instalar.cmd', 'Roteiro em lote', 'CMD'],
      ['drivers.zip', 'Arquivo ZIP', 'ZIP'],
      ['atualizacao.msu', 'MSU', 'MSU'],
      ['LEIAME', 'Arquivo', 'Arquivo'],
      [null, 'Só o comando', 'Só o comando'],
    ];
    for (const [arquivo, longo, curto] of casos) {
      expect(tipoDoPacote(arquivo)).toEqual({ longo, curto });
    }
  });
});

describe('monograma', () => {
  it('as iniciais das duas primeiras palavras, sem os conectivos', () => {
    expect(monograma('Google Chrome')).toBe('GC');
    expect(monograma('Driver HP Universal')).toBe('DH');
    expect(monograma('Agente de backup')).toBe('AB');
  });

  it('as duas primeiras letras quando o nome tem uma palavra só', () => {
    expect(monograma('VLC')).toBe('VL');
    expect(monograma('SumatraPDF')).toBe('Su');
    expect(monograma('7-Zip')).toBe('7Z');
    expect(monograma('Notepad++')).toBe('No');
  });
});

const PACOTES = [
  { id: 'chrome', nome: 'Google Chrome', nomeNoInventario: 'Google Chrome', versao: '131' },
  { id: '7zip', nome: '7-Zip', nomeNoInventario: '7-Zip', versao: '24.08' },
  { id: 'vlc', nome: 'VLC', nomeNoInventario: 'VLC media player', versao: '3.0.21' },
  { id: 'sumatra', nome: 'SumatraPDF', nomeNoInventario: 'SumatraPDF', versao: '3.5.2' },
  { id: 'office', nome: 'Configuração do Office', nomeNoInventario: null, versao: null },
];

describe('frenteABase', () => {
  it('compara o programa com o pacote dele na base', () => {
    expect(
      frenteABase({ nome: 'Google Chrome', versao: '129.0.6668.101', doSistema: false }, PACOTES),
    ).toEqual({ comparacao: 'ha-na-base', pacote: PACOTES[0] });
    expect(
      frenteABase({ nome: 'SumatraPDF', versao: '3.5.2', doSistema: false }, PACOTES).comparacao,
    ).toBe('na-versao');
    expect(
      frenteABase({ nome: 'Configuração do Office', versao: '16.0', doSistema: false }, PACOTES),
    ).toEqual({ comparacao: 'sem-versao-alvo', pacote: PACOTES[4] });
    expect(frenteABase({ nome: 'Paint.NET', versao: '5.0', doSistema: false }, PACOTES)).toEqual({
      comparacao: 'fora-da-base',
      pacote: null,
    });
  });

  it('o programa do sistema não se distribui, mesmo com um pacote que casa', () => {
    expect(frenteABase({ nome: 'Google Chrome', versao: '131', doSistema: true }, PACOTES)).toEqual(
      { comparacao: 'do-windows', pacote: null },
    );
  });

  it('com dois pacotes que casam, vale o de nome no inventário mais longo', () => {
    const pacotes = [
      { id: 'java', nome: 'Java', nomeNoInventario: 'Java 8', versao: '8u411' },
      {
        id: 'java-update',
        nome: 'Java 8 Update',
        nomeNoInventario: 'Java 8 Update',
        versao: '8u411',
      },
    ];
    expect(
      frenteABase({ nome: 'Java 8 Update 401', versao: '8u401', doSistema: false }, pacotes).pacote
        ?.id,
    ).toBe('java-update');
  });

  it('escreve a comparação como o rótulo da ficha, que o rótulo põe em maiúsculas', () => {
    expect(textoFrenteABase('ha-na-base', '131')).toBe('Há a 131 na base');
    expect(textoFrenteABase('na-versao', '131')).toBe('Na versão da base');
    expect(textoFrenteABase('sem-versao-alvo', null)).toBe('Na base, sem versão-alvo');
    expect(textoFrenteABase('fora-da-base', null)).toBe('Não está na base');
    expect(textoFrenteABase('do-windows', null)).toBe('Do Windows, não se distribui');
  });
});

describe('ordenarFrenteABase', () => {
  it('Ação primeiro: os abaixo da base, pelo nome, e o do Windows por último', () => {
    const programas = [
      { nome: 'Microsoft Edge', versao: '131.0', doSistema: true },
      { nome: 'SumatraPDF', versao: '3.5.2', doSistema: false },
      { nome: 'VLC media player', versao: '3.0.20', doSistema: false },
      { nome: 'Paint.NET', versao: '5.0', doSistema: false },
      { nome: 'Google Chrome', versao: '129.0.6668.101', doSistema: false },
      { nome: '7-Zip 23.01 (x64)', versao: '23.01', doSistema: false },
      { nome: 'Configuração do Office', versao: '16.0', doSistema: false },
    ];
    const linhas = programas.map((programa) => ({
      ...programa,
      ...frenteABase(programa, PACOTES),
    }));
    expect(
      ordenarFrenteABase(linhas).map(({ nome, comparacao }) => `${comparacao} ${nome}`),
    ).toEqual([
      'ha-na-base 7-Zip 23.01 (x64)',
      'ha-na-base Google Chrome',
      'ha-na-base VLC media player',
      'na-versao SumatraPDF',
      'sem-versao-alvo Configuração do Office',
      'fora-da-base Paint.NET',
      'do-windows Microsoft Edge',
    ]);
  });
});
