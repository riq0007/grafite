import {
  Abas,
  Avatar,
  avisar,
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useCallback } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { miniaturasDaPessoa } from '../../../api/fotos.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { RelacoesDaFicha } from '../../relacoes.tsx';
import estilos from '../Administracao.module.css';
import { useFocoPerdido } from '../Parte.tsx';
import { recusaDe } from '../recusa.ts';
import { AcessoDaPessoa } from './AcessoDaPessoa.tsx';
import { AcoesDaPessoa, type AplicarNaPessoa } from './AcoesDaPessoa.tsx';
import { dadosDoFormulario, FormularioDaPessoa } from './FormularioDaPessoa.tsx';
import { FotoDaPessoa } from './FotoDaPessoa.tsx';
import { chaveDaFicha, type Ficha } from './ficha.ts';
import { HistoricoDaPessoa } from './HistoricoDaPessoa.tsx';
import { SITUACOES_DA_PESSOA } from './Pessoas.tsx';

/**
 * A ficha da pessoa (spec modulo-administracao): a foto (ou as iniciais), o nome e a situação no
 * título, e as abas. Cada aba oferece só as ações que a API permite para aquela pessoa.
 */
export function FichaDaPessoa() {
  const { id } = useParams({ from: '/administracao/pessoas/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  const ficha = useQuery({
    queryKey: chaveDaFicha(id),
    queryFn: () =>
      consultar(() => api.GET('/pessoas/{id}', { params: { path: { id } } }), 'carregar a pessoa'),
  });
  // A ação sobre a pessoa troca os botões do título ("Inativar" vira "Reativar"): o foco perdido
  // vai ao título da janela.
  const pedirFoco = useFocoPerdido(ficha.data, () => focarDestino(undefined));
  const aplicar: AplicarNaPessoa = useCallback(
    (pessoa) => {
      pedirFoco();
      consultas.setQueryData(chaveDaFicha(pessoa.id), pessoa);
      // A conta, as sessões e o acesso mudam junto com a pessoa.
      for (const queryKey of [['pessoas'], ['sessoes-da-conta'], ['acesso-da-conta']]) {
        void consultas.invalidateQueries({ queryKey });
      }
    },
    [consultas, pedirFoco],
  );

  if (ficha.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Pessoa" />
        <p role="status" className={estilos.contagem}>
          Carregando a pessoa…
        </p>
      </>
    );
  }
  if (ficha.isError) {
    const naoExiste =
      ficha.error instanceof Error && 'codigo' in ficha.error
        ? ficha.error.codigo === 'nao-encontrado'
        : false;
    return (
      <>
        <CabecalhoDaPagina titulo="Pessoa" />
        <EstadoVazio
          titulo={ficha.error.message}
          acao={
            naoExiste ? undefined : (
              <Botao onPress={() => void ficha.refetch()}>Tentar de novo</Botao>
            )
          }
        />
      </>
    );
  }

  const pessoa = ficha.data;
  const situacao = SITUACOES_DA_PESSOA[pessoa.situacao];
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={
          <span className={estilos.nomeComFoto}>
            <Avatar
              nome={pessoa.nome}
              imagens={miniaturasDaPessoa(pessoa.id, pessoa.foto)}
              tamanho="ficha"
              decorativo
            />
            {pessoa.nome}
          </span>
        }
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={<AcoesDaPessoa pessoa={pessoa} aplicar={aplicar} />}
      />
      <Abas
        rotulo="Ficha da pessoa"
        abas={[
          { id: 'dados', rotulo: 'Dados', conteudo: <DadosDaPessoa pessoa={pessoa} /> },
          { id: 'acesso', rotulo: 'Acesso', conteudo: <AcessoDaPessoa pessoa={pessoa} /> },
          ...(pode('auditoria.ver')
            ? [
                {
                  id: 'historico',
                  rotulo: 'Histórico',
                  conteudo: <HistoricoDaPessoa pessoa={pessoa} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

/** A aba Dados: a foto e o formulário da pessoa, só de leitura para quem não pode editá-la. */
function DadosDaPessoa({ pessoa }: { pessoa: Ficha }) {
  const api = useApi();
  const consultas = useQueryClient();
  return (
    <div className={estilos.partes}>
      <FotoDaPessoa pessoa={pessoa} />
      <RelacoesDaFicha alvo="pessoa" id={pessoa.id} />
      <FormularioDaPessoa
        // A anonimização apaga os dados: o formulário recomeça com o que ficou.
        key={pessoa.situacao === 'anonimizada' ? `${pessoa.id}:anonimizada` : pessoa.id}
        inicial={dadosDoFormulario(pessoa)}
        soLeitura={!pessoa.permite.editar}
        rotuloDoEnvio="Salvar alterações"
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.PATCH('/pessoas/{id}', { params: { path: { id: pessoa.id } }, body: pedido }),
            'salvar os dados da pessoa',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          consultas.setQueryData(chaveDaFicha(pessoa.id), resultado.dados);
          await consultas.invalidateQueries({ queryKey: ['pessoas'] });
          avisar({ situacao: 'sucesso', titulo: 'Dados da pessoa salvos.' });
          return { ok: true };
        }}
      />
    </div>
  );
}
