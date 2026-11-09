// Os filtros da auditoria (spec consulta-da-auditoria; design do F2b, decisões 13 e 15), na query
// string: voltar do detalhe traz a lista como estava, e o histórico de uma ficha chega já filtrado
// pelo alvo. O período personalizado guarda as datas, e a consulta as converte no fuso escolhido.
import type { DataHora } from '@grafite/ui';

export type Periodo = '24h' | '7d' | '30d' | 'personalizado';

/** Os períodos, na ordem da escolha; sem período, "Tudo". */
export const PERIODOS: Record<Periodo | 'tudo', string> = {
  tudo: 'Tudo',
  '24h': 'Últimas 24 horas',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  personalizado: 'Personalizado',
};

const DURACOES: Record<Exclude<Periodo, 'personalizado'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export interface FiltrosDaAuditoria {
  periodo?: Periodo;
  /** As datas do período personalizado, `aaaa-mm-dd`, no fuso escolhido; as duas incluídas. */
  de?: string;
  ate?: string;
  /** Quem fez: o id da conta e o nome dela, para o filtro à vista. */
  ator?: string;
  quem?: string;
  /** A chave da ação, como `entrada.recusada`. */
  acao?: string;
  rastreio?: string;
  /** Os alvos, como `pessoa:<id>` e `conta:<id>`: a lista traz os registros de qualquer um deles. */
  alvo?: string[];
  /** O nome do registro dos alvos, como "João da Silva", para o filtro à vista. */
  nomeDoAlvo?: string;
  ordem?: 'antigos';
}

const ALVO = /^[a-z]+(?:-[a-z]+)*:[\w-]+$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const ACAO = /^[a-z-]+\.[a-z-]+$/;
const ID = /^[\w-]+$/;

const texto = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;

export function validarFiltrosDaAuditoria(busca: Record<string, unknown>): FiltrosDaAuditoria {
  const filtros: FiltrosDaAuditoria = {};
  if (busca.periodo === '24h' || busca.periodo === '7d' || busca.periodo === '30d') {
    filtros.periodo = busca.periodo;
  }
  if (busca.periodo === 'personalizado') {
    filtros.periodo = 'personalizado';
    if (typeof busca.de === 'string' && DIA.test(busca.de)) filtros.de = busca.de;
    if (typeof busca.ate === 'string' && DIA.test(busca.ate)) filtros.ate = busca.ate;
  }
  const ator = texto(busca.ator);
  if (ator && ID.test(ator)) {
    filtros.ator = ator;
    const quem = texto(busca.quem);
    if (quem) filtros.quem = quem;
  }
  const acao = texto(busca.acao);
  if (acao && ACAO.test(acao)) filtros.acao = acao;
  const rastreio = texto(busca.rastreio);
  if (rastreio) filtros.rastreio = rastreio.trim();
  const alvos = (Array.isArray(busca.alvo) ? busca.alvo : [busca.alvo]).filter(
    (alvo): alvo is string => typeof alvo === 'string' && ALVO.test(alvo),
  );
  if (alvos.length > 0) {
    filtros.alvo = alvos;
    const nome = texto(busca.nomeDoAlvo);
    if (nome) filtros.nomeDoAlvo = nome;
  }
  if (busca.ordem === 'antigos') filtros.ordem = 'antigos';
  return filtros;
}

/**
 * O período como instantes para a API: os relativos contam a partir de `agora`, e as datas do
 * personalizado viram o começo e o fim do dia no fuso escolhido.
 */
export function intervaloDo(
  filtros: Pick<FiltrosDaAuditoria, 'periodo' | 'de' | 'ate'>,
  dataHora: Pick<DataHora, 'inicioDoDia' | 'fimDoDia'>,
  agora: Date,
): { de?: string; ate?: string } {
  if (!filtros.periodo) return {};
  if (filtros.periodo !== 'personalizado') {
    return { de: new Date(agora.getTime() - DURACOES[filtros.periodo]).toISOString() };
  }
  return {
    ...(filtros.de && { de: dataHora.inicioDoDia(filtros.de).toISOString() }),
    ...(filtros.ate && { ate: dataHora.fimDoDia(filtros.ate).toISOString() }),
  };
}

/** "01/10/2026", de `aaaa-mm-dd`. */
const comoData = (dia: string) => dia.split('-').reverse().join('/');

/** O período nos filtros ativos, ou `null` em "Tudo". */
export function textoDoPeriodo(
  filtros: Pick<FiltrosDaAuditoria, 'periodo' | 'de' | 'ate'>,
): string | null {
  if (!filtros.periodo) return null;
  if (filtros.periodo !== 'personalizado') return PERIODOS[filtros.periodo];
  if (filtros.de && filtros.ate) return `${comoData(filtros.de)} a ${comoData(filtros.ate)}`;
  if (filtros.de) return `A partir de ${comoData(filtros.de)}`;
  if (filtros.ate) return `Até ${comoData(filtros.ate)}`;
  return PERIODOS.personalizado;
}
