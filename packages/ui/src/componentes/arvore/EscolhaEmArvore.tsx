// A escolha de um item numa árvore, como um local (spec componentes-base, "Escolha de local em
// árvore"; design do escolhas-a-vista, decisão 3): o campo mostra o caminho do escolhido, e o painel
// que abre ao clicar traz o filtro, o item sugerido pelo contexto e a árvore. Com o filtro, a árvore
// vira a lista dos que casam pelo caminho completo, sem diferenciar acento e maiúsculas.
import { ChevronsUpDown, CircleAlert } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Button, Dialog, DialogTrigger, Input, SearchField } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import estilosDoCampo from '../campo/Campo.module.css';
import { ListaDeOpcoes, Opcao, PainelFlutuante } from '../flutuante/Flutuante.tsx';
import { Arvore, type ItemDaArvore } from './Arvore.tsx';
import estilos from './EscolhaEmArvore.module.css';

export interface PropsDaEscolhaEmArvore {
  rotulo: string;
  /** Os itens que podem ser escolhidos, em árvore. */
  itens: ItemDaArvore[];
  /** O id do escolhido, ou `null`. */
  valor: string | null;
  aoMudar: (id: string) => void;
  aoLimpar?: () => void;
  /** O item provável, no topo do painel, com a origem em texto. */
  sugerido?: { id: string; origem: string } | null;
  /**
   * Os itens que não podem ser escolhidos: na árvore, à vista e apagados, para os de dentro deles
   * serem alcançados; no filtro, fora da lista.
   */
  desabilitados?: ReadonlySet<string>;
  /** O texto do campo sem nada escolhido. */
  placeholder?: string;
  descricao?: string;
  obrigatorio?: boolean;
  /** Erro vindo de fora do campo (da API, por exemplo). */
  erro?: string;
  desabilitado?: boolean;
  className?: string;
}

const SEPARADOR = ' › ';

/** O texto sem acento e em minúsculas, para o filtro. */
const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');

interface NoDoMapa {
  caminho: string;
  ancestrais: string[];
}

/** O caminho e os ancestrais de cada item, pela árvore. */
function mapear(itens: ItemDaArvore[]): Map<string, NoDoMapa> {
  const mapa = new Map<string, NoDoMapa>();
  const visitar = (lista: ItemDaArvore[], acima: string[], caminhoAcima: string[]) => {
    for (const item of lista) {
      const caminho = [...caminhoAcima, item.rotulo];
      mapa.set(item.id, { caminho: caminho.join(SEPARADOR), ancestrais: acima });
      if (item.filhos) visitar(item.filhos, [...acima, item.id], caminho);
    }
  };
  visitar(itens, [], []);
  return mapa;
}

