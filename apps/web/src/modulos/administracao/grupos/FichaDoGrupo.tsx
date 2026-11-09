import type { components } from '@grafite/api-client';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  Dialogo,
  EstadoVazio,
  MensagemDoPasso,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import estilos from '../Administracao.module.css';
import { AtribuirPerfil } from '../atribuicoes/AtribuirPerfil.tsx';
import { VerNaAuditoria } from '../auditoria/VerNaAuditoria.tsx';
import { Confirmacao } from '../Confirmacao.tsx';
import { Parte, useFocoNoTitulo, useFocoPerdido } from '../Parte.tsx';
import { recusaDe } from '../recusa.ts';
import { type ContaDoSeletor, SeletorDeConta } from '../seletores/SeletorDeConta.tsx';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';
import { FormularioDoGrupo } from './FormularioDoGrupo.tsx';

type Ficha = components['schemas']['FichaDoGrupo'];
type Aplicar = (grupo: Ficha) => void;

/** A chave da ficha do grupo nas consultas. */
export const chaveDoGrupo = (id: string) => ['grupo', id] as const;

/** O que muda junto com o grupo: as listas e o acesso de quem participa. */
const RELACIONADAS = [['grupos'], ['perfis'], ['perfil'], ['acesso-da-conta']];

const noEscopo = (local: { caminho: string } | null) =>
  local ? `em ${local.caminho}` : 'na organização inteira';

/**
 * A ficha do grupo (spec modulo-administracao): o nome e a situação no título, os dados, os
 * membros e os perfis do grupo, com o escopo. Quem administra os acessos inclui e retira contas,
 * atribui e encerra perfis e inativa e reativa o grupo.
 */
export function FichaDoGrupo() {
  const { id } = useParams({ from: '/administracao/grupos/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const ficha = useQuery({
    queryKey: chaveDoGrupo(id),
    queryFn: () =>
      consultar(() => api.GET('/grupos/{id}', { params: { path: { id } } }), 'carregar o grupo'),
  });
  // "Inativar" vira "Reativar" no título: o foco perdido vai ao título da janela.
  const pedirFoco = useFocoPerdido(ficha.data?.situacao, () => focarDestino(undefined));
  const aplicar: Aplicar = useCallback(
    (grupo) => {
      consultas.setQueryData(chaveDoGrupo(grupo.id), grupo);
      for (const queryKey of RELACIONADAS) void consultas.invalidateQueries({ queryKey });
    },
    [consultas],
  );

  if (ficha.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Grupo" />
        <p role="status" className={estilos.contagem}>
          Carregando o grupo…
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
        <CabecalhoDaPagina titulo="Grupo" />
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

  const grupo = ficha.data;
  const situacao = SITUACOES_DO_REGISTRO[grupo.situacao];
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={grupo.nome}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={
          <AcoesDoGrupo
            grupo={grupo}
            aplicar={(novo) => {
              pedirFoco();
              aplicar(novo);
            }}
          />
        }
      />
      <FormularioDoGrupo
        key={grupo.id}
        inicial={{ nome: grupo.nome, descricao: grupo.descricao ?? '' }}
        soLeitura={!grupo.permite.editar}
        rotuloDoEnvio="Salvar alterações"
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.PATCH('/grupos/{id}', { params: { path: { id: grupo.id } }, body: pedido }),
            'salvar o grupo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          aplicar(resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Grupo salvo.' });
          return { ok: true };
        }}
      />
      <MembrosDoGrupo grupo={grupo} aplicar={aplicar} />
      <PerfisDoGrupo grupo={grupo} />
      <VerNaAuditoria alvo={[`grupo:${grupo.id}`]} nome={grupo.nome} />
    </div>
  );
}

