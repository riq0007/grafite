// O "Título do chamado" do construtor do formulário (change chamados-da-ti, design, "O construtor, os
// campos (tarefa 5.22)"; m09): fixo no alto da lista, tracejado, com o cadeado no lugar da alça, o
// selo "Automático" e a frase do título. Aberto, a resposta que dá o título, só dos campos que podem
// dá-lo, e, com ela, "Começar pelo nome do tipo".
import {
  type Formulario,
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO,
  type TituloDoFormulario,
} from '@grafite/domain';
import { Icone, Selecao } from '@grafite/ui';
import { Lock, Type } from 'lucide-react';
import { useId } from 'react';
import { Selo } from '../Pecas.tsx';
import { ChaveDoCampo } from './CampoAberto.tsx';
import estilos from './Construtor.module.css';
import { camposDoTitulo, fraseDoTitulo } from './campos.ts';

/** A escolha de nenhum campo: o título é a primeira resposta de texto, ou o nome do tipo. */
const NENHUMA = ':nenhuma';

export function TituloDoChamado({
  formulario,
  nomeDoTipo,
  aberto,
  aoAbrir,
  aoMudar,
}: {
  formulario: Formulario;
  nomeDoTipo: string;
  aberto: boolean;
  aoAbrir: () => void;
  aoMudar: (titulo: TituloDoFormulario) => void;
}) {
  const id = useId();
  const { titulo } = formulario;
  const escolhas = camposDoTitulo(formulario.campos);
  const escolhido = escolhas.find((campo) => campo.id === titulo.campoId) ?? null;
  return (
    <li className={estilos.lugar}>
      <div className={estilos.cartao} data-titulo="" data-aberto={aberto || undefined}>
        <div className={estilos.linhaDoCampo}>
          <span className={estilos.alca} aria-hidden="true">
            <Icone icone={Lock} tamanho={14} />
          </span>
          <button
            type="button"
            className={estilos.abrir}
            aria-expanded={aberto}
            aria-controls={aberto ? `${id}-titulo` : undefined}
            onClick={aoAbrir}
          >
            <span className={estilos.iconeDoCampo}>
              <Icone icone={Type} tamanho={18} />
            </span>
            <span className={estilos.textosDoCampo}>
              <b>Título do chamado</b>
              <small>{fraseDoTitulo(formulario, nomeDoTipo)}</small>
            </span>
            <Selo selo="automatico" />
          </button>
        </div>
        {aberto && (
          <div id={`${id}-titulo`} className={estilos.propriedades}>
            <Selecao
              rotulo="A resposta que dá o título"
              opcoes={[
                { id: NENHUMA, rotulo: 'Nenhuma: a primeira resposta de texto' },
                ...escolhas.map((campo) => ({
                  id: campo.id,
                  rotulo: campo.rotulo || ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[campo.tipo],
                })),
              ]}
              selectedKey={escolhido?.id ?? NENHUMA}
              onSelectionChange={(chave) =>
                aoMudar({
                  ...titulo,
                  campoId: chave === null || chave === NENHUMA ? null : String(chave),
                })
              }
            />
            {escolhido && (
              <ChaveDoCampo
                titulo="Começar pelo nome do tipo"
                ligada={titulo.comecaPeloTipo}
                aoMudar={(comecaPeloTipo) => aoMudar({ ...titulo, comecaPeloTipo })}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}
