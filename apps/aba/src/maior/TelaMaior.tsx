import { Botao } from '@grafite/ui';
import { type RefObject, useEffect, useRef } from 'react';
import { useAparencia } from '../aparencia.ts';
import { useDoNativo } from '../doNativo.ts';
import { useFormaInformada } from '../forma.ts';
import {
  abrirTelaMaior,
  fecharTelaMaior,
  informarCorpo,
  lerTelaMaior,
  ouvirTelaMaior,
  type TelaMaior as TelaDoNativo,
} from '../nativo.ts';
import { Simbolo } from '../Simbolo.tsx';
import { comOChat, fraseDa, TEMA_DO_CORPO, trilhaDa } from './destino.ts';
import estilos from './TelaMaior.module.css';

const semFalha = () => undefined;

/** Informa ao lado nativo onde o chat fica, a cada mudança de tamanho; `null` sem o chat. */
function useCorpoInformado(ref: RefObject<HTMLElement | null>, comChat: boolean) {
  useEffect(() => {
    const lugar = ref.current;
    if (!comChat || !lugar) {
      informarCorpo(null).catch(semFalha);
      return;
    }
    let ultimo = '';
    const informar = () => {
      const caixa = lugar.getBoundingClientRect();
      const retangulo = {
        x: Math.round(caixa.x),
        y: Math.round(caixa.y),
        largura: Math.round(caixa.width),
        altura: Math.round(caixa.height),
      };
      const texto = JSON.stringify(retangulo);
      if (texto === ultimo) return;
      ultimo = texto;
      informarCorpo(retangulo).catch(semFalha);
    };
    informar();
    const observador = new ResizeObserver(informar);
    observador.observe(lugar);
    return () => observador.disconnect();
  }, [ref, comChat]);
}

/**
 * A tela maior da aba (spec aba-dos-colaboradores, "Tela maior da aba"; m08): a moldura, com a
 * faixa da trilha e do "Esc volta", e o corpo. No chat, o corpo é o lugar do webview remoto; em
 * "Abrir chamado" e "Visualizar chamados", a frase de que chegam numa versão seguinte, com "Abrir no
 * chat". O Esc que chega à moldura volta ao painel; com o foco no chat, o Esc vai à página.
 */
export function TelaMaior() {
  const aparencia = useAparencia();
  const tela = useDoNativo<TelaDoNativo | null>(lerTelaMaior, ouvirTelaMaior, null);
  const moldura = useRef<HTMLElement>(null);
  const lugarDoChat = useRef<HTMLDivElement>(null);
  const comChat = tela !== null && comOChat(tela);
  useFormaInformada(moldura, `${tela?.destino}`);
  useCorpoInformado(lugarDoChat, comChat);

  const tema = aparencia?.tema;
  useEffect(() => {
    if (tema) document.documentElement.dataset.theme = TEMA_DO_CORPO[tema];
  }, [tema]);

  const trilha = tela ? trilhaDa(tela) : [];
  const titulo = trilha.length ? `${trilha.slice(1).join(' › ')} · Suporte da TI` : 'Suporte da TI';
  useEffect(() => {
    document.title = titulo;
  }, [titulo]);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape' || evento.defaultPrevented) return;
      evento.preventDefault();
      fecharTelaMaior().catch(semFalha);
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  if (!aparencia || !tela) return <div className={estilos.raiz} />;
  const frase = fraseDa(tela);
  return (
    <div className={estilos.raiz}>
      <main ref={moldura} className={estilos.moldura} data-destino={tela.destino}>
        <header className={estilos.faixa}>
          <button
            type="button"
            className={estilos.voltar}
            aria-label="Voltar à aba"
            aria-keyshortcuts="Escape"
            onClick={() => fecharTelaMaior().catch(semFalha)}
          >
            <Simbolo nome="voltar" />
          </button>
          <nav aria-label="Trilha" className={estilos.trilha}>
            <ol>
              {trilha.map((parte, indice) => (
                <li
                  key={parte}
                  aria-current={indice === trilha.length - 1 ? 'location' : undefined}
                >
                  {parte}
                </li>
              ))}
            </ol>
          </nav>
          <span className={estilos.esc}>Esc volta</span>
        </header>
        <div className={estilos.corpo}>
          {frase ? (
            <section className={estilos.frase} aria-labelledby="titulo-da-frase">
              <h1 id="titulo-da-frase">{frase.titulo}</h1>
              <p>{frase.texto}</p>
              <Botao
                nivel="primario"
                autoFocus
                onPress={() => abrirTelaMaior('abrir-chat').catch(semFalha)}
              >
                Abrir no chat
              </Botao>
            </section>
          ) : (
            <div ref={lugarDoChat} className={estilos.lugarDoChat} data-chat="" />
          )}
        </div>
      </main>
    </div>
  );
}
