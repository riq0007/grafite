// A conversa do chamado aberto (spec modulo-chamados, "Chamado aberto"; change chamados-da-ti,
// design, "O chamado aberto, a conversa (tarefa 5.11)"; mockups m03 e m04): numa coluna de até
// 720 px, na ordem da API, a mensagem sem balão, com a sigla de 32 px, a nota interna no quadro
// tracejado da atenção, o evento numa linha entre dois fios, o alerta do ativo em peso forte e, logo
// depois da abertura, o resumo das respostas do formulário. Os anexos de cada mensagem e de cada
// nota vão numa lista, como a do formulário, com o nome, o tamanho e "Baixar". Com as conversas
// "Nos cantos" nas preferências (tarefa 5.29), a de quem pede fica à esquerda e as da TI à direita,
// em balões.
import { partesDoResumo } from '@grafite/domain';
import { type DataHora, formatarTamanho, Icone, RotuloDeSituacao, useDataHora } from '@grafite/ui';
import { BellRing, FileText, Hourglass, Lock } from 'lucide-react';
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { usePreferencias } from '../../../preferencias/usePreferencias.tsx';
import type { FichaDoChamado } from '../consultas.ts';
import { enderecoDoAnexo } from '../formulario/anexos.ts';
import { SiglaDaPessoa } from '../Pecas.tsx';
import estilos from './Conversa.module.css';
import {
  contextoDaFicha,
  type ItemDaConversa,
  linhaDoAlerta,
  linhaDoEvento,
  momentoNaConversa,
} from './conversa.ts';

type Escrito = Extract<ItemDaConversa, { especie: 'mensagem' | 'nota' }>;

/** A folga, em px, em que quem lê ainda está no fim da conversa. */
const PERTO_DO_FIM = 32;

/**
 * A conversa presa ao fim: abre na última mensagem e, com quem lê no fim, continua nele quando chega
 * um item novo, a forma muda ou a área diminui, como quando o campo de escrever cresce. Quem subiu
 * para ler o começo fica onde está.
 */
function usePresaAoFim(rolagem: RefObject<HTMLElement | null>, itens: unknown, forma: string) {
  const noFim = useRef(true);
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
 * rola, presa ao fim. Ela recebe o foco para rolar pelo teclado.
 */
export function Conversa({ ficha }: { ficha: FichaDoChamado }) {
  const agora = useAgora();
  const dataHora = useDataHora();
  const rolagem = useRef<HTMLElement>(null);
  const forma = usePreferencias().preferencias.aparencia.conversas;
  usePresaAoFim(rolagem, ficha.conversa, forma);
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
      <ol className={estilos.itens}>
        {abertura === -1 && resumo}
        {itens}
      </ol>
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
      return <Escrito item={item} numero={ficha.numero} agora={agora} dataHora={dataHora} />;
    case 'evento': {
      const linha = linhaDoEvento(item, { pessoa: ficha.pessoa.nome, agora, dataHora });
      if (!linha) return null;
      return (
        <LinhaEntreFios forte={linha.aguardando} icone={linha.aguardando ? Hourglass : undefined}>
          {linha.texto}
        </LinhaEntreFios>
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
  agora,
  dataHora,
}: {
  item: Escrito;
  numero: number;
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
            <b>{autor.nome}</b>
            {hora}
          </p>
        )}
        {item.texto && <p className={estilos.texto}>{item.texto}</p>}
        {item.anexos.length > 0 && <Anexos anexos={item.anexos} numero={numero} />}
      </div>
    </li>
  );
}

/** Os anexos, como a lista do formulário: o ícone, o nome, o tamanho e "Baixar". */
function Anexos({ anexos, numero }: { anexos: Escrito['anexos']; numero: number }) {
  return (
    <ul className={estilos.arquivos} aria-label="Anexos">
      {anexos.map(({ id, nome, bytes }) => {
        const endereco = enderecoDoAnexo(id, { nome, bytes, onde: 'no-chamado' }, numero);
        return (
          <li key={id} className={estilos.arquivo}>
            <Icone icone={FileText} />
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
              >
                Baixar
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
