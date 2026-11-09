import { useEffect, useId, useRef, useState } from 'react';
import { Botao } from '../componentes/botao/Botao.tsx';
import { ControleSegmentado, Segmento } from '../componentes/escolhas/ControleSegmentado.tsx';
import { Interruptor } from '../componentes/escolhas/Interruptor.tsx';
import { EstadoVazio } from '../componentes/exibicao/EstadoVazio.tsx';
import { Gaveta } from '../componentes/modal/Gaveta.tsx';
import {
  NOMES_DAS_SITUACOES,
  RotuloDeSituacao,
} from '../componentes/situacao/RotuloDeSituacao.tsx';
import { useDataHora } from '../regiao/ProvedorDaRegiao.tsx';
import estilos from './CentralDeNotificacoes.module.css';
import { agruparPorDia } from './notificacoes.ts';

/** Uma notificação como a central a mostra. As ações vêm de quem notificou. */
export interface NotificacaoDaCentral {
  id: string;
  severidade: 'critico' | 'atencao' | 'info';
  titulo: string;
  descricao?: string;
  /** O módulo que notificou. */
  origem: string;
  momento: Date;
  lida: boolean;
  /** Há um registro para "Abrir". */
  temDestino: boolean;
  podeReconhecer?: boolean;
  podeAdiar?: boolean;
  /** O texto do botão de adiar, como "Adiar 15 min"; sem ele, "Adiar". */
  rotuloDoAdiar?: string;
  /** Como está o alerta de que a notificação trata, em texto, como "Reconhecido por Ana Souza". */
  situacaoDoAlerta?: string;
}

export type FiltroDeSeveridade = 'todas' | NotificacaoDaCentral['severidade'];

export interface FiltrosDaCentral {
  severidade: FiltroDeSeveridade;
  soNaoLidas: boolean;
}

export interface PropsDaCentralDeNotificacoes {
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
  notificacoes: readonly NotificacaoDaCentral[];
  /** O momento de referência dos grupos "Hoje" e "Ontem"; sem ele, o de agora. */
  agora?: Date;
  aoAbrir: (id: string) => void;
  aoMarcarComoLida: (id: string) => void;
  aoMarcarTodasComoLidas: () => void;
  aoReconhecer?: (id: string) => void;
  aoAdiar?: (id: string) => void;
  /**
   * Os filtros de quem usa a central, como o servidor que filtra: com eles, a central mostra o que
   * recebeu e avisa cada mudança. Sem eles, ela filtra na memória e volta a "Todas" ao reabrir.
   */
  filtros?: FiltrosDaCentral;
  aoMudarFiltros?: (filtros: FiltrosDaCentral) => void;
  /** As não lidas de todas as páginas, que decidem "Marcar todas como lidas". */
  naoLidas?: number;
  /** Há mais notificações depois das que a central mostra: ao fim da lista, ela as pede. */
  temMais?: boolean;
  carregandoMais?: boolean;
  aoCarregarMais?: () => void;
  /** A primeira leitura ainda não chegou. */
  carregando?: boolean;
  /** A leitura falhou, com o texto do erro e "Tentar de novo". */
  erro?: string | null;
  aoTentarDeNovo?: () => void;
  /** O modo Foco: com o interruptor na central, só o Crítico vira aviso. */
  foco?: boolean;
  aoMudarFoco?: (foco: boolean) => void;
}

/**
 * Central de notificações: a gaveta à direita, com o histórico da mais recente para a mais antiga,
 * em grupos por dia. Superfície sólida: é conteúdo, e não uma camada de material (ANTISLOP §17).
 */
export function CentralDeNotificacoes({
  aberta,
  aoMudarAberta,
  ...conteudo
}: PropsDaCentralDeNotificacoes) {
  return (
    <Gaveta aberta={aberta} aoMudarAberta={aoMudarAberta} titulo="Notificações">
      {/* O conteúdo só existe com a gaveta aberta: os filtros voltam a "Todas" a cada abertura. */}
      <ConteudoDaCentral {...conteudo} fechar={() => aoMudarAberta(false)} />
    </Gaveta>
  );
}

