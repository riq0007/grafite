import type { components } from '@grafite/api-client';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  MensagemDoPasso,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import estilos from '../Administracao.module.css';
import { VerNaAuditoria } from '../auditoria/VerNaAuditoria.tsx';
import { Confirmacao } from '../Confirmacao.tsx';
import { Parte, useFocoPerdido } from '../Parte.tsx';
import { recusaDe } from '../recusa.ts';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';
import { dadosDoPerfil, FormularioDoPerfil } from './FormularioDoPerfil.tsx';

type Ficha = components['schemas']['FichaDoPerfil'];

/** A chave da ficha do perfil nas consultas. */
export const chaveDoPerfil = (id: string) => ['perfil', id] as const;

/**
 * A ficha do perfil (spec modulo-administracao): o nome e a situação no título, as permissões por
 * área e quem tem o perfil. O Administrador é protegido e não oferece alteração.
 */
export function FichaDoPerfil() {
  const { id } = useParams({ from: '/administracao/perfis/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const ficha = useQuery({
    queryKey: chaveDoPerfil(id),
    queryFn: () =>
      consultar(() => api.GET('/perfis/{id}', { params: { path: { id } } }), 'carregar o perfil'),
  });
  // "Inativar" vira "Reativar" no título: o foco perdido vai ao título da janela.
  const pedirFoco = useFocoPerdido(ficha.data, () => focarDestino(undefined));
  const aplicar = useCallback(
    (perfil: Ficha) => {
      pedirFoco();
      consultas.setQueryData(chaveDoPerfil(perfil.id), perfil);
      // A lista e o acesso de quem tem o perfil mudam junto.
      for (const queryKey of [['perfis'], ['acesso-da-conta']]) {
        void consultas.invalidateQueries({ queryKey });
      }
    },
    [consultas, pedirFoco],
  );

  if (ficha.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Perfil" />
        <p role="status" className={estilos.contagem}>
          Carregando o perfil…
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
        <CabecalhoDaPagina titulo="Perfil" />
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

  const perfil = ficha.data;
  const situacao = SITUACOES_DO_REGISTRO[perfil.situacao];
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={perfil.nome}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={<AcoesDoPerfil perfil={perfil} aplicar={aplicar} />}
      />
      {perfil.protegido && (
        <p className={estilos.informacao}>Perfil protegido: tem todas as permissões e não muda.</p>
      )}
      <FormularioDoPerfil
        key={perfil.id}
        inicial={dadosDoPerfil(perfil)}
        soLeitura={!perfil.permite.editar}
        rotuloDoEnvio="Salvar alterações"
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.PATCH('/perfis/{id}', { params: { path: { id: perfil.id } }, body: pedido }),
            'salvar o perfil',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          consultas.setQueryData(chaveDoPerfil(perfil.id), resultado.dados);
          for (const queryKey of [['perfis'], ['acesso-da-conta']]) {
            void consultas.invalidateQueries({ queryKey });
          }
          avisar({ situacao: 'sucesso', titulo: 'Perfil salvo.' });
          return { ok: true };
        }}
      />
      <QuemTem perfil={perfil} />
      <VerNaAuditoria alvo={[`perfil:${perfil.id}`]} nome={perfil.nome} />
    </div>
  );
}

/** "Reativar" e, confirmada, "Inativar", conforme a API permite. */
function AcoesDoPerfil({ perfil, aplicar }: { perfil: Ficha; aplicar: (perfil: Ficha) => void }) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  if (!perfil.permite.inativar && !perfil.permite.reativar) return null;
  const noPerfil = { params: { path: { id: perfil.id } } };

  const aplicarResultado = (resultado: { dados: Ficha } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return resultado;
    aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoesDaPessoa}>
      <div className={estilos.gruposDeAcoes}>
        {perfil.permite.reativar && (
          <Botao
            carregando={reativando}
            rotuloCarregando="Reativando"
            onPress={async () => {
              definirReativando(true);
              definirFalha(null);
              const resultado = aplicarResultado(
                await pedir(
                  () => api.POST('/perfis/{id}/reativacao', noPerfil),
                  'reativar o perfil',
                ),
                'Perfil reativado.',
              );
              definirReativando(false);
              if ('erro' in resultado) {
                definirFalha(resultado.erro);
                definirTentativa((atual) => atual + 1);
              }
            }}
          >
            Reativar
          </Botao>
        )}
        {perfil.permite.inativar && (
          <Confirmacao
            acao="Inativar"
            titulo={`Inativar o perfil ${perfil.nome}?`}
            confirmar="Inativar o perfil"
            confirmando="Inativando"
            fazer={async () =>
              aplicarResultado(
                await pedir(
                  () => api.POST('/perfis/{id}/inativacao', noPerfil),
                  'inativar o perfil',
                ),
                'Perfil inativado.',
              )
            }
          >
            <p className={estilos.informacao}>
              O perfil deixa de conceder permissões e de exigir a verificação em dois passos. As
              atribuições continuam registradas, e o perfil pode ser reativado.
            </p>
          </Confirmacao>
        )}
      </div>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}

/** Quem tem o perfil: as contas e os grupos, com o escopo de cada atribuição. */
function QuemTem({ perfil }: { perfil: Ficha }) {
  return (
    <Parte titulo="Quem tem o perfil">
      {perfil.quemTem.length === 0 ? (
        <p className={estilos.informacao}>Ninguém tem este perfil.</p>
      ) : (
        <ul aria-label="Quem tem o perfil" className={estilos.itens}>
          {perfil.quemTem.map(({ atribuicaoId, conta, grupo, local }) => (
            <li key={atribuicaoId} className={estilos.item}>
              <div className={estilos.textoDoItem}>
                <p className={estilos.nomeDoItem}>
                  {conta ? (
                    <Link
                      to="/administracao/pessoas/$id"
                      params={{ id: conta.pessoaId }}
                      className={estilos.link}
                    >
                      {conta.nome}
                    </Link>
                  ) : (
                    grupo && (
                      <span>
                        Grupo{' '}
                        <Link
                          to="/administracao/grupos/$id"
                          params={{ id: grupo.id }}
                          className={estilos.link}
                        >
                          {grupo.nome}
                        </Link>
                      </span>
                    )
                  )}
                  {conta && conta.situacao !== 'ativa' && (
                    <RotuloDeSituacao situacao="neutra">
                      {conta.situacao === 'inativa' ? 'Conta inativa' : 'Conta anonimizada'}
                    </RotuloDeSituacao>
                  )}
                  {grupo?.situacao === 'inativo' && (
                    <RotuloDeSituacao situacao="neutra">Grupo inativo</RotuloDeSituacao>
                  )}
                </p>
                <p className={estilos.detalheDoItem}>
                  {conta?.usuario && `${conta.usuario} · `}
                  {local?.caminho ?? 'Organização inteira'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Parte>
  );
}
