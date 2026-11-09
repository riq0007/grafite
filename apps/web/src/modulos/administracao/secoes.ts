import type { Permissao } from '@grafite/domain';
import {
  Blocks,
  DatabaseBackup,
  History,
  ListRestart,
  type LucideIcon,
  MapPin,
  Monitor,
  Network,
  RadioTower,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Users,
  UsersRound,
} from 'lucide-react';

interface DefinicaoDaSecao {
  id: string;
  nome: string;
  icone: LucideIcon;
  endereco: string;
  permissao: Permissao;
  semAcesso: string;
}

/**
 * As seções da Administração, na ordem da lista e do menu do dock, cada uma com a permissão da
 * tela (spec modulo-administracao) e o "a quê" de "Você não tem acesso a…".
 */
export const SECOES = [
  {
    id: 'pessoas',
    nome: 'Pessoas',
    icone: Users,
    endereco: '/administracao/pessoas',
    permissao: 'pessoas.ver',
    semAcesso: 'a Pessoas',
  },
  {
    id: 'perfis',
    nome: 'Perfis',
    icone: ShieldCheck,
    endereco: '/administracao/perfis',
    permissao: 'acessos.ver',
    semAcesso: 'a Perfis',
  },
  {
    id: 'grupos',
    nome: 'Grupos',
    icone: UsersRound,
    endereco: '/administracao/grupos',
    permissao: 'acessos.ver',
    semAcesso: 'a Grupos',
  },
  // O diretório da organização (change integracao-ad-ldap).
  {
    id: 'diretorio',
    nome: 'Diretório',
    icone: Network,
    endereco: '/administracao/diretorio',
    permissao: 'diretorio.administrar',
    semAcesso: 'ao Diretório',
  },
  {
    id: 'locais',
    nome: 'Locais',
    icone: MapPin,
    endereco: '/administracao/locais',
    permissao: 'locais.editar',
    semAcesso: 'a Locais',
  },
  {
    id: 'fornecedores',
    nome: 'Fornecedores',
    icone: Truck,
    endereco: '/administracao/fornecedores',
    permissao: 'fornecedores.ver',
    semAcesso: 'a Fornecedores',
  },
  {
    id: 'padroes',
    nome: 'Padrões',
    icone: SlidersHorizontal,
    endereco: '/administracao/padroes',
    permissao: 'organizacao.editar',
    semAcesso: 'a Padrões',
  },
  {
    id: 'modulos',
    nome: 'Módulos',
    icone: Blocks,
    endereco: '/administracao/modulos',
    permissao: 'organizacao.editar',
    semAcesso: 'a Módulos',
  },
  {
    id: 'coletores',
    nome: 'Coletores',
    icone: RadioTower,
    endereco: '/administracao/coletores',
    permissao: 'coletores.administrar',
    semAcesso: 'a Coletores',
  },
  // Os agentes do GLPI (change inventario-pelo-agente-glpi).
  {
    id: 'agentes',
    nome: 'Agentes',
    icone: Monitor,
    endereco: '/administracao/agentes',
    permissao: 'coletores.administrar',
    semAcesso: 'a Agentes',
  },
  {
    id: 'auditoria',
    nome: 'Auditoria',
    icone: History,
    endereco: '/administracao/auditoria',
    permissao: 'auditoria.ver',
    semAcesso: 'à Auditoria',
  },
  {
    id: 'tarefas',
    nome: 'Tarefas',
    icone: ListRestart,
    endereco: '/administracao/tarefas',
    permissao: 'tarefas.administrar',
    semAcesso: 'a Tarefas',
  },
  // Só na organização que opera o servidor: o `pode` da sessão não dá backup.administrar nas outras.
  {
    id: 'backup',
    nome: 'Backup',
    icone: DatabaseBackup,
    endereco: '/administracao/backup',
    permissao: 'backup.administrar',
    semAcesso: 'a Backup',
  },
] as const satisfies readonly DefinicaoDaSecao[];

export type SecaoDaAdministracao = (typeof SECOES)[number];
export type IdDaSecao = SecaoDaAdministracao['id'];
