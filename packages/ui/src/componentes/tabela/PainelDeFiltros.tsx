// O painel de filtros da tabela configurável (spec tabelas-configuraveis, "Filtros pelas colunas";
// change filtros-e-barra-da-tabela, design, decisão 1): à esquerda, as colunas que se filtram, nos
// grupos do painel "Colunas", com a busca sem acento e "Filtrada" em texto; à direita, o editor da
// coluna escolhida, que a tela monta. Os grupos recolhidos, como "Outros tipos", se mostram pelo
// botão, e a busca acha neles também. Na janela estreita, a lista e o editor são duas telas, com
// "Voltar".
import { ChevronLeft } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  type Selection,
  Text,
  useFilter,
} from 'react-aria-components';
import { Botao } from '../botao/Botao.tsx';
import { CampoDeTexto } from '../campo/CampoDeTexto.tsx';
import estilos from './PainelDeFiltros.module.css';

export interface ColunaDoPainelDeFiltros {
  /** O id da coluna. */
  chave: string;
  rotulo: string;
  /** O grupo do painel "Colunas", como "Identificação" ou "Outros tipos". */
  grupo: string;
  /** A coluna já tem um filtro: "Filtrada" em texto. */
  filtrada?: boolean;
}

export interface PropsDoPainelDeFiltros {
  /** As colunas que se filtram, na ordem dos grupos e, dentro de cada grupo, na ordem dele. */
  colunas: readonly ColunaDoPainelDeFiltros[];
  /** A coluna cujo editor está aberto; sem ela, o painel pede para escolher uma. */
  escolhida: string | null;
  /** Escolhe outra coluna, ou volta à lista, com `null`, na janela estreita. */
  aoEscolher: (chave: string | null) => void;
  /** O editor do filtro da coluna escolhida. */
  editor: ReactNode;
  /** Os grupos que abrem recolhidos, como "Outros tipos". */
  recolhidos?: readonly string[];
  /** A janela estreita: a lista e o editor em duas telas do mesmo painel. */
  estreito?: boolean;
}

export function PainelDeFiltros({
  colunas,
  escolhida,
  aoEscolher,
  editor,
  recolhidos = [],
  estreito = false,
}: PropsDoPainelDeFiltros) {
  const [busca, definirBusca] = useState('');
  const [abertos, definirAbertos] = useState<ReadonlySet<string>>(() => new Set());
  const { contains } = useFilter({ sensitivity: 'base' });
  const buscando = busca.trim() !== '';
  // Buscando, os grupos recolhidos também valem: a coluna procurada aparece onde estiver.
  const fechado = (grupo: string) => !buscando && recolhidos.includes(grupo) && !abertos.has(grupo);
  const encontradas = colunas.filter(
    (coluna) => !buscando || contains(coluna.rotulo, busca.trim()),
  );
  const nomesDosGrupos = [...new Set(encontradas.map((coluna) => coluna.grupo))];
  const grupos = nomesDosGrupos
    .filter((grupo) => !fechado(grupo))
    .map((grupo) => ({
      grupo,
      colunas: encontradas.filter((coluna) => coluna.grupo === grupo),
    }));
  const recolhiveis = buscando
    ? []
    : recolhidos.filter((grupo) => colunas.some((coluna) => coluna.grupo === grupo));
  const alternar = (grupo: string) =>
    definirAbertos((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(grupo)) novos.delete(grupo);
      else novos.add(grupo);
      return novos;
    });
  const escolher = (chaves: Selection) => {
    if (chaves === 'all') return;
    const [chave] = [...chaves];
    if (chave !== undefined) aoEscolher(String(chave));
  };

  const lista = (
    <section className={estilos.lista} aria-label="Colunas">
      <CampoDeTexto type="search" rotulo="Buscar colunas" value={busca} onChange={definirBusca} />
      {grupos.length === 0 ? (
        <p className={estilos.vazio} role="status">
          Nenhuma coluna com “{busca.trim()}”.
        </p>
      ) : (
        <ListBox
          aria-label="Colunas que se filtram"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={escolhida ? [escolhida] : []}
          onSelectionChange={escolher}
          className={estilos.colunas}
        >
          {grupos.map(({ grupo, colunas: doGrupo }) => (
            <ListBoxSection key={grupo} id={`grupo:${grupo}`} className={estilos.grupo}>
              <Header className={estilos.nomeDoGrupo}>{grupo}</Header>
              {doGrupo.map((coluna) => (
                <ListBoxItem
                  key={coluna.chave}
                  id={coluna.chave}
                  textValue={coluna.rotulo}
                  className={estilos.coluna}
                >
                  <Text slot="label" className={estilos.rotulo}>
                    {coluna.rotulo}
                  </Text>
                  {coluna.filtrada && (
                    <Text slot="description" className={estilos.filtrada}>
                      Filtrada
                    </Text>
                  )}
                </ListBoxItem>
              ))}
            </ListBoxSection>
          ))}
        </ListBox>
      )}
      {recolhiveis.map((grupo) => (
        <Botao key={grupo} nivel="terciario" onPress={() => alternar(grupo)}>
          {abertos.has(grupo)
            ? `Esconder ${grupo}`
            : `Mostrar ${grupo} (${colunas.filter((coluna) => coluna.grupo === grupo).length})`}
        </Botao>
      ))}
    </section>
  );

  if (estreito) {
    return (
      <div className={estilos.painel} data-estreito="">
        {escolhida ? (
          <section className={estilos.editor} aria-label="Filtro">
            <Botao nivel="terciario" icone={ChevronLeft} onPress={() => aoEscolher(null)}>
              Voltar
            </Botao>
            {editor}
          </section>
        ) : (
          lista
        )}
      </div>
    );
  }
  return (
    <div className={estilos.painel}>
      {lista}
      <section className={estilos.editor} aria-label="Filtro">
        {escolhida ? editor : <p className={estilos.vazio}>Escolha uma coluna para filtrar.</p>}
      </section>
    </div>
  );
}
