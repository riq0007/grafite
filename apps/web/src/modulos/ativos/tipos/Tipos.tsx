import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Coluna,
  ColunaDaMiniatura,
  ContagemDaLista,
  ControleSegmentado,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  MiniaturaDeAtivo,
  RotuloDeSituacao,
  Segmento,
  Tabela,
} from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import estilos from '../Ativos.module.css';
import { useCapacidades, useTipos } from '../consultas.ts';
import {
  buscaDaSituacao,
  naSituacao,
  SITUACOES_DO_FILTRO,
  type SituacaoDoFiltro,
} from '../filtros.ts';

const textoDosCampos = (total: number) => {
  if (total === 0) return 'Nenhum';
  return total === 1 ? '1 campo' : `${total} campos`;
};

/**
 * A lista de tipos de ativo (spec catalogo-de-ativos): os ativos pelo nome, com o ícone, quantos
 * campos usam, as capacidades e a situação; o filtro mostra também os inativos. A linha abre a
 * ficha. Sem nenhum tipo, a lista diz isso e oferece o primeiro cadastro.
 */
export function Tipos() {
  const navegar = useNavigate();
  const { situacao = 'ativos' } = useSearch({ from: '/gestao/catalogo/tipos' });
  const tipos = useTipos();
  const capacidades = useCapacidades();
  const nomeDaCapacidade = (chave: string) =>
    capacidades.data?.capacidades.find((capacidade) => capacidade.chave === chave)?.nome ?? chave;
  const novoTipo = () => void navegar({ to: '/gestao/catalogo/tipos/novo' });
  const cadastrar = tipos.data?.permite.cadastrar ?? false;

  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Tipos"
      acoes={
        cadastrar && (
          <Botao nivel="primario" icone={Plus} onPress={novoTipo}>
            Novo tipo
          </Botao>
        )
      }
    />
  );

  if (tipos.isPending) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <p role="status" className={estilos.contagem}>
          Carregando os tipos…
        </p>
      </div>
    );
  }
  if (tipos.isError) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={tipos.error.message}
          acao={<Botao onPress={() => void tipos.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  if (tipos.data.tipos.length === 0) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum tipo de ativo ainda."
          descricao={
            cadastrar
              ? 'Crie o primeiro tipo para cadastrar os modelos e, depois, os ativos.'
              : 'Quem cuida do catálogo cadastra os tipos.'
          }
          acao={
            cadastrar ? (
              <Botao icone={Plus} onPress={novoTipo}>
                Novo tipo
              </Botao>
            ) : undefined
          }
        />
      </div>
    );
  }

  const visiveis = tipos.data.tipos.filter((tipo) => naSituacao(situacao, tipo.situacao));
  return (
    <div className={estilos.tela}>
      {cabecalho}
      <ControleSegmentado
        rotulo="Situação"
        value={situacao}
        onChange={(escolhida) =>
          void navegar({ to: '/gestao/catalogo/tipos', search: buscaDaSituacao(escolhida) })
        }
      >
        {(Object.keys(SITUACOES_DO_FILTRO) as SituacaoDoFiltro[]).map((chave) => (
          <Segmento key={chave} value={chave}>
            {SITUACOES_DO_FILTRO[chave]}
          </Segmento>
        ))}
      </ControleSegmentado>
      <ContagemDaLista quantos={visiveis.length} singular="tipo" plural="tipos" />
      <Tabela
        rotulo="Tipos de ativo"
        aoAbrirLinha={(id) =>
          void navegar({ to: '/gestao/catalogo/tipos/$id', params: { id: String(id) } })
        }
      >
        <CabecalhoDaTabela>
          <ColunaDaMiniatura>Ícone</ColunaDaMiniatura>
          <Coluna id="nome" principal>
            Nome
          </Coluna>
          <Coluna id="campos">Campos</Coluna>
          <Coluna id="capacidades">Capacidades</Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={visiveis}
          vazio={
            <EstadoVazio
              titulo={situacao === 'inativos' ? 'Nenhum tipo inativo.' : 'Nenhum tipo ativo.'}
            />
          }
        >
          {(tipo) => (
            <Linha id={tipo.id}>
              <CelulaDaMiniatura>
                <MiniaturaDeAtivo tipo={tipo.icone} />
              </CelulaDaMiniatura>
              <Celula>{tipo.nome}</Celula>
              <Celula>{textoDosCampos(tipo.campos.length)}</Celula>
              <Celula>
                {tipo.capacidades.length === 0 ? (
                  <span className={estilos.semValor}>Nenhuma</span>
                ) : (
                  tipo.capacidades.map(nomeDaCapacidade).join(', ')
                )}
              </Celula>
              <Celula>
                <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[tipo.situacao].tipo}>
                  {SITUACOES_DO_REGISTRO[tipo.situacao].texto}
                </RotuloDeSituacao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}
