// As listas dos campos (spec campos-personalizados; design do P1a, decisão 3): a opção é lida pelo
// rótulo, sem diferenciar acento e maiúsculas, ou pelo id, e o valor guardado é o id, que não muda
// quando a opção é renomeada. A opção inativa sai das escolhas e continua nos valores que a usam.
import { normalizarTexto } from '../texto.ts';
import { aceito, type Leitura, type OpcaoDaLista, recusado, vazio } from './tipos.ts';

/** Até quantas opções a recusa lista. */
const OPCOES_NA_RECUSA = 10;

function escolhaUmaDas(opcoes: readonly OpcaoDaLista[]): string {
  const ativas = opcoes.filter((opcao) => opcao.situacao === 'ativa');
  if (ativas.length === 0 || ativas.length > OPCOES_NA_RECUSA) {
    return 'Escolha uma das opções do campo.';
  }
  return `Escolha uma das opções: ${ativas.map((opcao) => opcao.rotulo).join(', ')}.`;
}

/** A opção pelo id ou pelo rótulo normalizado, ou a recusa. */
function opcaoDa(entrada: string | number, opcoes: readonly OpcaoDaLista[]): Leitura<string> {
  const texto = String(entrada).trim();
  const normalizado = normalizarTexto(texto);
  const opcao =
    opcoes.find((candidata) => candidata.id === texto) ??
    opcoes.find((candidata) => normalizarTexto(candidata.rotulo) === normalizado);
  if (!opcao) return recusado(escolhaUmaDas(opcoes));
  if (opcao.situacao === 'inativa') return recusado(`A opção ${opcao.rotulo} está inativa.`);
  return aceito(opcao.id);
}

export function lerLista(entrada: unknown, opcoes: readonly OpcaoDaLista[]): Leitura<string> {
  if (vazio(entrada)) return aceito(null);
  if (typeof entrada !== 'string' && typeof entrada !== 'number') {
    return recusado(escolhaUmaDas(opcoes));
  }
  return opcaoDa(entrada, opcoes);
}

/** As opções separadas por ";", ou a lista delas: sem repetir e na ordem das opções. */
export function lerListaMultipla(
  entrada: unknown,
  opcoes: readonly OpcaoDaLista[],
): Leitura<string[]> {
  const itens = typeof entrada === 'string' ? entrada.split(';') : entrada;
  if (!Array.isArray(itens) && !vazio(itens)) return recusado(escolhaUmaDas(opcoes));
  const preenchidos = (Array.isArray(itens) ? itens : []).filter((item) => !vazio(item));
  if (preenchidos.length === 0) return aceito(null);
  const escolhidas = new Set<string>();
  for (const item of preenchidos) {
    if (typeof item !== 'string' && typeof item !== 'number')
      return recusado(escolhaUmaDas(opcoes));
    const lida = opcaoDa(item, opcoes);
    if (!lida.ok) return lida;
    if (lida.valor) escolhidas.add(lida.valor);
  }
  return aceito(opcoes.filter((opcao) => escolhidas.has(opcao.id)).map((opcao) => opcao.id));
}

export function mostrarLista(id: string, opcoes: readonly OpcaoDaLista[]): string {
  const opcao = opcoes.find((candidata) => candidata.id === id);
  if (!opcao) return id;
  return opcao.situacao === 'inativa' ? `${opcao.rotulo} (inativa)` : opcao.rotulo;
}

export function mostrarListaMultipla(ids: readonly string[], opcoes: readonly OpcaoDaLista[]) {
  return ids.map((id) => mostrarLista(id, opcoes)).join(', ');
}
