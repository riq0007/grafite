// As distribuições na ficha do ativo (spec distribuicao-de-software, "Histórico das
// distribuições"; change distribuicao-de-software, design, decisão 6), na aba Softwares: o pacote,
// a situação e o momento, da mais nova para a mais antiga, com a ficha da distribuição a um clique.
import {
  Botao,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  RotuloDeSituacao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import estilosDosAtivos from '../Ativos.module.css';
import { useDistribuicoesDoAtivo } from './consultas.ts';
import estilos from './Software.module.css';

export function DistribuicoesDoAtivo({ ativoId }: { ativoId: string }) {
  const distribuicoes = useDistribuicoesDoAtivo(ativoId);
  const { formatarDataEHora } = useDataHora();
  return (
    <section className={estilosDosAtivos.parte} aria-labelledby="distribuicoes-do-ativo">
      <h2 id="distribuicoes-do-ativo" className={estilosDosAtivos.tituloDaParte}>
        Distribuições
      </h2>
      {distribuicoes.isError && !distribuicoes.data ? (
        <EstadoVazio
          titulo={distribuicoes.error.message}
          acao={<Botao onPress={() => void distribuicoes.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <Tabela rotulo="Distribuições do ativo" carregando={distribuicoes.isPending}>
          <CabecalhoDaTabela>
            <Coluna id="pacote" principal>
              Pacote
            </Coluna>
            <Coluna id="situacao" especie="situacao">
              Situação
            </Coluna>
            <Coluna id="criada" especie="data">
              Criada em
            </Coluna>
            <Coluna id="terminada" especie="data">
              Terminou em
            </Coluna>
          </CabecalhoDaTabela>
          <CorpoDaTabela
            itens={(distribuicoes.data?.distribuicoes ?? []).map((distribuicao) => ({
              ...distribuicao,
              id: distribuicao.distribuicaoId,
            }))}
            vazio={
              <EstadoVazio
                titulo="Nenhuma distribuição para esta máquina."
                descricao="Os pacotes distribuídos em Ativos › Software aparecem aqui, com a situação de cada instalação."
              />
            }
          >
            {(distribuicao) => (
              <Linha id={distribuicao.id}>
                <Celula>
                  <Link
                    to="/gestao/software/distribuicoes/$id"
                    params={{ id: distribuicao.distribuicaoId }}
                    className={estilos.link}
                  >
                    {[distribuicao.pacote.nome, distribuicao.pacote.versao]
                      .filter(Boolean)
                      .join(' · ')}
                  </Link>
                </Celula>
                <Celula>
                  <RotuloDeSituacao situacao={distribuicao.situacao.tipo}>
                    {distribuicao.situacao.texto}
                  </RotuloDeSituacao>
                </Celula>
                <Celula>{formatarDataEHora(new Date(distribuicao.criadaEm))}</Celula>
                <Celula>
                  {distribuicao.terminadaEm
                    ? formatarDataEHora(new Date(distribuicao.terminadaEm))
                    : '—'}
                </Celula>
              </Linha>
            )}
          </CorpoDaTabela>
        </Tabela>
      )}
    </section>
  );
}
