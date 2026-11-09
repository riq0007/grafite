import { LayoutDashboard } from 'lucide-react';
import { definirModulo } from '../tipos.ts';
import { CHAVE_DOS_PAINEIS } from './consultas.ts';
import { rotasDosPaineis } from './rotas.tsx';

/**
 * O módulo Painéis no registro (spec modulo-paineis; change painel-de-dashboards): para quem vê os
 * painéis, a grade; para quem os administra, o cadastro. No celular, em "Mais". O evento
 * `paineis.mudaram` relê a lista, e os painéis que não mudaram de endereço não recarregam.
 */
export const paineis = definirModulo({
  id: 'paineis',
  nome: 'Painéis',
  icone: LayoutDashboard,
  endereco: '/paineis',
  prioridadeNoCelular: 'mais',
  rotas: rotasDosPaineis,
  permissoes: ['paineis.ver', 'paineis.administrar'],
  menu: [
    { rotulo: 'Painéis', destino: '/paineis', permissoes: ['paineis.ver', 'paineis.administrar'] },
    { rotulo: 'Cadastro', destino: '/paineis/cadastro', permissoes: ['paineis.administrar'] },
  ],
  eventos: {
    'paineis.mudaram': () => [CHAVE_DOS_PAINEIS],
  },
});
