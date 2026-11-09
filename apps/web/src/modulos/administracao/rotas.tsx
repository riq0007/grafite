import { createRoute, redirect } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { Administracao, InicioDaAdministracao, SecaoDoBackup } from './Administracao.tsx';
import { Agentes } from './agentes/Agentes.tsx';
import { Auditoria } from './auditoria/Auditoria.tsx';
import { validarFiltrosDaAuditoria } from './auditoria/filtros.ts';
import { Coletores } from './coletores/Coletores.tsx';
import { ColetorNovo } from './coletores/ColetorNovo.tsx';
import { FichaDoColetor } from './coletores/FichaDoColetor.tsx';
import { Diretorio } from './diretorio/Diretorio.tsx';
import { FichaDoFornecedor } from './fornecedores/FichaDoFornecedor.tsx';
import { Fornecedores } from './fornecedores/Fornecedores.tsx';
import { FornecedorNovo } from './fornecedores/FornecedorNovo.tsx';
import { validarFiltrosDosFornecedores } from './fornecedores/filtros.ts';
import { FichaDoGrupo } from './grupos/FichaDoGrupo.tsx';
import { GrupoNovo } from './grupos/GrupoNovo.tsx';
import { Grupos } from './grupos/Grupos.tsx';
import { Locais } from './locais/Locais.tsx';
import { Modulos } from './modulos/Modulos.tsx';
import { Padroes } from './padroes/Padroes.tsx';
import { FichaDoPerfil } from './perfis/FichaDoPerfil.tsx';
import { PerfilNovo } from './perfis/PerfilNovo.tsx';
import { Perfis } from './perfis/Perfis.tsx';
import { FichaDaPessoa } from './pessoas/FichaDaPessoa.tsx';
import { validarFiltrosDePessoas } from './pessoas/filtros.ts';
import { PessoaNova } from './pessoas/PessoaNova.tsx';
import { Pessoas } from './pessoas/Pessoas.tsx';
import { Secao } from './Secao.tsx';
import { Tarefas } from './tarefas/Tarefas.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const administracao = createRoute({
  getParentRoute: () => raiz,
  path: '/administracao',
  component: Administracao,
});

const inicio = createRoute({
  getParentRoute: () => administracao,
  path: '/',
  component: InicioDaAdministracao,
});

const pessoas = createRoute({
  getParentRoute: () => administracao,
  path: 'pessoas',
  validateSearch: validarFiltrosDePessoas,
  component: () => (
    <Secao id="pessoas">
      <Pessoas />
    </Secao>
  ),
});

const pessoaNova = createRoute({
  getParentRoute: () => administracao,
  path: 'pessoas/nova',
  component: () => (
    <Secao id="pessoas">
      <PessoaNova />
    </Secao>
  ),
});

const pessoa = createRoute({
  getParentRoute: () => administracao,
  path: 'pessoas/$id',
  component: () => (
    <Secao id="pessoas">
      <FichaDaPessoa />
    </Secao>
  ),
});

const perfis = createRoute({
  getParentRoute: () => administracao,
  path: 'perfis',
  component: () => (
    <Secao id="perfis">
      <Perfis />
    </Secao>
  ),
});

const perfilNovo = createRoute({
  getParentRoute: () => administracao,
  path: 'perfis/novo',
  component: () => (
    <Secao id="perfis">
      <PerfilNovo />
    </Secao>
  ),
});

const perfil = createRoute({
  getParentRoute: () => administracao,
  path: 'perfis/$id',
  component: () => (
    <Secao id="perfis">
      <FichaDoPerfil />
    </Secao>
  ),
});

const grupos = createRoute({
  getParentRoute: () => administracao,
  path: 'grupos',
  component: () => (
    <Secao id="grupos">
      <Grupos />
    </Secao>
  ),
});

const grupoNovo = createRoute({
  getParentRoute: () => administracao,
  path: 'grupos/novo',
  component: () => (
    <Secao id="grupos">
      <GrupoNovo />
    </Secao>
  ),
});

const grupo = createRoute({
  getParentRoute: () => administracao,
  path: 'grupos/$id',
  component: () => (
    <Secao id="grupos">
      <FichaDoGrupo />
    </Secao>
  ),
});

