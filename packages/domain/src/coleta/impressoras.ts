// As regras da impressora (spec impressoras-por-snmp; change p2b-impressoras-por-snmp, design,
// decisão 5): o que a impressora informa pelo Printer-MIB e pelo Host Resources MIB vira o nível e o
// tipo de cada suprimento, as condições do equipamento e as páginas em preto e branco. São as regras
// do PMG (src/lib/snmp-rules.js), com as diferenças da spec: o nível que a impressora não mede não
// vira 100%, e a impressora de uma cor é reconhecida pelas cores que ela informa, e não pelo nome do
// tipo. O coletor as usa ao montar as leituras, e a tela, ao mostrá-las.

/** O nível do Printer-MIB que diz só que ainda há suprimento, sem medir quanto. */
export const NIVEL_HA_SUPRIMENTO = -3;

/** O nível de um suprimento: o percentual medido, "há suprimento" ou "sem dado". */
export type NivelDoSuprimento =
  | { tipo: 'medido'; percentual: number }
  | { tipo: 'ha-suprimento' }
  | { tipo: 'sem-dado' };

/**
 * O nível pelo que a impressora informa (prtMarkerSuppliesMaxCapacity e prtMarkerSuppliesLevel):
 * o percentual da capacidade, arredondado, quando ela mede; "há suprimento" quando diz só que ainda
 * há; "sem dado" quando informa a capacidade e não o nível. O item sem capacidade e sem nenhuma
 * indicação de nível fica fora da lista (`null`). O percentual acima de 100 fica como veio: o lote o
 * grava como inconsistente.
 */
export function nivelDoSuprimento(capacidade: number, nivel: number): NivelDoSuprimento | null {
  if (nivel === NIVEL_HA_SUPRIMENTO) return { tipo: 'ha-suprimento' };
  if (capacidade <= 0) return null;
  if (nivel < 0) return { tipo: 'sem-dado' };
  return { tipo: 'medido', percentual: Math.round((nivel / capacidade) * 100) };
}

export type TipoDeSuprimento = 'toner' | 'cilindro' | 'fusor' | 'outro';

export const ROTULOS_DOS_TIPOS_DE_SUPRIMENTO: Record<TipoDeSuprimento, string> = {
  toner: 'Toner',
  cilindro: 'Cilindro',
  fusor: 'Fusor',
  outro: 'Outro',
};

/** As palavras de uma peça que nunca é toner: com qualquer uma delas, o suprimento não é Toner. */
const NAO_E_TONER = [
  'waste',
  'lixeira',
  'recipiente',
  'coletor',
  'collection',
  'imaging',
  'image',
  'drum',
  'cilindro',
  'fotocondutor',
  'imagem',
  'fuser',
  'fusor',
  'transfer',
  'belt',
  'roller',
  'developer',
  'maintenance',
  'kit',
  'adf',
  'retard',
  'pad',
  'tray',
];
const DO_CILINDRO = ['drum', 'imaging', 'image', 'cilindro', 'fotocondutor', 'imagem'];
const DO_FUSOR = ['fuser', 'fusor'];
const DO_TONER = ['toner', 'cartucho', 'cartridge', 'ink'];
/** A descrição só com a cor, como "Black" ou "Ciano", é de um toner. */
const SO_A_COR = /cyan|magenta|yellow|black|ciano|amarelo|preto/;

/** O tipo do suprimento pela descrição que a impressora informa. */
export function tipoDoSuprimento(descricao: string): TipoDeSuprimento {
  const texto = descricao.toLowerCase();
  const tem = (palavras: readonly string[]) => palavras.some((palavra) => texto.includes(palavra));
  if (tem(NAO_E_TONER)) {
    if (tem(DO_CILINDRO)) return 'cilindro';
    if (tem(DO_FUSOR)) return 'fusor';
    return 'outro';
  }
  if (tem(DO_TONER) || SO_A_COR.test(texto)) return 'toner';
  return 'outro';
}

export type TintaDoSuprimento = 'ciano' | 'magenta' | 'amarelo' | 'preto';

/** As palavras de cada tinta, sem acento; o "K" só conta isolado, como em "Toner (K)". */
const TINTAS_DO_SUPRIMENTO: ReadonlyArray<[TintaDoSuprimento, RegExp]> = [
  ['ciano', /\b(cyan|ciano)\b/],
  ['magenta', /\bmagenta\b/],
  ['amarelo', /\b(yellow|amarelo)\b/],
  ['preto', /\b(black|preto|negro|k)\b/],
];

/**
 * A tinta do toner pela descrição (change suprimentos-rostos-e-backups, design, decisão 1). O
 * cilindro, o fusor e o outro não têm tinta, mesmo com a cor na descrição, como "Black Drum".
 */
export function tintaDoSuprimento(descricao: string): TintaDoSuprimento | null {
  if (tipoDoSuprimento(descricao) !== 'toner') return null;
  const texto = descricao.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return TINTAS_DO_SUPRIMENTO.find(([, padrao]) => padrao.test(texto))?.[0] ?? null;
}

