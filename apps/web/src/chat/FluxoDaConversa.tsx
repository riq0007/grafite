// As mensagens da conversa aberta (spec modulo-chat, "Conversa na tela" e "Menu da mensagem"; spec
// chat, "Não lidas", "Reações", "Link da mensagem" e "Chamados da conversa"; change
// chat-com-chamados, design, decisões 5 e 15):
// numa coluna, sem balão, com a foto, o nome e a hora em cima, as seguidas da mesma pessoa juntas,
// os dias e os eventos. A conversa abre na mensagem do link, marcada, na primeira não lida, com
// "Mensagens novas", ou no fim, e fica presa embaixo enquanto as mensagens chegam; rolada para cima,
// a que chega mostra "Mensagens novas · 2", que leva ao fim. As mais antigas vêm ao rolar para cima,
// com "Mensagens anteriores", e, no trecho que não chega ao fim, as seguintes vêm ao rolar para
// baixo. A última mostrada fica lida com a conversa à vista. O mouse e o foco numa mensagem mostram a
// barra dela; as setas andam pelas mensagens, e Ctrl+Shift+T abre o transformar em chamado. O botão
// direito na mensagem abre o menu do "Mais" onde o ponteiro está, e a tecla de menu e o Shift+F10,
// junto do "Mais"; no link e no texto selecionado fica o menu do navegador. No toque, a barra não
// aparece, e o toque longo abre a folha da mensagem.
import { nomeNoChat } from '@grafite/domain';
import {
  Avatar,
  Botao,
  type DataHora,
  formatarTamanho,
  Icone,
  noTextoSelecionado,
  trechosSelecionados,
  useDataHora,
} from '@grafite/ui';
import { ArrowDown, CornerUpLeft, FileText, Image, LifeBuoy } from 'lucide-react';
import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FalhaDaConsulta } from '../api/consultas.ts';
import { miniaturasNoChat } from '../api/fotos.ts';
import { useDestinoAVista } from '../notificacoes/destinosAVista.tsx';
import { useSessao } from '../sessao/useSessao.tsx';
import {
  type AcoesDaMensagem,
  BarraDaMensagem,
  type Reagir,
  reagirAvisando,
} from './BarraDaMensagem.tsx';
import { ChipDoChamado } from './ChamadoCitado.tsx';
import { type CitacaoNaMensagem, partesDoTexto } from './citacoes.ts';
import { type CargaDoTrecho, type MensagensDaConversa, useLeituraDaConversa } from './consultas.ts';
import { type ItemNaTela, itensDaConversa, type MensagemDoChat, novasDesde } from './conversa.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import estilos from './FluxoDaConversa.module.css';
import { FolhaDaMensagem } from './FolhaDaMensagem.tsx';
import { useAgoraNoChat, useJanelaAVista } from './janela.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import { MenuDaMensagem } from './MenuDaMensagem.tsx';
import { useToqueLongo } from './toqueLongo.ts';

/** A folga, em px, em que quem lê ainda está no fim da conversa. */
const PERTO_DO_FIM = 32;

/** O espaço, em px, acima do separador "Mensagens novas" quando a conversa abre nele. */
const ACIMA_DAS_NOVAS = 16;

/** O quanto antes de a ponta aparecer as anteriores e as seguintes já começam a vir. */
const ANTES_DA_PONTA = '160px 0px';

export const estaNoFim = (elemento: HTMLElement) =>
  elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight <= PERTO_DO_FIM;

/** A distância do elemento ao topo do conteúdo que rola. */
export const topoNaRolagem = (rolagem: HTMLElement, elemento: HTMLElement) =>
  elemento.getBoundingClientRect().top - rolagem.getBoundingClientRect().top + rolagem.scrollTop;

/** A API respondeu que não há o que se pediu, como a mensagem do link de outra conversa. */
export const naoEncontrada = (erro: unknown) =>
  erro instanceof FalhaDaConsulta && erro.falha.problema?.status === 404;

const daMensagem = (rolagem: HTMLElement, id: string) =>
  rolagem.querySelector<HTMLElement>(`[data-mensagem="${id}"]`);

/** O id da mensagem escrita em volta do elemento, a que tem a barra; os eventos não têm. */
const escritaEmVolta = (alvo: EventTarget | null) =>
  alvo instanceof Element
    ? (alvo.closest<HTMLElement>('[data-escrita]')?.dataset.mensagem ?? null)
    : null;

/** As teclas que andam pelas mensagens com o foco numa delas. */
const PASSOS: Record<string, (posicao: number, total: number) => number> = {
  ArrowUp: (posicao) => posicao - 1,
  ArrowDown: (posicao) => posicao + 1,
  Home: () => 0,
  End: (_, total) => total - 1,
};

/**
 * O foco anda pelas mensagens escritas com as setas, o Home e o End, como numa lista: só a da vez
 * fica na ordem do Tab, e as teclas dos botões e links dentro dela continuam com eles.
 */
