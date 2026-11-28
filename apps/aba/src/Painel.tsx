import { Marca } from '@grafite/ui';
import {
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ROTULO_DA_ABA } from './AbaFechada.tsx';
import encaixe from './Encaixe.module.css';
import { horaDa, seloDasNaoLidas, seloDasNovas } from './estado.ts';
import { type Grade, proximaNaGrade, seguinteNoTab } from './grade.ts';
import { curva, duracaoDaAba, useComSaida, useLarguraAnimada } from './movimento.ts';
import type { EstadoDaAba, FormaDaAba, OpcaoDaAba, TelaMaior } from './nativo.ts';
import estilos from './Painel.module.css';
import { Simbolo } from './Simbolo.tsx';

export const FRASE_DO_ATALHO_OCUPADO = 'O atalho Ctrl+Alt+T está com outro programa.';

/** O encaixe do entalhe: 14 px fechado e 18 px aberto (m05). */
const ENCAIXE_FECHADO = '14px';
const ENCAIXE_ABERTO = '18px';

function formaDe(origem: Origem, forma: FormaDaAba, encaixe: string): Keyframe {
  return {
    width: `${origem.largura}px`,
    height: `${origem.altura}px`,
    borderRadius: origem.raio,
    ...(forma === 'entalhe' && { '--encaixe': encaixe }),
  };
}

/** A aba fechada de onde o painel cresce e para onde ele volta. */
export interface Origem {
  largura: number;
  altura: number;
  raio: string;
}

interface Props {
  forma: FormaDaAba;
  compacta: boolean;
  estado: EstadoDaAba;
  /** A aba fechada de onde ele cresce e para onde ele volta. */
  origem: Origem | null;
  /** A tela maior aberta: o painel fica atrás, recuado, com a opção de origem marcada (m08). */
  telaMaior: TelaMaior | null;
  fechando: boolean;
  /** Aberto pelo atalho ou usado pelo teclado: o anel do foco aparece também no foco dado pela tela. */
  teclado: boolean;
  /** Muda a cada pedido de foco em "Abrir chamado", como o atalho com o painel já aberto. */
  pedidoDeFoco: number;
  ref?: Ref<HTMLDivElement>;
  aoEscolher: (opcao: OpcaoDaAba) => void;
  aoEscolherResposta: (numero: number) => void;
  aoFecharPeloEsc: () => void;
  aoTerminarDeFechar: () => void;
  aoSair: () => void;
  aoUsar: (peloTeclado: boolean) => void;
}

/**
 * O painel aberto (spec aba-dos-colaboradores, "Aba aberta", "Aviso da resposta nova" e "Aba pelo
 * teclado"; mockups m01 a m08 e m12): o logo, a linha da resposta por ver, a grade 2+1 com "Abrir
 * chamado" larga e clara e os selos, e, na entrada pela senha, quem está na aba, com "Sair". Ele
 * cresce da aba fechada em 220 ms, com a cascata até 340 ms, e volta a ela em 160 ms.
 */
