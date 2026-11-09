// A linha de estado da visão, sob a barra da tabela (spec visoes-de-tabela, "Tabela alterada";
// design do visoes-da-conta, decisão 4): na visão personalizada, o que a conta mudou, que fica
// guardado só para ela, com "Restaurar a visão" e "Salvar como nova visão…" à vista; na tabela de
// um link, de onde ela veio e "Voltar à minha tabela". Na visão salva, a linha some.
import { Group } from 'react-aria-components';
import { Botao } from '../botao/Botao.tsx';
import type { EstadoDaEscolhaDaVisao } from './EscolhaDaVisao.tsx';
import estilos from './LinhaDaVisao.module.css';

/** As partes da tabela que a linha nomeia: as colunas, com a largura, a ordenação e os filtros. */
export type ParteMudadaDaVisao = 'colunas' | 'ordem' | 'filtros';

const NOMES_DAS_PARTES = {
  colunas: 'as colunas',
  ordem: 'a ordem',
  filtros: 'os filtros',
} as const satisfies Record<ParteMudadaDaVisao, string>;

const LISTA = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

export interface PropsDaLinhaDaVisao {
  estado: EstadoDaEscolhaDaVisao;
  /** O que a conta mudou sobre a visão salva, na personalizada. */
  mudou?: readonly ParteMudadaDaVisao[];
  aoRestaurar: () => void;
  aoSalvarComoNova: () => void;
  aoVoltar: () => void;
}

/** "Você mudou as colunas e a ordem.", com as partes na ordem da tabela. */
function oQueMudou(mudou: readonly ParteMudadaDaVisao[] | undefined) {
  if (!mudou || mudou.length === 0) return 'Você mudou esta visão.';
  return `Você mudou ${LISTA.format(mudou.map((parte) => NOMES_DAS_PARTES[parte]))}.`;
}

export function LinhaDaVisao({
  estado,
  mudou,
  aoRestaurar,
  aoSalvarComoNova,
  aoVoltar,
}: PropsDaLinhaDaVisao) {
  if (estado === 'salva') return null;
  return (
    <Group aria-label="Estado da visão" className={estilos.linha}>
      {estado === 'personalizada' ? (
        <>
          <p className={estilos.texto}>{oQueMudou(mudou)} As mudanças ficam guardadas para você.</p>
          <Botao nivel="terciario" onPress={aoRestaurar}>
            Restaurar a visão
          </Botao>
          <Botao nivel="terciario" onPress={aoSalvarComoNova}>
            Salvar como nova visão…
          </Botao>
        </>
      ) : (
        <>
          <p className={estilos.texto}>Esta tabela veio de um link.</p>
          <Botao nivel="terciario" onPress={aoVoltar}>
            Voltar à minha tabela
          </Botao>
        </>
      )}
    </Group>
  );
}