function andarPelasMensagens(evento: KeyboardEvent<HTMLOListElement>) {
  const atual = evento.target;
  const passo = PASSOS[evento.key];
  if (!passo || !(atual instanceof HTMLElement) || !atual.matches('[data-escrita]')) return;
  if (evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey) return;
  const todas = [...evento.currentTarget.querySelectorAll<HTMLElement>('[data-escrita]')];
  const destino = todas[passo(todas.indexOf(atual), todas.length)];
  if (!destino) return;
  evento.preventDefault();
  destino.focus();
}

/**
 * O destino do salto pela respondida fica com o fundo do mouse até o próximo clique ou a próxima
 * tecla: o foco que o clique põe nele não é o do teclado, que o `:focus-visible` pinta, e sem a
 * marca nada diria aonde a conversa foi. O clique que fez o salto já passou quando ela entra.
 */
function marcarODestino(destino: HTMLElement) {
  destino.setAttribute('data-saltada', '');
  const tirar = () => {
    destino.removeAttribute('data-saltada');
    window.removeEventListener('pointerdown', tirar, true);
    window.removeEventListener('keydown', tirar, true);
  };
  window.addEventListener('pointerdown', tirar, true);
  window.addEventListener('keydown', tirar, true);
}

/** Uma janela por cima da conversa, como um diálogo ou um menu, fica com o atalho. */
const COM_O_ATALHO = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/** Um ponto nas coordenadas da janela. */
interface Ponto {
  x: number;
  y: number;
}

/** A tecla de menu ou o Shift+F10, como na tabela e no quadro do kit. */
const pedeOMenu = (evento: KeyboardEvent) =>
  evento.key === 'ContextMenu' || (evento.shiftKey && evento.key === 'F10');

const entre = (valor: number, de: number, ate: number) => Math.min(Math.max(valor, de), ate);

/**
 * Onde o menu da tecla abre: junto do "Mais", no canto da mensagem, preso ao trecho dela que está à
 * vista na conversa, como o da mensagem alta, que passa do alto da área.
 */
function juntoDoMais(mensagem: HTMLElement, area: HTMLElement | null): Ponto {
  const caixa = mensagem.getBoundingClientRect();
  const mais = mensagem.querySelector('[data-mais]')?.getBoundingClientRect();
  const vista = area?.getBoundingClientRect() ?? caixa;
  const topo = Math.max(caixa.top, vista.top);
  const esquerda = Math.max(caixa.left, vista.left);
  return {
    x: entre(
      mais?.left ?? caixa.right,
      esquerda,
      Math.max(esquerda, Math.min(caixa.right, vista.right)),
    ),
    y: entre(mais?.bottom ?? caixa.top, topo, Math.max(topo, Math.min(caixa.bottom, vista.bottom))),
  };
}

/**
 * A abertura: a mensagem do link no meio da área, o separador "Mensagens novas" no alto ou, sem
 * nenhum dos dois, o fim da conversa.
 */
function pontoDaAbertura(rolagem: HTMLElement, alvo: string | null): number {
  const doAlvo = alvo === null ? null : daMensagem(rolagem, alvo);
  if (doAlvo) {
    return topoNaRolagem(rolagem, doAlvo) - (rolagem.clientHeight - doAlvo.offsetHeight) / 2;
  }
  const novas = rolagem.querySelector<HTMLElement>('[data-novas]');
  return novas ? topoNaRolagem(rolagem, novas) - ACIMA_DAS_NOVAS : rolagem.scrollHeight;
}

/**
 * A rolagem que a própria conversa faz, guardada em `propria`. O evento dela chega no quadro
 * seguinte, quando a tela já pode ter mudado, como a faixa das abas, que aparece depois da
 * abertura: ele não diz onde quem lê quis ficar.
 */
function rolarPara(rolagem: HTMLElement, topo: number, propria: { current: number | null }) {
  const antes = rolagem.scrollTop;
  rolagem.scrollTop = topo;
  if (rolagem.scrollTop !== antes) propria.current = rolagem.scrollTop;
}

/** O nome de quem escreveu, no chat: "Você" para a conta, e o "(TI)" para quem atende. */
const nomeDoAutor = (autor: MensagemDoChat['autor'], conta: string) =>
  autor.conta === conta ? 'Você' : nomeNoChat(autor.nome, autor.daTi);

const LISTA = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/** O que a tela da conversa pede às mensagens. */
export interface ControleDoFluxo {
  /**
   * A conta mandou uma mensagem: a conversa vai ao fim e fica presa nele, e, com o trecho longe do
   * fim, traz as mais novas, com a mandada.
   */
  irAoFimAoEnviar: (comAsMaisNovas: boolean) => void;
}

