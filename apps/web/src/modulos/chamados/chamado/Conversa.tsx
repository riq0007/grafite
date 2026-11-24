// A conversa do chamado aberto (spec modulo-chamados, "Chamado aberto"; change chamados-da-ti,
// design, "O chamado aberto, a conversa (tarefa 5.11)"; mockups m03 e m04): numa coluna de até
// 720 px, na ordem da API, a mensagem sem balão, com a sigla de 32 px, a nota interna no quadro
// tracejado da atenção, o evento numa linha entre dois fios, o alerta do ativo em peso forte e, logo
// depois da abertura, o resumo das respostas do formulário. Os anexos de cada mensagem e de cada
// nota vão numa lista, como a do formulário, com o nome, o tamanho e "Baixar". Com as conversas
// "Nos cantos" nas preferências (tarefa 5.29), a de quem pede fica à esquerda e as da TI à direita,
// em balões. Do chat (change chat-com-chamados, tarefa 4.13; mockups m05 e m11): a origem, no
// começo, com a mensagem citada e "Abrir a conversa" a quem participa dela; as mensagens de quem
// participa, com "· abriu o chamado" em quem abriu no nome de outra pessoa; a pergunta, sem ação para
// a TI; o cartão do ativo; o resumo dos tempos da resolução; a avaliação, com o comentário; e o
// fechamento.
import { destinoDaMensagem, partesDoResumo } from '@grafite/domain';
import { type DataHora, formatarTamanho, Icone, RotuloDeSituacao, useDataHora } from '@grafite/ui';
import { ArrowUpRight, BellRing, FileText, Hourglass, Lock, MessagesSquare } from 'lucide-react';
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { ProvedorDaJanelaDoChat } from '../../../chat/base.tsx';
import { CartaoDoAtivoNaMensagem } from '../../../chat/CartaoDoAtivoNaMensagem.tsx';
import { ImagemDoAnexo } from '../../../chat/ImagemDoAnexo.tsx';
import { LinkDoChat } from '../../../chat/LinkDoChat.tsx';
import { PerguntaDoChamado } from '../../../chat/PerguntaDoChamado.tsx';
import { ResumoDosTempos } from '../../../chat/ResumoDosTempos.tsx';
import { usePreferencias } from '../../../preferencias/usePreferencias.tsx';
import type { FichaDoChamado } from '../consultas.ts';
import { enderecoDoAnexo } from '../formulario/anexos.ts';
import { SiglaDaPessoa } from '../Pecas.tsx';
import estilos from './Conversa.module.css';
import {
  contextoDaFicha,
  type EscritoDaConversa,
  type ItemDaConversa,
  linhaDoAlerta,
  linhaDoEvento,
  momentoNaConversa,
  nomeNaConversa,
  tituloDaOrigem,
} from './conversa.ts';

type Escrito = EscritoDaConversa;
type OrigemDoChamado = NonNullable<FichaDoChamado['origemNoChat']>;

/** A folga, em px, em que quem lê ainda está no fim da conversa. */
const PERTO_DO_FIM = 32;

/**
 * A conversa presa ao fim: abre na última mensagem e, com quem lê no fim, continua nele quando chega
 * um item novo, a forma muda ou a área diminui, como quando o campo de escrever cresce. Quem subiu
 * para ler o começo fica onde está, até mandar o que escreveu: o envio leva ao fim.
 */
function usePresaAoFim(
  rolagem: RefObject<HTMLElement | null>,
  itens: unknown,
  forma: string,
  envios: number,
) {
  const noFim = useRef(true);
  useLayoutEffect(() => {
    const elemento = rolagem.current;
    if (envios === 0 || !elemento) return;
    noFim.current = true;
    elemento.scrollTop = elemento.scrollHeight;
  }, [rolagem, envios]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda a cada mudança dos itens e da forma.
  useLayoutEffect(() => {
    const elemento = rolagem.current;
    if (elemento && noFim.current) elemento.scrollTop = elemento.scrollHeight;
  }, [rolagem, itens, forma]);
  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    const medir = () => {
      noFim.current =
        elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight <= PERTO_DO_FIM;
    };
    const descer = () => {
      if (noFim.current) elemento.scrollTop = elemento.scrollHeight;
    };
    elemento.addEventListener('scroll', medir, { passive: true });
    const observador = new ResizeObserver(descer);
    observador.observe(elemento);
    return () => {
      elemento.removeEventListener('scroll', medir);
      observador.disconnect();
    };
  }, [rolagem]);
}

/**
 * A conversa do chamado, com o resumo das respostas depois da abertura: a única parte da tela que
 * rola, presa ao fim. Ela recebe o foco para rolar pelo teclado. `envios` conta o que o campo de
 * escrever mandou.
 */
