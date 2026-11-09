import type { Permissao } from '@grafite/domain';
import { type LucideIcon, Package, Shapes, TextCursorInput } from 'lucide-react';

interface DefinicaoDaSecao {
  id: string;
  nome: string;
  icone: LucideIcon;
  endereco: string;
}

/**
 * As seções do catálogo de ativos (spec catalogo-de-ativos e modulo-ativos), na ordem da lista e
 * do menu do dock. Quem vê o módulo vê todas; as ações de cada tela seguem a permissão dela.
 */
export const SECOES_DO_CATALOGO = [
  { id: 'tipos', nome: 'Tipos', icone: Shapes, endereco: '/gestao/catalogo/tipos' },
  { id: 'campos', nome: 'Campos', icone: TextCursorInput, endereco: '/gestao/catalogo/campos' },
  { id: 'modelos', nome: 'Modelos', icone: Package, endereco: '/gestao/catalogo/modelos' },
] as const satisfies readonly DefinicaoDaSecao[];

/** Quem vê o catálogo: quem cuida dele ou dos modelos. */
export const PERMISSOES_DO_CATALOGO = [
  'catalogo.administrar',
  'modelos.editar',
] as const satisfies readonly Permissao[];
