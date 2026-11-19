import { ChevronDown } from 'lucide-react';
import { Button, Select, type SelectProps, SelectValue } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import { ListaDeOpcoes, Opcao, PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './Selecao.module.css';
import type { OpcaoDeSelecao } from './Selecao.tsx';

export interface PropsDaSelecaoNaFrase
  extends Omit<SelectProps<OpcaoDeSelecao>, 'children' | 'className' | 'placeholder'> {
  /** O que se escolhe, para o leitor de tela, como "Unidade da resposta": a frase já o diz. */
  rotulo: string;
  opcoes: readonly OpcaoDeSelecao[];
  className?: string;
}

/**
 * A escolha de uma opção dentro de uma frase, como o modo de contar do prazo ("…, no horário da
 * TI.") e a condição de um campo: o botão com o texto da opção e a seta, sem rótulo à vista, porque
 * a frase diz o que se escolhe. A recusa fica com quem escreve a frase, que marca o `isInvalid`.
 */
export function SelecaoNaFrase({ rotulo, opcoes, className, ...resto }: PropsDaSelecaoNaFrase) {
  return (
    <Select
      {...resto}
      aria-label={rotulo}
      className={[estilos.naFrase, className].filter(Boolean).join(' ')}
    >
      <Button className={estilos.gatilhoNaFrase}>
        <SelectValue<OpcaoDeSelecao> className={estilos.valor}>
          {({ isPlaceholder, defaultChildren, selectedText }) =>
            isPlaceholder ? defaultChildren : selectedText
          }
        </SelectValue>
        <span className={estilos.seta}>
          <Icone icone={ChevronDown} tamanho={12} />
        </span>
      </Button>
      <PainelFlutuante>
        <ListaDeOpcoes items={opcoes}>
          {(opcao) => <Opcao id={opcao.id}>{opcao.rotulo}</Opcao>}
        </ListaDeOpcoes>
      </PainelFlutuante>
    </Select>
  );
}
