// As relações nas fichas (spec estrutura-da-casca, "Módulos registrados"; change relacoes-vivas,
// design, decisão 4): a ficha de um registro mostra o que os módulos registram para ele, só os
// ligados e só o que a conta pode ver, sem conhecer os módulos.
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { rootRouteId, useRouteContext } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useApi } from '../api/useApi.tsx';
import { useAcesso } from '../sessao/useAcesso.ts';
import { useServidor } from '../sessao/useSessao.tsx';
import { registroDaConta } from './registroDaConta.ts';
import type { AlvoDaRelacao, RelacaoDoModulo, ResumoDaRelacao } from './tipos.ts';

/** As relações que os módulos ligados registram para o alvo, que a conta pode ver. */
export function useRelacoes(alvo: AlvoDaRelacao): RelacaoDoModulo[] {
  const { modulos } = useRouteContext({ from: rootRouteId });
  const { pode } = useAcesso();
  const desligados = useServidor()?.modulosDesligados;
  return useMemo(
    () =>
      registroDaConta(modulos, pode, desligados).flatMap((modulo) =>
        (modulo.relacoes ?? []).filter((relacao) => relacao.alvo === alvo),
      ),
    [modulos, pode, desligados, alvo],
  );
}

/** As linhas que os módulos põem na ficha do registro, uma por relação. */
export function RelacoesDaFicha({
  alvo,
  id,
  nome,
}: {
  alvo: AlvoDaRelacao;
  id: string;
  /** O nome do registro, para a relação que o mostra, como o rótulo do ativo. */
  nome?: string;
}) {
  const relacoes = useRelacoes(alvo);
  return (
    <>
      {relacoes.map(({ componente: Relacao }, posicao) => (
        // A relação não muda de lugar: a ordem é a do registro.
        // biome-ignore lint/suspicious/noArrayIndexKey: a posição no registro é a identidade.
        <Relacao key={posicao} id={id} nome={nome} />
      ))}
    </>
  );
}

/**
 * O resumo de uma relação no registro do módulo, com o tipo dos dados da consulta dele (change
 * ficha-em-cartoes, design, decisão 3).
 */
export const resumoDaRelacao = <TDados,>(resumo: ResumoDaRelacao<TDados>): ResumoDaRelacao =>
  resumo as unknown as ResumoDaRelacao;

/**
 * As linhas que as relações dão ao cartão da Visão geral, na ordem do registro, sem as vazias. As
 * consultas vão pelo `useQueries`, que aceita a lista mudar de tamanho: as permissões podem mudar
 * com a ficha aberta, e um hook por relação quebraria a ordem dos hooks.
 */
export function useResumos(relacoes: readonly RelacaoDoModulo[], id: string): string[] {
  const api = useApi();
  const consultas = useQueryClient();
  const comResumo = relacoes.flatMap((relacao) => (relacao.resumo ? [relacao.resumo] : []));
  const resultados = useQueries({
    queries: comResumo.map((resumo) => resumo.consulta(id, { api, consultas })),
  });
  return resultados.flatMap((resultado, posicao) => {
    const resumo = comResumo[posicao];
    if (!resumo || resultado.data === undefined) return [];
    const texto = resumo.texto(resultado.data);
    return texto ? [texto] : [];
  });
}

/** Os resumos das relações que os módulos ligados registram para o registro. */
export const useResumosDasRelacoes = (alvo: AlvoDaRelacao, id: string) =>
  useResumos(useRelacoes(alvo), id);
