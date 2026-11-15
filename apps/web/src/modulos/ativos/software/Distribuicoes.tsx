// As distribuições de software (spec distribuicao-de-software, "Histórico das distribuições"; change
// distribuicao-de-software, design, decisão 6): a lista, da mais nova para a mais antiga, com o
// progresso, que leva à ficha de cada uma, e "Nova distribuição". A base de pacotes ficou na tela
// dela (change software-por-pacote, m12), e o endereço antigo da aba leva para cá.
import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useDistribuicoes, usePacotes } from './consultas.ts';
import { Distribuir } from './Distribuir.tsx';
import estilos from './Software.module.css';

/** O endereço antigo da aba das distribuições: `?aba=distribuicoes`. */
export const lerAbaDoSoftware = (busca: Record<string, unknown>): { aba?: 'distribuicoes' } =>
  busca.aba === 'distribuicoes' ? { aba: 'distribuicoes' } : {};

function ListaDasDistribuicoes({ aoDistribuir }: { aoDistribuir: () => void }) {
  const distribuicoes = useDistribuicoes();
  const { formatarDataEHora } = useDataHora();
  if (distribuicoes.isError && !distribuicoes.data) {
    return (
      <EstadoVazio
        titulo={distribuicoes.error.message}
        acao={<Botao onPress={() => void distribuicoes.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  return (
    <Tabela rotulo="Distribuições" carregando={distribuicoes.isPending}>
      <CabecalhoDaTabela>
        <Coluna id="pacote" principal>
          Pacote
        </Coluna>
        <Coluna id="paraQuem">Para quem</Coluna>
        <Coluna id="criada" especie="data">
          Criada em
        </Coluna>
        <Coluna id="por">Por</Coluna>
        <Coluna id="maquinas" especie="numero">
          Máquinas
        </Coluna>
        <Coluna id="progresso">Progresso</Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela
        itens={distribuicoes.data?.distribuicoes ?? []}
        vazio={
          <EstadoVazio
            titulo="Nenhuma distribuição ainda."
            descricao="Escolha o pacote e as máquinas. O agente de cada uma instala no quando escolhido, sem perguntar à pessoa."
            acao={<Botao onPress={aoDistribuir}>Nova distribuição</Botao>}
          />
        }
      >
        {(distribuicao) => (
          <Linha id={distribuicao.id}>
            <Celula>
              <Link
                to="/gestao/software/distribuicoes/$id"
                params={{ id: distribuicao.id }}
                className={estilos.link}
              >
                {[distribuicao.pacote.nome, distribuicao.pacote.versao].filter(Boolean).join(' · ')}
              </Link>
            </Celula>
            <Celula>{distribuicao.paraQuem}</Celula>
            <Celula>{formatarDataEHora(new Date(distribuicao.criadaEm))}</Celula>
            <Celula>{distribuicao.criadaPor}</Celula>
            <Celula>{distribuicao.maquinas}</Celula>
            <Celula>{distribuicao.progresso}</Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </Tabela>
  );
}

/** A tela das distribuições. */
export function TelaDasDistribuicoes() {
  const { pode } = useAcesso();
  const pacotes = usePacotes();
  const [distribuindo, definirDistribuindo] = useState(false);
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Distribuições"
        acoes={
          pode('software.distribuir') && (
            <Botao nivel="primario" icone={Send} onPress={() => definirDistribuindo(true)}>
              Nova distribuição
            </Botao>
          )
        }
      />
      <ListaDasDistribuicoes aoDistribuir={() => definirDistribuindo(true)} />
      {distribuindo && (
        <Distribuir
          pacote={null}
          pacotes={pacotes.data?.pacotes ?? []}
          aoFechar={() => definirDistribuindo(false)}
        />
      )}
    </div>
  );
}
