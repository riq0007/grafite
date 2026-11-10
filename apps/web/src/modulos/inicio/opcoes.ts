// As opções dos blocos do Início (spec tela-inicial, "Opções dos blocos"; change
// opcoes-dos-blocos-do-inicio, design, decisão 1): o bloco declara as opções, o Início resolve o
// valor de cada uma, o guardado na conta ou o de fábrica, e o bloco recebe sempre todas as chaves,
// sem validar nada.
import type { OpcaoDoBloco, OpcoesResolvidas } from '../tipos.ts';

/** A lista de textos guardada, sem repetir; o que não é uma lista de textos não serve. */
function textos(valor: unknown): string[] | undefined {
  if (!Array.isArray(valor) || !valor.every((item) => typeof item === 'string')) return undefined;
  return [...new Set(valor as string[])];
}

/** O valor de fábrica de uma opção; nos locais, nenhum escolhido, que quer dizer todos. */
const deFabrica = (opcao: OpcaoDoBloco): readonly string[] | number =>
  opcao.forma === 'locais' ? [] : opcao.padrao;

/** As opções de um bloco como ele as declara, sem nenhuma escolha da conta. */
export const opcoesDeFabrica = (declaradas: readonly OpcaoDoBloco[]): OpcoesResolvidas =>
  Object.fromEntries(declaradas.map((opcao) => [opcao.chave, deFabrica(opcao)]));

/**
 * O valor que vale de uma opção: o guardado, se a opção ainda o aceita, ou o de fábrica.
 * - O número vale dentro do intervalo.
 * - Numa escolha, o valor que saiu da lista sai; se sobram menos que o mínimo, ou se nenhum dos
 *   guardados sobra, vale a de fábrica.
 * - Nos locais, o que não é mais um local ativo sai, e sem nenhum valem todos. Sem os locais
 *   ativos, enquanto eles não chegam, vale o que está guardado.
 */
function valorDa(
  opcao: OpcaoDoBloco,
  guardado: unknown,
  locaisAtivos: ReadonlySet<string> | undefined,
): readonly string[] | number {
  if (opcao.forma === 'numero') {
    const serve =
      typeof guardado === 'number' &&
      Number.isFinite(guardado) &&
      guardado >= opcao.minimo &&
      guardado <= opcao.maximo;
    return serve ? guardado : opcao.padrao;
  }
  const guardados = textos(guardado);
  if (opcao.forma === 'locais') {
    return (guardados ?? []).filter((id) => !locaisAtivos || locaisAtivos.has(id));
  }
  if (!guardados) return opcao.padrao;
  const daLista = new Set(opcao.opcoes.map(({ id }) => id));
  const escolhidos = guardados.filter((id) => daLista.has(id));
  const sobrou = escolhidos.length > 0 || guardados.length === 0;
  return sobrou && escolhidos.length >= (opcao.minimo ?? 0) ? escolhidos : opcao.padrao;
}

/**
 * As opções de um bloco resolvidas: cada chave declarada com o valor que vale. A chave guardada que
 * o bloco não declara fica de fora.
 */
export function resolverOpcoes(
  declaradas: readonly OpcaoDoBloco[],
  guardadas: Readonly<Record<string, unknown>> | undefined,
  locaisAtivos?: ReadonlySet<string>,
): OpcoesResolvidas {
  return Object.fromEntries(
    declaradas.map((opcao) => [
      opcao.chave,
      valorDa(opcao, guardadas?.[opcao.chave], locaisAtivos),
    ]),
  );
}

/** As escolhas, ou os locais, de uma opção resolvida; a chave que não é uma lista dá a vazia. */
export function escolhasDa(opcoes: OpcoesResolvidas, chave: string): readonly string[] {
  const valor = opcoes[chave];
  return typeof valor === 'number' || valor === undefined ? [] : valor;
}

/** O número de uma opção resolvida; a chave que não é um número dá zero. */
export function numeroDa(opcoes: OpcoesResolvidas, chave: string): number {
  const valor = opcoes[chave];
  return typeof valor === 'number' ? valor : 0;
}