export function FluxoDaConversa({
  conversa,
  alvo,
  visivel,
  mensagens: { trecho, mais },
  acoes = null,
  ref,
}: {
  conversa: string;
  /** A mensagem do link (`?m=`), que a conversa abre marcada. */
  alvo: string | null;
  /** A conversa está na tela: a aba Conversa escolhida, ou a direta, que não tem abas. */
  visivel: boolean;
  mensagens: MensagensDaConversa;
  /** O que a barra de cada mensagem faz; sem elas, as mensagens ficam sem a barra. */
  acoes?: AcoesDaMensagem | null;
  ref?: Ref<ControleDoFluxo | null>;
}) {
  const sessao = useSessao();
  const conta = (sessao.tipo === 'ativa' && sessao.conta.id) || '';
  const dataHora = useDataHora();
  const agora = useAgoraNoChat();
  const janelaAVista = useJanelaAVista();
  const dados = trecho.data;
  const itens = useMemo(
    () =>
      dados
        ? itensDaConversa(dados.itens, {
            conta,
            lidaAoAbrir: dados.lidaAoAbrir,
            agora,
            dataHora,
          })
        : [],
    [dados, conta, agora, dataHora],
  );
  const primeira = dados?.itens[0]?.id ?? null;
  const ultima = dados?.itens.at(-1)?.id ?? null;
  const escritas = useMemo(
    () => dados?.itens.filter(({ especie }) => especie === 'mensagem') ?? [],
    [dados],
  );
  /** A mensagem em que o foco esteve por último, a única na ordem do Tab; sem ela, a última. */
  const [comOFoco, definirComOFoco] = useState<string | null>(null);
  /** A mensagem com o mouse em cima. */
  const [comOPonteiro, definirComOPonteiro] = useState<string | null>(null);
  /** A mensagem do toque longo, com a folha dela; a vez muda a cada toque longo, e a folha abre. */
  const [segurada, definirSegurada] = useState<{
    vez: number;
    id: string;
    elemento: HTMLElement;
  } | null>(null);
  const toqueLongo = useToqueLongo((elemento) => {
    const id = elemento.dataset.mensagem;
    if (!id) return;
    // A mensagem fica com o foco, que volta a ela quando a folha fecha.
    elemento.focus({ preventScroll: true });
    definirSegurada((antes) => ({ vez: (antes?.vez ?? 0) + 1, id, elemento }));
  });
  /**
   * A mensagem do menu do botão direito ou da tecla de menu, com o ponto onde ele abre; a vez muda
   * a cada abertura.
   */
  const [comMenu, definirComMenu] = useState<{
    vez: number;
    id: string;
    elemento: HTMLElement;
    posicao: Ponto;
  } | null>(null);
  /**
   * O tipo do último ponteiro que apertou e o texto selecionado antes dele: no macOS, o botão direito
   * seleciona a palavra antes de o menu abrir. O aperto se lê na captura da janela: com um menu
   * aberto, a conversa fica inerte, e o aperto cai no corpo da página, antes de o kit fechar o menu.
   */
  const apertou = useRef<{ tipo: string; trechos: Range[] }>({ tipo: '', trechos: [] });
  useEffect(() => {
    const aoApertar = (evento: PointerEvent) => {
      apertou.current = { tipo: evento.pointerType, trechos: trechosSelecionados() };
    };
    window.addEventListener('pointerdown', aoApertar, true);
    return () => window.removeEventListener('pointerdown', aoApertar, true);
  }, []);
  const abrirOMenu = (elemento: HTMLElement, posicao: Ponto) => {
    const id = elemento.dataset.mensagem;
    if (!id) return;
    // A mensagem fica com o foco, sem rolar a conversa, e o foco volta a ela quando o menu fecha.
    elemento.focus({ preventScroll: true });
    definirComMenu((antes) => ({ vez: (antes?.vez ?? 0) + 1, id, elemento, posicao }));
  };
  const ouvintesDoMenu = {
    ...toqueLongo,
    onContextMenu: (evento: MouseEvent<HTMLOListElement>) => {
      // O toque longo em curso abre a folha, no lugar do menu do navegador.
      toqueLongo.onContextMenu(evento);
      if (evento.defaultPrevented) return;
      // O menu do navegador que vem de um toque sem o toque longo, como o de segurar uma reação,
      // fica com o navegador: o tipo do ponteiro no próprio evento só vem no Chromium.
      if (apertou.current.tipo === 'touch') return;
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const elemento = alvo.closest<HTMLElement>('[data-escrita]');
      if (!elemento || !evento.currentTarget.contains(elemento)) return;
      // No link e no texto selecionado, o menu do navegador, para abrir e copiar.
      const ponto = { x: evento.clientX, y: evento.clientY };
      const link = alvo.closest('a');
      if (link && elemento.contains(link)) return;
      if (noTextoSelecionado(apertou.current.trechos, ponto)) return;
      evento.preventDefault();
      abrirOMenu(elemento, ponto);
    },
  };
  const daVez = escritas.some(({ id }) => id === comOFoco)
    ? comOFoco
    : (escritas.at(-1)?.id ?? null);
  const aVista = janelaAVista && visivel;
  useLeituraDaConversa(conversa, { ultima, lidaAte: dados?.lidaAte ?? null, aVista });
  // A notificação desta conversa não vira aviso enquanto ela está à vista.
  useDestinoAVista(`/chat/c/${conversa}`, aVista);

  const rolagem = useRef<HTMLElement>(null);
  const conteudo = useRef<HTMLOListElement>(null);
  /** Quem lê está no fim: a conversa desce com o que chega. */
  const noFim = useRef(true);
  const [noFimNaTela, definirNoFimNaTela] = useState(true);
  /** A última mensagem que quem lê viu no fim: as dos outros depois dela são as novas. */
  const [vistaAte, definirVistaAte] = useState<string | null>(null);
  const ultimaAgora = useRef(ultima);
  /** A abertura já foi posicionada, e as pontas já podem carregar ao aparecer. */
  const [pronta, definirPronta] = useState(false);
  /** A primeira mensagem antes das anteriores chegarem, onde ela estava na tela. */
  const ancora = useRef<{ id: string; topo: number } | null>(null);
  /** O ponto da rolagem quando a aba Conversa sai da tela, para voltar a ele. */
  const rolagemSalva = useRef(0);
  /** Onde a própria conversa pôs a rolagem, até o evento dela chegar. */
  const rolagemPropria = useRef<number | null>(null);
  const visivelAntes = useRef(visivel);

  useLayoutEffect(() => {
    ultimaAgora.current = ultima;
  }, [ultima]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda a cada mudança dos itens, como a mensagem que chega.
  useLayoutEffect(() => {
    const elemento = rolagem.current;
    const voltou = visivel && !visivelAntes.current;
    visivelAntes.current = visivel;
    if (!elemento || !dados || !visivel) return;
    if (!pronta) {
      rolarPara(elemento, pontoDaAbertura(elemento, alvo), rolagemPropria);
      noFim.current = estaNoFim(elemento);
      definirNoFimNaTela(noFim.current);
      definirVistaAte(ultima);
      definirPronta(true);
      return;
    }
    if (voltou && !noFim.current) {
      rolarPara(elemento, rolagemSalva.current, rolagemPropria);
      return;
    }
    const marca = ancora.current;
    ancora.current = null;
    const daMarca = marca && daMensagem(elemento, marca.id);
    if (marca && daMarca) {
      const deslocou = daMarca.getBoundingClientRect().top - marca.topo;
      rolarPara(elemento, elemento.scrollTop + deslocou, rolagemPropria);
      return;
    }
    if (noFim.current) {
      rolarPara(elemento, elemento.scrollHeight, rolagemPropria);
      definirNoFimNaTela(true);
      definirVistaAte(ultima);
    }
  }, [itens, visivel]);

  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    const medir = () => {
      // A aba escondida não tem altura: o que ela diria do fim não vale.
      if (elemento.clientHeight === 0) return;
      rolagemSalva.current = elemento.scrollTop;
      const propria = rolagemPropria.current;
      rolagemPropria.current = null;
      if (propria !== null && elemento.scrollTop === propria) return;
      const fim = estaNoFim(elemento);
      noFim.current = fim;
      definirNoFimNaTela(fim);
      if (fim) definirVistaAte(ultimaAgora.current);
    };
    const descer = () => {
      if (noFim.current && elemento.clientHeight > 0) {
        rolarPara(elemento, elemento.scrollHeight, rolagemPropria);
      }
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

  /**
   * A ida às mais novas que falhou deixa quem lê onde está: medido de novo, ele só fica no fim se
   * estiver lá, e a conversa não desce até o fim do trecho com a próxima mudança.
   */
  const medirOFim = () => {
    const elemento = rolagem.current;
    if (!elemento || elemento.clientHeight === 0) return;
    noFim.current = estaNoFim(elemento);
    definirNoFimNaTela(noFim.current);
  };

  const carregar = (carga: CargaDoTrecho) => {
    const elemento = rolagem.current;
    if (mais.isPending || !elemento) return;
    if (carga === 'anteriores' && primeira !== null) {
      const daPrimeira = daMensagem(elemento, primeira);
      ancora.current = daPrimeira
        ? { id: primeira, topo: daPrimeira.getBoundingClientRect().top }
        : null;
    }
    if (carga === 'mais-novas') noFim.current = true;
    mais.mutate(carga, {
      onError: () => {
        ancora.current = null;
        if (carga === 'mais-novas') medirOFim();
      },
    });
  };
  const carregarAgora = useRef(carregar);
  useLayoutEffect(() => {
    carregarAgora.current = carregar;
  });

  // As pontas carregam ao aparecer, depois da abertura. O observador novo, a cada mudança do
  // trecho, diz se a ponta ainda está à vista, para carregar a página seguinte; a falha espera o
  // "Tentar de novo".
  // biome-ignore lint/correctness/useExhaustiveDependencies: o observador novo, a cada mudança das pontas do trecho, diz de novo se elas estão à vista.
  useEffect(() => {
    const elemento = rolagem.current;
    if (!pronta || !visivel || !elemento || mais.isPending || mais.isError) return;
    if (typeof IntersectionObserver !== 'function') return;
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const lado = (entrada.target as HTMLElement).dataset.lado;
          if (entrada.isIntersecting && (lado === 'anteriores' || lado === 'seguintes')) {
            carregarAgora.current(lado);
          }
        }
      },
      { root: elemento, rootMargin: ANTES_DA_PONTA },
    );
    for (const ponta of elemento.querySelectorAll('[data-lado]')) observador.observe(ponta);
    return () => observador.disconnect();
  }, [pronta, visivel, primeira, ultima, mais.isPending, mais.isError]);

  const irAoFim = () => {
    const elemento = rolagem.current;
    if (!elemento) return;
    noFim.current = true;
    rolarPara(elemento, elemento.scrollHeight, rolagemPropria);
    definirNoFimNaTela(true);
    definirVistaAte(ultima);
    elemento.focus();
  };

  /**
   * A respondida que está no trecho: a conversa vai a ela, no meio da área, com o foco nela, sem
   * abrir a conversa de novo pelo link. Quem lê sai do fim, e o que chega não o leva de volta.
   */
  const irParaAMensagem = (id: string) => {
    const elemento = rolagem.current;
    const destino = elemento && daMensagem(elemento, id);
    if (!elemento || !destino?.matches('[data-escrita]')) return false;
    elemento.scrollTop =
      topoNaRolagem(elemento, destino) - (elemento.clientHeight - destino.offsetHeight) / 2;
    noFim.current = estaNoFim(elemento);
    definirNoFimNaTela(noFim.current);
    destino.focus({ preventScroll: true });
    marcarODestino(destino);
    return true;
  };

  // Ctrl+Shift+T abre o transformar na mensagem com o foco ou, sem o foco numa mensagem, na do
  // mouse. O diálogo e o menu abertos ficam com o atalho.
  const transformarPeloAtalho = useRef<(evento: globalThis.KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    transformarPeloAtalho.current = (evento) => {
      const transformar = acoes?.transformar;
      const { ctrlKey, shiftKey, altKey, metaKey, key } = evento;
      if (!transformar || !ctrlKey || !shiftKey || altKey || metaKey) return;
      if (key.toLowerCase() !== 't' || evento.defaultPrevented) return;
      const focado = document.activeElement;
      if (focado?.closest(COM_O_ATALHO)) return;
      const id =
        (rolagem.current?.contains(focado) ? escritaEmVolta(focado) : null) ?? comOPonteiro;
      const mensagem = escritas.find((escrita) => escrita.id === id);
      if (!mensagem || mensagem.chamado) return;
      evento.preventDefault();
      transformar(mensagem, nomeDoAutor(mensagem.autor, conta));
    };
  });
  useEffect(() => {
    if (!visivel) return;
    const ouvir = (evento: globalThis.KeyboardEvent) => transformarPeloAtalho.current(evento);
    window.addEventListener('keydown', ouvir);
    return () => window.removeEventListener('keydown', ouvir);
  }, [visivel]);

  // A presa no fim vale antes de a mandada entrar: a mudança dos itens desce a conversa até ela.
  useImperativeHandle(ref, () => ({
    irAoFimAoEnviar: (comAsMaisNovas) => {
      noFim.current = true;
      if (comAsMaisNovas) {
        mais.mutate('mais-novas', { onError: medirOFim });
        return;
      }
      const elemento = rolagem.current;
      if (!elemento) return;
      rolarPara(elemento, elemento.scrollHeight, rolagemPropria);
      definirNoFimNaTela(true);
    },
  }));

  const novas = dados && !dados.seguintes ? novasDesde(dados.itens, conta, vistaAte) : 0;
  const daFolha = segurada && escritas.find(({ id }) => id === segurada.id);
  const doMenu = comMenu && escritas.find(({ id }) => id === comMenu.id);
  const carregando = mais.isPending ? mais.variables : null;
  const falhou = mais.isError ? mais.variables : null;
  const naMensagem: NaMensagem = {
    daVez,
    barra: (mensagem, autor) =>
      acoes &&
      (mensagem.id === daVez || mensagem.id === comOPonteiro || mensagem.id === doMenu?.id) ? (
        <BarraDaMensagem
          mensagem={mensagem}
          autor={autor}
          conversa={conversa}
          acoes={acoes}
          presa={mensagem.id === doMenu?.id}
        />
      ) : null,
    irPara: irParaAMensagem,
    reagir: acoes?.reagir ?? null,
  };
  // A tecla de menu e o Shift+F10 na mensagem com o foco, ou num botão dela, abrem o menu dela junto
  // do "Mais": sem isso, o navegador mandaria o "contextmenu" ao botão, e o menu abriria no canto
  // dele. No link, o menu do navegador, para abrir e copiar.
  const aoTeclar = (evento: KeyboardEvent<HTMLOListElement>) => {
    const alvo = evento.target;
    const daMensagem =
      alvo instanceof HTMLElement ? alvo.closest<HTMLElement>('[data-escrita]') : null;
    if (
      acoes &&
      pedeOMenu(evento) &&
      daMensagem &&
      evento.currentTarget.contains(daMensagem) &&
      !(alvo as HTMLElement).closest('a')
    ) {
      evento.preventDefault();
      abrirOMenu(daMensagem, juntoDoMais(daMensagem, rolagem.current));
      return;
    }
    andarPelasMensagens(evento);
  };

  return (
    <div className={estilos.fluxo}>
      <section
        ref={rolagem}
        className={estilos.rolagem}
        aria-label="Mensagens"
        aria-busy={trecho.isPending || undefined}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a área que rola recebe o foco para rolar pelo teclado.
        tabIndex={0}
      >
        {trecho.isPending && (
          <p role="status" className={estilos.carregando}>
            Carregando as mensagens…
          </p>
        )}
        {trecho.isError &&
          !dados &&
          (alvo !== null && naoEncontrada(trecho.error) ? (
            <div role="alert" className={estilos.semAMensagem}>
              <p>{trecho.error.message}</p>
              <LinkDoChat para={`/chat/c/${conversa}`}>Abrir a conversa</LinkDoChat>
            </div>
          ) : (
            <FalhaDoChat
              mensagem={trecho.error.message}
              relendo={trecho.isFetching}
              tentarDeNovo={() => void trecho.refetch()}
            />
          ))}
        {dados?.anteriores && (
          <Ponta
            lado="anteriores"
            rotulo="Mensagens anteriores"
            carregando={carregando === 'anteriores'}
            falha={falhou === 'anteriores' ? (mais.error?.message ?? null) : null}
            carregar={() => carregar('anteriores')}
          />
        )}
        {dados && dados.itens.length === 0 && (
          <p className={estilos.carregando}>Nenhuma mensagem ainda.</p>
        )}
        <ol
          ref={conteudo}
          className={estilos.itens}
          data-toque-longo={acoes ? '' : undefined}
          {...(acoes ? ouvintesDoMenu : undefined)}
          // O toque não para em cima da mensagem: a barra fica para o mouse e a caneta.
          onPointerOver={(evento) => {
            if (evento.pointerType !== 'touch') {
              definirComOPonteiro(escritaEmVolta(evento.target));
            }
          }}
          onPointerLeave={() => definirComOPonteiro(null)}
          onFocus={(evento) => {
            const id = escritaEmVolta(evento.target);
            if (id) definirComOFoco(id);
          }}
          onKeyDown={aoTeclar}
        >
          {itens.map((item) => (
            <ItemDaConversa
              key={item.chave}
              item={item}
              conversa={conversa}
              conta={conta}
              alvo={alvo}
              dataHora={dataHora}
              naMensagem={naMensagem}
            />
          ))}
        </ol>
        {dados?.seguintes && (
          <Ponta
            lado="seguintes"
            rotulo="Mensagens seguintes"
            carregando={carregando === 'seguintes' || carregando === 'mais-novas'}
            falha={
              falhou === 'seguintes' || falhou === 'mais-novas'
                ? (mais.error?.message ?? null)
                : null
            }
            carregar={() => carregar('seguintes')}
          />
        )}
      </section>
      {!noFimNaTela &&
        (dados?.seguintes ? (
          <div className={estilos.aviso}>
            <Botao nivel="primario" icone={ArrowDown} onPress={() => carregar('mais-novas')}>
              Ir para as mais novas
            </Botao>
          </div>
        ) : (
          novas > 0 && (
            <div className={estilos.aviso}>
              <Botao nivel="primario" icone={ArrowDown} onPress={irAoFim}>
                {`Mensagens novas · ${novas}`}
              </Botao>
            </div>
          )
        ))}
      {acoes && segurada && daFolha && (
        <FolhaDaMensagem
          key={segurada.vez}
          mensagem={daFolha}
          autor={nomeDoAutor(daFolha.autor, conta)}
          conversa={conversa}
          acoes={acoes}
          elemento={segurada.elemento}
        />
      )}
      {acoes && comMenu && doMenu && (
        <MenuDaMensagem
          key={comMenu.vez}
          mensagem={doMenu}
          autor={nomeDoAutor(doMenu.autor, conta)}
          conversa={conversa}
          acoes={acoes}
          elemento={comMenu.elemento}
          posicao={comMenu.posicao}
          aoSair={() => definirComMenu((agora) => (agora?.vez === comMenu.vez ? null : agora))}
        />
      )}
    </div>
  );
}

