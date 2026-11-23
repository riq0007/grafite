// As opções de resposta da pergunta da TI (spec modulo-chamados, "Campo de escrever" e "Respostas
// prontas e horário da TI na tela"; spec chamados, "Pergunta com opções"; change chat-com-chamados,
// tarefa 4.13): no campo de escrever, pelo "Pedir uma escolha", e na gaveta da resposta pronta, um
// campo por opção, com o contador dos 40 caracteres e "Tirar", e "Acrescentar opção" até 3. A
// recusa das opções, que a API confere, fica embaixo delas.
import { LIMITES_DA_PERGUNTA } from '@grafite/domain';
import { Botao, CampoDeTexto } from '@grafite/ui';
import { Plus } from 'lucide-react';
import { type Ref, useEffect, useId, useRef } from 'react';
import estilos from './EditorDasOpcoes.module.css';
import { Recusa } from './formulario/Recusa.tsx';

export interface PropsDoEditorDasOpcoes {
  opcoes: readonly string[];
  aoMudar: (opcoes: string[]) => void;
  /** A recusa das opções, como "As opções precisam ser diferentes.". */
  erro?: string | null;
  /** Enquanto se manda, as opções ficam como estão. */
  editavel?: boolean;
  /** A explicação embaixo da legenda, como a da gaveta da resposta pronta. */
  descricao?: string;
  /** A primeira opção recebe o foco quando o editor aparece, como depois do "Pedir uma escolha". */
  focarAoAparecer?: boolean;
  /** O grupo das opções, para quem leva a recusa delas à vista, como o campo de escrever. */
  ref?: Ref<HTMLFieldSetElement>;
}

export function EditorDasOpcoes({
  opcoes,
  aoMudar,
  erro = null,
  editavel = true,
  descricao,
  focarAoAparecer = false,
  ref,
}: PropsDoEditorDasOpcoes) {
  const idDaLegenda = useId();
  const idDaDescricao = useId();
  // As chaves de cada opção, para o campo seguir a opção dele quando outra sai.
  const chaves = useRef<number[]>([]);
  const proxima = useRef(0);
  while (chaves.current.length < opcoes.length) chaves.current.push(proxima.current++);
  chaves.current.length = opcoes.length;
  const campos = useRef<(HTMLInputElement | null)[]>([]);
  const botaoDeAcrescentar = useRef<HTMLButtonElement>(null);
  // A opção que recebe o foco ao aparecer e depois de acrescentar ou de tirar outra; sem nenhuma, o
  // "Acrescentar opção", onde o editor fica, como na gaveta da resposta pronta.
  const focar = useRef<number | 'acrescentar' | null>(focarAoAparecer ? 0 : null);
  useEffect(() => {
    if (focar.current === null) return;
    if (focar.current === 'acrescentar') botaoDeAcrescentar.current?.focus();
    else campos.current[focar.current]?.focus();
    focar.current = null;
  });

  const mudar = (posicao: number, texto: string) =>
    aoMudar(opcoes.map((opcao, outra) => (outra === posicao ? texto : opcao)));
  const tirar = (posicao: number) => {
    chaves.current.splice(posicao, 1);
    const restantes = opcoes.filter((_, outra) => outra !== posicao);
    focar.current =
      restantes.length === 0 ? 'acrescentar' : Math.min(posicao, restantes.length - 1);
    aoMudar(restantes);
  };
  const acrescentar = () => {
    focar.current = opcoes.length;
    aoMudar([...opcoes, '']);
  };

  return (
    <fieldset
      ref={ref}
      className={estilos.opcoes}
      aria-labelledby={idDaLegenda}
      aria-describedby={descricao ? idDaDescricao : undefined}
    >
      <legend id={idDaLegenda} className={estilos.legenda}>
        Opções de resposta
      </legend>
      {descricao && (
        <p id={idDaDescricao} className={estilos.descricao}>
          {descricao}
        </p>
      )}
      {opcoes.length > 0 && (
        <ol className={estilos.lista}>
          {opcoes.map((opcao, posicao) => (
            <li key={chaves.current[posicao]} className={estilos.opcao}>
              <CampoDeTexto
                ref={(campo) => {
                  campos.current[posicao] = campo;
                }}
                rotulo={`Opção ${posicao + 1}`}
                value={opcao}
                onChange={(texto) => mudar(posicao, texto)}
                isReadOnly={!editavel}
                autoComplete="off"
                contador={{ maximo: LIMITES_DA_PERGUNTA.opcao }}
                className={estilos.campo}
              />
              {editavel && (
                <Botao
                  nivel="terciario"
                  aria-label={`Tirar a opção ${posicao + 1}`}
                  onPress={() => tirar(posicao)}
                >
                  Tirar
                </Botao>
              )}
            </li>
          ))}
        </ol>
      )}
      {editavel && opcoes.length < LIMITES_DA_PERGUNTA.maximo && (
        <Botao ref={botaoDeAcrescentar} nivel="terciario" icone={Plus} onPress={acrescentar}>
          Acrescentar opção
        </Botao>
      )}
      {erro && <Recusa texto={erro} />}
    </fieldset>
  );
}
