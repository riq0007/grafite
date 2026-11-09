import {
  ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO,
  ROTULOS_DOS_TIPOS_DE_SEGREDO,
} from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ControleSegmentado,
  CorpoDaTabela,
  EstadoVazio,
  type FiltroAtivo,
  FiltrosAtivos,
  Linha,
  RotuloDeSituacao,
  Segmento,
  Selecao,
  Tabela,
} from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback } from 'react';
import { FalhaDaConsulta } from '../../api/consultas.ts';
import { useAgora } from '../../casca/status/useAgora.ts';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { CampoComEspera } from '../administracao/CampoComEspera.tsx';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import { SITUACOES_DO_REGISTRO } from '../administracao/situacoes.ts';
import estilos from './Cofre.module.css';
import { SEM_DOIS_PASSOS, useSegredos } from './consultas.ts';
import {
  type FiltrosDoCofre,
  OPCOES_DE_CLASSIFICACAO,
  OPCOES_DE_TIPO,
  SITUACOES_DO_FILTRO,
  type SituacaoDoFiltro,
} from './filtros.ts';
import { SemDoisPassos } from './SemDoisPassos.tsx';
import { ValidadeDoSegredo } from './validade.tsx';

const TODOS = 'todos';

/** O endereço do Cofre: a lista, para quem usa o cofre, e o lugar sem acesso, para quem não usa. */
export function InicioDoCofre() {
  const { pode } = useAcesso();
  return pode('cofre.usar') ? <Segredos /> : <SemPermissao a="ao Cofre" />;
}

/**
 * A lista dos segredos (spec modulo-cofre, "Lista dos segredos"): os que a conta vê, pelo nome, com
 * o tipo, a classificação, o identificador, a pessoa e a validade, e a situação para quem administra
 * o cofre; a busca e os filtros à vista, na query string. A lista nunca mostra um valor secreto. A
 * linha abre a ficha.
 */