/**
 * "Mensagens anteriores" no alto e "Mensagens seguintes" no pé do trecho: carregam ao aparecer e
 * pelo botão, e dizem o motivo da falha, com "Tentar de novo".
 */
function Ponta({
  lado,
  rotulo,
  carregando,
  falha,
  carregar,
}: {
  lado: 'anteriores' | 'seguintes';
  rotulo: string;
  carregando: boolean;
  falha: string | null;
  carregar: () => void;
}) {
  return (
    <div className={estilos.ponta} data-lado={lado}>
      {falha === null ? (
        <Botao
          nivel="terciario"
          carregando={carregando}
          rotuloCarregando="Carregando"
          onPress={carregar}
        >
          {rotulo}
        </Botao>
      ) : (
        <FalhaDoChat mensagem={falha} relendo={carregando} tentarDeNovo={carregar} />
      )}
    </div>
  );
}

/** O que cada mensagem escrita recebe do fluxo. */
interface NaMensagem {
  /** A mensagem da vez do teclado, a única na ordem do Tab. */
  daVez: string | null;
  /** A barra da mensagem, quando ela tem uma: com o mouse, ou na da vez do teclado. */
  barra: (mensagem: MensagemDoChat, autor: string) => ReactNode;
  /** Leva à mensagem do trecho; sem ela no trecho, devolve falso, e o link abre a conversa nela. */
  irPara: (id: string) => boolean;
  /** A reação pela cápsula dela; nulo na conversa arquivada. */
  reagir: Reagir | null;
}

