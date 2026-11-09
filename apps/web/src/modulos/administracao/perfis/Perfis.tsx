import type { components } from '@grafite/api-client';
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
import { permissoesQueValem } from './permissoes.ts';

type Perfil = components['schemas']['Perfil'];

const textoDasPermissoes = (perfil: Perfil) => {
  if (perfil.todasAsPermissoes) return 'Todas';
  const total = permissoesQueValem(perfil).size;
  return total === 1 ? '1 permissão' : `${total} permissões`;
};

/**
 * A lista de perfis (spec modulo-administracao): o nome, quantas permissões o perfil dá, a
 * exigência dos dois passos, as atribuições e a situação. A linha abre a ficha.
 */
export function Perfis() {
  const api = useApi();
  const navegar = useNavigate();
  const perfis = useQuery({
    queryKey: ['perfis'],
    queryFn: () => consultar(() => api.GET('/perfis'), 'carregar os perfis'),
  });
  const novoPerfil = () => void navegar({ to: '/administracao/perfis/novo' });

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Perfis"
        acoes={
          perfis.data?.permite.cadastrar && (
            <Botao nivel="primario" icone={Plus} onPress={novoPerfil}>
              Novo perfil
            </Botao>
          )
        }
      />
      {perfis.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando os perfis…
        </p>
      ) : perfis.isError ? (
        <EstadoVazio
          titulo={perfis.error.message}
          acao={<Botao onPress={() => void perfis.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <>
          <ContagemDaLista quantos={perfis.data.itens.length} singular="perfil" plural="perfis" />
          <Tabela
            rotulo="Perfis"
            aoAbrirLinha={(id) =>
              void navegar({ to: '/administracao/perfis/$id', params: { id: String(id) } })
            }
          >
            <CabecalhoDaTabela>
              <Coluna id="nome" principal>
                Nome
              </Coluna>
              <Coluna id="permissoes">Permissões</Coluna>
              <Coluna id="doisPassos">Dois passos</Coluna>
              <Coluna id="atribuicoes" especie="numero">
                Atribuições
              </Coluna>
              <Coluna id="situacao" especie="situacao">
                Situação
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={perfis.data.itens}
              vazio={<EstadoVazio titulo="Nenhum perfil cadastrado." />}
            >
              {(perfil) => (
                <Linha id={perfil.id}>
                  <Celula>{perfil.nome}</Celula>
                  <Celula>{textoDasPermissoes(perfil)}</Celula>
                  <Celula>{perfil.exigeDoisPassos ? 'Exige' : 'Não exige'}</Celula>
                  <Celula>{perfil.atribuicoes.toLocaleString('pt-BR')}</Celula>
                  <Celula>
                    <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[perfil.situacao].tipo}>
                      {SITUACOES_DO_REGISTRO[perfil.situacao].texto}
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
