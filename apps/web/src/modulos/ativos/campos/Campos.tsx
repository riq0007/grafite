import { ROTULOS_DOS_TIPOS_DE_CAMPO } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ContagemDaLista,
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
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import estilos from '../Ativos.module.css';
import { useCampos } from '../consultas.ts';
import {
  buscaDaSituacao,
  naSituacao,
  SITUACOES_DO_FILTRO,
  type SituacaoDoFiltro,
} from '../filtros.ts';

const textoDoUso = (tipos: number) => {
  if (tipos === 0) return 'Nenhum tipo';
  return tipos === 1 ? 'Usado por 1 tipo' : `Usado por ${tipos} tipos`;
};

/**
 * A lista de campos da organização (spec catalogo-de-ativos): os ativos pelo rótulo, com o tipo de
 * campo, o grupo, quantos tipos ativos usam cada um, a marca de restrito e a situação em texto. O
 * filtro mostra também os inativos, e a linha abre a ficha.
 */
export function Campos() {
  const navegar = useNavigate();
  const { situacao = 'ativos' } = useSearch({ from: '/gestao/catalogo/campos' });
  const campos = useCampos();
  const cadastrar = campos.data?.permite.cadastrar ?? false;
  const novoCampo = () => void navegar({ to: '/gestao/catalogo/campos/novo' });

  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Campos"
      acoes={
        cadastrar && (
          <Botao nivel="primario" icone={Plus} onPress={novoCampo}>
            Novo campo
          </Botao>
        )
      }
    />
  );

  if (campos.isPending) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <p role="status" className={estilos.contagem}>
          Carregando os campos…
        </p>
      </div>
    );
  }
  if (campos.isError) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={campos.error.message}
          acao={<Botao onPress={() => void campos.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  if (campos.data.campos.length === 0) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum campo ainda."
          descricao={
            cadastrar
              ? 'Os campos são da organização: cadastre-os aqui e escolha, em cada tipo, os que ele usa.'
              : 'Quem cuida do catálogo cadastra os campos.'
          }
          acao={
            cadastrar ? (
              <Botao icone={Plus} onPress={novoCampo}>
                Novo campo
              </Botao>
            ) : undefined
          }
        />
      </div>
    );
  }

  const visiveis = campos.data.campos.filter((campo) => naSituacao(situacao, campo.situacao));
  return (
    <div className={estilos.tela}>
      {cabecalho}
      <ControleSegmentado
        rotulo="Situação"
        value={situacao}
        onChange={(escolhida) =>
          void navegar({ to: '/gestao/catalogo/campos', search: buscaDaSituacao(escolhida) })
        }
      >
        {(Object.keys(SITUACOES_DO_FILTRO) as SituacaoDoFiltro[]).map((chave) => (
          <Segmento key={chave} value={chave}>
            {SITUACOES_DO_FILTRO[chave]}
          </Segmento>
        ))}
      </ControleSegmentado>
      <ContagemDaLista quantos={visiveis.length} singular="campo" plural="campos" />
      <Tabela
        rotulo="Campos"
        aoAbrirLinha={(id) =>
          void navegar({ to: '/gestao/catalogo/campos/$id', params: { id: String(id) } })
        }
      >
        <CabecalhoDaTabela>
          <Coluna id="rotulo" principal>
            Rótulo
          </Coluna>
          <Coluna id="tipo">Tipo</Coluna>
          <Coluna id="grupo">Grupo</Coluna>
          <Coluna id="uso">Uso</Coluna>
          <Coluna id="restrito">Restrito</Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={visiveis}
          vazio={
            <EstadoVazio
              titulo={situacao === 'inativos' ? 'Nenhum campo inativo.' : 'Nenhum campo ativo.'}
            />
          }
        >
          {(campo) => (
            <Linha id={campo.id}>
              <Celula>{campo.rotulo}</Celula>
              <Celula>{ROTULOS_DOS_TIPOS_DE_CAMPO[campo.tipo]}</Celula>
              <Celula>{campo.grupo ?? <span className={estilos.semValor}>Sem grupo</span>}</Celula>
              <Celula>{textoDoUso(campo.usadoPor)}</Celula>
              <Celula>{campo.restrito ? 'Sim' : 'Não'}</Celula>
              <Celula>
                <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[campo.situacao].tipo}>
                  {SITUACOES_DO_REGISTRO[campo.situacao].texto}
                </RotuloDeSituacao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}