const ordemAlfabetica = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export function EscolhaEmArvore({
  rotulo,
  itens,
  valor,
  aoMudar,
  aoLimpar,
  sugerido,
  desabilitados,
  placeholder = 'Escolha um local',
  descricao,
  obrigatorio = false,
  erro,
  desabilitado = false,
  className,
}: PropsDaEscolhaEmArvore) {
  const [aberto, definirAberto] = useState(false);
  const [filtro, definirFiltro] = useState('');
  const arvore = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const ids = {
    rotulo: useId(),
    valor: useId(),
    descricao: useId(),
    erro: useId(),
  };
  const mapa = useMemo(() => mapear(itens), [itens]);
  const caminhoDoValor = valor ? mapa.get(valor)?.caminho : undefined;
  const termo = semAcento(filtro.trim());
  const achados = useMemo(
    () =>
      termo
        ? [...mapa.entries()]
            .filter(([id, no]) => !desabilitados?.has(id) && semAcento(no.caminho).includes(termo))
            .map(([id, no]) => ({ id, rotulo: no.caminho }))
            .sort((a, b) => ordemAlfabetica.compare(a.rotulo, b.rotulo))
        : [],
    [mapa, termo, desabilitados],
  );
  const caminhoSugerido =
    sugerido && !desabilitados?.has(sugerido.id) ? mapa.get(sugerido.id)?.caminho : undefined;

  const mudarAberto = (abrir: boolean) => {
    definirAberto(abrir);
    if (!abrir) definirFiltro('');
  };
  const escolher = (id: string) => {
    aoMudar(id);
    mudarAberto(false);
  };
  const descritoPor = [descricao && ids.descricao, erro && ids.erro].filter(Boolean).join(' ');

  return (
    <div className={[estilosDoCampo.campo, className].filter(Boolean).join(' ')}>
      <span id={ids.rotulo} className={estilosDoCampo.rotulo}>
        {rotulo}
        {obrigatorio && (
          <span className={estilosDoCampo.obrigatorio} aria-hidden="true">
            obrigatório
          </span>
        )}
      </span>
      <DialogTrigger isOpen={aberto} onOpenChange={mudarAberto}>
        <Button
          className={`${estilosDoCampo.entrada} ${estilos.gatilho}`}
          aria-labelledby={`${ids.rotulo} ${ids.valor}`}
          aria-describedby={descritoPor || undefined}
          data-invalid={erro ? '' : undefined}
          isDisabled={desabilitado}
        >
          <span
            id={ids.valor}
            className={caminhoDoValor ? estilos.valor : `${estilos.valor} ${estilos.vazio}`}
          >
            {caminhoDoValor ?? placeholder}
          </span>
          <span className={estilos.seta}>
            <Icone icone={ChevronsUpDown} />
          </span>
        </Button>
        <PainelFlutuante placement="bottom start" className={estilos.painel}>
          <Dialog aria-labelledby={ids.rotulo} className={estilos.dialogo}>
            <SearchField
              aria-label="Filtrar"
              value={filtro}
              onChange={definirFiltro}
              autoFocus
              onKeyDown={(evento) => {
                // A seta para baixo leva à lista do filtro ou à árvore, onde as setas andam. As
                // outras teclas seguem, como o Esc, que fecha o painel com o filtro vazio.
                if (evento.key !== 'ArrowDown') {
                  evento.continuePropagation();
                  return;
                }
                evento.preventDefault();
                (termo ? lista : arvore).current?.focus();
              }}
              className={estilos.filtro}
            >
              <Input className={estilosDoCampo.entrada} placeholder="Filtrar" />
            </SearchField>
            {valor && aoLimpar && (
              <Botao
                nivel="terciario"
                onPress={() => {
                  aoLimpar();
                  mudarAberto(false);
                }}
              >
                Remover local
              </Botao>
            )}
            {!termo && sugerido && caminhoSugerido && (
              <div className={estilos.secao}>
                <span className={estilos.tituloDaSecao}>Sugerido</span>
                <Button className={estilos.sugerido} onPress={() => escolher(sugerido.id)}>
                  <span className={estilos.caminho}>{caminhoSugerido}</span>
                  <span className={estilos.origem}>Sugerido: {sugerido.origem}</span>
                </Button>
              </div>
            )}
            {termo ? (
              <div className={estilos.rolagem}>
                <ListaDeOpcoes
                  ref={lista}
                  aria-label={`${rotulo}: locais achados`}
                  items={achados}
                  onAction={(id) => escolher(String(id))}
                  renderEmptyState={() => (
                    <p className={estilos.nadaAchado}>Nada com “{filtro.trim()}”.</p>
                  )}
                >
                  {(achado) => <Opcao id={achado.id}>{achado.rotulo}</Opcao>}
                </ListaDeOpcoes>
              </div>
            ) : (
              <div className={estilos.rolagem}>
                <Arvore
                  ref={arvore}
                  rotulo={rotulo}
                  itens={itens}
                  escolhido={valor}
                  aoEscolher={escolher}
                  desabilitados={desabilitados}
                  expandidosNoComeco={valor ? (mapa.get(valor)?.ancestrais ?? []) : []}
                />
              </div>
            )}
          </Dialog>
        </PainelFlutuante>
      </DialogTrigger>
      {descricao && (
        <span id={ids.descricao} className={estilosDoCampo.descricao}>
          {descricao}
        </span>
      )}
      {erro && (
        <span id={ids.erro} className={estilosDoCampo.erro}>
          <Icone icone={CircleAlert} />
          {erro}
        </span>
      )}
    </div>
  );
}