function ItemDaConversa({
  item,
  conversa,
  conta,
  alvo,
  dataHora,
  naMensagem,
}: {
  item: ItemNaTela;
  conversa: string;
  conta: string;
  alvo: string | null;
  dataHora: DataHora;
  naMensagem: NaMensagem;
}) {
  switch (item.tipo) {
    case 'dia':
      return (
        <li className={estilos.dia}>
          <h3>{item.rotulo}</h3>
        </li>
      );
    case 'novas':
      return (
        <li className={estilos.novas} data-novas="">
          Mensagens novas
        </li>
      );
    case 'evento':
      return <EventoNaConversa mensagem={item.mensagem} conversa={conversa} dataHora={dataHora} />;
    case 'mensagem':
      return (
        <MensagemNaConversa
          mensagem={item.mensagem}
          seguida={item.seguida}
          doLink={item.mensagem.id === alvo}
          conversa={conversa}
          conta={conta}
          dataHora={dataHora}
          naMensagem={naMensagem}
        />
      );
  }
}

/** O texto da mensagem, com o chip no lugar de cada chamado citado de que a conta vê o resumo. */
function TextoDaMensagem({
  texto,
  citacoes,
}: {
  texto: string;
  citacoes: readonly CitacaoNaMensagem[];
}) {
  let ate = 0;
  return partesDoTexto(texto, citacoes).map((parte) => {
    const onde = ate;
    ate += parte.texto.length;
    return parte.tipo === 'texto' ? (
      <Fragment key={onde}>{parte.texto}</Fragment>
    ) : (
      <ChipDoChamado key={onde} chamado={parte.citacao} />
    );
  });
}

