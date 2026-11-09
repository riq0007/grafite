import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { PropsDoCadastroNaAba } from '../../../casca/abasDoApp.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { aplicarConsumivel } from './consultas.ts';
import { CONSUMIVEL_VAZIO, FormularioDoConsumivel } from './FormularioDoConsumivel.tsx';

/**
 * O Novo consumível numa aba da janela, pedido pelo campo de outro módulo ou da entrada no estoque
 * (spec consumiveis, "Novo consumível numa aba"; change p4c-estoque, design, decisão 7): o
 * formulário do Operação, que, ao salvar, devolve o consumível criado ao campo que o pediu, pelo
 * código, em vez de abrir a ficha.
 */
export function NovoConsumivelNaAba({
  aoConcluir,
  aoCancelar,
  aoMudarPreenchido,
}: PropsDoCadastroNaAba) {
  const api = useApi();
  const consultas = useQueryClient();
  return (
    <>
      <CabecalhoDaPagina titulo="Novo consumível" />
      <FormularioDoConsumivel
        inicial={CONSUMIVEL_VAZIO}
        rotuloDoEnvio="Cadastrar"
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/consumiveis', { body: pedido }),
            'cadastrar o consumível',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await aplicarConsumivel(consultas, resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Consumível cadastrado.' });
          aoConcluir({ id: resultado.dados.id, nome: resultado.dados.codigo });
          return { ok: true };
        }}
        aoMudarPreenchido={aoMudarPreenchido}
        aoCancelar={aoCancelar}
      />
    </>
  );
}
