// As abas da janela na casca do app (change cadastro-em-abas, design, decisões 2, 3, 7 e 8): o
// estado das abas, os pedidos dos campos, cada um com a promessa dele, o que já foi preenchido em
// cada aba e a confirmação ao fechar uma aba preenchida. As mudanças do estado são as funções puras
// de abasDaJanela.ts.
import { useRouter } from '@tanstack/react-router';
import {
  type ComponentType,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ABA_DA_TELA,
  abrirCadastro,
  concluirAba,
  type EstadoDasAbas,
  estadoInicialDasAbas,
  irParaATela,
  trazerParaFrente,
} from './abasDaJanela.ts';

/** O registro que um cadastro criou, que volta ao campo que o pediu. */
export interface RegistroCriado {
  id: string;
  nome: string;
}

/** O que o corpo de um cadastro recebe numa aba. */
export interface PropsDoCadastroNaAba {
  /** Os valores com que o formulário abre, como o tipo do ativo no Novo modelo. */
  inicial?: Readonly<Record<string, string>>;
  /** O cadastro foi salvo: a aba fecha, e o registro vai ao campo que o pediu. */
  aoConcluir: (registro: RegistroCriado) => void;
  /** O Cancelar do formulário, que fecha a aba como o botão de fechar dela. */
  aoCancelar: () => void;
  /** Se algo já foi preenchido: fechar a aba, então, pede confirmação. */
  aoMudarPreenchido: (preenchido: boolean) => void;
}

/** O pedido de um campo: o cadastro que ele abre numa aba. */
export interface PedidoDoCampo {
  /** O que o cadastro cria, como `local`. */
  alvo: string;
  /** O título da aba, como "Novo local". */
  titulo: string;
  /** O campo que pede, único na aba dele: o mesmo campo não abre duas abas. */
  campo: string;
  componente: ComponentType<PropsDoCadastroNaAba>;
  inicial?: Readonly<Record<string, string>>;
  /**
   * Chamado quando a aba do cadastro fecha, antes de o registro chegar ao campo: leva o foco de
   * volta a ele, ou devolve `true` quando o próprio campo cuida do foco depois de receber o
   * registro. Sem foco no campo, ele vai ao título da aba da frente.
   */
  aoVoltar?: () => unknown;
}

interface Pedido {
  promessa: Promise<RegistroCriado | null>;
  resolver: (registro: RegistroCriado | null) => void;
  componente: ComponentType<PropsDoCadastroNaAba>;
  aoVoltar?: () => unknown;
}

export interface AbasDoApp {
  estado: EstadoDasAbas;
  /**
   * Abre o cadastro numa aba nova, na frente, ou traz para a frente a que o mesmo campo já abriu.
   * Resolve com o registro criado, ou com `null` quando a aba fecha sem salvar.
   */
  pedir: (origem: string, pedido: PedidoDoCampo) => Promise<RegistroCriado | null>;
  escolher: (id: string) => void;
  /** O fechar da aba e o Cancelar do formulário: com algo preenchido, pedem confirmação. */
  fechar: (id: string) => void;
  concluir: (id: string, registro: RegistroCriado) => void;
  marcarPreenchida: (id: string, preenchida: boolean) => void;
  /** A primeira aba vai para a frente, como quando a pessoa navega pelo dock. */
  irParaATela: () => void;
  componenteDe: (id: string) => ComponentType<PropsDoCadastroNaAba> | undefined;
  /** A aba preenchida que pediu para fechar, à espera da confirmação. */
  aConfirmar: string | null;
  confirmarFechar: () => void;
  desistirDeFechar: () => void;
}

/** Leva o foco ao título do conteúdo de uma aba. */
function focarOTituloDa(id: string) {
  document
    .querySelector<HTMLElement>(`[data-aba-da-janela="${CSS.escape(id)}"] [data-titulo-da-janela]`)
    ?.focus();
}

