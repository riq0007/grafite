// As mensagens, as reações e as citações do chat (spec chat, "Mensagem", "Reações", "Notificações do
// chat" e "Chamado citado numa mensagem"; spec chamados, "Notificações dos chamados"; change
// chat-com-chamados, design, decisões 1 e 11): o que a mensagem e a reação aceitam, o começo do
// texto que as notificações e as citações mostram e os chamados citados com o "#".
import { lerTexto } from '../campos/textos.ts';

/** As espécies das mensagens do chat, com os textos do banco: a de uma conta e o evento. */
export const ESPECIES_DO_CHAT = ['mensagem', 'evento'] as const;
export type EspecieDoChat = (typeof ESPECIES_DO_CHAT)[number];

/** A mensagem: o texto, contado em caracteres sem os espaços das pontas, e os anexos. */
export const LIMITES_DA_MENSAGEM = { texto: 4000, anexos: 5 } as const;

/**
 * A mensagem que se manda: de 1 a 4.000 caracteres, sem os espaços das pontas e contados em
 * caracteres, e até 5 anexos. As recusas dos anexos, da conversa e da respondida são da API.
 */
export function conferirMensagem(pedido: {
  texto: string;
  anexos: number;
}): { ok: true; texto: string } | { ok: false; erro: string } {
  const lido = lerTexto(pedido.texto, LIMITES_DA_MENSAGEM.texto);
  if (!lido.ok) return { ok: false, erro: lido.erro };
  if (lido.valor === null) return { ok: false, erro: 'Escreva a mensagem.' };
  if (pedido.anexos > LIMITES_DA_MENSAGEM.anexos) {
    return { ok: false, erro: `Anexe até ${LIMITES_DA_MENSAGEM.anexos} arquivos.` };
  }
  return { ok: true, texto: lido.valor };
}

/** As reações que a tela oferece em botões, antes da escrita. */
export const REACOES_DE_SEMPRE = ['+1', 'ok', 'visto'] as const;

/** A reação: o texto, em caracteres sem os espaços das pontas, e os textos diferentes da mensagem. */
export const LIMITES_DA_REACAO = { texto: 20, textos: 10 } as const;

/**
 * A reação que a conta dá: um texto de 1 a 20 caracteres, sem os espaços das pontas, como os três
 * de sempre. Um texto novo só entra na mensagem que tem menos de 10 textos diferentes; o que já
 * está nela soma ou, da mesma conta, sai, e isso a API decide com a mensagem travada.
 */
export function conferirReacao(
  pedido: string,
  textosDaMensagem: readonly string[],
): { ok: true; texto: string } | { ok: false; erro: string } {
  const lido = lerTexto(pedido, LIMITES_DA_REACAO.texto);
  if (!lido.ok) return { ok: false, erro: lido.erro };
  if (lido.valor === null) return { ok: false, erro: 'Escreva a reação.' };
  const textos = new Set(textosDaMensagem);
  if (!textos.has(lido.valor) && textos.size >= LIMITES_DA_REACAO.textos) {
    return {
      ok: false,
      erro: `A mensagem já tem ${LIMITES_DA_REACAO.textos} reações diferentes.`,
    };
  }
  return { ok: true, texto: lido.valor };
}

/** O começo do texto, nas notificações e nas citações, em caracteres, com as reticências. */
export const LIMITE_DO_COMECO = 120;

/**
 * O começo do texto numa linha só: até 120 caracteres, com as reticências, cortado no fim da última
 * palavra que cabe. A palavra maior que o começo inteiro é cortada no meio. Os caracteres são
 * contados como na mensagem, e não nas unidades do UTF-16.
 */
export function comecoDoTexto(texto: string): string {
  const linha = texto.trim().replace(/\s+/g, ' ');
  const letras = [...linha];
  if (letras.length <= LIMITE_DO_COMECO) return linha;
  const cabe = letras.slice(0, LIMITE_DO_COMECO - 1).join('');
  const cortaNoEspaco = letras[LIMITE_DO_COMECO - 1] === ' ';
  const fimDaPalavra = cortaNoEspaco ? cabe.length : cabe.lastIndexOf(' ');
  const comeco = fimDaPalavra > 0 ? cabe.slice(0, fimDaPalavra) : cabe;
  return `${comeco.trimEnd()}…`;
}

/** Os chamados diferentes que uma mensagem cita, no máximo. */
export const LIMITE_DE_CITACOES = 10;

/** Uma citação no texto: o número e o trecho do "#", para a tela pôr o chip no lugar. */
export interface CitacaoDeChamado {
  numero: number;
  /** O índice do "#" no texto, em unidades do UTF-16, como o `slice` corta. */
  inicio: number;
  /** O índice logo depois do número. */
  fim: number;
}

// O "#" no começo do texto ou depois do que não é letra, número, sublinhado nem outro "#", e o
// número sem zero à esquerda, que cabe no número do chamado, sem letra, número ou sublinhado
// depois. O que vem antes é um grupo, e não o lookbehind, que o Safari só aceita a partir do 16.4:
// a expressão inválida derrubaria o módulo inteiro, e não só o chip.
const CITACAO = /(^|[^\p{L}\p{N}_#])#([1-9]\d{0,8})(?![\p{L}\p{N}_])/gu;

/**
 * As citações de chamados na mensagem, na ordem do texto: o "#" seguido do número, separado das
 * outras palavras, como em "a impressora já está no #1045". Valem os 10 primeiros números
 * diferentes, cada um em todas as vezes que aparece; os outros ficam como o texto escrito.
 */
export function citacoesDeChamados(texto: string): CitacaoDeChamado[] {
  const numeros = new Set<number>();
  const citacoes: CitacaoDeChamado[] = [];
  for (const achado of texto.matchAll(CITACAO)) {
    const numero = Number(achado[2]);
    if (!numeros.has(numero)) {
      if (numeros.size === LIMITE_DE_CITACOES) continue;
      numeros.add(numero);
    }
    const inicio = achado.index + (achado[1] ?? '').length;
    citacoes.push({ numero, inicio, fim: achado.index + achado[0].length });
  }
  return citacoes;
}
