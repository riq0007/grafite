import { Plus } from 'lucide-react';
import { useId } from 'react';
import { Button } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './LinkDeCadastro.module.css';

export interface PropsDoLinkDeCadastro {
  /** O que o link cria, como "Cadastrar novo local". */
  texto: string;
  /** O nome do campo de que ele é, como "Local", que o leitor de tela anuncia junto do link. */
  campo: string;
  aoPressionar: () => void;
  /** O campo está desabilitado ou só para leitura: o link não aparece. */
  campoBloqueado?: boolean;
}

/**
 * O link embaixo de um campo que abre o cadastro do que o campo pede, sem sair da tela (change
 * cadastro-em-abas). Vem logo depois do campo na ordem do teclado, e o leitor de tela o anuncia
 * com o nome do campo, como a descrição dele. É um botão: abre o cadastro, sem navegar.
 */
export function LinkDeCadastro({
  texto,
  campo,
  aoPressionar,
  campoBloqueado = false,
}: PropsDoLinkDeCadastro) {
  const idDaDescricao = useId();
  if (campoBloqueado) return null;
  return (
    <>
      <Button className={estilos.link} aria-describedby={idDaDescricao} onPress={aoPressionar}>
        <Icone icone={Plus} tamanho={14} />
        {texto}
      </Button>
      <span id={idDaDescricao} hidden>
        Campo {campo}
      </span>
    </>
  );
}
