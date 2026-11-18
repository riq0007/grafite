// A busca da pessoa dos chamados na escolha da conta (change chamados-da-ti, design, decisão 18, "A
// busca da pessoa (tarefa 4.22)", e decisão 21): o "Quem pediu" da gaveta da abertura e o campo
// Pessoa do formulário. Cada pessoa aparece com o local, para os homônimos, e quem usa lê o nome
// dela sem o local, que a resposta e as sugestões citam.
import { useCallback, useRef } from 'react';
import { useApi } from '../../../api/useApi.tsx';
import type {
  ContaDoSeletor,
  ResultadoDoSeletor,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { buscarPessoas } from './buscas.ts';
import type { QuemPreenche } from './estado.ts';

export function useBuscaDaPessoa(quem: QuemPreenche) {
  const api = useApi();
  // O nome de cada pessoa que a lista mostrou.
  const nomes = useRef(new Map<string, string>());
  const buscar = useCallback(
    async (texto: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const achadas = await buscarPessoas(api, quem, texto, sinal);
      for (const pessoa of achadas.itens) nomes.current.set(pessoa.id, pessoa.nome);
      return {
        itens: achadas.itens.map((pessoa) => ({
          id: pessoa.id,
          rotulo: pessoa.local ? `${pessoa.nome} · ${pessoa.local}` : pessoa.nome,
        })),
        total: achadas.total,
      };
    },
    [api, quem],
  );
  /** O nome da pessoa escolhida, sem o local. */
  const nomeDa = useCallback(
    (escolhida: ContaDoSeletor) => nomes.current.get(escolhida.id) ?? escolhida.rotulo,
    [],
  );
  return { buscar, nomeDa };
}
