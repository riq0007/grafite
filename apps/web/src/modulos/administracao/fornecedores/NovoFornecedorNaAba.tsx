import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { PropsDoCadastroNaAba } from '../../../casca/abasDoApp.tsx';
import { recusaDe } from '../recusa.ts';
import { aplicarFornecedor } from './consultas.ts';
import { FORNECEDOR_VAZIO, FormularioDoFornecedor } from './FormularioDoFornecedor.tsx';

/**
 * O Novo fornecedor numa aba da janela, pedido pelo campo de outro módulo (spec fornecedores, "Novo
 * fornecedor numa aba"; change p4a-fornecedores, design, decisão 7): o formulário da seção, que, ao
 * salvar, devolve o fornecedor criado ao campo que o pediu, em vez de abrir a ficha.
 */
export function NovoFornecedorNaAba({
  aoConcluir,
  aoCancelar,
  aoMudarPreenchido,
}: PropsDoCadastroNaAba) {
  const api = useApi();
  const consultas = useQueryClient();
  return (
    <>
      <CabecalhoDaPagina titulo="Novo fornecedor" />
      <FormularioDoFornecedor
        inicial={FORNECEDOR_VAZIO}
        rotuloDoEnvio="Cadastrar"
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/fornecedores', { body: pedido }),
            'cadastrar o fornecedor',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await aplicarFornecedor(consultas, resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Fornecedor cadastrado.' });
          aoConcluir({ id: resultado.dados.id, nome: resultado.dados.nome });
          return { ok: true };
        }}
        aoMudarPreenchido={aoMudarPreenchido}
        aoCancelar={aoCancelar}
      />
    </>
  );
}
