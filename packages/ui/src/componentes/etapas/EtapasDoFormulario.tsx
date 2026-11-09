import { type KeyboardEvent, type ReactNode, useId, useLayoutEffect, useRef } from 'react';
import { useFocusRing } from 'react-aria';
import estilos from './EtapasDoFormulario.module.css';

export interface EtapaDoFormulario {
  id: string;
  nome: string;
  /** Como a etapa está, em texto, como "Falta: IP", "Preenchida" ou "Opcional". */
  situacao: string;
  /** "atencao" pinta a situação, que já diz em texto o que falta. */
  tom?: 'normal' | 'atencao';
  /** Por que a etapa ainda não abre, como "Escolha o tipo antes": ela fica apagada. */
  motivo?: string;
}

export interface PropsDasEtapasDoFormulario {
  /** O nome da lista para o leitor de tela, como "Etapas do cadastro". */
  rotulo: string;
  etapas: readonly EtapaDoFormulario[];
  /** O id da etapa aberta. */
  atual: string;
  aoEscolher: (id: string) => void;
  /**
   * As etapas numeradas, como "3 · Identificação", e a atual anunciada como a etapa atual; sem a
   * numeração, como nos grupos de uma ficha, a atual é anunciada como a atual da lista.
   */
  numerar?: boolean;
  /** O que fica embaixo da lista, como a situação do rascunho. */
  rodape?: ReactNode;
  /** O painel da etapa aberta. */
  children: ReactNode;
}

/**
 * As etapas de um formulário longo (spec componentes-base, "Etapas de um formulário"; change
 * cadastro-em-etapas, decisão 3): a lista empilhada à esquerda e o painel da etapa aberta à direita.
 * A atual é marcada pela forma e anunciada; o Tab chega só a ela, as setas andam entre as etapas, e o
 * Enter e o espaço abrem a escolhida. A etapa sem a escolha fica apagada, com o motivo em texto, e
 * focável, para o leitor de tela ler o motivo. Na janela estreita, a lista vira uma faixa que rola.
 */
export function EtapasDoFormulario({
  rotulo,
  etapas,
  atual,
  aoEscolher,
  numerar = true,
  rodape,
  children,
}: PropsDasEtapasDoFormulario) {
  const lista = useRef<HTMLOListElement>(null);

  // Na faixa, a etapa atual fica à vista, sem rolar a página.
  useLayoutEffect(() => {
    const faixa = lista.current;
    const daAtual = faixa?.querySelector<HTMLElement>(`[data-etapa="${CSS.escape(atual)}"]`);
    if (!faixa || !daAtual || faixa.scrollWidth <= faixa.clientWidth) return;
    const inicio = daAtual.offsetLeft - faixa.offsetLeft;
    const fim = inicio + daAtual.offsetWidth;
    if (inicio < faixa.scrollLeft) faixa.scrollLeft = inicio;
    else if (fim > faixa.scrollLeft + faixa.clientWidth) faixa.scrollLeft = fim - faixa.clientWidth;
  }, [atual]);

  const aoTeclar = (evento: KeyboardEvent<HTMLOListElement>) => {
    const botoes = [...(lista.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    const posicao = botoes.indexOf(document.activeElement as HTMLElement);
    if (posicao < 0) return;
    const destino =
      evento.key === 'ArrowDown' || evento.key === 'ArrowRight'
        ? Math.min(posicao + 1, botoes.length - 1)
        : evento.key === 'ArrowUp' || evento.key === 'ArrowLeft'
          ? Math.max(posicao - 1, 0)
          : evento.key === 'Home'
            ? 0
            : evento.key === 'End'
              ? botoes.length - 1
              : null;
    if (destino === null) return;
    evento.preventDefault();
    botoes[destino]?.focus();
  };

  return (
    <div className={estilos.formulario}>
      <div className={estilos.grade}>
        <div className={estilos.coluna}>
          <nav aria-label={rotulo}>
            {/* As setas andam pelos botões da lista, que só tem um ponto de Tab. */}
            <ol ref={lista} className={estilos.lista} onKeyDown={aoTeclar}>
              {etapas.map((etapa, indice) => (
                <li key={etapa.id} className={estilos.item}>
                  <Etapa
                    etapa={etapa}
                    nome={numerar ? `${indice + 1} · ${etapa.nome}` : etapa.nome}
                    atual={etapa.id === atual}
                    marca={numerar ? 'step' : 'true'}
                    aoEscolher={aoEscolher}
                  />
                </li>
              ))}
            </ol>
          </nav>
          {rodape && <div className={estilos.rodape}>{rodape}</div>}
        </div>
        <div className={estilos.painel}>{children}</div>
      </div>
    </div>
  );
}

function Etapa({
  etapa,
  nome,
  atual,
  marca,
  aoEscolher,
}: {
  etapa: EtapaDoFormulario;
  nome: string;
  atual: boolean;
  marca: 'step' | 'true';
  aoEscolher: (id: string) => void;
}) {
  const prefixo = useId();
  const { focusProps, isFocusVisible } = useFocusRing();
  const semAEscolha = etapa.motivo !== undefined;
  const texto = semAEscolha ? etapa.motivo : etapa.situacao;
  return (
    <button
      {...focusProps}
      type="button"
      className={estilos.etapa}
      tabIndex={atual ? 0 : -1}
      aria-current={atual ? marca : undefined}
      aria-disabled={semAEscolha || undefined}
      aria-labelledby={`${prefixo}-nome`}
      aria-describedby={texto ? `${prefixo}-situacao` : undefined}
      data-etapa={etapa.id}
      data-atual={atual || undefined}
      data-focus-visible={isFocusVisible || undefined}
      onClick={() => {
        if (!semAEscolha && !atual) aoEscolher(etapa.id);
      }}
    >
      <span id={`${prefixo}-nome`} className={estilos.nome}>
        {nome}
      </span>
      {texto && (
        <span
          id={`${prefixo}-situacao`}
          className={estilos.situacao}
          data-tom={!semAEscolha && etapa.tom === 'atencao' ? 'atencao' : undefined}
        >
          {texto}
        </span>
      )}
    </button>
  );
}
