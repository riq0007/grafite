import { CalendarDays, CalendarPlus } from 'lucide-react';
import type { ContextoDaAcao } from '../../busca/tipos.ts';
import { definirModulo } from '../tipos.ts';
import { CHAVE_DAS_SALAS } from './consultas.ts';
import { rotasDasSalas } from './rotas.tsx';

/**
 * O módulo Salas no registro (spec modulo-salas; change salas-de-reuniao): para quem vê as salas,
 * com a Agenda e as Minhas reservas; para quem administra, os Pedidos e o Cadastro. No celular, em
 * "Mais". Na busca, "Nova reserva". O evento `salas.mudaram` relê todas as telas das salas.
 */
export const salas = definirModulo({
  id: 'salas',
  nome: 'Salas',
  icone: CalendarDays,
  endereco: '/salas',
  prioridadeNoCelular: 'mais',
  rotas: rotasDasSalas,
  permissoes: ['salas.ver', 'salas.administrar'],
  menu: [
    { rotulo: 'Agenda', destino: '/salas', permissoes: ['salas.ver', 'salas.administrar'] },
    {
      rotulo: 'Minhas reservas',
      destino: '/salas/minhas',
      permissoes: ['salas.ver', 'salas.administrar'],
    },
    { rotulo: 'Pedidos', destino: '/salas/pedidos', permissoes: ['salas.administrar'] },
    { rotulo: 'Cadastro', destino: '/salas/cadastro', permissoes: ['salas.administrar'] },
  ],
  busca: {
    entradas: [
      {
        id: 'nova-reserva',
        rotulo: 'Nova reserva',
        grupo: 'acoes',
        caminho: 'Salas',
        palavrasChave: ['reserva', 'sala', 'reuniao', 'agendar'],
        icone: CalendarPlus,
        executar: ({ navegar }: ContextoDaAcao) => navegar('/salas?nova=1'),
        permissoes: ['salas.ver', 'salas.administrar'],
      },
    ],
  },
  eventos: {
    'salas.mudaram': () => [CHAVE_DAS_SALAS],
  },
});
