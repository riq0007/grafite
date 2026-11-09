// Item de rede da barra (design do F1b, decisão 10): a perda de rede do navegador aparece na hora,
// e a falta de resposta do servidor em até 1 minuto, pela conferência do /api/health. Ela continua
// com a conexão de eventos (design do F2c, decisão 12): sem sessão não há conexão, e duas fontes
// para o mesmo item poderiam discordar.

export type EstadoDaRede = 'verificando' | 'conectado' | 'sem-conexao';

/** Intervalo entre as conferências, com a página visível. */
const INTERVALO = 50_000;
/** Quanto a conferência espera a resposta: com o intervalo, o pior caso fica em 1 minuto. */
const LIMITE = 10_000;

export interface OpcoesDaVigia {
  aoMudar: (estado: EstadoDaRede) => void;
  /** O fetch do navegador; os testes passam um simulado. */
  buscar?: (endereco: string, opcoes: RequestInit) => Promise<Response>;
}

/**
 * Começa a vigiar a rede e o servidor, e avisa cada mudança de estado, a começar pela inicial.
 * Devolve a função que para a vigia.
 */
export function vigiarARede({ aoMudar, buscar = fetch }: OpcoesDaVigia): () => void {
  let estado: EstadoDaRede | undefined;
  let proxima: ReturnType<typeof setTimeout> | undefined;
  /** A conferência em curso; uma resposta que não é dela chega tarde e não decide nada. */
  let emCurso: AbortController | undefined;

  const definir = (novo: EstadoDaRede) => {
    if (novo === estado) return;
    estado = novo;
    aoMudar(novo);
  };

  const cancelar = () => {
    clearTimeout(proxima);
    proxima = undefined;
    emCurso?.abort();
    emCurso = undefined;
  };

  async function conferir() {
    cancelar();
    const controle = new AbortController();
    emCurso = controle;
    const desistir = setTimeout(() => controle.abort(), LIMITE);
    let alcancou = false;
    try {
      const resposta = await buscar('/api/health', { signal: controle.signal, cache: 'no-store' });
      alcancou = resposta.ok;
    } catch {
      alcancou = false;
    } finally {
      clearTimeout(desistir);
    }
    if (emCurso !== controle) return;
    emCurso = undefined;
    definir(alcancou && navigator.onLine ? 'conectado' : 'sem-conexao');
    if (document.visibilityState === 'visible') proxima = setTimeout(conferir, INTERVALO);
  }

  const aoPerderARede = () => {
    cancelar();
    definir('sem-conexao');
  };

  const aoVoltarARede = () => {
    void conferir();
  };

  // Oculta, a página não confere; ao reaparecer, confere na hora e retoma o ciclo.
  const aoMudarAVisibilidade = () => {
    if (document.visibilityState === 'visible') {
      if (navigator.onLine && !emCurso) void conferir();
    } else {
      clearTimeout(proxima);
      proxima = undefined;
    }
  };

  window.addEventListener('offline', aoPerderARede);
  window.addEventListener('online', aoVoltarARede);
  document.addEventListener('visibilitychange', aoMudarAVisibilidade);

  if (navigator.onLine) {
    definir('verificando');
    void conferir();
  } else {
    definir('sem-conexao');
  }

  return () => {
    window.removeEventListener('offline', aoPerderARede);
    window.removeEventListener('online', aoVoltarARede);
    document.removeEventListener('visibilitychange', aoMudarAVisibilidade);
    cancelar();
  };
}
