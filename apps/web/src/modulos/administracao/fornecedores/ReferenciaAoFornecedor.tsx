// A referência a um fornecedor (spec cadastro-de-ativos, "Referências do ativo"; change
// p4a-fornecedores, design, decisão 3): o nome atual, com "(inativo)" no inativo, como link para a
// ficha dele, para quem vê os fornecedores; para os outros, só o nome.
import { Link } from '@tanstack/react-router';
import { useAcesso } from '../../../sessao/useAcesso.ts';

export function ReferenciaAoFornecedor({ id, nome }: { id: string; nome: string }) {
  if (!useAcesso().pode('fornecedores.ver')) return <span>{nome}</span>;
  return (
    <Link to="/administracao/fornecedores/$id" params={{ id }}>
      {nome}
    </Link>
  );
}
