// O botão da aba (change chamados-da-ti, design, decisão 16 e "A prévia em tamanho real (tarefa
// 5.24)"), os dois do `ch3-aba.css`: o cheio, de 40 px, na cor da aba e em cápsula, da ação do
// rodapé, como o "Enviar para a TI"; e o de contorno, das ações dentro do formulário, como o anexo.
import { Icone } from '@grafite/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import estilos from './Aba.module.css';

export interface PropsDoBotaoDaAba {
  /** O cheio, da ação do rodapé; sem ele, o de contorno. */
  cheio?: boolean;
  /** O ícone decorativo, antes do texto ou, com o `iconeDepois`, depois, como a seta do envio. */
  icone?: LucideIcon;
  iconeDepois?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function BotaoDaAba({
  cheio = false,
  icone,
  iconeDepois = false,
  onClick,
  children,
}: PropsDoBotaoDaAba) {
  const desenho = icone && <Icone icone={icone} tamanho={16} />;
  return (
    <button
      type="button"
      className={estilos.botao}
      data-cheio={cheio || undefined}
      onClick={onClick}
    >
      {!iconeDepois && desenho}
      {children}
      {iconeDepois && desenho}
    </button>
  );
}
