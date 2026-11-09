import type { Permissao } from '@grafite/domain';
import { FolderCog } from 'lucide-react';
import { BackupsNoInicio } from '../ativos/controlid/BackupsNoInicio.tsx';
import { CHAVE_DAS_IMPORTACOES } from '../ativos/importacao/consultas.ts';
import { NovoModelo } from '../ativos/modelos/NovoModelo.tsx';
import { PERMISSOES_DO_CATALOGO, SECOES_DO_CATALOGO } from '../ativos/secoes.ts';
import { NovoTipo } from '../ativos/tipos/NovoTipo.tsx';
import { definirModulo } from '../tipos.ts';
import { ENTRADAS_DA_GESTAO, provedorDeModelos } from './busca.ts';
import { rotasDaGestao } from './rotas.tsx';

/**
 * Quem vê a Gestão de ativos: quem cuida do catálogo ou dos modelos, importa planilhas, distribui
 * software ou vê os backups do Control iD.
 */
export const PERMISSOES_DA_GESTAO = [
  ...PERMISSOES_DO_CATALOGO,
  'ativos.editar',
  'software.distribuir',
  'controlid.ver',
] as const satisfies readonly Permissao[];

/**
 * A Gestão de ativos no registro (spec modulo-gestao-de-ativos): logo depois do Ativos, de que ela
 * faz parte e cujo interruptor segue, com o Catálogo, as Importações, o Software e o Control iD, cada
 * um com a permissão dele. No celular, em "Mais". Na busca, os modelos e as ações de cadastro do
 * catálogo e da importação.
 */
export const gestao = definirModulo({
  id: 'gestao',
  nome: 'Gestão de ativos',
  icone: FolderCog,
  endereco: '/gestao',
  prioridadeNoCelular: 'mais',
  parteDe: 'ativos',
  rotas: rotasDaGestao,
  permissoes: PERMISSOES_DA_GESTAO,
  // Os backups de cada controle, com os dias sem backup e os rostos, no Início (change
  // inicio-ajustavel).
  blocosDoInicio: [
    {
      id: 'gestao.backups',
      titulo: 'Backups do Control iD',
      componente: BackupsNoInicio,
      permissoes: ['controlid.ver'],
    },
  ],
  menu: [
    {
      rotulo: 'Catálogo',
      permissoes: PERMISSOES_DO_CATALOGO,
      filhos: SECOES_DO_CATALOGO.map((secao) => ({ rotulo: secao.nome, destino: secao.endereco })),
    },
    { rotulo: 'Importações', destino: '/gestao/importacoes', permissoes: ['ativos.editar'] },
    // A base de software e as distribuições às máquinas (change distribuicao-de-software).
    { rotulo: 'Software', destino: '/gestao/software', permissoes: ['software.distribuir'] },
    // Os backups dos controles de acesso (change p5a-backup-do-control-id).
    {
      rotulo: 'Control iD',
      permissoes: ['controlid.ver'],
      filhos: [
        { rotulo: 'Backups', destino: '/gestao/control-id/backups' },
        { rotulo: 'Comparar backups', destino: '/gestao/control-id/comparar' },
      ],
    },
  ],
  busca: { entradas: ENTRADAS_DA_GESTAO, provedores: [provedorDeModelos] },
  // Os cadastros do catálogo que os campos abrem numa aba (change cadastro-em-abas).
  cadastros: [
    {
      alvo: 'tipo',
      titulo: 'Novo tipo',
      link: 'Cadastrar novo tipo',
      permissoes: ['catalogo.administrar'],
      componente: NovoTipo,
    },
    {
      alvo: 'modelo',
      titulo: 'Novo modelo',
      link: 'Cadastrar novo modelo',
      permissoes: ['modelos.editar'],
      componente: NovoModelo,
    },
  ],
  // Os outros eventos das telas da Gestão, como os do catálogo, estão no Ativos, que relê as mesmas
  // consultas para o registro inteiro.
  eventos: {
    // Uma importação da conta: a lista, a tela dela, a prévia e o resultado.
    'importacoes.mudaram': () => [CHAVE_DAS_IMPORTACOES],
  },
});
