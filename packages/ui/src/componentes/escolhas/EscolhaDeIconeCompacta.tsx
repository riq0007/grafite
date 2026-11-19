import type { LucideIcon } from 'lucide-react';
import { Radio, RadioGroup } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilosDoCampo from '../campo/Campo.module.css';
import { ErroDoCampo, RotuloDoCampo } from '../campo/partes.tsx';
import estilos from './EscolhaDeIcone.module.css';

export interface OpcaoDeIconeCompacta {
  chave: string;
  /** O nome do ícone, que o leitor de tela lê: a grade mostra só o desenho. */
  rotulo: string;
  icone: LucideIcon;
}

export interface PropsDaEscolhaDeIconeCompacta {
  rotulo: string;
  opcoes: readonly OpcaoDeIconeCompacta[];
  valor: string | null;
  aoMudar: (chave: string) => void;
  /** Quantos quadrados por fileira. */
  colunas?: number;
  /** Erro vindo de fora (da API, por exemplo). */
  erro?: string;
  className?: string;
}

/**
 * A escolha do ícone em quadrados de 36 px, só com o desenho, como a do tipo de chamado (m07). É
 * um grupo de rádios: as setas movem a escolha, e a escolhida tem a borda e o anel do destaque.
 */
export function EscolhaDeIconeCompacta({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  colunas = 8,
  erro,
  className,
}: PropsDaEscolhaDeIconeCompacta) {
  return (
    <RadioGroup
      value={valor}
      onChange={aoMudar}
      isInvalid={erro ? true : undefined}
      orientation="horizontal"
      className={[estilosDoCampo.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} />
      <div
        className={estilos.gradeCompacta}
        style={{ gridTemplateColumns: `repeat(${colunas}, var(--altura-controle))` }}
      >
        {opcoes.map(({ chave, rotulo: nome, icone }) => (
          <Radio key={chave} value={chave} aria-label={nome} className={estilos.opcaoCompacta}>
            <Icone icone={icone} tamanho={18} />
          </Radio>
        ))}
      </div>
      <ErroDoCampo erro={erro} tipo="escolha" />
    </RadioGroup>
  );
}
