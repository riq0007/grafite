// A tela dos indicadores da operação (spec indicadores-da-operacao, "Tela dos indicadores da
// operação"; change p4f-indicadores-da-operacao, design, decisão 10): para quem vê as OS ou o
// estoque, o período e os indicadores que a conta vê, cada um no Indicador da biblioteca, com a
// base, o valor ou o motivo sem valor, o anterior, a meta, a situação, a decisão fora da meta e a
// lista do que passou da meta, que leva à ficha da OS ou do ativo, e "Mudar a meta" para quem
// administra a operação. Os eventos das OS, do estoque, dos consumíveis e das metas leem a consulta
// de novo.
import {
  DEFINICOES_DOS_INDICADORES,
  focoDoIndicador,
  type IndicadorDaOperacao,
  motivoSemValorDaOperacao,
  textoDaBaseDaOperacao,
  textoDaMeta,
  textoDoTempo,
  textoDoValor,
} from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  Esqueleto,
  EstadoVazio,
  Indicador,
  Linha,
  useDataHora,
} from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import { useFocoNoIndicador } from '../../indicadores/foco.ts';
import estilos from '../../indicadores/Indicadores.module.css';
import { ListaDoIndicador } from '../../indicadores/ListaDoIndicador.tsx';
import { MudarAMeta } from '../../indicadores/MudarAMeta.tsx';
import { ativoEmTexto, textoDaEspera, textoDasPaginas } from './apresentacao.ts';
import {
  CHAVE_DOS_INDICADORES_DA_OPERACAO,
  type IndicadoresDaOperacao,
  useIndicadoresDaOperacao,
} from './consultas.ts';

type Resultados = Required<IndicadoresDaOperacao['indicadores']>;

const semLocal = (local: string | null) => local ?? 'Sem local';

export function InicioDosIndicadores() {
  const { pode } = useAcesso();
  return pode('ordens.ver') || pode('estoque.ver') ? (
    <IndicadoresDaOperacaoNaTela />
  ) : (
    <SemPermissao a="aos indicadores da operação" />
  );
}

/** O Indicador da biblioteca com os textos de um resultado da API, a lista e a meta. */
function IndicadorDaTela({
  chave,
  resultado,
  podeMudarMeta,
  children,
}: {
  chave: IndicadorDaOperacao;
  resultado: Resultados[IndicadorDaOperacao];
  podeMudarMeta: boolean;
  children?: ReactNode;
}) {
  const { nome, mede, decisao } = DEFINICOES_DOS_INDICADORES[chave];
  const { valor, anterior, base, situacao, meta } = resultado;
  // Os que contam ativos ou toners mostram o motivo também com zero: nunca um "0" grande.
  const comValor = valor !== null && !(chave !== 'resolucao-das-os' && valor === 0);
  return (
    <Indicador
      nome={nome}
      mede={mede}
      base={base > 0 ? textoDaBaseDaOperacao(chave, base) : undefined}
      valor={comValor ? textoDoValor(chave, valor) : undefined}
      semValor={comValor ? undefined : motivoSemValorDaOperacao(chave, meta, base)}
      anterior={anterior === null ? 'sem dado' : textoDoValor(chave, anterior)}
      meta={textoDaMeta(chave, meta)}
      situacao={situacao}
      decisao={decisao}
      acao={
        podeMudarMeta ? (
          <MudarAMeta
            indicador={chave}
            meta={meta}
            rota="/operacao/indicadores/{indicador}/meta"
            chave={CHAVE_DOS_INDICADORES_DA_OPERACAO}
          />
        ) : undefined
      }
      data-foco={focoDoIndicador(chave)}
    >
      {children}
    </Indicador>
  );
}

