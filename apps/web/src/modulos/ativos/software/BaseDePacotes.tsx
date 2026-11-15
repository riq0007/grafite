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
  CampoDeTexto,
  Celula,
  Coluna,
  ControleSegmentado,
  CorpoDaTabela,
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
import { ChevronRight, ListFilter, Plus, Tags } from 'lucide-react';
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

function Pe({ pacotes, maquinas }: { pacotes: readonly PacoteNaBase[]; maquinas: number }) {
  const ativos = pacotes.filter(({ situacao }) => situacao === 'ativo');
  const abaixo = ativos.reduce((soma, { contas }) => soma + (contas.desatualizadas ?? 0), 0);
  const comAbaixo = ativos.filter(({ contas }) => (contas.desatualizadas ?? 0) > 0).length;
  const entre = `entre as ${maquinas} ${maquinas === 1 ? 'máquina' : 'máquinas'} com o agente do GLPI`;
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
  const [editando, definirEditando] = useState<'novo' | null>(null);
  const [nasCategorias, definirNasCategorias] = useState(false);
  const administra = pacotes.data?.permite.administrar ?? false;
  const lista = pacotes.data?.pacotes ?? [];
  const agora = new Date();

  const termo = normalizarTexto(busca.trim());
  const vistos = lista.filter(
    (pacote) =>
      (categoria === TODOS || pacote.categoria?.id === categoria) &&
      (!soDesatualizados || (pacote.contas.desatualizadas ?? 0) > 0) &&
      (!termo || normalizarTexto(pacote.nome).includes(termo)),
  );
  const quantosNa = (id: string) => lista.filter((pacote) => pacote.categoria?.id === id).length;

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Base de pacotes"
        acoes={
          <>
            <CampoDeTexto
              rotulo="Procurar na base"
              type="search"
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
          <Tabela
            rotulo="Base de pacotes"
            carregando={pacotes.isPending}
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
              <Coluna id="situacao" especie="situacao">
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
                        <span className={estilos.mono}>
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
