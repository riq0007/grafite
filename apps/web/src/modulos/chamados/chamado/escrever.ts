// O campo de escrever do chamado aberto (spec modulo-chamados, "Campo de escrever", "Chamado aberto"
// e "Chamado fechado na tela"; change chamados-da-ti, design, "O campo de escrever (tarefa 5.12)";
// change chat-com-chamados, design, decisão 15, tarefa 4.13): quem o vê, a rota e o rótulo de cada
// envio, a ajuda do chat, o "/ativo" que o campo lê e a resposta pronta que entra onde está o
// cursor. O "Responder" do cabeçalho leva o foco à caixa pelo id.
import { type ComandoDoAtivo, comandoDoAtivo } from '@grafite/domain';
import type { FichaDoChamado } from '../consultas.ts';

/** O id da caixa do campo de escrever, que o "Responder" foca. */
export const ID_DO_CAMPO_DE_ESCREVER = 'campo-de-escrever-do-chamado';

/**
 * O que fica no pé do chamado: o campo, o "Reabra o chamado para escrever.", o "O chamado fechou em
 * 18/11." ou nada.
 */
export type FormaDoCampo = 'escrever' | 'reabrir' | 'fechado' | null;

/**
 * Só quem atende os locais do chamado escreve nele; no resolvido, quem atende vê o reabrir, no
 * fechado, que nada reabre, a frase sem ação, e quem só vê os chamados fica sem o campo.
 */
export function formaDoCampo({
  situacao,
  fechado,
  permite,
}: Pick<FichaDoChamado, 'situacao' | 'fechado' | 'permite'>): FormaDoCampo {
  if (!permite.atender) return null;
  if (fechado) return 'fechado';
  return situacao === 'resolvido' ? 'reabrir' : 'escrever';
}

/** A chave do campo: a mensagem para a pessoa ou a nota interna. */
export type ModoDoCampo = 'mensagem' | 'nota';

/** A rota da conversa de cada envio, o rótulo do botão, o do botão esperando e o do erro. */
export interface EnvioDoCampo {
  rota: '/chamados/{numero}/mensagem' | '/chamados/{numero}/esperar' | '/chamados/{numero}/nota';
  rotulo: string;
  carregando: string;
  /** O que o envio tentava, para a frase do erro do servidor ("Não foi possível …"). */
  noErro: string;
}

/**
 * A mensagem, com ou sem esperar a resposta, ou a nota, que ignora o "Esperar a resposta". O botão
 * da mensagem diz o primeiro nome da pessoa, como "Enviar para Fernanda".
 */
export function envioDoCampo(modo: ModoDoCampo, esperar: boolean, pessoa: string): EnvioDoCampo {
  if (modo === 'nota') {
    return {
      rota: '/chamados/{numero}/nota',
      rotulo: 'Salvar a nota',
      carregando: 'Salvando a nota',
      noErro: 'salvar a nota',
    };
  }
  return esperar
    ? {
        rota: '/chamados/{numero}/esperar',
        rotulo: 'Enviar e esperar a resposta',
        carregando: 'Enviando',
        noErro: 'enviar a mensagem',
      }
    : {
        rota: '/chamados/{numero}/mensagem',
        rotulo: `Enviar para ${pessoa}`,
        carregando: 'Enviando',
        noErro: 'enviar a mensagem',
      };
}

/** A ajuda da mensagem: onde a pessoa a lê, pelo primeiro nome. */
export function ajudaDoCampo(pessoa: string, usaOChat: boolean): string {
  return usaOChat
    ? `${pessoa} vê esta mensagem no chat.`
    : `${pessoa} ainda não usa o chat: a mensagem fica no chamado.`;
}

/**
 * O "/ativo" que o campo lê depois da pausa na escrita: o com o patrimônio e o sozinho com a linha
 * dele acabada. O sozinho na última linha ainda pode ganhar o patrimônio, e o envio o lê.
 */
export function comandoParaLer(texto: string): ComandoDoAtivo | null {
  const comando = comandoDoAtivo(texto);
  if (comando === null) return null;
  return comando.patrimonio !== null || !comando.naUltimaLinha ? comando : null;
}

/** A frase do "/ativo" cujo ativo a conta não acha, embaixo do campo. */
export function ativoNaoEncontrado(patrimonio: string | null): string {
  return patrimonio === null
    ? 'O ativo não foi encontrado.'
    : `O ativo ${patrimonio} não foi encontrado.`;
}

/** A frase do "/ativo" sozinho no chamado sem o ativo ligado. */
export const SEM_O_ATIVO_LIGADO = 'O chamado não tem um ativo ligado.';

/** O caractere que separa a resposta pronta do texto: o espaço e a quebra de linha. */
const SEPARA = /\s/;

/**
 * O texto com a resposta pronta onde está o cursor, no lugar da seleção, e o cursor depois dela. O
 * cursor fora do texto vai para o fim. Colada no texto, ela entra numa linha dela: a quebra antes,
 * quando o de antes não acaba em espaço nem em quebra, e depois, quando o de depois não começa
 * neles; o cursor fica no fim da resposta.
 */
export function inserirNoTexto(
  texto: string,
  inicio: number,
  fim: number,
  inserido: string,
): { texto: string; cursor: number } {
  const de = Math.min(Math.max(0, inicio), texto.length);
  const ate = Math.min(Math.max(de, fim), texto.length);
  const antes = texto.slice(0, de);
  const depois = texto.slice(ate);
  const quebraAntes = antes !== '' && !SEPARA.test(antes.at(-1) ?? '') ? '\n' : '';
  const quebraDepois = depois !== '' && !SEPARA.test(depois[0] ?? '') ? '\n' : '';
  return {
    texto: antes + quebraAntes + inserido + quebraDepois + depois,
    cursor: de + quebraAntes.length + inserido.length,
  };
}
