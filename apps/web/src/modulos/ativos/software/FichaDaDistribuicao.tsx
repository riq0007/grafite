// A ficha de uma distribuição (spec distribuicao-de-software, "Histórico das distribuições" e
// "Pedir agora"; change distribuicao-de-software, design, decisões 4 a 6): o pacote, quem criou e o
// progresso; a tabela das máquinas com a situação, a etapa e o último passo; o log de cada uma numa
// gaveta, na ordem em que chegou; e o "Pedir agora", que acorda os agentes das que aguardam.
// Enquanto alguma máquina espera ou instala, a ficha se relê a cada 5 s.
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Gaveta,
  Linha,
  RotuloDeSituacao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Zap } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { CHAVE_DO_SOFTWARE, type MaquinaDaDistribuicao, useDistribuicao } from './consultas.ts';
import estilos from './Software.module.css';

const nomeDaMaquina = (maquina: MaquinaDaDistribuicao) =>
  maquina.ativo.patrimonio
    ? `${maquina.ativo.rotulo} (${maquina.ativo.patrimonio})`
    : maquina.ativo.rotulo;

/** O log da máquina numa gaveta, como o agente mandou. */
function LogDaMaquina({
  maquina,
  aoFechar,
}: {
  maquina: MaquinaDaDistribuicao;
  aoFechar: () => void;
}) {
  const { formatarDataEHora } = useDataHora();
  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo={`Log de ${nomeDaMaquina(maquina)}`}
    >
      <div className={estilos.formulario}>
        <p className={estilos.nota}>
          {[
            maquina.situacao.texto,
            maquina.etapa ? `etapa ${maquina.etapa}` : null,
            maquina.enviadaEm
              ? `enviada ao agente em ${formatarDataEHora(new Date(maquina.enviadaEm))}`
              : 'ainda não enviada ao agente',
            maquina.terminadaEm
              ? `terminou em ${formatarDataEHora(new Date(maquina.terminadaEm))}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {maquina.log.length === 0 ? (
          <EstadoVazio
            titulo="O agente ainda não mandou nenhum passo."
            descricao="Ele pega a tarefa no próximo contato com o Grafite, ou na hora, pelo Pedir agora."
          />
        ) : (
          <ol className={estilos.log} aria-label="Passos do agente">
            {maquina.log.map((linha, indice) => (
              // A mesma linha pode se repetir: a posição faz parte da chave.
              // biome-ignore lint/suspicious/noArrayIndexKey: o log só cresce no fim, na ordem.
              <li key={`${indice}-${linha}`}>{linha}</li>
            ))}
          </ol>
        )}
      </div>
    </Gaveta>
  );
}

export function FichaDaDistribuicao() {
  const { id } = useParams({ from: '/gestao/software/distribuicoes/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const distribuicao = useDistribuicao(id);
  const { formatarDataEHora } = useDataHora();
  const [vendo, definirVendo] = useState<string | null>(null);
  const [pedindo, definirPedindo] = useState(false);

  if (distribuicao.isPending) {
    return (
      <p role="status" className={estilos.nota}>
        Carregando a distribuição…
      </p>
    );
  }
  if (distribuicao.isError) {
    return (
      <EstadoVazio
        titulo={distribuicao.error.message}
        acao={<Botao onPress={() => void distribuicao.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  const ficha = distribuicao.data;
  const aguardando = ficha.maquinasDaDistribuicao.filter(
    (maquina) => maquina.situacao.chave === 'aguardando',
  ).length;
  const aberta = ficha.maquinasDaDistribuicao.find((maquina) => maquina.id === vendo);

  async function pedirAgora() {
    definirPedindo(true);
    const resultado = await pedir(
      () => api.POST('/software/distribuicoes/{id}/agora', { params: { path: { id: ficha.id } } }),
      'acordar os agentes',
    );
    definirPedindo(false);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    const { acordados, total, mensagem } = resultado.dados;
    avisar({ situacao: acordados === total ? 'sucesso' : 'atencao', titulo: mensagem });
    await consultas.invalidateQueries({ queryKey: [...CHAVE_DO_SOFTWARE, 'distribuicao', id] });
  }

  return (
    <div className={estilos.tela}>
      <Link to="/gestao/software" search={{ aba: 'distribuicoes' }} className={estilos.link}>
        Distribuições
      </Link>
      <CabecalhoDaPagina
        titulo={[ficha.pacote.nome, ficha.pacote.versao].filter(Boolean).join(' · ')}
        detalhe={`${ficha.progresso} · criada por ${ficha.criadaPor} em ${formatarDataEHora(new Date(ficha.criadaEm))}`}
        acoes={
          aguardando > 0 && (
            <Botao
              nivel="primario"
              icone={Zap}
              carregando={pedindo}
              rotuloCarregando="Acordando os agentes"
              onPress={() => void pedirAgora()}
            >
              Pedir agora
            </Botao>
          )
        }
      />
      <Tabela rotulo="Máquinas da distribuição" aoAbrirLinha={definirVendo}>
        <CabecalhoDaTabela>
          <Coluna id="maquina" principal>
            Máquina
          </Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          <Coluna id="etapa">Etapa</Coluna>
          <Coluna id="passo">Último passo</Coluna>
          <Coluna id="atualizada" especie="data">
            Atualizada em
          </Coluna>
          <Coluna id="acoes" especie="acoes">
            Ações
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={ficha.maquinasDaDistribuicao}>
          {(maquina) => (
            <Linha id={maquina.id}>
              <Celula>
                <Link to="/ativos/$id" params={{ id: maquina.ativo.id }} className={estilos.link}>
                  {nomeDaMaquina(maquina)}
                </Link>
              </Celula>
              <Celula>
                <RotuloDeSituacao situacao={maquina.situacao.tipo}>
                  {maquina.situacao.texto}
                </RotuloDeSituacao>
              </Celula>
              <Celula>{maquina.etapa ?? '—'}</Celula>
              <Celula>{maquina.log.at(-1) ?? 'Nenhum passo ainda'}</Celula>
              <Celula>
                {maquina.atualizadaEm ? formatarDataEHora(new Date(maquina.atualizadaEm)) : '—'}
              </Celula>
              <Celula>
                <Botao
                  nivel="terciario"
                  aria-label={`Ver o log de ${nomeDaMaquina(maquina)}`}
                  onPress={() => definirVendo(maquina.id)}
                >
                  Ver log
                </Botao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
      {aberta && <LogDaMaquina maquina={aberta} aoFechar={() => definirVendo(null)} />}
    </div>
  );
}
