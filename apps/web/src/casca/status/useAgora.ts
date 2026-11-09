import { useEffect, useState } from 'react';
import { vigiarOMinuto } from './relogio.ts';

/**
 * O momento de agora para as idades da tela, como "Há 3 min": anda na virada do minuto, como o
 * relógio da barra, sem recarregar os dados.
 */
export function useAgora(): Date {
  const [agora, definirAgora] = useState(() => new Date());
  useEffect(() => vigiarOMinuto(() => definirAgora(new Date())), []);
  return agora;
}
