import { House } from 'lucide-react';
import { definirModulo } from '../tipos.ts';
import { rotasDoInicio } from './rotas.tsx';

export const inicio = definirModulo({
  id: 'inicio',
  nome: 'Início',
  icone: House,
  endereco: '/',
  prioridadeNoCelular: 1,
  rotas: rotasDoInicio,
});
