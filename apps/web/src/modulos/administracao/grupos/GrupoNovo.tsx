import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';
import { SemPermissao } from '../SemPermissao.tsx';
import { FormularioDoGrupo, GRUPO_VAZIO } from './FormularioDoGrupo.tsx';

/** O cadastro de um grupo (spec perfis-e-grupos), para quem administra os acessos. */
export function GrupoNovo() {
  const { pode } = useAcesso();
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  if (!pode('acessos.administrar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo grupo" />
        <SemPermissao a="ao cadastro de grupos" />
      </>
    );
  }
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo grupo" />
      <FormularioDoGrupo
        inicial={GRUPO_VAZIO}
        rotuloDoEnvio="Cadastrar"
        aoCancelar={() => void navegar({ to: '/administracao/grupos' })}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/grupos', { body: pedido }),
            'cadastrar o grupo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await consultas.invalidateQueries({ queryKey: ['grupos'] });
          avisar({ situacao: 'sucesso', titulo: 'Grupo cadastrado.' });
          void navegar({
            to: '/administracao/grupos/$id',
            params: { id: resultado.dados.id },
            replace: true,
          });
          return { ok: true };
        }}
      />
    </div>
  );
}
