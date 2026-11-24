// O chamado no chat de quem participa (spec modulo-chat, "Chamado no chat"; spec chamados, "Leitura do
// chamado pela pessoa" e "Fechamento do chamado"; change chat-com-chamados, design, decisão 15, "O
// chamado no chat"): o cabeçalho, com "CHAMADO #1045", o título e a situação; as etapas, com a hora da
// chegada a cada uma e a de agora marcada em texto; "Seus outros chamados", que levam a eles; a
// conversa; a caixa do aberto, a do resolvido, que reabre, com "Reabrir até 18/11", e a frase do
// fechado, sem caixa; a quem participa pela TI (change andamento-e-varias-mensagens, decisão 4), a
// caixa "Escrever para Fernanda no #1045…", pela rota da TI, e, no resolvido, no lugar dela, "O #1045
// está resolvido." com "Reabrir"; e "Neste chamado", ao lado da conversa na tela larga e, na estreita, num
// popover, pelo botão do cabeçalho. Sem o módulo Chamados, a tela diz que ele está desligado. No
// celular (m08), o cabeçalho tem a seta de voltar, a marca e o selo, o título e quem atende, com a
// previsão da resposta, e "Neste chamado" abre numa folha, com as etapas uma embaixo da outra.
import { nomeCurto, nomeDaEtapa, secoesDoChat } from '@grafite/domain';
import {
  avisar,
  Botao,
  BotaoDeIcone,
  type DataHora,
  Folha,
  Icone,
  LugarDeSoltar,
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
import { type RefObject, useId, useRef, useState } from 'react';
import { useAcoesDoAtendimento } from '../modulos/chamados/acoes.ts';
import { ajudaDoCampo } from '../modulos/chamados/chamado/escrever.ts';
import { useChamadoAVista } from '../notificacoes/destinosAVista.tsx';
import { useServidor } from '../sessao/useSessao.tsx';
import {
  AndamentoDoChamado,
  type DialogoDoAndamentoAberto,
  DialogosDoAndamento,
} from './AndamentoDoChamado.tsx';
import { CaixaDoChat } from './CaixaDoChat.tsx';
import {
  type ConversaDoChamado,
  diaDoReabrir,
  type EtapaNoChat,
  momentoDaEtapa,
} from './chamado.ts';
import {
  useAcoesDoChamado,
  useAndamentoNoChat,
  useChamadoDoChat,
  useChamadosDoChat,
  useRelerOsChamadosDoChat,
} from './consultas.ts';
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
  const [dialogo, definirDialogo] = useState<DialogoDoAndamentoAberto | null>(null);
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
              <span className={estilos.botoesDoTitulo}>
                {chamado.andamento && (
                  <AndamentoDoChamado
                    numero={numero}
                    andamento={chamado.andamento}
                    celular
                    aoPedir={definirDialogo}
                  />
                )}
                <BotaoDeIcone
                  icone={PanelBottom}
                  rotulo="Neste chamado"
                  comDica={false}
                  className={estilos.botaoDaFolha}
                  onPress={() => definirPainelNaFolha(true)}
                />
              </span>
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
            {chamado.andamento && (
              <span className={estilos.andamento}>
                <AndamentoDoChamado
                  numero={numero}
                  andamento={chamado.andamento}
                  celular={false}
                  aoPedir={definirDialogo}
                />
              </span>
            )}
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
        {!celular && (
          <EtapasDoChamado
            etapas={chamado.etapas}
            pelaTi={chamado.pelaTi}
            agora={agora}
            dataHora={dataHora}
          />
        )}
        {outros.length > 0 && <OutrosChamados chamados={outros} vista={vista} />}
        {/* A conversa e a caixa são o lugar de soltar os anexos; fechado, ninguém recebe (tarefa 4.19). */}
        <LugarDeSoltar className={estilos.lugarDeSoltar}>
          <FluxoDoChamado ref={controle} chamado={chamado} acoes={acoes} />
          {chamado.fechado ? (
            <p className={estilos.semCaixa}>
              {reabrirAte === null
                ? 'O chamado fechou. Para o mesmo problema, abra outro chamado.'
                : `O chamado fechou em ${reabrirAte}. Para o mesmo problema, abra outro chamado.`}
            </p>
          ) : chamado.pelaTi && chamado.andamento ? (
            // O tipo gerado não liga o `pelaTi` ao `andamento`, que vem a quem participa pela TI.
            <CaixaDaTi
              chamado={chamado}
              andamento={chamado.andamento}
              caixa={caixa}
              aoEnviar={() => controle.current?.irAoFim()}
            />
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
        </LugarDeSoltar>
      </section>
      <aside className={estilos.painel} aria-labelledby={idDoPainel}>
        <h2 id={idDoPainel} className={estilos.tituloDoPainel}>
          Neste chamado
        </h2>
        {neste}
      </aside>
      {chamado.andamento && (
        <DialogosDoAndamento
          numero={numero}
          andamento={chamado.andamento}
          aberto={dialogo}
          aoFechar={() => definirDialogo(null)}
        />
      )}
      {celular && (
        <Folha aberta={painelNaFolha} aoMudarAberta={definirPainelNaFolha} titulo="Neste chamado">
          <div className={estilos.naFolha}>
            <EtapasDoChamado
              etapas={chamado.etapas}
              pelaTi={chamado.pelaTi}
              agora={agora}
              dataHora={dataHora}
              empilhadas
            />
            {neste}
          </div>
        </Folha>
      )}
    </div>
  );
}

/**
 * A caixa de quem participa pela TI: a mesma de quem pediu, com o mesmo rascunho, que troca só o envio,
 * pela rota da TI, e o texto de dentro. À pessoa que não usa o chat, a frase do Chamados. No
 * resolvido, no lugar dela, o cadeado, "O #1045 está resolvido." e "Reabrir", pela rota da TI.
 */
function CaixaDaTi({
  chamado,
  andamento,
  caixa,
  aoEnviar,
}: {
  chamado: ConversaDoChamado;
  andamento: NonNullable<ConversaDoChamado['andamento']>;
  caixa: RefObject<HTMLTextAreaElement | null>;
  aoEnviar: () => void;
}) {
  const { numero } = chamado;
  const doChat = useAndamentoNoChat(numero);
  const reler = useRelerOsChamadosDoChat();
  const atendimento = useAcoesDoAtendimento({ aoMudar: reler });
  const [reabrindo, definirReabrindo] = useState(false);
  const primeiroNome = nomeCurto(andamento.pessoa.nome);

  if (chamado.situacao === 'resolvido') {
    const reabrir = async () => {
      definirReabrindo(true);
      const resultado = await atendimento.reabrir(numero, andamento.versao);
      definirReabrindo(false);
      if (resultado) caixa.current?.focus();
    };
    return (
      <div className={estilos.resolvidoDaTi}>
        <Icone icone={Lock} tamanho={16} />
        <p>{`O #${numero} está resolvido.`}</p>
        {andamento.acoes.includes('reabrir') && (
          <Botao
            icone={RotateCcw}
            carregando={reabrindo}
            rotuloCarregando="Reabrindo o chamado"
            onPress={() => void reabrir()}
          >
            Reabrir
          </Botao>
        )}
      </div>
    );
  }
  return (
    <CaixaDoChat
      caixa={caixa}
      rascunho={rascunhoDoChamado(numero)}
      ajuda={`Escrever para ${primeiroNome} no #${numero}…`}
      dica="# cita um chamado"
      citar
      anexosEm="/chamados/anexos"
      nota={andamento.pessoa.usaOChat ? undefined : ajudaDoCampo(primeiroNome, false)}
      mandar={doChat.escrever}
      aoEnviar={aoEnviar}
    />
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
  pelaTi,
  agora,
  dataHora,
  empilhadas = false,
}: {
  etapas: readonly EtapaNoChat[];
  /** A quem participa pela TI, a espera é "Aguardando o colaborador". */
  pelaTi: boolean;
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
        const nome = nomeDaEtapa(etapa.situacao, pelaTi);
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
