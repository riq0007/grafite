// A busca do ativo de um chamado (change chamados-da-ti, design, decisão 21, e "A coluna da
// direita, a pessoa e o ativo (tarefa 5.13)"): o campo Ativo do formulário e o "Trocar o ativo" do
// chamado aberto escolhem do mesmo jeito. Sem nada digitado, os ativos sugeridos pela pessoa, sob a
// origem; com o texto, a busca entre os ativos que a conta vê, só dos tipos dados, com as sugeridas
// no alto. Sem a pessoa, ou sem sugestão, a lista abre com os primeiros ativos. Com os filtros de
// "Mais opções de busca" (tarefa 5.30), cada ativo achado traz o tipo, o local e o responsável, e um
// filtro escolhido troca as sugestões pelos ativos que passam nele.
import type { AtivoDasRespostas, FiltroDaVisao } from '@grafite/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useApi } from '../../../api/useApi.tsx';
import type { ResultadoDoSeletor } from '../../administracao/seletores/SeletorDeConta.tsx';
import { opcoesDasSugestoes, type PessoaDoFormulario } from './buscas.ts';
import { origemDasSugestoes, type QuemPreenche, rotuloDoAtivoCitado } from './estado.ts';

export interface BuscaDoAtivo {
  buscar: (texto: string, sinal: AbortSignal) => Promise<ResultadoDoSeletor>;
  /** O nome e o patrimônio de cada ativo que a lista mostrou, para citar o escolhido. */
  vistos: ReadonlyMap<string, AtivoDasRespostas>;
}

/** Os filtros de "Mais opções de busca": os ids do tipo, do local (com os de dentro) e da pessoa. */
export interface FiltrosDaBuscaDoAtivo {
  tipo: string | null;
  local: string | null;
  responsavel: string | null;
}

/** O que distingue os ativos parecidos, como "Impressora · Matriz › Financeiro · Marina Rocha". */
function detalheDoAtivo(ativo: {
  tipo: { nome: string };
  local: { caminho: string } | null;
  responsavel: { nome: string } | null;
}): string {
  return [ativo.tipo.nome, ativo.local?.caminho, ativo.responsavel?.nome]
    .filter(Boolean)
    .join(' · ');
}

export function useBuscaDoAtivo({
  quem,
  pessoa,
  tipos,
  filtros,
}: {
  quem: QuemPreenche;
  pessoa: PessoaDoFormulario | null;
  /** Os tipos de ativo que valem; vazio, todos. */
  tipos: readonly string[];
  /**
   * Os filtros de "Mais opções de busca": com eles, mesmo sem nenhum escolhido, cada ativo achado
   * traz o detalhe embaixo do nome. Sem eles, como no formulário, a lista fica numa linha só.
   */
  filtros?: FiltrosDaBuscaDoAtivo;
}): BuscaDoAtivo {
  const api = useApi();
  const consultas = useQueryClient();
  // As dependências da busca são textos, para ela ficar a mesma entre as renderizações.
  const chaveDosTipos = tipos.join(',');
  const pessoaId = pessoa?.id ?? null;
  const nome = pessoa?.nome ?? '';
  const comDetalhe = filtros !== undefined;
  const tipo = filtros?.tipo ?? null;
  const local = filtros?.local ?? null;
  const responsavel = filtros?.responsavel ?? null;
  const vistos = useRef(new Map<string, AtivoDasRespostas>());

  const buscar = useCallback(
    async (texto: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const dosTipos = chaveDosTipos === '' ? [] : chaveDosTipos.split(',');
      const filtrando = tipo !== null || local !== null || responsavel !== null;
      // A falha das sugestões vira "sem sugestões": a busca pelo texto segue. Com um filtro, a
      // lista é a dos ativos que passam nele, sem as sugestões da pessoa.
      const sugestoes =
        pessoaId === null || filtrando
          ? null
          : await consultas
              .fetchQuery(opcoesDasSugestoes(api, quem, pessoaId, dosTipos))
              .catch(() => null);
      const sugeridos = sugestoes?.ativos ?? [];
      const origem = origemDasSugestoes(
        sugeridos.map((ativo) => ativo.motivo),
        nome,
      );
      const opcao = (
        ativo: { id: string; rotulo: string; patrimonio: string | null },
        detalhe?: string,
      ) => {
        vistos.current.set(ativo.id, { rotulo: ativo.rotulo, patrimonio: ativo.patrimonio });
        return { id: ativo.id, rotulo: rotuloDoAtivoCitado(ativo), ...(detalhe && { detalhe }) };
      };
      if (texto === '' && sugeridos.length > 0) {
        return {
          itens: sugeridos.map((ativo) => opcao(ativo)),
          sugeridas: { ids: sugeridos.map((ativo) => ativo.id), origem },
        };
      }
      const dasColunas: FiltroDaVisao[] = [
        ...(dosTipos.length > 0
          ? [{ chave: 'ativo.tipo', operador: 'qualquer' as const, valores: dosTipos }]
          : []),
        ...(responsavel !== null
          ? [{ chave: 'ativo.responsavel', operador: 'qualquer' as const, valores: [responsavel] }]
          : []),
      ];
      const { data, error } = await api.GET('/ativos', {
        params: {
          query: {
            busca: texto,
            limite: 20,
            ...(tipo !== null && { tipo }),
            ...(local !== null && { local }),
            ...(dasColunas.length > 0 && { filtros: JSON.stringify(dasColunas) }),
          },
        },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os ativos.');
      const itens = data.itens.map((ativo) =>
        opcao(ativo, comDetalhe ? detalheDoAtivo(ativo) : undefined),
      );
      const achados = new Set(itens.map((item) => item.id));
      return {
        itens,
        total: data.total,
        sugeridas: {
          ids: sugeridos.filter((ativo) => achados.has(ativo.id)).map((ativo) => ativo.id),
          origem,
        },
      };
    },
    [api, consultas, quem, chaveDosTipos, pessoaId, nome, comDetalhe, tipo, local, responsavel],
  );
  return { buscar, vistos: vistos.current };
}
