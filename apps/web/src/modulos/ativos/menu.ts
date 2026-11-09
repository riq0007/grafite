// O menu do Ativos no dock com os dados (spec modulo-ativos, "Ativos no dock"; changes
// visoes-no-dock, design, decisão 2, e gestao-de-ativos, design, decisão 5): depois de "Todos os
// ativos", os tipos ativos, cada um com o ícone, que abrem a tabela com a origem do tipo, e, depois
// de uma linha, as visões fixadas, primeiro as da organização, na ordem da fixação, e depois as da
// conta, sem repetir e só as que a API devolve à conta.
import { iconeDoTipo } from '@grafite/ui';
import { consultaDasVisoes } from '../../tabelas/visoes.ts';
import type { EnderecosDe, MenuDinamicoDoModulo } from '../tipos.ts';
import { consultaDosTipos } from './consultas.ts';
import { origemNoEndereco } from './origem.ts';
import type { rotasDosAtivos } from './rotas.tsx';

export const MENU_DINAMICO_DOS_ATIVOS: MenuDinamicoDoModulo<EnderecosDe<typeof rotasDosAtivos>> = {
  permissoes: ['ativos.ver'],
  consultas: (api) => [consultaDasVisoes(api, 'ativos'), consultaDosTipos(api)],
  montar: ({ menu, ler, api, preferencias }) => {
    const visoes = ler(consultaDasVisoes(api, 'ativos'))?.visoes ?? [];
    const tipos = ler(consultaDosTipos(api))?.tipos ?? [];
    const { fixadas, fixadasPelaOrganizacao } = preferencias.tabelas;
    const ids = new Set([...(fixadasPelaOrganizacao.ativos ?? []), ...(fixadas.ativos ?? [])]);
    const porTipo = tipos
      .filter((tipo) => tipo.situacao === 'ativo')
      .map((tipo) => ({
        rotulo: tipo.nome,
        destino: `/ativos?origem=${origemNoEndereco({ tipo: 'tipo', id: tipo.id })}` as const,
        icone: iconeDoTipo(tipo.icone),
      }));
    const dasFixadas = [...ids]
      .flatMap((id) => visoes.filter((visao) => visao.id === id))
      .map((visao, posicao) => ({
        rotulo: visao.nome,
        destino: `/ativos?visao=${visao.id}` as const,
        ...(posicao === 0 ? { separadoAntes: true } : {}),
      }));
    return [...menu, ...porTipo, ...dasFixadas];
  },
};
