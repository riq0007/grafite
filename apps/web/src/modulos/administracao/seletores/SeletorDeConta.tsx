import { BuscaComSugestoes, type SugeridasDaBusca } from '@grafite/ui';
import { useEffect, useState } from 'react';

export interface ContaDoSeletor {
  id: string;
  /** Como a conta aparece, como "Ana Souza". */
  rotulo: string;
}

/** O que a busca acha: as contas e, quando a API diz, o total e as sugeridas pelo contexto. */
export interface ResultadoDoSeletor {
  itens: ContaDoSeletor[];
  /** Quantas a busca acha na API, para o rodapé "Digite para buscar entre N". */
  total?: number;
  sugeridas?: SugeridasDaBusca;
}

export interface PropsDoSeletorDeConta {
  rotulo: string;
  /** A conta escolhida, com o rótulo dela, ou `null`. */
  valor: ContaDoSeletor | null;
  aoMudar: (conta: ContaDoSeletor | null) => void;
  /**
   * Busca as contas pelo texto, na API de quem usa (as do filtro da auditoria, os membros de um
   * grupo); com o texto vazio, as primeiras. O sinal aborta a busca quando o texto muda. A função
   * fica a mesma entre as renderizações.
   */
  buscar: (texto: string, sinal: AbortSignal) => Promise<ContaDoSeletor[] | ResultadoDoSeletor>;
  descricao?: string;
  obrigatorio?: boolean;
  erro?: string;
}

/**
 * A escolha de uma conta entre as que a API devolve (design do F2b, decisão 15, e do
 * escolhas-a-vista, decisão 4): só entre as sugestões, sem filtrar de novo o que chega. Sem o
 * texto, ela já busca as primeiras, para a lista abrir pelo clique com as opções à vista.
 *
 * O texto do campo é controlado aqui: a conta que chega de fora, como a criada numa aba, troca o
 * texto mesmo com o foco no campo, o que o React Aria não faz sozinho depois de uma escolha
 * (change p4a-fornecedores).
 */
export function SeletorDeConta({
  rotulo,
  valor,
  aoMudar,
  buscar,
  descricao,
  obrigatorio,
  erro,
}: PropsDoSeletorDeConta) {
  const [texto, definirTexto] = useState(valor?.rotulo ?? '');
  // A conta escolhida mudou, por uma escolha ou de fora: o campo passa a mostrar o rótulo dela.
  const [ultimo, definirUltimo] = useState(valor);
  if (valor?.id !== ultimo?.id || valor?.rotulo !== ultimo?.rotulo) {
    definirUltimo(valor);
    definirTexto(valor?.rotulo ?? '');
  }
  const [achado, definirAchado] = useState<ResultadoDoSeletor>({ itens: [] });
  const [falha, definirFalha] = useState<string | null>(null);

  useEffect(() => {
    const busca = texto.trim();
    // Com o texto da conta escolhida, a busca é a das primeiras, como sem o texto.
    const termo = busca === valor?.rotulo ? '' : busca;
    const controle = new AbortController();
    buscar(termo, controle.signal).then(
      (resultado) => {
        if (controle.signal.aborted) return;
        definirAchado(Array.isArray(resultado) ? { itens: resultado } : resultado);
        definirFalha(null);
      },
      (motivo: unknown) => {
        if (controle.signal.aborted) return;
        definirFalha(
          motivo instanceof Error ? motivo.message : 'Não foi possível buscar as contas.',
        );
      },
    );
    return () => controle.abort();
  }, [texto, buscar, valor?.rotulo]);

  const encontradas = achado.itens;
  // A escolhida fica entre as sugestões, para o campo mostrar o rótulo dela.
  const contas =
    valor && !encontradas.some((conta) => conta.id === valor.id)
      ? [valor, ...encontradas]
      : encontradas;
  return (
    <BuscaComSugestoes
      rotulo={rotulo}
      sugestoes={contas}
      sugestoesDeFora
      total={achado.total}
      sugeridas={achado.sugeridas}
      aceitaTextoLivre={false}
      selectedKey={valor?.id ?? null}
      onSelectionChange={(chave) =>
        aoMudar(chave === null ? null : (contas.find((conta) => conta.id === chave) ?? null))
      }
      inputValue={texto}
      onInputChange={definirTexto}
      descricao={descricao}
      obrigatorio={obrigatorio}
      erro={erro ?? falha ?? undefined}
    />
  );
}
