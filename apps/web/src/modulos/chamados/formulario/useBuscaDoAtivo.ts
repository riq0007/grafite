// A busca do ativo de um chamado (change chamados-da-ti, design, decisão 21, e "A coluna da
// direita, a pessoa e o ativo (tarefa 5.13)"): o campo Ativo do formulário e o "Trocar o ativo" do
// chamado aberto escolhem do mesmo jeito. Sem nada digitado, os ativos sugeridos pela pessoa, sob a
// origem; com o texto, a busca entre os ativos que a conta vê, só dos tipos dados, com as sugeridas
// no alto. Sem a pessoa, ou sem sugestão, a lista abre com os primeiros ativos.
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

export function useBuscaDoAtivo({
  quem,
  pessoa,
  tipos,
}: {
  quem: QuemPreenche;
  pessoa: PessoaDoFormulario | null;
  /** Os tipos de ativo que valem; vazio, todos. */
  tipos: readonly string[];
}): BuscaDoAtivo {
  const api = useApi();
  const consultas = useQueryClient();
  // As dependências da busca são textos, para ela ficar a mesma entre as renderizações.
  const chaveDosTipos = tipos.join(',');
  const pessoaId = pessoa?.id ?? null;
  const nome = pessoa?.nome ?? '';
  const vistos = useRef(new Map<string, AtivoDasRespostas>());

  const buscar = useCallback(
    async (texto: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const dosTipos = chaveDosTipos === '' ? [] : chaveDosTipos.split(',');
      // A falha das sugestões vira "sem sugestões": a busca pelo texto segue.
      const sugestoes =
        pessoaId === null
          ? null
          : await consultas
              .fetchQuery(opcoesDasSugestoes(api, quem, pessoaId, dosTipos))
              .catch(() => null);
      const sugeridos = sugestoes?.ativos ?? [];
      const origem = origemDasSugestoes(
        sugeridos.map((ativo) => ativo.motivo),
        nome,
      );
      const opcao = (ativo: { id: string; rotulo: string; patrimonio: string | null }) => {
        vistos.current.set(ativo.id, { rotulo: ativo.rotulo, patrimonio: ativo.patrimonio });
        return { id: ativo.id, rotulo: rotuloDoAtivoCitado(ativo) };
      };
      if (texto === '' && sugeridos.length > 0) {
        return {
          itens: sugeridos.map(opcao),
          sugeridas: { ids: sugeridos.map((ativo) => ativo.id), origem },
        };
      }
      const doTipo: FiltroDaVisao[] =
        dosTipos.length > 0
          ? [{ chave: 'ativo.tipo', operador: 'qualquer', valores: dosTipos }]
          : [];
      const { data, error } = await api.GET('/ativos', {
        params: {
          query: {
            busca: texto,
            limite: 20,
            ...(doTipo.length > 0 && { filtros: JSON.stringify(doTipo) }),
          },
        },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os ativos.');
      const itens = data.itens.map(opcao);
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
    [api, consultas, quem, chaveDosTipos, pessoaId, nome],
  );
  return { buscar, vistos: vistos.current };
}
