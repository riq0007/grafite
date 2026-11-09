import { ChevronsUpDown } from 'lucide-react';
import { Button, Select, type SelectProps, SelectValue } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilosDoCampo from '../campo/Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from '../campo/partes.tsx';
import { ListaDeOpcoes, Opcao, PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './Selecao.module.css';

export interface OpcaoDeSelecao {
  id: string;
  rotulo: string;
}

export interface PropsDaSelecao
  extends Omit<
    SelectProps<OpcaoDeSelecao>,
    'children' | 'className' | 'isRequired' | 'isInvalid' | 'placeholder'
  > {
  rotulo: string;
  opcoes: OpcaoDeSelecao[];
  descricao?: string;
  obrigatorio?: boolean;
  /** Erro vindo de fora do campo (da API, por exemplo). */
  erro?: string;
  placeholder?: string;
  className?: string;
}

/** Escolha de uma opção numa lista fechada. Para buscar entre muitas, use a busca. */
export function Selecao({
  rotulo,
  opcoes,
  descricao,
  obrigatorio = false,
  erro,
  placeholder = 'Selecione',
  className,
  ...resto
}: PropsDaSelecao) {
  return (
    <Select
      {...resto}
      placeholder={placeholder}
      isRequired={obrigatorio}
      isInvalid={erro ? true : undefined}
      className={[estilosDoCampo.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
      <Button className={`${estilosDoCampo.entrada} ${estilos.gatilho}`}>
        {/* Só o texto: o conteúdo da opção traz a coluna da marca, que não cabe no gatilho. */}
        <SelectValue<OpcaoDeSelecao> className={estilos.valor}>
          {({ isPlaceholder, defaultChildren, selectedText }) =>
            isPlaceholder ? defaultChildren : selectedText
          }
        </SelectValue>
        <span className={estilos.seta}>
          <Icone icone={ChevronsUpDown} />
        </span>
      </Button>
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} tipo="escolha" />
      <PainelFlutuante>
        <ListaDeOpcoes items={opcoes}>
          {(opcao) => <Opcao id={opcao.id}>{opcao.rotulo}</Opcao>}
        </ListaDeOpcoes>
      </PainelFlutuante>
    </Select>
  );
}
