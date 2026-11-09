import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ControleSegmentado,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  RotuloDeSituacao,
  Segmento,
  Tabela,
} from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback } from 'react';
import { itensDasPaginas } from '../../../api/consultas.ts';
import estilos from '../Administracao.module.css';
import { CampoComEspera } from '../CampoComEspera.tsx';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';
import { useFornecedores } from './consultas.ts';
import {
  type FiltrosDosFornecedores,
  SITUACOES_DO_FILTRO,
  type SituacaoDoFiltro,
} from './filtros.ts';

const contagem = (total: number) =>
  total === 1 ? '1 fornecedor' : `${total.toLocaleString('pt-BR')} fornecedores`;

/** O texto da célula, ou o travessão quando o fornecedor não o tem. */
const ouTravessao = (texto: string | null) => texto ?? '—';

/**
 * A lista dos fornecedores (spec modulo-administracao, "Tela de fornecedores"): os ativos pelo nome,
 * com o CNPJ, o contato, o e-mail e o telefone, paginada no servidor, com a busca pelo nome e pelo
 * começo do CNPJ e a situação, que mostra os inativos. A busca e a situação ficam no endereço, e a
 * linha abre a ficha.
 */
export function Fornecedores() {
  const filtros = useSearch({ from: '/administracao/fornecedores' });
  const navegar = useNavigate({ from: '/administracao/fornecedores' });

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDosFornecedores>) =>
      void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true }),
    [navegar],
  );
  const mudarBusca = useCallback(
    (busca: string) => mudarFiltros({ busca: busca.trim() === '' ? undefined : busca }),
    [mudarFiltros],
  );
  const limparFiltros = () =>
    void navegar({
      search: (atual) => ({ ...atual, busca: undefined, situacao: undefined }),
      replace: true,
    });
  const novoFornecedor = () => void navegar({ to: '/administracao/fornecedores/novo' });

  const situacao: SituacaoDoFiltro = filtros.situacao ?? 'ativos';
  const fornecedores = useFornecedores({ busca: filtros.busca, situacao });
  const lista = itensDasPaginas(fornecedores.data);
  const primeira = fornecedores.data?.pages[0];
  const cadastrar = primeira?.permite.cadastrar ?? false;
  const comFiltro = filtros.busca !== undefined || filtros.situacao !== undefined;

  const botaoDoNovo = (
    <Botao nivel="primario" icone={Plus} onPress={novoFornecedor}>
      Novo fornecedor
    </Botao>
  );
  const cabecalho = <CabecalhoDaPagina titulo="Fornecedores" acoes={cadastrar && botaoDoNovo} />;

  if (fornecedores.isPending) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <p role="status" className={estilos.contagem}>
          Carregando os fornecedores…
        </p>
      </div>
    );
  }
  if (fornecedores.isError && !fornecedores.data) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={fornecedores.error.message}
          acao={<Botao onPress={() => void fornecedores.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  // A organização sem nenhum fornecedor: nada a buscar nem a filtrar.
  if (!comFiltro && primeira?.total === 0) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum fornecedor ainda."
          descricao="O fornecedor vende, aluga ou dá assistência aos ativos da organização."
          acao={cadastrar ? botaoDoNovo : undefined}
        />
      </div>
    );
  }

  return (
    <div className={estilos.tela}>
      {cabecalho}
      <div className={estilos.filtros}>
        <CampoComEspera
          type="search"
          rotulo="Buscar fornecedores"
          placeholder="Nome ou CNPJ"
          valor={filtros.busca ?? ''}
          aoMudar={mudarBusca}
        />
        <ControleSegmentado
          rotulo="Situação"
          value={situacao}
          onChange={(escolhida) =>
            mudarFiltros({
              situacao: escolhida === 'inativos' || escolhida === 'todos' ? escolhida : undefined,
            })
          }
        >
          {(Object.keys(SITUACOES_DO_FILTRO) as SituacaoDoFiltro[]).map((chave) => (
            <Segmento key={chave} value={chave}>
              {SITUACOES_DO_FILTRO[chave]}
            </Segmento>
          ))}
        </ControleSegmentado>
      </div>
      {lista.length > 0 && <p className={estilos.contagem}>{contagem(primeira?.total ?? 0)}</p>}
      <Tabela
        rotulo="Fornecedores"
        aoAbrirLinha={(id) =>
          void navegar({ to: '/administracao/fornecedores/$id', params: { id: String(id) } })
        }
        carregarMais={{
          haMais: fornecedores.hasNextPage,
          carregando: fornecedores.isFetchingNextPage,
          aoCarregar: () => void fornecedores.fetchNextPage(),
        }}
      >
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Nome
          </Coluna>
          <Coluna id="cnpj" especie="codigo">
            CNPJ
          </Coluna>
          <Coluna id="contato">Contato</Coluna>
          <Coluna id="email">E-mail</Coluna>
          <Coluna id="telefone">Telefone</Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={lista}
          vazio={
            <EstadoVazio
              titulo="Nenhum fornecedor encontrado."
              acao={comFiltro ? <Botao onPress={limparFiltros}>Limpar filtros</Botao> : undefined}
            />
          }
        >
          {(fornecedor) => (
            <Linha id={fornecedor.id}>
              <Celula>{fornecedor.nome}</Celula>
              <Celula>
                <span className="mono">{ouTravessao(fornecedor.cnpj)}</span>
              </Celula>
              <Celula>{ouTravessao(fornecedor.contato)}</Celula>
              <Celula>{ouTravessao(fornecedor.email)}</Celula>
              <Celula>{ouTravessao(fornecedor.telefone)}</Celula>
              <Celula>
                <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[fornecedor.situacao].tipo}>
                  {SITUACOES_DO_REGISTRO[fornecedor.situacao].texto}
                </RotuloDeSituacao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}
