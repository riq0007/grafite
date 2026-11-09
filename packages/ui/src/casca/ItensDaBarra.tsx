// Itens de status que a casca oferece para a barra superior. O app os monta na área de status,
// junto com os dele (rede e relógio).
import { Bell, FlaskConical, Search } from 'lucide-react';
import { useCallback } from 'react';
import { Button } from 'react-aria-components';
import { type Plataforma, plataformaAtual } from '../componentes/atalho/atalho.ts';
import { TeclaDeAtalho } from '../componentes/atalho/TeclaDeAtalho.tsx';
import { Icone } from '../icones/Icone.tsx';
import estilosDaBarra from './BarraSuperior.module.css';
import { ATALHO_DA_BUSCA } from './BuscaGlobal.tsx';
import estilos from './ItensDaBarra.module.css';
import { textoDoSino } from './notificacoes.ts';

export interface PropsDoBotaoDeBusca {
  aoAbrir: () => void;
  /** Sem ela, vale a do navegador: ⌘K no Mac, Ctrl K nos demais. */
  plataforma?: Plataforma;
}

/**
 * Botão de busca da barra: a lupa e o atalho de teclado. Fica à vista também no celular, onde a
 * busca é um dos caminhos principais; no toque, o atalho sai de vista.
 */
export function BotaoDeBusca({ aoAbrir, plataforma = plataformaAtual() }: PropsDoBotaoDeBusca) {
  // O Button do React Aria não repassa aria-keyshortcuts; o atributo vai direto no elemento.
  const comAtalho = useCallback(
    (botao: HTMLButtonElement | null) =>
      botao?.setAttribute('aria-keyshortcuts', plataforma === 'mac' ? 'Meta+K' : 'Control+K'),
    [plataforma],
  );
  return (
    <span data-essencial="">
      <Button
        ref={comAtalho}
        aria-label="Buscar"
        onPress={aoAbrir}
        className={`${estilosDaBarra.gatilho} ${estilos.busca}`}
      >
        <Icone icone={Search} />
        <TeclaDeAtalho
          teclas={ATALHO_DA_BUSCA}
          plataforma={plataforma}
          className={estilos.atalho}
        />
      </Button>
    </span>
  );
}

/**
 * O aviso do ambiente de teste na barra (spec estrutura-da-casca): o ícone e o texto dizem o
 * ambiente sem depender da cor. Fica à vista também no celular, antes da busca.
 */
export function AvisoDoAmbienteDeTeste() {
  return (
    <span data-essencial="" className={estilos.ambiente}>
      <Icone icone={FlaskConical} />
      Ambiente de teste
    </span>
  );
}

export interface PropsDoSinoDeNotificacoes {
  naoLidas: number;
  /** O modo Foco ligado: o sino mostra "Foco", e o nome acessível diz isso. */
  foco?: boolean;
  aoAbrir: () => void;
}

/**
 * Sino das notificações: o número de não lidas (até 99, depois "99+") e o nome acessível com o
 * número exato. Abre a central. Fica à vista também no celular.
 */
export function SinoDeNotificacoes({ naoLidas, foco = false, aoAbrir }: PropsDoSinoDeNotificacoes) {
  const { numero, nomeAcessivel } = textoDoSino(naoLidas, foco);
  return (
    <span data-essencial="">
      <Button
        aria-label={nomeAcessivel}
        onPress={aoAbrir}
        className={`${estilosDaBarra.gatilho} ${estilos.sino}`}
      >
        <Icone icone={Bell} />
        {foco && (
          <span className={estilos.foco} aria-hidden="true">
            Foco
          </span>
        )}
        {numero && (
          <span className={estilos.contador} aria-hidden="true">
            {numero}
          </span>
        )}
      </Button>
    </span>
  );
}