const locais = createRoute({
  getParentRoute: () => administracao,
  path: 'locais',
  // O local escolhido, como o da referência a ele (change relacoes-vivas, decisão 2).
  validateSearch: (busca: Record<string, unknown>): { local?: string } =>
    typeof busca.local === 'string' && busca.local !== '' ? { local: busca.local } : {},
  component: () => (
    <Secao id="locais">
      <Locais />
    </Secao>
  ),
});

const fornecedores = createRoute({
  getParentRoute: () => administracao,
  path: 'fornecedores',
  validateSearch: validarFiltrosDosFornecedores,
  component: () => (
    <Secao id="fornecedores">
      <Fornecedores />
    </Secao>
  ),
});

const fornecedorNovo = createRoute({
  getParentRoute: () => administracao,
  path: 'fornecedores/novo',
  component: () => (
    <Secao id="fornecedores">
      <FornecedorNovo />
    </Secao>
  ),
});

const fornecedor = createRoute({
  getParentRoute: () => administracao,
  path: 'fornecedores/$id',
  component: () => (
    <Secao id="fornecedores">
      <FichaDoFornecedor />
    </Secao>
  ),
});

const auditoria = createRoute({
  getParentRoute: () => administracao,
  path: 'auditoria',
  validateSearch: validarFiltrosDaAuditoria,
  component: () => (
    <Secao id="auditoria">
      <Auditoria />
    </Secao>
  ),
});

// Os padrões: o endereço da tela leva à primeira aba, e cada aba tem o seu.
const padroes = createRoute({
  getParentRoute: () => administracao,
  path: 'padroes',
  beforeLoad: () => {
    throw redirect({ to: '/administracao/padroes/$secao', params: { secao: 'aparencia' } });
  },
});

const padroesDaSecao = createRoute({
  getParentRoute: () => administracao,
  path: 'padroes/$secao',
  component: () => (
    <Secao id="padroes">
      <Padroes />
    </Secao>
  ),
});

const modulos = createRoute({
  getParentRoute: () => administracao,
  path: 'modulos',
  component: () => (
    <Secao id="modulos">
      <Modulos />
    </Secao>
  ),
});

const coletores = createRoute({
  getParentRoute: () => administracao,
  path: 'coletores',
  component: () => (
    <Secao id="coletores">
      <Coletores />
    </Secao>
  ),
});

const coletorNovo = createRoute({
  getParentRoute: () => administracao,
  path: 'coletores/novo',
  component: () => (
    <Secao id="coletores">
      <ColetorNovo />
    </Secao>
  ),
});

const coletor = createRoute({
  getParentRoute: () => administracao,
  path: 'coletores/$id',
  component: () => (
    <Secao id="coletores">
      <FichaDoColetor />
    </Secao>
  ),
});

// O backup: numa organização que não opera o servidor, o endereço leva à primeira seção.
const backup = createRoute({
  getParentRoute: () => administracao,
  path: 'backup',
  component: SecaoDoBackup,
});

const agentes = createRoute({
  getParentRoute: () => administracao,
  path: 'agentes',
  component: () => (
    <Secao id="agentes">
      <Agentes />
    </Secao>
  ),
});

const diretorio = createRoute({
  getParentRoute: () => administracao,
  path: 'diretorio',
  component: () => (
    <Secao id="diretorio">
      <Diretorio />
    </Secao>
  ),
});

const tarefas = createRoute({
  getParentRoute: () => administracao,
  path: 'tarefas',
  component: () => (
    <Secao id="tarefas">
      <Tarefas />
    </Secao>
  ),
});

export const rotasDaAdministracao = administracao.addChildren([
  inicio,
  pessoas,
  pessoaNova,
  pessoa,
  perfis,
  perfilNovo,
  perfil,
  grupos,
  grupoNovo,
  grupo,
  diretorio,
  agentes,
  locais,
  fornecedores,
  fornecedorNovo,
  fornecedor,
  padroes,
  padroesDaSecao,
  modulos,
  coletores,
  coletorNovo,
  coletor,
  auditoria,
  tarefas,
  backup,
]);
