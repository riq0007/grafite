// O pedido do ativo, montado do que o formulário tem (spec cadastro-de-ativos; change
// cadastro-em-etapas, design, decisão 1): a ficha e o cadastro em etapas leem cada valor pelo motor
// de campos, com as mesmas recusas da API, e mandam só o que mudou; no cadastro, o que foi preenchido.
import {
  type CamposDoAtivo,
  CHAVE_DO_MODELO,
  conferirValoresDoAtivo,
  type ValorDeCampo,
} from '@grafite/domain';
import type { EntradaDoCampo } from './CampoDoAtivo.tsx';

/**
 * O que o formulário envia: só o que mudou, no cadastro tudo o que foi preenchido. Sem valores ou
 * sem travas mudadas, a parte não vai.
 */
export interface PedidoDoAtivo {
  modeloId?: string | null;
  valores?: Record<string, EntradaDoCampo>;
  travas?: Record<string, boolean>;
}

export const entradaVazia = (entrada: EntradaDoCampo) =>
  entrada === null || entrada === '' || (Array.isArray(entrada) && entrada.length === 0);

export const entradasIguais = (a: EntradaDoCampo, b: EntradaDoCampo | undefined) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((item, posicao) => item === b[posicao])
    : a === b;

export type MontagemDoPedido =
  | { ok: true; pedido: PedidoDoAtivo }
  | { ok: false; erros: Record<string, string> };

/**
 * O pedido do formulário, conferido pelo domínio. Na ficha, só as chaves que mudaram desde as
 * iniciais; no cadastro (`ficha` nula), as preenchidas, com os obrigatórios cobrados.
 */
export function montarPedidoDoAtivo({
  definicoes,
  entradas,
  iniciais,
  travas,
  travasIniciais,
  modeloId,
  ficha,
}: {
  definicoes: CamposDoAtivo;
  entradas: Readonly<Record<string, EntradaDoCampo>>;
  iniciais: Readonly<Record<string, EntradaDoCampo>>;
  travas: Readonly<Record<string, boolean>>;
  travasIniciais: Readonly<Record<string, boolean>>;
  modeloId: string | null;
  ficha: { valores: Readonly<Record<string, unknown>>; modeloId: string | null } | null;
}): MontagemDoPedido {
  const alteradas = Object.fromEntries(
    Object.entries(entradas).filter(([chave, entrada]) =>
      ficha ? !entradasIguais(entrada, iniciais[chave]) : !entradaVazia(entrada),
    ),
  );
  const conferida = conferirValoresDoAtivo({
    campos: definicoes,
    atuais: (ficha?.valores ?? {}) as Record<string, ValorDeCampo>,
    pedidos: alteradas,
    cadastro: !ficha,
  });
  if (!conferida.ok) return { ok: false, erros: conferida.erros };
  const travasMudadas = Object.fromEntries(
    Object.entries(travas).filter(
      ([chave, travado]) => (travasIniciais[chave] ?? false) !== travado,
    ),
  );
  const modeloMudou = ficha ? modeloId !== ficha.modeloId : modeloId !== null;
  return {
    ok: true,
    pedido: {
      ...(modeloMudou ? { modeloId } : {}),
      ...(Object.keys(alteradas).length > 0 ? { valores: alteradas } : {}),
      ...(Object.keys(travasMudadas).length > 0 ? { travas: travasMudadas } : {}),
    },
  };
}

/** As recusas da API pela chave do campo do formulário: ela diz `valores.<chave>` e `modeloId`. */
export function errosDaRecusa(
  campos: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(campos).map(([chave, motivo]) => [
      chave === 'modeloId' ? CHAVE_DO_MODELO : chave.replace(/^valores\./, ''),
      motivo ?? '',
    ]),
  );
}
