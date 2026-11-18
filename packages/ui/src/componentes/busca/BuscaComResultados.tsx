// A busca com resultados (change chamados-da-ti, design, "O chamado aberto, o cabeçalho"): o campo
// de buscar de um cabeçalho, como o "Buscar nos chamados", sem rótulo à vista, com a lupa e o texto
// de exemplo, que abre embaixo os resultados de uma busca feita por fora, em duas linhas cada um,
// com o primeiro já escolhido. As setas andam pela lista, Enter ou o clique escolhem e limpam o
// campo, e Esc fecha a lista. Buscando, sem resultado e na falha, a lista diz o aviso de quem usa.
import { Search } from 'lucide-react';
import { useContext, useEffect } from 'react';
import {
  ComboBox,
  ComboBoxStateContext,
  Input,
  ListBox,
  ListBoxItem,
  Text,
} from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilosDoCampo from '../campo/Campo.module.css';
import { PainelFlutuante } from '../flutuante/Flutuante.tsx';
import estilos from './BuscaComResultados.module.css';

/** Um resultado: o nome, como "#1042 Impressora manchando", e o detalhe, na linha de baixo. */
export interface ResultadoDaBuscaComResultados {
  id: string;
  rotulo: string;
  detalhe?: string;
}

export interface PropsDaBuscaComResultados {
  /** O que a busca procura ("Buscar nos chamados"): o nome para o leitor de tela e o texto da caixa. */
  rotulo: string;
  termo: string;
  aoMudarTermo: (termo: string) => void;
  /** Os resultados do termo de agora, na ordem da busca. */
  resultados: readonly ResultadoDaBuscaComResultados[];
  /**
   * A linha da lista sem resultados, como "Buscando…", "Nenhum chamado com “impressora”." ou a
   * falha. Sem resultados e sem aviso, a lista fecha.
   */
  aviso: string | null;
  /** O resultado escolhido; o campo se limpa depois. */
  aoEscolher: (id: string) => void;
  className?: string;
}

export function BuscaComResultados({
  rotulo,
  termo,
  aoMudarTermo,
  resultados,
  aviso,
  aoEscolher,
  className,
}: PropsDaBuscaComResultados) {
  return (
    <ComboBox<ResultadoDaBuscaComResultados>
      aria-label={rotulo}
      inputValue={termo}
      onInputChange={aoMudarTermo}
      items={resultados}
      // Nada fica escolhido: o resultado leva a outra tela, e o campo se limpa.
      selectedKey={null}
      onSelectionChange={(chave) => {
        if (chave === null) return;
        aoMudarTermo('');
        aoEscolher(String(chave));
      }}
      allowsCustomValue
      // Sem resultados, a lista só fica aberta com o aviso. Com eles, também: o React Aria monta a
      // coleção nova uma volta depois, e a lista, vazia nessa volta, fecharia.
      allowsEmptyCollection={aviso !== null || resultados.length > 0}
      menuTrigger="input"
      className={[estilos.busca, className].filter(Boolean).join(' ')}
    >
      <div className={estilosDoCampo.busca}>
        <Icone icone={Search} />
        <Input className={estilosDoCampo.entradaDaBusca} placeholder={rotulo} />
      </div>
      <PainelFlutuante placement="bottom start" className={estilos.painel}>
        <ListaDosResultados resultados={resultados} aviso={aviso} />
      </PainelFlutuante>
    </ComboBox>
  );
}

/**
 * A lista dos resultados, com o primeiro já escolhido, para o Enter abri-lo. O React Aria limpa o
 * escolhido quando o texto muda e ignora a chave até montar a coleção nova, uma volta depois; e a
 * lista que abriu vazia, no "Buscando…", escolhe ao receber os primeiros itens o que o foco
 * automático pede, que por ele seria nenhum. Aqui ele pede o primeiro, e o efeito escolhe o primeiro
 * dos resultados que chegam com a lista já aberta.
 */
function ListaDosResultados({
  resultados,
  aviso,
}: {
  resultados: readonly ResultadoDaBuscaComResultados[];
  aviso: string | null;
}) {
  const estado = useContext(ComboBoxStateContext);
  const primeiro = resultados[0]?.id ?? null;
  useEffect(() => {
    if (!estado?.isOpen || primeiro === null) return;
    if (estado.selectionManager.focusedKey === null)
      estado.selectionManager.setFocusedKey(primeiro);
  }, [estado, primeiro]);
  return (
    <ListBox<ResultadoDaBuscaComResultados>
      className={estilos.lista}
      // A seta para cima, que abre a lista no último, segue valendo.
      autoFocus={estado?.focusStrategy ?? 'first'}
      renderEmptyState={() => aviso && <p className={estilos.aviso}>{aviso}</p>}
    >
      {(resultado) => (
        <ListBoxItem id={resultado.id} textValue={resultado.rotulo} className={estilos.resultado}>
          <Text slot="label" className={estilos.rotulo}>
            {resultado.rotulo}
          </Text>
          {resultado.detalhe && (
            <Text slot="description" className={estilos.detalhe}>
              {resultado.detalhe}
            </Text>
          )}
        </ListBoxItem>
      )}
    </ListBox>
  );
}
