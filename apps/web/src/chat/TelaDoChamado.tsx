// O chamado no chat de quem participa (spec modulo-chat, "Chamado no chat"; spec chamados, "Leitura do
// chamado pela pessoa" e "Fechamento do chamado"; change chat-com-chamados, design, decisão 15, "O
// chamado no chat"): o cabeçalho, com "CHAMADO #1045", o título e a situação; as etapas, com a hora da
// chegada a cada uma e a de agora marcada em texto; "Seus outros chamados", que levam a eles; a
// conversa; a caixa do aberto, a do resolvido, que reabre, com "Reabrir até 18/11", e a frase do
// fechado, sem caixa; e "Neste chamado", ao lado da conversa na tela larga e, na estreita, num
// popover, pelo botão do cabeçalho. Sem o módulo Chamados, a tela diz que ele está desligado. No
// celular (m08), o cabeçalho tem a seta de voltar, a marca e o selo, o título e quem atende, com a
// previsão da resposta, e "Neste chamado" abre numa folha, com as etapas uma embaixo da outra.
import { SITUACOES_PARA_QUEM_PARTICIPA, secoesDoChat } from '@grafite/domain';
import {
  avisar,
  Botao,
  BotaoDeIcone,
  type DataHora,
  Folha,
  Icone,
  Popover,
  useDataHora,
  usePostura,
} from '@grafite/ui';
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  LifeBuoy,
  Lock,
  PanelBottom,
  PanelRight,
  RotateCcw,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useChamadoAVista } from '../notificacoes/destinosAVista.tsx';
import { useServidor } from '../sessao/useSessao.tsx';
import { CaixaDoChat } from './CaixaDoChat.tsx';
import {
  type ConversaDoChamado,
  diaDoReabrir,
  type EtapaNoChat,
  momentoDaEtapa,
} from './chamado.ts';
import { useAcoesDoChamado, useChamadoDoChat, useChamadosDoChat } from './consultas.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { naoEncontrada } from './FluxoDaConversa.tsx';
import { type ControleDaConversaDoChamado, FluxoDoChamado } from './FluxoDoChamado.tsx';
import { focarAoChegar } from './focoNaChegada.ts';
import { useAgoraNoChat, useJanelaAVista } from './janela.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import { type ChamadoNaLista, comAsDatas } from './ListaDoChat.tsx';
import { ModuloDesligado } from './ModuloDesligado.tsx';
import { linhaDeQuemAtende, NesteChamado } from './NesteChamado.tsx';
import { rascunhoDoChamado } from './rascunhos.tsx';
import { marcaDaPalavra, SeloDoChamado } from './SeloDoChamado.tsx';
import estilos from './TelaDoChamado.module.css';
import { EstadoComAVolta, VoltarALista } from './VoltarALista.tsx';

const NENHUM_DESLIGADO: readonly string[] = [];

/** A frase da API para o chamado que não existe para a conta, também a do endereço sem número. */
const SEM_O_CHAMADO = 'Chamado não encontrado.';

/** O chamado que não existe para a conta, com o caminho de volta. */
export function ChamadoNaoEncontrado({ mensagem = SEM_O_CHAMADO }: { mensagem?: string }) {
  return (
    <EstadoComAVolta>
      <div role="alert" className={estilos.naoEncontrado}>
        <p>{mensagem}</p>
        <LinkDoChat para="/chat">Ir para o Chat</LinkDoChat>
      </div>
    </EstadoComAVolta>
  );
}

export function TelaDoChamado({
  numero,
  vista,
}: {
  numero: number;
  /** Aberto pela vista Chamados: os outros chamados levam a ela também. */
  vista: 'chamados' | null;
}) {
  const desligados = useServidor()?.modulosDesligados ?? NENHUM_DESLIGADO;
  const ligado = !desligados.includes('chamados');
  const consulta = useChamadoDoChat(numero, ligado);

  if (!ligado) {
    return (
      <EstadoComAVolta>
        <div className={estilos.estado}>
          <ModuloDesligado titulo="O módulo Chamados está desligado nesta organização." />
        </div>
      </EstadoComAVolta>
    );
  }
  if (!consulta.data) {
    if (!consulta.isError) {
      return (
        <EstadoComAVolta>
          <p role="status" className={estilos.abrindo}>
            Abrindo o chamado…
          </p>
        </EstadoComAVolta>
      );
    }
    if (naoEncontrada(consulta.error)) {
      return <ChamadoNaoEncontrado mensagem={consulta.error.message} />;
    }
    return (
      <EstadoComAVolta>
        <div className={estilos.abrindo}>
          <FalhaDoChat
            mensagem={consulta.error.message}
            relendo={consulta.isFetching}
            tentarDeNovo={() => void consulta.refetch()}
          />
        </div>
      </EstadoComAVolta>
    );
  }
  return <ChamadoNaTela chamado={consulta.data} vista={vista} />;
}

