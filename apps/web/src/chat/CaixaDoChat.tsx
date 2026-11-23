// A caixa de escrever do chat (spec modulo-chat, "Caixa de escrever do chat"; spec chat, "Mensagem";
// change chat-com-chamados, design, decisão 15, "A caixa e o menu da mensagem"; mockup m01): a caixa
// arredondada, com o texto de ajuda, o clipe e o envio dentro dela, a mensagem respondida em cima e
// os anexos embaixo. Enter manda e Shift+Enter quebra a linha; o envio fica sem ação com a caixa
// vazia. O "#" abre a lista dos chamados da conta, para citar. O que se escreve fica no rascunho da
// conversa, e a recusa fica embaixo da caixa, com a frase dela. Os anexos entram pelo clipe, colados
// e soltos na conversa em volta, que é o lugar de soltar (tarefa 4.19).
import { conferirMensagem, MAXIMO_DE_ANEXOS } from '@grafite/domain';
import {
  BarraDeProgresso,
  Botao,
  BotaoDeIcone,
  FORMATOS_DE_ARQUIVO,
  formatarTamanho,
  Icone,
  useArquivosSoltos,
  useDataHora,
} from '@grafite/ui';
import { ArrowUp, CornerUpLeft, FileText, Paperclip } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { FalhaDoPedido } from '../api/pedir.ts';
import { arquivosColados } from '../modulos/chamados/formulario/colar.ts';
import { Recusa } from '../modulos/chamados/formulario/Recusa.tsx';
import { useFilaDeAnexos } from '../modulos/chamados/formulario/useFilaDeAnexos.ts';
import estilos from './CaixaDoChat.module.css';
import { chamadosParaCitar, citacaoNoCursor, citarNoTexto } from './citar.ts';
import { useChamadosDoChat } from './consultas.ts';
import { RASCUNHO_VAZIO, useRascunho } from './rascunhos.tsx';

/** O que a caixa manda: o texto, os anexos já enviados e a mensagem respondida. */
export interface CorpoDaMensagem {
  texto: string;
  anexos?: string[];
  respondeA?: string | null;
}

export interface PropsDaCaixaDoChat<T> {
  /** A chave do rascunho: a conversa, ou a pessoa da direta que ainda não nasceu. */
  rascunho: string;
  /** O texto de ajuda, como "Escrever uma mensagem em Equipe Financeiro…". */
  ajuda: string;
  /** O pedido que manda a mensagem, com a resposta como o `pedir` a devolve. */
  mandar: (corpo: CorpoDaMensagem) => Promise<{ dados: T } | FalhaDoPedido>;
  /** A mensagem foi aceita: a caixa já está vazia. */
  aoEnviar: (dados: T) => void;
  /** Os chamados da conta entram na lista do "#": só com o módulo Chamados ligado. */
  citar: boolean;
  /** A caixa de texto, para o "Responder" pôr o foco nela. */
  caixa?: RefObject<HTMLTextAreaElement | null>;
  /** Para onde os anexos sobem: os do chat ou, na conversa de um chamado, os dos chamados. */
  anexosEm?: '/chat/anexos' | '/chamados/anexos';
  /**
   * A dica à direita da caixa vazia, como "# cita um chamado", que o leitor de tela ouve como a
   * descrição da caixa.
   */
  dica?: string;
  /** O que vem antes do texto, como o cadeado do chamado resolvido. */
  inicio?: ReactNode;
  /** O que fica no lugar do envio com a caixa vazia, como o "Reabrir até 18/11". */
  semTexto?: ReactNode;
}

