// A comparação e a restauração do Control iD (spec comparacao-e-restauracao-do-control-id; change
// p5b-comparacao-e-restauracao, design, decisões 3 e 5): a ordem da restauração pelas dependências,
// a chave de cada item (o id, ou os ids que uma categoria de ligação liga), a comparação de uma
// categoria do backup com o controle, a comparação das tabelas de dois lados com os campos
// divergentes, a leitura do CSV exportado pelo controle, como o PMG, e o resultado das operações.
// A senha e o sal nunca entram na comparação.
import { ROTULOS_DAS_CATEGORIAS } from './backup-do-control-id.ts';

/** As categorias na ordem da restauração; as fotos vão por último, depois das pessoas. */
export const ORDEM_DA_RESTAURACAO = [
  'users',
  'groups',
  'user_groups',
  'time_zones',
  'time_spans',
  'access_rules',
  'group_access_rules',
  'access_rule_time_zones',
  'cards',
  'templates',
] as const;

/** O que se pode escolher restaurar: as categorias e as fotos. */
export const CATEGORIAS_DA_RESTAURACAO = [...ORDEM_DA_RESTAURACAO, 'face_images'] as const;

export const TIPOS_DE_OPERACAO = ['restauracao', 'comparacao'] as const;

export type TipoDeOperacao = (typeof TIPOS_DE_OPERACAO)[number];

export const ROTULOS_DOS_TIPOS_DE_OPERACAO: Record<TipoDeOperacao, string> = {
  restauracao: 'Restauração',
  comparacao: 'Comparação com o controle',
};

export const MENSAGENS_DAS_OPERACOES = {
  repetida: 'Já há uma operação aberta neste controle.',
  semDoisPassos: 'Ative a verificação em dois passos para restaurar um backup.',
  codigoIncorreto: 'Código incorreto.',
  modeloDiferente:
    'O backup é de outro modelo de controle; a restauração pode ter resultados inesperados.',
  formato: 'Envie um ZIP de backup ou o CSV exportado pelo controle.',
  arquivoVencido: 'O arquivo enviado não está mais na memória. Envie de novo.',
} as const;

/** As categorias de ligação, sem id: o item é o par de ids que elas ligam. */
const CHAVES_DE_LIGACAO: Readonly<Record<string, readonly string[]>> = {
  user_groups: ['user_id', 'group_id'],
  group_access_rules: ['group_id', 'access_rule_id'],
  access_rule_time_zones: ['access_rule_id', 'time_zone_id'],
};

/** Os campos que não entram na comparação, por gerarem diferença sem sentido. */
const IGNORADOS = new Set(['password', 'salt']);

export type ItemDoControle = Record<string, unknown>;

/** A chave do item na categoria: o id, ou os ids ligados; `null` sem nenhum. */
export function chaveDoItem(categoria: string, item: ItemDoControle): string | null {
  const ligacao = CHAVES_DE_LIGACAO[categoria];
  if (ligacao) return ligacao.map((campo) => String(item[campo] ?? '')).join(':');
  return item.id === null || item.id === undefined ? null : String(item.id);
}

/** O valor como texto, com o nulo igual ao vazio. */
const comoTexto = (valor: unknown) =>
  valor === null || valor === undefined
    ? ''
    : typeof valor === 'object'
      ? JSON.stringify(valor)
      : String(valor).trim();

/** Os campos que diferem entre os dois itens, sem a senha e o sal. */
function camposDiferentes(a: ItemDoControle, b: ItemDoControle) {
  const campos = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (campo) => !IGNORADOS.has(campo),
  );
  return campos.flatMap((campo) => {
    const deA = comoTexto(a[campo]);
    const deB = comoTexto(b[campo]);
    return deA === deB ? [] : [{ campo, a: deA, b: deB }];
  });
}

const porChave = (categoria: string, itens: readonly ItemDoControle[]) => {
  const mapa = new Map<string, ItemDoControle>();
  for (const item of itens) {
    const chave = chaveDoItem(categoria, item);
    if (chave !== null) mapa.set(chave, item);
  }
  return mapa;
};

