import { Map as IconeDoMapa } from 'lucide-react';
import { definirModulo } from '../tipos.ts';
import { CHAVE_DO_MAPA, CHAVE_DOS_MARCADORES } from './consultas.ts';
import { rotasDoMapa } from './rotas.tsx';

/**
 * O módulo Mapa no registro (spec mapa-da-planta): para quem vê o mapa, com as plantas e o mapa de
 * cada uma. No celular, em "Mais". O evento `mapa.mudou` relê as plantas e os marcadores; os dos
 * ativos, da disponibilidade e dos alertas relêem os marcadores, que mostram a situação.
 */
export const mapa = definirModulo({
  id: 'mapa',
  nome: 'Mapa',
  icone: IconeDoMapa,
  endereco: '/mapa',
  prioridadeNoCelular: 'mais',
  rotas: rotasDoMapa,
  permissoes: ['mapa.ver', 'mapa.editar'],
  menu: [{ rotulo: 'Plantas', destino: '/mapa' }],
  eventos: {
    'mapa.mudou': () => [CHAVE_DO_MAPA],
    'ativos.mudaram': () => [CHAVE_DOS_MARCADORES],
    'disponibilidade.mudou': () => [CHAVE_DOS_MARCADORES],
    'alertas.mudaram': () => [CHAVE_DOS_MARCADORES],
  },
});
