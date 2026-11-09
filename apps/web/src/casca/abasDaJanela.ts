// O estado das abas da janela (change cadastro-em-abas, design, decisões 2 e 3): a primeira aba é
// a tela do roteador, e as outras são os cadastros que os campos pedem. As funções são puras; a casca
// do app guarda o estado num provedor e cuida das promessas dos pedidos.

/** A primeira aba, a da tela em que a pessoa está, que nunca fecha. */
export const ABA_DA_TELA = 'tela';

export type AbaDaJanela =
  | { id: typeof ABA_DA_TELA; tipo: 'tela' }
  | {
      id: string;
      tipo: 'cadastro';
      /** O que o cadastro cria, como `local`. */
      alvo: string;
      /** O título da aba, como "Novo local". */
      titulo: string;
      /** A aba de onde o cadastro foi pedido. */
      origem: string;
      /** O campo que pediu: a aba de origem e o campo, para o mesmo campo não abrir duas abas. */
      chave: string;
      /** Os valores com que o formulário abre, como o tipo do ativo no Novo modelo. */
      inicial?: Readonly<Record<string, string>>;
    };

export type AbaDeCadastro = Extract<AbaDaJanela, { tipo: 'cadastro' }>;

export interface EstadoDasAbas {
  abas: readonly AbaDaJanela[];
  /** A aba que está na frente. */
  frente: string;
  /** O número da próxima aba de cadastro, para o id dela. */
  proxima: number;
}

export type PedidoDeCadastro = Omit<AbaDeCadastro, 'id' | 'tipo'>;

export function estadoInicialDasAbas(): EstadoDasAbas {
  return { abas: [{ id: ABA_DA_TELA, tipo: 'tela' }], frente: ABA_DA_TELA, proxima: 1 };
}

/**
 * Abre o cadastro pedido por um campo numa aba nova, na frente. Se o mesmo campo já tem uma aba
 * aberta, só a traz para a frente.
 */
export function abrirCadastro(
  estado: EstadoDasAbas,
  pedido: PedidoDeCadastro,
): { estado: EstadoDasAbas; id: string; nova: boolean } {
  const aberta = estado.abas.find((aba) => aba.tipo === 'cadastro' && aba.chave === pedido.chave);
  if (aberta) return { estado: { ...estado, frente: aberta.id }, id: aberta.id, nova: false };
  const id = `cadastro-${estado.proxima}`;
  const aba: AbaDeCadastro = { id, tipo: 'cadastro', ...pedido };
  return {
    estado: { abas: [...estado.abas, aba], frente: id, proxima: estado.proxima + 1 },
    id,
    nova: true,
  };
}

export function trazerParaFrente(estado: EstadoDasAbas, id: string): EstadoDasAbas {
  if (estado.frente === id || !estado.abas.some((aba) => aba.id === id)) return estado;
  return { ...estado, frente: id };
}

/** Leva a tela para a frente, como quando a pessoa navega pelo dock; as de cadastro continuam. */
export function irParaATela(estado: EstadoDasAbas): EstadoDasAbas {
  return trazerParaFrente(estado, ABA_DA_TELA);
}

/**
 * Fecha uma aba de cadastro. Se ela estava na frente, volta a aba de onde ela foi pedida, ou a
 * tela, quando essa aba já fechou. A tela não fecha.
 */
export function fecharAba(estado: EstadoDasAbas, id: string): EstadoDasAbas {
  const aba = estado.abas.find((candidata) => candidata.id === id);
  if (aba?.tipo !== 'cadastro') return estado;
  const abas = estado.abas.filter((candidata) => candidata.id !== id);
  if (estado.frente !== id) return { ...estado, abas };
  const origemAberta = abas.some((candidata) => candidata.id === aba.origem);
  return { ...estado, abas, frente: origemAberta ? aba.origem : ABA_DA_TELA };
}

/**
 * Fecha a aba de um cadastro salvo e devolve a aba de origem e a chave do campo, para a casca
 * entregar o registro a ele. Sem a aba de origem aberta, não devolve origem.
 */
export function concluirAba(
  estado: EstadoDasAbas,
  id: string,
): { estado: EstadoDasAbas; origem?: string; chave?: string } {
  const aba = estado.abas.find((candidata) => candidata.id === id);
  if (aba?.tipo !== 'cadastro') return { estado };
  const fechado = fecharAba(estado, id);
  const origemAberta = fechado.abas.some((candidata) => candidata.id === aba.origem);
  return origemAberta
    ? { estado: fechado, origem: aba.origem, chave: aba.chave }
    : { estado: fechado, chave: aba.chave };
}
