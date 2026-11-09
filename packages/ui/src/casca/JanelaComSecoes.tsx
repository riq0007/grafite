import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icone } from '../icones/Icone.tsx';
import { TituloDaJanela } from './Casca.tsx';
import estilos from './JanelaComSecoes.module.css';
import { usePostura } from './postura.ts';

export interface SecaoDaJanela {
  /** Chave da seção na janela. */
  id: string;
  nome: string;
  icone: LucideIcon;
}

/** O que a janela dá ao link de uma seção, ou ao Voltar, para o roteador do app desenhar. */
export interface PropsDoLinkDaJanela {
  className?: string;
  'aria-current'?: 'page';
  children: ReactNode;
}

export interface PropsDaJanelaComSecoes<S extends SecaoDaJanela> {
  /** O nome da lista para o leitor de tela, como "Seções dos Ajustes". */
  rotulo: string;
  /** O título da janela, à vista sobre a lista no celular. */
  titulo: string;
  /** As seções, em grupos separados por uma linha. */
  grupos: readonly (readonly S[])[];
  /** A seção à vista, marcada na lista. */
  atual?: string;
  /** O endereço é o da janela, e não o de uma seção: no celular, a janela mostra só a lista. */
  naLista?: boolean;
  /** O link de uma seção, desenhado pelo roteador do app. */
  linkDaSecao: (secao: S, props: PropsDoLinkDaJanela) => ReactNode;
  /** O link de volta à lista, no celular. */
  linkDeVoltar: (props: PropsDoLinkDaJanela) => ReactNode;
  /** O conteúdo da seção à vista. */
  children: ReactNode;
}

/**
 * Uma janela com a lista de seções ao lado do conteúdo da seção escolhida, como os Ajustes do
 * Sistema do macOS. No celular, uma coisa de cada vez: no endereço da janela, só a lista; numa
 * seção, só ela, com Voltar para a lista.
 */
export function JanelaComSecoes<S extends SecaoDaJanela>({
  rotulo,
  titulo,
  grupos,
  atual,
  naLista = false,
  linkDaSecao,
  linkDeVoltar,
  children,
}: PropsDaJanelaComSecoes<S>) {
  const celular = usePostura() === 'celular';

  if (celular) {
    return naLista ? (
      <>
        <TituloDaJanela>{titulo}</TituloDaJanela>
        <ListaDeSecoes rotulo={rotulo} grupos={grupos} linkDaSecao={linkDaSecao} celular />
      </>
    ) : (
      <>
        {linkDeVoltar({
          className: estilos.voltar,
          children: (
            <>
              <Icone icone={ChevronLeft} />
              Voltar
            </>
          ),
        })}
        {children}
      </>
    );
  }

  return (
    <div className={estilos.janela}>
      <ListaDeSecoes rotulo={rotulo} grupos={grupos} atual={atual} linkDaSecao={linkDaSecao} />
      <div className={estilos.secao}>{children}</div>
    </div>
  );
}

interface PropsDaLista<S extends SecaoDaJanela>
  extends Pick<PropsDaJanelaComSecoes<S>, 'rotulo' | 'grupos' | 'atual' | 'linkDaSecao'> {
  /** No celular, cada seção é uma linha de toque, com a seta de que leva adiante. */
  celular?: boolean;
}

function ListaDeSecoes<S extends SecaoDaJanela>({
  rotulo,
  grupos,
  atual,
  linkDaSecao,
  celular = false,
}: PropsDaLista<S>) {
  return (
    <nav aria-label={rotulo} className={estilos.lista}>
      {grupos.map((grupo) => (
        <ul key={grupo[0]?.id}>
          {grupo.map((secao) => (
            <li key={secao.id}>
              {linkDaSecao(secao, {
                className: estilos.item,
                'aria-current': secao.id === atual ? 'page' : undefined,
                children: (
                  <>
                    <Icone icone={secao.icone} />
                    <span className={estilos.nome}>{secao.nome}</span>
                    {celular && <Icone icone={ChevronRight} />}
                  </>
                ),
              })}
            </li>
          ))}
        </ul>
      ))}
    </nav>
  );
}
