import { Botao, CabecalhoDaPagina, EstadoVazio, RotuloDeSituacao, useDataHora } from '@grafite/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { itensDasPaginas } from '../../../api/consultas.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import estilosDosAtivos from '../Ativos.module.css';
import { useImportacoes } from './consultas.ts';
import estilos from './Importacao.module.css';
import { resumoDaImportacao, situacaoDaImportacao } from './textos.ts';

/**
 * As importações da conta (spec importacao-de-ativos, "Importações da conta"), da mais nova para a
 * mais antiga: o arquivo, o tipo, quando, a situação em texto e o resumo, cada uma levando à tela
 * dela, e "Importar planilha". A lista se atualiza sozinha pelo evento `importacoes.mudaram`.
 */
export function Importacoes() {
  const { pode } = useAcesso();
  const navegar = useNavigate();
  const { formatarDataEHora } = useDataHora();
  const importacoes = useImportacoes();

  if (!pode('ativos.editar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Importações" />
        <SemPermissao a="às importações de ativos" />
      </>
    );
  }
  const lista = itensDasPaginas(importacoes.data);
  const importar = () => void navegar({ to: '/gestao/importacoes/nova' });
  return (
    <div className={estilosDosAtivos.tela}>
      <CabecalhoDaPagina
        titulo="Importações"
        detalhe="As planilhas que você importou ficam aqui, com o resultado de cada uma."
        acoes={
          <Botao nivel="primario" onPress={importar}>
            Importar planilha
          </Botao>
        }
      />
      {importacoes.isPending ? (
        <p role="status" className={estilosDosAtivos.contagem}>
          Carregando as importações…
        </p>
      ) : importacoes.isError && !importacoes.data ? (
        <EstadoVazio
          titulo={importacoes.error.message}
          acao={<Botao onPress={() => void importacoes.refetch()}>Tentar de novo</Botao>}
        />
      ) : lista.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma importação ainda."
          descricao="Importe uma planilha XLSX ou CSV para cadastrar ou atualizar ativos de uma vez."
          acao={<Botao onPress={importar}>Importar planilha</Botao>}
        />
      ) : (
        <>
          <ul aria-label="Importações" className={estilos.lista}>
            {lista.map((importacao) => {
              const situacao = situacaoDaImportacao(importacao.situacao);
              return (
                <li key={importacao.id} className={estilos.item}>
                  <div className={estilos.linhaDoItem}>
                    <Link
                      to="/gestao/importacoes/$id"
                      params={{ id: importacao.id }}
                      className={`${estilosDosAtivos.link} ${estilos.nome}`}
                    >
                      {importacao.nomeDoArquivo}
                    </Link>
                    <RotuloDeSituacao situacao={situacao.tom}>{situacao.texto}</RotuloDeSituacao>
                  </div>
                  <p className={estilos.detalhes}>
                    {[
                      importacao.tipo.nome,
                      formatarDataEHora(new Date(importacao.criadaEm)),
                      resumoDaImportacao(importacao),
                    ].join(' · ')}
                  </p>
                </li>
              );
            })}
          </ul>
          {importacoes.hasNextPage && (
            <div>
              <Botao
                carregando={importacoes.isFetchingNextPage}
                rotuloCarregando="Carregando"
                onPress={() => void importacoes.fetchNextPage()}
              >
                Carregar mais
              </Botao>
            </div>
          )}
        </>
      )}
    </div>
  );
}
