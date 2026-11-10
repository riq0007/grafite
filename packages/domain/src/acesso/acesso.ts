// O acesso efetivo de uma conta (design do F2b, decisão 5): a soma das permissões dos perfis ativos
// atribuídos a ela, direto ou por um grupo ativo, com as atribuições em vigor. O escopo fica na
// atribuição: a organização inteira ou o ramo de um local. A mesma resolução decide na API e
// explica na tela de onde vem cada permissão.
import type { ArvoreDeLocais } from '../locais/arvore.ts';
import type { PrazoDoPerfil } from './confianca.ts';
import {
  definicaoDa,
  fechamento,
  PERMISSOES,
  type Permissao,
  permissaoConhecida,
} from './permissoes.ts';

export interface PerfilParaAcesso {
  id: string;
  nome: string;
  situacao: 'ativo' | 'inativo';
  permissoes: readonly string[];
  /** Só o Administrador: todas as permissões do catálogo, inclusive as que vierem depois. */
  todasAsPermissoes: boolean;
  exigeDoisPassos: boolean;
  /** O prazo da confiança nos aparelhos do perfil, ou `null` para seguir a organização. */
  diasDeConfianca?: number | null;
}

export type OrigemDaAtribuicao =
  | { tipo: 'conta' }
  | {
      tipo: 'grupo';
      grupoId: string;
      grupoNome: string;
      grupoAtivo: boolean;
      participacaoEncerrada: boolean;
    };

export interface AtribuicaoParaAcesso {
  id: string;
  perfil: PerfilParaAcesso;
  /** `null`: a organização inteira; senão, o ramo deste local. */
  localId: string | null;
  encerrada: boolean;
  origem: OrigemDaAtribuicao;
}

export interface AlcanceDaPermissao {
  organizacao: boolean;
  /** As raízes dos ramos em que a permissão vale. */
  locais: ReadonlySet<string>;
}

export interface OrigemDaPermissao {
  atribuicaoId: string;
  perfil: { id: string; nome: string };
  localId: string | null;
  grupo: { id: string; nome: string } | null;
}

export interface Acesso {
  permissoes: ReadonlyMap<Permissao, AlcanceDaPermissao>;
  /** Algum perfil em vigor exige a verificação em dois passos. */
  exigeDoisPassos: boolean;
  /** Os nomes desses perfis, em ordem. */
  perfisQueExigem: readonly string[];
  origens: ReadonlyMap<Permissao, readonly OrigemDaPermissao[]>;
  /** O prazo da confiança de cada perfil em vigor que tem um, pelo nome (change aparelho-confiavel). */
  prazosDosPerfis: readonly PrazoDoPerfil[];
}

export const SEM_ACESSO: Acesso = {
  permissoes: new Map(),
  exigeDoisPassos: false,
  perfisQueExigem: [],
  origens: new Map(),
  prazosDosPerfis: [],
};

const TODAS = PERMISSOES.map((p) => p.chave);

function emVigor({ encerrada, perfil, origem }: AtribuicaoParaAcesso): boolean {
  if (encerrada || perfil.situacao !== 'ativo') return false;
  return origem.tipo === 'conta' || (origem.grupoAtivo && !origem.participacaoEncerrada);
}

/** Uma permissão que vale só para a organização inteira não vale numa atribuição com local. */
const valeNoEscopo = (chave: Permissao, localId: string | null) =>
  localId === null || definicaoDa(chave).escopo === 'local';

/** As permissões que a atribuição dá no escopo dela, já com as incluídas. */
function permissoesDa({ perfil, localId }: AtribuicaoParaAcesso): Permissao[] {
  const declaradas = perfil.todasAsPermissoes
    ? TODAS
    : perfil.permissoes.filter(permissaoConhecida);
  const noEscopo = declaradas.filter((chave) => valeNoEscopo(chave, localId));
  return [...fechamento(noEscopo)].filter((chave) => valeNoEscopo(chave, localId));
}

