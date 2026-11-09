// Casamento da busca global (design do F1b, decisão 2): sem acento, sem maiúsculas e com as
// palavras em qualquer ordem. A ordem dentro do grupo põe primeiro o nome que começa pelo texto.
import { normalizarTexto } from '@grafite/domain';
import {
  type EntradaDeBusca,
  GRUPOS_LOCAIS,
  type GrupoDeResultados,
  type OrigemDaEntrada,
} from './tipos.ts';

/** Quantos resultados cada grupo local mostra. */
export const MAXIMO_POR_GRUPO = 8;

const PRECEDENCIA: Record<OrigemDaEntrada, number> = { declarada: 0, modulo: 1, menu: 2 };

/** Aonde a entrada leva: o endereço e, se houver, o elemento que recebe o foco. */
const lugar = (entrada: EntradaDeBusca) =>
  entrada.destino && (entrada.foco ? `${entrada.destino}?foco=${entrada.foco}` : entrada.destino);

/**
 * Um destino aparece uma vez só. Entre as entradas que levam ao mesmo lugar, fica a declarada pelo
 * módulo, depois a do próprio módulo, depois a de um item de menu. A ordem das demais não muda.
 */
export function semDestinoRepetido(entradas: readonly EntradaDeBusca[]): EntradaDeBusca[] {
  const vencedoras = new Map<string, EntradaDeBusca>();
  for (const entrada of entradas) {
    const onde = lugar(entrada);
    if (!onde) continue;
    const atual = vencedoras.get(onde);
    if (!atual || PRECEDENCIA[entrada.origem] < PRECEDENCIA[atual.origem]) {
      vencedoras.set(onde, entrada);
    }
  }
  return entradas.filter((entrada) => {
    const onde = lugar(entrada);
    return !onde || vencedoras.get(onde) === entrada;
  });
}

/** 0: o nome começa pelo texto; 1: o nome contém o texto; 2: casou por outro campo. */
function nivel(nome: string, texto: string): number {
  if (nome.startsWith(texto)) return 0;
  return nome.includes(texto) ? 1 : 2;
}

/**
 * Os grupos locais que casam com o termo, na ordem Nesta tela, Ir para, Ações e Ajustes, sem grupos
 * vazios e com até 8 resultados cada. Com o termo vazio, as ações da tela e os módulos, no Ir para.
 */
export function buscarNasEntradas(
  termo: string,
  entradas: readonly EntradaDeBusca[],
): GrupoDeResultados[] {
  const texto = normalizarTexto(termo);
  if (!texto) {
    const daTela = entradas.filter((entrada) => entrada.grupo === 'nesta-tela');
    const modulos = entradas.filter((entrada) => entrada.origem === 'modulo');
    return [
      ...(daTela.length > 0 ? [{ id: 'nesta-tela', nome: 'Nesta tela', resultados: daTela }] : []),
      ...(modulos.length > 0 ? [{ id: 'ir-para', nome: 'Ir para', resultados: modulos }] : []),
    ];
  }
  const palavras = texto.split(' ');
  return GRUPOS_LOCAIS.map(({ id, nome }) => {
    const resultados = entradas
      .filter((entrada) => entrada.grupo === id)
      .map((entrada, ordem) => {
        const nomeComparavel = normalizarTexto(entrada.rotulo);
        const tudo = normalizarTexto(
          [entrada.rotulo, entrada.caminho ?? '', ...(entrada.palavrasChave ?? [])].join(' '),
        );
        return { entrada, ordem, tudo, nivel: nivel(nomeComparavel, texto) };
      })
      .filter(({ tudo }) => palavras.every((palavra) => tudo.includes(palavra)))
      .sort((a, b) => a.nivel - b.nivel || a.ordem - b.ordem)
      .slice(0, MAXIMO_POR_GRUPO)
      .map(({ entrada }) => entrada);
    return { id, nome, resultados };
  }).filter((grupo) => grupo.resultados.length > 0);
}
