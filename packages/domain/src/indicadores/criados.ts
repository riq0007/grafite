// Os indicadores criados pela organização (spec indicadores, "Indicadores da organização" e
// "Backups do Control iD em dia"; change regras-indicadores-e-tarefas, design, decisão 3): uma
// medida do sistema, com um recorte opcional (o tipo ou o modelo, e o local), a meta e o nome. As
// medidas são as quatro dos alertas, com o cálculo delas, e a dos backups do Control iD em dia. O
// nome repetido e o registro inativo do recorte, a API confere no banco.
import { cortar, type ResultadoDoIndicador } from './calculo.ts';
import {
  DEFINICOES_DOS_INDICADORES,
  type DefinicaoDoIndicador,
  INDICADORES_DOS_ALERTAS,
} from './indicadores.ts';

export const MEDIDAS_DOS_INDICADORES_CRIADOS = [
  ...INDICADORES_DOS_ALERTAS,
  'backups-do-control-id',
] as const;

export type MedidaDoIndicadorCriado = (typeof MEDIDAS_DOS_INDICADORES_CRIADOS)[number];

/** A medida dos backups do Control iD em dia: a parte dos controles com um backup bom em 26 h. */
export const DEFINICAO_DOS_BACKUPS: DefinicaoDoIndicador = {
  nome: 'Backups do Control iD em dia',
  mede: 'Os controles com um backup bom nas últimas 26 horas, entre os que têm o backup ligado.',
  unidade: 'por-mil',
  metaDeFabrica: 1000,
  limites: [500, 1000],
  limitesEmTexto: ['50%', '100%'],
  decisao: 'Confira o coletor e o login desses controles, ou peça o backup pela ficha deles.',
};

export const definicaoDaMedida = (medida: MedidaDoIndicadorCriado): DefinicaoDoIndicador =>
  medida === 'backups-do-control-id' ? DEFINICAO_DOS_BACKUPS : DEFINICOES_DOS_INDICADORES[medida];

export const medidaValida = (valor: unknown): valor is MedidaDoIndicadorCriado =>
  (MEDIDAS_DOS_INDICADORES_CRIADOS as readonly unknown[]).includes(valor);

/** O recorte do indicador: o tipo ou o modelo, e o local com os de baixo; nenhum é todos. */
export interface RecorteDoIndicador {
  tipoId: string | null;
  modeloId: string | null;
  localId: string | null;
}

export interface DadosDoIndicadorCriado {
  nome: string;
  medida: MedidaDoIndicadorCriado;
  recorte: RecorteDoIndicador;
  /** Na unidade da medida, como as metas dos indicadores. */
  meta: number;
}

export type CampoDoIndicadorCriado = 'nome' | 'medida' | 'tipo' | 'modelo' | 'local' | 'meta';

export type ConferenciaDoIndicadorCriado =
  | { ok: true; dados: DadosDoIndicadorCriado }
  | { ok: false; erros: Partial<Record<CampoDoIndicadorCriado, string>> };

/** As mensagens do recorte que falta ou está inativo, que a API também usa. */
export const MENSAGENS_DO_RECORTE = {
  tipo: 'Escolha um tipo ativo.',
  modelo: 'Escolha um modelo ativo.',
  local: 'Escolha um local ativo.',
} as const;

export const MENSAGEM_DO_NOME_DO_INDICADOR_REPETIDO = 'Já existe um indicador com esse nome.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const objeto = (valor: unknown): Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};

/** Confere o indicador que chega da tela ou da API. */
export function conferirIndicadorCriado(
  entrada: Record<string, unknown>,
): ConferenciaDoIndicadorCriado {
  const erros: Partial<Record<CampoDoIndicadorCriado, string>> = {};
  const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : '';
  if (nome === '') erros.nome = 'Informe o nome do indicador.';
  else if (nome.length > 80) erros.nome = 'Use até 80 caracteres no nome.';

  const medida = medidaValida(entrada.medida) ? entrada.medida : null;
  if (medida === null) erros.medida = 'Escolha a medida.';

  const lido = objeto(entrada.recorte);
  const id = (campo: 'tipo' | 'modelo' | 'local'): string | null => {
    const valor = lido[`${campo}Id`];
    if (valor === undefined || valor === null || valor === '') return null;
    if (typeof valor === 'string' && UUID.test(valor)) return valor;
    erros[campo] = MENSAGENS_DO_RECORTE[campo];
    return null;
  };
  const recorte: RecorteDoIndicador = {
    tipoId: id('tipo'),
    modeloId: id('modelo'),
    localId: id('local'),
  };
  if (recorte.tipoId !== null && recorte.modeloId !== null) {
    erros.modelo = 'Escolha o tipo ou o modelo, não os dois.';
  }

  let meta: number | null = null;
  if (medida !== null) {
    const {
      limites: [minimo, maximo],
      limitesEmTexto: [deTexto, ateTexto],
    } = definicaoDaMedida(medida);
    const valor = entrada.meta;
    if (typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo)
      meta = valor;
    else erros.meta = `A meta deve ficar entre ${deTexto} e ${ateTexto}.`;
  }

  if (Object.keys(erros).length > 0 || medida === null || meta === null)
    return { ok: false, erros };
  return { ok: true, dados: { nome, medida, recorte, meta } };
}

/** Um controle na lista dos backups: o último backup bom, ou nenhum. */
export interface ItemDosBackups<A> {
  alvo: A;
  ultimoBom: Date | null;
}

/** O backup bom serve por 26 horas: o diário das 02:00 com folga. */
const PRAZO_DO_BACKUP = 26 * 60 * 60 * 1000;

/**
 * Os backups do Control iD em dia: a parte dos controles, em décimos de ponto percentual, com um
 * backup com sucesso ou parcial nas últimas 26 horas. A lista traz os outros, primeiro os sem nenhum
 * backup e depois do mais antigo para o mais novo. Sem controles com o backup ligado, sem dado.
 */
export function indicadorDosBackups<A>(
  controles: readonly ItemDosBackups<A>[],
  agora: Date,
  meta: number,
): ResultadoDoIndicador<ItemDosBackups<A>> {
  if (controles.length === 0)
    return { valor: null, anterior: null, base: 0, situacao: 'sem-dado', itens: [], mais: 0 };
  const emDia = (controle: ItemDosBackups<A>) =>
    controle.ultimoBom !== null &&
    agora.getTime() - controle.ultimoBom.getTime() <= PRAZO_DO_BACKUP;
  const atrasados = controles
    .filter((controle) => !emDia(controle))
    .sort((a, b) => (a.ultimoBom?.getTime() ?? 0) - (b.ultimoBom?.getTime() ?? 0));
  const valor = Math.floor(((controles.length - atrasados.length) * 1000) / controles.length);
  return {
    valor,
    anterior: null,
    base: controles.length,
    situacao: valor >= meta ? 'dentro' : 'fora',
    ...cortar(atrasados),
  };
}
