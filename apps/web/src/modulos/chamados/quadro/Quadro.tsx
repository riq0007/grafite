// Quem está com o quê (spec modulo-chamados, "Quem está com o quê"; spec chamados, "Carga de cada
// pessoa" e "Ações do atendimento"; change chamados-da-ti, design, decisão 22, mockup m01): a
// triagem, uma coluna por pessoa da TI e a de quem não atende mais, com os quadrados pelo
// vencimento. O quadro dá as colunas, os números e as versões; a lista dos prazos completa cada
// quadrado. Os dois pedidos andam cada um no seu tempo, e o número que a lista ainda não trouxe fica
// só com o número. A falha de uma releitura vai acima das colunas, que ficam com a última leitura;
// sem as colunas, a falha fica no lugar delas. Cada quadrado com os detalhes tem a prévia, com o
// ponteiro parado ou com o foco do teclado, e o menu, com as ações que o chamado aceita. Com o
// mouse, quem atende arrasta o quadrado para passar o chamado (m02).
import type { HorarioDaTi } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  Icone,
  type ItemDoMenuDeContexto,
  MenuDeContexto,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { Ban, CircleAlert, CornerDownRight, HandGrab, Info } from 'lucide-react';
import {
  createContext,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { useArvoreDosLocais } from '../../administracao/seletores/SeletorDeLocal.tsx';
import { type ChamadoDepoisDaAcao, useAcoesDoAtendimento } from '../acoes.ts';
import {
  type ChamadoNosPrazos,
  type ColunaDoQuadro,
  type QuadroDosChamados,
  usePrazosDosChamados,
  useQuadroDosChamados,
} from '../consultas.ts';
import {
  BandejaDaTriagem,
  IconeDoTipo,
  PrazoEmTexto,
  SiglaDaPessoa,
  TextoComMedidas,
} from '../Pecas.tsx';
import { type ContarOPrazo, contadorDoPrazo } from '../prazo.ts';
import { useArrastar } from '../useArrastar.ts';
import {
  ALVO_DA_TRIAGEM,
  avisoDaOrigem,
  type ChamadoArrastado,
  chamadoArrastado,
  chaveDoAlvo,
  type NaColuna,
  naColuna,
} from './arraste.ts';
import { type AcoesDaPrevia, PreviaDoChamado } from './PreviaDoChamado.tsx';
import {
  acoesDoChamado,
  type Caixa,
  type ControleDaPrevia,
  controleDaPrevia,
  foraDaArea,
  type PessoaParaPassar,
  pessoasParaPassar,
} from './previa.ts';
import estilos from './Quadro.module.css';
import {
  abertosNoQuadro,
  chaveDaColuna,
  listaPorNumero,
  type Quadrado,
  quadradosDaColuna,
  textoDaCarga,
  textoDaTriagem,
  textoDoMaisAntigo,
  textoDosAbertos,
  textoDosResolvidosHoje,
} from './quadro.ts';

const TITULO = 'Quem está com o quê';

export function Quadro() {
  const quadro = useQuadroDosChamados();
  const prazos = usePrazosDosChamados();
  // Um relógio só: a idade do mais antigo e o prazo de cada quadrado viram no mesmo minuto.
  const agora = useAgora();
  const { fuso } = useDataHora();
  const contar = useMemo(() => contadorDoPrazo(agora, fuso), [agora, fuso]);
  const arrasta = useAcesso().pode('chamados.atender');
  // O chamado no ar, que a dica do alto diz e que pede o cursor de segurar na tela inteira.
  const [noAr, definirNoAr] = useState<ChamadoNoAr | null>(null);

  const falha = quadro.isError ? quadro.error : prazos.isError ? prazos.error : null;
  const relendo = quadro.isFetching || prazos.isFetching;
  const tentarDeNovo = (
    <Botao
      carregando={relendo}
      rotuloCarregando="Tentando de novo"
      onPress={() => {
        if (quadro.isError) void quadro.refetch();
        if (prazos.isError) void prazos.refetch();
      }}
    >
      Tentar de novo
    </Botao>
  );
  // As colunas só com os dois pedidos na mão; o selo dos abertos entra com elas.
  const naTela = quadro.data && prazos.data ? { quadro: quadro.data, prazos: prazos.data } : null;

  let conteudo: ReactNode;
  if (naTela) {
    // A falha de uma releitura vai acima das colunas, que ficam com a última leitura.
    conteudo = (
      <>
        {falha && (
          <div role="alert" className={estilos.falhaAoReler}>
            <Icone icone={CircleAlert} tamanho={14} />
            <p>{`${falha.message} As colunas mostram a última leitura.`}</p>
            {tentarDeNovo}
          </div>
        )}
        <Colunas
          quadro={naTela.quadro}
          chamados={naTela.prazos.chamados}
          horario={naTela.prazos.horario}
          agora={agora}
          contar={contar}
          relendo={relendo}
          aoArrastar={definirNoAr}
        />
      </>
    );
  } else if (falha) {
    conteudo = <EstadoVazio className={estilos.falha} titulo={falha.message} acao={tentarDeNovo} />;
  } else {
    conteudo = (
      <p role="status" className={estilos.carregando}>
        Carregando os chamados…
      </p>
    );
  }

  return (
    <div
      className={estilos.tela}
      data-janela-inteira=""
      // No arraste, o cursor do sistema, de segurar, em vez do suavizado.
      data-arrastando={noAr ? '' : undefined}
      data-cursor-nativo={noAr ? '' : undefined}
    >
      <CabecalhoDaPagina
        titulo={TITULO}
        selos={
          naTela && (
            <RotuloDeSituacao situacao="neutra" semIcone>
              {textoDosAbertos(abertosNoQuadro(naTela.quadro))}
            </RotuloDeSituacao>
          )
        }
        apoio={naTela && <Dica noAr={noAr} arrasta={arrasta} />}
      />
      {conteudo}
    </div>
  );
}

/** A coluna de cada número do quadro, pela chave do alvo do arraste. */
function colunaDeCadaNumero(quadro: QuadroDosChamados): Map<number, string> {
  const colunas = new Map<number, string>();
  for (const numero of quadro.triagem.abertos) colunas.set(numero, ALVO_DA_TRIAGEM);
  for (const coluna of quadro.colunas) {
    for (const numero of coluna.abertos) colunas.set(numero, chaveDaColuna(coluna));
  }
  return colunas;
}

/** O chamado no ar, na dica do alto. */
interface ChamadoNoAr {
  numero: number;
  titulo: string;
}

/**
 * A dica do alto, com a mão (m01): o que o mouse faz nos quadrados e, no arraste, o chamado no ar
 * (m02). Quem só vê os chamados não arrasta. Sem o mouse, ela some, pelo CSS.
 */
function Dica({ noAr, arrasta }: { noAr: ChamadoNoAr | null; arrasta: boolean }) {
  return (
    <p className={estilos.dica}>
      <Icone icone={HandGrab} tamanho={14} />
      {/* Os espaços entre as partes ficam para o leitor de tela; o vão é o do CSS. */}
      {noAr ? (
        <>
          <b className={estilos.forteDaDica}>Arrastando</b>{' '}
          <span className={estilos.numeroDaDica}>{`#${noAr.numero}`}</span>{' '}
          <span className={estilos.textoDaDica}>{noAr.titulo}</span>
        </>
      ) : (
        <span className={estilos.textoDaDica}>
          {arrasta
            ? 'Arraste um quadrado para passar adiante. Passe o mouse para ler.'
            : 'Passe o mouse para ler.'}
        </span>
      )}
    </p>
  );
}

interface DaTela {
  agora: Date;
  /** Um dos dois pedidos é relido: o quadrado sem os detalhes diz "Carregando…". */
  relendo: boolean;
}

/** O que cada quadrado faz com o ponteiro, o foco e as teclas, e o que a prévia dele mostra. */
interface InteracaoDoQuadro {
  /** O número da prévia aberta. */
  aberta: number | null;
  /** O relógio da prévia, o mesmo enquanto as colunas estão na tela. */
  controle: ControleDaPrevia;
  agora: Date;
  aoMover: (numero: number, evento: PointerEvent<HTMLElement>) => void;
  aoEntrar: (numero: number, evento: PointerEvent<HTMLElement>) => void;
  aoSair: (numero: number, evento: PointerEvent<HTMLElement>) => void;
  aoFocar: (numero: number, evento: FocusEvent<HTMLElement>) => void;
  aoDesfocar: (numero: number, evento: FocusEvent<HTMLElement>) => void;
  aoTeclar: (numero: number, evento: KeyboardEvent<HTMLElement>, quadrado: HTMLElement) => void;
  aoPedirMenu: (numero: number, evento: MouseEvent<HTMLElement>, quadrado: HTMLElement) => void;
  acoesDaPrevia: (numero: number) => AcoesDaPrevia | null;
  medir: (quadrado: HTMLElement | null) => { quadrado: Caixa; area: Caixa } | null;
  /** O que o quadrado faz no aperto do mouse, para o arraste; nada, a quem só vê os chamados. */
  alcaDoQuadrado: (numero: number) => AlcaDoQuadrado | undefined;
  /** O número do quadrado no ar, que deixa o lugar tracejado. */
  noAr: number | null;
  /** Os números que mudaram de coluna, ou chegaram ao quadro, desde a leitura anterior. */
  entrando: ReadonlySet<number>;
}

interface AlcaDoQuadrado {
  onPointerDown: (evento: PointerEvent<HTMLElement>) => void;
  onDragStart: (evento: DragEvent<HTMLElement>) => void;
}

/** O que a coluna mostra no arraste: a área de soltar, o motivo de não receber, ou o aviso na origem. */
type NoArraste =
  | { tipo: 'solta'; frase: string }
  | { tipo: 'recusa'; motivo: string }
  | { tipo: 'origem'; aviso: string };

const InteracaoDoQuadroContexto = createContext<InteracaoDoQuadro | null>(null);

/** A última interação: o aperto do ponteiro ou a tecla, como o React Aria faz no anel do foco. */
type Interacao = 'ponteiro' | 'teclado' | null;

/** A tecla que conta como uso do teclado: as de modificação, sozinhas ou com outra, não contam. */
const daNavegacao = (evento: globalThis.KeyboardEvent) =>
  !(evento.metaKey || evento.ctrlKey || evento.altKey) &&
  !['Control', 'Shift', 'Meta', 'Alt'].includes(evento.key);

/**
 * A área das colunas, sem o respiro, recortada pela janela: a prévia encosta na borda direita dela
 * e não passa do fim dela.
 */
function areaDasColunas(colunas: HTMLElement): Caixa {
  const caixa = colunas.getBoundingClientRect();
  const estilo = getComputedStyle(colunas);
  const dentro = (valor: string) => Number.parseFloat(valor) || 0;
  const left = caixa.left + colunas.clientLeft;
  const top = caixa.top + colunas.clientTop;
  return {
    left: Math.max(0, left + dentro(estilo.paddingLeft)),
    right: Math.min(window.innerWidth, left + colunas.clientWidth - dentro(estilo.paddingRight)),
    top: Math.max(0, top + dentro(estilo.paddingTop)),
    bottom: Math.min(window.innerHeight, top + colunas.clientHeight - dentro(estilo.paddingBottom)),
  };
}

function Colunas({
  quadro,
  chamados,
  horario,
  agora,
  contar,
  relendo,
  aoArrastar,
}: DaTela & {
  quadro: QuadroDosChamados;
  chamados: ChamadoNosPrazos[];
  horario: HorarioDaTi;
  contar: ContarOPrazo;
  /** O chamado que vai ao ar, ou nenhum, quando o arraste acaba. */
  aoArrastar: (noAr: ChamadoNoAr | null) => void;
}) {
  const lista = useMemo(() => listaPorNumero({ chamados }), [chamados]);
  const quadradosDe = (numeros: number[]) => quadradosDaColuna(numeros, { lista, horario, contar });
  const triagem = quadradosDe(quadro.triagem.abertos);
  const dasColunas = quadro.colunas.map((coluna) => ({
    coluna,
    quadrados: quadradosDe(coluna.abertos),
  }));
  // Cada número com o quadrado e a coluna em que está; na triagem, sem coluna.
  const porNumero = new Map<number, { quadrado: Quadrado; coluna: ColunaDoQuadro | null }>();
  for (const quadrado of triagem) porNumero.set(quadrado.numero, { quadrado, coluna: null });
  for (const { coluna, quadrados } of dasColunas) {
    for (const quadrado of quadrados) porNumero.set(quadrado.numero, { quadrado, coluna });
  }
  // O quadrado que entra numa coluna, depois da primeira leitura, entra em 200 ms; os outros ficam.
  const ondeEsta = useMemo(() => colunaDeCadaNumero(quadro), [quadro]);
  const ondeEstava = useRef<Map<number, string> | null>(null);
  const entrando = useMemo(() => {
    const antes = ondeEstava.current;
    const numeros = new Set<number>();
    if (!antes) return numeros;
    for (const [numero, chave] of ondeEsta) {
      if (antes.get(numero) !== chave) numeros.add(numero);
    }
    return numeros;
  }, [ondeEsta]);
  useEffect(() => {
    ondeEstava.current = ondeEsta;
  }, [ondeEsta]);

  const sessao = useSessao();
  const conta = sessao.tipo === 'ativa' ? sessao.conta.id : null;
  const podeAtender = useAcesso().pode('chamados.atender');
  const acoes = useAcoesDoAtendimento();
  // Os ramos de quem atende só uns locais, para a coluna que não recebe e o "Passar para…".
  const arvore = useArvoreDosLocais(podeAtender);
  const colunaPorChave = new Map(quadro.colunas.map((coluna) => [chaveDaColuna(coluna), coluna]));

  const area = useRef<HTMLDivElement>(null);
  const [aberta, definirAberta] = useState<number | null>(null);
  const abertaAgora = useRef<number | null>(null);
  const [controle] = useState(() =>
    controleDaPrevia({
      aoAbrir: (numero) => {
        abertaAgora.current = numero;
        definirAberta(numero);
      },
      aoFechar: () => {
        abertaAgora.current = null;
        definirAberta(null);
      },
    }),
  );
  const [menu, definirMenu] = useState<{
    numero: number;
    posicao: { x: number; y: number };
    origem: HTMLElement;
  } | null>(null);
  // O botão que espera a resposta da ação; enquanto ela não volta, o foco não abre a prévia dele.
  const [esperando, definirEsperando] = useState<{ numero: number; botao: string } | null>(null);
  const esperandoAgora = useRef<{ numero: number; botao: string } | null>(null);

  // A prévia do número que saiu do quadro (resolvido, ou de um local que a conta não vê mais) fecha,
  // aberta pelo ponteiro ou pelo foco: senão, ela voltaria com ele.
  useLayoutEffect(() => {
    if (aberta !== null && !porNumero.has(aberta)) controle.fechar();
  });

  // O foco que o código põe sem abrir a prévia: o que volta ao quadrado depois de Esc ou da ação.
  const ignorarOFoco = useRef(false);
  const focarSemPrevia = (elemento: HTMLElement, opcoes?: FocusOptions) => {
    ignorarOFoco.current = true;
    try {
      elemento.focus(opcoes);
    } finally {
      ignorarOFoco.current = false;
    }
  };

  // O aperto do ponteiro e a tecla, de qualquer parte: o foco que vem do aperto não abre a prévia,
  // e o foco posto pelo código segue a última interação, ou o teclado, sem nenhuma.
  const interacao = useRef<Interacao>(null);
  // O foco que volta ao quadrado quando o menu fecha não abre a prévia, como o que volta com Esc. Se
  // ele não voltar, a próxima tecla ou o próximo aperto o esquecem.
  const voltaDoMenu = useRef<{ numero: number; origem: HTMLElement } | null>(null);
  useEffect(() => {
    const doPonteiro = () => {
      interacao.current = 'ponteiro';
      voltaDoMenu.current = null;
    };
    const doTeclado = (evento: globalThis.KeyboardEvent) => {
      if (daNavegacao(evento)) interacao.current = 'teclado';
      voltaDoMenu.current = null;
    };
    document.addEventListener('pointerdown', doPonteiro, true);
    document.addEventListener('keydown', doTeclado, true);
    return () => {
      document.removeEventListener('pointerdown', doPonteiro, true);
      document.removeEventListener('keydown', doTeclado, true);
    };
  }, []);

  // A rolagem, de qualquer parte fora da prévia, e a mudança do tamanho da janela fecham a aberta
  // pelo ponteiro. A aberta pelo foco acompanha o quadrado até a rolagem o tirar inteiro da área: aí
  // ela fecha, e o foco que estava nela vai ao quadrado, sem rolar as colunas de volta.
  useEffect(() => {
    const aoRolar = (evento: Event) => {
      if (evento.target instanceof Element && evento.target.closest('[data-previa]')) return;
      controle.rolou();
      const numero = abertaAgora.current;
      const colunas = area.current;
      const quadrado =
        numero === null
          ? null
          : colunas?.querySelector<HTMLElement>(`li[data-numero="${numero}"] > article`);
      if (!colunas || !quadrado) return;
      if (!foraDaArea(quadrado.getBoundingClientRect(), areaDasColunas(colunas))) return;
      const ativo = document.activeElement;
      if (quadrado.parentElement?.contains(ativo) && ativo !== quadrado) {
        ignorarOFoco.current = true;
        try {
          quadrado.focus({ preventScroll: true });
        } finally {
          ignorarOFoco.current = false;
        }
      }
      controle.fechar();
    };
    const aoRedimensionar = () => controle.rolou();
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', aoRedimensionar);
    return () => {
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', aoRedimensionar);
      controle.parar();
    };
  }, [controle]);

  // O quadrado que muda de coluna é outro elemento, e o foco se perde com ele: depois da releitura,
  // esse foco vai ao quadrado do mesmo número, com a prévia como estava, aberta ou fechada. O foco
  // que a pessoa tira de um elemento que continua na tela fica onde ela o pôs.
  const emFoco = useRef<{ numero: number; elemento: Element } | null>(null);
  useLayoutEffect(() => {
    const colunas = area.current;
    if (!colunas) return;
    const ativo = document.activeElement;
    const semFoco = !ativo || ativo === document.body;
    const quadradoComFoco = (numero: number) =>
      colunas.querySelector<HTMLElement>(`li[data-numero="${numero}"] > article[tabindex]`);
    // A releitura que chega antes de o foco voltar do menu: o quadrado que o menu ia focar saiu.
    const doMenu = voltaDoMenu.current;
    if (doMenu && !doMenu.origem.isConnected && semFoco) {
      voltaDoMenu.current = null;
      const novo = quadradoComFoco(doMenu.numero);
      if (novo) focarSemPrevia(novo);
      return;
    }
    const foco = emFoco.current;
    if (!foco) return;
    if (foco.elemento.isConnected) {
      if (!ativo || !colunas.contains(ativo)) emFoco.current = null;
      return;
    }
    emFoco.current = null;
    if (!semFoco) return;
    const novo = quadradoComFoco(foco.numero);
    if (!novo) return;
    if (aberta === foco.numero) novo.focus();
    else focarSemPrevia(novo);
  });

  const quadradoDo = (numero: number) =>
    area.current?.querySelector<HTMLElement>(`li[data-numero="${numero}"] > article`) ?? null;

  /**
   * A ação, com a versão das colunas: a lista, que pode estar fora de passo, só completa o
   * quadrado. Com a resposta, a prévia aberta pelo ponteiro fecha, e o foco que estava nela volta ao
   * quadrado; a aberta pelo foco fica e acompanha o quadrado, relida.
   */
  const agir = async (
    numero: number,
    botao: string,
    fazer: (versao: number) => Promise<ChamadoDepoisDaAcao | null>,
  ) => {
    const versao = quadro.versoes[numero] ?? porNumero.get(numero)?.quadrado.chamado?.versao;
    if (versao === undefined || esperandoAgora.current) return;
    esperandoAgora.current = { numero, botao };
    definirEsperando(esperandoAgora.current);
    try {
      await fazer(versao);
    } finally {
      esperandoAgora.current = null;
      definirEsperando(null);
    }
    if (!controle.abertaPeloPonteiro(numero)) return;
    const quadrado = quadradoDo(numero);
    const ativo = document.activeElement;
    if (quadrado?.parentElement?.contains(ativo) && ativo !== quadrado) focarSemPrevia(quadrado);
    controle.fechar();
  };
  const assumir = (numero: number) =>
    void agir(numero, 'assumir', (versao) => acoes.assumir(numero, versao));
  const passar = (numero: number, pessoa: PessoaParaPassar) =>
    void agir(numero, pessoa.conta, (versao) => acoes.passar(numero, versao, pessoa.conta));
  const devolver = (numero: number) =>
    void agir(numero, 'devolver', (versao) => acoes.devolver(numero, versao));

  /** As ações que o chamado aceita, pela coluna em que o quadrado está. */
  const acoesDe = (numero: number) => {
    const doNumero = porNumero.get(numero);
    const chamado = doNumero?.quadrado.chamado;
    if (!podeAtender || !doNumero || !chamado) return null;
    const { coluna } = doNumero;
    const quais = acoesDoChamado(
      { situacao: chamado.situacao, responsavel: coluna && { conta: coluna.conta } },
      conta,
    );
    const noAr = chamadoArrastado(chamado, coluna);
    return {
      ...quais,
      pessoas: quais.passar ? pessoasParaPassar(quadro.colunas, noAr, arvore) : [],
    };
  };

  // O arraste: quem recebe sai da mesma regra do "Passar para…", e soltar passa ou devolve.
  const naChave = (chamado: ChamadoArrastado, chave: string): NaColuna => {
    if (chave === ALVO_DA_TRIAGEM) return naColuna(chamado, null, arvore);
    const coluna = colunaPorChave.get(chave);
    return coluna ? naColuna(chamado, coluna, arvore) : { recebe: false, motivo: null };
  };
  const {
    arraste,
    alca,
    alvo: alvoDoArraste,
  } = useArrastar<ChamadoArrastado>({
    recebe: (chamado, chave) => naChave(chamado, chave).recebe,
    aoSoltar: (chamado, { chave }) => {
      if (chave === ALVO_DA_TRIAGEM) {
        devolver(chamado.numero);
        return;
      }
      const coluna = colunaPorChave.get(chave);
      if (!coluna) return;
      passar(chamado.numero, {
        conta: coluna.conta,
        nome: coluna.nome,
        abertos: coluna.abertos.length,
      });
    },
  });
  // O aperto do mouse num quadrado: a caixa e o quadrado de quando ele vai ao ar.
  const apertado = useRef<{ caixa: DOMRect; quadrado: Quadrado } | null>(null);
  const numeroNoAr = arraste?.item.numero ?? null;
  // No começo do arraste, a prévia fecha, e a dica do alto diz o chamado no ar.
  useLayoutEffect(() => {
    if (numeroNoAr === null) {
      aoArrastar(null);
      return;
    }
    controle.fechar();
    aoArrastar({ numero: numeroNoAr, titulo: apertado.current?.quadrado.chamado?.titulo ?? '' });
  }, [numeroNoAr, controle, aoArrastar]);
  useEffect(() => () => aoArrastar(null), [aoArrastar]);

  /** O que a coluna mostra no arraste em curso. */
  const noArrasteDa = (coluna: ColunaDoQuadro | null): NoArraste | null => {
    if (!arraste) return null;
    const chave = chaveDoAlvo(coluna);
    const nela = naChave(arraste.item, chave);
    if (nela.recebe)
      return arraste.alvo?.chave === chave ? { tipo: 'solta', frase: nela.frase } : null;
    if (nela.motivo !== null) return { tipo: 'recusa', motivo: nela.motivo };
    if (chave !== arraste.item.origem) return null;
    const situacao =
      porNumero.get(arraste.item.numero)?.quadrado.situacao ??
      apertado.current?.quadrado.situacao ??
      null;
    return { tipo: 'origem', aviso: avisoDaOrigem(arraste.item.numero, situacao) };
  };

  const itensDoMenu = (numero: number): ItemDoMenuDeContexto[] => {
    const quais = acoesDe(numero);
    if (!quais) return [];
    const itens: ItemDoMenuDeContexto[] = [];
    if (quais.assumir)
      itens.push({ id: 'assumir', rotulo: 'Assumir', aoEscolher: () => assumir(numero) });
    if (quais.pessoas.length > 0) {
      itens.push({
        id: 'passar',
        rotulo: 'Passar para…',
        itens: quais.pessoas.map((pessoa) => ({
          id: pessoa.conta,
          rotulo: pessoa.nome,
          descricao: textoDosAbertos(pessoa.abertos),
          aoEscolher: () => passar(numero, pessoa),
        })),
      });
    }
    if (quais.devolver) {
      itens.push({
        id: 'devolver',
        rotulo: 'Devolver à triagem',
        aoEscolher: () => devolver(numero),
      });
    }
    return itens;
  };

  const abrirMenu = (numero: number, posicao: { x: number; y: number }, origem: HTMLElement) => {
    controle.fechar();
    definirMenu({ numero, posicao, origem });
  };

  const doQuadro: InteracaoDoQuadro = {
    aberta,
    controle,
    agora,
    entrando,
    aoMover(numero, evento) {
      // Só o mouse, sem botão apertado, e com o menu fechado.
      if (evento.pointerType !== 'mouse' || evento.buttons !== 0 || menu) return;
      controle.moverSobre(numero);
    },
    aoEntrar(numero, evento) {
      if (evento.pointerType === 'mouse') controle.ficar(numero);
    },
    aoSair(numero, evento) {
      if (evento.pointerType === 'mouse') controle.sair(numero);
    },
    aoFocar(numero, evento) {
      emFoco.current = { numero, elemento: evento.target };
      const doMenu = voltaDoMenu.current;
      voltaDoMenu.current = null;
      if (doMenu?.numero === numero || ignorarOFoco.current || interacao.current === 'ponteiro') {
        return;
      }
      if (esperandoAgora.current?.numero === numero) return;
      controle.focar(numero);
    },
    aoDesfocar(numero, evento) {
      const para = evento.relatedTarget;
      if (para instanceof Node && evento.currentTarget.contains(para)) return;
      controle.focoSaiu(numero);
    },
    aoTeclar(numero, evento, quadrado) {
      if (evento.key === 'Escape' && abertaAgora.current === numero) {
        evento.preventDefault();
        evento.stopPropagation();
        controle.fechar();
        if (document.activeElement !== quadrado) focarSemPrevia(quadrado);
        return;
      }
      // O menu só abre com alguma ação: sem nenhuma, a tecla segue para o navegador.
      const pedeMenu = evento.key === 'ContextMenu' || (evento.shiftKey && evento.key === 'F10');
      if (!pedeMenu || evento.target !== quadrado || itensDoMenu(numero).length === 0) return;
      evento.preventDefault();
      evento.stopPropagation();
      const caixa = quadrado.getBoundingClientRect();
      abrirMenu(numero, { x: caixa.left + 16, y: caixa.bottom }, quadrado);
    },
    aoPedirMenu(numero, evento, quadrado) {
      // Sem nenhuma ação, o clique direito fica com o menu do navegador.
      if (itensDoMenu(numero).length === 0) return;
      evento.preventDefault();
      focarSemPrevia(quadrado);
      abrirMenu(numero, { x: evento.clientX, y: evento.clientY }, quadrado);
    },
    acoesDaPrevia(numero) {
      const quais = acoesDe(numero);
      if (!quais) return null;
      return {
        assumir: quais.assumir,
        pessoas: quais.pessoas,
        esperando: esperando?.numero === numero ? esperando.botao : null,
        aoAssumir: () => assumir(numero),
        aoPassar: (pessoa) => passar(numero, pessoa),
      };
    },
    medir(quadrado) {
      const colunas = area.current;
      if (!quadrado || !colunas) return null;
      return { quadrado: quadrado.getBoundingClientRect(), area: areaDasColunas(colunas) };
    },
    alcaDoQuadrado(numero) {
      const doNumero = porNumero.get(numero);
      const chamado = doNumero?.quadrado.chamado;
      if (!podeAtender || !doNumero || !chamado) return undefined;
      const { onPointerDown, onDragStart } = alca(chamadoArrastado(chamado, doNumero.coluna));
      return {
        onPointerDown(evento) {
          // Só o mouse: no toque e na caneta, as colunas rolam por cima dos quadrados.
          if (evento.pointerType !== 'mouse' || evento.button !== 0) return;
          apertado.current = {
            caixa: evento.currentTarget.getBoundingClientRect(),
            quadrado: doNumero.quadrado,
          };
          onPointerDown(evento);
        },
        onDragStart,
      };
    },
    noAr: numeroNoAr,
  };

  // O quadrado no ar segue o ponteiro, a partir do lugar dele no aperto.
  const voo = arraste && apertado.current;

  return (
    <InteracaoDoQuadroContexto.Provider value={doQuadro}>
      {quadro.contandoSoOsLocaisQueVe && (
        <p className={estilos.aviso}>
          <Icone icone={Info} tamanho={14} />
          Contando só os chamados dos locais que você vê.
        </p>
      )}
      <div ref={area} className={estilos.colunas}>
        <ColunaDaTriagem
          triagem={quadro.triagem}
          quadrados={triagem}
          agora={agora}
          relendo={relendo}
          alvo={alvoDoArraste(ALVO_DA_TRIAGEM)}
          noArraste={noArrasteDa(null)}
        />
        {dasColunas.map(({ coluna, quadrados }) => (
          <ColunaDaPessoa
            key={chaveDaColuna(coluna)}
            coluna={coluna}
            quadrados={quadrados}
            agora={agora}
            relendo={relendo}
            alvo={alvoDoArraste(chaveDaColuna(coluna))}
            noArraste={noArrasteDa(coluna)}
          />
        ))}
      </div>
      {voo && (
        <div
          aria-hidden="true"
          className={`${estilos.quadrado} ${estilos.voando}`}
          style={{
            left: voo.caixa.left + arraste.dx,
            top: voo.caixa.top + arraste.dy,
            width: voo.caixa.width,
            height: voo.caixa.height,
          }}
        >
          <ConteudoDoQuadrado quadrado={voo.quadrado} relendo={relendo} />
        </div>
      )}
      <MenuDeContexto
        rotulo={menu ? `Ações do #${menu.numero}` : 'Ações do chamado'}
        posicao={menu?.posicao ?? null}
        itens={menu ? itensDoMenu(menu.numero) : []}
        aoFechar={() => {
          voltaDoMenu.current = menu && { numero: menu.numero, origem: menu.origem };
          definirMenu(null);
        }}
        origem={menu?.origem}
      />
    </InteracaoDoQuadroContexto.Provider>
  );
}

/**
 * "3 na triagem · mais antigo #1038, há 6 h": um embaixo do outro, como no mockup, com o "·" só para
 * o leitor de tela.
 */
function Contagem({
  abertos,
  maisAntigo,
  agora,
}: {
  abertos: string;
  maisAntigo: { numero: number; abertoEm: string } | null;
  agora: Date;
}) {
  return (
    <p className={estilos.contagem} data-parte="contagem">
      <span className={estilos.linha}>{abertos}</span>
      {maisAntigo && (
        <>
          <span className={estilos.oculto}> · </span>
          <span className={estilos.linha}>
            <TextoComMedidas texto={textoDoMaisAntigo(maisAntigo, agora)} />
          </span>
        </>
      )}
    </p>
  );
}

/** A coluna como alvo do arraste, e o que ela mostra nele. */
interface NoArrasteDaColuna {
  alvo: { 'data-alvo-de': string; 'data-alvo': string };
  noArraste: NoArraste | null;
}

/** A área de soltar, no alto da coluna que recebe, ou o motivo de não receber. */
function NoAltoDaColuna({ noArraste }: { noArraste: NoArraste | null }) {
  if (noArraste?.tipo === 'solta') {
    return (
      <p className={estilos.solta}>
        <Icone icone={CornerDownRight} tamanho={16} />
        {noArraste.frase}
      </p>
    );
  }
  if (noArraste?.tipo === 'recusa') {
    return (
      <p className={estilos.recusa}>
        <Icone icone={Ban} tamanho={14} />
        {noArraste.motivo}
      </p>
    );
  }
  return null;
}

/** O aviso no lugar de origem, embaixo dos quadrados da coluna. */
function AvisoDaOrigem({ noArraste }: { noArraste: NoArraste | null }) {
  if (noArraste?.tipo !== 'origem') return null;
  return <p className={estilos.avisoDaOrigem}>{noArraste.aviso}</p>;
}

function ColunaDaTriagem({
  triagem,
  quadrados,
  agora,
  relendo,
  alvo,
  noArraste,
}: DaTela & NoArrasteDaColuna & { triagem: QuadroDosChamados['triagem']; quadrados: Quadrado[] }) {
  const id = useId();
  return (
    <section
      className={estilos.coluna}
      data-coluna="triagem"
      data-triagem=""
      aria-labelledby={id}
      {...alvo}
      data-alvo-ativo={noArraste?.tipo === 'solta' || undefined}
    >
      <header className={estilos.cabecalho}>
        <BandejaDaTriagem />
        <div className={estilos.quem}>
          <h2 id={id} className={estilos.nome}>
            Sem responsável
          </h2>
          <Contagem
            abertos={textoDaTriagem(triagem.abertos.length)}
            maisAntigo={triagem.maisAntigo}
            agora={agora}
          />
        </div>
      </header>
      <NoAltoDaColuna noArraste={noArraste} />
      <Quadrados quadrados={quadrados} coluna={null} relendo={relendo} />
      <AvisoDaOrigem noArraste={noArraste} />
    </section>
  );
}

function ColunaDaPessoa({
  coluna,
  quadrados,
  agora,
  relendo,
  alvo,
  noArraste,
}: DaTela & NoArrasteDaColuna & { coluna: ColunaDoQuadro; quadrados: Quadrado[] }) {
  const id = useId();
  const carga = textoDaCarga(coluna.abertos.length, coluna.pedacos.total);
  // Na coluna que recebe, o pedaço seguinte da barra fica tracejado.
  const novo = noArraste?.tipo === 'solta' ? coluna.pedacos.cheios : null;
  return (
    <section
      className={estilos.coluna}
      data-coluna={chaveDaColuna(coluna)}
      aria-labelledby={id}
      {...alvo}
      data-alvo-ativo={novo !== null || undefined}
    >
      <header className={estilos.cabecalho}>
        <SiglaDaPessoa conta={coluna.conta} nome={coluna.nome} />
        <div className={estilos.quem}>
          <h2 id={id} className={estilos.nome}>
            {coluna.nome}
            {coluna.naoAtendeMais && (
              <>
                <span className={estilos.oculto}> · </span>
                <span className={estilos.naoAtendeMais}>não atende mais os chamados</span>
              </>
            )}
          </h2>
          <Contagem
            abertos={textoDosAbertos(coluna.abertos.length)}
            maisAntigo={coluna.maisAntigo}
            agora={agora}
          />
        </div>
        <span className={estilos.carga} role="img" aria-label={carga} title={carga}>
          {Array.from({ length: coluna.pedacos.total }, (_, indice) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a posição é o lugar do pedaço na barra.
              key={indice}
              data-cheio={indice < coluna.pedacos.cheios ? '' : undefined}
              data-novo={indice === novo ? '' : undefined}
            />
          ))}
        </span>
      </header>
      <NoAltoDaColuna noArraste={noArraste} />
      <Quadrados quadrados={quadrados} coluna={coluna} relendo={relendo} />
      <AvisoDaOrigem noArraste={noArraste} />
      <p className={estilos.pe}>{textoDosResolvidosHoje(coluna.resolvidosHoje)}</p>
    </section>
  );
}

