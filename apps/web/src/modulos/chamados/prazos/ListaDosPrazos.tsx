// Os prazos (spec modulo-chamados, "Prazos" e "Selos, prazo em texto e movimento"; change
// chamados-da-ti, design, "A lista dos prazos (tarefa 5.15)" e "O painel dos prazos (tarefa 5.16)";
// mockups m05 e m06): os selos do alto, a legenda, a escala e os chamados abertos nos grupos, cada
// um com a barra até o prazo e o prazo em texto. Um relógio só: o grupo, o texto, a ordem e o apoio
// das faixas viram no mesmo minuto. A falha de uma releitura vai acima da lista, que fica com a
// última leitura; sem a lista, a falha fica no lugar dela. Escolher um chamado abre o painel ao
// lado, com a lista compacta; escolher de novo, o "Fechar a prévia" e o Esc o fecham.
import { Botao, CabecalhoDaPagina, EstadoVazio, Icone, useDataHora } from '@grafite/ui';
import { ArrowUpNarrowWide, CircleAlert } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { NovoChamado } from '../abertura/NovoChamado.tsx';
import { BuscaNosChamados } from '../BuscaNosChamados.tsx';
import { usePrazosDosChamados } from '../consultas.ts';
import { Selo } from '../Pecas.tsx';
import { contadorDoPrazo } from '../prazo.ts';
import estilos from './ListaDosPrazos.module.css';
import { gruposDosPrazos, selosDosPrazos } from './lista.ts';
import { type ControleDoPainel, PainelDoPrazo } from './PainelDoPrazo.tsx';
import { TabelaDosPrazos } from './TabelaDosPrazos.tsx';

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
            <TabelaDosPrazos
              grupos={grupos}
              forma={compacto ? 'compacta' : 'inteira'}
              escolha={{
                escolhido: escolhida?.chamado.numero ?? null,
                idDoPainel,
                aoEscolher: escolher,
              }}
            />
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
          acoes={
            <>
              <BuscaNosChamados />
              <NovoChamado />
            </>
          }
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
