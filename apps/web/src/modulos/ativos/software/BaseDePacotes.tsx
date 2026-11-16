// A base de pacotes (spec distribuicao-de-software, "Tela da base"; change software-por-pacote, m12):
// as abas por categoria, com "Todos" e quantos pacotes cada uma tem; "Procurar na base"; "Só os
// desatualizados"; e, para quem administra o software, "Novo pacote" e "Categorias…". A tabela vem
// com os mais desatualizados primeiro, cada linha abre a ficha do pacote, e o pé diz quantas
// instalações estão abaixo da versão-alvo.
import { normalizarTexto } from '@grafite/domain';
import {
  Botao,
  BotaoAlternavel,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeBusca,
  Celula,
  Coluna,
  ControleSegmentado,
  CorpoDaTabela,
  type DirecaoDaOrdenacao,
  EstadoVazio,
  Icone,
  Linha,
  RotuloDeSituacao,
  Segmento,
  type Situacao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, ChevronRight, ListFilter, Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import estilos from './BaseDePacotes.module.css';
import { Categorias } from './Categorias.tsx';
import { type PacoteNaBase, useCategorias, usePacotes } from './consultas.ts';
import { momentoCurto, plural, tipoETamanho } from './formatos.ts';
import { Pacote } from './Pacote.tsx';
import { BarraDeSituacoes, IconeDoPacote } from './Pecas.tsx';

const TODOS = 'todos';

/** A situação do pacote frente à base, em rótulo. */
function situacaoDoPacote(pacote: PacoteNaBase): { situacao: Situacao; texto: string } {
  if (pacote.situacao === 'inativo') return { situacao: 'neutra', texto: 'Inativo' };
  const { desatualizadas } = pacote.contas;
  if (desatualizadas === null) return { situacao: 'neutra', texto: 'Sem versão-alvo' };
  if (desatualizadas > 0) {
    return {
      situacao: 'atencao',
      texto: plural(desatualizadas, 'desatualizada', 'desatualizadas'),
    };
  }
  return { situacao: 'sucesso', texto: 'Todas em dia' };
}

/**
 * A ordem pela "Situação": a decrescente, a da API, com os mais desatualizados primeiro; a crescente,
 * com os em dia primeiro. O nome desempata nas duas.
 */
const pelaSituacao = (direcao: DirecaoDaOrdenacao) => (a: PacoteNaBase, b: PacoteNaBase) =>
  ((b.contas.desatualizadas ?? 0) - (a.contas.desatualizadas ?? 0)) *
    (direcao === 'decrescente' ? 1 : -1) ||
  a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true });

function Pe({ pacotes, maquinas }: { pacotes: readonly PacoteNaBase[]; maquinas: number }) {
  const ativos = pacotes.filter(({ situacao }) => situacao === 'ativo');
  const abaixo = ativos.reduce((soma, { contas }) => soma + (contas.desatualizadas ?? 0), 0);
  const comAbaixo = ativos.filter(({ contas }) => (contas.desatualizadas ?? 0) > 0).length;
  const entre = `entre as ${maquinas} ${maquinas === 1 ? 'máquina' : 'máquinas'} com o agente do GLPI`;
  const navegar = useNavigate();
  return (
    <div className={estilos.pe}>
      {abaixo > 0 ? (
        <>
          <RotuloDeSituacao situacao="atencao">
            {plural(abaixo, 'instalação', 'instalações')} abaixo da versão-alvo
          </RotuloDeSituacao>
          <span>
            em {plural(comAbaixo, 'pacote', 'pacotes')}, {entre}
          </span>
        </>
      ) : (
        <>
          <RotuloDeSituacao situacao="sucesso">Nenhuma abaixo da versão-alvo</RotuloDeSituacao>
          <span>{entre.charAt(0).toUpperCase() + entre.slice(1)}</span>
        </>
      )}
      <Botao onPress={() => void navegar({ to: '/gestao/software/matriz' })}>
        Ver na matriz
        <Icone icone={ArrowRight} />
      </Botao>
    </div>
  );
}

