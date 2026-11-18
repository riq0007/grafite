// Uma seção da coluna da direita do chamado aberto, que recolhe, como no m04: a legenda em versal
// pequena, o fio, o resumo, como a contagem dos campos, e a seta. A escolha, aberta ou fechada, é de
// quem usa a seção, que a guarda neste navegador (`lerSecoes`, no `lado.ts`).
import { Icone } from '@grafite/ui';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import estilos from './Lado.module.css';

export interface PropsDaSecaoDoLado {
  titulo: string;
  /** O resumo à direita do fio, como "3 respondidos, 1 pendente". */
  resumo?: string | null;
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
  children: ReactNode;
}

export function SecaoDoLado({
  titulo,
  resumo,
  aberta,
  aoMudarAberta,
  children,
}: PropsDaSecaoDoLado) {
  return (
    <details
      className={estilos.secao}
      open={aberta}
      // O navegador avisa também quando a tela abre a seção: só a mudança de quem clicou conta.
      onToggle={(evento) => {
        if (evento.currentTarget.open !== aberta) aoMudarAberta(evento.currentTarget.open);
      }}
    >
      <summary className={estilos.cabecaDaSecao}>
        <span>{titulo}</span>
        <span className={estilos.fio} aria-hidden="true" />
        {resumo && <span className={estilos.resumo}>{resumo}</span>}
        <span className={estilos.seta}>
          <Icone icone={ChevronDown} tamanho={16} />
        </span>
      </summary>
      <div className={estilos.conteudo}>{children}</div>
    </details>
  );
}
