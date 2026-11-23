// A pergunta da TI com as opções (spec modulo-chat, "Chamado no chat"; spec chamados, "Pergunta com
// opções"; change chat-com-chamados, design, decisão 15, "O chamado no chat"): os chips de 36 px com
// a borda à vista, numa barra em que o Tab entra por um chip, as setas, o Home e o End andam entre
// eles, e o Enter, o espaço e o clique escolhem. A escolha vale para sempre, e por isso não é um
// grupo de rádios: respondida, a escolhida fica cheia, na cor do destaque e com o ✓, as outras
// apagadas, e a linha de baixo diz quem escolheu e quando. A recusa fica embaixo dos chips. No
// resolvido e no fechado, que não aceitam a escolha, a pergunta sem resposta fica sem ação.
import { type DataHora, Icone } from '@grafite/ui';
import { Check } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Recusa } from '../modulos/chamados/formulario/Recusa.tsx';
import { horaNaConversa, type MensagemDoChamado } from './chamado.ts';
import estilos from './PerguntaDoChamado.module.css';

/** Manda a escolha e devolve nulo quando ela entrou, ou a frase da recusa. */
export type EscolherAOpcao = (opcao: string) => Promise<string | null>;

/** As teclas que andam pelos chips, da última à primeira e de volta. */
const PASSOS: Record<string, (posicao: number, total: number) => number> = {
  ArrowRight: (posicao, total) => (posicao + 1) % total,
  ArrowDown: (posicao, total) => (posicao + 1) % total,
  ArrowLeft: (posicao, total) => (posicao - 1 + total) % total,
  ArrowUp: (posicao, total) => (posicao - 1 + total) % total,
  Home: () => 0,
  End: (_, total) => total - 1,
};

export function PerguntaDoChamado({
  opcoes,
  escolhida,
  escolher,
  agora,
  dataHora,
}: {
  opcoes: readonly string[];
  escolhida: MensagemDoChamado['escolhida'];
  /** Nulo no chamado que não aceita a escolha: o resolvido e o fechado. */
  escolher: EscolherAOpcao | null;
  agora: Date;
  dataHora: DataHora;
}) {
  const [daVez, definirDaVez] = useState(0);
  const [escolhendo, definirEscolhendo] = useState<string | null>(null);
  const [recusa, definirRecusa] = useState<string | null>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const legenda = useRef<HTMLParagraphElement>(null);
  /** A escolha foi feita aqui: o foco, que estava no chip, vai à linha de quem escolheu. */
  const escolheuAqui = useRef(false);

  useEffect(() => {
    if (escolhida === null || !escolheuAqui.current) return;
    escolheuAqui.current = false;
    legenda.current?.focus();
  }, [escolhida]);

  if (escolhida !== null) {
    return (
      <div className={estilos.pergunta}>
        <ul className={estilos.opcoes} aria-label="Respostas">
          {opcoes.map((opcao) => {
            const essa = opcao === escolhida.opcao;
            return (
              <li
                key={opcao}
                className={estilos.opcao}
                data-escolhida={essa || undefined}
                data-apagada={!essa || undefined}
              >
                {essa && <Icone icone={Check} tamanho={14} />}
                {opcao}
                {essa && <span className={estilos.paraOLeitor}>, a escolhida</span>}
              </li>
            );
          })}
        </ul>
        <p ref={legenda} tabIndex={-1} className={estilos.legenda}>
          {`Escolhida por ${escolhida.minha ? 'você' : escolhida.por} · ${horaNaConversa(
            new Date(escolhida.em),
            agora,
            dataHora,
          )}`}
        </p>
      </div>
    );
  }

  if (escolher === null) {
    return (
      <div className={estilos.pergunta}>
        <ul className={estilos.opcoes} aria-label="Respostas">
          {opcoes.map((opcao) => (
            <li key={opcao} className={estilos.opcao}>
              {opcao}
            </li>
          ))}
        </ul>
        <p className={estilos.legenda}>Sem resposta.</p>
      </div>
    );
  }

  const escolherEssa = async (opcao: string) => {
    if (escolhendo !== null) return;
    definirEscolhendo(opcao);
    definirRecusa(null);
    escolheuAqui.current = true;
    const falha = await escolher(opcao);
    definirEscolhendo(null);
    if (falha !== null) {
      escolheuAqui.current = false;
      definirRecusa(falha);
    }
  };

  const teclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    const passo = PASSOS[evento.key];
    if (!passo || evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey) return;
    evento.preventDefault();
    const destino = passo(daVez, opcoes.length);
    definirDaVez(destino);
    chips.current[destino]?.focus();
  };

  return (
    <div className={estilos.pergunta}>
      <div
        role="toolbar"
        aria-label="Escolha uma resposta"
        aria-busy={escolhendo !== null || undefined}
        className={estilos.opcoes}
        onKeyDown={teclar}
      >
        {opcoes.map((opcao, posicao) => (
          <button
            key={opcao}
            ref={(chip) => {
              chips.current[posicao] = chip;
            }}
            type="button"
            className={estilos.opcao}
            tabIndex={posicao === daVez ? 0 : -1}
            aria-disabled={escolhendo !== null || undefined}
            data-escolhendo={opcao === escolhendo || undefined}
            onFocus={() => definirDaVez(posicao)}
            onClick={() => void escolherEssa(opcao)}
          >
            {opcao}
          </button>
        ))}
      </div>
      {recusa !== null && <Recusa texto={recusa} />}
    </div>
  );
}
