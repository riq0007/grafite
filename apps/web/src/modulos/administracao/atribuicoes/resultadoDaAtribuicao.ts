// O "Resultado" da atribuição de um perfil, recalculado a cada mudança, antes de confirmar (spec
// modulo-administracao, "Atribuição de perfil pela tela"; design do escolhas-a-vista, decisão 6). A
// tela antecipa o que a API diria; a API confere tudo de novo ao gravar.
import { definicaoDa, descricaoDa, PERMISSOES, type Permissao } from '@grafite/domain';

export interface PerfilDoResultado {
  id: string;
  nome: string;
  permissoes: readonly Permissao[] | readonly string[];
  todasAsPermissoes: boolean;
}

export interface EntradaDoResultado {
  /** Quem recebe, no começo da frase: "Bruno Costa" ou "O grupo Suporte". */
  quem: string;
  perfil: PerfilDoResultado | undefined;
  escopo: 'organizacao' | 'local';
  local: { id: string; caminho: string } | null;
  /** As atribuições em vigor de quem recebe, diretas ou por grupo. */
  emVigor: readonly { perfil: { id: string }; local: { id: string } | null }[];
}

export interface ResultadoDaAtribuicao {
  frases: string[];
  /** Por que não dá para atribuir: a mesma atribuição já vale. */
  impedimento: string | null;
}

/**
 * As permissões do perfil que valem só para a organização inteira: num local, não valem. A API
 * devolve a mesma lista ao atribuir.
 */
export function ignoradasNumLocal(perfil: PerfilDoResultado): Permissao[] {
  const declaradas = perfil.todasAsPermissoes
    ? PERMISSOES.map((permissao) => permissao.chave)
    : (perfil.permissoes as readonly Permissao[]);
  return declaradas.filter((chave) => definicaoDa(chave).escopo === 'organizacao');
}

export const listaDas = (chaves: readonly Permissao[]) => chaves.map(descricaoDa).join(', ');

export function resultadoDaAtribuicao({
  quem,
  perfil,
  escopo,
  local,
  emVigor,
}: EntradaDoResultado): ResultadoDaAtribuicao {
  if (!perfil) return { frases: ['Escolha o perfil.'], impedimento: null };
  if (escopo === 'local' && !local) return { frases: ['Escolha o local.'], impedimento: null };
  const localId = escopo === 'local' ? (local?.id ?? null) : null;
  const igual = emVigor.some(
    (atribuicao) =>
      atribuicao.perfil.id === perfil.id && (atribuicao.local?.id ?? null) === localId,
  );
  const ondeVale = escopo === 'local' && local ? `em ${local.caminho}` : 'na organização inteira';
  if (igual) {
    const frase = `${quem} já tem ${perfil.nome} ${ondeVale}.`;
    return { frases: [frase], impedimento: frase };
  }
  if (escopo === 'organizacao') {
    return {
      frases: [`${quem} passa a ter ${perfil.nome} na organização inteira.`],
      impedimento: null,
    };
  }
  const ignoradas = ignoradasNumLocal(perfil);
  return {
    frases: [
      `${quem} passa a ter ${perfil.nome} ${ondeVale} e no que está dentro.`,
      ...(ignoradas.length > 0
        ? [`Estas permissões do ${perfil.nome} não valem num local: ${listaDas(ignoradas)}.`]
        : []),
    ],
    impedimento: null,
  };
}
