import { type ReactNode, type Ref, useCallback, useEffect, useId, useRef } from 'react';
import estilos from './Administracao.module.css';

export interface PropsDaParte {
  titulo: string;
  /** O título, para quem leva o foco a ele, como depois de uma ação que some com o botão dela. */
  refDoTitulo?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}

/** Uma parte de uma aba da ficha, como a conta na aba Acesso: o título e o conteúdo dela. */
export function Parte({ titulo, refDoTitulo, children }: PropsDaParte) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={estilos.parte}>
      <h2
        id={id}
        ref={refDoTitulo}
        tabIndex={refDoTitulo ? -1 : undefined}
        className={estilos.tituloDaParte}
      >
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/**
 * O foco de uma ação que some com o botão dela, como "Encerrar" num item que sai da lista: quem
 * age chama `pedirFoco()`, e, quando os `dados` mudam, o foco perdido vai para `focar`.
 */
export function useFocoPerdido(dados: unknown, focar: () => void) {
  const pendente = useRef(false);
  const focarAgora = useRef(focar);
  focarAgora.current = focar;
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda a cada mudança dos dados.
  useEffect(() => {
    if (!pendente.current) return;
    pendente.current = false;
    if (document.activeElement === document.body) focarAgora.current();
  }, [dados]);
  return useCallback(() => {
    pendente.current = true;
  }, []);
}

/** O `useFocoPerdido` que leva o foco ao título da parte. */
export function useFocoNoTitulo(dados: unknown) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const pedirFoco = useFocoPerdido(dados, () => titulo.current?.focus());
  return { titulo, pedirFoco };
}
