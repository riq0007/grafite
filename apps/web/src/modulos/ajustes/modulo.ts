import { type IdDoTema, temas } from '@grafite/ui';
import { Palette, Settings } from 'lucide-react';
import { definirModulo, type EnderecosDe, type EntradaDeBuscaDoModulo } from '../tipos.ts';
import { rotasDeAjustes } from './rotas.tsx';
import { SECOES } from './secoes.ts';

type EntradaDosAjustes = EntradaDeBuscaDoModulo<EnderecosDe<typeof rotasDeAjustes>>;

/** Na busca, cada seção e cada ajuste dela, que abre a seção com o foco no controle do ajuste. */
const entradasDasSecoes = SECOES.flatMap((secao): EntradaDosAjustes[] => [
  {
    id: secao.id,
    rotulo: secao.nome,
    grupo: 'ajustes',
    caminho: 'Ajustes',
    icone: secao.icone,
    destino: secao.endereco,
  },
  ...secao.ajustes.map(
    (ajuste): EntradaDosAjustes => ({
      id: `${secao.id}:${ajuste.foco}`,
      rotulo: ajuste.rotulo,
      grupo: 'ajustes',
      caminho: `Ajustes › ${secao.nome}`,
      palavrasChave: ajuste.palavrasChave,
      icone: secao.icone,
      destino: secao.endereco,
      foco: ajuste.foco,
    }),
  ),
]);

/** Na busca, uma ação por tema, como "Usar o tema Névoa", que troca o tema na hora. */
const acoesDeTema = (Object.keys(temas) as IdDoTema[]).map(
  (id): EntradaDosAjustes => ({
    id: `usar-o-tema-${id}`,
    rotulo: `Usar o tema ${temas[id].nome}`,
    grupo: 'acoes',
    palavrasChave: ['cores', temas[id].tom],
    icone: Palette,
    executar: ({ mudarPreferencias }) => mudarPreferencias('aparencia', { tema: id }),
  }),
);

export const ajustes = definirModulo({
  id: 'ajustes',
  nome: 'Ajustes',
  icone: Settings,
  endereco: '/ajustes',
  prioridadeNoCelular: 9,
  rotas: rotasDeAjustes,
  menu: SECOES.map((secao) => ({ rotulo: secao.nome, destino: secao.endereco })),
  busca: { entradas: [...entradasDasSecoes, ...acoesDeTema] },
  // A seção Conta: a conta e as sessões dela mudam com a pessoa ou a conta (a senha trocada, os
  // dois passos, as sessões encerradas pela administração).
  eventos: { 'pessoas.mudaram': () => [['conta']] },
});
