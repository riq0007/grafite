// Os números dos campos (spec campos-personalizados): lidos em pt-BR, com a vírgula nas casas
// decimais e o ponto nos milhares, e guardados como número, com até 15 algarismos, que o número de
// ponto flutuante guarda sem perder nada. As casas a mais são recusadas, e nada é arredondado.
import { aceito, type ConfiguracaoDoCampo, type Leitura, recusado, vazio } from './tipos.ts';

/** O maior número de algarismos que um campo guarda sem perder nada. */
const ALGARISMOS = 15;

const MOEDA_MAXIMA = 9_999_999_999.99;

interface NumeroLido {
  numero: number;
  /** Os algarismos que contam: sem os zeros à esquerda nem os zeros no fim das casas. */
  algarismos: number;
  casas: number;
}

function lido(sinal: string, inteiro: string, fracao: string): NumeroLido {
  const semZerosAEsquerda = inteiro.replace(/^0+(?=\d)/, '');
  const casas = fracao.replace(/0+$/, '');
  const numero = Number(`${sinal}${semZerosAEsquerda}.${casas || '0'}`);
  return {
    // Sem o -0: o zero é um só.
    numero: numero === 0 ? 0 : numero,
    algarismos: (semZerosAEsquerda === '0' ? 0 : semZerosAEsquerda.length) + casas.length,
    casas: casas.length,
  };
}

/**
 * O número de um texto em pt-BR. Com vírgula, ela separa as casas, e os pontos, os milhares. Sem
 * vírgula, o ponto seguido de três algarismos separa os milhares ("1.024"), e o seguido de outra
 * quantidade separa as casas ("1.5", e o "1234.56" que o próprio campo guardou).
 */
function numeroDoTexto(texto: string): NumeroLido | null {
  const ptBr = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/.exec(texto);
  if (ptBr) return lido(ptBr[1] ?? '', (ptBr[2] ?? '').replaceAll('.', ''), ptBr[3] ?? '');
  const comPonto = /^(-?)(\d+)\.(\d+)$/.exec(texto);
  if (comPonto) return lido(comPonto[1] ?? '', comPonto[2] ?? '', comPonto[3] ?? '');
  return null;
}

/** Um número sem expoente, como o JavaScript o escreveria por extenso. */
function porExtenso(numero: number): string {
  const texto = String(numero);
  if (!/e/i.test(texto)) return texto;
  return /e-/i.test(texto) ? numero.toFixed(20).replace(/0+$/, '') : '∞';
}

function numeroDaEntrada(entrada: unknown): NumeroLido | null {
  if (typeof entrada === 'number') {
    if (!Number.isFinite(entrada)) return null;
    const texto = porExtenso(Math.abs(entrada));
    if (texto === '∞') return { numero: entrada, algarismos: Number.POSITIVE_INFINITY, casas: 0 };
    const [inteiro = '0', fracao = ''] = texto.split('.');
    return lido(entrada < 0 ? '-' : '', inteiro, fracao);
  }
  if (typeof entrada === 'string') return numeroDoTexto(entrada.trim());
  return null;
}

const agrupar = (inteiro: string) => inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** O número em pt-BR, com os milhares e as casas que ele tem. */
export function mostrarDecimal(numero: number): string {
  const texto = porExtenso(numero);
  const negativo = texto.startsWith('-');
  const [inteiro = '0', fracao] = (negativo ? texto.slice(1) : texto).split('.');
  return `${negativo ? '-' : ''}${agrupar(inteiro)}${fracao ? `,${fracao}` : ''}`;
}

/** O valor em reais, sempre com as duas casas. */
export function mostrarMoeda(valor: number): string {
  const [inteiro = '0', fracao = '00'] = valor.toFixed(2).split('.');
  return `R$ ${agrupar(inteiro)},${fracao}`;
}

function foraDosLimites(numero: number, { minimo, maximo }: ConfiguracaoDoCampo): string | null {
  const abaixo = minimo !== undefined && numero < minimo;
  const acima = maximo !== undefined && numero > maximo;
  if (!abaixo && !acima) return null;
  if (minimo !== undefined && maximo !== undefined) {
    return `Use um número de ${mostrarDecimal(minimo)} a ${mostrarDecimal(maximo)}.`;
  }
  if (minimo !== undefined) return `Use um número a partir de ${mostrarDecimal(minimo)}.`;
  return `Use um número até ${mostrarDecimal(maximo ?? 0)}.`;
}

export function lerInteiro(entrada: unknown, configuracao: ConfiguracaoDoCampo): Leitura<number> {
  if (vazio(entrada)) return aceito(null);
  const numero = numeroDaEntrada(entrada);
  if (!numero || numero.casas > 0) return recusado('Use um número inteiro, como 1.024.');
  if (numero.algarismos > ALGARISMOS) return recusado(`Use até ${ALGARISMOS} algarismos.`);
  const limite = foraDosLimites(numero.numero, configuracao);
  return limite ? recusado(limite) : aceito(numero.numero);
}

function casasAMais(casas: number): string {
  if (casas === 0) return 'Use um número sem casas decimais.';
  if (casas === 1) return 'Use até 1 casa decimal.';
  return `Use até ${casas} casas decimais.`;
}

export function lerDecimal(entrada: unknown, configuracao: ConfiguracaoDoCampo): Leitura<number> {
  if (vazio(entrada)) return aceito(null);
  const numero = numeroDaEntrada(entrada);
  if (!numero) return recusado('Use um número, como 3,5.');
  // As casas antes dos algarismos: o 0,1 + 0,2 do ponto flutuante tem casas a mais.
  const casas = configuracao.casas ?? 2;
  if (numero.casas > casas) return recusado(casasAMais(casas));
  if (numero.algarismos > ALGARISMOS) return recusado(`Use até ${ALGARISMOS} algarismos.`);
  const limite = foraDosLimites(numero.numero, configuracao);
  return limite ? recusado(limite) : aceito(numero.numero);
}

export function lerMoeda(entrada: unknown): Leitura<number> {
  if (vazio(entrada)) return aceito(null);
  const semReais = typeof entrada === 'string' ? entrada.trim().replace(/^R\$\s*/i, '') : entrada;
  const numero = numeroDaEntrada(semReais);
  if (!numero || numero.casas > 2) return recusado('Use um valor em reais, como R$ 1.234,56.');
  if (numero.numero < 0 || numero.numero > MOEDA_MAXIMA) {
    return recusado('Use um valor de R$ 0,00 a R$ 9.999.999.999,99.');
  }
  return aceito(numero.numero);
}