export function resolverAcesso(atribuicoes: readonly AtribuicaoParaAcesso[]): Acesso {
  const alcances = new Map<Permissao, { organizacao: boolean; locais: Set<string> }>();
  const origens = new Map<Permissao, OrigemDaPermissao[]>();
  const perfisQueExigem = new Set<string>();
  const prazos = new Map<string, number>();
  for (const atribuicao of atribuicoes.filter(emVigor)) {
    const { id, perfil, localId, origem } = atribuicao;
    if (perfil.exigeDoisPassos) perfisQueExigem.add(perfil.nome);
    if (perfil.diasDeConfianca !== undefined && perfil.diasDeConfianca !== null) {
      prazos.set(perfil.nome, perfil.diasDeConfianca);
    }
    for (const chave of permissoesDa(atribuicao)) {
      const atual = alcances.get(chave) ?? { organizacao: false, locais: new Set<string>() };
      if (localId === null) atual.organizacao = true;
      else atual.locais.add(localId);
      alcances.set(chave, atual);
      const lista = origens.get(chave) ?? [];
      lista.push({
        atribuicaoId: id,
        perfil: { id: perfil.id, nome: perfil.nome },
        localId,
        grupo: origem.tipo === 'grupo' ? { id: origem.grupoId, nome: origem.grupoNome } : null,
      });
      origens.set(chave, lista);
    }
  }
  if (alcances.size === 0 && perfisQueExigem.size === 0 && prazos.size === 0) return SEM_ACESSO;
  return {
    permissoes: alcances,
    exigeDoisPassos: perfisQueExigem.size > 0,
    perfisQueExigem: [...perfisQueExigem].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    origens,
    prazosDosPerfis: [...prazos]
      .map(([nome, dias]) => ({ nome, dias }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

/** A conta tem a permissão em algum escopo: mostra o módulo, o menu e a tela. */
export function pode(acesso: Acesso, chave: Permissao): boolean {
  const alcanceDela = acesso.permissoes.get(chave);
  return alcanceDela !== undefined && (alcanceDela.organizacao || alcanceDela.locais.size > 0);
}

/** A conta tem a permissão neste local. Um registro sem local só é alcançado pela organização. */
export function podeEm(
  acesso: Acesso,
  chave: Permissao,
  localId: string | null,
  arvore: Pick<ArvoreDeLocais, 'ancestrais'>,
): boolean {
  const alcanceDela = acesso.permissoes.get(chave);
  if (!alcanceDela) return false;
  if (alcanceDela.organizacao) return true;
  if (localId === null) return false;
  return [localId, ...arvore.ancestrais(localId)].some((id) => alcanceDela.locais.has(id));
}

/**
 * Até onde a permissão vale, para filtrar uma consulta: a organização inteira, os locais de todos
 * os ramos juntos, ou nada.
 */
export function alcance(
  acesso: Acesso,
  chave: Permissao,
  arvore: Pick<ArvoreDeLocais, 'ramo'>,
): 'organizacao' | Set<string> | null {
  const alcanceDela = acesso.permissoes.get(chave);
  if (!alcanceDela) return null;
  if (alcanceDela.organizacao) return 'organizacao';
  if (alcanceDela.locais.size === 0) return null;
  const locais = new Set<string>();
  for (const raiz of alcanceDela.locais) for (const id of arvore.ramo(raiz)) locais.add(id);
  return locais;
}

export interface PermissaoListada {
  chave: Permissao;
  organizacao: boolean;
  locais: string[];
}

/** O acesso como a API o entrega no estado da sessão: na ordem do catálogo, com os locais em ordem. */
export function listarPermissoes(acesso: Acesso): PermissaoListada[] {
  return TODAS.flatMap((chave) => {
    const alcanceDela = acesso.permissoes.get(chave);
    return alcanceDela
      ? [{ chave, organizacao: alcanceDela.organizacao, locais: [...alcanceDela.locais].sort() }]
      : [];
  });
}
