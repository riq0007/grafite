import { Marca } from '@grafite/ui';
import { type KeyboardEvent, type Ref, useEffect, useRef } from 'react';
import { ROTULO_DA_ABA } from './AbaFechada.tsx';
import encaixe from './Encaixe.module.css';
import { seloDasNaoLidas, seloDasNovas } from './estado.ts';
import { type Grade, proximaNaGrade, seguinteNoTab } from './grade.ts';
import type { EstadoDaAba, FormaDaAba, OpcaoDaAba } from './nativo.ts';
import estilos from './Painel.module.css';
import { Simbolo } from './Simbolo.tsx';

export const FRASE_DO_ATALHO_OCUPADO = 'O atalho Ctrl+Alt+T está com outro programa.';

interface Props {
  forma: FormaDaAba;
  compacta: boolean;
  estado: EstadoDaAba;
  /** Aberto pelo atalho ou usado pelo teclado: o anel do foco aparece também no foco dado pela tela. */
  teclado: boolean;
  /** Muda a cada pedido de foco em "Abrir chamado", como o atalho com o painel já aberto. */
  pedidoDeFoco: number;
  ref?: Ref<HTMLDivElement>;
  aoEscolher: (opcao: OpcaoDaAba) => void;
  aoFecharPeloEsc: () => void;
  aoSair: () => void;
  aoUsar: (peloTeclado: boolean) => void;
}

/**
 * O painel aberto (spec aba-dos-colaboradores, "Aba aberta" e "Aba pelo teclado"; mockups m01, m03,
 * m08 e m12): o logo, a grade 2+1 com "Abrir chamado" larga e clara e os selos das não lidas e das
 * respostas novas, e, na entrada pela senha, quem está na aba, com "Sair".
 */
export function Painel({
  forma,
  compacta,
  estado,
  teclado,
  pedidoDeFoco,
  ref,
  aoEscolher,
  aoFecharPeloEsc,
  aoSair,
  aoUsar,
}: Props) {
  const botoes = useRef(new Map<string, HTMLButtonElement>());
  const comSair = estado.pessoa?.pelaSenha === true;
  const grade: Grade = [['abrir-chamado'], ['abrir-chat', 'visualizar-chamados']];
  if (comSair) grade.push(['sair']);
  const naoLidas = seloDasNaoLidas(estado.naoLidas);
  const novas = seloDasNovas(estado.respostasNovas);

  // biome-ignore lint/correctness/useExhaustiveDependencies: o foco volta a "Abrir chamado" a cada pedido.
  useEffect(() => {
    botoes.current.get('abrir-chamado')?.focus();
  }, [pedidoDeFoco]);

  const guardar = (id: string) => (botao: HTMLButtonElement | null) => {
    if (botao) botoes.current.set(id, botao);
    else botoes.current.delete(id);
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
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
    (naoLidas || novas) && estilos.comSelos,
  ]
    .filter(Boolean)
    .join(' ');

  const opcao = (
    id: OpcaoDaAba,
    rotulo: string,
    simbolo: 'chat' | 'lista',
    selo: string | null,
  ) => (
    <button
      ref={guardar(id)}
      type="button"
      className={estilos.opcao}
      data-opcao={id}
      onClick={() => aoEscolher(id)}
    >
      <Simbolo nome={simbolo} />
      <span className={estilos.empilhado}>{rotulo}</span>
      {selo && <span className={estilos.selo}>{selo}</span>}
    </button>
  );

  return (
    <div
      ref={ref}
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
      <div className={estilos.opcoes}>
        <button
          ref={guardar('abrir-chamado')}
          type="button"
          className={`${estilos.opcao} ${estilos.larga}`}
          data-opcao="abrir-chamado"
          onClick={() => aoEscolher('abrir-chamado')}
        >
          <Simbolo nome="chamado" />
          <span>Abrir chamado</span>
        </button>
        {opcao('abrir-chat', 'Abrir chat', 'chat', naoLidas)}
        {opcao('visualizar-chamados', 'Visualizar chamados', 'lista', novas)}
      </div>
      {estado.atalhoOcupado && <p className={estilos.nota}>{FRASE_DO_ATALHO_OCUPADO}</p>}
      {comSair && estado.pessoa && (
        <div className={estilos.quem}>
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
