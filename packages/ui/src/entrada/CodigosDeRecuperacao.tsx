import { Botao } from '../componentes/botao/Botao.tsx';
import { TextoParaCopiar } from '../componentes/copiar/TextoParaCopiar.tsx';
import estilos from './Entrada.module.css';

export interface PropsDosCodigos {
  /** Os 10 códigos, mostrados uma vez só: o banco guarda só o hash deles. */
  codigos: string[];
  aoContinuar: () => void;
  /** O título da tela (h1) na entrada, ou o de dentro da parte da conta (h3) nos Ajustes. */
  nivelDoTitulo?: 1 | 2 | 3;
  copiar?: (texto: string) => Promise<void>;
}

/** Os códigos de recuperação recém-gerados, para guardar antes de continuar. */
export function CodigosDeRecuperacao({
  codigos,
  aoContinuar,
  nivelDoTitulo = 1,
  copiar,
}: PropsDosCodigos) {
  const Titulo = (['h1', 'h2', 'h3'] as const)[nivelDoTitulo - 1] ?? 'h1';
  return (
    <>
      <Titulo className={estilos.titulo}>Guarde os códigos de recuperação</Titulo>
      <p className={estilos.texto}>
        Cada código serve uma vez, no lugar do código do app, se você perder o celular. Eles não
        aparecem de novo: guarde-os num lugar seguro.
      </p>
      <TextoParaCopiar
        rotulo="Códigos de recuperação"
        valor={codigos.join('\n')}
        falhou="Não foi possível copiar. Selecione os códigos e copie."
        copiar={copiar}
      >
        <ol aria-label="Códigos de recuperação" className={estilos.listaDeCodigos}>
          {codigos.map((codigo) => (
            <li key={codigo}>{codigo}</li>
          ))}
        </ol>
      </TextoParaCopiar>
      <div className={estilos.acoes}>
        <Botao nivel="primario" onPress={aoContinuar}>
          Continuar
        </Botao>
      </div>
    </>
  );
}
