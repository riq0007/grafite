import { type CSSProperties, useRef } from 'react';
import estilos from './Aba.module.css';
import { AbaFechada } from './AbaFechada.tsx';
import { medidasDaAbaFechada, useAparencia } from './aparencia.ts';
import { useFormaInformada } from './forma.ts';

// A aba dos colaboradores (spec aba-dos-colaboradores), na janela transparente do lado nativo, que
// fica no alto e no meio da tela principal. O painel, o aviso e a tela maior entram nas tarefas da
// tela seguintes.
export function Aba() {
  const aparencia = useAparencia();
  const forma = useRef<HTMLButtonElement>(null);
  const medidas = aparencia ? medidasDaAbaFechada(aparencia) : null;
  useFormaInformada(forma, `${aparencia?.forma} ${medidas?.compacta} ${medidas?.topo}`);
  if (!aparencia || !medidas) return <div data-aba="" />;
  return (
    <div
      data-aba=""
      className={estilos.raiz}
      style={{ '--topo': `${medidas.topo}px` } as CSSProperties}
    >
      <AbaFechada ref={forma} forma={aparencia.forma} compacta={medidas.compacta} />
    </div>
  );
}
