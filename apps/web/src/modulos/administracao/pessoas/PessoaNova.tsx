import { CabecalhoDaPagina } from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { SemPermissao } from '../SemPermissao.tsx';
import { NovaPessoa } from './NovaPessoa.tsx';

/** A tela do cadastro de uma pessoa, para quem edita pessoas: ao cadastrar, vai à ficha dela. */
export function PessoaNova() {
  const { pode } = useAcesso();
  const navegar = useNavigate();
  if (!pode('pessoas.editar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Nova pessoa" />
        <SemPermissao a="ao cadastro de pessoas" />
      </>
    );
  }
  return (
    <NovaPessoa
      aoConcluir={({ id }) =>
        void navegar({ to: '/administracao/pessoas/$id', params: { id }, replace: true })
      }
      aoCancelar={() => void navegar({ to: '/administracao/pessoas' })}
      aoMudarPreenchido={() => {}}
    />
  );
}