function Quadrados({
  quadrados,
  coluna,
  relendo,
}: {
  quadrados: Quadrado[];
  /** A coluna dos quadrados; nula, na triagem. */
  coluna: ColunaDoQuadro | null;
  relendo: boolean;
}) {
  if (quadrados.length === 0) return null;
  return (
    <ul className={estilos.quadrados}>
      {quadrados.map((quadrado) => (
        <ItemDoQuadrado
          key={quadrado.numero}
          quadrado={quadrado}
          coluna={coluna}
          relendo={relendo}
        />
      ))}
    </ul>
  );
}

/**
 * O quadrado e, logo depois dele, a prévia aberta. O quadrado sem os detalhes da lista fica sem o
 * foco, sem a prévia e sem o menu: o que eles mostram e o que mandam vêm dela.
 */
function ItemDoQuadrado({
  quadrado: { numero, chamado, situacao },
  coluna,
  relendo,
}: {
  quadrado: Quadrado;
  coluna: ColunaDoQuadro | null;
  relendo: boolean;
}) {
  const interacao = useContext(InteracaoDoQuadroContexto);
  const elemento = useRef<HTMLElement>(null);
  const idDoPrazo = useId();
  // O quadrado que muda de coluna é outro elemento, e este sai da tela, como o que sai do quadro:
  // a prévia aberta pelo ponteiro não vai com ele, porque ele saiu de baixo do ponteiro. Antes de a
  // tela aparecer, para ela não piscar na coluna nova.
  const controle = interacao?.controle;
  useLayoutEffect(() => () => controle?.quadradoSaiu(numero), [controle, numero]);
  if (!interacao) throw new Error('O quadrado fica dentro das colunas.');
  const aberta = chamado !== null && interacao.aberta === numero;
  const alca = chamado ? interacao.alcaDoQuadrado(numero) : undefined;
  return (
    <li
      data-numero={numero}
      className={estilos.item}
      {...(chamado && {
        onPointerEnter: (evento: PointerEvent<HTMLElement>) => interacao.aoEntrar(numero, evento),
        onPointerLeave: (evento: PointerEvent<HTMLElement>) => interacao.aoSair(numero, evento),
        onFocus: (evento: FocusEvent<HTMLElement>) => interacao.aoFocar(numero, evento),
        onBlur: (evento: FocusEvent<HTMLElement>) => interacao.aoDesfocar(numero, evento),
        onKeyDown: (evento: KeyboardEvent<HTMLElement>) => {
          if (elemento.current) interacao.aoTeclar(numero, evento, elemento.current);
        },
      })}
    >
      <article
        ref={elemento}
        className={estilos.quadrado}
        aria-label={chamado ? `#${numero} ${chamado.titulo}` : `#${numero}`}
        aria-describedby={chamado ? idDoPrazo : undefined}
        tabIndex={chamado ? 0 : undefined}
        data-aberto={aberta || undefined}
        data-arrastavel={alca ? '' : undefined}
        data-no-ar={interacao.noAr === numero || undefined}
        data-entrando={interacao.entrando.has(numero) || undefined}
        {...(chamado && {
          onPointerMove: (evento: PointerEvent<HTMLElement>) => interacao.aoMover(numero, evento),
          onContextMenu: (evento: MouseEvent<HTMLElement>) => {
            if (elemento.current) interacao.aoPedirMenu(numero, evento, elemento.current);
          },
        })}
        {...alca}
      >
        <ConteudoDoQuadrado
          quadrado={{ numero, chamado, situacao }}
          idDoPrazo={idDoPrazo}
          relendo={relendo}
        />
      </article>
      {aberta && (
        <PreviaDoChamado
          numero={numero}
          chamado={chamado}
          situacao={situacao}
          atende={coluna && { nome: coluna.nome, naoAtendeMais: coluna.naoAtendeMais }}
          acoes={interacao.acoesDaPrevia(numero)}
          agora={interacao.agora}
          medir={() => interacao.medir(elemento.current)}
        />
      )}
    </li>
  );
}

/**
 * O que o quadrado mostra: o tipo, o número, o título numa linha e o prazo, ou que os detalhes da
 * lista faltam. É o mesmo no quadrado no ar.
 */
function ConteudoDoQuadrado({
  quadrado: { numero, chamado, situacao },
  idDoPrazo,
  relendo,
}: {
  quadrado: Quadrado;
  idDoPrazo?: string;
  relendo: boolean;
}) {
  return (
    <>
      <span className={estilos.alto}>
        {chamado && <IconeDoTipo icone={chamado.tipo.icone} nome={chamado.tipo.nome} />}
        <span className={estilos.numero}>{`#${numero}`}</span>
      </span>
      {chamado ? (
        <>
          <span className={estilos.titulo}>{chamado.titulo}</span>
          <PrazoEmTexto id={idDoPrazo} situacao={situacao} forma="curta" />
        </>
      ) : (
        <span className={estilos.semDetalhes}>
          {relendo ? 'Carregando…' : 'Detalhes não carregados'}
        </span>
      )}
    </>
  );
}
