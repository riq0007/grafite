// O que o formulário que se preenche pede à API (change chamados-da-ti, design, decisão 21): as
// sugestões dos campos Ativo e Local pela pessoa e a busca da pessoa pelo nome, cada uma pela rota
// de quem preenche. A gaveta e o chamado pedem com `chamados.atender`; a prévia, com
// `chamados.configurar`. As duas rotas dão o mesmo.
import type { components } from '@grafite/api-client';
import { queryOptions } from '@tanstack/react-query';
import type { ClienteDaApi } from '../../../api/cliente.ts';
import { consultar } from '../../../api/consultas.ts';
import type { QuemPreenche } from './estado.ts';

export type SugestoesDoChamado = components['schemas']['SugestoesDoChamado'];
export type PessoasNaBuscaDosChamados = components['schemas']['PessoasNaBuscaDosChamados'];

/** A pessoa do chamado, de quem vêm as sugestões. */
export interface PessoaDoFormulario {
  id: string;
  nome: string;
}

const daPrevia = (quem: QuemPreenche) => quem === 'pessoa';

/** As sugestões valem por um minuto: o texto que muda no campo Ativo não as pede de novo. */
const VALIDADE_DAS_SUGESTOES = 60_000;

/**
 * As sugestões para a pessoa, só dos tipos de ativo do campo; sem tipos, de todos. O Local e o
 * Ativo sem tipos dividem a mesma consulta.
 */
export function opcoesDasSugestoes(
  api: ClienteDaApi,
  quem: QuemPreenche,
  pessoa: string,
  tipos: readonly string[],
) {
  const juntos = tipos.join(',');
  const query = { pessoa, ...(juntos !== '' && { tipos: juntos }) };
  return queryOptions({
    queryKey: ['chamados', 'sugestoes', daPrevia(quem) ? 'previa' : 'chamado', pessoa, juntos],
    staleTime: VALIDADE_DAS_SUGESTOES,
    queryFn: ({ signal }) =>
      daPrevia(quem)
        ? consultar(
            () => api.GET('/chamados/tipos/sugestoes', { params: { query }, signal }),
            'buscar as sugestões',
          )
        : consultar(
            () => api.GET('/chamados/sugestoes', { params: { query }, signal }),
            'buscar as sugestões',
          ),
  });
}

/** As pessoas pelo nome, com o local de cada uma; sem o texto, nenhuma, porque a API pede o nome. */
export async function buscarPessoas(
  api: ClienteDaApi,
  quem: QuemPreenche,
  busca: string,
  sinal: AbortSignal,
): Promise<PessoasNaBuscaDosChamados> {
  if (busca.trim() === '') return { itens: [], total: 0 };
  const params = { query: { busca } };
  return daPrevia(quem)
    ? consultar(
        () => api.GET('/chamados/tipos/pessoas', { params, signal: sinal }),
        'buscar as pessoas',
      )
    : consultar(() => api.GET('/chamados/pessoas', { params, signal: sinal }), 'buscar as pessoas');
}