export function Conversa({ ficha, envios = 0 }: { ficha: FichaDoChamado; envios?: number }) {
  const agora = useAgora();
  const dataHora = useDataHora();
  const rolagem = useRef<HTMLElement>(null);
  const forma = usePreferencias().preferencias.aparencia.conversas;
  usePresaAoFim(rolagem, ficha.conversa, forma, envios);
  const partes = partesDoResumo(ficha.formulario, ficha.respostas, contextoDaFicha(ficha));
  const resumo =
    partes.length === 0 ? null : (
      <li key="resumo" className={estilos.itemDoResumo}>
        <dl className={estilos.resumo} aria-label="Respostas do formulário">
          {partes.map((parte, indice) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: dois campos podem ter o mesmo nome no resumo; a posição é a ordem do formulário.
            <div key={indice}>
              <dt>{parte.nome}</dt>
              <dd className={parte.mono ? estilos.mono : undefined}>{parte.resposta}</dd>
            </div>
          ))}
        </dl>
      </li>
    );
  // O resumo vai depois do evento da abertura; sem ele, no começo da conversa.
  const abertura = ficha.conversa.findIndex(
    (item) => item.especie === 'evento' && item.evento === 'abertura',
  );
  const itens = ficha.conversa.map((item) => (
    <Fragment key={item.id}>
      <ItemNaConversa item={item} ficha={ficha} agora={agora} dataHora={dataHora} />
      {item.especie === 'evento' && item.evento === 'abertura' && resumo}
    </Fragment>
  ));
  return (
    <section
      ref={rolagem}
      className={estilos.conversa}
      aria-label="Conversa"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a área que rola recebe o foco para rolar pelo teclado.
      tabIndex={0}
      data-forma={forma}
    >
      {/* Os links do chat, como o "Abrir a conversa" e o "Abrir a ficha" do cartão, abrem nesta janela. */}
      <ProvedorDaJanelaDoChat>
        <ol className={estilos.itens}>
          {ficha.origemNoChat && (
            <OrigemNoChat
              origem={ficha.origemNoChat}
              numero={ficha.numero}
              agora={agora}
              dataHora={dataHora}
            />
          )}
          {abertura === -1 && resumo}
          {itens}
        </ol>
      </ProvedorDaJanelaDoChat>
    </section>
  );
}

function ItemNaConversa({
  item,
  ficha,
  agora,
  dataHora,
}: {
  item: ItemDaConversa;
  ficha: FichaDoChamado;
  agora: Date;
  dataHora: DataHora;
}) {
  switch (item.especie) {
    case 'mensagem':
    case 'nota':
      return (
        <Escrito
          item={item}
          numero={ficha.numero}
          pessoaDoChamado={ficha.pessoa.id}
          agora={agora}
          dataHora={dataHora}
        />
      );
    case 'evento': {
      const linha = linhaDoEvento(item, { pessoa: ficha.pessoa.nome, agora, dataHora });
      if (!linha) return null;
      const frase = (
        <LinhaEntreFios forte={linha.aguardando} icone={linha.aguardando ? Hourglass : undefined}>
          {linha.texto}
        </LinhaEntreFios>
      );
      // A resolução com o resumo dos tempos embaixo, e a avaliação com o comentário.
      const comentario = item.evento === 'avaliou' ? (item.avaliacao?.comentario ?? null) : null;
      if (!item.resumo && comentario === null) return frase;
      return (
        <li className={estilos.comDetalhe}>
          <ul className={estilos.semMarcas}>{frase}</ul>
          {item.resumo && (
            <ResumoDosTempos resumo={item.resumo} agora={agora} dataHora={dataHora} />
          )}
          {comentario !== null && (
            <blockquote className={estilos.comentario}>
              <p>{comentario}</p>
            </blockquote>
          )}
        </li>
      );
    }
    case 'alerta':
      return (
        <LinhaEntreFios forte icone={BellRing}>
          {linhaDoAlerta(item, ficha.ativo, agora, dataHora)}
        </LinhaEntreFios>
      );
  }
}

/** O evento e o alerta: a frase no meio, entre dois fios. */
function LinhaEntreFios({
  forte,
  icone,
  children,
}: {
  forte: boolean;
  icone?: typeof BellRing;
  children: ReactNode;
}) {
  return (
    <li className={estilos.evento} data-forte={forte ? '' : undefined}>
      <span>
        {icone && <Icone icone={icone} tamanho={14} />}
        {children}
      </span>
    </li>
  );
}

/**
 * A mensagem: a sigla, o nome com a hora, o texto e os anexos, sem balão no meio e num balão nos
 * cantos. A nota interna, no quadro tracejado, com o cadeado, "Nota interna · Ana Souza", a hora e o
 * selo "Só a TI vê". O lado é o de quem escreveu, para as conversas nos cantos: a pessoa que pede à
 * esquerda, a TI à direita.
 */