/** As contagens de uma categoria do backup contra a do controle. */
export function compararCategoria(
  categoria: string,
  backup: readonly ItemDoControle[],
  controle: readonly ItemDoControle[],
): { iguais: number; soNoBackup: number; soNoControle: number; divergentes: number } {
  const doBackup = porChave(categoria, backup);
  const doControle = porChave(categoria, controle);
  let iguais = 0;
  let soNoBackup = 0;
  let divergentes = 0;
  for (const [chave, item] of doBackup) {
    const outro = doControle.get(chave);
    if (!outro) soNoBackup += 1;
    else if (camposDiferentes(item, outro).length === 0) iguais += 1;
    else divergentes += 1;
  }
  const soNoControle = [...doControle.keys()].filter((chave) => !doBackup.has(chave)).length;
  return { iguais, soNoBackup, soNoControle, divergentes };
}

/** O nome do registro, ou o id quando ele não tem. */
const nomeDo = (item: ItemDoControle, id: string) => comoTexto(item.name) || id;

export interface ComparacaoDeTabela {
  tabela: string;
  identicos: number;
  divergentes: { id: string; nome: string; campos: { campo: string; a: string; b: string }[] }[];
  soEmA: { id: string; nome: string }[];
  soEmB: { id: string; nome: string }[];
}

/** A comparação de uma tabela de dois lados, pelo id, com os campos divergentes lado a lado. */
export function compararTabelas(
  tabela: string,
  a: readonly ItemDoControle[],
  b: readonly ItemDoControle[],
): ComparacaoDeTabela {
  const deA = porChave(tabela, a);
  const deB = porChave(tabela, b);
  const resultado: ComparacaoDeTabela = {
    tabela,
    identicos: 0,
    divergentes: [],
    soEmA: [],
    soEmB: [],
  };
  for (const [id, item] of deA) {
    const outro = deB.get(id);
    if (!outro) {
      resultado.soEmA.push({ id, nome: nomeDo(item, id) });
      continue;
    }
    const campos = camposDiferentes(item, outro);
    if (campos.length === 0) resultado.identicos += 1;
    else resultado.divergentes.push({ id, nome: nomeDo(item, id), campos });
  }
  for (const [id, item] of deB) {
    if (!deA.has(id)) resultado.soEmB.push({ id, nome: nomeDo(item, id) });
  }
  return resultado;
}

/**
 * As tabelas do CSV exportado pelo controle: depois da linha `cid_data`, cada tabela vem com o nome,
 * o cabeçalho e as linhas, separada da seguinte por uma linha vazia. O CSV do controle não escapa
 * vírgulas, como o PMG lê.
 */
export function lerCsvDoControlId(texto: string): Record<string, Record<string, string>[]> {
  const linhas = texto.split('\n').map((linha) => linha.replace(/\r$/, '').trim());
  const tabelas: Record<string, Record<string, string>[]> = {};
  let nosDados = false;
  let atual: string | null = null;
  let cabecalho: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i] ?? '';
    if (linha === 'cid_data') {
      nosDados = true;
      continue;
    }
    if (!nosDados) continue;
    if (linha === '') {
      atual = null;
      cabecalho = [];
      continue;
    }
    if (atual === null) {
      atual = linha;
      tabelas[atual] = [];
      i += 1;
      cabecalho = (linhas[i] ?? '').split(',').map((campo) => campo.trim());
      continue;
    }
    const valores = linha.split(',');
    tabelas[atual]?.push(
      Object.fromEntries(cabecalho.map((campo, j) => [campo, (valores[j] ?? '').trim()])),
    );
  }
  return tabelas;
}

export interface CategoriaDaOperacao {
  categoria: string;
  situacao: 'ok' | 'erro' | 'pulado';
}

/** O resultado pelas categorias processadas: as puladas não contam. */
export function resultadoDaOperacao(categorias: readonly CategoriaDaOperacao[]): {
  situacao: 'sucesso' | 'parcial' | 'falha';
  erro: string | null;
} {
  const processadas = categorias.filter((categoria) => categoria.situacao !== 'pulado');
  const comErro = processadas.filter((categoria) => categoria.situacao === 'erro');
  if (comErro.length === 0) return { situacao: 'sucesso', erro: null };
  const erro = `Falhou: ${comErro
    .map(
      ({ categoria }) =>
        ROTULOS_DAS_CATEGORIAS[categoria as keyof typeof ROTULOS_DAS_CATEGORIAS] ?? categoria,
    )
    .join(', ')}.`;
  return { situacao: comErro.length === processadas.length ? 'falha' : 'parcial', erro };
}
