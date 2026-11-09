import type { components } from '@grafite/api-client';
import { descricaoDa, normalizarTexto } from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaTabela,
  CampoDeTexto,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  RotuloDeSituacao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { AtribuirPerfil } from '../atribuicoes/AtribuirPerfil.tsx';
import { Confirmacao } from '../Confirmacao.tsx';
import { ReferenciaAoLocal } from '../locais/ReferenciaAoLocal.tsx';
import { Parte, useFocoNoTitulo } from '../Parte.tsx';
import type { Conta } from './ContaDaPessoa.tsx';
import { efeitoDeIncluir, efeitoDeRetirar } from './efeitoDoGrupo.ts';
import type { Ficha } from './ficha.ts';

type Acesso = components['schemas']['AcessoDaConta'];
type Origem = components['schemas']['OrigemDaPermissao'];
type Grupo = components['schemas']['Grupo'];

/** A chave do acesso de uma conta nas consultas. */
export const chaveDoAcessoDaConta = (contaId: string) => ['acesso-da-conta', contaId] as const;

const ORGANIZACAO_INTEIRA = 'Organização inteira';

/** "em Jundiaí", ou "na organização inteira". */
const noEscopo = (local: { caminho: string } | null) =>
  local ? `em ${local.caminho}` : 'na organização inteira';

const textoDaOrigem = (origem: Origem) =>
  `Vem do perfil ${origem.perfil.nome} ${noEscopo(origem.local)}, ${
    origem.grupo ? `pelo grupo ${origem.grupo.nome}` : 'atribuído direto à conta'
  }.`;

/** Depois de uma mudança, o acesso da conta é relido, e as listas de perfis e grupos também. */
function useAtualizarAcesso(contaId: string) {
  const consultas = useQueryClient();
  return useCallback(async () => {
    await Promise.all(
      [chaveDoAcessoDaConta(contaId), ['perfis'], ['perfil'], ['grupos'], ['grupo']].map(
        (queryKey) => consultas.invalidateQueries({ queryKey }),
      ),
    );
  }, [consultas, contaId]);
}

/**
 * Os perfis, os grupos e o que a conta pode fazer, na aba Acesso (spec administracao-de-pessoas;
 * spec perfis-e-grupos), para quem vê os acessos. Quem os administra atribui e encerra perfis e
 * inclui e retira a conta dos grupos.
 */
export function AcessoDaConta({ pessoa, conta }: { pessoa: Ficha; conta: Conta }) {
  const api = useApi();
  const acesso = useQuery({
    queryKey: chaveDoAcessoDaConta(conta.id),
    queryFn: () =>
      consultar(
        () => api.GET('/contas/{id}/acesso', { params: { path: { id: conta.id } } }),
        'carregar o acesso da conta',
      ),
  });

  if (acesso.isPending) {
    return (
      <Parte titulo="Perfis">
        <p role="status" className={estilos.informacao}>
          Carregando os perfis e os grupos…
        </p>
      </Parte>
    );
  }
  if (acesso.isError) {
    return (
      <Parte titulo="Perfis">
        <div className={estilos.falha}>
          <p role="alert" className={estilos.informacao}>
            {acesso.error.message}
          </p>
          <Botao onPress={() => void acesso.refetch()}>Tentar de novo</Botao>
        </div>
      </Parte>
    );
  }
  return (
    <>
      <PerfisDaConta pessoa={pessoa} conta={conta} acesso={acesso.data} />
      <GruposDaConta pessoa={pessoa} conta={conta} acesso={acesso.data} />
      <PermissoesDaConta conta={conta} acesso={acesso.data} />
    </>
  );
}

interface PropsDaParteDoAcesso {
  pessoa: Ficha;
  conta: Conta;
  acesso: Acesso;
}

