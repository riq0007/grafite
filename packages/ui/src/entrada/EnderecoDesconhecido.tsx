import estilos from './Entrada.module.css';

/** O endereço que nenhuma organização registrou: a explicação, sem os campos de entrada. */
export function EnderecoDesconhecido() {
  return (
    <>
      <h1 className={estilos.titulo}>Endereço desconhecido</h1>
      <p className={estilos.texto}>
        Este endereço não está ligado a nenhuma organização do Grafite. Confira o endereço com a TI.
      </p>
    </>
  );
}
