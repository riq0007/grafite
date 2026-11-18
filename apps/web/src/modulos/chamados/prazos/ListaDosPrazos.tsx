// Os prazos (spec modulo-chamados, "Prazos" e "Selos, prazo em texto e movimento"; change
// chamados-da-ti, design, "A lista dos prazos (tarefa 5.15)" e "O painel dos prazos (tarefa 5.16)";
// mockups m05 e m06): os selos do alto, a legenda, a escala e os chamados abertos nos grupos, cada
// um com a barra até o prazo e o prazo em texto. Um relógio só: o grupo, o texto, a ordem e o apoio
// das faixas viram no mesmo minuto. A falha de uma releitura vai acima da lista, que fica com a
// última leitura; sem a lista, a falha fica no lugar dela. Escolher um chamado abre o painel ao
// lado, com a lista compacta; escolher de novo, o "Fechar a prévia" e o Esc o fecham.
import { Botao, CabecalhoDaPagina, EstadoVazio, Icone, useDataHora } from '@grafite/ui';
import { ArrowRight, ArrowUpNarrowWide, CircleAlert } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { type ControleDoPainel, PainelDoPrazo } from './PainelDoPrazo.tsx';

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
  const idDoPainel = useId();
  const painel = useRef<ControleDoPainel>(null);
  const coluna = useRef<HTMLDivElement>(null);
  // O chamado do painel e a mensagem que a conta mudou, que fica até a escolha de outro chamado
  // ou até o envio, também com o painel fechado.
  const [escolhido, definirEscolhido] = useState<number | null>(null);
  const [mudada, definirMudada] = useState<{ numero: number; texto: string } | null>(null);
  // O foco depois do desenho: no título do painel que abriu, ou na linha do painel que fechou.
  const focoDepois = useRef<{ painel: true } | { linha: number } | null>(null);

  const chamados = prazos.data?.chamados;
  const naLista =
    escolhido !== null && chamados?.some((chamado) => chamado.numero === escolhido) === true;
  const contar = useMemo(() => contadorDoPrazo(agora, fuso), [agora, fuso]);
  const grupos = useMemo(
    () =>
      prazos.data
        ? gruposDosPrazos(prazos.data.chamados, {
            horario: prazos.data.horario,
            contar,
            agora,
            dataHora,
            compacto: naLista,
          })
        : null,
    [prazos.data, contar, agora, dataHora, naLista],
  );
  const escolhida =
    naLista && grupos
      ? (grupos
          .flatMap(({ linhas }) => linhas)
          .find(({ chamado }) => chamado.numero === escolhido) ?? null)
      : null;

  // O chamado que sai da lista, resolvido ou fora do alcance, fecha o painel. O foco que estava
  // nele, e que sumiu com ele, vai à primeira linha da lista.
  useEffect(() => {
    if (escolhido === null || !chamados || naLista) return;
    definirEscolhido(null);
    if (document.activeElement === document.body) {
      coluna.current?.querySelector<HTMLElement>('button[data-numero]')?.focus();
    }
  }, [escolhido, chamados, naLista]);

  useEffect(() => {
    const pedido = focoDepois.current;
    if (!pedido) return;
    focoDepois.current = null;
    if ('painel' in pedido) painel.current?.focar();
    else coluna.current?.querySelector<HTMLElement>(`[data-numero="${pedido.linha}"]`)?.focus();
  });

  const fechar = () => {
    if (escolhido === null) return;
    focoDepois.current = { linha: escolhido };
    definirEscolhido(null);
  };
  // Escolher de novo fecha; escolher outro troca o painel, e a mensagem mudada no outro fica para trás.
  const escolher = (numero: number) => {
    if (escolhido === numero) {
      fechar();
      return;
    }
    focoDepois.current = { painel: true };
    definirEscolhido(numero);
    definirMudada((antes) => (antes?.numero === numero ? antes : null));
  };
  const fecharComEsc = (evento: KeyboardEvent) => {
    if (evento.key !== 'Escape' || evento.defaultPrevented || escolhida === null) return;
    evento.preventDefault();
    fechar();
  };

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
  const compacto = escolhida !== null;

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
              <CabecaDaLista compacto={compacto} />
              {grupos.map((grupo) => (
                <GrupoNaLista
                  key={grupo.grupo}
                  grupo={grupo}
                  compacto={compacto}
                  escolhido={escolhida?.chamado.numero ?? null}
                  idDoPainel={idDoPainel}
                  aoEscolher={escolher}
                />
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
    // biome-ignore lint/a11y/noStaticElementInteractions: o Esc em qualquer parte da tela fecha o painel, como o "Fechar a prévia".
    <div
      className={estilos.tela}
      data-janela-inteira="rola-por-dentro"
      data-com-painel={compacto ? '' : undefined}
      onKeyDown={fecharComEsc}
    >
      <div ref={coluna} className={estilos.coluna} data-compacta={compacto ? '' : undefined}>
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
      {escolhida && prazos.data && (
        <PainelDoPrazo
          key={escolhida.chamado.numero}
          id={idDoPainel}
          controle={painel}
          chamado={escolhida.chamado}
          situacao={escolhida.situacao}
          horario={prazos.data.horario}
          agora={agora}
          mensagemMudada={mudada?.numero === escolhida.chamado.numero ? mudada.texto : null}
          aoMudarAMensagem={(numero, texto) =>
            definirMudada((antes) =>
              texto !== null ? { numero, texto } : antes?.numero === numero ? null : antes,
            )
          }
          aoFechar={fechar}
        />
      )}
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

/**
 * A cabeça das colunas, só desenho: cada linha diz o número, o chamado e o prazo em texto. Na lista
 * compacta, as marcas de 4 em 4 h.
 */
function CabecaDaLista({ compacto }: { compacto: boolean }) {
  return (
    <div className={estilos.cabecaDaLista} aria-hidden="true">
      <span>Nº</span>
      <span>Chamado</span>
      <span className={estilos.escala}>
        {MARCAS_DA_ESCALA.filter(({ compacta }) => !compacto || compacta).map(
          ({ texto, posicao }) => (
            <span
              key={texto}
              style={{ left: `${posicao}%` }}
              data-agora={texto === 'agora' || undefined}
            >
              {texto}
            </span>
          ),
        )}
      </span>
      <span className={estilos.cabecaDoPrazo}>Prazo</span>
    </div>
  );
}

interface PropsDaEscolha {
  compacto: boolean;
  escolhido: number | null;
  idDoPainel: string;
  aoEscolher: (numero: number) => void;
}

/** Um grupo numa faixa, com o título e o apoio, e os chamados dele. */
function GrupoNaLista({
  grupo: { grupo, titulo, apoio, linhas },
  ...escolha
}: { grupo: GrupoDosPrazos } & PropsDaEscolha) {
  const idDoTitulo = useId();
  return (
    <section aria-labelledby={idDoTitulo} className={estilos.grupo} data-grupo={grupo}>
      <div className={estilos.faixa}>
        <h2 id={idDoTitulo}>{titulo}</h2>
        {apoio && <p>{apoio}</p>}
      </div>
      <ul className={estilos.linhas}>
        {linhas.map((linha) => (
          <LinhaDoPrazo key={linha.chamado.numero} linha={linha} {...escolha} />
        ))}
      </ul>
    </section>
  );
}

/**
 * O chamado: o botão que abre o painel dele, com o número, o tipo, o título, quem, a barra e o
 * prazo em texto. Na lista compacta, o relógio parado fica sem o "sem contagem de prazo".
 */
function LinhaDoPrazo({
  linha: { chamado, situacao },
  compacto,
  escolhido,
  idDoPainel,
  aoEscolher,
}: { linha: LinhaDosPrazos } & PropsDaEscolha) {
  const barra = situacao && barraDoPrazo(situacao);
  const aberto = escolhido === chamado.numero;
  return (
    <li>
      <button
        type="button"
        className={estilos.linha}
        aria-expanded={aberto}
        aria-controls={aberto ? idDoPainel : undefined}
        data-numero={chamado.numero}
        onClick={() => aoEscolher(chamado.numero)}
      >
        <span className={estilos.numero}>#{chamado.numero}</span>
        <span className={estilos.chamado}>
          <IconeDoTipo icone={chamado.tipo.icone} nome={chamado.tipo.nome} />
          <span className={estilos.tituloEQuem}>
            <b>{chamado.titulo}</b>
            <span>{quemNaLinha(chamado)}</span>
          </span>
        </span>
        <span className={estilos.trilha} data-sem-barra={barra ? undefined : ''} aria-hidden="true">
          {barra ? (
            <Barra barra={barra} />
          ) : (
            !compacto && <span className={estilos.semContagem}>sem contagem de prazo</span>
          )}
        </span>
        <span className={estilos.prazo}>
          <PrazoEmTexto situacao={situacao} forma="inteira" />
        </span>
      </button>
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
