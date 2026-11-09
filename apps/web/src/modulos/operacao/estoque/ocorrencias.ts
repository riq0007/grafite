// O estoque em "O que resolver agora" (spec modulo-operacao, "Estoque abaixo do mínimo no Início";
// spec tela-inicial, "Ocorrências dos módulos"; change p4c-estoque, design, decisão 7): cada
// consumível abaixo do mínimo num local que a conta vê é uma ocorrência de Atenção, com o consumível
// no lugar do ativo e a imagem genérica, desde quando ficou abaixo. O evento `estoque.mudou` a relê,
// como depois da entrada que repõe.
import { textoDaOcorrencia } from '@grafite/domain';
import type { OcorrenciaAberta } from '@grafite/ui';
import type { FonteDeOcorrencias } from '../../tipos.ts';
import type { SaldoDoEstoque } from './consultas.ts';

/** O par abaixo do mínimo como uma ocorrência, que leva ao estoque do consumível no local. */
export function ocorrenciaDoSaldo(saldo: SaldoDoEstoque): OcorrenciaAberta {
  const { consumivel, local } = saldo;
  const busca = new URLSearchParams({ consumivel: consumivel.id, local: local.id });
  return {
    id: saldo.id,
    severidade: 'atencao',
    texto: textoDaOcorrencia({
      codigo: consumivel.codigo,
      local: local.caminho,
      saldo: saldo.saldo,
      minimo: saldo.minimo,
    }),
    ativo: {
      nome: consumivel.nome ? `${consumivel.codigo} · ${consumivel.nome}` : consumivel.codigo,
      tipo: 'generico',
    },
    desde: new Date(saldo.abaixoDesde ?? 0),
    destino: `/operacao/estoque?${busca}`,
  };
}

export const fonteDoEstoque: FonteDeOcorrencias = {
  permissoes: ['estoque.ver', 'estoque.movimentar'],
  buscar: async (sinal, { api }) => {
    const { data } = await api.GET('/estoque/abaixo-do-minimo', { signal: sinal });
    if (!data) throw new Error('Não foi possível carregar o estoque abaixo do mínimo.');
    return data.itens.map(ocorrenciaDoSaldo);
  },
  assinar: (aoMudar, { canal }) => canal.ouvir('estoque.mudou', aoMudar),
};
