// A versão nova da PWA (spec pwa; design do F1c, decisão 6): o service worker é registrado ao
// abrir e confere a versão a cada hora. Quando há uma nova, o aviso persistente "Nova versão do
// Grafite" oferece "Atualizar"; nada recarrega sozinho, e o aviso não entra na central.
import { avisar, type FilaDeAvisos, filaDeAvisos, tempos } from '@grafite/ui';

/** As opções do registerSW do virtual:pwa-register que o app usa. */
export interface OpcoesDoRegistro {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onRegisteredSW?: (url: string, registro: ServiceWorkerRegistration | undefined) => void;
}

/** O registerSW: registra e devolve a troca de versão, que recarrega a página se pedido. */
export type RegistrarServiceWorker = (
  opcoes?: OpcoesDoRegistro,
) => (recarregar?: boolean) => Promise<void>;

export function registrarServiceWorker({
  registrar,
  fila = filaDeAvisos,
}: {
  registrar: RegistrarServiceWorker;
  fila?: FilaDeAvisos;
}): void {
  const trocarDeVersao = registrar({
    immediate: true,
    onNeedRefresh: () => {
      avisar(
        {
          situacao: 'info',
          titulo: 'Nova versão do Grafite',
          descricao: 'Atualizar recarrega a página na versão nova.',
          persistente: true,
          acao: { rotulo: 'Atualizar', aoEscolher: () => void trocarDeVersao(true) },
        },
        fila,
      );
    },
    onRegisteredSW: (_url, registro) => {
      if (!registro) return;
      setInterval(() => void registro.update(), tempos.pwa.conferirVersao);
    },
  });
}
