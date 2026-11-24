// A abertura pelo chat (spec chamados, "Abrir um chamado pelo chat"; change chat-com-chamados,
// design, decisão 8): o chat oferece os tipos em uso que aparecem para o colaborador e não são só
// da TI, pede o título, a pessoa de "No nome de" e, no tipo que pede o ativo, um dos sugeridos para
// a pessoa. O formulário do tipo não é pedido: a mensagem citada descreve o pedido. A API lê o tipo,
// a pessoa e os sugeridos; aqui ficam as recusas, todas juntas, cada uma no campo.
import { MENSAGEM_DA_PESSOA_INATIVA } from '../solicitacoes/solicitacoes.ts';
import type { SituacaoDoTipoDeChamado } from './tipo.ts';
import { conferirTituloDoChamado } from './titulo-e-resumo.ts';

export const MENSAGENS_DA_ABERTURA_PELO_CHAT = {
  semTipo: 'Escolha o tipo.',
  tipoIndisponivel: 'Esse tipo não está disponível para abrir pelo chat.',
  semAtivo: 'Escolha o ativo.',
  ativoForaDaLista: 'Escolha um ativo da lista.',
  semPessoa: 'Escolha a pessoa.',
  pessoaNaoEncontrada: 'Pessoa não encontrada.',
  mensagemNaoEncontrada: 'A mensagem não foi encontrada.',
  semMensagens: 'Escolha as mensagens.',
  mensagensDemais: 'Escolha até 20 mensagens.',
} as const;

const M = MENSAGENS_DA_ABERTURA_PELO_CHAT;

/** Quantas mensagens da mesma conversa um chamado cita, no máximo. */
export const MAXIMO_DE_MENSAGENS_NUM_CHAMADO = 20;

/**
 * A recusa da mensagem que já virou chamado, pelas linhas da origem: com uma mensagem, "Esta
 * mensagem"; com várias, "Uma das mensagens".
 */
export const jaVirouChamado = (numero: number, quantas = 1) =>
  quantas === 1
    ? `Esta mensagem já virou o chamado #${numero}.`
    : `Uma das mensagens já virou o chamado #${numero}.`;

/**
 * As mensagens a transformar num chamado (change andamento-e-varias-mensagens, design, decisão 6):
 * sem os ids repetidos, que valem um só também em maiúsculas, como o UUID que o banco devolve, e na
 * ordem dos ids, que é a da conversa e a das travas. Recusa sem nenhuma e com mais de 20.
 */
export function conferirMensagensATransformar(
  ids: readonly string[],
): { ok: true; ids: string[] } | { ok: false; recusa: string } {
  const unicos = [...new Set(ids.map((id) => id.toLowerCase()))].sort();
  if (unicos.length === 0) return { ok: false, recusa: M.semMensagens };
  if (unicos.length > MAXIMO_DE_MENSAGENS_NUM_CHAMADO) {
    return { ok: false, recusa: M.mensagensDemais };
  }
  return { ok: true, ids: unicos };
}

/** A recusa do tipo que pede o ativo sem nenhum sugerido para a pessoa. */
export const semAtivoSugerido = (pessoa: string) =>
  `Nenhum ativo desse tipo está com ${pessoa} ou no local dela. Escolha outro tipo ou escreva à TI.`;

/** O tipo como a abertura pelo chat o lê. */
export interface TipoParaAbrirPeloChat {
  situacao: SituacaoDoTipoDeChamado;
  apareceParaOColaborador: boolean;
  soATiAbre: boolean;
  /** "Pede o ativo": o primeiro campo Ativo é o ativo ligado. */
  pedeOAtivo: boolean;
}

/** O tipo aparece na abertura pelo chat (spec tipos-de-chamado, "Quem vê o tipo"). */
export const tipoAbrePeloChat = (
  tipo: Pick<TipoParaAbrirPeloChat, 'situacao' | 'apareceParaOColaborador' | 'soATiAbre'>,
) => tipo.situacao === 'em-uso' && tipo.apareceParaOColaborador && !tipo.soATiAbre;

export interface PedidoDaAberturaPeloChat {
  tipo: string | null;
  titulo: string;
  /** A pessoa de "No nome de". */
  pessoa: string | null;
  ativo: string | null;
}

export interface LidoParaAAberturaPeloChat {
  /** O tipo pedido, ou nulo, sem ele ou de outra organização. */
  tipo: TipoParaAbrirPeloChat | null;
  /** A pessoa pedida, ou nula, sem ela ou de outra organização. */
  pessoa: { nome: string; ativa: boolean } | null;
  /** Os ativos sugeridos para a pessoa, pelos tipos do primeiro campo Ativo; nulo sem a pessoa. */
  sugeridos: readonly string[] | null;
}

/**
 * Confere a abertura pelo chat. O tipo que não existe recusa como o indisponível; o ativo só é
 * conferido no tipo que o pede e com a pessoa aceita, porque os sugeridos seguem a pessoa, e o tipo
 * que não o pede não leva ativo.
 */
export function conferirAberturaPeloChat(
  pedido: PedidoDaAberturaPeloChat,
  lido: LidoParaAAberturaPeloChat,
):
  | { ok: true; titulo: string; ativo: string | null }
  | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  if (pedido.tipo === null) erros.tipo = M.semTipo;
  else if (!lido.tipo || !tipoAbrePeloChat(lido.tipo)) erros.tipo = M.tipoIndisponivel;

  const titulo = conferirTituloDoChamado(pedido.titulo);
  if (!titulo.ok) erros.titulo = titulo.erro;

  if (pedido.pessoa === null) erros.pessoa = M.semPessoa;
  else if (!lido.pessoa) erros.pessoa = M.pessoaNaoEncontrada;
  else if (!lido.pessoa.ativa) erros.pessoa = MENSAGEM_DA_PESSOA_INATIVA;

  const pedeOAtivo = erros.tipo === undefined && lido.tipo?.pedeOAtivo === true;
  if (pedeOAtivo && erros.pessoa === undefined && lido.pessoa && lido.sugeridos) {
    if (lido.sugeridos.length === 0) erros.ativo = semAtivoSugerido(lido.pessoa.nome);
    else if (pedido.ativo === null) erros.ativo = M.semAtivo;
    else if (!lido.sugeridos.includes(pedido.ativo)) erros.ativo = M.ativoForaDaLista;
  }

  if (Object.keys(erros).length > 0 || !titulo.ok) return { ok: false, erros };
  return { ok: true, titulo: titulo.titulo, ativo: pedeOAtivo ? pedido.ativo : null };
}
