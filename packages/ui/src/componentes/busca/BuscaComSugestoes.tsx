import { ChevronDown, Search } from 'lucide-react';
import { useContext, useEffect } from 'react';
import {
  Button,
  ComboBox,
  type ComboBoxProps,
  ComboBoxStateContext,
  Input,
} from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import estilosDoCampo from '../campo/Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from '../campo/partes.tsx';
import { ListaDeOpcoes, Opcao, PainelFlutuante } from '../flutuante/Flutuante.tsx';
import type { OpcaoDeSelecao } from '../selecao/Selecao.tsx';
import estilos from './BuscaComSugestoes.module.css';

/** As opções que o contexto sugere, mostradas antes das outras. */
export interface SugeridasDaBusca {
  /** As chaves das opções sugeridas, na ordem em que aparecem. */
  ids: readonly string[];
  /** De onde vem a sugestão, em texto, como "Do mesmo local do ativo". */
  origem?: string;
}

export interface PropsDaBusca
  extends Omit<
    ComboBoxProps<OpcaoDeSelecao>,
    'children' | 'className' | 'isRequired' | 'isInvalid' | 'items' | 'defaultItems'
  > {
  rotulo: string;
  sugestoes: OpcaoDeSelecao[];
  /**
   * As sugestões vêm de fora, como da API enquanto se digita: a busca as mostra como chegam, sem
   * filtrar de novo nem reordenar. Quem usa acompanha o texto por `onInputChange`.
   */
  sugestoesDeFora?: boolean;
  /** As sugeridas pelo contexto, sob o cabeçalho "Sugeridos", antes das outras. */
  sugeridas?: SugeridasDaBusca;
  /**
   * Com as sugestões de fora, quantas a busca de agora acha na API: com mais do que as mostradas,
   * o painel diz "Digite para buscar entre N".
   */
  total?: number;
  /** As opções já vêm na ordem da tela; sem isso, as não sugeridas vão em ordem alfabética. */
  manterOrdem?: boolean;
  descricao?: string;
  obrigatorio?: boolean;
  /** Erro vindo de fora do campo (da API, por exemplo). */
  erro?: string;
  /**
   * Com texto livre (o padrão), o campo aceita o que foi digitado. Sem ele, só uma das sugestões:
   * um texto que não é de nenhuma volta, ao sair do campo, à que estava escolhida.
   */
  aceitaTextoLivre?: boolean;
  placeholder?: string;
  className?: string;
}

/** Uma opção da lista, com a marca de sugerida. */
interface OpcaoDaBusca extends OpcaoDeSelecao {
  sugerida: boolean;
}

const ordemAlfabetica = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * As opções na ordem do painel: as sugeridas, na ordem da tela, e depois as outras, em ordem
 * alfabética ou na da tela. A lista é uma só, sem seções: as sugeridas se distinguem pelo
 * cabeçalho do painel e pela linha que as separa das outras.
 */
function opcoesDa(
  sugestoes: OpcaoDeSelecao[],
  sugeridas: SugeridasDaBusca | undefined,
  ordenar: boolean,
): OpcaoDaBusca[] {
  const porId = new Map(sugestoes.map((opcao) => [opcao.id, opcao]));
  const primeiras = (sugeridas?.ids ?? []).flatMap((id) => porId.get(id) ?? []);
  const ids = new Set(primeiras.map((opcao) => opcao.id));
  const outras = sugestoes.filter((opcao) => !ids.has(opcao.id));
  if (ordenar) outras.sort((a, b) => ordemAlfabetica.compare(a.rotulo, b.rotulo));
  return [
    ...primeiras.map((opcao) => ({ ...opcao, sugerida: true })),
    ...outras.map((opcao) => ({ ...opcao, sugerida: false })),
  ];
}

/**
 * Busca com sugestões. A lista abre ao clicar no campo, pelo botão ao lado dele e pelas setas, com
 * todas as opções, e se estreita enquanto se digita; o filtro ignora acentos e maiúsculas
 * ("manutencao" encontra "Em manutenção"). Aceita texto livre, se não for pedido o contrário. Com
 * as sugestões vindas de fora, quem as manda já as filtrou e ordenou.
 */
