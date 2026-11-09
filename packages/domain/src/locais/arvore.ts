// A árvore de locais (design do F2b, decisão 3): a árvore inteira, de centenas de locais, é lida de
// uma vez e resolvida aqui, sem caminho gravado no banco. As mesmas regras valem na API, dentro da
// trava da organização, e na tela, antes de enviar.
import { normalizarTexto } from '../texto.ts';

export const TIPOS_DE_LOCAL = ['unidade', 'predio', 'andar', 'setor', 'sala', 'outro'] as const;
export type TipoDeLocal = (typeof TIPOS_DE_LOCAL)[number];

export const ROTULOS_DOS_TIPOS: Record<TipoDeLocal, string> = {
  unidade: 'Unidade',
  predio: 'Prédio',
  andar: 'Andar',
  setor: 'Setor',
  sala: 'Sala',
  outro: 'Outro',
};

export const SITUACOES_DO_LOCAL = ['ativo', 'inativo'] as const;
export type SituacaoDoLocal = (typeof SITUACOES_DO_LOCAL)[number];

/** Quantos níveis a árvore pode ter, contando a raiz. */
export const NIVEIS_DA_ARVORE = 8;
const TAMANHO_DO_NOME = 80;
const SEPARADOR = ' › ';

/** Os motivos das recusas da árvore, para quem precisa saber qual foi, como o campo que o mostra. */
export const MOTIVOS_DA_ARVORE = {
  nomeRepetido: 'Já existe um local com este nome aqui.',
  niveis: `A árvore de locais tem no máximo ${NIVEIS_DA_ARVORE} níveis.`,
  ciclo: 'Um local não pode ficar dentro dele mesmo.',
} as const;

const NOME_REPETIDO = MOTIVOS_DA_ARVORE.nomeRepetido;
const NIVEIS_DEMAIS = MOTIVOS_DA_ARVORE.niveis;
const CICLO = MOTIVOS_DA_ARVORE.ciclo;

export interface LocalDaArvore {
  id: string;
  paiId: string | null;
  nome: string;
  tipo: TipoDeLocal;
  situacao: SituacaoDoLocal;
}

/** `null` quando o nome serve; senão, o motivo. */
export function validarNomeDoLocal(nome: string): string | null {
  const limpo = nome.trim();
  if (limpo === '') return 'Informe o nome do local.';
  if (limpo.length > TAMANHO_DO_NOME) return `Use até ${TAMANHO_DO_NOME} caracteres.`;
  return null;
}

export interface ArvoreDeLocais {
  local(id: string): LocalDaArvore | undefined;
  /** Os locais dentro de um local, ou os da raiz com `null`, em ordem de nome. */
  filhos(paiId: string | null): LocalDaArvore[];
  /** Os ids da raiz até o pai do local. */
  ancestrais(id: string): string[];
  /** "Jundiaí › Expedição". */
  caminho(id: string): string;
  /** O próprio local e tudo o que está dentro dele. */
  ramo(id: string): Set<string>;
  /** A raiz está no nível 1. */
  profundidade(id: string): number;
  /** Quantos níveis o ramo ocupa: 1 para um local sem filhos. */
  alturaDoRamo(id: string): number;
  temFilhoAtivo(id: string): boolean;
  /** `null` quando dá para cadastrar; senão, o motivo. */
  podeCriar(novo: { paiId: string | null; nome: string }): string | null;
  podeRenomear(id: string, nome: string): string | null;
  podeMover(id: string, novoPaiId: string | null): string | null;
}

export function montarArvore(locais: readonly LocalDaArvore[]): ArvoreDeLocais {
  const porId = new Map(locais.map((l) => [l.id, l]));
  const porPai = new Map<string | null, LocalDaArvore[]>();
  for (const l of locais) {
    const irmaos = porPai.get(l.paiId) ?? [];
    irmaos.push(l);
    porPai.set(l.paiId, irmaos);
  }
  for (const irmaos of porPai.values()) {
    irmaos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  const filhos = (paiId: string | null) => porPai.get(paiId) ?? [];

  function ancestrais(id: string): string[] {
    const caminho: string[] = [];
    const vistos = new Set([id]);
    let atual = porId.get(id)?.paiId ?? null;
    while (atual !== null && !vistos.has(atual)) {
      caminho.push(atual);
      vistos.add(atual);
      atual = porId.get(atual)?.paiId ?? null;
    }
    return caminho.reverse();
  }

  function ramo(id: string): Set<string> {
    const resultado = new Set<string>();
    const pendentes = [id];
    while (pendentes.length > 0) {
      const atual = pendentes.pop() as string;
      if (resultado.has(atual)) continue;
      resultado.add(atual);
      for (const filho of filhos(atual)) pendentes.push(filho.id);
    }
    return resultado;
  }

  const profundidade = (id: string) => ancestrais(id).length + 1;
  const profundidadeDoPai = (paiId: string | null) => (paiId === null ? 0 : profundidade(paiId));

  function alturaDoRamo(id: string): number {
    const base = profundidade(id);
    let maior = base;
    for (const descendente of ramo(id)) maior = Math.max(maior, profundidade(descendente));
    return maior - base + 1;
  }

  /** Um irmão, fora o próprio local, já usa o nome no lugar. */
  function nomeEmUso(paiId: string | null, nome: string, exceto?: string): boolean {
    const comparavel = normalizarTexto(nome);
    return filhos(paiId).some((l) => l.id !== exceto && normalizarTexto(l.nome) === comparavel);
  }

  return {
    local: (id) => porId.get(id),
    filhos,
    ancestrais,
    caminho: (id) =>
      [...ancestrais(id), id].map((parte) => porId.get(parte)?.nome ?? '').join(SEPARADOR),
    ramo,
    profundidade,
    alturaDoRamo,
    temFilhoAtivo: (id) => filhos(id).some((l) => l.situacao === 'ativo'),
    podeCriar({ paiId, nome }) {
      const motivo = validarNomeDoLocal(nome);
      if (motivo) return motivo;
      if (profundidadeDoPai(paiId) + 1 > NIVEIS_DA_ARVORE) return NIVEIS_DEMAIS;
      if (nomeEmUso(paiId, nome)) return NOME_REPETIDO;
      return null;
    },
    podeRenomear(id, nome) {
      const motivo = validarNomeDoLocal(nome);
      if (motivo) return motivo;
      if (nomeEmUso(porId.get(id)?.paiId ?? null, nome, id)) return NOME_REPETIDO;
      return null;
    },
    podeMover(id, novoPaiId) {
      if (novoPaiId !== null && ramo(id).has(novoPaiId)) return CICLO;
      if (profundidadeDoPai(novoPaiId) + alturaDoRamo(id) > NIVEIS_DA_ARVORE) return NIVEIS_DEMAIS;
      if (nomeEmUso(novoPaiId, porId.get(id)?.nome ?? '', id)) return NOME_REPETIDO;
      return null;
    },
  };
}