export function Painel({
  forma,
  compacta,
  estado,
  origem,
  telaMaior,
  fechando,
  teclado,
  pedidoDeFoco,
  ref,
  aoEscolher,
  aoEscolherResposta,
  aoFecharPeloEsc,
  aoTerminarDeFechar,
  aoSair,
  aoUsar,
}: Props) {
  const proprio = useRef<HTMLDivElement | null>(null);
  const botoes = useRef(new Map<string, HTMLButtonElement>());
  const porVer = estado.porVer && estado.porVer.quantas > 0 ? estado.porVer.ultima : null;
  const resposta = useComSaida(porVer, 'entrada');
  // Com a linha da resposta, o painel alarga para 372 px (300 na tela pequena) e fica assim até fechar.
  const [largo, setLargo] = useState(resposta.valor !== null);
  useEffect(() => {
    if (resposta.valor && !resposta.saindo) setLargo(true);
  }, [resposta.valor, resposta.saindo]);
  const comSair = estado.pessoa?.pelaSenha === true;
  const grade: Grade = [['abrir-chamado'], ['abrir-chat', 'visualizar-chamados']];
  if (resposta.valor && !resposta.saindo) grade.unshift(['resposta']);
  if (comSair) grade.push(['sair']);
  const naoLidas = seloDasNaoLidas(estado.naoLidas);
  const novas = seloDasNovas(estado.respostasNovas);

  // A opção de onde a tela maior saiu: a linha leva ao chamado, ou "Abrir chat" se ela já saiu.
  const marcada = telaMaior
    ? telaMaior.destino === 'chamado'
      ? resposta.valor
        ? 'resposta'
        : 'abrir-chat'
      : telaMaior.destino
    : null;
  // Ao fechar a tela maior, o foco volta à opção de onde ela saiu.
  const ultimaMarcada = useRef<string | null>(null);
  useEffect(() => {
    if (marcada) ultimaMarcada.current = marcada;
    else if (ultimaMarcada.current) {
      const alvo = botoes.current.get(ultimaMarcada.current) ?? botoes.current.get('abrir-chamado');
      ultimaMarcada.current = null;
      alvo?.focus();
    }
  }, [marcada]);

  const guardarPainel = (elemento: HTMLDivElement | null) => {
    proprio.current = elemento;
    if (typeof ref === 'function') ref(elemento);
    else if (ref) (ref as RefObject<HTMLDivElement | null>).current = elemento;
  };

  // A resposta que chega com o painel aberto o alarga em 180 ms.
  useLarguraAnimada(proprio, String(largo), `${forma} ${compacta}`);

  // A forma cresce da aba fechada em 220 ms: a largura, a altura, o raio e, no entalhe, o encaixe.
  // biome-ignore lint/correctness/useExhaustiveDependencies: anima uma vez, ao abrir.
  useLayoutEffect(() => {
    const painel = proprio.current;
    if (!painel || !origem) return;
    const fim = { width: painel.offsetWidth, height: painel.offsetHeight };
    painel.animate(
      [
        formaDe(origem, forma, ENCAIXE_FECHADO),
        {
          width: `${fim.width}px`,
          height: `${fim.height}px`,
          borderRadius: getComputedStyle(painel).borderRadius,
          ...(forma === 'entalhe' && { '--encaixe': ENCAIXE_ABERTO }),
        },
      ],
      { duration: duracaoDaAba('abrir'), easing: curva('padrao') },
    );
  }, []);

  // E volta a ela em 160 ms, com tudo ao mesmo tempo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: anima uma vez, ao fechar.
  useEffect(() => {
    const painel = proprio.current;
    if (!fechando || !painel) return;
    const animacao = painel.animate(
      [{}, origem ? formaDe(origem, forma, ENCAIXE_FECHADO) : { opacity: 0 }],
      { duration: duracaoDaAba('fechar'), easing: curva('saida'), fill: 'forwards' },
    );
    animacao.onfinish = aoTerminarDeFechar;
    return () => {
      animacao.onfinish = null;
      animacao.cancel();
    };
  }, [fechando]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: o foco volta a "Abrir chamado" a cada pedido.
  useEffect(() => {
    botoes.current.get('abrir-chamado')?.focus();
  }, [pedidoDeFoco]);

  // A linha lida sai: o foco que estava nela vai a "Abrir chamado".
  useEffect(() => {
    if (resposta.saindo && document.activeElement === botoes.current.get('resposta')) {
      botoes.current.get('abrir-chamado')?.focus();
    }
  }, [resposta.saindo]);

  const guardar = (id: string) => (botao: HTMLButtonElement | null) => {
    if (botao) botoes.current.set(id, botao);
    else botoes.current.delete(id);
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (fechando) return;
    const atual = (document.activeElement as HTMLElement | null)?.dataset.opcao ?? '';
    if (evento.key === 'Escape') {
      evento.preventDefault();
      aoFecharPeloEsc();
      return;
    }
    const destino =
      evento.key === 'Tab'
        ? seguinteNoTab(grade, atual, evento.shiftKey)
        : proximaNaGrade(grade, atual || 'abrir-chamado', evento.key);
    if (destino === null) return;
    evento.preventDefault();
    aoUsar(true);
    botoes.current.get(destino)?.focus();
  };

  const classes = [
    estilos.painel,
    forma === 'entalhe' ? `${estilos.ilha} ${encaixe.encaixe}` : estilos.flutuante,
    compacta && estilos.compacta,
    largo && estilos.largo,
    (naoLidas || novas) && estilos.comSelos,
    fechando && estilos.fechando,
    marcada && estilos.atras,
  ]
    .filter(Boolean)
    .join(' ');

  // A cascata: "Abrir chamado" aos 120 ms, e as outras a cada 40 ms.
  const ordem = (n: number) => ({ '--ordem': n }) as CSSProperties;
  const opcao = (
    id: OpcaoDaAba,
    rotulo: string,
    simbolo: 'chat' | 'lista',
    selo: string | null,
    n: number,
  ) => (
    <button
      ref={guardar(id)}
      type="button"
      className={estilos.opcao}
      style={ordem(n)}
      data-opcao={id}
      aria-current={marcada === id || undefined}
      onClick={() => aoEscolher(id)}
    >
      <Simbolo nome={simbolo} />
      <span className={estilos.empilhado}>{rotulo}</span>
      {selo && <span className={estilos.selo}>{selo}</span>}
    </button>
  );

  return (
    <div
      ref={guardarPainel}
      role="dialog"
      aria-label={ROTULO_DA_ABA}
      className={classes}
      data-forma={forma}
      data-teclado={teclado || undefined}
      onKeyDown={aoTeclar}
      onPointerDown={() => aoUsar(false)}
    >
      <div className={estilos.logo}>
        <Marca altura={compacta ? 24 : 26} />
      </div>
      {resposta.valor && (
        <button
          ref={guardar('resposta')}
          type="button"
          className={`${estilos.linha} ${resposta.saindo ? estilos.saindo : ''}`}
          data-opcao="resposta"
          aria-current={marcada === 'resposta' || undefined}
          disabled={resposta.saindo}
          onClick={() => resposta.valor && aoEscolherResposta(resposta.valor.numero)}
        >
          <span className={estilos.ponto} />
          <span className={estilos.textoDaLinha}>
            <span className={estilos.quemRespondeu}>{resposta.valor.quem} respondeu</span>
            <span className={estilos.chamado}>
              #{resposta.valor.numero} · {resposta.valor.titulo}
            </span>
          </span>
          <time className={estilos.hora} dateTime={resposta.valor.momento}>
            {horaDa(resposta.valor.momento)}
          </time>
        </button>
      )}
      <div className={estilos.opcoes}>
        <button
          ref={guardar('abrir-chamado')}
          type="button"
          className={`${estilos.opcao} ${estilos.larga}`}
          style={ordem(0)}
          data-opcao="abrir-chamado"
          aria-current={marcada === 'abrir-chamado' || undefined}
          onClick={() => aoEscolher('abrir-chamado')}
        >
          <Simbolo nome="chamado" />
          <span>Abrir chamado</span>
        </button>
        {opcao('abrir-chat', 'Abrir chat', 'chat', naoLidas, 1)}
        {opcao('visualizar-chamados', 'Visualizar chamados', 'lista', novas, 2)}
      </div>
      {estado.atalhoOcupado && (
        <p className={estilos.nota} style={ordem(2)}>
          {FRASE_DO_ATALHO_OCUPADO}
        </p>
      )}
      {comSair && estado.pessoa && (
        <div className={estilos.quem} style={ordem(2)}>
          <span className={estilos.nome}>{estado.pessoa.nome}</span>
          <button
            ref={guardar('sair')}
            type="button"
            className={estilos.sair}
            data-opcao="sair"
            onClick={aoSair}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
