// Os Chamados na busca (spec modulo-chamados, "Chamados no dock" e "Busca dos chamados"; change
// chamados-da-ti, design, decisão 14, "O módulo na casca", e "O chamado aberto, o cabeçalho"): as
// telas do menu entram sozinhas, no caminho "Chamados", cada uma a quem a vê; quem atende tem a ação
// de abrir um chamado, que leva ao Início dos chamados com a gaveta de abrir; e o provedor acha os
// chamados pelo número ou pelo título, até 8, cada um levando ao chamado aberto.

import type { components } from '@grafite/api-client';
import { destinoDoChamado, SITUACAO_FECHADA } from '@grafite/domain';
import { LifeBuoy } from 'lucide-react';
import type { ContextoDaAcao } from '../../busca/tipos.ts';
import type { ProvedorDeBusca, ResultadoDoProvedor } from '../tipos.ts';
import { ROTULO_DA_SITUACAO } from './situacoes.ts';

export const ENTRADAS_DOS_CHAMADOS = [
  {
    id: 'abrir-chamado',
    rotulo: 'Abrir um chamado',
    grupo: 'acoes',
    caminho: 'Chamados',
    palavrasChave: ['novo', 'chamado', 'abrir', 'atendimento', 'pedido'],
    icone: LifeBuoy,
    executar: ({ navegar }: ContextoDaAcao) => navegar('/chamados?abrir=1'),
    permissoes: ['chamados.atender'],
  },
] as const;

/** Quantos caracteres o termo precisa ter para a busca dos chamados. */
export const MINIMO_DA_BUSCA_DOS_CHAMADOS = 2;

export type ChamadoNaBusca = components['schemas']['ChamadosNaBusca']['itens'][number];

/**
 * "#1042 Impressora manchando", com "Marina Lopes · Em atendimento" no caminho; o resolvido que
 * fechou diz "Fechado", como o selo dele (chat-com-chamados, tarefa 4.13).
 */
export const resultadoDoChamado = ({
  numero,
  titulo,
  pessoa,
  situacao,
  fechado,
}: ChamadoNaBusca): ResultadoDoProvedor => ({
  id: `chamado-${numero}`,
  rotulo: `#${numero} ${titulo}`,
  caminho: `${pessoa} · ${fechado ? SITUACAO_FECHADA : ROTULO_DA_SITUACAO[situacao]}`,
  destino: destinoDoChamado(numero),
});

/** Os chamados que a conta vê, pelo número, com ou sem o "#", ou pelas palavras do título. */
export const provedorDosChamados: ProvedorDeBusca = {
  grupo: 'Chamados',
  permissoes: ['chamados.ver'],
  buscar: async (termo, sinal, api) => {
    if (termo.trim().length < MINIMO_DA_BUSCA_DOS_CHAMADOS) return [];
    const { data, error } = await api.GET('/chamados/busca', {
      params: { query: { termo } },
      signal: sinal,
    });
    if (error || !data) throw new Error('A busca de chamados falhou.');
    return data.itens.map(resultadoDoChamado);
  },
};