/** "Reativar" e, confirmada, "Inativar", conforme a API permite. */
function AcoesDoGrupo({ grupo, aplicar }: { grupo: Ficha; aplicar: Aplicar }) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  if (!grupo.permite.inativar && !grupo.permite.reativar) return null;
  const noGrupo = { params: { path: { id: grupo.id } } };

  const aplicarResultado = (resultado: { dados: Ficha } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return resultado;
    aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoesDaPessoa}>
      <div className={estilos.gruposDeAcoes}>
        {grupo.permite.reativar && (
          <Botao
            carregando={reativando}
            rotuloCarregando="Reativando"
            onPress={async () => {
              definirReativando(true);
              definirFalha(null);
              const resultado = aplicarResultado(
                await pedir(() => api.POST('/grupos/{id}/reativacao', noGrupo), 'reativar o grupo'),
                'Grupo reativado.',
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
        {grupo.permite.inativar && (
          <Confirmacao
            acao="Inativar"
            titulo={`Inativar o grupo ${grupo.nome}?`}
            confirmar="Inativar o grupo"
            confirmando="Inativando"
            fazer={async () =>
              aplicarResultado(
                await pedir(() => api.POST('/grupos/{id}/inativacao', noGrupo), 'inativar o grupo'),
                'Grupo inativado.',
              )
            }
          >
            <p className={estilos.informacao}>
              Os membros deixam de receber os perfis do grupo. Os membros e os perfis continuam
              registrados, e o grupo pode ser reativado.
            </p>
          </Confirmacao>
        )}
      </div>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}

/** Os membros do grupo, com "Retirar" e "Incluir conta" para quem administra os acessos. */
function MembrosDoGrupo({ grupo, aplicar }: { grupo: Ficha; aplicar: Aplicar }) {
  const api = useApi();
  const { formatarDia } = useDataHora();
  const { titulo, pedirFoco } = useFocoNoTitulo(grupo.membros);
  return (
    <Parte titulo="Membros" refDoTitulo={titulo}>
      {grupo.membros.length === 0 ? (
        <p className={estilos.informacao}>Nenhuma conta participa deste grupo.</p>
      ) : (
        <ul aria-label="Membros do grupo" className={estilos.itens}>
          {grupo.membros.map((membro) => (
            <li key={membro.contaId} className={estilos.item}>
              <div className={estilos.textoDoItem}>
                <p className={estilos.nomeDoItem}>
                  <Link
                    to="/administracao/pessoas/$id"
                    params={{ id: membro.pessoaId }}
                    className={estilos.link}
                  >
                    {membro.nome}
                  </Link>
                  {membro.situacao !== 'ativa' && (
                    <RotuloDeSituacao situacao="neutra">
                      {membro.situacao === 'inativa' ? 'Conta inativa' : 'Conta anonimizada'}
                    </RotuloDeSituacao>
                  )}
                </p>
                <p className={estilos.detalheDoItem}>
                  {membro.usuario && `${membro.usuario} · `}Incluída em{' '}
                  {formatarDia(new Date(membro.incluidaEm))}
                </p>
              </div>
              {grupo.permite.incluirMembros && (
                <Confirmacao
                  acao="Retirar"
                  nomeDoGatilho={`Retirar ${membro.nome} do grupo`}
                  titulo={`Retirar ${membro.nome} do grupo ${grupo.nome}?`}
                  confirmar="Retirar do grupo"
                  confirmando="Retirando"
                  fazer={async () => {
                    const resultado = await pedir(
                      () =>
                        api.DELETE('/grupos/{id}/membros/{contaId}', {
                          params: { path: { id: grupo.id, contaId: membro.contaId } },
                        }),
                      'retirar a conta do grupo',
                    );
                    if ('erro' in resultado) return resultado;
                    pedirFoco();
                    aplicar(resultado.dados);
                    avisar({
                      situacao: 'sucesso',
                      titulo: `Conta retirada do grupo ${grupo.nome}.`,
                    });
                    return { ok: true };
                  }}
                >
                  <p className={estilos.informacao}>
                    A conta perde os perfis que vêm do grupo. A participação continua registrada.
                  </p>
                </Confirmacao>
              )}
            </li>
          ))}
        </ul>
      )}
      {grupo.permite.incluirMembros && (
        <div className={estilos.acoes}>
          <IncluirConta grupo={grupo} aplicar={aplicar} />
        </div>
      )}
    </Parte>
  );
}

/** Incluir uma conta no grupo, escolhida pela busca entre as pessoas ativas com conta. */
function IncluirConta({ grupo, aplicar }: { grupo: Ficha; aplicar: Aplicar }) {
  const api = useApi();
  const [aberto, definirAberto] = useState(false);
  const [conta, definirConta] = useState<ContaDoSeletor | null>(null);
  const [erro, definirErro] = useState<string | undefined>();
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const membros = useMemo(
    () => new Set(grupo.membros.map((membro) => membro.contaId)),
    [grupo.membros],
  );
  const buscar = useCallback(
    async (texto: string) => {
      const resultado = await pedir(
        () =>
          api.GET('/pessoas', {
            params: { query: { busca: texto, conta: 'com', limite: 8 } },
          }),
        'buscar as contas',
      );
      if ('erro' in resultado) throw new Error(resultado.erro);
      return resultado.dados.itens.flatMap((pessoa) =>
        pessoa.conta && !membros.has(pessoa.conta.id)
          ? [{ id: pessoa.conta.id, rotulo: `${pessoa.nome} (${pessoa.conta.usuario ?? ''})` }]
          : [],
      );
    },
    [api, membros],
  );

  async function incluir() {
    definirFalha(null);
    if (!conta) return definirErro('Escolha a conta.');
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.POST('/grupos/{id}/membros', {
            params: { path: { id: grupo.id } },
            body: { contaId: conta.id },
          }),
        'incluir a conta no grupo',
      );
      if ('erro' in resultado) {
        definirFalha(resultado.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      definirAberto(false);
      aplicar(resultado.dados);
      avisar({ situacao: 'sucesso', titulo: `Conta incluída no grupo ${grupo.nome}.` });
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Dialogo
      titulo={`Incluir uma conta no grupo ${grupo.nome}`}
      gatilho={<Botao>Incluir conta</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        if (!abrir) return;
        definirConta(null);
        definirErro(undefined);
        definirFalha(null);
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Incluindo"
            onPress={incluir}
          >
            Incluir
          </Botao>
        </>
      )}
    >
      <SeletorDeConta
        rotulo="Conta"
        obrigatorio
        descricao="Busque pelo nome, pela matrícula ou pelo usuário."
        valor={conta}
        aoMudar={(escolhida) => {
          definirConta(escolhida);
          definirErro(undefined);
        }}
        buscar={buscar}
        erro={erro}
      />
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Dialogo>
  );
}

/** Os perfis do grupo, com o escopo; quem administra atribui e encerra. */
function PerfisDoGrupo({ grupo }: { grupo: Ficha }) {
  const api = useApi();
  const consultas = useQueryClient();
  const { titulo, pedirFoco } = useFocoNoTitulo(grupo.perfis);
  const atualizar = useCallback(async () => {
    await Promise.all(
      [chaveDoGrupo(grupo.id), ...RELACIONADAS].map((queryKey) =>
        consultas.invalidateQueries({ queryKey }),
      ),
    );
  }, [consultas, grupo.id]);
  return (
    <Parte titulo="Perfis" refDoTitulo={titulo}>
      {grupo.perfis.length === 0 ? (
        <p className={estilos.informacao}>Este grupo não tem perfis.</p>
      ) : (
        <ul aria-label="Perfis do grupo" className={estilos.itens}>
          {grupo.perfis.map(({ atribuicaoId, perfil, local }) => (
            <li key={atribuicaoId} className={estilos.item}>
              <div className={estilos.textoDoItem}>
                <p className={estilos.nomeDoItem}>
                  <Link
                    to="/administracao/perfis/$id"
                    params={{ id: perfil.id }}
                    className={estilos.link}
                  >
                    {perfil.nome}
                  </Link>
                  {perfil.situacao === 'inativo' && (
                    <RotuloDeSituacao situacao="neutra">Perfil inativo</RotuloDeSituacao>
                  )}
                </p>
                <p className={estilos.detalheDoItem}>{local?.caminho ?? 'Organização inteira'}</p>
              </div>
              {grupo.permite.editar && (
                <Confirmacao
                  acao="Encerrar"
                  nomeDoGatilho={`Encerrar a atribuição de ${perfil.nome} ${noEscopo(local)}`}
                  titulo={`Encerrar a atribuição de ${perfil.nome}?`}
                  confirmar="Encerrar a atribuição"
                  confirmando="Encerrando"
                  fazer={async () => {
                    const resultado = await pedir(
                      () =>
                        api.DELETE('/atribuicoes/{id}', { params: { path: { id: atribuicaoId } } }),
                      'encerrar a atribuição',
                    );
                    if ('erro' in resultado) return resultado;
                    pedirFoco();
                    await atualizar();
                    avisar({ situacao: 'sucesso', titulo: 'Atribuição encerrada.' });
                    return { ok: true };
                  }}
                >
                  <p className={estilos.informacao}>
                    Os membros perdem as permissões que vêm deste perfil {noEscopo(local)}. A
                    atribuição continua registrada.
                  </p>
                </Confirmacao>
              )}
            </li>
          ))}
        </ul>
      )}
      {grupo.permite.atribuir && (
        <div className={estilos.acoes}>
          <AtribuirPerfil
            titulo={`Atribuir um perfil ao grupo ${grupo.nome}`}
            alvo={{ grupoId: grupo.id }}
            quem={`O grupo ${grupo.nome}`}
            emVigor={grupo.perfis}
            atualizar={atualizar}
          />
        </div>
      )}
    </Parte>
  );
}