function ChamadoNaTela({
  chamado,
  vista,
}: {
  chamado: ConversaDoChamado;
  vista: 'chamados' | null;
}) {
  const { numero } = chamado;
  const acoes = useAcoesDoChamado(numero);
  const dataHora = useDataHora();
  const agora = useAgoraNoChat();
  const idDoTitulo = useId();
  const idDoPainel = useId();
  const controle = useRef<ControleDaConversaDoChamado>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const [reabrindo, definirReabrindo] = useState(false);
  const [painelNaFolha, definirPainelNaFolha] = useState(false);
  const celular = usePostura() === 'celular';
  // As notificações deste chamado, nos dois endereços dele, como a resposta da TI, não viram aviso
  // enquanto ele está à vista.
  useChamadoAVista(numero, useJanelaAVista());
  const daConta = useChamadosDoChat(true);
  // Na ordem da seção CHAMADOS da lista do Chat: os que aguardam a pessoa e depois o aberto mais
  // novo. A API não ordena os abertos.
  const outros = secoesDoChat(
    (daConta.data?.abertos ?? []).filter((outro) => outro.numero !== numero).map(comAsDatas),
  ).chamados;
  const resolvido = chamado.situacao === 'resolvido';
  const reabrirAte =
    chamado.reabrirAte === null ? null : diaDoReabrir(chamado.reabrirAte, agora, dataHora);

  /** O "Reabrir até": o chamado volta à TI, e o foco, que estava no botão, vai à caixa. */
  const reabrir = async () => {
    definirReabrindo(true);
    const resposta = await acoes.reabrir();
    definirReabrindo(false);
    if ('dados' in resposta) caixa.current?.focus();
    else avisar({ situacao: 'atencao', titulo: resposta.erro });
  };

  const neste = <NesteChamado chamado={chamado} agora={agora} dataHora={dataHora} />;
  const quemAtendeNaLinha = linhaDeQuemAtende(chamado);

  return (
    <div className={estilos.tela}>
      <section className={estilos.chamado} aria-labelledby={idDoTitulo}>
        {celular ? (
          <header className={estilos.cabecalho}>
            <div className={estilos.linhaDoAlto}>
              <VoltarALista />
              <span className={estilos.marca}>
                <Icone icone={LifeBuoy} tamanho={14} />
                Chamado <span className={estilos.numero}>#{numero}</span>
              </span>
              <SeloDoChamado texto={chamado.situacaoEmTexto} />
            </div>
            <div className={estilos.linhaDoTitulo}>
              <h2
                id={idDoTitulo}
                className={estilos.titulo}
                tabIndex={-1}
                data-titulo-de-chegada="item"
                ref={focarAoChegar}
              >
                {chamado.titulo}
              </h2>
              <BotaoDeIcone
                icone={PanelBottom}
                rotulo="Neste chamado"
                comDica={false}
                className={estilos.botaoDaFolha}
                onPress={() => definirPainelNaFolha(true)}
              />
            </div>
            {quemAtendeNaLinha !== null && (
              <p className={estilos.quemAtende}>{quemAtendeNaLinha}</p>
            )}
          </header>
        ) : (
          <header className={estilos.cabecalho}>
            <span className={estilos.marca}>
              <Icone icone={LifeBuoy} tamanho={14} />
              Chamado <span className={estilos.numero}>#{numero}</span>
            </span>
            <h2
              id={idDoTitulo}
              className={estilos.titulo}
              tabIndex={-1}
              data-titulo-de-chegada="item"
              ref={focarAoChegar}
            >
              {chamado.titulo}
            </h2>
            <SeloDoChamado texto={chamado.situacaoEmTexto} />
            <span className={estilos.botaoDoPainel}>
              <Popover
                titulo="Neste chamado"
                opaco
                posicao="bottom end"
                gatilho={<Botao icone={PanelRight}>Neste chamado</Botao>}
              >
                <div className={estilos.noPopover}>{neste}</div>
              </Popover>
            </span>
          </header>
        )}
        {!celular && <EtapasDoChamado etapas={chamado.etapas} agora={agora} dataHora={dataHora} />}
        {outros.length > 0 && <OutrosChamados chamados={outros} vista={vista} />}
        <FluxoDoChamado ref={controle} chamado={chamado} acoes={acoes} />
        {chamado.fechado ? (
          <p className={estilos.semCaixa}>
            {reabrirAte === null
              ? 'O chamado fechou. Para o mesmo problema, abra outro chamado.'
              : `O chamado fechou em ${reabrirAte}. Para o mesmo problema, abra outro chamado.`}
          </p>
        ) : (
          <CaixaDoChat
            caixa={caixa}
            rascunho={rascunhoDoChamado(numero)}
            ajuda={resolvido ? 'Escrever aqui reabre o chamado' : `Responder no #${numero}…`}
            // No resolvido, o lugar da dica é do "Reabrir até", como no m04 e no m07.
            dica={resolvido ? undefined : '# cita um chamado'}
            citar
            anexosEm="/chamados/anexos"
            inicio={resolvido ? <Icone icone={Lock} tamanho={16} /> : undefined}
            semTexto={
              resolvido && reabrirAte !== null ? (
                <Botao
                  icone={RotateCcw}
                  carregando={reabrindo}
                  rotuloCarregando="Reabrindo o chamado"
                  onPress={() => void reabrir()}
                >
                  {`Reabrir até ${reabrirAte}`}
                </Botao>
              ) : undefined
            }
            mandar={({ texto, anexos }) => acoes.responder({ texto, anexos })}
            aoEnviar={() => controle.current?.irAoFim()}
          />
        )}
      </section>
      <aside className={estilos.painel} aria-labelledby={idDoPainel}>
        <h2 id={idDoPainel} className={estilos.tituloDoPainel}>
          Neste chamado
        </h2>
        {neste}
      </aside>
      {celular && (
        <Folha aberta={painelNaFolha} aoMudarAberta={definirPainelNaFolha} titulo="Neste chamado">
          <div className={estilos.naFolha}>
            <EtapasDoChamado etapas={chamado.etapas} agora={agora} dataHora={dataHora} empilhadas />
            {neste}
          </div>
        </Folha>
      )}
    </div>
  );
}

