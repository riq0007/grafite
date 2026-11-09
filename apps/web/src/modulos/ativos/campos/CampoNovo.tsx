import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { recusaDe } from '../../administracao/recusa.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import estilos from '../Ativos.module.css';
import { CHAVE_DOS_CAMPOS, useCampos } from '../consultas.ts';
import { CAMPO_VAZIO, FormularioDoCampo } from './FormularioDoCampo.tsx';
import { gruposUsados } from './grupos.ts';

/** O cadastro de um campo da organização (spec catalogo-de-ativos), para quem cuida do catálogo. */
export function CampoNovo() {
  const { pode } = useAcesso();
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const campos = useCampos();
  if (!pode('catalogo.administrar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo campo" />
        <SemPermissao a="ao cadastro de campos" />
      </>
    );
  }
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo campo" />
      <FormularioDoCampo
        inicial={CAMPO_VAZIO}
        grupos={gruposUsados(campos.data?.campos ?? [])}
        rotuloDoEnvio="Cadastrar"
        aoCancelar={() => void navegar({ to: '/gestao/catalogo/campos' })}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/campos', { body: pedido }),
            'cadastrar o campo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await consultas.invalidateQueries({ queryKey: CHAVE_DOS_CAMPOS });
          avisar({ situacao: 'sucesso', titulo: 'Campo cadastrado.' });
          void navegar({
            to: '/gestao/catalogo/campos/$id',
            params: { id: resultado.dados.id },
            replace: true,
          });
          return { ok: true };
        }}
      />
    </div>
  );
}