function Escrito({
  item,
  numero,
  pessoaDoChamado,
  agora,
  dataHora,
}: {
  item: Escrito;
  numero: number;
  pessoaDoChamado: string;
  agora: Date;
  dataHora: DataHora;
}) {
  const { autor, especie } = item;
  const hora = (
    <time className={estilos.hora} dateTime={item.em}>
      {momentoNaConversa(new Date(item.em), agora, dataHora)}
    </time>
  );
  return (
    <li
      className={especie === 'nota' ? estilos.nota : estilos.mensagem}
      data-lado={autor.tipo === 'pessoa' ? 'esquerda' : 'direita'}
    >
      <SiglaDaPessoa
        conta={autor.tipo === 'conta' ? autor.id : null}
        nome={autor.nome}
        tamanho="media"
      />
      <div className={estilos.corpo}>
        {especie === 'nota' ? (
          <p className={estilos.quem}>
            <Icone icone={Lock} tamanho={14} />
            <b>{`Nota interna · ${autor.nome}`}</b>
            {hora}
            <span className={estilos.selo}>
              <RotuloDeSituacao situacao="neutra" semIcone>
                Só a TI vê
              </RotuloDeSituacao>
            </span>
          </p>
        ) : (
          <p className={estilos.quem}>
            <b>{nomeNaConversa(autor, pessoaDoChamado)}</b>
            {hora}
          </p>
        )}
        {item.texto && <p className={estilos.texto}>{item.texto}</p>}
        {item.anexos.length > 0 && <Anexos anexos={item.anexos} numero={numero} />}
        {/* O cartão e a pergunta como a pessoa os vê no chat, sem a escolha, que é dela. */}
        {item.cartao && (
          <CartaoDoAtivoNaMensagem
            cartao={item.cartao}
            agora={agora}
            dataHora={dataHora}
            abrir={item.cartao.abrir}
          />
        )}
        {item.opcoes && (
          <PerguntaDoChamado
            opcoes={item.opcoes}
            escolhida={item.escolhida && { ...item.escolhida, minha: false }}
            escolher={null}
            agora={agora}
            dataHora={dataHora}
          />
        )}
      </div>
    </li>
  );
}

/**
 * A origem pelo chat, no começo da conversa (m05): de que conversa o chamado veio e as mensagens
 * citadas, na ordem da conversa, como ficaram na abertura, cada uma com quem a escreveu, a hora, o
 * texto e os anexos, que o chamado guardou. "Abrir a conversa" leva ao chat na primeira delas, só a
 * quem participa dela.
 */
function OrigemNoChat({
  origem,
  numero,
  agora,
  dataHora,
}: {
  origem: OrigemDoChamado;
  numero: number;
  agora: Date;
  dataHora: DataHora;
}) {
  return (
    <li className={estilos.origem}>
      <Icone icone={MessagesSquare} />
      <div className={estilos.deOnde}>
        <p className={estilos.tituloDaOrigem}>{tituloDaOrigem(origem.conversa)}</p>
        <div className={estilos.citadas}>
          {origem.mensagens.map((citada) => (
            <figure key={`${citada.autor} ${citada.em}`} className={estilos.citada}>
              <figcaption className={estilos.quemEscreveu}>
                {'Mensagem de '}
                <b>{citada.autor}</b>
                {', '}
                <time dateTime={citada.em}>
                  {momentoNaConversa(new Date(citada.em), agora, dataHora)}
                </time>
              </figcaption>
              {citada.texto && (
                <blockquote className={estilos.textoCitado}>
                  <p>{citada.texto}</p>
                </blockquote>
              )}
              {citada.anexos.length > 0 && <Anexos anexos={citada.anexos} numero={numero} />}
            </figure>
          ))}
        </div>
        {origem.abrir && (
          <LinkDoChat
            className={estilos.abrirAConversa}
            para={destinoDaMensagem(origem.abrir.conversa, origem.abrir.mensagem)}
          >
            Abrir a conversa
            <Icone icone={ArrowUpRight} tamanho={14} />
          </LinkDoChat>
        )}
      </div>
    </li>
  );
}

/**
 * Os anexos, como a lista do formulário: o ícone, o nome, o tamanho e "Baixar". A imagem vai na
 * miniatura, que baixa o arquivo, com o nome, o tamanho e "Baixar" embaixo (tarefa 4.20).
 */
function Anexos({ anexos, numero }: { anexos: Escrito['anexos']; numero: number }) {
  return (
    <ul className={estilos.arquivos} aria-label="Anexos">
      {anexos.map(({ id, nome, bytes, miniatura }) => {
        const endereco = enderecoDoAnexo(id, { nome, bytes, onde: 'no-chamado' }, numero);
        const linha = (
          <>
            {!miniatura && <Icone icone={FileText} />}
            <span className={estilos.nome} title={nome}>
              {nome}
            </span>
            <span className={estilos.tamanho}>{formatarTamanho(bytes)}</span>
            {endereco && (
              <a
                href={endereco}
                download={nome}
                aria-label={`Baixar ${nome}`}
                className={estilos.baixar}
                draggable={false}
              >
                Baixar
              </a>
            )}
          </>
        );
        if (!miniatura || !endereco) {
          return (
            <li key={id} className={estilos.arquivo}>
              {linha}
            </li>
          );
        }
        return (
          <li key={id} className={estilos.imagemAnexada}>
            <ImagemDoAnexo anexo={{ nome, bytes, miniatura }} endereco={endereco} semLegenda />
            <span className={estilos.arquivo}>{linha}</span>
          </li>
        );
      })}
    </ul>
  );
}
