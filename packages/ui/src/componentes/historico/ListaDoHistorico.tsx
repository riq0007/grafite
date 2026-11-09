import type { ReactNode } from 'react';
import { useDataHora } from '../../regiao/ProvedorDaRegiao.tsx';
import { Botao } from '../botao/Botao.tsx';
import estilos from './ListaDoHistorico.module.css';

/** Um campo que mudou, pelo rótulo e pelo valor mostrado; o vazio é `null`. */
export interface MudancaNoHistorico {
  campo: string;
  antes: string | null;
  depois: string | null;
}

/** Um registro do histórico, já com o texto da ação e o nome de quem fez. */
export interface ItemDaListaDoHistorico {
  id: string;
  /** O texto da ação, como "Ativo alterado". */
  acao: string;
  /** Quem fez, pelo nome atual. */
  quem: string;
  momento: Date;
  mudancas?: readonly MudancaNoHistorico[];
  /** Os rótulos dos campos travados e destravados no registro. */
  travas?: { ligadas: readonly string[]; desligadas: readonly string[] };
  /** O que mais o registro diz, como o outro ativo de uma ligação. */
  detalhe?: ReactNode;
}

export interface PropsDaListaDoHistorico {
  /** O nome da lista para o leitor de tela, como "Histórico do ativo". */
  rotulo: string;
  itens: readonly ItemDaListaDoHistorico[];
  /** O texto sem nenhum registro. */
  vazio?: string;
  /** Com mais registros, "Carregar mais" depois da lista. */
  aoCarregarMais?: () => void;
  /** A próxima página está a caminho. */
  carregandoMais?: boolean;
}

const VAZIO = '—';

/**
 * O histórico de um registro (design do P1d, decisão 8), do mais novo para o mais antigo: cada
 * registro com a ação, quando, quem fez, cada campo que mudou ("Local: A → B", com "—" no vazio),
 * as travas e um detalhe livre, e "Carregar mais" no fim. Ela não sabe de que registro é: serve ao
 * ativo e, depois, à pessoa e aos outros.
 */
export function ListaDoHistorico({
  rotulo,
  itens,
  vazio = 'Nenhum registro.',
  aoCarregarMais,
  carregandoMais = false,
}: PropsDaListaDoHistorico) {
  const { formatarDataEHora } = useDataHora();
  if (itens.length === 0) return <p className={estilos.vazio}>{vazio}</p>;
  return (
    <div className={estilos.historico}>
      <ul aria-label={rotulo} className={estilos.lista}>
        {itens.map((item) => (
          <li key={item.id} className={estilos.registro}>
            <p className={estilos.acao}>{item.acao}</p>
            <p className={estilos.quando}>
              {formatarDataEHora(item.momento)} · {item.quem}
            </p>
            {item.mudancas && item.mudancas.length > 0 && (
              <ul className={estilos.mudancas}>
                {item.mudancas.map((mudanca) => (
                  <li key={mudanca.campo}>
                    <span className={estilos.campo}>{mudanca.campo}:</span> {mudanca.antes ?? VAZIO}{' '}
                    → {mudanca.depois ?? VAZIO}
                  </li>
                ))}
              </ul>
            )}
            {item.travas && item.travas.ligadas.length > 0 && (
              <p className={estilos.travas}>Travado: {item.travas.ligadas.join(', ')}</p>
            )}
            {item.travas && item.travas.desligadas.length > 0 && (
              <p className={estilos.travas}>Destravado: {item.travas.desligadas.join(', ')}</p>
            )}
            {item.detalhe && <div className={estilos.detalhe}>{item.detalhe}</div>}
          </li>
        ))}
      </ul>
      {aoCarregarMais && (
        <div>
          <Botao carregando={carregandoMais} rotuloCarregando="Carregando" onPress={aoCarregarMais}>
            Carregar mais
          </Botao>
        </div>
      )}
    </div>
  );
}
