// O cadastro das equipes e dos canais (spec chat, "Equipes e canais"; change chat-com-chamados,
// design, decisão 1): o que quem tem `chat.configurar` grava, com as recusas da spec por campo, e o
// teto de 100 ativos, que a API confere com a organização travada, no cadastro e no reativar.
import { normalizarTexto } from '../texto.ts';

/** As equipes e os canais ativos que uma organização pode ter. */
export const LIMITE_DE_EQUIPES_E_CANAIS = 100;

const LIMITE_DO_NOME = 60;

export const MENSAGENS_DA_EQUIPE_OU_CANAL = {
  nome: 'Escreva o nome.',
  nomeLongo: `Use até ${LIMITE_DO_NOME} caracteres.`,
  /** A API a põe no nome quando a gravação ou o reativar bate no `conversas_nome_unico`. */
  nomeRepetido: 'Já existe uma equipe ou um canal com esse nome.',
  grupo: 'Escolha o grupo da equipe.',
  escreve: 'Escolha o grupo que escreve.',
  teto: `A organização já tem ${LIMITE_DE_EQUIPES_E_CANAIS} equipes e canais.`,
} as const;

/** O que a gaveta manda. O tipo não muda depois: na alteração, a API passa o gravado. */
export interface PedidoDaEquipeOuCanal {
  nome: string;
  tipo: 'equipe' | 'canal';
  /** O grupo cujas contas participam, só na equipe. */
  grupoId: string | null;
  /** "Todos que participam" ou um grupo, cujas contas que participam são as únicas que escrevem. */
  quemEscreve: 'todos' | 'grupo';
  escreveGrupoId: string | null;
  /** "Avisar a cada mensagem". */
  avisar: boolean;
}

export interface ContextoDaEquipeOuCanal {
  /** Os grupos da organização, com a situação de cada um. */
  grupos: ReadonlyMap<string, { ativo: boolean }>;
  /** Os grupos gravados, na alteração; `null`, no cadastro. */
  antes: { grupoId: string | null; escreveGrupoId: string | null } | null;
}

/** A equipe ou o canal conferido, só com as colunas do cadastro. */
export interface EquipeOuCanalConferido {
  nome: string;
  /** Sem acento, em minúsculas e com espaços simples, para o nome único entre os ativos. */
  nomeNormalizado: string;
  tipo: 'equipe' | 'canal';
  grupoId: string | null;
  /** `null`: todos que participam escrevem. */
  escreveGrupoId: string | null;
  avisar: boolean;
}

export type CampoDaEquipeOuCanal = 'nome' | 'grupoId' | 'escreveGrupoId';

export type ConferenciaDaEquipeOuCanal =
  | { ok: true; conversa: EquipeOuCanalConferido }
  | { ok: false; erros: Partial<Record<CampoDaEquipeOuCanal, string>> };

/**
 * Confere o cadastro pelas recusas da spec, todas de uma vez e por campo:
 * - o nome numa linha, sem os espaços das pontas, de 1 a 60 caracteres;
 * - a equipe com o grupo, e o canal sem nenhum;
 * - quem escreve: todos, ou o grupo escolhido.
 *
 * O grupo escolhido é da organização e ativo. O que já estava gravado fica, mesmo inativo: a equipe
 * de um grupo inativo fica sem ninguém até ele voltar, e mudar o nome não pede outro grupo.
 */
export function conferirEquipeOuCanal(
  pedido: PedidoDaEquipeOuCanal,
  contexto: ContextoDaEquipeOuCanal,
): ConferenciaDaEquipeOuCanal {
  const erros: Partial<Record<CampoDaEquipeOuCanal, string>> = {};
  const M = MENSAGENS_DA_EQUIPE_OU_CANAL;
  const valido = (grupoId: string | null, gravado: string | null | undefined) => {
    if (grupoId === null) return false;
    const grupo = contexto.grupos.get(grupoId);
    return grupo !== undefined && (grupo.ativo || grupoId === gravado);
  };

  const nome = pedido.nome.replace(/\s+/gu, ' ').trim();
  if (nome === '') erros.nome = M.nome;
  else if ([...nome].length > LIMITE_DO_NOME) erros.nome = M.nomeLongo;

  const grupoId = pedido.tipo === 'equipe' ? pedido.grupoId : null;
  if (pedido.tipo === 'equipe' && !valido(grupoId, contexto.antes?.grupoId)) {
    erros.grupoId = M.grupo;
  }

  const escreveGrupoId = pedido.quemEscreve === 'grupo' ? pedido.escreveGrupoId : null;
  if (pedido.quemEscreve === 'grupo' && !valido(escreveGrupoId, contexto.antes?.escreveGrupoId)) {
    erros.escreveGrupoId = M.escreve;
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    conversa: {
      nome,
      nomeNormalizado: normalizarTexto(nome),
      tipo: pedido.tipo,
      grupoId,
      escreveGrupoId,
      avisar: pedido.avisar,
    },
  };
}

/**
 * O teto, no cadastro e no reativar: a organização com 100 equipes e canais ativos, fora este, não
 * ganha outro. O arquivado não conta.
 */
export function recusaDoTeto(ativas: number): string | null {
  return ativas >= LIMITE_DE_EQUIPES_E_CANAIS ? MENSAGENS_DA_EQUIPE_OU_CANAL.teto : null;
}
