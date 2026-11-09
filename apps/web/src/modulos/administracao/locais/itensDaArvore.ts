// Os locais como itens da árvore da biblioteca, com o ícone e o tipo de cada um: a tela dos locais e
// a escolha de um local (spec componentes-base, "Escolha de local em árvore") usam os mesmos.
import { type ArvoreDeLocais, ROTULOS_DOS_TIPOS, type TipoDeLocal } from '@grafite/domain';
import type { ItemDaArvore } from '@grafite/ui';
import {
  Building,
  Building2,
  DoorOpen,
  Layers,
  LayoutGrid,
  type LucideIcon,
  MapPin,
} from 'lucide-react';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';

export const ICONES_DOS_TIPOS_DE_LOCAL: Record<TipoDeLocal, LucideIcon> = {
  unidade: Building2,
  predio: Building,
  andar: Layers,
  setor: LayoutGrid,
  sala: DoorOpen,
  outro: MapPin,
};

export interface OpcoesDosItens {
  /** O texto das contagens de cada local, ao lado do tipo, com "Mostrar contagens". */
  contagens?: ReadonlyMap<string, string>;
  /** Com os inativos, marcados; sem eles, os ramos inativos saem inteiros. */
  comInativos?: boolean;
  /** Os locais que saem, com o que estiver dentro deles, como o ramo do local que se move. */
  excluir?: ReadonlySet<string>;
}

/** Os itens da árvore dentro de um local, ou na raiz. */
export function itensDaArvoreDeLocais(
  arvore: ArvoreDeLocais,
  paiId: string | null,
  { comInativos = false, excluir, contagens }: OpcoesDosItens = {},
): ItemDaArvore[] {
  return arvore
    .filhos(paiId)
    .filter((local) => (comInativos || local.situacao === 'ativo') && !excluir?.has(local.id))
    .map((local) => ({
      id: local.id,
      rotulo: local.nome,
      icone: ICONES_DOS_TIPOS_DE_LOCAL[local.tipo],
      detalhe: [ROTULOS_DOS_TIPOS[local.tipo], contagens?.get(local.id)]
        .filter(Boolean)
        .join(' · '),
      ...(local.situacao === 'inativo' && {
        situacao: SITUACOES_DO_REGISTRO.inativo,
      }),
      filhos: itensDaArvoreDeLocais(arvore, local.id, { comInativos, excluir, contagens }),
    }));
}
