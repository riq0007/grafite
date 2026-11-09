// As consultas dos backups do Control iD na web (spec backup-do-control-id; change
// p5a-backup-do-control-id, design, decisão 10): o histórico do controle na ficha, a lista da tela
// "Backups do Control iD" e o conteúdo de um backup pelas abas, todos debaixo da chave que o evento
// `controlid.mudaram` invalida.
import type { components } from '@grafite/api-client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { consultar, itensDasPaginas, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';

export type BackupDoControlId = components['schemas']['BackupDoControlId'];
export type SituacaoDoBackup = BackupDoControlId['situacao'];
export type AbaDoConteudo = components['schemas']['ConteudoDoBackup']['aba'];

/** A chave de tudo dos backups, que o evento `controlid.mudaram` invalida. */
export const CHAVE_DOS_BACKUPS = ['backups-do-control-id'] as const;

/** O histórico do controle na ficha, com o horário do tipo e se a conta pode pedir. */
export function useBackupsDoControle(ativoId: string, ligado = true) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DOS_BACKUPS, 'controle', ativoId],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/backups-do-control-id', { params: { path: { id: ativoId } } }),
        'carregar os backups do controle',
      ),
    enabled: ligado,
    // O backup na fila ou em andamento muda sozinho: o evento avisa, e a releitura cobre a perda.
    refetchInterval: 30_000,
  });
}

/** A lista da tela dos backups, com o filtro da situação. */
export function useBackups(situacao: SituacaoDoBackup | null) {
  const api = useApi();
  const consulta = useInfiniteQuery({
    queryKey: [...CHAVE_DOS_BACKUPS, 'lista', situacao],
    ...paginar(
      (cursor) =>
        api.GET('/controlid/backups', {
          params: { query: { cursor, limite: 50, ...(situacao ? { situacao } : {}) } },
        }),
      'carregar os backups',
    ),
  });
  return {
    ...consulta,
    itens: itensDasPaginas(consulta.data),
    podeFazer: consulta.data?.pages[0]?.podeFazer ?? false,
  };
}

/** O conteúdo do backup numa aba, com a busca e o "Carregar mais". */
export function useConteudoDoBackup(backupId: string, aba: AbaDoConteudo, busca: string) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...CHAVE_DOS_BACKUPS, 'conteudo', backupId, aba, busca],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      consultar(
        () =>
          api.GET('/controlid/backups/{id}/conteudo', {
            params: {
              path: { id: backupId },
              query: { aba, ...(busca ? { busca } : {}), cursor: pageParam },
            },
          }),
        'carregar o conteúdo do backup',
      ),
    getNextPageParam: (ultima) => ultima.proximo ?? undefined,
  });
}

/** O endereço do ZIP para baixar. */
export const enderecoDoZip = (backupId: string) => `/api/controlid/backups/${backupId}/arquivo`;

/** O endereço da foto de uma pessoa no backup. */
export const enderecoDaFoto = (backupId: string, usuario: string) =>
  `/api/controlid/backups/${backupId}/fotos/${usuario}`;

/** O tamanho em KB ou MB, com uma casa. */
export function tamanhoLegivel(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// As operações e o comparador (change p5b-comparacao-e-restauracao).

export type OperacaoDoControlId = components['schemas']['OperacaoDoControlId'];
export type ComparacaoDeBackups = components['schemas']['ComparacaoDeBackups'];

/** As operações recentes do controle, com o que a conta pode pedir nele. */
export function useOperacoesDoControle(ativoId: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DOS_BACKUPS, 'operacoes', ativoId],
    queryFn: () =>
      consultar(
        () =>
          api.GET('/ativos/{id}/operacoes-do-control-id', { params: { path: { id: ativoId } } }),
        'carregar as operações do controle',
      ),
    refetchInterval: 30_000,
  });
}

/** Os controles com o backup ligado, para o destino da restauração. */
export function useControles() {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DOS_BACKUPS, 'controles'],
    queryFn: () => consultar(() => api.GET('/controlid/controles'), 'carregar os controles'),
  });
}

/**
 * O resumo dos backups por controle (change suprimentos-rostos-e-backups, design, decisão 6): de um
 * controle, na ficha, ou de todos os que a conta vê, na tela dos backups.
 */
export function useResumoDosBackups(ativo?: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...CHAVE_DOS_BACKUPS, 'resumo', ativo ?? 'todos'],
    queryFn: () =>
      consultar(
        () =>
          api.GET('/controlid/backups/resumo', {
            params: { query: ativo ? { ativo } : {} },
          }),
        'carregar o resumo dos backups',
      ),
  });
}