export function CaixaDoChat<T>({
  rascunho: chave,
  ajuda,
  mandar,
  aoEnviar,
  citar,
  caixa: deFora,
  anexosEm = '/chat/anexos',
  dica,
  inicio,
  semTexto,
}: PropsDaCaixaDoChat<T>) {
  const [rascunho, mudarRascunho] = useRascunho(chave);
  const { texto, respondida, anexos } = rascunho;
  const daCaixa = useRef<HTMLTextAreaElement>(null);
  const caixa = deFora ?? daCaixa;
  const escolha = useRef<HTMLInputElement>(null);
  const [enviando, definirEnviando] = useState(false);
  const [recusa, definirRecusa] = useState<string | null>(null);
  const [cursor, definirCursor] = useState<number | null>(null);
  const idDaRecusa = useId();
  const idDaDica = useId();
  const { fila, progresso, recusas, receber, limparRecusas } = useFilaDeAnexos({
    ocupados: anexos.length,
    soNoNavegador: false,
    endereco: anexosEm,
    aoAnexar: (id, { nome, bytes }) =>
      mudarRascunho((antes) => ({ ...antes, anexos: [...antes.anexos, { id, nome, bytes }] })),
  });
  const vazia = texto.trim() === '';
  const cabeMais = anexos.length + fila.length < MAXIMO_DE_ANEXOS;
  const semNada = vazia && anexos.length === 0 && fila.length === 0;
  const { fuso } = useDataHora();

  /** Os arquivos do clipe, os colados e os soltos, com as mesmas regras e recusas. */
  const anexar = (arquivos: File[]) => {
    definirRecusa(null);
    receber(arquivos);
  };
  // Durante o envio, a caixa só se lê, e nada entra, como o texto.
  useArquivosSoltos(enviando ? null : anexar);

  // A caixa cresce com o texto, até o limite do CSS; dali em diante, rola.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo a cada texto.
  useLayoutEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;
    elemento.style.height = '0px';
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [texto]);

  // O cursor vai ao lugar depois do texto que a escolha do chamado mudou.
  const cursorDepois = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o cursor vai ao lugar depois do texto novo.
  useLayoutEffect(() => {
    const elemento = caixa.current;
    if (!elemento || cursorDepois.current === null) return;
    elemento.setSelectionRange(cursorDepois.current, cursorDepois.current);
    definirCursor(cursorDepois.current);
    cursorDepois.current = null;
  }, [texto]);

  const lista = useListaDoChamado({ texto, cursor, citar });

  function escolherChamado(numero: number) {
    if (!lista.citacao || cursor === null) return;
    const citado = citarNoTexto(texto, lista.citacao.inicio, cursor, numero);
    cursorDepois.current = citado.cursor;
    mudarRascunho((antes) => ({ ...antes, texto: citado.texto }));
    definirRecusa(null);
  }

  async function enviar() {
    if (enviando || fila.length > 0 || (vazia && anexos.length === 0)) return;
    // A regra da API, sem o pedido: a mensagem vai com o texto ou só com os anexos (tarefa 4.18).
    const conferida = conferirMensagem({ texto, anexos: anexos.length });
    if (!conferida.ok) {
      definirRecusa(conferida.erro);
      caixa.current?.focus();
      return;
    }
    definirEnviando(true);
    const foram = anexos.map(({ id }) => id);
    const respondeA = respondida?.id ?? null;
    const resultado = await mandar({
      texto,
      anexos: foram.length > 0 ? foram : undefined,
      respondeA,
    });
    definirEnviando(false);
    if ('erro' in resultado) {
      const doCampo = resultado.problema?.campos && Object.values(resultado.problema.campos)[0];
      definirRecusa(doCampo || resultado.erro);
      caixa.current?.focus();
      return;
    }
    // Sai o que foi na mensagem: o anexo que terminou de subir enquanto ela ia fica para a próxima.
    mudarRascunho((antes) => ({
      ...RASCUNHO_VAZIO,
      respondida: antes.respondida?.id === respondeA ? null : antes.respondida,
      anexos: antes.anexos.filter(({ id }) => !foram.includes(id)),
    }));
    definirRecusa(null);
    limparRecusas();
    caixa.current?.focus();
    aoEnviar(resultado.dados);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.nativeEvent.isComposing) return;
    if (lista.aberta && lista.teclar(evento, escolherChamado)) return;
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.ctrlKey && !evento.altKey) {
      evento.preventDefault();
      void enviar();
    }
  }

  const recusasAVista = [
    ...recusas.map(({ chave: id, texto: frase }) => ({ id: `fila-${id}`, frase })),
    ...(recusa === null ? [] : [{ id: 'envio', frase: recusa }]),
  ];

  return (
    <div className={estilos.area}>
      <div className={estilos.caixa} data-invalida={recusa !== null || undefined}>
        {lista.aberta && (
          <div
            id={lista.id}
            role="listbox"
            aria-label="Chamados para citar"
            className={estilos.lista}
          >
            {lista.chamados.map((chamado, posicao) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado escolhe pela caixa de texto, que segue com o foco (aria-activedescendant).
              <div
                key={chamado.numero}
                id={`${lista.id}-${chamado.numero}`}
                role="option"
                tabIndex={-1}
                aria-selected={posicao === lista.ativa}
                className={estilos.opcao}
                onPointerMove={() => lista.apontar(posicao)}
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => escolherChamado(chamado.numero)}
              >
                <span className={estilos.numero}>#{chamado.numero}</span>
                <span className={estilos.tituloDoChamado}>{chamado.titulo}</span>
              </div>
            ))}
          </div>
        )}
        {respondida && (
          <div className={estilos.respondida}>
            <Icone icone={CornerUpLeft} tamanho={14} />
            <span className={estilos.paraOLeitor}>Respondendo a </span>
            <span className={estilos.autorDaRespondida}>{respondida.autor}</span>
            <span className={estilos.comecoDaRespondida}>{respondida.comeco}</span>
            <Botao
              nivel="terciario"
              className={estilos.tirar}
              aria-label="Tirar a mensagem respondida"
              onPress={() => {
                mudarRascunho((antes) => ({ ...antes, respondida: null }));
                caixa.current?.focus();
              }}
            >
              Tirar
            </Botao>
          </div>
        )}
        <div className={estilos.linha}>
          {inicio && <span className={estilos.inicio}>{inicio}</span>}
          <textarea
            ref={caixa}
            className={estilos.texto}
            rows={1}
            value={texto}
            placeholder={ajuda}
            aria-label={ajuda.replace(/…$/u, '')}
            aria-invalid={recusa !== null || undefined}
            aria-describedby={
              [recusasAVista.length > 0 ? idDaRecusa : null, dica ? idDaDica : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
            aria-autocomplete={citar ? 'list' : undefined}
            aria-controls={lista.aberta ? lista.id : undefined}
            aria-activedescendant={lista.aberta ? lista.idDaAtiva : undefined}
            readOnly={enviando}
            onChange={(evento) => {
              mudarRascunho((antes) => ({ ...antes, texto: evento.target.value }));
              definirCursor(evento.target.selectionStart);
              definirRecusa(null);
            }}
            onSelect={(evento) => definirCursor(evento.currentTarget.selectionStart)}
            onBlur={() => definirCursor(null)}
            onKeyDown={aoTeclar}
            onPaste={(evento) => {
              if (enviando) return;
              // O que traz o texto segue para a caixa, como o navegador cola.
              const colados = arquivosColados(evento.clipboardData, new Date(), fuso);
              if (colados === null) return;
              evento.preventDefault();
              anexar(colados);
            }}
          />
          {dica && (
            // Escondida com o que se escreve, a dica segue como a descrição da caixa.
            <span id={idDaDica} className={estilos.dica} hidden={!semNada}>
              {dica}
            </span>
          )}
          {cabeMais && (
            <>
              <input
                ref={escolha}
                type="file"
                multiple
                hidden
                accept={FORMATOS_DE_ARQUIVO.join(',')}
                onChange={(evento) => {
                  anexar([...(evento.target.files ?? [])]);
                  // O mesmo arquivo pode ser escolhido de novo, depois de tirado.
                  evento.target.value = '';
                }}
              />
              <BotaoDeIcone
                icone={Paperclip}
                rotulo="Anexar arquivos"
                className={estilos.clipe}
                onPress={() => escolha.current?.click()}
              />
            </>
          )}
          {semTexto && semNada ? (
            <span className={estilos.semTexto}>{semTexto}</span>
          ) : (
            <BotaoDeIcone
              icone={ArrowUp}
              rotulo="Enviar"
              className={estilos.enviar}
              isDisabled={(vazia && anexos.length === 0) || fila.length > 0}
              isPending={enviando}
              onPress={() => void enviar()}
            />
          )}
        </div>
        {(anexos.length > 0 || fila.length > 0) && (
          <ul className={estilos.anexos} aria-label="Anexos da mensagem">
            {anexos.map((anexo) => (
              <li key={anexo.id} className={estilos.anexo}>
                <Icone icone={FileText} />
                <span className={estilos.nomeDoAnexo} title={anexo.nome}>
                  {anexo.nome}
                </span>
                <span className={estilos.tamanho}>{formatarTamanho(anexo.bytes)}</span>
                <Botao
                  nivel="terciario"
                  className={estilos.tirar}
                  aria-label={`Tirar ${anexo.nome}`}
                  onPress={() =>
                    mudarRascunho((antes) => ({
                      ...antes,
                      anexos: antes.anexos.filter(({ id }) => id !== anexo.id),
                    }))
                  }
                >
                  Tirar
                </Botao>
              </li>
            ))}
            {fila.map(({ chave: naFila, arquivo }, posicao) => (
              <li key={`na-fila-${naFila}`} className={estilos.anexo}>
                <Icone icone={FileText} />
                <span className={estilos.nomeDoAnexo} title={arquivo.name}>
                  {arquivo.name}
                </span>
                {posicao === 0 ? (
                  <BarraDeProgresso
                    rotulo={`Enviando ${arquivo.name}`}
                    valor={progresso ?? undefined}
                    className={estilos.progresso}
                  />
                ) : (
                  <span className={estilos.tamanho}>Na fila</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {recusasAVista.length > 0 && (
        <div id={idDaRecusa} className={estilos.recusas}>
          {recusasAVista.map(({ id, frase }) => (
            <Recusa key={id} texto={frase} />
          ))}
        </div>
      )}
      <span role="status" className={estilos.paraOLeitor}>
        {lista.aberta ? lista.anuncio : ''}
      </span>
    </div>
  );
}

/**
 * A lista do "#": os chamados da conta que a busca depois do "#" acha, com o escolhido pelas setas.
 * Esc a fecha até o "#" seguinte; sem nenhum achado, ela não abre, e o Enter manda.
 */
function useListaDoChamado({
  texto,
  cursor,
  citar,
}: {
  texto: string;
  cursor: number | null;
  citar: boolean;
}) {
  const id = useId();
  const chamados = useChamadosDoChat(citar);
  const [ativa, definirAtiva] = useState(0);
  const [dispensada, definirDispensada] = useState<number | null>(null);
  // O "#" dispensado que sai do texto, como no envio ou ao apagar, solta a lista: o "#" que vier
  // depois no mesmo lugar a abre de novo.
  if (dispensada !== null && texto[dispensada] !== '#') definirDispensada(null);
  const citacao = citar && cursor !== null ? citacaoNoCursor(texto, cursor) : null;
  const daConta = chamados.data ? [...chamados.data.abertos, ...chamados.data.resolvidos] : [];
  const achados = citacao ? chamadosParaCitar(daConta, citacao.busca) : [];
  const aberta = citacao !== null && achados.length > 0 && dispensada !== citacao.inicio;
  const posicao = Math.min(ativa, Math.max(0, achados.length - 1));
  const busca = citacao?.busca ?? null;

  // A busca nova começa do primeiro achado.
  // biome-ignore lint/correctness/useExhaustiveDependencies: volta ao primeiro a cada busca.
  useLayoutEffect(() => {
    definirAtiva(0);
  }, [busca]);

  /** A tecla da lista aberta; `true` quando ela a usou. */
  function teclar(
    evento: KeyboardEvent<HTMLTextAreaElement>,
    escolher: (numero: number) => void,
  ): boolean {
    const total = achados.length;
    switch (evento.key) {
      case 'ArrowDown':
        definirAtiva((posicao + 1) % total);
        break;
      case 'ArrowUp':
        definirAtiva((posicao - 1 + total) % total);
        break;
      case 'Enter':
      case 'Tab': {
        const escolhido = achados[posicao];
        if (!escolhido || evento.shiftKey) return false;
        escolher(escolhido.numero);
        break;
      }
      case 'Escape':
        definirDispensada(citacao?.inicio ?? null);
        break;
      default:
        return false;
    }
    evento.preventDefault();
    return true;
  }

  const escolhido = achados[posicao];
  return {
    id,
    aberta,
    citacao,
    chamados: achados,
    ativa: posicao,
    idDaAtiva: escolhido ? `${id}-${escolhido.numero}` : undefined,
    anuncio:
      achados.length === 1 ? '1 chamado para citar' : `${achados.length} chamados para citar`,
    apontar: definirAtiva,
    teclar,
  };
}
