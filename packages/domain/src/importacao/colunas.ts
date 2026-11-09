// As colunas da importação (spec importacao-de-ativos, "Colunas da planilha"; design do P1e,
// decisão 4): os campos que uma coluna pode receber, a sugestão pelo título e a conferência da
// escolha. A coluna vai para um campo pela chave dele, ou para "Ignorar", com `null`.
import { CHAVE_DO_MODELO } from '../ativos/campos-do-ativo.ts';
import type { CamposDoAtivo } from '../ativos/valores-do-ativo.ts';
import { campoDeArquivo } from '../campos/tipos.ts';
import { normalizarTexto } from '../texto.ts';

/** Um campo que a importação oferece para uma coluna. */
export interface CampoDaImportacao {
  chave: string;
  rotulo: string;
  grupo: string;
  restrito: boolean;
}

/** O modelo, que não é um campo, mas é lido de uma coluna, pelo fabricante e pelo nome. */
const MODELO: CampoDaImportacao = {
  chave: CHAVE_DO_MODELO,
  rotulo: 'Modelo',
  grupo: 'Identificação',
  restrito: false,
};

/**
 * Os nomes que as planilhas costumam dar aos campos comuns, além do rótulo deles. A comparação é a
 * do título: sem acento, sem maiúsculas e sem os espaços nas pontas.
 */
const NOMES_CONHECIDOS: Readonly<Record<string, readonly string[]>> = {
  'ativo.nome': ['Nome do ativo'],
  'ativo.patrimonio': [
    'Nº de patrimônio',
    'Nº do patrimônio',
    'Número de patrimônio',
    'Número do patrimônio',
    'Plaqueta',
  ],
  'ativo.serie': ['Série', 'Serial', 'S/N', 'SN', 'Nº de série', 'Número serial'],
  'ativo.hostname': ['Host', 'Nome do host'],
  'ativo.uso': ['Situação', 'Status'],
  'ativo.local': ['Localização'],
  [CHAVE_DO_MODELO]: ['Modelo do equipamento'],
  'ativo.nota-fiscal': ['NF', 'Nº da nota fiscal'],
  'ativo.data-de-compra': ['Data da compra'],
  'ativo.valor-de-compra': ['Valor da compra'],
  'ativo.garantia': ['Garantia', 'Fim da garantia'],
  'ativo.vida-util': ['Vida útil'],
};

/** O título como a sugestão o compara: sem os dois-pontos e o asterisco do fim. */
const tituloNormalizado = (titulo: string) => normalizarTexto(titulo.replace(/[\s:*]+$/u, ''));

/**
 * Os campos que uma coluna pode receber, na ordem da ficha: os comuns, os da organização que o
 * tipo usa e os das capacidades, com o modelo depois dos comuns da identificação. O arquivo e a
 * imagem são enviados pela ficha, e os restritos ficam só para quem os vê em algum ramo.
 */
export function camposDaImportacao(
  definicoes: CamposDoAtivo,
  { restritos }: { restritos: boolean },
): CampoDaImportacao[] {
  const campos: CampoDaImportacao[] = [];
  for (const grupo of definicoes.grupos) {
    for (const definicao of grupo.campos) {
      if (campoDeArquivo(definicao.tipo)) continue;
      if (definicao.restrito && !restritos) continue;
      campos.push({
        chave: definicao.chave,
        rotulo: definicao.rotulo,
        grupo: grupo.nome,
        restrito: definicao.restrito,
      });
    }
    if (grupo.nome === 'Identificação') {
      // Depois dos comuns da identificação, antes dos campos da organização no mesmo grupo.
      const posicao = campos.findLastIndex((campo) => campo.chave.startsWith('ativo.')) + 1;
      campos.splice(posicao, 0, MODELO);
    }
  }
  return campos;
}

/**
 * O campo sugerido para cada coluna, pelo título igual ao rótulo do campo ou a um nome conhecido
 * dele; sem sugestão, `null`. Um campo vai para a primeira coluna que o pede, e as outras ficam em
 * "Ignorar".
 */
export function sugerirColunas(
  titulos: readonly string[],
  campos: readonly CampoDaImportacao[],
): (string | null)[] {
  const porNome = new Map<string, string>();
  for (const campo of campos) {
    for (const nome of [campo.rotulo, ...(NOMES_CONHECIDOS[campo.chave] ?? [])]) {
      const chave = tituloNormalizado(nome);
      if (!porNome.has(chave)) porNome.set(chave, campo.chave);
    }
  }
  const usados = new Set<string>();
  return titulos.map((titulo) => {
    const chave = porNome.get(tituloNormalizado(titulo));
    if (!chave || usados.has(chave)) return null;
    usados.add(chave);
    return chave;
  });
}

export type ConferenciaDoMapeamento = { ok: true } | { ok: false; erros: Record<string, string> };

/**
 * Confere a escolha do campo de cada coluna: uma escolha por coluna, só campos oferecidos, um
 * campo numa coluna só e pelo menos uma coluna com campo. As recusas vão pela coluna.
 */
export function conferirMapeamento(
  mapeamento: readonly (string | null)[],
  colunas: number,
  campos: readonly CampoDaImportacao[],
): ConferenciaDoMapeamento {
  if (mapeamento.length !== colunas) {
    return {
      ok: false,
      erros: { colunas: `Escolha o campo de cada uma das ${colunas} colunas.` },
    };
  }
  const oferecidos = new Map(campos.map((campo) => [campo.chave, campo]));
  const erros: Record<string, string> = {};
  const posicoes = new Map<string, number[]>();
  mapeamento.forEach((chave, posicao) => {
    if (chave === null) return;
    if (!oferecidos.has(chave)) {
      erros[`colunas.${posicao}`] = 'Este campo não pode ser importado.';
      return;
    }
    posicoes.set(chave, [...(posicoes.get(chave) ?? []), posicao]);
  });
  for (const [chave, lista] of posicoes) {
    if (lista.length < 2) continue;
    const motivo = `O campo ${oferecidos.get(chave)?.rotulo ?? chave} está em duas colunas.`;
    for (const posicao of lista) erros[`colunas.${posicao}`] = motivo;
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  if (posicoes.size === 0) {
    return { ok: false, erros: { colunas: 'Escolha o campo de pelo menos uma coluna.' } };
  }
  return { ok: true };
}
