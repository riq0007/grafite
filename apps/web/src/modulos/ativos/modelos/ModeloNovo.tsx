import { CabecalhoDaPagina } from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import { NovoModelo } from './NovoModelo.tsx';

/** A tela do cadastro de um modelo, para quem edita modelos: ao cadastrar, vai à ficha dele. */
export function ModeloNovo() {
  const { pode } = useAcesso();
  const navegar = useNavigate();
  if (!pode('modelos.editar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo modelo" />
        <SemPermissao a="ao cadastro de modelos" />
      </>
    );
  }
  return (
    <NovoModelo
      aoConcluir={({ id }) =>
        void navegar({ to: '/gestao/catalogo/modelos/$id', params: { id }, replace: true })
      }
      aoCancelar={() => void navegar({ to: '/gestao/catalogo/modelos' })}
      aoMudarPreenchido={() => {}}
    />
  );
}
