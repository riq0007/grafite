// A prévia do ativo na tabela (spec cadastro-de-ativos e quick-look): o nome, com o tipo e o modelo
// abaixo, a imagem do ativo, a do modelo ou o ícone do tipo, os campos principais e, depois deles,
// as outras colunas à vista da tabela, na ordem dela, e "Abrir", também pelo Enter. O restrito
// segue a coluna, e a página seguinte mostra o esqueleto até chegar.
import { COLUNA_PRINCIPAL_DOS_ATIVOS, type ColunaDosAtivos } from '@grafite/domain';
import { type CampoDaPrevia, type ControleDaPrevia, type DataHora, QuickLook } from '@grafite/ui';
import { imagensDoAtivo } from '../cadastro/imagens.ts';
import type { AtivoNaLista } from '../consultas.ts';
import {
  foraDoAcesso,
  type ReferenciasDaLista,
  referenciaNaColuna,
  textoDaCelula,
} from './celulas.tsx';

/** Os campos principais da prévia, nesta ordem, antes das outras colunas da tabela. */
export const CAMPOS_PRINCIPAIS = [
  'ativo.tipo',
  'ativo.modelo',
  'ativo.patrimonio',
  'ativo.serie',
  'ativo.hostname',
  'ativo.situacao',
  'ativo.local',
  'ativo.responsavel',
] as const;

export interface PropsDaPreviaDoAtivo {
  previa: ControleDaPrevia<AtivoNaLista>;
  /** As colunas da tabela, pela chave, para os campos principais. */
  colunas: ReadonlyMap<string, ColunaDosAtivos>;
  /** As colunas à vista, na ordem da tabela. */
  aVista: readonly ColunaDosAtivos[];
  referencias: ReferenciasDaLista;
  dataHora: DataHora;
  aoAbrir: (id: string) => void;
}

/** Os campos da prévia: os principais e as outras colunas à vista, com "—" no vazio. */
export function camposDaPrevia(
  ativo: AtivoNaLista,
  { colunas, aVista, referencias, dataHora }: Omit<PropsDaPreviaDoAtivo, 'previa' | 'aoAbrir'>,
): CampoDaPrevia[] {
  const principais = CAMPOS_PRINCIPAIS.flatMap((chave) => {
    const coluna = colunas.get(chave);
    return coluna ? [coluna] : [];
  });
  const outras = aVista.filter(
    (coluna) =>
      coluna.chave !== COLUNA_PRINCIPAL_DOS_ATIVOS &&
      !(CAMPOS_PRINCIPAIS as readonly string[]).includes(coluna.chave),
  );
  return [...principais, ...outras].map((coluna) => {
    // O tipo, o modelo, o local e o responsável são referências com cartão.
    const referencia = foraDoAcesso(coluna, ativo)
      ? undefined
      : referenciaNaColuna(coluna.chave, ativo);
    return {
      rotulo: coluna.rotulo,
      valor: foraDoAcesso(coluna, ativo)
        ? 'Fora do seu acesso'
        : (textoDaCelula(coluna, ativo, referencias, dataHora) ?? '—'),
      mono: coluna.mono,
      ...(referencia ? { conteudo: referencia } : {}),
    };
  });
}

export function PreviaDoAtivo({ previa, aoAbrir, ...resto }: PropsDaPreviaDoAtivo) {
  const ativo = previa.item;
  if (!ativo) return null;
  const modelo = ativo.modelo ? `${ativo.modelo.fabricante} ${ativo.modelo.nome}` : null;
  return (
    <QuickLook
      aberta={previa.aberta}
      aoFechar={previa.aoFechar}
      titulo={previa.carregando ? 'Carregando' : ativo.rotulo}
      subtitulo={
        previa.carregando ? undefined : [ativo.tipo.nome, modelo].filter(Boolean).join(' · ')
      }
      posicao={previa.posicao}
      total={previa.total}
      visual={{ tipo: ativo.tipo.icone, ...imagensDoAtivo(ativo, 512) }}
      estado={previa.carregando ? 'carregando' : 'pronto'}
      campos={camposDaPrevia(ativo, resto)}
      acoes={[
        { id: 'abrir', rotulo: 'Abrir', principal: true, aoEscolher: () => aoAbrir(ativo.id) },
      ]}
      aoAnterior={previa.aoAnterior}
      aoSeguinte={previa.aoSeguinte}
    />
  );
}
