import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ContagemDaLista,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  RotuloDeSituacao,
  Tabela,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';

/**
 * A lista de grupos (spec modulo-administracao): o nome, quantos membros e perfis o grupo tem e a
 * situação. A linha abre a ficha.
 */
export function Grupos() {
  const api = useApi();
  const navegar = useNavigate();
  const grupos = useQuery({
    queryKey: ['grupos'],
    queryFn: () => consultar(() => api.GET('/grupos'), 'carregar os grupos'),
  });
  const novoGrupo = () => void navegar({ to: '/administracao/grupos/novo' });

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Grupos"
        acoes={
          grupos.data?.permite.cadastrar && (
            <Botao nivel="primario" icone={Plus} onPress={novoGrupo}>
              Novo grupo
            </Botao>
          )
        }
      />
      {grupos.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando os grupos…
        </p>
      ) : grupos.isError ? (
        <EstadoVazio
          titulo={grupos.error.message}
          acao={<Botao onPress={() => void grupos.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <>
          <ContagemDaLista quantos={grupos.data.itens.length} singular="grupo" plural="grupos" />
          <Tabela
            rotulo="Grupos"
            aoAbrirLinha={(id) =>
              void navegar({ to: '/administracao/grupos/$id', params: { id: String(id) } })
            }
          >
            <CabecalhoDaTabela>
              <Coluna id="nome" principal>
                Nome
              </Coluna>
              <Coluna id="membros" especie="numero">
                Membros
              </Coluna>
              <Coluna id="perfis" especie="numero">
                Perfis
              </Coluna>
              <Coluna id="situacao" especie="situacao">
                Situação
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={grupos.data.itens}
              vazio={
                <EstadoVazio
                  titulo="Nenhum grupo cadastrado."
                  acao={
                    grupos.data.permite.cadastrar ? (
                      <Botao icone={Plus} onPress={novoGrupo}>
                        Novo grupo
                      </Botao>
                    ) : undefined
                  }
                />
              }
            >
              {(grupo) => (
                <Linha id={grupo.id}>
                  <Celula>{grupo.nome}</Celula>
                  <Celula>{grupo.membros.toLocaleString('pt-BR')}</Celula>
                  <Celula>{grupo.perfis.toLocaleString('pt-BR')}</Celula>
                  <Celula>
                    <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[grupo.situacao].tipo}>
                      {SITUACOES_DO_REGISTRO[grupo.situacao].texto}
                    </RotuloDeSituacao>
                  </Celula>
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        </>
      )}
    </div>
  );
}