/** O endereço da mensagem na conversa, que abre a conversa nela. */
const daConversaEm = (conversa: string, mensagem: string) => `/chat/c/${conversa}?m=${mensagem}`;

/** O clique simples, sem Ctrl, Shift, Alt nem outro botão, que o navegador deixaria abrir o link. */
const cliqueSimples = (evento: MouseEvent) =>
  evento.button === 0 && !evento.ctrlKey && !evento.metaKey && !evento.shiftKey && !evento.altKey;

/**
 * Uma mensagem: a foto, o nome e a hora, a respondida, o texto, os anexos, o chamado em que ela
 * virou e as reações, que se dão e se tiram pela cápsula. A seguida da mesma pessoa vai sem a foto e
 * o nome, com a hora ao lado, que aparece no mouse e no foco. A do link vai marcada, com o nome. O
 * mouse e o foco mostram a barra dela.
 */
function MensagemNaConversa({
  mensagem,
  seguida,
  doLink,
  conversa,
  conta,
  dataHora,
  naMensagem,
}: {
  mensagem: MensagemDoChat;
  seguida: boolean;
  doLink: boolean;
  conversa: string;
  conta: string;
  dataHora: DataHora;
  naMensagem: NaMensagem;
}) {
  const hora = dataHora.formatarHora(new Date(mensagem.criadaEm));
  const nome = nomeDoAutor(mensagem.autor, conta);
  const junta = seguida && !doLink;
  const { respondida } = mensagem;
  const { reagir } = naMensagem;
  return (
    <li
      className={estilos.mensagem}
      data-mensagem={mensagem.id}
      data-escrita=""
      // A mensagem recebe o foco, que mostra a barra dela, e as setas andam pelas mensagens.
      tabIndex={mensagem.id === naMensagem.daVez ? 0 : -1}
      data-seguida={junta || undefined}
      data-do-link={doLink || undefined}
      data-virada={mensagem.chamado ? '' : undefined}
      aria-current={doLink || undefined}
    >
      {junta ? (
        <time className={estilos.horaAoLado} dateTime={mensagem.criadaEm}>
          {hora}
        </time>
      ) : (
        <Avatar
          nome={mensagem.autor.nome}
          imagens={miniaturasNoChat(mensagem.autor.conta, mensagem.autor.foto)}
          className={estilos.foto}
          decorativo
        />
      )}
      <div className={estilos.corpo}>
        {junta ? (
          <span className={estilos.paraOLeitor}>{nome}</span>
        ) : (
          <p className={estilos.quem}>
            <span className={estilos.nome}>{nome}</span>
            <time dateTime={mensagem.criadaEm}>{hora}</time>
            {doLink && <span className={estilos.doLink}>Mensagem do link</span>}
          </p>
        )}
        {respondida && (
          <LinkDoChat
            className={estilos.respondida}
            para={daConversaEm(conversa, respondida.id)}
            onClick={(evento) => {
              if (cliqueSimples(evento) && naMensagem.irPara(respondida.id)) {
                evento.preventDefault();
              }
            }}
          >
            <Icone icone={CornerUpLeft} tamanho={14} />
            <span className={estilos.paraOLeitor}>Respondendo a</span>
            <span className={estilos.autorDaRespondida}>{respondida.autor}</span>
            <span className={estilos.comecoDaRespondida}>{respondida.comeco}</span>
          </LinkDoChat>
        )}
        {mensagem.texto && (
          <p className={estilos.texto}>
            <TextoDaMensagem texto={mensagem.texto} citacoes={mensagem.citacoes} />
          </p>
        )}
        {mensagem.anexos.length > 0 && (
          <ul className={estilos.anexos} aria-label="Anexos">
            {mensagem.anexos.map((anexo) => (
              <li key={anexo.id}>
                <a
                  className={estilos.anexo}
                  href={`/api/chat/conversas/${conversa}/anexos/${anexo.id}`}
                  download={anexo.nome}
                >
                  <span className={estilos.miniDoAnexo}>
                    <Icone
                      icone={anexo.tipo.startsWith('image/') ? Image : FileText}
                      tamanho={20}
                    />
                  </span>
                  <span>
                    <span className={estilos.nomeDoAnexo}>{anexo.nome}</span>
                    <small>{formatarTamanho(anexo.bytes)}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {mensagem.chamado && (
          <p className={estilos.virou}>
            <span className={estilos.iconeDoChamado}>
              <Icone icone={LifeBuoy} tamanho={14} />
            </span>
            <span>
              Virou o chamado <span className={estilos.numero}>#{mensagem.chamado.numero}</span>
            </span>
            {mensagem.chamado.abrir && (
              <LinkDoChat para={`/chat/chamados/${mensagem.chamado.numero}`}>
                Abrir chamado
              </LinkDoChat>
            )}
          </p>
        )}
        {mensagem.reacoes.length > 0 && (
          <ul className={estilos.reacoes} aria-label="Reações">
            {mensagem.reacoes.map((reacao) => {
              const quem = LISTA.format(
                reacao.contas.map((de) => (de.conta === conta ? 'você' : de.nome)),
              );
              const texto = (
                <>
                  <span aria-hidden="true">{`${reacao.texto} · ${reacao.contas.length}`}</span>
                  <span className={estilos.paraOLeitor}>{`${reacao.texto}: ${quem}`}</span>
                </>
              );
              return (
                <li key={reacao.texto}>
                  {reagir ? (
                    <button
                      type="button"
                      className={estilos.reacao}
                      aria-pressed={reacao.minha}
                      title={quem}
                      onClick={() => reagirAvisando(reagir, mensagem, reacao.texto)}
                    >
                      {texto}
                    </button>
                  ) : (
                    <span
                      className={estilos.reacao}
                      data-minha={reacao.minha || undefined}
                      title={quem}
                    >
                      {texto}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {naMensagem.barra(mensagem, nome)}
    </li>
  );
}

/**
 * O evento numa linha, no quadro azul do chamado (m03): "Fernanda Rocha transformou esta mensagem no
 * chamado #1045 · 10:32", que leva à mensagem de origem, com "Abrir chamado" a quem pode abri-lo.
 * Quem transformou é dito pelo nome, também à conta que agiu, como na spec e no m03.
 */
function EventoNaConversa({
  mensagem,
  conversa,
  dataHora,
}: {
  mensagem: MensagemDoChat;
  conversa: string;
  dataHora: DataHora;
}) {
  if (mensagem.evento !== 'virou-chamado' || !mensagem.chamado) return null;
  const { numero, abrir, mensagem: origem } = mensagem.chamado;
  return (
    <li className={estilos.evento} data-mensagem={mensagem.id}>
      <span className={estilos.iconeDoEvento}>
        <Icone icone={LifeBuoy} tamanho={22} />
      </span>
      <p>
        <strong>{nomeNoChat(mensagem.autor.nome, mensagem.autor.daTi)}</strong> transformou{' '}
        {origem ? (
          <LinkDoChat para={daConversaEm(conversa, origem)}>esta mensagem</LinkDoChat>
        ) : (
          'esta mensagem'
        )}{' '}
        no chamado <span className={estilos.numero}>#{numero}</span>
        <span className={estilos.horaDoEvento}>
          {' · '}
          <time dateTime={mensagem.criadaEm}>
            {dataHora.formatarHora(new Date(mensagem.criadaEm))}
          </time>
        </span>
      </p>
      {abrir && (
        <LinkDoChat className={estilos.abrirChamado} para={`/chat/chamados/${numero}`}>
          Abrir chamado
        </LinkDoChat>
      )}
    </li>
  );
}
