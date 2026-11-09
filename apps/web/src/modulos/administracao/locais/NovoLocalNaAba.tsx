import { montarArvore } from '@grafite/domain';
import { avisar, Botao, CabecalhoDaPagina, EstadoVazio } from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { PropsDoCadastroNaAba } from '../../../casca/abasDoApp.tsx';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';
import { CorpoDoLocal } from './FormularioDoLocal.tsx';

/**
 * O Novo local numa aba da janela, pedido pelo campo de outro módulo (change cadastro-em-abas):
 * o corpo do formulário da tela dos locais, com o local de dentro escolhido entre os que a conta
 * altera. Ao salvar, o local criado volta ao campo que o pediu.
 */
export function NovoLocalNaAba({
  aoConcluir,
  aoCancelar,
  aoMudarPreenchido,
}: PropsDoCadastroNaAba) {
  const api = useApi();
  const consultas = useQueryClient();
  const dados = useQuery({
    queryKey: ['locais'],
    queryFn: () => consultar(() => api.GET('/locais'), 'carregar os locais'),
  });
  const locais = dados.data?.locais;
  const arvore = useMemo(() => montarArvore(locais ?? []), [locais]);
  const semPermissao = useMemo(
    () => new Set((locais ?? []).filter((local) => !local.permite.editar).map((local) => local.id)),
    [locais],
  );

  if (dados.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo local" />
        <p role="status" className={estilos.contagem}>
          Carregando os locais…
        </p>
      </>
    );
  }
  if (dados.isError) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo local" />
        <EstadoVazio
          titulo={dados.error.message}
          acao={<Botao onPress={() => void dados.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }

  return (
    <>
      <CabecalhoDaPagina titulo="Novo local" />
      <CorpoDoLocal
        inicial={{ nome: '', tipo: null }}
        rotuloDoEnvio="Cadastrar"
        dentroDe={{ podeNaRaiz: dados.data.permite.cadastrarNaRaiz, semPermissao }}
        conferirNome={(nome, paiId) => arvore.podeCriar({ paiId, nome })}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/locais', { body: pedido }),
            'cadastrar o local',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          void consultas.invalidateQueries({ queryKey: ['locais'] });
          avisar({ situacao: 'sucesso', titulo: 'Local cadastrado.' });
          aoConcluir({ id: resultado.dados.id, nome: resultado.dados.nome });
          return { ok: true };
        }}
        aoMudarPreenchido={aoMudarPreenchido}
        aoCancelar={aoCancelar}
      />
    </>
  );
}