export type SeveridadeDaCondicao = 'atencao' | 'critico';

export interface CondicaoDaImpressora {
  /** A posição em hrPrinterDetectedErrorState: o bit 0 é o mais alto do primeiro octeto. */
  bit: number;
  chave: string;
  rotulo: string;
  severidade: SeveridadeDaCondicao;
}

/**
 * As condições do equipamento, na ordem dos bits. O bit 6, "fora de linha", fica de fora: a
 * disponibilidade vem do ping, e a impressora que respondeu ao SNMP não está fora da rede.
 */
export const CONDICOES_DA_IMPRESSORA: readonly CondicaoDaImpressora[] = [
  { bit: 0, chave: 'pouco-papel', rotulo: 'Pouco papel', severidade: 'atencao' },
  { bit: 1, chave: 'sem-papel', rotulo: 'Sem papel', severidade: 'critico' },
  { bit: 2, chave: 'toner-baixo', rotulo: 'Toner baixo', severidade: 'atencao' },
  { bit: 3, chave: 'sem-toner', rotulo: 'Sem toner', severidade: 'critico' },
  { bit: 4, chave: 'tampa-aberta', rotulo: 'Tampa aberta', severidade: 'critico' },
  { bit: 5, chave: 'atolamento', rotulo: 'Atolamento de papel', severidade: 'critico' },
  { bit: 7, chave: 'servico-solicitado', rotulo: 'Serviço solicitado', severidade: 'critico' },
  {
    bit: 8,
    chave: 'bandeja-de-entrada-ausente',
    rotulo: 'Bandeja de entrada ausente',
    severidade: 'critico',
  },
  {
    bit: 9,
    chave: 'bandeja-de-saida-ausente',
    rotulo: 'Bandeja de saída ausente',
    severidade: 'atencao',
  },
  {
    bit: 10,
    chave: 'suprimento-ausente',
    rotulo: 'Suprimento de impressão ausente',
    severidade: 'critico',
  },
  {
    bit: 11,
    chave: 'bandeja-de-saida-quase-cheia',
    rotulo: 'Bandeja de saída quase cheia',
    severidade: 'atencao',
  },
  {
    bit: 12,
    chave: 'bandeja-de-saida-cheia',
    rotulo: 'Bandeja de saída cheia',
    severidade: 'critico',
  },
  {
    bit: 13,
    chave: 'bandeja-de-entrada-vazia',
    rotulo: 'Bandeja de entrada vazia',
    severidade: 'atencao',
  },
  {
    bit: 14,
    chave: 'manutencao-vencida',
    rotulo: 'Manutenção preventiva vencida',
    severidade: 'atencao',
  },
];

/**
 * As chaves das condições ativas no campo de bits que a impressora informa
 * (hrPrinterDetectedErrorState), na ordem dos bits. O octeto que falta não tem as condições dele.
 */
export function condicoesDosBits(octetos: ArrayLike<number>): string[] {
  return CONDICOES_DA_IMPRESSORA.filter(({ bit }) => {
    const octeto = Math.floor(bit / 8);
    return octeto < octetos.length && ((octetos[octeto] ?? 0) & (0x80 >> (bit % 8))) !== 0;
  }).map((condicao) => condicao.chave);
}

/** Um contador da impressora, pelo índice do marcador, com as cores dele, quando informadas. */
export interface ContadorDaImpressora {
  item: number;
  paginas: number | null;
  cores?: number | null;
}

/** O nome de cada contador, pela posição: o total, as coloridas e os outros, com o número. */
const rotuloDoContador = (posicao: number, item: number) =>
  posicao === 0 ? 'Total de páginas' : posicao === 1 ? 'Páginas coloridas' : `Contador ${item}`;

/** Os contadores como o painel os mostra, na ordem dos marcadores, cada um independente do outro. */
export function contadoresDaImpressora(
  contadores: readonly ContadorDaImpressora[],
): { item: number; rotulo: string; paginas: number | null }[] {
  return [...contadores]
    .sort((a, b) => a.item - b.item)
    .map(({ item, paginas }, posicao) => ({
      item,
      rotulo: rotuloDoContador(posicao, item),
      paginas,
    }));
}

/**
 * As páginas em preto e branco: o total menos as coloridas, quando a impressora informa os dois; o
 * total, na impressora que diz ter uma cor só e não informa as coloridas; nada, na colorida sem o
 * contador de cor.
 */
export function paginasEmPretoEBranco(contadores: readonly ContadorDaImpressora[]): number | null {
  const [total, coloridas] = [...contadores].sort((a, b) => a.item - b.item);
  if (!total || total.paginas === null) return null;
  if (coloridas && coloridas.paginas !== null) {
    const diferenca = total.paginas - coloridas.paginas;
    return diferenca >= 0 ? diferenca : null;
  }
  return total.cores === 1 ? total.paginas : null;
}