/** A tela da base de pacotes. */
export function BaseDePacotes() {
  const pacotes = usePacotes();
  const categorias = useCategorias();
  const dataHora = useDataHora();
  const navegar = useNavigate();
  const [busca, definirBusca] = useState('');
  const [categoria, definirCategoria] = useState(TODOS);
  const [soDesatualizados, definirSoDesatualizados] = useState(false);
  const [direcao, definirDirecao] = useState<DirecaoDaOrdenacao>('decrescente');
  const [editando, definirEditando] = useState<'novo' | null>(null);
  const [nasCategorias, definirNasCategorias] = useState(false);
  const administra = pacotes.data?.permite.administrar ?? false;
  const lista = pacotes.data?.pacotes ?? [];
  const agora = new Date();

  const termo = normalizarTexto(busca.trim());
  const vistos = lista
    .filter(
      (pacote) =>
        (categoria === TODOS || pacote.categoria?.id === categoria) &&
        (!soDesatualizados || (pacote.contas.desatualizadas ?? 0) > 0) &&
        (!termo || normalizarTexto(pacote.nome).includes(termo)),
    )
    .sort(pelaSituacao(direcao));
  const quantosNa = (id: string) => lista.filter((pacote) => pacote.categoria?.id === id).length;

  return (
    <div className={estilos.tela} data-janela-inteira="">
      <CabecalhoDaPagina
        titulo="Base de pacotes"
        acoes={
          <>
            <CampoDeBusca
              rotulo="Procurar na base"
              value={busca}
              onChange={definirBusca}
              autoComplete="off"
              className={estilos.busca}
            />
            <BotaoAlternavel
              icone={ListFilter}
              isSelected={soDesatualizados}
              onChange={definirSoDesatualizados}
            >
              Só os desatualizados
            </BotaoAlternavel>
            {administra && (
              <Botao icone={Tags} onPress={() => definirNasCategorias(true)}>
                Categorias…
              </Botao>
            )}
            {administra && (
              <Botao nivel="primario" icone={Plus} onPress={() => definirEditando('novo')}>
                Novo pacote
              </Botao>
            )}
          </>
        }
      />
      {pacotes.isError ? (
        <EstadoVazio
          className={estilos.falha}
          titulo={pacotes.error.message}
          acao={<Botao onPress={() => void pacotes.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <>
          <div className={estilos.categorias}>
            <ControleSegmentado
              rotulo="Categoria"
              ocultarRotulo
              value={categoria}
              onChange={definirCategoria}
            >
              <Segmento value={TODOS}>
                Todos<span className={estilos.quantos}>{lista.length}</span>
              </Segmento>
              {(categorias.data?.categorias ?? []).map(({ id, nome }) => (
                <Segmento key={id} value={id}>
                  {nome}
                  <span className={estilos.quantos}>{quantosNa(id)}</span>
                </Segmento>
              ))}
            </ControleSegmentado>
          </div>
          <div className={estilos.faixaDaTabela}>
            <Tabela
              rotulo="Base de pacotes"
              className={estilos.tabela}
              carregando={pacotes.isPending}
              ordenacao={{ coluna: 'situacao', direcao }}
              aoOrdenar={(nova) => definirDirecao(nova.direcao)}
              aoAbrirLinha={(id) =>
                void navegar({ to: '/gestao/software/pacotes/$id', params: { id: String(id) } })
              }
            >
              <CabecalhoDaTabela>
                <Coluna id="pacote" principal>
                  Pacote
                </Coluna>
                <Coluna id="versao" especie="codigo">
                  Versão-alvo
                </Coluna>
                <Coluna id="instalado">Instalado em</Coluna>
                <Coluna id="situacao" especie="situacao" ordenavel>
                  Situação
                </Coluna>
                <Coluna id="ultima">Última distribuição</Coluna>
                <Coluna id="abrir" rotuloOculto largura={40}>
                  Abrir
                </Coluna>
              </CabecalhoDaTabela>
              <CorpoDaTabela
                itens={vistos}
                vazio={
                  lista.length > 0 ? (
                    <EstadoVazio titulo="Nenhum pacote com esse filtro." />
                  ) : administra ? (
                    <EstadoVazio
                      titulo="Nenhum pacote na base ainda."
                      descricao="Cadastre o instalador e o comando silencioso. Depois, distribua às máquinas com o agente do GLPI, que baixa e instala sozinho."
                      acao={
                        <Botao icone={Plus} onPress={() => definirEditando('novo')}>
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
                {(pacote) => {
                  const { contas, ultimaDistribuicao } = pacote;
                  const situacao = situacaoDoPacote(pacote);
                  return (
                    <Linha id={pacote.id}>
                      <Celula>
                        <span className={estilos.pacote}>
                          <IconeDoPacote nome={pacote.nome} tamanho="p" />
                          <span>
                            <span className={estilos.nome}>{pacote.nome}</span>
                            <span className={estilos.tipo}>{tipoETamanho(pacote)}</span>
                          </span>
                        </span>
                      </Celula>
                      <Celula>{pacote.versao ?? '—'}</Celula>
                      <Celula>
                        <span className={estilos.instalado}>
                          <BarraDeSituacoes
                            className={estilos.barra}
                            partes={
                              contas.naVersao === null
                                ? [
                                    { parte: 'ok', quantidade: contas.instalado },
                                    { parte: 'neutra', quantidade: contas.sem },
                                  ]
                                : [
                                    { parte: 'ok', quantidade: contas.naVersao },
                                    { parte: 'atencao', quantidade: contas.desatualizadas ?? 0 },
                                    { parte: 'neutra', quantidade: contas.sem },
                                  ]
                            }
                          />
                          <span className={estilos.numeros}>
                            <b className={estilos.forte}>{contas.instalado}</b> de {contas.maquinas}
                          </span>
                        </span>
                      </Celula>
                      <Celula>
                        <RotuloDeSituacao situacao={situacao.situacao}>
                          {situacao.texto}
                        </RotuloDeSituacao>
                      </Celula>
                      <Celula>
                        {ultimaDistribuicao ? (
                          <span>
                            <span className={estilos.mono}>
                              {momentoCurto(new Date(ultimaDistribuicao.criadaEm), agora, dataHora)}
                            </span>
                            {` · ${ultimaDistribuicao.paraQuem}`}
                          </span>
                        ) : (
                          'Nunca distribuído'
                        )}
                      </Celula>
                      <Celula>
                        <span className={estilos.abrir}>
                          <Icone icone={ChevronRight} />
                        </span>
                      </Celula>
                    </Linha>
                  );
                }}
              </CorpoDaTabela>
            </Tabela>
          </div>
          {pacotes.data && lista.length > 0 && (
            <Pe pacotes={lista} maquinas={pacotes.data.maquinas} />
          )}
        </>
      )}
      {editando && <Pacote pacote={null} aoFechar={() => definirEditando(null)} />}
      {nasCategorias && <Categorias aoFechar={() => definirNasCategorias(false)} />}
    </div>
  );
}
