// A saúde do coletor (spec plataforma-base, "Saúde dos serviços"; design do P2a, decisão 8): a versão,
// a última configuração com quantos alvos ela trouxe, o último lote aceito, a fila em disco com os
// descartados e o token recusado. O token recusado ou a API sem responder há mais de 10 min dizem
// "degradado", sem código de erro, porque o coletor continua guardando as leituras. Nunca mostra o
// token, as faixas nem os IPs.
import type { Agendador } from './agendador.ts';
import type { EstadoDaConfiguracao } from './configuracao.ts';
import type { EstadoDaFila } from './fila.ts';

export interface EstadoDoColetor {
  configuracao: EstadoDaConfiguracao;
  fila: EstadoDaFila;
  agendador: ReturnType<Agendador['estado']>;
}

export interface SaudeDoColetor {
  status: 'ok' | 'degradado';
  versao: string;
  configuracao: { recebidaEm: string | null; alvos: number };
  lotes: { ultimoAceitoEm: string | null; naFila: number; descartados: number };
  tokenRecusado: boolean;
  /** Desde quando a API não responde à configuração ou aos lotes, o que vier primeiro. */
  apiSemResponderDesde: string | null;
}

/** A API sem responder por mais que isso deixa o coletor degradado, em ms. */
const API_FORA_DEGRADA = 10 * 60_000;

export function saudeDoColetor({
  versao,
  estado,
  agora,
}: {
  versao: string;
  estado: EstadoDoColetor;
  agora: Date;
}): SaudeDoColetor {
  const { configuracao, fila } = estado;
  const tokenRecusado = configuracao.tokenRecusado || fila.tokenRecusado;
  const desde =
    [configuracao.apiSemResponderDesde, fila.apiSemResponderDesde]
      .filter((momento): momento is Date => momento !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const apiFora = desde !== null && agora.getTime() - desde.getTime() > API_FORA_DEGRADA;
  return {
    status: tokenRecusado || apiFora ? 'degradado' : 'ok',
    versao,
    configuracao: {
      recebidaEm: configuracao.ultimaConfiguracao?.toISOString() ?? null,
      alvos: configuracao.alvos.length,
    },
    lotes: {
      ultimoAceitoEm: fila.ultimoLoteAceito?.toISOString() ?? null,
      naFila: fila.naFila,
      descartados: fila.descartados,
    },
    tokenRecusado,
    apiSemResponderDesde: desde?.toISOString() ?? null,
  };
}
