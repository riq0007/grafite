import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { PropsDoCadastroNaAba } from '../../../casca/abasDoApp.tsx';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';
import { FORMULARIO_VAZIO, FormularioDaPessoa } from './FormularioDaPessoa.tsx';

/**
 * O cadastro de uma pessoa (spec administracao-de-pessoas), o mesmo na tela da Administração e na
 * aba que um campo de outro módulo abre (change cadastro-em-abas, design, decisão 5): grava a
 * pessoa, avisa e a entrega a quem pediu, que navega para a ficha ou a põe no campo.
 */
export function NovaPessoa({ aoConcluir, aoCancelar, aoMudarPreenchido }: PropsDoCadastroNaAba) {
  const api = useApi();
  const consultas = useQueryClient();
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Nova pessoa" />
      <FormularioDaPessoa
        inicial={FORMULARIO_VAZIO}
        rotuloDoEnvio="Cadastrar"
        aoCancelar={aoCancelar}
        aoMudarPreenchido={aoMudarPreenchido}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/pessoas', { body: pedido }),
            'cadastrar a pessoa',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await consultas.invalidateQueries({ queryKey: ['pessoas'] });
          avisar({ situacao: 'sucesso', titulo: 'Pessoa cadastrada.' });
          aoConcluir({ id: resultado.dados.id, nome: pedido.nome });
          return { ok: true };
        }}
      />
    </div>
  );
}
