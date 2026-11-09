// O painel "Colunas" da tabela configurável (spec tabelas-configuraveis): as colunas disponíveis nos
// grupos, com a busca e a marca de cada uma, e as colunas à vista na ordem da tabela, que se
// reordenam pelos botões, pelo arraste do mouse e pelo arraste do teclado. A coluna principal fica
// sempre à vista e em primeiro lugar. Os grupos recolhidos, como "Outros tipos", se mostram pelo botão,
// e a busca acha neles também (change filtros-e-barra-da-tabela, design, decisão 4).
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  DropIndicator,
  GridList,
  GridListItem,
  useDragAndDrop,
  useFilter,
} from 'react-aria-components';
import { BotaoDeIcone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import { CampoDeTexto } from '../campo/CampoDeTexto.tsx';
import { Checkbox, GrupoDeCheckboxes } from '../escolhas/Checkbox.tsx';
import estilos from './PainelDeColunas.module.css';

export interface ColunaDoPainel {
  /** O id da coluna. */
  chave: string;
  rotulo: string;
  /** O grupo do painel, como "Identificação" ou "Inventário de hardware". */
  grupo: string;
  /** A coluna que nomeia a linha: sempre à vista e em primeiro lugar. */
  principal?: boolean;
}

export interface PropsDoPainelDeColunas {
  /** As colunas disponíveis, na ordem dos grupos e, dentro de cada grupo, na ordem dele. */
  colunas: readonly ColunaDoPainel[];
  /** As colunas à vista, pela chave, na ordem da tabela. */
  aVista: readonly string[];
  /** As colunas à vista novas, com a principal em primeiro lugar. */
  aoMudar: (aVista: string[]) => void;
  /** Os grupos que abrem recolhidos, como "Outros tipos". */
  recolhidos?: readonly string[];
}

type BotaoDeMover = 'cima' | 'baixo';

export function PainelDeColunas({
  colunas,
  aVista,
  aoMudar,
  recolhidos = [],
}: PropsDoPainelDeColunas) {
  const [busca, definirBusca] = useState('');
  const [abertos, definirAbertos] = useState<ReadonlySet<string>>(() => new Set());
  const { contains } = useFilter({ sensitivity: 'base' });
  const idDisponiveis = useId();
  const idAVista = useId();
  const porChave = new Map(colunas.map((coluna) => [coluna.chave, coluna]));
  const principal = colunas.find((coluna) => coluna.principal);
  const inicio = principal ? [principal.chave] : [];
  // As colunas à vista que se movem: as conhecidas, sem a principal, na ordem da tabela.
  const moveis = aVista.filter((chave) => chave !== principal?.chave && porChave.has(chave));
  const mudarMoveis = (novas: string[]) => aoMudar([...inicio, ...novas]);

  // Depois de mover, o foco fica no botão da coluna movida, ou no outro, se ele parou de valer. O
  // React Aria redesenha as linhas depois de montar a coleção nova: o foco espera o quadro seguinte.
  const lista = useRef<HTMLDivElement>(null);
  const focarDepois = useRef<{ chave: string; botao: BotaoDeMover } | null>(null);
  useEffect(() => {
    const pedido = focarDepois.current;
    if (!pedido) return;
    const quadro = requestAnimationFrame(() => {
      focarDepois.current = null;
      const linha = lista.current?.querySelector(
        `[role="row"][data-key="${CSS.escape(pedido.chave)}"]`,
      );
      const botao = (nome: BotaoDeMover) =>
        linha?.querySelector<HTMLButtonElement>(`[data-mover="${nome}"]:not([disabled])`);
      (botao(pedido.botao) ?? botao(pedido.botao === 'cima' ? 'baixo' : 'cima'))?.focus();
    });
    return () => cancelAnimationFrame(quadro);
  });
  const mover = (chave: string, botao: BotaoDeMover) => {
    const de = moveis.indexOf(chave);
    const para = de + (botao === 'cima' ? -1 : 1);
    if (de < 0 || para < 0 || para >= moveis.length) return;
    const novas = [...moveis];
    novas.splice(de, 1);
    novas.splice(para, 0, chave);
    focarDepois.current = { chave, botao };
    mudarMoveis(novas);
  };

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (chaves) =>
      [...chaves].map((chave) => ({ 'text/plain': porChave.get(String(chave))?.rotulo ?? '' })),
    onReorder: ({ keys, target }) => {
      const movidas = [...keys].map(String);
      const resto = moveis.filter((chave) => !movidas.includes(chave));
      const alvo = resto.indexOf(String(target.key));
      if (alvo < 0) return;
      resto.splice(target.dropPosition === 'before' ? alvo : alvo + 1, 0, ...movidas);
      mudarMoveis(resto);
    },
    renderDropIndicator: (alvo) => <DropIndicator target={alvo} className={estilos.indicador} />,
  });

  // A marca de uma coluna: a marcada entra no fim das colunas à vista, e a desmarcada sai.
  const marcar = (chave: string, marcada: boolean) =>
    mudarMoveis(
      marcada
        ? [...moveis.filter((outra) => outra !== chave), chave]
        : moveis.filter((outra) => outra !== chave),
    );
  const encontradas = colunas.filter((coluna) => busca === '' || contains(coluna.rotulo, busca));
  // Buscando, os grupos recolhidos também valem: a coluna procurada aparece onde estiver.
  const fechado = (grupo: string) =>
    busca === '' && recolhidos.includes(grupo) && !abertos.has(grupo);
  const grupos = [...new Set(encontradas.map((coluna) => coluna.grupo))]
    .filter((grupo) => !fechado(grupo))
    .map((grupo) => ({
      grupo,
      colunas: encontradas.filter((coluna) => coluna.grupo === grupo),
    }));
  const recolhiveis =
    busca === ''
      ? recolhidos.filter((grupo) => colunas.some((coluna) => coluna.grupo === grupo))
      : [];
  const alternar = (grupo: string) =>
    definirAbertos((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(grupo)) novos.delete(grupo);
      else novos.add(grupo);
      return novos;
    });

  return (
    <div className={estilos.painel}>
      <section className={estilos.secao} aria-labelledby={idDisponiveis}>
        <span id={idDisponiveis} className={estilos.titulo}>
          Colunas disponíveis
        </span>
        <CampoDeTexto type="search" rotulo="Buscar colunas" value={busca} onChange={definirBusca} />
        <div className={estilos.grupos}>
          {grupos.map(({ grupo, colunas: doGrupo }) => (
            <GrupoDeCheckboxes
              key={grupo}
              rotulo={grupo}
              value={doGrupo
                .filter((coluna) => coluna.principal || moveis.includes(coluna.chave))
                .map((coluna) => coluna.chave)}
              onChange={(marcadas) => {
                const mudou = doGrupo.find(
                  (coluna) =>
                    !coluna.principal &&
                    marcadas.includes(coluna.chave) !== moveis.includes(coluna.chave),
                );
                if (mudou) marcar(mudou.chave, marcadas.includes(mudou.chave));
              }}
            >
              {doGrupo.map((coluna) => (
                <Checkbox key={coluna.chave} value={coluna.chave} isDisabled={coluna.principal}>
                  {coluna.rotulo}
                  {coluna.principal && <span className={estilos.fixa}>Sempre à vista</span>}
                </Checkbox>
              ))}
            </GrupoDeCheckboxes>
          ))}
          {grupos.length === 0 && recolhiveis.length === 0 && (
            <p className={estilos.vazio} role="status">
              Nenhuma coluna com “{busca}”.
            </p>
          )}
          {recolhiveis.map((grupo) => (
            <Botao key={grupo} nivel="terciario" onPress={() => alternar(grupo)}>
              {abertos.has(grupo)
                ? `Esconder ${grupo}`
                : `Mostrar ${grupo} (${colunas.filter((coluna) => coluna.grupo === grupo).length})`}
            </Botao>
          ))}
        </div>
      </section>
      <section className={estilos.secao} aria-labelledby={idAVista}>
        <span id={idAVista} className={estilos.titulo}>
          Colunas à vista
        </span>
        <div className={estilos.ordem}>
          {principal && (
            <div className={estilos.principal} data-principal="" data-coluna={principal.chave}>
              <span className={estilos.rotulo}>{principal.rotulo}</span>
              <span className={estilos.fixa}>Sempre à vista, em primeiro lugar</span>
            </div>
          )}
          <GridList
            ref={lista}
            aria-labelledby={idAVista}
            items={moveis.map((chave) => ({
              id: chave,
              coluna: porChave.get(chave) as ColunaDoPainel,
            }))}
            dragAndDropHooks={dragAndDropHooks}
            renderEmptyState={() => (
              <span className={estilos.vazio}>Nenhuma outra coluna à vista.</span>
            )}
            className={estilos.lista}
          >
            {({ id, coluna }) => {
              const posicao = moveis.indexOf(id);
              return (
                <GridListItem id={id} textValue={coluna.rotulo} className={estilos.item}>
                  <BotaoDeIcone
                    slot="drag"
                    icone={GripVertical}
                    rotulo={`Arrastar ${coluna.rotulo}`}
                    comDica={false}
                    className={estilos.alca}
                  />
                  <span className={estilos.rotulo}>{coluna.rotulo}</span>
                  <BotaoDeIcone
                    icone={ArrowUp}
                    rotulo={`Mover ${coluna.rotulo} para cima`}
                    isDisabled={posicao === 0}
                    onPress={() => mover(id, 'cima')}
                    data-mover="cima"
                  />
                  <BotaoDeIcone
                    icone={ArrowDown}
                    rotulo={`Mover ${coluna.rotulo} para baixo`}
                    isDisabled={posicao === moveis.length - 1}
                    onPress={() => mover(id, 'baixo')}
                    data-mover="baixo"
                  />
                </GridListItem>
              );
            }}
          </GridList>
        </div>
      </section>
    </div>
  );
}
