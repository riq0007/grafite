// O editor de filtro sem a tela (spec tabelas-configuraveis): os operadores de cada tipo de coluna,
// o rascunho que o editor mostra, o número como o pt-BR escreve e o filtro montado do rascunho, com
// as recusas no campo de cada uma. As mensagens são as mesmas da leitura do filtro no domínio.

/** O tipo do filtro de uma coluna, como a tabela com visões o declara. */
export type TipoDoFiltro =
  | 'texto'
  | 'numero'
  | 'data'
  | 'momento'
  | 'escolha'
  | 'local'
  | 'situacao';

/** Um filtro sobre a coluna, pelo operador. O intervalo é de números ou de datas em aaaa-mm-dd. */
export type FiltroDoEditor =
  | { operador: 'contem'; texto: string }
  | { operador: 'vazio' }
  | { operador: 'preenchido' }
  | { operador: 'entre'; de?: number | string; ate?: number | string }
  | { operador: 'qualquer'; valores: string[] }
  | { operador: 'em'; local: string }
  | { operador: 'situacao'; situacao: string };

export type OperadorDoEditor = FiltroDoEditor['operador'];

const OPERADOR_DO_TIPO = {
  texto: 'contem',
  numero: 'entre',
  data: 'entre',
  momento: 'entre',
  escolha: 'qualquer',
  local: 'em',
  situacao: 'situacao',
} as const satisfies Record<TipoDoFiltro, OperadorDoEditor>;

/** Os operadores da coluna: o do tipo dela e, se ela pode ficar sem valor, vazio e preenchido. */
export function operadoresDoEditor(
  tipo: TipoDoFiltro | null,
  podeFicarVazia: boolean,
): OperadorDoEditor[] {
  return [
    ...(tipo ? [OPERADOR_DO_TIPO[tipo]] : []),
    ...(podeFicarVazia ? (['vazio', 'preenchido'] as const) : []),
  ];
}

/** O que o editor mostra: o operador e os campos do valor como o usuário os escreve. */
export interface RascunhoDoFiltro {
  operador: OperadorDoEditor;
  texto: string;
  /** Os limites do intervalo: o número como se digita, ou a data em aaaa-mm-dd; vazio sem limite. */
  de: string;
  ate: string;
  valores: string[];
  local: string | null;
  situacao: string | null;
}

export type CampoDoFiltro = 'texto' | 'de' | 'ate' | 'valores' | 'local' | 'situacao';

export type ErrosDoFiltro = Partial<Record<CampoDoFiltro, string>>;

const LIMITE_DO_TEXTO = 200;
const LIMITE_DE_OPCOES = 100;

const NUMERO = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

/** O número como o pt-BR escreve ("1.000,50", "R$ 2.500,00"), ou `null` se não for um. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.replace(/R\$/g, '').replace(/\s/g, '');
  if (!NUMERO.test(limpo)) return null;
  return Number(limpo.replace(/\./g, '').replace(',', '.'));
}

/** O número de um filtro salvo, como o campo o mostra. */
export function escreverNumero(numero: number): string {
  return String(numero).replace('.', ',');
}

/** O rascunho de um filtro que já existe, ou o novo, no operador do tipo da coluna. */
export function rascunhoDe(
  filtro: FiltroDoEditor | null | undefined,
  tipo: TipoDoFiltro | null,
  podeFicarVazia: boolean,
): RascunhoDoFiltro {
  const rascunho: RascunhoDoFiltro = {
    operador: filtro?.operador ?? operadoresDoEditor(tipo, podeFicarVazia)[0] ?? 'vazio',
    texto: '',
    de: '',
    ate: '',
    valores: [],
    local: null,
    situacao: null,
  };
  const limite = (valor: number | string | undefined) =>
    typeof valor === 'number' ? escreverNumero(valor) : (valor ?? '');
  switch (filtro?.operador) {
    case 'contem':
      return { ...rascunho, texto: filtro.texto };
    case 'entre':
      return { ...rascunho, de: limite(filtro.de), ate: limite(filtro.ate) };
    case 'qualquer':
      return { ...rascunho, valores: [...filtro.valores] };
    case 'em':
      return { ...rascunho, local: filtro.local };
    case 'situacao':
      return { ...rascunho, situacao: filtro.situacao };
    default:
      return rascunho;
  }
}

/** O intervalo do rascunho, com os números lidos ou as datas como estão. */
function montarIntervalo(
  rascunho: RascunhoDoFiltro,
  tipo: TipoDoFiltro | null,
): { filtro: FiltroDoEditor } | { erros: ErrosDoFiltro } {
  const { de, ate } = rascunho;
  if (de === '' && ate === '') return { erros: { de: 'Informe o início ou o fim do intervalo.' } };
  const erros: ErrosDoFiltro = {};
  const ler = (texto: string, campo: 'de' | 'ate'): number | string | undefined => {
    if (texto === '') return undefined;
    if (tipo !== 'numero') return texto;
    const numero = lerNumero(texto);
    if (numero === null) erros[campo] = 'Use um número.';
    return numero ?? undefined;
  };
  const inicio = ler(de, 'de');
  const fim = ler(ate, 'ate');
  if (erros.de || erros.ate) return { erros };
  if (inicio !== undefined && fim !== undefined && inicio > fim) {
    return { erros: { ate: 'O início vem depois do fim.' } };
  }
  return {
    filtro: {
      operador: 'entre',
      ...(inicio === undefined ? {} : { de: inicio }),
      ...(fim === undefined ? {} : { ate: fim }),
    },
  };
}

/** O filtro do rascunho, ou as recusas pelo campo de cada uma. */
export function montarFiltro(
  rascunho: RascunhoDoFiltro,
  tipo: TipoDoFiltro | null,
): { filtro: FiltroDoEditor } | { erros: ErrosDoFiltro } {
  switch (rascunho.operador) {
    case 'contem': {
      const texto = rascunho.texto.trim();
      if (texto === '') return { erros: { texto: 'Digite o texto do filtro.' } };
      if (texto.length > LIMITE_DO_TEXTO) {
        return { erros: { texto: 'Use até 200 caracteres no filtro.' } };
      }
      return { filtro: { operador: 'contem', texto } };
    }
    case 'entre':
      return montarIntervalo(rascunho, tipo);
    case 'qualquer':
      if (rascunho.valores.length === 0) {
        return { erros: { valores: 'Escolha pelo menos uma opção.' } };
      }
      if (rascunho.valores.length > LIMITE_DE_OPCOES) {
        return { erros: { valores: 'Escolha até 100 opções.' } };
      }
      return { filtro: { operador: 'qualquer', valores: [...rascunho.valores] } };
    case 'em':
      return rascunho.local
        ? { filtro: { operador: 'em', local: rascunho.local } }
        : { erros: { local: 'Escolha um local.' } };
    case 'situacao':
      return rascunho.situacao
        ? { filtro: { operador: 'situacao', situacao: rascunho.situacao } }
        : { erros: { situacao: 'Escolha uma situação da lista.' } };
    default:
      return { filtro: { operador: rascunho.operador } };
  }
}
