import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';
import { aplicarFornecedor } from './consultas.ts';
import { FORNECEDOR_VAZIO, FormularioDoFornecedor } from './FormularioDoFornecedor.tsx';

/**
 * O cadastro de um fornecedor na seção (spec modulo-administracao, "Tela de fornecedores"): ao
 * salvar, "Fornecedor cadastrado." e a ficha dele, no lugar do formulário.
 */
export function FornecedorNovo() {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo fornecedor" />
      <FormularioDoFornecedor
        inicial={FORNECEDOR_VAZIO}
        rotuloDoEnvio="Cadastrar"
        aoCancelar={() => void navegar({ to: '/administracao/fornecedores' })}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/fornecedores', { body: pedido }),
            'cadastrar o fornecedor',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await aplicarFornecedor(consultas, resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Fornecedor cadastrado.' });
          void navegar({
            to: '/administracao/fornecedores/$id',
            params: { id: resultado.dados.id },
            replace: true,
          });
          return { ok: true };
        }}
      />
    </div>
  );
}
