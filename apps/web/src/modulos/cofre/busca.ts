// O Cofre na busca (spec modulo-cofre, "Cofre na busca"): os segredos que a conta vê, pelo nome e
// pelo identificador, com o tipo, levando à ficha, sem nenhum valor; e "Novo segredo", para quem
// administra o cofre.
import { ROTULOS_DOS_TIPOS_DE_SEGREDO } from '@grafite/domain';
import { KeyRound } from 'lucide-react';
import type { ProvedorDeBusca } from '../tipos.ts';

/** Quantos segredos a busca mostra: o resto fica na lista do Cofre. */
const NA_BUSCA = 8;

export const provedorDeSegredos: ProvedorDeBusca = {
  grupo: 'Segredos',
  permissoes: ['cofre.usar'],
  buscar: async (termo, sinal, api) => {
    const { data, response } = await api.GET('/cofre/segredos', {
      params: { query: { busca: termo } },
      signal: sinal,
    });
    // A conta sem os dois passos não vê segredo nenhum: a busca fica sem o grupo.
    if (response.status === 403) return [];
    if (!data) throw new Error('A busca de segredos falhou.');
    return data.segredos.slice(0, NA_BUSCA).map((segredo) => ({
      id: segredo.id,
      rotulo: segredo.nome,
      caminho: [ROTULOS_DOS_TIPOS_DE_SEGREDO[segredo.tipo], segredo.identificador]
        .filter(Boolean)
        .join(' · '),
      destino: `/cofre/${segredo.id}`,
    }));
  },
};

export const ENTRADAS_DO_COFRE = [
  {
    id: 'novo-segredo',
    rotulo: 'Novo segredo',
    grupo: 'acoes',
    caminho: 'Cofre',
    palavrasChave: ['cadastrar', 'novo', 'senha', 'credencial'],
    icone: KeyRound,
    destino: '/cofre/novo',
    permissoes: ['cofre.administrar'],
  },
] as const;