const FILTROS_DE_SEVERIDADE: ReadonlyArray<{ id: FiltroDeSeveridade; nome: string }> = [
  { id: 'todas', nome: 'Todas' },
  { id: 'critico', nome: 'Crítico' },
  { id: 'atencao', nome: 'Atenção' },
  { id: 'info', nome: 'Informação' },
];

const SEM_FILTROS: FiltrosDaCentral = { severidade: 'todas', soNaoLidas: false };

interface PropsDoConteudo extends Omit<PropsDaCentralDeNotificacoes, 'aberta' | 'aoMudarAberta'> {
  fechar: () => void;
}

/** Chama a ação quando o elemento aparece na tela, como o fim da lista. */
function useAoAparecer(ativo: boolean, acao: (() => void) | undefined) {
  const elemento = useRef<HTMLDivElement>(null);
  const ultimaAcao = useRef(acao);
  ultimaAcao.current = acao;
  useEffect(() => {
    const alvo = elemento.current;
    if (!ativo || !alvo || typeof IntersectionObserver === 'undefined') return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) ultimaAcao.current?.();
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [ativo]);
  return elemento;
}

function ConteudoDaCentral({
  notificacoes,
  agora = new Date(),
  aoMarcarTodasComoLidas,
  filtros: filtrosDeFora,
  aoMudarFiltros,
  naoLidas,
  temMais = false,
  carregandoMais = false,
  aoCarregarMais,
  carregando = false,
  erro = null,
  aoTentarDeNovo,
  foco = false,
  aoMudarFoco,
  fechar,
  ...acoes
}: PropsDoConteudo) {
  const { grupoDoDia } = useDataHora();
  const [filtrosInternos, definirFiltrosInternos] = useState<FiltrosDaCentral>(SEM_FILTROS);
  const controlados = filtrosDeFora !== undefined;
  const filtros = filtrosDeFora ?? filtrosInternos;
  const mudarFiltros = (novos: FiltrosDaCentral) =>
    controlados ? aoMudarFiltros?.(novos) : definirFiltrosInternos(novos);
  const filtrosAtivos = filtros.severidade !== 'todas' || filtros.soNaoLidas;
  // Com os filtros de fora, quem filtra é o servidor: a central mostra o que recebeu.
  const filtradas = controlados
    ? notificacoes
    : notificacoes.filter(
        (notificacao) =>
          (filtros.severidade === 'todas' || notificacao.severidade === filtros.severidade) &&
          (!filtros.soNaoLidas || !notificacao.lida),
      );
  const grupos = agruparPorDia(filtradas, agora, grupoDoDia);
  const semNaoLidas =
    naoLidas !== undefined ? naoLidas === 0 : notificacoes.every((notificacao) => notificacao.lida);
  const fimDaLista = useAoAparecer(temMais && !carregandoMais, aoCarregarMais);
  return (
    <>
      {aoMudarFoco && (
        <div className={estilos.foco}>
          <Interruptor isSelected={foco} onChange={aoMudarFoco}>
            Modo Foco
          </Interruptor>
          <p className={estilos.explicacao}>Com o Foco ligado, só o Crítico vira aviso.</p>
        </div>
      )}
      <div className={estilos.filtros}>
        <ControleSegmentado
          rotulo="Severidade"
          ocultarRotulo
          value={filtros.severidade}
          onChange={(valor) =>
            mudarFiltros({ ...filtros, severidade: valor as FiltroDeSeveridade })
          }
        >
          {FILTROS_DE_SEVERIDADE.map((filtro) => (
            <Segmento key={filtro.id} value={filtro.id}>
              {filtro.nome}
            </Segmento>
          ))}
        </ControleSegmentado>
        <Interruptor
          isSelected={filtros.soNaoLidas}
          onChange={(soNaoLidas) => mudarFiltros({ ...filtros, soNaoLidas })}
        >
          Só não lidas
        </Interruptor>
        <Botao
          nivel="terciario"
          isDisabled={semNaoLidas}
          onPress={aoMarcarTodasComoLidas}
          className={estilos.marcarTodas}
        >
          Marcar todas como lidas
        </Botao>
      </div>
      {erro ? (
        <EstadoVazio
          titulo={erro}
          acao={aoTentarDeNovo && <Botao onPress={aoTentarDeNovo}>Tentar de novo</Botao>}
        />
      ) : carregando ? (
        <p role="status" className={estilos.carregando}>
          Carregando as notificações…
        </p>
      ) : notificacoes.length === 0 && (!controlados || !filtrosAtivos) ? (
        <EstadoVazio titulo="Nenhuma notificação." />
      ) : grupos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma notificação com esses filtros."
          acao={<Botao onPress={() => mudarFiltros(SEM_FILTROS)}>Limpar filtros</Botao>}
        />
      ) : (
        <>
          {grupos.map((grupo) => (
            <GrupoDoDia key={grupo.rotulo} {...grupo} {...acoes} fechar={fechar} />
          ))}
          {temMais && aoCarregarMais && (
            <div ref={fimDaLista} className={estilos.carregarMais}>
              <Botao
                carregando={carregandoMais}
                rotuloCarregando="Carregando"
                onPress={aoCarregarMais}
              >
                Carregar mais
              </Botao>
            </div>
          )}
        </>
      )}
    </>
  );
}

