import { Radio, RadioGroup } from 'react-aria-components';
import { iconeDoTipo } from '../../icones/ativos.ts';
import estilosDoCampo from '../campo/Campo.module.css';
import { ErroDoCampo, RotuloDoCampo } from '../campo/partes.tsx';
import estilos from './EscolhaDeIcone.module.css';

export interface OpcaoDeIcone {
  /** A chave do ícone, como `impressora`; um ícone sem desenho próprio usa o genérico. */
  chave: string;
  rotulo: string;
}

export interface PropsDaEscolhaDeIcone {
  rotulo: string;
  opcoes: readonly OpcaoDeIcone[];
  valor: string | null;
  aoMudar: (chave: string) => void;
  /** Erro vindo de fora (da API, por exemplo). */
  erro?: string;
  somenteLeitura?: boolean;
  className?: string;
}

/**
 * A escolha do ícone de um tipo de ativo: a grade dos ícones genéricos, cada um com o nome. É um
 * grupo de rádios: as setas movem a escolha, e a bolinha preenchida mostra a escolhida.
 */
export function EscolhaDeIcone({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  erro,
  somenteLeitura = false,
  className,
}: PropsDaEscolhaDeIcone) {
  return (
    <RadioGroup
      value={valor}
      onChange={aoMudar}
      isReadOnly={somenteLeitura}
      isInvalid={erro ? true : undefined}
      orientation="horizontal"
      className={[estilosDoCampo.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} />
      <div className={estilos.grade}>
        {opcoes.map(({ chave, rotulo: nome }) => {
          const Icone = iconeDoTipo(chave);
          return (
            <Radio key={chave} value={chave} className={estilos.opcao}>
              <span className={estilos.marca} aria-hidden="true" />
              <Icone className={estilos.icone} aria-hidden="true" />
              <span className={estilos.nome}>{nome}</span>
            </Radio>
          );
        })}
      </div>
      <ErroDoCampo erro={erro} tipo="escolha" />
    </RadioGroup>
  );
}
