import { avisar, Botao, CabecalhoDaPagina, EstadoVazio } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { PropsDoCadastroNaAba } from '../../../casca/abasDoApp.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import estilos from '../Ativos.module.css';
import { CHAVE_DOS_CAMPOS, CHAVE_DOS_TIPOS, useCampos, useCapacidades } from '../consultas.ts';
import { FormularioDoTipo, TIPO_VAZIO } from './FormularioDoTipo.tsx';

/**
 * O cadastro de um tipo de ativo (spec catalogo-de-ativos), o mesmo no catálogo e na aba que um
 * campo abre (change cadastro-em-abas, design, decisão 5): grava o tipo, avisa e o entrega a quem
 * pediu, que navega para a ficha ou o põe no campo.
 */
export function NovoTipo({ aoConcluir, aoCancelar, aoMudarPreenchido }: PropsDoCadastroNaAba) {
  const api = useApi();
  const consultas = useQueryClient();
  const campos = useCampos();
  const capacidades = useCapacidades();
  const falha = campos.error ?? capacidades.error;
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo tipo" />
      {falha ? (
        <EstadoVazio
          titulo={falha.message}
          acao={
            <Botao
              onPress={() => {
                void campos.refetch();
                void capacidades.refetch();
              }}
            >
              Tentar de novo
            </Botao>
          }
        />
      ) : !campos.data || !capacidades.data ? (
        <p role="status" className={estilos.contagem}>
          Carregando…
        </p>
      ) : (
        <FormularioDoTipo
          inicial={TIPO_VAZIO}
          campos={campos.data.campos}
          capacidades={capacidades.data.capacidades}
          rotuloDoEnvio="Cadastrar"
          aoCancelar={aoCancelar}
          aoMudarPreenchido={aoMudarPreenchido}
          enviar={async (pedido) => {
            const resultado = await pedir(
              () => api.POST('/tipos-de-ativo', { body: pedido }),
              'cadastrar o tipo',
            );
            if ('erro' in resultado) return recusaDe(resultado);
            for (const queryKey of [CHAVE_DOS_TIPOS, CHAVE_DOS_CAMPOS]) {
              await consultas.invalidateQueries({ queryKey });
            }
            avisar({ situacao: 'sucesso', titulo: 'Tipo cadastrado.' });
            aoConcluir({ id: resultado.dados.id, nome: pedido.nome });
            return { ok: true };
          }}
        />
      )}
    </div>
  );
}
