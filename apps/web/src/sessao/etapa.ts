// A etapa "Validando sessão" da chegada (spec chegada): consulta a sessão no servidor e termina em
// até 5 s, com ou sem resposta. A primeira tela, a casca ou a entrada, segue o estado da loja. Com o
// prazo do servidor, ela marca o começo da espera, e as etapas seguintes dividem os mesmos 5 s.
import type { EtapaDaChegada } from '../chegada/etapas.ts';
import type { PrazoDoServidor } from '../chegada/prazo.ts';
import type { LojaDaSessao } from './loja.ts';

export function etapaDaSessao(loja: LojaDaSessao, prazo?: PrazoDoServidor): EtapaDaChegada {
  return {
    rotulo: 'Validando sessão',
    pronta: () => {
      prazo?.comecar();
      return loja.validar();
    },
  };
}
