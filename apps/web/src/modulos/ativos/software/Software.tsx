// A tela Software do Ativos (spec distribuicao-de-software, "Base de software" e "Histórico das
// distribuições"; change distribuicao-de-software, design, decisão 6), em duas abas. A Base tem a
// busca, a tabela dos pacotes, o "Novo pacote" para quem administra o software e o "Distribuir" de
// cada pacote ativo. As Distribuições têm a lista, da mais nova para a mais antiga, com o progresso,
// que leva à ficha de cada uma.
import { normalizarTexto } from '@grafite/domain';
import {
  Abas,
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeTexto,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  formatarTamanho,
  Linha,
  RotuloDeSituacao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import {
  CHAVE_DO_SOFTWARE,
  type PacoteDeSoftware,
  useDistribuicoes,
  usePacotes,
} from './consultas.ts';
import { Distribuir } from './Distribuir.tsx';
import { Pacote } from './Pacote.tsx';
import estilos from './Software.module.css';

export type AbaDoSoftware = 'base' | 'distribuicoes';

/** A aba pelo endereço: `?aba=distribuicoes`; sem ela, a Base. */
export const lerAbaDoSoftware = (busca: Record<string, unknown>): { aba?: 'distribuicoes' } =>
  busca.aba === 'distribuicoes' ? { aba: 'distribuicoes' } : {};

function BaseDeSoftware({
  aoEditar,
  aoDistribuir,
}: {
  aoEditar: (pacote: PacoteDeSoftware | 'novo') => void;
  aoDistribuir: (pacote: PacoteDeSoftware) => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const pacotes = usePacotes();
  const [busca, definirBusca] = useState('');
  const [ocupado, definirOcupado] = useState<string | null>(null);
  if (pacotes.isPending) {
    return (
      <p role="status" className={estilos.nota}>
        Carregando a base de software…
      </p>
    );
  }
  if (pacotes.isError) {
    return (
      <EstadoVazio
        titulo={pacotes.error.message}
        acao={<Botao onPress={() => void pacotes.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  const { pacotes: lista, permite } = pacotes.data;

  async function mudarSituacao(pacote: PacoteDeSoftware) {
    definirOcupado(pacote.id);
    const caminho = { params: { path: { id: pacote.id } } };
    const resultado = await pedir(
      () =>
        pacote.situacao === 'ativo'
          ? api.POST('/software/pacotes/{id}/inativacao', caminho)
          : api.POST('/software/pacotes/{id}/reativacao', caminho),
      'mudar o pacote',
    );
    definirOcupado(null);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo: pacote.situacao === 'ativo' ? 'Pacote inativado.' : 'Pacote reativado.',
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
  }

  const termo = normalizarTexto(busca.trim());
  const vistos = termo
    ? lista.filter((pacote) =>
        normalizarTexto(
          `${pacote.nome} ${pacote.versao ?? ''} ${pacote.arquivo?.nome ?? ''}`,
        ).includes(termo),
      )
    : lista;
  return (
    <div className={estilos.aba}>
      {lista.length > 0 && (
        <div className={estilos.busca}>
          <CampoDeTexto
            rotulo="Procurar na base"
            type="search"
            value={busca}
            onChange={definirBusca}
            autoComplete="off"
          />
        </div>
      )}
      <Tabela rotulo="Base de software">
        <CabecalhoDaTabela>
          <Coluna id="pacote" principal>
            Pacote
          </Coluna>
          <Coluna id="versao" especie="codigo">
            Versão
          </Coluna>
          <Coluna id="arquivo" especie="codigo">
            Arquivo
          </Coluna>
          <Coluna id="comando" especie="codigo">
            Comando
          </Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          <Coluna id="acoes" especie="acoes">
            Ações
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={vistos}
          vazio={
            lista.length > 0 ? (
              <EstadoVazio titulo="Nenhum pacote com esse texto." />
            ) : permite.administrar ? (
              <EstadoVazio
                titulo="Nenhum pacote na base ainda."
                descricao="Cadastre o instalador e o comando silencioso. Depois, distribua às máquinas com o agente do GLPI, que baixa e instala sozinho."
                acao={
                  <Botao icone={Plus} onPress={() => aoEditar('novo')}>
                    Novo pacote
                  </Botao>
                }
              />
            ) : (
              <EstadoVazio
                titulo="Nenhum pacote na base ainda."
                descricao="Quem administra o software cadastra os pacotes. Eles aparecem aqui para você distribuir."
              />
            )
          }
        >
          {(pacote) => (
            <Linha id={pacote.id}>
              <Celula>{pacote.nome}</Celula>
              <Celula>{pacote.versao ?? '—'}</Celula>
              <Celula>
                {pacote.arquivo
                  ? `${pacote.arquivo.nome} · ${formatarTamanho(pacote.arquivo.tamanho)}`
                  : 'Sem arquivo'}
              </Celula>
              <Celula>
                <span className={estilos.comando} title={pacote.comando}>
                  {pacote.comando}
                </span>
              </Celula>
              <Celula>
                <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[pacote.situacao].tipo}>
                  {SITUACOES_DO_REGISTRO[pacote.situacao].texto}
                </RotuloDeSituacao>
              </Celula>
              <Celula>
                <span className={estilos.acoes}>
                  {pacote.situacao === 'ativo' && (
                    <Botao icone={Send} onPress={() => aoDistribuir(pacote)}>
                      Distribuir
                    </Botao>
                  )}
                  {permite.administrar && (
                    <>
                      <Botao nivel="terciario" onPress={() => aoEditar(pacote)}>
                        Editar
                      </Botao>
                      <Botao
                        nivel="terciario"
                        carregando={ocupado === pacote.id}
                        onPress={() => void mudarSituacao(pacote)}
                      >
                        {pacote.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
                      </Botao>
                    </>
                  )}
                </span>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

function ListaDasDistribuicoes({ aoDistribuir }: { aoDistribuir: () => void }) {
  const distribuicoes = useDistribuicoes();
  const { formatarDataEHora } = useDataHora();
  if (distribuicoes.isError && !distribuicoes.data) {
    return (
      <EstadoVazio
        titulo={distribuicoes.error.message}
        acao={<Botao onPress={() => void distribuicoes.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  return (
    <div className={estilos.aba}>
      <Tabela rotulo="Distribuições" carregando={distribuicoes.isPending}>
        <CabecalhoDaTabela>
          <Coluna id="pacote" principal>
            Pacote
          </Coluna>
          <Coluna id="criada" especie="data">
            Criada em
          </Coluna>
          <Coluna id="por">Por</Coluna>
          <Coluna id="maquinas" especie="numero">
            Máquinas
          </Coluna>
          <Coluna id="progresso">Progresso</Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={distribuicoes.data?.distribuicoes ?? []}
          vazio={
            <EstadoVazio
              titulo="Nenhuma distribuição ainda."
              descricao="Escolha um pacote da Base e use Distribuir para mandar a instalação às máquinas. O agente de cada uma recebe a tarefa no próximo contato, ou na hora, pelo Pedir agora."
              acao={<Botao onPress={aoDistribuir}>Nova distribuição</Botao>}
            />
          }
        >
          {(distribuicao) => (
            <Linha id={distribuicao.id}>
              <Celula>
                <Link
                  to="/gestao/software/distribuicoes/$id"
                  params={{ id: distribuicao.id }}
                  className={estilos.link}
                >
                  {[distribuicao.pacote.nome, distribuicao.pacote.versao]
                    .filter(Boolean)
                    .join(' · ')}
                </Link>
              </Celula>
              <Celula>{formatarDataEHora(new Date(distribuicao.criadaEm))}</Celula>
              <Celula>{distribuicao.criadaPor}</Celula>
              <Celula>{distribuicao.maquinas}</Celula>
              <Celula>{distribuicao.progresso}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

/** A tela Software, com a Base e as Distribuições. */
export function Software() {
  const { aba = 'base' } = useSearch({ from: '/gestao/software' });
  const navegar = useNavigate({ from: '/gestao/software' });
  const { pode } = useAcesso();
  const pacotes = usePacotes();
  const [editando, definirEditando] = useState<PacoteDeSoftware | 'novo' | null>(null);
  const [distribuindo, definirDistribuindo] = useState<PacoteDeSoftware | 'escolher' | null>(null);
  const administra = pacotes.data?.permite.administrar ?? false;
  const mudarAba = (escolhida: string) =>
    void navegar({ search: escolhida === 'distribuicoes' ? { aba: 'distribuicoes' } : {} });
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Software"
        acoes={
          <>
            {aba === 'base' && administra && (
              <Botao nivel="primario" icone={Plus} onPress={() => definirEditando('novo')}>
                Novo pacote
              </Botao>
            )}
            {aba === 'distribuicoes' && pode('software.distribuir') && (
              <Botao nivel="primario" icone={Send} onPress={() => definirDistribuindo('escolher')}>
                Nova distribuição
              </Botao>
            )}
          </>
        }
      />
      <Abas
        rotulo="Software"
        selecionada={aba}
        aoMudar={mudarAba}
        abas={[
          {
            id: 'base',
            rotulo: 'Base',
            conteudo: (
              <BaseDeSoftware aoEditar={definirEditando} aoDistribuir={definirDistribuindo} />
            ),
          },
          {
            id: 'distribuicoes',
            rotulo: 'Distribuições',
            conteudo: (
              <ListaDasDistribuicoes aoDistribuir={() => definirDistribuindo('escolher')} />
            ),
          },
        ]}
      />
      {editando && (
        <Pacote
          pacote={editando === 'novo' ? null : editando}
          aoFechar={() => definirEditando(null)}
        />
      )}
      {distribuindo && (
        <Distribuir
          pacote={distribuindo === 'escolher' ? null : distribuindo}
          pacotes={pacotes.data?.pacotes ?? []}
          aoFechar={() => definirDistribuindo(null)}
        />
      )}
    </div>
  );
}
