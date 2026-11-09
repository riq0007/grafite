// As mudanças da conta sobre uma visão (spec visoes-de-tabela, "Tabela alterada"; design do
// visoes-da-conta, decisões 1 e 3). Elas guardam a definição inteira, com a forma e os limites da
// definição de uma visão, e não a diferença: a visão da organização que muda depois não reinterpreta
// uma diferença antiga. A tabela compõe três camadas: o endereço, as mudanças da conta e a visão.
import {
  type DefinicaoDaVisao,
  type IdDaTabelaComVisoes,
  lerDefinicaoDaVisao,
  mesmaDefinicao,
  tabelaComVisoes,
  VISAO_DE_FABRICA,
} from './visoes.ts';

/** Como a tabela aberta se relaciona com a visão salva, em texto na tela. */
export type EstadoDaVisao = 'salva' | 'personalizada' | 'do-link';

export const ROTULOS_DOS_ESTADOS_DA_VISAO = {
  salva: '',
  personalizada: 'Personalizada',
  'do-link': 'Do link',
} as const satisfies Record<EstadoDaVisao, string>;

export interface CamadasDaVisao {
  /** A definição salva da visão. */
  salva: DefinicaoDaVisao;
  /** As mudanças da conta sobre ela, quando há. */
  daConta?: DefinicaoDaVisao;
  /** A tabela do endereço, quando ele a traz. */
  doEndereco?: DefinicaoDaVisao;
}

/**
 * A tabela que vale e o estado dela: o endereço que difere da visão com as mudanças da conta é "Do
 * link"; sem ele, as mudanças da conta que diferem da visão são "Personalizada".
 */
export function comporVisao({ salva, daConta, doEndereco }: CamadasDaVisao): {
  definicao: DefinicaoDaVisao;
  estado: EstadoDaVisao;
} {
  const daContaQueMuda = daConta && !mesmaDefinicao(daConta, salva) ? daConta : undefined;
  if (doEndereco && !mesmaDefinicao(doEndereco, daContaQueMuda ?? salva)) {
    return { definicao: doEndereco, estado: 'do-link' };
  }
  if (daContaQueMuda) return { definicao: daContaQueMuda, estado: 'personalizada' };
  return { definicao: salva, estado: 'salva' };
}

/** As mudanças da conta sobre uma visão, como a API as grava. */
export interface MudancasDaVisao {
  tabela: IdDaTabelaComVisoes;
  /** O id da visão, ou `fabrica`. */
  visao: string;
  definicao: DefinicaoDaVisao;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê o pedido das mudanças: a tabela com visões, a visão e a definição, com os limites dela. */
export function lerMudancasDaVisao(
  bruto: unknown,
): { ok: true; mudancas: MudancasDaVisao } | { ok: false; erro: string } {
  const pedido = (typeof bruto === 'object' && bruto !== null ? bruto : {}) as Record<
    string,
    unknown
  >;
  const tabela = typeof pedido.tabela === 'string' ? tabelaComVisoes(pedido.tabela) : undefined;
  if (!tabela) return { ok: false, erro: 'A tabela não tem visões.' };
  const visao = pedido.visao;
  if (typeof visao !== 'string' || (visao !== VISAO_DE_FABRICA && !UUID.test(visao))) {
    return { ok: false, erro: 'A visão não existe.' };
  }
  const leitura = lerDefinicaoDaVisao(pedido.definicao);
  if (!leitura.ok) return leitura;
  return {
    ok: true,
    mudancas: { tabela: tabela.id as IdDaTabelaComVisoes, visao, definicao: leitura.definicao },
  };
}