/** O estado das abas da casca, com as ações; o provedor o entrega às telas e aos campos. */
export function useAbasDoApp(): AbasDoApp {
  const [estado, definirEstado] = useState(estadoInicialDasAbas);
  // O estado mais recente, lido pelas ações entre um desenho e outro.
  const atual = useRef(estado);
  const pedidos = useRef(new Map<string, Pedido>());
  const preenchidas = useRef(new Set<string>());
  const [aConfirmar, definirAConfirmar] = useState<string | null>(null);
  // O foco que espera o desenho: só depois dele a aba da frente está à vista e deixa de ser inerte.
  const focoPendente = useRef<(() => void) | null>(null);
  const [desenho, definirDesenho] = useState(0);

  const mudar = useCallback((novo: EstadoDasAbas, foco?: () => void) => {
    atual.current = novo;
    definirEstado(novo);
    if (foco) {
      focoPendente.current = foco;
      definirDesenho((vez) => vez + 1);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda a cada desenho pedido com foco.
  useLayoutEffect(() => {
    const focar = focoPendente.current;
    focoPendente.current = null;
    focar?.();
  }, [desenho]);

  const pedir = useCallback(
    (origem: string, pedido: PedidoDoCampo) => {
      const aberto = abrirCadastro(atual.current, {
        alvo: pedido.alvo,
        titulo: pedido.titulo,
        origem,
        chave: `${origem}/${pedido.campo}`,
        ...(pedido.inicial ? { inicial: pedido.inicial } : {}),
      });
      let registro = aberto.nova ? undefined : pedidos.current.get(aberto.id);
      if (registro) registro.aoVoltar = pedido.aoVoltar;
      else {
        let resolver: Pedido['resolver'] = () => {};
        const promessa = new Promise<RegistroCriado | null>((resolve) => {
          resolver = resolve;
        });
        registro = { promessa, resolver, componente: pedido.componente, aoVoltar: pedido.aoVoltar };
        pedidos.current.set(aberto.id, registro);
      }
      mudar(aberto.estado, () => focarOTituloDa(aberto.id));
      return registro.promessa;
    },
    [mudar],
  );

  /**
   * Fecha a aba e entrega ao campo o registro criado, ou `null`. Sem a aba que pediu aberta, nada
   * é entregue. O foco volta ao campo, ou, sem ele à vista, ao título da aba da frente.
   */
  const sair = useCallback(
    (id: string, registro: RegistroCriado | null) => {
      const pedido = pedidos.current.get(id);
      pedidos.current.delete(id);
      preenchidas.current.delete(id);
      const { estado: novo, origem } = concluirAba(atual.current, id);
      mudar(novo, () => {
        const cuida = origem !== undefined && pedido?.aoVoltar?.() === true;
        const frente = document.querySelector(
          `[data-aba-da-janela="${CSS.escape(atual.current.frente)}"]`,
        );
        if (!cuida && !frente?.contains(document.activeElement)) {
          focarOTituloDa(atual.current.frente);
        }
        // O registro vai ao campo depois de a aba fechar, com ele já à vista.
        pedido?.resolver(origem === undefined ? null : registro);
      });
    },
    [mudar],
  );

  const fechar = useCallback(
    (id: string) => {
      if (preenchidas.current.has(id)) definirAConfirmar(id);
      else sair(id, null);
    },
    [sair],
  );

  const confirmarFechar = useCallback(() => {
    definirAConfirmar(null);
    if (aConfirmar) sair(aConfirmar, null);
  }, [aConfirmar, sair]);

  const irParaAPrimeira = useCallback(() => mudar(irParaATela(atual.current)), [mudar]);

  // Toda navegação do roteador é da primeira aba: os corpos de cadastro não navegam. A que troca
  // de tela, como a de uma notificação, traz a primeira aba para a frente.
  const roteador = useRouter();
  useEffect(
    () =>
      roteador.subscribe('onBeforeNavigate', ({ pathChanged }) => {
        if (pathChanged) irParaAPrimeira();
      }),
    [roteador, irParaAPrimeira],
  );

  return useMemo(
    () => ({
      estado,
      pedir,
      escolher: (id: string) => mudar(trazerParaFrente(atual.current, id)),
      fechar,
      concluir: (id: string, registro: RegistroCriado) => sair(id, registro),
      marcarPreenchida: (id: string, preenchida: boolean) => {
        if (preenchida) preenchidas.current.add(id);
        else preenchidas.current.delete(id);
      },
      irParaATela: irParaAPrimeira,
      componenteDe: (id: string) => pedidos.current.get(id)?.componente,
      aConfirmar,
      confirmarFechar,
      desistirDeFechar: () => definirAConfirmar(null),
    }),
    [estado, pedir, mudar, fechar, sair, irParaAPrimeira, aConfirmar, confirmarFechar],
  );
}

export const ContextoDasAbas = createContext<AbasDoApp | null>(null);

/** A aba em que o conteúdo está: a origem dos pedidos dos campos dele. */
export const ContextoDaAba = createContext<string>(ABA_DA_TELA);

/**
 * O que um campo usa para abrir um cadastro numa aba. Fora da casca, como num teste de uma tela
 * sozinha, não há abas: o pedido resolve com `null`, sem abrir nada.
 */
export function useAbasDaJanela() {
  const abas = useContext(ContextoDasAbas);
  const origem = useContext(ContextoDaAba);
  const pedir = useCallback(
    (pedido: PedidoDoCampo) => (abas ? abas.pedir(origem, pedido) : Promise.resolve(null)),
    [abas, origem],
  );
  return { pedir, disponivel: abas !== null };
}
