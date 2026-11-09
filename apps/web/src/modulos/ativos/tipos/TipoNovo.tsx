import { CabecalhoDaPagina } from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import { NovoTipo } from './NovoTipo.tsx';

/** A tela do cadastro de um tipo, para quem cuida do catálogo: ao cadastrar, vai à ficha dele. */
export function TipoNovo() {
  const { pode } = useAcesso();
  const navegar = useNavigate();
  if (!pode('catalogo.administrar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo tipo" />
        <SemPermissao a="ao cadastro de tipos de ativo" />
      </>
    );
  }
  return (
    <NovoTipo
      aoConcluir={({ id }) =>
        void navegar({ to: '/gestao/catalogo/tipos/$id', params: { id }, replace: true })
      }
      aoCancelar={() => void navegar({ to: '/gestao/catalogo/tipos' })}
      aoMudarPreenchido={() => {}}
    />
  );
}
