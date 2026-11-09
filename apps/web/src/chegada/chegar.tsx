// A chegada do app (F1c, design, decisões 1 a 3): desenha o app por baixo do carregamento, passa
// pelas etapas reais e, no fim, mostra a primeira tela e tira a camada. No primeiro acesso a este
// navegador, as boas-vindas vêm antes, e a casca se monta depois delas. Sem sessão (F2a, design,
// decisão 13), a tela de entrada vem antes da casca.
import { atualizarCarregamento, BoasVindas, esperarMontagem } from '@grafite/ui';
import { type ReactNode, useSyncExternalStore } from 'react';
import { type AvisosDaChegada, ProvedorDaChegada, type TelaDaChegada } from './avisos.tsx';
import {
  CARREGANDO_O_GRAFITE,
  carregar,
  type EtapaDaChegada,
  marcarChegada,
  type SituacaoDoCarregamento,
} from './etapas.ts';

/** A marca das boas-vindas vistas neste navegador. */
const CHAVE_DAS_BOAS_VINDAS = 'grafite.chegada.boasVindas';

/** Uma espera que termina quando alguém avisa; avisar de novo não muda nada. */
function espera<T = void>() {
  let terminar: (valor: T) => void = () => {};
  const promessa = new Promise<T>((resolver) => {
    terminar = resolver;
  });
  return { promessa, terminar };
}

const proximoQuadro = () => new Promise((resolver) => requestAnimationFrame(resolver));

/**
 * Primeiro acesso a este navegador? A marca é gravada aqui, quando as boas-vindas vão aparecer, e
 * não quando terminam: um fechamento no meio não as repete. Sem armazenamento, elas não aparecem,
 * para não se repetirem a cada recarga.
 */
function primeiroAcesso(): boolean {
  try {
    if (localStorage.getItem(CHAVE_DAS_BOAS_VINDAS) !== null) return false;
    localStorage.setItem(CHAVE_DAS_BOAS_VINDAS, 'vistas');
    return true;
  } catch {
    return false;
  }
}

/** Se as boas-vindas estão à vista: a chegada muda, e a camada abaixo acompanha. */
function criarBoasVindasAVista() {
  let aVista = false;
  const ouvintes = new Set<() => void>();
  return {
    ler: () => aVista,
    mudar: (novo: boolean) => {
      aVista = novo;
      for (const ouvinte of ouvintes) ouvinte();
    },
    assinar: (ouvinte: () => void) => {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}

function CamadaDasBoasVindas({
  estado,
  aoTerminar,
}: {
  estado: ReturnType<typeof criarBoasVindasAVista>;
  aoTerminar: () => void;
}) {
  const aVista = useSyncExternalStore(estado.assinar, estado.ler);
  return aVista ? <BoasVindas aoTerminar={aoTerminar} /> : null;
}

/** Tira a camada do carregamento: na hora, se ela não apareceu, ou depois da troca de opacidade. */
function tirarCarregamento(
  camada: HTMLElement | null,
  apareceu: boolean,
  ultima: SituacaoDoCarregamento | undefined,
): Promise<void> {
  if (!camada) return Promise.resolve();
  if (!apareceu || !ultima) {
    camada.remove();
    return Promise.resolve();
  }
  return new Promise((resolver) => {
    camada.addEventListener(
      'transitionend',
      () => {
        camada.remove();
        resolver();
      },
      { once: true },
    );
    atualizarCarregamento(camada, { ...ultima, visivel: false });
  });
}

export interface OpcoesDaChegada {
  /** O app, que a chegada envolve com os avisos das esperas. */
  app: ReactNode;
  /** Desenha o app na raiz. */
  desenhar: (elemento: ReactNode) => void;
  /** A camada do carregamento, que o index.html traz. */
  camada: HTMLElement | null;
  /** As etapas de outras partes do app, como "Validando sessão" no F2, antes de "Pronto". */
  etapas?: readonly EtapaDaChegada[];
  /** O início da chegada no relógio de `agora`: a navegação, no relógio da página. */
  inicio?: number;
  agora?: () => number;
  /** Cada mudança do carregamento, além da camada. */
  aoMudar?: (situacao: SituacaoDoCarregamento) => void;
}

/**
 * As etapas do F1c: "Carregando o Grafite" termina aqui, com o módulo principal executando;
 * "Carregando suas preferências", quando elas estão lidas e aplicadas; e "Pronto", com a primeira
 * tela (a casca ou a entrada) desenhada e as fontes carregadas, para ela não aparecer com a fonte
 * trocando. Começando pela entrada, a chegada fica nela até a casca se desenhar.
 */
export async function chegar({
  app,
  desenhar,
  camada,
  etapas = [],
  inicio = 0,
  agora = () => performance.now(),
  aoMudar,
}: OpcoesDaChegada): Promise<void> {
  const preferencias = espera();
  const primeiraTela = espera<TelaDaChegada>();
  const casca = espera();
  const fimDasBoasVindas = espera();
  const boasVindas = criarBoasVindasAVista();
  const avisos: AvisosDaChegada = {
    preferenciasAplicadas: preferencias.terminar,
    telaDesenhada: (tela) => {
      primeiraTela.terminar(tela);
      if (tela === 'casca') casca.terminar();
    },
  };
  let ultima: SituacaoDoCarregamento | undefined;
  const mudar = (situacao: SituacaoDoCarregamento) => {
    ultima = situacao;
    if (camada) atualizarCarregamento(camada, situacao);
    aoMudar?.(situacao);
  };
  const carregamento = carregar(
    [
      { rotulo: CARREGANDO_O_GRAFITE, pronta: () => Promise.resolve() },
      { rotulo: 'Carregando suas preferências', pronta: () => preferencias.promessa },
      ...etapas,
    ],
    {
      pronto: async () => {
        await primeiraTela.promessa;
        await document.fonts?.ready;
      },
      inicio,
      agora,
      aoMudar: mudar,
    },
  );
  desenhar(
    <ProvedorDaChegada avisos={avisos}>
      {app}
      <CamadaDasBoasVindas estado={boasVindas} aoTerminar={fimDasBoasVindas.terminar} />
    </ProvedorDaChegada>,
  );
  const { apareceu } = await carregamento;
  const entrada = (await primeiraTela.promessa) === 'entrada';
  if (!primeiroAcesso()) {
    // A primeira tela aparece já no lugar, enquanto o carregamento sai por cima dela.
    marcarChegada(entrada ? 'entrada' : 'pronta');
    void tirarCarregamento(camada, apareceu, ultima);
    if (!entrada) return;
    // Depois da entrada, a casca se desenha transparente e aparece por troca de opacidade.
    await casca.promessa;
    await proximoQuadro();
    marcarChegada('pronta');
    return;
  }
  // As boas-vindas entram depois de o carregamento sair: os dois têm o mesmo fundo.
  marcarChegada('boas-vindas');
  await tirarCarregamento(camada, apareceu, ultima);
  boasVindas.mudar(true);
  await fimDasBoasVindas.promessa;
  boasVindas.mudar(false);
  if (entrada) {
    marcarChegada('entrada');
    await casca.promessa;
  }
  marcarChegada('montando');
  await esperarMontagem();
  marcarChegada('pronta');
}