function Segredos() {
  const filtros = useSearch({ from: '/cofre/' });
  const navegar = useNavigate({ from: '/cofre/' });
  const { pode } = useAcesso();
  const administra = pode('cofre.administrar');
  // A validade anda com o relógio: o dia que vira muda o "Vencido".
  const agora = useAgora();
  const segredos = useSegredos(filtros);

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDoCofre>) =>
      void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true }),
    [navegar],
  );
  const mudarBusca = useCallback(
    (busca: string) => mudarFiltros({ busca: busca.trim() === '' ? undefined : busca }),
    [mudarFiltros],
  );
  const limparFiltros = () =>
    void navegar({
      search: (atual) => ({
        ...atual,
        busca: undefined,
        tipo: undefined,
        classificacao: undefined,
        situacao: undefined,
      }),
      replace: true,
    });
  const novoSegredo = () => void navegar({ to: '/cofre/novo' });
  const abrirFicha = (id: string) => void navegar({ to: '/cofre/$id', params: { id } });

  const cadastrar = segredos.data?.permite.cadastrar ?? false;
  const ativos = filtrosAtivos(filtros);
  const comFiltro = ativos.length > 0;

  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Cofre"
      acoes={
        cadastrar && (
          <Botao nivel="primario" icone={Plus} onPress={novoSegredo}>
            Novo segredo
          </Botao>
        )
      }
    />
  );

  if (segredos.error instanceof FalhaDaConsulta && segredos.error.codigo === SEM_DOIS_PASSOS) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <SemDoisPassos />
      </div>
    );
  }

  return (
    <div className={estilos.tela}>
      {cabecalho}
      <div className={estilos.filtros}>
        <CampoComEspera
          type="search"
          rotulo="Buscar segredos"
          placeholder="Nome, identificador ou endereço"
          valor={filtros.busca ?? ''}
          aoMudar={mudarBusca}
        />
        <Selecao
          rotulo="Tipo"
          opcoes={[{ id: TODOS, rotulo: 'Todos os tipos' }, ...OPCOES_DE_TIPO]}
          selectedKey={filtros.tipo ?? TODOS}
          onSelectionChange={(chave) => {
            const tipo = String(chave);
            mudarFiltros({ tipo: tipo === TODOS ? undefined : (tipo as FiltrosDoCofre['tipo']) });
          }}
        />
        <Selecao
          rotulo="Classificação"
          opcoes={[{ id: TODOS, rotulo: 'Todas as classificações' }, ...OPCOES_DE_CLASSIFICACAO]}
          selectedKey={filtros.classificacao ?? TODOS}
          onSelectionChange={(chave) => {
            const classificacao = String(chave);
            mudarFiltros({
              classificacao:
                classificacao === TODOS
                  ? undefined
                  : (classificacao as FiltrosDoCofre['classificacao']),
            });
          }}
        />
        {administra && (
          <ControleSegmentado
            rotulo="Situação"
            value={filtros.situacao ?? 'ativos'}
            onChange={(escolhida) => {
              const situacao = escolhida as SituacaoDoFiltro;
              mudarFiltros({ situacao: situacao === 'ativos' ? undefined : situacao });
            }}
          >
            {(Object.keys(SITUACOES_DO_FILTRO) as SituacaoDoFiltro[]).map((chave) => (
              <Segmento key={chave} value={chave}>
                {SITUACOES_DO_FILTRO[chave]}
              </Segmento>
            ))}
          </ControleSegmentado>
        )}
      </div>
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) => mudarFiltros({ [id]: undefined })}
        aoLimparTodos={limparFiltros}
      />
      {segredos.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando os segredos…
        </p>
      ) : segredos.isError ? (
        <EstadoVazio
          titulo={segredos.error.message}
          acao={<Botao onPress={() => void segredos.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <Tabela rotulo="Segredos" aoAbrirLinha={(id) => abrirFicha(String(id))}>
          <CabecalhoDaTabela>
            <Coluna id="nome" principal>
              Nome
            </Coluna>
            <Coluna id="tipo">Tipo</Coluna>
            <Coluna id="classificacao">Classificação</Coluna>
            <Coluna id="identificador" especie="codigo">
              Identificador
            </Coluna>
            <Coluna id="pessoa">Pessoa</Coluna>
            <Coluna id="validade" especie="data">
              Validade
            </Coluna>
            {administra ? (
              <Coluna id="situacao" especie="situacao">
                Situação
              </Coluna>
            ) : null}
          </CabecalhoDaTabela>
          <CorpoDaTabela
            itens={segredos.data.segredos}
            dependencias={[agora, administra]}
            vazio={
              comFiltro ? (
                <EstadoVazio
                  titulo="Nenhum segredo encontrado."
                  acao={<Botao onPress={limparFiltros}>Limpar filtros</Botao>}
                />
              ) : cadastrar ? (
                <EstadoVazio
                  titulo="Nenhum segredo ainda."
                  acao={
                    <Botao icone={Plus} onPress={novoSegredo}>
                      Novo segredo
                    </Botao>
                  }
                />
              ) : (
                <EstadoVazio titulo="Nenhum segredo liberado para você ainda." />
              )
            }
          >
            {(segredo) => (
              <Linha id={segredo.id}>
                <Celula>{segredo.nome}</Celula>
                <Celula>{ROTULOS_DOS_TIPOS_DE_SEGREDO[segredo.tipo]}</Celula>
                <Celula>{ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO[segredo.classificacao]}</Celula>
                <Celula>
                  {segredo.identificador ?? <span className={estilos.semValor}>—</span>}
                </Celula>
                <Celula>
                  {segredo.pessoa?.nome ?? <span className={estilos.semValor}>—</span>}
                </Celula>
                <Celula>
                  <ValidadeDoSegredo
                    validade={segredo.validade}
                    proximaRotacao={segredo.proximaRotacao}
                  />
                </Celula>
                {administra ? (
                  <Celula>
                    <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[segredo.situacao].tipo}>
                      {SITUACOES_DO_REGISTRO[segredo.situacao].texto}
                    </RotuloDeSituacao>
                  </Celula>
                ) : null}
              </Linha>
            )}
          </CorpoDaTabela>
        </Tabela>
      )}
    </div>
  );
}

/** Os filtros fora do padrão, com o nome e o valor de cada um. */
function filtrosAtivos(filtros: FiltrosDoCofre): FiltroAtivo[] {
  return [
    ...(filtros.busca ? [{ id: 'busca', rotulo: 'Busca', valor: filtros.busca }] : []),
    ...(filtros.tipo
      ? [{ id: 'tipo', rotulo: 'Tipo', valor: ROTULOS_DOS_TIPOS_DE_SEGREDO[filtros.tipo] }]
      : []),
    ...(filtros.classificacao
      ? [
          {
            id: 'classificacao',
            rotulo: 'Classificação',
            valor: ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO[filtros.classificacao],
          },
        ]
      : []),
    ...(filtros.situacao
      ? [{ id: 'situacao', rotulo: 'Situação', valor: SITUACOES_DO_FILTRO[filtros.situacao] }]
      : []),
  ];
}
