// A conversa do chamado de quem participa (spec modulo-chat, "Chamado no chat"; spec chamados,
// "Leitura do chamado pela pessoa", "Resposta nova", "Pergunta com opções" e "Resumo dos tempos";
// change chat-com-chamados, design, decisão 15, "O chamado no chat"): numa coluna, sem balão, como o
// chat, com a foto, o nome e a hora em cima de cada mensagem. A abertura, com a frase e a mensagem de
// onde o chamado veio ou o resumo das respostas; os dias; os eventos nas palavras do colaborador,
// como "Aguardando você", com a hora; o resolvido, com o resumo dos tempos; "Resposta nova", com
// "Marcar como vista"; a pergunta com as opções; o cartão do ativo; e a avaliação. A conversa abre
// na resposta nova ou no fim, e fica presa embaixo enquanto o que chega entra.
import { nomeNoChat } from '@grafite/domain';
import {
  Avatar,
  avisar,
  Botao,
  type DataHora,
  formatarTamanho,
  Icone,
  useDataHora,
} from '@grafite/ui';
import {
  Archive,
  CircleCheck,
  FileText,
  Hourglass,
  Image,
  LifeBuoy,
  type LucideIcon,
  Play,
  RotateCcw,
  Smile,
  Ticket,
  Undo2,
  Wrench,
} from 'lucide-react';
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AvaliacaoDoChamado } from './AvaliacaoDoChamado.tsx';
import { CartaoDoAtivoNaMensagem } from './CartaoDoAtivoNaMensagem.tsx';
import {
  type ConversaDoChamado,
  type EventoDoChamado,
  horaNaConversa,
  type ItemDoChamadoNaTela,
  itensDoChamado,
  type MensagemDoChamado,
} from './chamado.ts';
import type { AcoesDoChamado } from './consultas.ts';
import daConversa from './FluxoDaConversa.module.css';
import { estaNoFim, topoNaRolagem } from './FluxoDaConversa.tsx';
import estilos from './FluxoDoChamado.module.css';
import { ImagemDoAnexo, type MiniaturaDoAnexo } from './ImagemDoAnexo.tsx';
import { useAgoraNoChat } from './janela.ts';
import { type EscolherAOpcao, PerguntaDoChamado } from './PerguntaDoChamado.tsx';
import { ResumoDosTempos } from './ResumoDosTempos.tsx';

/** O espaço, em px, acima de "Resposta nova" quando a conversa abre nela. */
const ACIMA_DA_NOVA = 16;

/** O ícone e o tom de cada evento, na pílula dele; o de um código que esta versão não conhece, a boia. */
const MARCAS_DOS_EVENTOS: Readonly<
  Record<string, { icone: LucideIcon; tom?: 'atencao' | 'ok' | 'info' }>
> = {
  abertura: { icone: Ticket },
  assumiu: { icone: Wrench },
  passou: { icone: Wrench },
  devolveu: { icone: Undo2 },
  aguardando: { icone: Hourglass, tom: 'atencao' },
  retomou: { icone: Play },
  resolveu: { icone: CircleCheck, tom: 'ok' },
  reabriu: { icone: RotateCcw },
  avaliou: { icone: Smile },
  fechou: { icone: Archive },
};

/** O que a tela do chamado pede à conversa. */
export interface ControleDaConversaDoChamado {
  /** A conta mandou uma mensagem: a conversa vai ao fim e fica presa nele. */
  irAoFim: () => void;
}