export function BuscaComSugestoes({
  rotulo,
  sugestoes,
  sugestoesDeFora = false,
  sugeridas,
  total,
  manterOrdem = false,
  descricao,
  obrigatorio = false,
  erro,
  aceitaTextoLivre = true,
  placeholder,
  className,
  ...resto
}: PropsDaBusca) {
  const opcoes = opcoesDa(sugestoes, sugeridas, !sugestoesDeFora && !manterOrdem);
  const rodape =
    sugestoesDeFora && total !== undefined && total > opcoes.length
      ? `Digite para buscar entre ${total.toLocaleString('pt-BR')}`
      : null;
  const sugerido = sugeridas?.origem ? `Sugerido: ${sugeridas.origem}` : 'Sugerido';
  return (
    <ComboBox<OpcaoDaBusca>
      {...(resto as Omit<ComboBoxProps<OpcaoDaBusca>, 'children'>)}
      {...(sugestoesDeFora ? { items: opcoes } : { defaultItems: opcoes })}
      allowsCustomValue={aceitaTextoLivre}
      menuTrigger="input"
      isRequired={obrigatorio}
      isInvalid={erro ? true : undefined}
      className={[estilosDoCampo.campo, className].filter(Boolean).join(' ')}
    >
      <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
      <div className={estilos.caixa}>
        <span className={estilos.lupa}>
          <Icone icone={Search} />
        </span>
        <EntradaQueAbre
          className={`${estilosDoCampo.entrada} ${estilos.comLupa} ${estilos.comBotao}`}
          placeholder={placeholder}
          temOpcoes={opcoes.length > 0}
        />
        {/* O nome é "Mostrar as opções de" seguido do rótulo, que o React Aria junta. */}
        <Button className={estilos.abrir} aria-label="Mostrar as opções de">
          <Icone icone={ChevronDown} />
        </Button>
      </div>
      {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
      <ErroDoCampo erro={erro} />
      {sugestoesDeFora && (
        <AbrirQuandoChegarem temOpcoes={opcoes.length > 0} sugestoes={sugestoes} />
      )}
      <PainelFlutuante className={estilos.painel}>
        <CabecalhoDasSugeridas origem={sugeridas?.origem} />
        <ListaDeOpcoes<OpcaoDaBusca>>
          {(opcao) => (
            <Opcao
              id={opcao.id}
              data-sugerida={opcao.sugerida ? '' : undefined}
              descricaoOculta={opcao.sugerida ? sugerido : undefined}
            >
              {opcao.rotulo}
            </Opcao>
          )}
        </ListaDeOpcoes>
        {rodape && <p className={estilos.rodape}>{rodape}</p>}
      </PainelFlutuante>
    </ComboBox>
  );
}

/** O campo, que abre a lista inteira ao ser clicado, se ela tiver o que mostrar. */
function EntradaQueAbre({
  temOpcoes,
  ...props
}: {
  className: string;
  placeholder?: string;
  temOpcoes: boolean;
}) {
  const estado = useContext(ComboBoxStateContext);
  return (
    <Input
      {...props}
      onClick={() => {
        if (estado && !estado.isOpen && temOpcoes) estado.open(null, 'manual');
      }}
    />
  );
}

/**
 * O cabeçalho "Sugeridos", com a origem, quando a lista à vista começa por uma sugerida. Ele é só
 * visual: cada sugerida diz "Sugerido" ao leitor de tela.
 */
function CabecalhoDasSugeridas({ origem }: { origem?: string }) {
  const estado = useContext(ComboBoxStateContext);
  const primeira = estado?.collection.getFirstKey();
  const item = primeira == null ? null : estado?.collection.getItem(primeira);
  if (!(item?.value as OpcaoDaBusca | null | undefined)?.sugerida) return null;
  return (
    <div className={estilos.cabecalho} aria-hidden="true">
      Sugeridos
      {origem && <span className={estilos.origem}>{origem}</span>}
    </div>
  );
}

/**
 * O React Aria abre a lista quando o texto muda e já há sugestões. As que vêm de fora chegam
 * depois da letra: a lista abre quando elas chegam, se o usuário continua no campo e digitou. Com
 * o texto da escolhida, não há o que sugerir: a escolha fechou a lista, e ela não reabre sozinha.
 */
function AbrirQuandoChegarem({
  sugestoes,
  temOpcoes,
}: {
  sugestoes: OpcaoDeSelecao[];
  temOpcoes: boolean;
}) {
  const estado = useContext(ComboBoxStateContext);
  const abrir =
    !!estado &&
    estado.isFocused &&
    !estado.isOpen &&
    temOpcoes &&
    estado.inputValue !== '' &&
    estado.inputValue !== estado.selectedItem?.textValue;
  // biome-ignore lint/correctness/useExhaustiveDependencies: abre só quando chegam sugestões novas.
  useEffect(() => {
    if (abrir) estado?.open(null, 'manual');
  }, [sugestoes]);
  return null;
}
