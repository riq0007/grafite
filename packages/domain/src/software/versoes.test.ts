// As versões e o casamento do inventário com o pacote (spec distribuicao-de-software, "Pacote frente
// ao inventário"; change software-por-pacote, design, decisões 1 e 2).
import { describe, expect, it } from 'vitest';
import {
  casaComOPacote,
  compararVersoes,
  estadoDaVersao,
  situacaoFrenteAoPacote,
  versaoCortada,
  versaoMaisAlta,
} from './versoes.ts';

const sinal = (instalada: string, alvo: string) => Math.sign(compararVersoes(instalada, alvo));

describe('compararVersoes', () => {
  it('vai só até os pedaços da versão do pacote', () => {
    expect(sinal('131.0.6778.86', '131')).toBe(0);
    expect(sinal('129.0.6668.101', '131')).toBe(-1);
    expect(sinal('2.4.1-beta', '2.4.1')).toBe(0);
  });

  it('compara o número pelo valor, sem os zeros à esquerda, também além do inteiro seguro', () => {
    expect(sinal('23.1', '23.01')).toBe(0);
    expect(sinal('23.01', '23.1')).toBe(0);
    expect(sinal('10', '9')).toBe(1);
    expect(sinal('00010', '10')).toBe(0);
    expect(sinal('3.0.20', '3.0.21')).toBe(-1);
    expect(sinal('20231015123456789', '20231015123456788')).toBe(1);
  });

  it('quebra a versão na troca entre algarismo e letra e compara a letra sem a maiúscula', () => {
    expect(sinal('8u401', '8u411')).toBe(-1);
    expect(sinal('8u411', '8u411')).toBe(0);
    expect(sinal('1.2.3A', '1.2.3a')).toBe(0);
    expect(sinal('1.2.3a', '1.2.3b')).toBe(-1);
  });

  it('o número vem depois da letra, e o pedaço que falta na instalada vale 0', () => {
    expect(sinal('2.4.1', '2.4.1-beta')).toBe(1);
    expect(sinal('24', '24.08')).toBe(-1);
    expect(sinal('24.0', '24')).toBe(0);
  });

  it('tira o "v" do começo e quebra nos separadores', () => {
    expect(sinal('v131', '131')).toBe(0);
    expect(sinal('131', 'V131')).toBe(0);
    expect(sinal('1_2 3-4', '1.2.3.4')).toBe(0);
  });
});

describe('casaComOPacote', () => {
  it('casa o nome igual, sem acento, sem a maiúscula e com os espaços juntados', () => {
    expect(casaComOPacote('Google Chrome', 'google chrome')).toBe(true);
    expect(casaComOPacote('Configuração do Office', 'Configuracao do Office')).toBe(true);
    expect(casaComOPacote('Google   Chrome ', 'Google Chrome')).toBe(true);
  });

  it('casa o nome seguido de um espaço e de um algarismo ou de "("', () => {
    expect(casaComOPacote('7-Zip 23.01 (x64)', '7-Zip')).toBe(true);
    expect(casaComOPacote('Notepad++ (64-bit x64)', 'Notepad++')).toBe(true);
    expect(casaComOPacote('Java 8 Update 401', 'Java 8 Update')).toBe(true);
  });

  it('não casa o nome parecido', () => {
    expect(casaComOPacote('Google Chrome Beta', 'Google Chrome')).toBe(false);
    expect(casaComOPacote('Google Chrome', 'Google Chrome Beta')).toBe(false);
    expect(casaComOPacote('7-Zip23.01', '7-Zip')).toBe(false);
    expect(casaComOPacote('Java 8 Update 401', 'Java 8')).toBe(false);
  });
});

describe('versaoMaisAlta', () => {
  it('fica com a mais alta, e a sem versão vale menos que todas', () => {
    expect(versaoMaisAlta(['129.0.1', null, '131.0.2'])).toBe('131.0.2');
    expect(versaoMaisAlta(['24.08', '24.8'])).toBe('24.08');
    expect(versaoMaisAlta(['2.4.1-beta', '2.4.1'])).toBe('2.4.1');
    expect(versaoMaisAlta([null])).toBeNull();
    expect(versaoMaisAlta([])).toBeNull();
  });
});

describe('situacaoFrenteAoPacote', () => {
  it('Versão do Chrome: a 131.0.6778.86 está na 131, e a 129.0.6668.101, desatualizada', () => {
    expect(situacaoFrenteAoPacote(['131.0.6778.86'], '131')).toEqual({
      situacao: 'na-versao',
      versao: '131.0.6778.86',
    });
    expect(situacaoFrenteAoPacote(['129.0.6668.101'], '131')).toEqual({
      situacao: 'desatualizada',
      versao: '129.0.6668.101',
    });
  });

  it('a mais nova que a versão-alvo está nela, e a sem versão está desatualizada', () => {
    expect(situacaoFrenteAoPacote(['132.0.1'], '131').situacao).toBe('na-versao');
    expect(situacaoFrenteAoPacote([null], '131')).toEqual({
      situacao: 'desatualizada',
      versao: null,
    });
  });

  it('com o pacote duas vezes na máquina, vale a versão mais alta', () => {
    expect(situacaoFrenteAoPacote(['129', '131.0.1'], '131')).toEqual({
      situacao: 'na-versao',
      versao: '131.0.1',
    });
  });

  it('Versão com letra e com pedaço a menos: a 8u401 e a 24 estão desatualizadas', () => {
    expect(situacaoFrenteAoPacote(['8u401'], '8u411').situacao).toBe('desatualizada');
    expect(situacaoFrenteAoPacote(['24'], '24.08').situacao).toBe('desatualizada');
  });

  it('sem o programa, e o pacote sem versão-alvo não compara', () => {
    expect(situacaoFrenteAoPacote([], '131')).toEqual({ situacao: 'sem-o-programa', versao: null });
    expect(situacaoFrenteAoPacote([], null)).toEqual({ situacao: 'sem-o-programa', versao: null });
    expect(situacaoFrenteAoPacote(['16.0.10417'], null)).toEqual({
      situacao: 'instalado-sem-alvo',
      versao: '16.0.10417',
    });
    expect(situacaoFrenteAoPacote([null], '  ').situacao).toBe('instalado-sem-alvo');
  });
});

describe('versaoCortada e estadoDaVersao', () => {
  it('corta a versão no tamanho da versão-alvo, sem o "v" do começo', () => {
    expect(versaoCortada('130.0.6723.117', '131')).toBe('130');
    expect(versaoCortada('8u401', '8u411')).toBe('8u401');
    expect(versaoCortada('24', '24.08')).toBe('24');
    expect(versaoCortada('v130.1', '131')).toBe('130');
    expect(versaoCortada('2.4.1-beta', '2.4.1')).toBe('2.4.1');
    expect(versaoCortada(null, '131')).toBeNull();
  });

  it('diz se a versão está no alvo, abaixo ou acima dele', () => {
    expect(estadoDaVersao('131', '131')).toBe('alvo');
    expect(estadoDaVersao('130', '131')).toBe('abaixo');
    expect(estadoDaVersao('132', '131')).toBe('acima');
    expect(estadoDaVersao(null, '131')).toBe('abaixo');
  });
});
