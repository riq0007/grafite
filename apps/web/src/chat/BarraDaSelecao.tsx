// A barra da seleção das mensagens (spec modulo-chat, "Mensagens selecionadas"; change
// andamento-e-varias-mensagens, decisão 8): no lugar da caixa de escrever, ou do aviso de quem não
// escreve, quantas estão marcadas, "Transformar em chamado", a principal, no azul do chamado, com o
// Ctrl+Shift+T, e "Cancelar".
import { MAXIMO_DE_MENSAGENS_NUM_CHAMADO } from '@grafite/domain';
import { Botao, TeclaDeAtalho } from '@grafite/ui';
import { LifeBuoy } from 'lucide-react';
import estilos from './BarraDaSelecao.module.css';

/** "3 mensagens selecionadas", "1 mensagem selecionada", "Nenhuma…" e, no limite, "o máximo". */
export function textoDaSelecao(quantas: number): string {
  if (quantas === 0) return 'Nenhuma mensagem selecionada';
  if (quantas === 1) return '1 mensagem selecionada';
  return quantas >= MAXIMO_DE_MENSAGENS_NUM_CHAMADO
    ? `${quantas} mensagens selecionadas, o máximo`
    : `${quantas} mensagens selecionadas`;
}

export function BarraDaSelecao({
  quantas,
  transformar,
  cancelar,
}: {
  quantas: number;
  transformar: () => void;
  cancelar: () => void;
}) {
  return (
    <div className={estilos.barra} data-barra-da-selecao="">
      <p className={estilos.quantas} role="status">
        {textoDaSelecao(quantas)}
      </p>
      <Botao onPress={cancelar}>Cancelar</Botao>
      <Botao
        nivel="primario"
        icone={LifeBuoy}
        className={estilos.transformar}
        isDisabled={quantas === 0}
        aria-keyshortcuts="Control+Shift+T"
        onPress={transformar}
      >
        Transformar em chamado
        <TeclaDeAtalho teclas={['ctrl', 'shift', 'T']} className={estilos.atalho} />
      </Botao>
    </div>
  );
}
