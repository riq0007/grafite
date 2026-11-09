// A tela dos indicadores (spec indicadores, "Tela dos indicadores"; change p3d-indicadores, design,
// decisão 7): o período e os quatro indicadores, cada um no Indicador da biblioteca, com a base, o
// valor ou o motivo sem valor, o anterior, a meta, a situação, a decisão fora da meta e a lista do
// que passou da meta, que leva à ficha do ativo ou à tela dos coletores. A consulta fica sob a chave
// dos alertas, e o evento `alertas.mudaram` a lê de novo.
import {
  type IndicadorDosAlertas as ChaveDoIndicador,
  DEFINICOES_DOS_INDICADORES,
  focoDoIndicador,
  textoDaMeta,
  textoDaPorcentagem,
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
import type { ReactNode } from 'react';
import { useFocoNoIndicador } from '../indicadores/foco.ts';
import { ListaDoIndicador } from '../indicadores/ListaDoIndicador.tsx';
import { MudarAMeta } from '../indicadores/MudarAMeta.tsx';
import estilos from './Alertas.module.css';
import {
  type AlvoDoIndicador,
  CHAVE_DOS_INDICADORES,
  type IndicadoresDosAlertas,
  useIndicadores,
} from './consultas.ts';
import { IndicadoresCriados } from './IndicadoresCriados.tsx';

type Resultados = IndicadoresDosAlertas['indicadores'];

const destinoDoAlvo = (alvo: AlvoDoIndicador) =>
  alvo.tipo === 'ativo' ? `/ativos/${alvo.id}` : `/administracao/coletores/${alvo.id}`;

const plural = (quantidade: number, singular: string, plural: string) =>
  `${quantidade} ${quantidade === 1 ? singular : plural}`;

/** A base do cálculo de cada indicador, ou nada quando não há o que resumir. */
const BASES: Record<ChaveDoIndicador, (base: number) => string> = {
  toner: (base) => `Mediana de ${plural(base, 'troca', 'trocas')}`,
  critico: (base) => `Mediana de ${plural(base, 'alerta Crítico', 'alertas Críticos')}`,
  disponibilidade: (base) => `${plural(base, 'ativo com queda', 'ativos com queda')} no período`,
  'que-voltam': (base) => `${plural(base, 'alerta aberto', 'alertas abertos')} no período`,
};

/** O motivo no lugar do número: sem dado, ou nada na lista dos indicadores que contam. */
function semValor(chave: ChaveDoIndicador, meta: number): string {
  switch (chave) {
    case 'toner':
      return 'Nenhum toner trocado nos últimos 30 dias.';
    case 'critico':
      return 'Nenhum alerta Crítico para reconhecer nos últimos 30 dias.';
    case 'disponibilidade':
      return `Nenhum ativo abaixo de ${textoDaMeta('disponibilidade', meta)}.`;
    case 'que-voltam':
      return `Nenhum alerta abriu ${meta} vezes no mesmo ativo.`;
  }
}

/** O Indicador da biblioteca com os textos de um resultado da API, a lista e a meta. */
function IndicadorDaTela({
  chave,
  resultado,
  podeMudarMeta,
  children,
}: {
  chave: ChaveDoIndicador;
  resultado: Resultados[ChaveDoIndicador];
  podeMudarMeta: boolean;
  children?: ReactNode;
}) {
  const { nome, mede, decisao } = DEFINICOES_DOS_INDICADORES[chave];
  const { valor, anterior, base, situacao, meta } = resultado;
  // Os indicadores que contam ativos mostram o motivo também com zero: nunca um "0" grande.
  const contaAtivos = chave === 'disponibilidade' || chave === 'que-voltam';
  const comValor = valor !== null && !(contaAtivos && valor === 0);
  const motivo =
    chave === 'disponibilidade' && valor === null
      ? 'Nenhuma regra de ativo offline ativa.'
      : semValor(chave, meta);
  return (
    <Indicador
      nome={nome}
      mede={mede}
      base={base > 0 ? BASES[chave](base) : undefined}
      valor={comValor ? textoDoValor(chave, valor) : undefined}
      semValor={comValor ? undefined : motivo}
      anterior={anterior === null ? 'sem dado' : textoDoValor(chave, anterior)}
      meta={textoDaMeta(chave, meta)}
      situacao={situacao}
      decisao={decisao}
      acao={
        podeMudarMeta ? (
          <MudarAMeta
            indicador={chave}
            meta={meta}
            rota="/alertas/indicadores/{indicador}/meta"
            chave={CHAVE_DOS_INDICADORES}
          />
        ) : undefined
      }
      data-foco={focoDoIndicador(chave)}
    >
      {children}
    </Indicador>
  );
}

function ListaDeTempo({
  rotulo,
  resultado,
  doCritico = false,
}: {
  rotulo: string;
  resultado: Resultados['toner'];
  doCritico?: boolean;
}) {
  const { itens, mais } = resultado;
  const destinos = new Map(itens.map((item) => [item.alerta.id, destinoDoAlvo(item.alvo)]));
  const tempo = (item: (typeof itens)[number]) =>
    item.esperando && !doCritico
      ? `Esperando há ${textoDoTempo(item.minutos)}`
      : textoDoTempo(item.minutos);
  return (
    <ListaDoIndicador rotulo={rotulo} quantos={itens.length} destinos={destinos} mais={mais}>
      <CabecalhoDaTabela>
        <Coluna id="alvo" principal>
          {doCritico ? 'Ativo ou coletor' : 'Ativo'}
        </Coluna>
        {doCritico ? null : <Coluna id="local">Local</Coluna>}
        <Coluna id="alerta">Alerta</Coluna>
        <Coluna id="tempo" especie="numero">
          Tempo
        </Coluna>
        {doCritico ? <Coluna id="reconhecido">Reconhecido por</Coluna> : null}
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={itens.map((item) => ({ ...item, id: item.alerta.id }))}>
        {(item) => (
          <Linha id={item.id}>
            <Celula>{item.alvo.nome}</Celula>
            {doCritico ? null : (
              <Celula>{item.alvo.tipo === 'ativo' ? (item.alvo.local ?? 'Sem local') : ''}</Celula>
            )}
            <Celula>{item.alerta.texto}</Celula>
            <Celula>{tempo(item)}</Celula>
            {doCritico ? <Celula>{item.reconhecidoPor ?? 'Sem reconhecimento'}</Celula> : null}
          </Linha>
        )}
      </CorpoDaTabela>
    </ListaDoIndicador>
  );
}

function ListaDaDisponibilidade({ resultado }: { resultado: Resultados['disponibilidade'] }) {
  const { itens, mais } = resultado;
  const destinos = new Map(itens.map((item) => [item.alvo.id, destinoDoAlvo(item.alvo)]));
  return (
    <ListaDoIndicador
      rotulo="Ativos abaixo da meta"
      quantos={itens.length}
      destinos={destinos}
      mais={mais}
    >
      <CabecalhoDaTabela>
        <Coluna id="alvo" principal>
          Ativo
        </Coluna>
        <Coluna id="local">Local</Coluna>
        <Coluna id="disponibilidade" especie="numero">
          Disponibilidade
        </Coluna>
        <Coluna id="fora" especie="numero">
          Fora do ar
        </Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={itens.map((item) => ({ ...item, id: item.alvo.id }))}>
        {(item) => (
          <Linha id={item.id}>
            <Celula>{item.alvo.nome}</Celula>
            <Celula>{item.alvo.tipo === 'ativo' ? (item.alvo.local ?? 'Sem local') : ''}</Celula>
            <Celula>{textoDaPorcentagem(item.porMil)}</Celula>
            <Celula>{textoDoTempo(item.minutosForaDoAr)}</Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </ListaDoIndicador>
  );
}

function ListaQueVolta({ resultado }: { resultado: Resultados['que-voltam'] }) {
  const { formatarDataEHora } = useDataHora();
  const { itens, mais } = resultado;
  const comId = itens.map((item) => ({ ...item, id: `${item.alvo.id}:${item.regra.id}` }));
  const destinos = new Map(comId.map((item) => [item.id, destinoDoAlvo(item.alvo)]));
  return (
    <ListaDoIndicador
      rotulo="Alertas que voltaram"
      quantos={itens.length}
      destinos={destinos}
      mais={mais}
    >
      <CabecalhoDaTabela>
        <Coluna id="alvo" principal>
          Ativo ou coletor
        </Coluna>
        <Coluna id="regra">Regra</Coluna>
        <Coluna id="vezes" especie="numero">
          Vezes
        </Coluna>
        <Coluna id="ultima" especie="data">
          Última vez
        </Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={comId}>
        {(item) => (
          <Linha id={item.id}>
            <Celula>{item.alvo.nome}</Celula>
            <Celula>{item.regra.nome}</Celula>
            <Celula>{`${item.vezes} vezes`}</Celula>
            <Celula>{formatarDataEHora(new Date(item.ultimaEm))}</Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </ListaDoIndicador>
  );
}

/** Os quatro indicadores, na ordem da spec, com "Mudar a meta" para quem administra os alertas. */
function ListaDosIndicadores({ dados }: { dados: IndicadoresDosAlertas }) {
  const { indicadores, permite } = dados;
  const podeMudarMeta = permite.mudarMeta;
  return (
    <div>
      <IndicadorDaTela chave="toner" resultado={indicadores.toner} podeMudarMeta={podeMudarMeta}>
        <ListaDeTempo rotulo="Toners acima da meta" resultado={indicadores.toner} />
      </IndicadorDaTela>
      <IndicadorDaTela
        chave="critico"
        resultado={indicadores.critico}
        podeMudarMeta={podeMudarMeta}
      >
        <ListaDeTempo rotulo="Críticos acima da meta" resultado={indicadores.critico} doCritico />
      </IndicadorDaTela>
      <IndicadorDaTela
        chave="disponibilidade"
        resultado={indicadores.disponibilidade}
        podeMudarMeta={podeMudarMeta}
      >
        <ListaDaDisponibilidade resultado={indicadores.disponibilidade} />
      </IndicadorDaTela>
      <IndicadorDaTela
        chave="que-voltam"
        resultado={indicadores['que-voltam']}
        podeMudarMeta={podeMudarMeta}
      >
        <ListaQueVolta resultado={indicadores['que-voltam']} />
      </IndicadorDaTela>
    </div>
  );
}

export function Indicadores() {
  const indicadores = useIndicadores();
  useFocoNoIndicador(indicadores.isSuccess);
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Indicadores" />
      <p className={estilos.explicacao}>
        Um indicador mede o atendimento nos últimos 30 dias e o compara com a meta. Fora da meta,
        ele diz o que fazer. Crie um indicador para olhar só um tipo, um modelo ou um local, com a
        meta dele.
      </p>
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
      <IndicadoresCriados />
    </div>
  );
}
