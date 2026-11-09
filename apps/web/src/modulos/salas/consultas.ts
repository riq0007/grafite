// As consultas do módulo Salas (spec modulo-salas; change salas-de-reuniao, design, decisão 6): o
// cadastro, a agenda do dia, as minhas reservas e os pedidos, sob a chave que o evento
// `salas.mudaram` relê.
import type { components } from '@grafite/api-client';
import { useQuery } from '@tanstack/react-query';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';

export type SalaDeReuniao = components['schemas']['SalaDeReuniao'];
export type ItemDaSala = components['schemas']['ItemDaSala'];
export type ReservaDeSala = components['schemas']['ReservaDeSala'];

/** A chave de tudo das salas. */
export const CHAVE_DAS_SALAS = ['salas'] as const;

export function useCadastroDasSalas() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_SALAS, 'cadastro'],
    queryFn: () => consultar(() => api.GET('/salas'), 'carregar as salas'),
  });
}

/** A agenda do dia dado, do começo ao fim dele no fuso do navegador. */
export function useAgenda(dia: Date) {
  const api = useApi();
  const de = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
  const ate = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
  return useQuery({
    queryKey: [...CHAVE_DAS_SALAS, 'agenda', de.toISOString()],
    queryFn: () =>
      consultar(
        () =>
          api.GET('/salas/agenda', {
            params: { query: { de: de.toISOString(), ate: ate.toISOString() } },
          }),
        'carregar a agenda',
      ),
  });
}

export function useMinhasReservas() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_SALAS, 'minhas'],
    queryFn: () => consultar(() => api.GET('/salas/reservas/minhas'), 'carregar as reservas'),
  });
}

export function usePedidos() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DAS_SALAS, 'pedidos'],
    queryFn: () => consultar(() => api.GET('/salas/reservas/pendentes'), 'carregar os pedidos'),
  });
}

/** A situação da reserva no tom do rótulo. */
export const TOM_DA_RESERVA = {
  pendente: 'atencao',
  aprovada: 'sucesso',
  recusada: 'critico',
  cancelada: 'neutra',
} as const;

/** A hora no fuso do navegador, como "14:00". */
export const hora = (momento: Date) =>
  `${String(momento.getHours()).padStart(2, '0')}:${String(momento.getMinutes()).padStart(2, '0')}`;

/** O dia, como "qua., 29/10". */
export const diaEmTexto = (momento: Date) =>
  momento.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
