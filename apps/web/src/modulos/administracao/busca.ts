// A Administração na busca (spec modulo-administracao; design do F2b, decisão 15): as pessoas que a
// conta pode ver, pela API, e as ações de cadastro, cada uma para quem pode fazê-la.
import { FolderTree, ShieldPlus, UserPlus, UsersRound } from 'lucide-react';
import type { ProvedorDeBusca } from '../tipos.ts';

/** Quantas pessoas a busca mostra: o resto fica na tela de pessoas. */
const NA_BUSCA = 8;

/** As pessoas pelo nome, pela matrícula, pelo e-mail ou pelo usuário, como a lista acha. */
export const provedorDePessoas: ProvedorDeBusca = {
  grupo: 'Pessoas',
  permissoes: ['pessoas.ver'],
  buscar: async (termo, sinal, api) => {
    const { data, error } = await api.GET('/pessoas', {
      params: { query: { busca: termo, limite: NA_BUSCA } },
      signal: sinal,
    });
    if (error || !data) throw new Error('A busca de pessoas falhou.');
    const itens = data.itens.map((pessoa) => ({
      id: pessoa.id,
      rotulo: pessoa.nome,
      caminho:
        [pessoa.matricula, pessoa.conta?.usuario, pessoa.local?.caminho]
          .filter(Boolean)
          .join(' · ') || undefined,
      destino: `/administracao/pessoas/${pessoa.id}`,
    }));
    return { itens, total: data.total };
  },
  verTodos: (termo) => `/administracao/pessoas?busca=${encodeURIComponent(termo)}`,
};

const CADASTRAR = ['cadastrar', 'novo', 'nova', 'criar'];

/** As ações de cadastro da Administração, cada uma com a permissão dela. */
export const ENTRADAS_DA_ADMINISTRACAO = [
  {
    id: 'nova-pessoa',
    rotulo: 'Nova pessoa',
    grupo: 'acoes',
    caminho: 'Administração › Pessoas',
    palavrasChave: CADASTRAR,
    icone: UserPlus,
    destino: '/administracao/pessoas/nova',
    permissoes: ['pessoas.editar'],
  },
  {
    id: 'novo-perfil',
    rotulo: 'Novo perfil',
    grupo: 'acoes',
    caminho: 'Administração › Perfis',
    palavrasChave: CADASTRAR,
    icone: ShieldPlus,
    destino: '/administracao/perfis/novo',
    permissoes: ['acessos.administrar'],
  },
  {
    id: 'novo-grupo',
    rotulo: 'Novo grupo',
    grupo: 'acoes',
    caminho: 'Administração › Grupos',
    palavrasChave: CADASTRAR,
    icone: UsersRound,
    destino: '/administracao/grupos/novo',
    permissoes: ['acessos.administrar'],
  },
  {
    id: 'novo-local',
    rotulo: 'Novo local',
    grupo: 'acoes',
    caminho: 'Administração › Locais',
    palavrasChave: CADASTRAR,
    icone: FolderTree,
    destino: '/administracao/locais',
    foco: 'novo-local',
    permissoes: ['locais.editar'],
  },
] as const;
