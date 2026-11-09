// As abas da ficha do ativo no endereço (design do P1d, decisão 7): a Dados, a padrão, fica fora
// dele, e um valor desconhecido abre a Dados. O cartão aberto na Dados também vai no endereço
// (change ficha-em-cartoes, design, decisão 4), com o primeiro cartão do tipo, o padrão, fora dele
// (change primeiro-cartao-da-ficha, design, decisão 4).

export type AbaDaFicha = 'dados' | 'ligados' | 'softwares' | 'historico';

/** As abas que vão no endereço; a Dados é a padrão. */
const NO_ENDERECO: readonly string[] = ['ligados', 'softwares', 'historico'];
const noEndereco = (aba: unknown): aba is Exclude<AbaDaFicha, 'dados'> =>
  typeof aba === 'string' && NO_ENDERECO.includes(aba);

export interface BuscaDaFicha {
  aba?: Exclude<AbaDaFicha, 'dados'>;
  /** A chave do cartão aberto na aba Dados, como `organizacao:Rede`. */
  grupo?: string;
}

/** O maior tamanho de uma chave de cartão que o endereço aceita. */
const MAIOR_CHAVE = 300;

export function lerAbaDaFicha(busca: Record<string, unknown>): BuscaDaFicha {
  const { grupo } = busca;
  return {
    ...(noEndereco(busca.aba) ? { aba: busca.aba } : {}),
    ...(typeof grupo === 'string' && grupo !== '' && grupo.length <= MAIOR_CHAVE ? { grupo } : {}),
  };
}

/** A busca do endereço com a aba escolhida: só o que não é o padrão. */
export const buscaDaAba = (aba: string): BuscaDaFicha => (noEndereco(aba) ? { aba } : {});

/**
 * O cartão escolhido no endereço: o primeiro do tipo fica fora dele, e a Visão geral entra quando
 * não é a primeira (change primeiro-cartao-da-ficha, design, decisão 4).
 */
export const buscaDoCartao = (chave: string, primeiro: boolean): Pick<BuscaDaFicha, 'grupo'> =>
  primeiro ? {} : { grupo: chave };
