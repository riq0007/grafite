// As respostas prontas (spec chamados, "Respostas prontas"; change chamados-da-ti, tarefa 4.4): a
// conferência do cadastro, com as recusas da spec por campo. Os tipos em que a resposta aparece, a
// API os lê na transação: os Em uso e os Inativos da organização. O Rascunho fica de fora, porque o
// descartado deixaria a resposta presa a um tipo que não existe, e ela sumiria de todos os
// chamados. O rótulo repetido, quem acha é o índice único do banco; o limite de 100, a API, que
// conta as respostas depois da trava.
import { normalizarTexto } from '../texto.ts';

/** As respostas prontas de uma organização. */
export const MAXIMO_DE_RESPOSTAS_PRONTAS = 100;

export const MENSAGENS_DA_RESPOSTA_PRONTA = {
  rotulo: 'Escreva o rótulo.',
  rotuloLongo: 'Use até 60 caracteres.',
  /** A API a põe no rótulo quando a gravação bate no `respostas_prontas_rotulo_unico`. */
  rotuloRepetido: 'Já existe uma resposta pronta com esse rótulo.',
  texto: 'Escreva o texto.',
  textoLongo: 'Use até 2.000 caracteres.',
  tipos: 'Escolha os tipos da lista.',
  limite: 'A organização já tem 100 respostas prontas.',
  /** A ordem que a tela manda, com todas as respostas da organização. */
  ordem: 'A ordem precisa ter todas as respostas prontas, uma vez cada.',
  naoEncontrada: 'Resposta pronta não encontrada.',
} as const;

const LIMITE_DO_ROTULO = 60;
const LIMITE_DO_TEXTO = 2000;

/** A resposta como a tela a grava, com o formato conferido pelo esquema da rota. */
export interface PedidoDaRespostaPronta {
  rotulo: string;
  /** O `{nome}` vira o primeiro nome da pessoa do chamado. */
  texto: string;
  /** Ligado, mandar a resposta põe o chamado em Aguardando o colaborador. */
  esperaAResposta: boolean;
  /** Os tipos de chamado em que a resposta aparece; nenhum, ela aparece em todos. */
  tipos: readonly string[];
}

export interface ContextoDaRespostaPronta {
  /** Os ids dos tipos Em uso e Inativos da organização, em minúsculas, como o banco os devolve. */
  tiposDaLista: ReadonlySet<string>;
}

export interface RespostaProntaConferida {
  /** Numa linha, sem os espaços das pontas e com os repetidos juntados. */
  rotulo: string;
  /** Sem acento, em minúsculas e com espaços simples, para o rótulo único da organização. */
  rotuloNormalizado: string;
  /** Sem os espaços e as quebras das pontas; as de dentro ficam. */
  texto: string;
  esperaAResposta: boolean;
  /** Sem repetir, em minúsculas e em ordem, para a mesma escolha gravar sempre igual. */
  tipos: string[];
}

export type CampoDaRespostaPronta = 'rotulo' | 'texto' | 'tipos';

export type ConferenciaDaRespostaPronta =
  | { ok: true; resposta: RespostaProntaConferida }
  | { ok: false; erros: Partial<Record<CampoDaRespostaPronta, string>> };

/** O tamanho em caracteres, como o `length` do banco, e não em unidades do UTF-16. */
const caracteres = (texto: string) => [...texto].length;

/** Confere a resposta pelas recusas da spec, todas de uma vez e por campo. */
export function conferirRespostaPronta(
  pedido: PedidoDaRespostaPronta,
  contexto: ContextoDaRespostaPronta,
): ConferenciaDaRespostaPronta {
  const M = MENSAGENS_DA_RESPOSTA_PRONTA;
  const erros: Partial<Record<CampoDaRespostaPronta, string>> = {};

  const rotulo = pedido.rotulo.replace(/\s+/gu, ' ').trim();
  if (rotulo === '') erros.rotulo = M.rotulo;
  else if (caracteres(rotulo) > LIMITE_DO_ROTULO) erros.rotulo = M.rotuloLongo;

  const texto = pedido.texto.trim();
  if (texto === '') erros.texto = M.texto;
  else if (caracteres(texto) > LIMITE_DO_TEXTO) erros.texto = M.textoLongo;

  const tipos = [...new Set(pedido.tipos.map((tipo) => tipo.toLowerCase()))].sort();
  if (tipos.some((tipo) => !contexto.tiposDaLista.has(tipo))) erros.tipos = M.tipos;

  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    resposta: {
      rotulo,
      rotuloNormalizado: normalizarTexto(rotulo),
      texto,
      esperaAResposta: pedido.esperaAResposta,
      tipos,
    },
  };
}
