import { TextArea, TextField } from 'react-aria-components';
import estilos from './Campo.module.css';
import type { PropsDoCampoDeTexto } from './CampoDeTexto.tsx';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from './partes.tsx';

/** Texto de várias linhas, com a mesma anatomia do campo de texto; redimensiona na vertical. */
export function AreaDeTexto({
  rotulo,
  descricao,
  obrigatorio = false,
  erro,
  placeholder,
  className,
  ...resto
}: PropsDoCampoDeTexto) {
  return (
    <TextField
      {...resto}
      isRequired={obrigatorio}
      isInvalid={erro ? true : undefined}
      className={[estilos.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
      <TextArea className={`${estilos.entrada} ${estilos.area}`} placeholder={placeholder} />
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} />
    </TextField>
  );
}
