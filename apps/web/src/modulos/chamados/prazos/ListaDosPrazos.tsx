// Os prazos (spec modulo-chamados, "Prazos" e "Selos, prazo em texto e movimento"; change
// chamados-da-ti, design, "A lista dos prazos (tarefa 5.15)"; mockup m05): os selos do alto, a
// legenda, a escala e os chamados abertos nos grupos, cada um com a barra até o prazo e o prazo em
// texto. Um relógio só: o grupo, o texto, a ordem e o apoio das faixas viram no mesmo minuto. A
// falha de uma releitura vai acima da lista, que fica com a última leitura; sem a lista, a falha fica
// no lugar dela.
import { Botao, CabecalhoDaPagina, EstadoVazio, Icone, useDataHora } from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ArrowUpNarrowWide, CircleAlert } from 'lucide-react';
import { type CSSProperties, type ReactNode, useId, useMemo } from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { BuscaNosChamados } from '../BuscaNosChamados.tsx';
import { usePrazosDosChamados } from '../consultas.ts';
import { IconeDoTipo, PrazoEmTexto, Selo } from '../Pecas.tsx';
import { contadorDoPrazo } from '../prazo.ts';
import estilos from './ListaDosPrazos.module.css';
import {
  type BarraDoPrazo,
  barraDoPrazo,
  type GrupoDosPrazos,
  gruposDosPrazos,
  type LinhaDosPrazos,
  MARCAS_DA_ESCALA,
  quemNaLinha,
  selosDosPrazos,
  type Trecho,
} from './lista.ts';

/** A posição do agora e quantos intervalos a escala tem, para a grade e a linha de cada trilha. */
const DA_ESCALA = {
  '--agora': `${MARCAS_DA_ESCALA.find(({ texto }) => texto === 'agora')?.posicao ?? 0}%`,
  '--intervalos': MARCAS_DA_ESCALA.length - 1,
} as CSSProperties;

export function ListaDosPrazos() {
  const prazos = usePrazosDosChamados();
  const agora = useAgora();
  const dataHora = useDataHora();
  const { fuso } = dataHora;
  const contar = useMemo(() => contadorDoPrazo(agora, fuso), [agora, fuso]);
  const grupos = useMemo(
    () =>
      prazos.data
        ? gruposDosPrazos(prazos.data.chamados, {
            horario: prazos.data.horario,
            contar,
            agora,
            dataHora,
          })
        : null,
    [prazos.data, contar, agora, dataHora],
  );

  const tentarDeNovo = (
    <Botao
      carregando={prazos.isFetching}
      rotuloCarregando="Tentando de novo"
      onPress={() => void prazos.refetch()}
    >
      Tentar de novo
    </Botao>
  );
  const falha = prazos.isError ? prazos.error : null;

  let conteudo: ReactNode;
  if (grupos) {
    conteudo = (
      <>
        {falha && (
          <div role="alert" className={estilos.falhaAoReler}>
            <Icone icone={CircleAlert} tamanho={14} />
            <p>{`${falha.message} A lista mostra a última leitura.`}</p>
            {tentarDeNovo}
          </div>
        )}
        {grupos.length === 0 ? (
          <EstadoVazio className={estilos.vazio} titulo="Nenhum chamado aberto." />
        ) : (
          <>
            <Legenda />
            <div className={estilos.lista} style={DA_ESCALA}>
              <CabecaDaLista />
              {grupos.map((grupo) => (
                <GrupoNaLista key={grupo.grupo} grupo={grupo} />
              ))}
            </div>
          </>
        )}
      </>
    );
  } else if (falha) {
    conteudo = <EstadoVazio className={estilos.vazio} titulo={falha.message} acao={tentarDeNovo} />;
  } else {
    conteudo = (
      <p role="status" className={estilos.carregando}>
        Carregando os prazos…
      </p>
    );
  }

  const selos = grupos ? selosDosPrazos(grupos) : [];
  return (
    <div className={estilos.tela} data-janela-inteira="">
      <CabecalhoDaPagina
        titulo="Prazos"
        selos={
          selos.length > 0 &&
          selos.map(({ selo, texto }) => (
            <Selo key={selo} selo={selo}>
              {texto}
            </Selo>
          ))
        }
        acoes={<BuscaNosChamados />}
      />
      {conteudo}
    </div>
  );
}

