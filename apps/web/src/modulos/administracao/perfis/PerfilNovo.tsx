import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';
import { SemPermissao } from '../SemPermissao.tsx';
import { FormularioDoPerfil, PERFIL_VAZIO } from './FormularioDoPerfil.tsx';

/** O cadastro de um perfil (spec perfis-e-grupos), para quem administra os acessos. */
export function PerfilNovo() {
  const { pode } = useAcesso();
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  if (!pode('acessos.administrar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo perfil" />
        <SemPermissao a="ao cadastro de perfis" />
      </>
    );
  }
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo perfil" />
      <FormularioDoPerfil
        inicial={PERFIL_VAZIO}
        rotuloDoEnvio="Cadastrar"
        aoCancelar={() => void navegar({ to: '/administracao/perfis' })}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/perfis', { body: pedido }),
            'cadastrar o perfil',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await consultas.invalidateQueries({ queryKey: ['perfis'] });
          avisar({ situacao: 'sucesso', titulo: 'Perfil cadastrado.' });
          void navegar({
            to: '/administracao/perfis/$id',
            params: { id: resultado.dados.id },
            replace: true,
          });
          return { ok: true };
        }}
      />
    </div>
  );
}
