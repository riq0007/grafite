import { useId } from 'react';
import { Botao } from '../botao/Botao.tsx';
import type { MudancaNoHistorico } from '../historico/ListaDoHistorico.tsx';
import { RotuloDeSituacao, type Situacao } from '../situacao/RotuloDeSituacao.tsx';
import estilos from './PreviaDaImportacao.module.css';

/** Uma linha da planilha na prévia, já com os textos que a tela mostra. */
export interface LinhaDaPrevia {
  /** O número da linha na planilha, contando a dos títulos. */
  linha: number;
  /** O que a linha faz, em texto, como "Alterar", e a situação que dá o tom. */
  acao: { rotulo: string; situacao: Situacao };
  /** O ativo casado, pelo nome e pelo patrimônio. */
  ativo?: string | null;
  /** Cada campo que muda, pelo rótulo e pelo valor mostrado; o vazio é `null`. */
  mudancas: readonly MudancaNoHistorico[];
  /** Os campos que a planilha mudaria e que ficam como estão, com o motivo, como "Travado". */
  seguros: readonly { campo: string; motivo: string }[];
  /** As recusas, pelo campo, ou da linha inteira, com `campo` nulo. */
  erros: readonly { campo: string | null; mensagem: string }[];
}

export interface PropsDaPreviaDaImportacao {
  /** O nome da lista para o leitor de tela, como "Prévia da importação". */
  rotulo: string;
  linhas: readonly LinhaDaPrevia[];
  /** O texto sem nenhuma linha. */
  vazio?: string;
  /** Com mais linhas, "Carregar mais" depois da lista. */
  aoCarregarMais?: () => void;
  /** A próxima página está a caminho. */
  carregandoMais?: boolean;
}

const VAZIO = '—';

/** Os campos seguros agrupados pelo motivo, na ordem em que aparecem. */
function porMotivo(seguros: LinhaDaPrevia['seguros']): [string, string[]][] {
  const grupos = new Map<string, string[]>();
  for (const { campo, motivo } of seguros)
    grupos.set(motivo, [...(grupos.get(motivo) ?? []), campo]);
  return [...grupos];
}

/**
 * A prévia de uma importação (design do P1e, decisão 9), linha a linha: o número da linha na
 * planilha, a ação em texto, o ativo casado, cada campo "Campo: antes → depois" (com "—" no vazio),
 * os campos que a trava e o só manual seguram, e os erros, pelo campo. "Carregar mais" no fim. Ela
 * também mostra as linhas com erro do resultado, só com os erros.
 */
export function PreviaDaImportacao({
  rotulo,
  linhas,
  vazio = 'Nenhuma linha.',
  aoCarregarMais,
  carregandoMais = false,
}: PropsDaPreviaDaImportacao) {
  const id = useId();
  if (linhas.length === 0) return <p className={estilos.vazio}>{vazio}</p>;
  return (
    <div className={estilos.previa}>
      <ul aria-label={rotulo} className={estilos.lista}>
        {linhas.map((item) => (
          <li
            key={item.linha}
            aria-labelledby={`${id}-linha-${item.linha}`}
            className={estilos.linha}
          >
            <p className={estilos.cabecalho}>
              <span id={`${id}-linha-${item.linha}`} className={estilos.numero}>
                Linha {item.linha}
              </span>
              <RotuloDeSituacao situacao={item.acao.situacao}>{item.acao.rotulo}</RotuloDeSituacao>
              {item.ativo && <span className={estilos.ativo}>{item.ativo}</span>}
            </p>
            {item.mudancas.length > 0 && (
              <ul className={estilos.mudancas}>
                {item.mudancas.map((mudanca) => (
                  <li key={mudanca.campo}>
                    <span className={estilos.campo}>{mudanca.campo}:</span> {mudanca.antes ?? VAZIO}{' '}
                    → {mudanca.depois ?? VAZIO}
                  </li>
                ))}
              </ul>
            )}
            {porMotivo(item.seguros).map(([motivo, campos]) => (
              <p key={motivo} className={estilos.seguros}>
                {motivo}: {campos.join(', ')}
              </p>
            ))}
            {item.erros.length > 0 && (
              <ul className={estilos.erros}>
                {item.erros.map((erro) => (
                  <li key={`${erro.campo ?? ''}:${erro.mensagem}`}>
                    {erro.campo && <span className={estilos.campoDoErro}>{erro.campo}: </span>}
                    {erro.mensagem}
                  </li>
                ))}
              </ul>
            )}
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
