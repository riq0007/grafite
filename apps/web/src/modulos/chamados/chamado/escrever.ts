// O campo de escrever do chamado aberto (spec modulo-chamados, "Campo de escrever" e "Chamado
// aberto"; change chamados-da-ti, design, "O campo de escrever (tarefa 5.12)"): quem o vê, a rota e o
// rótulo de cada envio, e a resposta pronta que entra onde está o cursor. O "Responder" do cabeçalho
// leva o foco à caixa pelo id.
import type { FichaDoChamado } from '../consultas.ts';

/** O id da caixa do campo de escrever, que o "Responder" foca. */
export const ID_DO_CAMPO_DE_ESCREVER = 'campo-de-escrever-do-chamado';

/** O que fica no pé do chamado: o campo, o "Reabra o chamado para escrever." ou nada. */
export type FormaDoCampo = 'escrever' | 'reabrir' | null;

/**
 * Só quem atende os locais do chamado escreve nele; no resolvido, quem atende vê o reabrir, e quem
 * só vê os chamados fica sem o campo.
 */
export function formaDoCampo({
  situacao,
  permite,
}: Pick<FichaDoChamado, 'situacao' | 'permite'>): FormaDoCampo {
  if (!permite.atender) return null;
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

/** A mensagem, com ou sem esperar a resposta, ou a nota, que ignora o "Esperar a resposta". */
export function envioDoCampo(modo: ModoDoCampo, esperar: boolean): EnvioDoCampo {
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
        rotulo: 'Enviar',
        carregando: 'Enviando',
        noErro: 'enviar a mensagem',
      };
}

/**
 * O texto com a resposta pronta onde está o cursor, no lugar da seleção, e o cursor depois dela. O
 * cursor fora do texto vai para o fim.
 */
export function inserirNoTexto(
  texto: string,
  inicio: number,
  fim: number,
  inserido: string,
): { texto: string; cursor: number } {
  const de = Math.min(Math.max(0, inicio), texto.length);
  const ate = Math.min(Math.max(de, fim), texto.length);
  return { texto: texto.slice(0, de) + inserido + texto.slice(ate), cursor: de + inserido.length };
}