/** Os perfis da conta, diretos e por grupo, com o escopo; só os diretos se encerram aqui. */
function PerfisDaConta({ pessoa, conta, acesso }: PropsDaParteDoAcesso) {
  const api = useApi();
  const atualizar = useAtualizarAcesso(conta.id);
  const { titulo, pedirFoco } = useFocoNoTitulo(acesso.atribuicoes);
  return (
    <Parte titulo="Perfis" refDoTitulo={titulo}>
      {acesso.atribuicoes.length === 0 ? (
        <p className={estilos.informacao}>Esta conta não tem perfis.</p>
      ) : (
        <ul aria-label="Perfis da conta" className={estilos.itens}>
          {acesso.atribuicoes.map((atribuicao) => (
            <li key={atribuicao.id} className={estilos.item}>
              <div className={estilos.textoDoItem}>
                <p className={estilos.nomeDoItem}>
                  {atribuicao.perfil.nome}
                  {atribuicao.perfil.situacao === 'inativo' && (
                    <RotuloDeSituacao situacao="neutra">Perfil inativo</RotuloDeSituacao>
                  )}
                </p>
                <p className={estilos.detalheDoItem}>
                  {atribuicao.local ? (
                    <ReferenciaAoLocal local={atribuicao.local} />
                  ) : (
                    ORGANIZACAO_INTEIRA
                  )}{' '}
                  ·{' '}
                  {atribuicao.grupo
                    ? `Pelo grupo ${atribuicao.grupo.nome}`
                    : 'Atribuído direto à conta'}
                </p>
              </div>
              {atribuicao.permite.encerrar && (
                <Confirmacao
                  acao="Encerrar"
                  nomeDoGatilho={`Encerrar a atribuição de ${atribuicao.perfil.nome} ${noEscopo(
                    atribuicao.local,
                  )}`}
                  titulo={`Encerrar a atribuição de ${atribuicao.perfil.nome}?`}
                  confirmar="Encerrar a atribuição"
                  confirmando="Encerrando"
                  fazer={async () => {
                    const resultado = await pedir(
                      () =>
                        api.DELETE('/atribuicoes/{id}', {
                          params: { path: { id: atribuicao.id } },
                        }),
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
                    A conta perde as permissões que vêm deste perfil {noEscopo(atribuicao.local)}. A
                    atribuição continua registrada.
                  </p>
                </Confirmacao>
              )}
            </li>
          ))}
        </ul>
      )}
      {acesso.permite.atribuir && (
        <div className={estilos.acoes}>
          <AtribuirPerfil
            titulo={`Atribuir um perfil a ${pessoa.nome}`}
            alvo={{ contaId: conta.id }}
            quem={pessoa.nome}
            emVigor={acesso.atribuicoes}
            localSugerido={
              pessoa.local?.situacao === 'ativo'
                ? { id: pessoa.local.id, origem: `local de trabalho de ${pessoa.nome}` }
                : null
            }
            atualizar={atualizar}
          />
        </div>
      )}
    </Parte>
  );
}

/** Com mais grupos que estes, a tabela ganha o filtro pelo nome. */
const GRUPOS_SEM_FILTRO = 10;

/** "Técnico · organização inteira", um por linha, ou "Nenhum perfil". */
const perfisQueDa = (grupo: Grupo) =>
  grupo.perfisEmVigor.length === 0
    ? ['Nenhum perfil']
    : grupo.perfisEmVigor.map(
        ({ perfil, local }) => `${perfil.nome} · ${local?.caminho ?? ORGANIZACAO_INTEIRA}`,
      );

/**
 * Os grupos da conta numa tabela com todos os grupos ativos (spec administracao-de-pessoas, "Acesso
 * de uma conta"; design do escolhas-a-vista, decisão 5): o que cada um dá, se a conta participa e,
 * a quem administra os acessos, "Incluir" ou "Retirar" na linha, com o efeito antes de confirmar.
 */
function GruposDaConta({ pessoa, conta, acesso }: PropsDaParteDoAcesso) {
  const api = useApi();
  const { formatarData } = useDataHora();
  const atualizar = useAtualizarAcesso(conta.id);
  const { titulo, pedirFoco } = useFocoNoTitulo(acesso.grupos);
  const [filtro, definirFiltro] = useState('');
  const grupos = useQuery({
    queryKey: ['grupos'],
    queryFn: () => consultar(() => api.GET('/grupos'), 'carregar os grupos'),
  });
  const participacoes = new Map(acesso.grupos.map((grupo) => [grupo.id, grupo]));
  // Os grupos ativos, e os inativos de que a conta ainda participa.
  const linhas = (grupos.data?.itens ?? []).filter(
    (grupo) => grupo.situacao === 'ativo' || participacoes.has(grupo.id),
  );
  const comFiltro = linhas.length > GRUPOS_SEM_FILTRO;
  const termo = normalizarTexto(filtro);
  const mostradas = comFiltro
    ? linhas.filter((grupo) => normalizarTexto(grupo.nome).includes(termo))
    : linhas;

  async function incluir(grupo: Grupo) {
    const resultado = await pedir(
      () =>
        api.POST('/grupos/{id}/membros', {
          params: { path: { id: grupo.id } },
          body: { contaId: conta.id },
        }),
      'incluir a conta no grupo',
    );
    if ('erro' in resultado) return resultado;
    await atualizar();
    avisar({ situacao: 'sucesso', titulo: `Conta incluída no grupo ${grupo.nome}.` });
    return { ok: true } as const;
  }

  async function retirar(grupo: Grupo) {
    const resultado = await pedir(
      () =>
        api.DELETE('/grupos/{id}/membros/{contaId}', {
          params: { path: { id: grupo.id, contaId: conta.id } },
        }),
      'retirar a conta do grupo',
    );
    if ('erro' in resultado) return resultado;
    pedirFoco();
    await atualizar();
    avisar({ situacao: 'sucesso', titulo: `Conta retirada do grupo ${grupo.nome}.` });
    return { ok: true } as const;
  }

  return (
    <Parte titulo="Grupos" refDoTitulo={titulo}>
      {grupos.isPending ? (
        <p role="status" className={estilos.informacao}>
          Carregando os grupos…
        </p>
      ) : grupos.isError ? (
        <div className={estilos.falha}>
          <p role="alert" className={estilos.informacao}>
            {grupos.error.message}
          </p>
          <Botao onPress={() => void grupos.refetch()}>Tentar de novo</Botao>
        </div>
      ) : (
        <>
          {comFiltro && (
            <div className={estilos.filtroDaLista}>
              <CampoDeTexto
                rotulo="Filtrar os grupos"
                type="search"
                value={filtro}
                onChange={definirFiltro}
              />
              <p className={estilos.informacao}>
                {mostradas.length === linhas.length
                  ? `${linhas.length} grupos.`
                  : `Mostrando ${mostradas.length} de ${linhas.length} grupos.`}
              </p>
            </div>
          )}
          <Tabela rotulo="Grupos da conta">
            <CabecalhoDaTabela>
              <Coluna id="grupo" principal>
                Grupo
              </Coluna>
              <Coluna id="perfis">Perfis que o grupo dá</Coluna>
              <Coluna id="situacao" especie="situacao">
                Situação da conta
              </Coluna>
              <Coluna id="acao" especie="acoes">
                Ações
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={mostradas}
              // A participação e o efeito vêm do acesso da conta, e não dos grupos da linha.
              dependencias={[acesso]}
              vazio={
                <EstadoVazio
                  titulo={
                    linhas.length === 0
                      ? 'Nenhum grupo ativo na organização.'
                      : `Nenhum grupo com “${filtro.trim()}”.`
                  }
                />
              }
            >
              {(grupo) => {
                const participacao = participacoes.get(grupo.id);
                const podeMudar = acesso.permite.atribuir && grupo.permite.incluirMembros;
                return (
                  <Linha id={grupo.id}>
                    <Celula>
                      <Link
                        to="/administracao/grupos/$id"
                        params={{ id: grupo.id }}
                        className={estilos.link}
                      >
                        {grupo.nome}
                      </Link>
                      {grupo.situacao === 'inativo' && (
                        <RotuloDeSituacao situacao="neutra">Grupo inativo</RotuloDeSituacao>
                      )}
                    </Celula>
                    <Celula>
                      <span className={estilos.linhasDaCelula}>
                        {perfisQueDa(grupo).map((texto) => (
                          <span key={texto}>{texto}</span>
                        ))}
                      </span>
                    </Celula>
                    <Celula>
                      {participacao
                        ? `Participa desde ${formatarData(new Date(participacao.incluidaEm))}`
                        : 'Não participa'}
                    </Celula>
                    <Celula>
                      {podeMudar &&
                        (participacao ? (
                          <Confirmacao
                            acao="Retirar"
                            nivelDoGatilho="secundario"
                            nomeDoGatilho={`Retirar do grupo ${grupo.nome}`}
                            titulo={`Retirar a conta do grupo ${grupo.nome}?`}
                            confirmar="Retirar do grupo"
                            confirmando="Retirando"
                            fazer={() => retirar(grupo)}
                          >
                            <Efeito
                              frases={efeitoDeRetirar(pessoa.nome, grupo, acesso.atribuicoes)}
                            />
                            <p className={estilos.informacao}>
                              A participação continua registrada.
                            </p>
                          </Confirmacao>
                        ) : (
                          grupo.situacao === 'ativo' && (
                            <Confirmacao
                              acao="Incluir"
                              nivelDoGatilho="secundario"
                              destrutiva={false}
                              nomeDoGatilho={`Incluir no grupo ${grupo.nome}`}
                              titulo={`Incluir ${pessoa.nome} no grupo ${grupo.nome}?`}
                              confirmar="Incluir no grupo"
                              confirmando="Incluindo"
                              fazer={() => incluir(grupo)}
                            >
                              <Efeito
                                frases={efeitoDeIncluir(pessoa.nome, grupo, acesso.atribuicoes)}
                              />
                            </Confirmacao>
                          )
                        ))}
                    </Celula>
                  </Linha>
                );
              }}
            </CorpoDaTabela>
          </Tabela>
        </>
      )}
    </Parte>
  );
}

/** O efeito em texto, uma frase por perfil. */
function Efeito({ frases }: { frases: string[] }) {
  return (
    <ul className={estilos.efeito}>
      {frases.map((frase) => (
        <li key={frase}>{frase}</li>
      ))}
    </ul>
  );
}

/** O que a conta pode fazer: cada permissão efetiva, com o escopo e de onde ela vem. */
function PermissoesDaConta({ conta, acesso }: { conta: Conta; acesso: Acesso }) {
  const titulo = 'O que esta conta pode fazer';
  if (conta.situacao !== 'ativa') {
    return (
      <Parte titulo={titulo}>
        <p className={estilos.informacao}>
          {conta.situacao === 'inativa'
            ? 'Nada, enquanto a conta estiver inativa.'
            : 'Nada: a conta foi anonimizada.'}
        </p>
      </Parte>
    );
  }
  return (
    <Parte titulo={titulo}>
      {acesso.permissoes.length === 0 ? (
        <p className={estilos.informacao}>Esta conta não tem nenhuma permissão.</p>
      ) : (
        <ul aria-label={titulo} className={estilos.itens}>
          {acesso.permissoes.map((permissao) => (
            <li key={permissao.chave} className={estilos.permissao}>
              <p className={estilos.nomeDoItem}>
                {descricaoDa(permissao.chave)} —{' '}
                {permissao.organizacao
                  ? ORGANIZACAO_INTEIRA
                  : permissao.locais.map((local) => local.caminho).join(', ')}
              </p>
              <ul className={estilos.origens}>
                {permissao.origens.map((origem) => (
                  <li key={origem.atribuicaoId}>{textoDaOrigem(origem)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Parte>
  );
}