export function FluxoDoChamado({
  chamado,
  acoes,
  ref,
}: {
  chamado: ConversaDoChamado;
  acoes: AcoesDoChamado;
  ref?: Ref<ControleDaConversaDoChamado | null>;
}) {
  const dataHora = useDataHora();
  const agora = useAgoraNoChat();
  const itens = useMemo(
    () => itensDoChamado(chamado, { agora, dataHora }),
    [chamado, agora, dataHora],
  );
  const rolagem = useRef<HTMLElement>(null);
  const conteudo = useRef<HTMLOListElement>(null);
  /** Quem lê está no fim: a conversa desce com o que chega. */
  const noFim = useRef(true);
  const aberta = useRef(false);
  const [marcando, definirMarcando] = useState(false);

  // A abertura vai à resposta nova, perto do alto, ou ao fim; depois, o que chega desce a conversa
  // de quem está no fim.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda a cada mudança dos itens, como a mensagem que chega.
  useLayoutEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    if (!aberta.current) {
      aberta.current = true;
      const nova = elemento.querySelector<HTMLElement>('[data-nova]');
      elemento.scrollTop = nova
        ? topoNaRolagem(elemento, nova) - ACIMA_DA_NOVA
        : elemento.scrollHeight;
      noFim.current = estaNoFim(elemento);
      return;
    }
    if (noFim.current) elemento.scrollTop = elemento.scrollHeight;
  }, [itens]);

  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    const medir = () => {
      noFim.current = estaNoFim(elemento);
    };
    // O que cresce depois de entrar, como a imagem que carrega, não tira do fim quem está nele.
    const descer = () => {
      if (noFim.current) elemento.scrollTop = elemento.scrollHeight;
    };
    elemento.addEventListener('scroll', medir, { passive: true });
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(descer) : null;
    observador?.observe(elemento);
    if (conteudo.current) observador?.observe(conteudo.current);
    return () => {
      elemento.removeEventListener('scroll', medir);
      observador?.disconnect();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    irAoFim: () => {
      const elemento = rolagem.current;
      noFim.current = true;
      if (elemento) elemento.scrollTop = elemento.scrollHeight;
    },
  }));

  /** "Marcar como vista": a resposta nova sai, e o foco, que estava no botão, vai à conversa. */
  const marcarComoVista = async () => {
    definirMarcando(true);
    const resposta = await acoes.marcarComoVista();
    definirMarcando(false);
    if ('dados' in resposta) rolagem.current?.focus({ preventScroll: true });
    else avisar({ situacao: 'atencao', titulo: resposta.erro });
  };

  // A escolha só no chamado aberto: o resolvido pede para escrever, e o fechado não muda mais. A
  // quem participa pela TI, as opções ficam sem ação: a escolha é da pessoa.
  const aceitaAEscolha = chamado.situacao !== 'resolvido' && !chamado.fechado && !chamado.pelaTi;
  const escolherNa = (mensagem: string): EscolherAOpcao | null =>
    aceitaAEscolha
      ? async (opcao) => {
          const resposta = await acoes.escolher(mensagem, opcao);
          if ('dados' in resposta) return null;
          return resposta.problema?.campos?.opcao ?? resposta.erro;
        }
      : null;

  return (
    <div className={daConversa.fluxo}>
      <section
        ref={rolagem}
        className={daConversa.rolagem}
        aria-label="Conversa do chamado"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a área que rola recebe o foco para rolar pelo teclado.
        tabIndex={0}
      >
        <ol ref={conteudo} className={daConversa.itens}>
          {itens.map((item) => (
            <ItemDaConversaDoChamado
              key={item.chave}
              item={item}
              chamado={chamado}
              acoes={acoes}
              agora={agora}
              dataHora={dataHora}
              escolherNa={escolherNa}
              marcando={marcando}
              marcarComoVista={() => void marcarComoVista()}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

function ItemDaConversaDoChamado({
  item,
  chamado,
  acoes,
  agora,
  dataHora,
  escolherNa,
  marcando,
  marcarComoVista,
}: {
  item: ItemDoChamadoNaTela;
  chamado: ConversaDoChamado;
  acoes: AcoesDoChamado;
  agora: Date;
  dataHora: DataHora;
  escolherNa: (mensagem: string) => EscolherAOpcao | null;
  marcando: boolean;
  marcarComoVista: () => void;
}) {
  switch (item.tipo) {
    case 'dia':
      return (
        <li className={daConversa.dia}>
          <h3>{item.rotulo}</h3>
        </li>
      );
    case 'nova':
      return (
        <li className={estilos.nova} data-nova="">
          <span className={estilos.fio} aria-hidden="true" />
          <span className={estilos.rotuloDaNova}>Resposta nova</span>
          <span className={estilos.fio} aria-hidden="true" />
          <Botao
            nivel="terciario"
            carregando={marcando}
            rotuloCarregando="Marcando como vista"
            onPress={marcarComoVista}
          >
            Marcar como vista
          </Botao>
        </li>
      );
    case 'abertura':
      return <Abertura evento={item.evento} chamado={chamado} agora={agora} dataHora={dataHora} />;
    case 'mensagem':
      return (
        <MensagemNoChamado
          mensagem={item.mensagem}
          numero={chamado.numero}
          escolher={escolherNa(item.mensagem.id)}
          agora={agora}
          dataHora={dataHora}
        />
      );
    case 'evento':
      return (
        <li className={estilos.evento}>
          <PilulaDoEvento evento={item.evento} pelaTi={chamado.pelaTi} dataHora={dataHora} />
          {item.evento.resumo && (
            <ResumoDosTempos resumo={item.evento.resumo} agora={agora} dataHora={dataHora} />
          )}
        </li>
      );
    case 'avaliacao':
      return (
        <li className={estilos.avaliacao}>
          <AvaliacaoDoChamado avaliacao={chamado.avaliacao} avaliar={acoes.avaliar} />
        </li>
      );
  }
}

/** O evento numa pílula, no meio da conversa: o ícone, a frase e a hora, no tom da espera ou do resolvido. */
function PilulaDoEvento({
  evento,
  pelaTi,
  dataHora,
}: {
  evento: EventoDoChamado;
  /** A quem participa pela TI, a espera é de outra pessoa: na informação, como o selo dela. */
  pelaTi: boolean;
  dataHora: DataHora;
}) {
  const daTabela = MARCAS_DOS_EVENTOS[evento.evento] ?? { icone: LifeBuoy };
  const marca =
    pelaTi && evento.evento === 'aguardando' ? { ...daTabela, tom: 'info' as const } : daTabela;
  return (
    <p className={estilos.pilula} data-tom={marca.tom}>
      <span className={estilos.iconeDoEvento}>
        <Icone icone={marca.icone} tamanho={16} />
      </span>
      <span>
        <span className={estilos.frase}>{evento.frase}</span>
        <span className={estilos.hora}>
          {' · '}
          <time dateTime={evento.em}>{dataHora.formatarHora(new Date(evento.em))}</time>
        </span>
      </span>
    </p>
  );
}

/**
 * Os anexos de uma mensagem ou da abertura, que baixam o arquivo pelo chamado; a imagem, na
 * miniatura (tarefa 4.20).
 */
function AnexosNoChamado({
  anexos,
  numero,
}: {
  anexos: readonly {
    id: string;
    nome: string;
    tipo: string;
    bytes: number;
    miniatura: MiniaturaDoAnexo | null;
  }[];
  numero: number;
}) {
  if (anexos.length === 0) return null;
  return (
    <ul className={daConversa.anexos} aria-label="Anexos">
      {anexos.map(({ miniatura, ...anexo }) => {
        const endereco = `/api/chat/chamados/${numero}/anexos/${anexo.id}`;
        const linha = (
          <a className={daConversa.anexo} href={endereco} download={anexo.nome} draggable={false}>
            <span className={daConversa.miniDoAnexo}>
              <Icone icone={anexo.tipo.startsWith('image/') ? Image : FileText} tamanho={20} />
            </span>
            <span>
              <span className={daConversa.nomeDoAnexo}>{anexo.nome}</span>
              <small>{formatarTamanho(anexo.bytes)}</small>
            </span>
          </a>
        );
        return (
          <li key={anexo.id}>
            {miniatura ? (
              <ImagemDoAnexo anexo={{ ...anexo, miniatura }} endereco={endereco} reserva={linha} />
            ) : (
              linha
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A abertura: a frase dela, como "Recebemos o seu chamado", com a hora, e, embaixo, as mensagens do
 * chat de onde o chamado veio, citadas na ordem da conversa, cada uma com quem a escreveu, a hora, o
 * texto e os anexos, ou o resumo das respostas, com os anexos dos campos.
 */
function Abertura({
  evento,
  chamado,
  agora,
  dataHora,
}: {
  evento: EventoDoChamado | null;
  chamado: ConversaDoChamado;
  agora: Date;
  dataHora: DataHora;
}) {
  const { origens } = chamado;
  return (
    <li className={estilos.abertura}>
      {evento && <PilulaDoEvento evento={evento} pelaTi={chamado.pelaTi} dataHora={dataHora} />}
      {origens.length > 0
        ? origens.map((origem) => (
            <figure key={`${origem.autor} ${origem.em}`} className={estilos.origem}>
              <figcaption className={estilos.deOnde}>
                {`Mensagem de ${origem.autor} · ${horaNaConversa(new Date(origem.em), agora, dataHora)}`}
              </figcaption>
              {/* A citada só com os anexos fica sem o texto (tarefa 4.18). */}
              {origem.texto && (
                <blockquote className={estilos.citada}>
                  <p className={daConversa.texto}>{origem.texto}</p>
                </blockquote>
              )}
              <AnexosNoChamado anexos={origem.anexos} numero={chamado.numero} />
            </figure>
          ))
        : (chamado.resumo !== '' || chamado.anexosDosCampos.length > 0) && (
            <div className={estilos.origem}>
              {chamado.resumo !== '' && <p className={daConversa.texto}>{chamado.resumo}</p>}
              <AnexosNoChamado anexos={chamado.anexosDosCampos} numero={chamado.numero} />
            </div>
          )}
    </li>
  );
}

/**
 * A mensagem: a foto, o nome e a hora em cima, o texto, os anexos, o cartão do ativo e a pergunta,
 * cada uma com o cabeçalho dela, sem juntar as seguidas da mesma pessoa, como no m04.
 */
function MensagemNoChamado({
  mensagem,
  numero,
  escolher,
  agora,
  dataHora,
}: {
  mensagem: MensagemDoChamado;
  numero: number;
  escolher: EscolherAOpcao | null;
  agora: Date;
  dataHora: DataHora;
}) {
  const { autor } = mensagem;
  return (
    <li className={estilos.mensagem}>
      <Avatar nome={autor.nome} className={estilos.foto} decorativo />
      <div className={daConversa.corpo}>
        <p className={daConversa.quem}>
          <span className={daConversa.nome}>
            {autor.minha ? 'Você' : nomeNoChat(autor.nome, autor.daTi)}
          </span>
          <time dateTime={mensagem.em}>{dataHora.formatarHora(new Date(mensagem.em))}</time>
        </p>
        {mensagem.texto && <p className={daConversa.texto}>{mensagem.texto}</p>}
        <AnexosNoChamado anexos={mensagem.anexos} numero={numero} />
        {mensagem.cartao && (
          <CartaoDoAtivoNaMensagem cartao={mensagem.cartao} agora={agora} dataHora={dataHora} />
        )}
        {mensagem.opcoes && (
          <PerguntaDoChamado
            opcoes={mensagem.opcoes}
            escolhida={mensagem.escolhida}
            escolher={escolher}
            agora={agora}
            dataHora={dataHora}
          />
        )}
      </div>
    </li>
  );
}
