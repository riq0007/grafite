// A grade dos tipos (change chamados-da-ti, design, decisão 16): "Sobre o que é o chamado?", com os
// tipos em 4 colunas, cada um com o atalho, o ícone, o nome e a frase. Com a ação, cada tipo é um
// botão e as teclas 1 a 9 escolhem; sem ela, a grade é só para ver, como na prévia do editor.
import type { IconeDoTipoDeChamado } from '@grafite/domain';
import { Icone } from '@grafite/ui';
import { Check } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useId } from 'react';
import { ICONES_DOS_TIPOS_DE_CHAMADO } from '../icones.ts';
import estilos from './Aba.module.css';
import { atalhoDoEvento, tipoPeloAtalho, ultimoAtalho } from './atalhos.ts';

export interface TipoNaGrade {
  id: string;
  nome: string;
  icone: IconeDoTipoDeChamado;
  frase: string;
  /** O selo do canto: o tipo que se edita ou o que se cria. */
  marca?: 'editando' | 'novo';
}

export interface PropsDaGradeDosTipos {
  tipos: readonly TipoNaGrade[];
  /** O tipo escolhido, cheio na cor da aba. */
  escolhido?: string | null;
  /** Escolher um tipo; sem a ação, a grade é só para ver. */
  aoEscolher?: (id: string) => void;
}

/** "Aperte 1 a 8 ou clique": até o atalho do último tipo. */
function aperte(quantos: number): string {
  const ultimo = ultimoAtalho(quantos);
  return ultimo === 1 ? 'Aperte 1 ou clique' : `Aperte 1 a ${ultimo} ou clique`;
}

export function GradeDosTipos({ tipos, escolhido = null, aoEscolher }: PropsDaGradeDosTipos) {
  const id = useId();
  const pergunta = `${id}-pergunta`;

  function escolherPelaTecla(evento: KeyboardEvent) {
    if (!aoEscolher) return;
    const tecla = atalhoDoEvento(evento);
    const tipo =
      tecla === null
        ? null
        : tipoPeloAtalho(
            tecla,
            tipos.map((cada) => cada.id),
          );
    if (tipo === null) return;
    evento.preventDefault();
    aoEscolher(tipo);
  }

  return (
    <div className={estilos.grade}>
      <div className={estilos.pergunta}>
        <span id={pergunta}>Sobre o que é o chamado?</span>
        {tipos.length > 0 && <small>{aperte(tipos.length)}</small>}
      </div>
      {tipos.length === 0 ? (
        <p className={estilos.semTipos}>Nenhum tipo aparece para o colaborador.</p>
      ) : (
        // As teclas chegam dos botões da grade; fora dela, quem usa a grade liga as suas.
        <ul aria-labelledby={pergunta} className={estilos.tipos} onKeyDown={escolherPelaTecla}>
          {tipos.map((tipo, indice) => (
            <li key={tipo.id} className={estilos.item}>
              <Tipo
                tipo={tipo}
                atalho={indice < ultimoAtalho(tipos.length) ? String(indice + 1) : null}
                escolhido={tipo.id === escolhido}
                aoEscolher={aoEscolher}
                id={`${id}-${indice}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PropsDoTipo {
  tipo: TipoNaGrade;
  atalho: string | null;
  escolhido: boolean;
  aoEscolher?: (id: string) => void;
  /** O começo dos ids do nome e da frase, que o botão usa para o nome e a descrição lidos. */
  id: string;
}

function Tipo({ tipo, atalho, escolhido, aoEscolher, id }: PropsDoTipo) {
  const ids = { nome: `${id}-nome`, frase: `${id}-frase`, marca: `${id}-marca` };
  const conteudo: ReactNode = (
    <>
      {/* O atalho é desenho: o botão o diz pelo aria-keyshortcuts. */}
      {atalho && (
        <span className={estilos.atalho} aria-hidden="true">
          {atalho}
        </span>
      )}
      {tipo.marca ? (
        <span id={ids.marca} className={estilos.marca}>
          {tipo.marca}
        </span>
      ) : (
        escolhido && (
          <span className={estilos.vistoDoTipo} data-parte="visto">
            <Icone icone={Check} tamanho={12} />
          </span>
        )
      )}
      <span className={estilos.icone}>
        <Icone icone={ICONES_DOS_TIPOS_DE_CHAMADO[tipo.icone]} tamanho={26} />
      </span>
      <span id={ids.nome} className={estilos.nome}>
        {tipo.nome}
      </span>
      <span id={ids.frase} className={estilos.frase}>
        {tipo.frase}
      </span>
    </>
  );
  const marcas = {
    'data-escolhido': escolhido ? '' : undefined,
    'data-marca': tipo.marca,
  };
  if (!aoEscolher) {
    return (
      <div className={estilos.tipo} {...marcas}>
        {conteudo}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={estilos.tipo}
      {...marcas}
      aria-pressed={escolhido}
      aria-labelledby={ids.nome}
      aria-describedby={tipo.marca ? `${ids.marca} ${ids.frase}` : ids.frase}
      aria-keyshortcuts={atalho ?? undefined}
      onClick={() => aoEscolher(tipo.id)}
    >
      {conteudo}
    </button>
  );
}
