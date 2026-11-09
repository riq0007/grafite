import { CabecalhoDaPagina } from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import estilos from './PaginaNaoEncontrada.module.css';

/** Endereço que não leva a nenhuma tela: a página fica dentro da casca, com o caminho de volta. */
export function PaginaNaoEncontrada() {
  return (
    <>
      <CabecalhoDaPagina titulo="Página não encontrada" />
      <p className={estilos.descricao}>Este endereço não leva a nenhuma tela do Grafite.</p>
      <Link to="/" className={estilos.link}>
        Ir para o Início
      </Link>
    </>
  );
}
