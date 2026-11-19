// As cores das telas da TI nos chamados (change chamados-da-ti, design, decisões 6 e 22): a série do
// ícone de cada tipo, que o quadrado e a linha usam, e a da conta de quem atende, que a sigla da
// coluna usa. Daqui sai só o número da série; a cor é o token `--cor-serie-N` do tema.
import { ICONES_DO_TIPO_DE_CHAMADO, type IconeDoTipoDeChamado } from '@grafite/domain';

/** Uma das oito séries dos dados do tema. */
export type Serie = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * A série de cada ícone da lista fechada (decisão 6): os ícones do mesmo assunto dividem a série, e
 * as reticências do "Outro" ficam no texto secundário, sem série.
 */
export const SERIE_DO_ICONE: Readonly<Record<IconeDoTipoDeChamado, Serie | null>> = {
  gota: 4,
  notebook: 1,
  impressora: 2,
  cadeado: 3,
  janela: 5,
  globo: 7,
  telefone: 6,
  reticencias: null,
  setas: 8,
  computador: 1,
  torre: 8,
  fone: 6,
  chave: 3,
  caixa: 4,
  camera: 8,
  'wi-fi': 7,
};

const ICONES: readonly string[] = ICONES_DO_TIPO_DE_CHAMADO;

/**
 * O ícone do tipo como a API o manda, em texto: o que a web não conhece, de uma versão mais nova da
 * API, vira as reticências do "Outro".
 */
export function iconeDoTipo(icone: string): IconeDoTipoDeChamado {
  return ICONES.includes(icone) ? (icone as IconeDoTipoDeChamado) : 'reticencias';
}

/**
 * A série da conta, sempre a mesma para o mesmo id, em qualquer tela e em qualquer computador: a
 * soma das letras do id inteiro, porque as contas criadas em sequência mudam só no fim dele, e uma
 * letra trocada em qualquer lugar muda a série.
 */
export function serieDaConta(conta: string): Serie {
  let soma = 0;
  for (const letra of conta) soma += letra.codePointAt(0) ?? 0;
  return ((soma % 8) + 1) as Serie;
}
