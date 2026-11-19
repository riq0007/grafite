import type { Ref } from 'react';
import { TextArea, TextField } from 'react-aria-components';
import estilos from './Campo.module.css';
import type { PropsDoCampoDeTexto } from './CampoDeTexto.tsx';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from './partes.tsx';

export interface PropsDaAreaDeTexto extends Omit<PropsDoCampoDeTexto, 'ref'> {
  /**
   * O rótulo só para o leitor de tela, quando outra peça à vista já diz o que se escreve, como a
   * chave "Mensagem para Fernanda | Nota interna" do campo de escrever dos chamados.
   */
  ocultarRotulo?: boolean;
  /** A caixa de texto, para quem precisa do foco ou do cursor nela. */
  ref?: Ref<HTMLTextAreaElement>;
}

/** Texto de várias linhas, com a mesma anatomia do campo de texto; redimensiona na vertical. */
export function AreaDeTexto({
  rotulo,
  ocultarRotulo = false,
  descricao,
  obrigatorio = false,
  erro,
  placeholder,
  className,
  ref,
  ...resto
}: PropsDaAreaDeTexto) {
  return (
    <TextField
      {...resto}
      aria-label={ocultarRotulo ? rotulo : undefined}
      isRequired={obrigatorio}
      isInvalid={erro ? true : undefined}
      className={[estilos.campo, className].filter(Boolean).join(' ')}
    >
      {!ocultarRotulo && <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />}
      <TextArea
        ref={ref}
        className={`${estilos.entrada} ${estilos.area}`}
        placeholder={placeholder}
      />
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} />
    </TextField>
  );
}