/** O ícone da etapa que não é a de agora: a que chegou, a pulada e a que ainda não veio. */
const ICONES_DAS_ETAPAS = {
  chegou: CircleCheck,
  pulada: CircleMinus,
  'ainda-nao': CircleDashed,
} as const;

/**
 * As etapas, Aberto, Em andamento, Aguardando você e Resolvido, com a hora da chegada, como "ontem
 * 17:05", ou "ainda não"; a pulada, só com o nome. A de agora vai no tom e com o ícone do selo dela,
 * e com "agora" em texto.
 */
function EtapasDoChamado({
  etapas,
  agora,
  dataHora,
  empilhadas = false,
}: {
  etapas: readonly EtapaNoChat[];
  agora: Date;
  dataHora: DataHora;
  /** Uma embaixo da outra, como na folha "Neste chamado" do celular. */
  empilhadas?: boolean;
}) {
  return (
    <ol
      className={estilos.etapas}
      aria-label="Etapas do chamado"
      data-empilhadas={empilhadas || undefined}
    >
      {etapas.map((etapa) => {
        const nome = SITUACOES_PARA_QUEM_PARTICIPA[etapa.situacao];
        const marca = etapa.agora ? marcaDaPalavra(nome) : null;
        let hora: string | null = null;
        if (etapa.estado === 'chegou' && etapa.em !== null) {
          hora = momentoDaEtapa(new Date(etapa.em), agora, dataHora);
        } else if (etapa.estado === 'ainda-nao') {
          hora = 'ainda não';
        }
        return (
          <li
            key={etapa.situacao}
            className={estilos.etapa}
            data-estado={etapa.estado}
            data-tom={marca?.situacao}
            aria-current={etapa.agora ? 'step' : undefined}
          >
            <span className={estilos.iconeDaEtapa}>
              <Icone icone={marca?.icone ?? ICONES_DAS_ETAPAS[etapa.estado]} tamanho={20} />
            </span>
            <span className={estilos.textosDaEtapa}>
              <span className={estilos.nomeDaEtapa}>{nome}</span>
              {(etapa.agora || hora !== null) && (
                // O "agora" vai na linha da hora, para a etapa de agora ter a altura das outras.
                <span className={estilos.linhaDaHora}>
                  {etapa.agora && <span className={estilos.agora}>agora</span>}
                  {hora !== null && <span className={estilos.horaDaEtapa}>{hora}</span>}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Os outros chamados abertos da conta, em pílulas com o título inteiro, que levam a eles. */
function OutrosChamados({
  chamados,
  vista,
}: {
  chamados: readonly ChamadoNaLista[];
  vista: 'chamados' | null;
}) {
  const idDoRotulo = useId();
  return (
    <nav className={estilos.outros} aria-labelledby={idDoRotulo}>
      <span id={idDoRotulo} className={estilos.rotuloDosOutros}>
        Seus outros chamados
      </span>
      {/* A primeira pílula que não cabe ao lado do rótulo desce, como as outras. */}
      <wbr />
      <ul className={estilos.pilulas}>
        {chamados.map((outro) => (
          <li key={outro.numero}>
            <LinkDoChat
              className={estilos.outro}
              para={`/chat/chamados/${outro.numero}${vista === null ? '' : `?vista=${vista}`}`}
            >
              <span className={estilos.numeroDoOutro}>#{outro.numero}</span>
              <span className={estilos.tituloDoOutro}>{outro.titulo}</span>
              <SeloDoChamado texto={outro.situacaoEmTexto} />
            </LinkDoChat>
          </li>
        ))}
      </ul>
    </nav>
  );
}