interface PropsDoGrupo
  extends Pick<
    PropsDaCentralDeNotificacoes,
    'aoAbrir' | 'aoMarcarComoLida' | 'aoReconhecer' | 'aoAdiar'
  > {
  rotulo: string;
  itens: NotificacaoDaCentral[];
  fechar: () => void;
}

function GrupoDoDia({
  rotulo,
  itens,
  aoAbrir,
  aoMarcarComoLida,
  aoReconhecer,
  aoAdiar,
  fechar,
}: PropsDoGrupo) {
  const id = useId();
  const { formatarHora } = useDataHora();
  return (
    <section aria-labelledby={id} className={estilos.grupo}>
      <h3 id={id} className={estilos.dia}>
        {rotulo}
      </h3>
      <ul className={estilos.lista}>
        {itens.map((notificacao) => (
          <li
            key={notificacao.id}
            className={estilos.item}
            data-lida={notificacao.lida || undefined}
          >
            <div className={estilos.linhaDeCima}>
              <RotuloDeSituacao situacao={notificacao.severidade}>
                {NOMES_DAS_SITUACOES[notificacao.severidade]}
              </RotuloDeSituacao>
              {!notificacao.lida && <span className={estilos.naoLida}>Não lida</span>}
              <time
                className={`mono ${estilos.horario}`}
                dateTime={notificacao.momento.toISOString()}
              >
                {formatarHora(notificacao.momento)}
              </time>
            </div>
            <p className={estilos.titulo}>{notificacao.titulo}</p>
            {notificacao.descricao && <p className={estilos.descricao}>{notificacao.descricao}</p>}
            <p className={estilos.origem}>{notificacao.origem}</p>
            {notificacao.situacaoDoAlerta && (
              <p className={estilos.situacaoDoAlerta}>{notificacao.situacaoDoAlerta}</p>
            )}
            <div className={estilos.acoes}>
              {notificacao.severidade === 'critico' &&
                notificacao.podeReconhecer &&
                aoReconhecer && (
                  <Botao nivel="primario" onPress={() => aoReconhecer(notificacao.id)}>
                    Reconhecer
                  </Botao>
                )}
              {notificacao.severidade === 'critico' && notificacao.podeAdiar && aoAdiar && (
                <Botao onPress={() => aoAdiar(notificacao.id)}>
                  {notificacao.rotuloDoAdiar ?? 'Adiar'}
                </Botao>
              )}
              {notificacao.temDestino && (
                <Botao
                  onPress={() => {
                    fechar();
                    aoAbrir(notificacao.id);
                  }}
                >
                  Abrir
                </Botao>
              )}
              {!notificacao.lida && (
                <Botao nivel="terciario" onPress={() => aoMarcarComoLida(notificacao.id)}>
                  Marcar como lida
                </Botao>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