/** A legenda escrita das barras e, à direita, a ordem da fila. */
function Legenda() {
  return (
    <div className={estilos.legenda}>
      <ul aria-label="Legenda das barras">
        <li>
          <i data-parte="gasto" aria-hidden="true" />
          tempo já gasto
        </li>
        <li>
          <i data-parte="resta" aria-hidden="true" />
          tempo que resta
        </li>
        <li>
          <i data-parte="marca" aria-hidden="true" />
          prazo do tipo
        </li>
        <li>
          <i data-parte="estouro" aria-hidden="true" />
          tempo além do prazo
        </li>
      </ul>
      <p>
        <Icone icone={ArrowUpNarrowWide} tamanho={14} />A fila segue o que vence primeiro
      </p>
    </div>
  );
}

/** A cabeça das colunas, só desenho: cada linha diz o número, o chamado e o prazo em texto. */
function CabecaDaLista() {
  return (
    <div className={estilos.cabecaDaLista} aria-hidden="true">
      <span>Nº</span>
      <span>Chamado</span>
      <span className={estilos.escala}>
        {MARCAS_DA_ESCALA.map(({ texto, posicao }) => (
          <span
            key={texto}
            style={{ left: `${posicao}%` }}
            data-agora={texto === 'agora' || undefined}
          >
            {texto}
          </span>
        ))}
      </span>
      <span className={estilos.cabecaDoPrazo}>Prazo</span>
    </div>
  );
}

/** Um grupo numa faixa, com o título e o apoio, e os chamados dele. */
function GrupoNaLista({ grupo: { grupo, titulo, apoio, linhas } }: { grupo: GrupoDosPrazos }) {
  const idDoTitulo = useId();
  return (
    <section aria-labelledby={idDoTitulo} className={estilos.grupo} data-grupo={grupo}>
      <div className={estilos.faixa}>
        <h2 id={idDoTitulo}>{titulo}</h2>
        {apoio && <p>{apoio}</p>}
      </div>
      <ul className={estilos.linhas}>
        {linhas.map((linha) => (
          <LinhaDoPrazo key={linha.chamado.numero} linha={linha} />
        ))}
      </ul>
    </section>
  );
}

/** O chamado: o link para ele, com o número, o tipo, o título, quem, a barra e o prazo em texto. */
function LinhaDoPrazo({ linha: { chamado, situacao } }: { linha: LinhaDosPrazos }) {
  const barra = situacao && barraDoPrazo(situacao);
  return (
    <li>
      <Link
        to="/chamados/$numero"
        params={{ numero: String(chamado.numero) }}
        className={estilos.linha}
      >
        <span className={estilos.numero}>#{chamado.numero}</span>
        <span className={estilos.chamado}>
          <IconeDoTipo icone={chamado.tipo.icone} nome={chamado.tipo.nome} />
          <span className={estilos.tituloEQuem}>
            <b>{chamado.titulo}</b>
            <span>{quemNaLinha(chamado)}</span>
          </span>
        </span>
        <span className={estilos.trilha} aria-hidden="true">
          {barra ? (
            <Barra barra={barra} />
          ) : (
            <span className={estilos.semContagem}>sem contagem de prazo</span>
          )}
        </span>
        <span className={estilos.prazo}>
          <PrazoEmTexto situacao={situacao} forma="inteira" />
        </span>
      </Link>
    </li>
  );
}

const noTrecho = ({ de, ate }: Trecho): CSSProperties => ({
  left: `${de}%`,
  width: `${ate - de}%`,
});

/** A barra até o prazo: o gasto, o que resta ou o estouro hachurado, a marca e a seta. */
function Barra({ barra }: { barra: BarraDoPrazo }) {
  return (
    <>
      <i className={estilos.gasto} data-tom={barra.tom} style={noTrecho(barra.gasto)} />
      {barra.resta && (
        <i className={estilos.resta} data-tom={barra.tom} style={noTrecho(barra.resta)} />
      )}
      {barra.estouro && <i className={estilos.estouro} style={noTrecho(barra.estouro)} />}
      <i className={estilos.marca} data-tom={barra.tom} style={{ left: `${barra.marca}%` }} />
      {barra.alemDaEscala && (
        <span className={estilos.alem}>
          <Icone icone={ArrowRight} tamanho={12} />
        </span>
      )}
    </>
  );
}