/** As OS acima da meta: as em aberto primeiro, e a linha leva à ficha da OS. */
function ListaDaResolucao({ resultado }: { resultado: Resultados['resolucao-das-os'] }) {
  const { itens, mais } = resultado;
  const destinos = new Map(
    itens.map(({ ordem }) => [String(ordem.numero), `/operacao/ordens/${ordem.numero}`]),
  );
  return (
    <ListaDoIndicador
      rotulo="OS acima da meta"
      quantos={itens.length}
      destinos={destinos}
      mais={mais}
    >
      <CabecalhoDaTabela>
        <Coluna id="numero" principal especie="codigo">
          Número
        </Coluna>
        <Coluna id="ativo">Ativo</Coluna>
        <Coluna id="local">Local</Coluna>
        <Coluna id="problema">Problema</Coluna>
        <Coluna id="tempo" especie="data">
          Tempo
        </Coluna>
        <Coluna id="espera" especie="data">
          Espera
        </Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={itens.map((item) => ({ ...item, id: String(item.ordem.numero) }))}>
        {(item) => (
          <Linha id={item.id}>
            <Celula>
              <span className="mono">{item.ordem.numero}</span>
            </Celula>
            <Celula>{ativoEmTexto(item.ativo)}</Celula>
            <Celula>{semLocal(item.ativo.local)}</Celula>
            <Celula>{item.ordem.problema}</Celula>
            <Celula>
              {item.emAberto
                ? `Aberta há ${textoDoTempo(item.minutos)}`
                : textoDoTempo(item.minutos)}
            </Celula>
            <Celula>{textoDaEspera(item) ?? 'Sem espera'}</Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </ListaDoIndicador>
  );
}

/** Os ativos com OS repetidas, com o ativo e cada OS levando à ficha dela. */
function ListaDasRepetidas({ resultado }: { resultado: Resultados['os-repetidas'] }) {
  const { itens, mais } = resultado;
  return (
    <ListaDoIndicador rotulo="Ativos com OS repetidas" quantos={itens.length} mais={mais}>
      <CabecalhoDaTabela>
        <Coluna id="ativo" principal>
          Ativo
        </Coluna>
        <Coluna id="local">Local</Coluna>
        <Coluna id="quantas" especie="numero">
          Quantas
        </Coluna>
        <Coluna id="ordens">Ordens de serviço</Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={itens.map((item) => ({ ...item, id: item.ativo.id }))}>
        {(item) => (
          <Linha id={item.id}>
            <Celula>
              <Link to="/ativos/$id" params={{ id: item.ativo.id }} className={estilos.link}>
                {ativoEmTexto(item.ativo)}
              </Link>
            </Celula>
            <Celula>{semLocal(item.ativo.local)}</Celula>
            <Celula>{`${item.quantas} OS`}</Celula>
            <Celula>
              <ul className={estilos.registros}>
                {item.ordens.map((ordem) => (
                  <li key={ordem.id}>
                    <Link
                      to="/operacao/ordens/$numero"
                      params={{ numero: String(ordem.numero) }}
                      className={estilos.link}
                    >
                      {`OS ${ordem.numero}`}
                    </Link>
                    {` · ${ordem.problema}`}
                  </li>
                ))}
              </ul>
            </Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </ListaDoIndicador>
  );
}

/** Os toners abaixo da meta, do que rendeu menos, e a linha leva à ficha da impressora. */
function ListaDasPaginas({ resultado }: { resultado: Resultados['paginas-por-toner'] }) {
  const { formatarDataEHora } = useDataHora();
  const { itens, mais } = resultado;
  const comId = itens.map((item) => ({
    ...item,
    id: `${item.impressora.id}:${item.consumivel.id}:${item.trocadoEm}`,
  }));
  const destinos = new Map(comId.map((item) => [item.id, `/ativos/${item.impressora.id}`]));
  return (
    <ListaDoIndicador
      rotulo="Toners abaixo da meta"
      quantos={itens.length}
      destinos={destinos}
      mais={mais}
    >
      <CabecalhoDaTabela>
        <Coluna id="impressora" principal>
          Impressora
        </Coluna>
        <Coluna id="local">Local</Coluna>
        <Coluna id="consumivel">Consumível</Coluna>
        <Coluna id="paginas" especie="numero">
          Páginas
        </Coluna>
        <Coluna id="trocado" especie="data">
          Trocado em
        </Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={comId}>
        {(item) => (
          <Linha id={item.id}>
            <Celula>{ativoEmTexto(item.impressora)}</Celula>
            <Celula>{semLocal(item.impressora.local)}</Celula>
            <Celula>
              <span className="mono">{item.consumivel.codigo}</span>
            </Celula>
            <Celula>{textoDasPaginas(item)}</Celula>
            <Celula>{formatarDataEHora(new Date(item.trocadoEm))}</Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </ListaDoIndicador>
  );
}

/** Os indicadores que a conta vê, na ordem da spec, com "Mudar a meta" para quem administra. */
function ListaDosIndicadores({ dados }: { dados: IndicadoresDaOperacao }) {
  const { indicadores, permite } = dados;
  const podeMudarMeta = permite.mudarMeta;
  const resolucao = indicadores['resolucao-das-os'];
  const repetidas = indicadores['os-repetidas'];
  const paginas = indicadores['paginas-por-toner'];
  return (
    <div>
      {resolucao ? (
        <IndicadorDaTela
          chave="resolucao-das-os"
          resultado={resolucao}
          podeMudarMeta={podeMudarMeta}
        >
          <ListaDaResolucao resultado={resolucao} />
        </IndicadorDaTela>
      ) : null}
      {repetidas ? (
        <IndicadorDaTela chave="os-repetidas" resultado={repetidas} podeMudarMeta={podeMudarMeta}>
          <ListaDasRepetidas resultado={repetidas} />
        </IndicadorDaTela>
      ) : null}
      {paginas ? (
        <IndicadorDaTela
          chave="paginas-por-toner"
          resultado={paginas}
          podeMudarMeta={podeMudarMeta}
        >
          <ListaDasPaginas resultado={paginas} />
        </IndicadorDaTela>
      ) : null}
    </div>
  );
}

function IndicadoresDaOperacaoNaTela() {
  const indicadores = useIndicadoresDaOperacao();
  useFocoNoIndicador(indicadores.isSuccess);
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Indicadores" />
      <p className={estilos.contagem}>Últimos 30 dias, comparados com os 30 anteriores</p>
      {indicadores.isPending ? (
        <div aria-busy="true" className={estilos.tela}>
          <p role="status" className={estilos.contagem}>
            Carregando os indicadores…
          </p>
          <Esqueleto forma="bloco" altura="calc(var(--esp-12) * 2)" />
          <Esqueleto forma="bloco" altura="calc(var(--esp-12) * 2)" />
        </div>
      ) : indicadores.isError ? (
        <EstadoVazio
          titulo={indicadores.error.message}
          acao={<Botao onPress={() => void indicadores.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <ListaDosIndicadores dados={indicadores.data} />
      )}
    </div>
  );
}
