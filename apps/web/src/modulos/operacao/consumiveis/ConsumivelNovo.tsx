import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { recusaDe } from '../../administracao/recusa.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import estilos from '../Operacao.module.css';
import { aplicarConsumivel } from './consultas.ts';
import { CONSUMIVEL_VAZIO, FormularioDoConsumivel } from './FormularioDoConsumivel.tsx';

/**
 * O cadastro de um consumível (spec modulo-operacao, "Cadastro e ficha do consumível"): ao salvar,
 * "Consumível cadastrado." e a ficha dele, no lugar do formulário.
 */
export function ConsumivelNovo() {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const { pode } = useAcesso();
  if (!pode('consumiveis.editar')) return <SemPermissao a="ao cadastro dos consumíveis" />;

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo consumível" />
      <FormularioDoConsumivel
        inicial={CONSUMIVEL_VAZIO}
        rotuloDoEnvio="Cadastrar"
        aoCancelar={() => void navegar({ to: '/operacao/consumiveis' })}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/consumiveis', { body: pedido }),
            'cadastrar o consumível',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await aplicarConsumivel(consultas, resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Consumível cadastrado.' });
          void navegar({
            to: '/operacao/consumiveis/$id',
            params: { id: resultado.dados.id },
            replace: true,
          });
          return { ok: true };
        }}
      />
    </div>
  );
}
