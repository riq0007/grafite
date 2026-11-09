import { ArrowDown, ArrowUp, CircleAlert, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Input, TextField } from 'react-aria-components';
import { BotaoDeIcone, Icone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import estilosDoCampo from '../campo/Campo.module.css';
import { ErroDoCampo } from '../campo/partes.tsx';
import estilos from './EditorDeOpcoes.module.css';

export interface OpcaoEditavel {
  /** A chave da linha na tela: o id da opção, ou uma chave provisória da opção nova. */
  chave: string;
  /** O id da opção que já existe; a opção nova ainda não tem. */
  id?: string;
  rotulo: string;
  situacao: 'ativa' | 'inativa';
}

export interface PropsDoEditorDeOpcoes {
  rotulo: string;
  opcoes: readonly OpcaoEditavel[];
  aoMudar: (opcoes: OpcaoEditavel[]) => void;
  /** A recusa de cada opção, pela posição dela na lista, como a API a devolve. */
  erros?: Readonly<Record<number, string>>;
  /** A recusa da lista inteira. */
  erro?: string;
  somenteLeitura?: boolean;
  /** A chave da opção nova; por padrão, um UUID aleatório. */
  novaChave?: () => string;
}

/**
 * As opções de um campo de lista: incluir, renomear, mover, inativar e reativar. A opção não é
 * excluída, só inativada, e a inativa diz isso em texto.
 */
export function EditorDeOpcoes({
  rotulo,
  opcoes,
  aoMudar,
  erros = {},
  erro,
  somenteLeitura = false,
  novaChave = () => crypto.randomUUID(),
}: PropsDoEditorDeOpcoes) {
  const campos = useRef(new Map<string, HTMLInputElement>());
  const focarEm = useRef<string | null>(null);

  useEffect(() => {
    if (focarEm.current === null) return;
    campos.current.get(focarEm.current)?.focus();
    focarEm.current = null;
  });

  const mudar = (indice: number, mudanca: Partial<OpcaoEditavel>) =>
    aoMudar(opcoes.map((opcao, i) => (i === indice ? { ...opcao, ...mudanca } : opcao)));

  const mover = (indice: number, passo: -1 | 1) => {
    const lista = [...opcoes];
    const [opcao] = lista.splice(indice, 1);
    if (opcao) lista.splice(indice + passo, 0, opcao);
    aoMudar(lista);
  };

  const incluir = () => {
    const chave = novaChave();
    focarEm.current = chave;
    aoMudar([...opcoes, { chave, rotulo: '', situacao: 'ativa' }]);
  };

  return (
    <fieldset className={estilos.editor}>
      <legend className={estilos.legenda}>{rotulo}</legend>
      <ol className={estilos.lista}>
        {opcoes.map((opcao, indice) => {
          const nome = opcao.rotulo.trim() || `opção ${indice + 1}`;
          const acao = opcao.situacao === 'ativa' ? 'Inativar' : 'Reativar';
          return (
            <li key={opcao.chave} className={estilos.linha} data-situacao={opcao.situacao}>
              <TextField
                aria-label={`Opção ${indice + 1}`}
                value={opcao.rotulo}
                onChange={(texto) => mudar(indice, { rotulo: texto })}
                isReadOnly={somenteLeitura}
                isInvalid={erros[indice] ? true : undefined}
                className={estilos.campo}
              >
                <Input
                  ref={(elemento) => {
                    if (elemento) campos.current.set(opcao.chave, elemento);
                    else campos.current.delete(opcao.chave);
                  }}
                  className={[estilosDoCampo.entrada, estilos.entrada].join(' ')}
                />
                {opcao.situacao === 'inativa' && <span className={estilos.situacao}>Inativa</span>}
                <ErroDoCampo erro={erros[indice]} />
              </TextField>
              {!somenteLeitura && (
                <div className={estilos.acoes}>
                  <BotaoDeIcone
                    icone={ArrowUp}
                    rotulo={`Mover ${nome} para cima`}
                    isDisabled={indice === 0}
                    onPress={() => mover(indice, -1)}
                  />
                  <BotaoDeIcone
                    icone={ArrowDown}
                    rotulo={`Mover ${nome} para baixo`}
                    isDisabled={indice === opcoes.length - 1}
                    onPress={() => mover(indice, 1)}
                  />
                  <Botao
                    nivel="terciario"
                    aria-label={`${acao} ${nome}`}
                    onPress={() =>
                      mudar(indice, { situacao: opcao.situacao === 'ativa' ? 'inativa' : 'ativa' })
                    }
                  >
                    {acao}
                  </Botao>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {erro && (
        <p className={estilosDoCampo.erro}>
          <Icone icone={CircleAlert} />
          {erro}
        </p>
      )}
      {!somenteLeitura && (
        <Botao icone={Plus} onPress={incluir} className={estilos.incluir}>
          Incluir opção
        </Botao>
      )}
    </fieldset>
  );
}
