// A configuração da coleta no coletor (spec coletor-local, "Configuração da coleta"; design do P2a,
// decisão 8): buscada na partida e a cada 5 minutos, ou no prazo que a API der. Cada alvo é
// conferido de novo contra as faixas do coletor, e o que estiver fora é recusado. Com o token
// recusado, o coletor para de coletar e pede de novo a cada minuto; com a API fora do ar, ele
// continua com os alvos de antes. A coleta SNMP traz a versão e a comunidade (design do P2b, decisão
// 4), e a sondagem do Control iD, a porta, o usuário e a senha (design do P2c, decisão 3), que ficam
// só na memória.
import { ipNaFaixa, type VersaoDoSnmp } from '@grafite/domain';
import type { RespostaDaApi } from './api.ts';

/**
 * O que ler no alvo: o ping; a impressora pelo SNMP, com a versão e a comunidade; ou o controle de
 * acesso pela sondagem, com a porta, o usuário e a senha.
 */
export type Coleta =
  | { tipo: 'ping' }
  | { tipo: 'snmp'; versao: VersaoDoSnmp; comunidade: string }
  | { tipo: 'controlid'; porta: number; usuario: string; senha: string };

/** Uma coleta do alvo, com o intervalo dela. */
export type ColetaDoAlvo = Coleta & {
  /** Em segundos. */
  intervalo: number;
};

export interface AlvoDaColeta {
  ativoId: string;
  ip: string;
  coletas: ColetaDoAlvo[];
}

export interface ConfiguracaoDaColeta {
  faixas: string[];
  alvos: AlvoDaColeta[];
  /** Em segundos. */
  proximaEm: number;
}

export interface EstadoDaConfiguracao {
  alvos: AlvoDaColeta[];
  ultimaConfiguracao: Date | null;
  tokenRecusado: boolean;
  /** Desde quando a API não responde, ou `null` quando ela respondeu no último pedido. */
  apiSemResponderDesde: Date | null;
}

export interface Registro {
  info: (dados: object, mensagem: string) => void;
  warn: (dados: object, mensagem: string) => void;
}

/** Em quanto tempo pedir de novo depois de uma falha, em ms. */
const DEPOIS_DE_FALHAR = 60_000;

export function criarFonteDaConfiguracao({
  api,
  agora,
  log,
}: {
  api: { configuracao: () => Promise<RespostaDaApi<ConfiguracaoDaColeta>> };
  agora: () => Date;
  log: Registro;
}) {
  let estado: EstadoDaConfiguracao = {
    alvos: [],
    ultimaConfiguracao: null,
    tokenRecusado: false,
    apiSemResponderDesde: null,
  };

  /** Busca a configuração e devolve em quantos ms buscar de novo. */
  async function buscar(): Promise<number> {
    const resposta = await api.configuracao();
    if (resposta.tipo === 'token-recusado') {
      if (!estado.tokenRecusado) log.warn({}, 'token do coletor recusado pela API');
      estado = { ...estado, alvos: [], tokenRecusado: true, apiSemResponderDesde: null };
      return DEPOIS_DE_FALHAR;
    }
    if (resposta.tipo !== 'ok') {
      log.warn({ motivo: resposta.motivo }, 'configuração da coleta indisponível');
      estado = { ...estado, apiSemResponderDesde: estado.apiSemResponderDesde ?? agora() };
      return DEPOIS_DE_FALHAR;
    }
    const { faixas, alvos, proximaEm } = resposta.dados;
    const dentro = alvos.filter((alvo) => {
      const alcancado = faixas.some((faixa) => ipNaFaixa(alvo.ip, faixa));
      if (!alcancado) {
        log.warn(
          { ativoId: alvo.ativoId, ip: alvo.ip },
          'alvo fora das faixas do coletor recusado',
        );
      }
      return alcancado;
    });
    estado = {
      alvos: dentro,
      ultimaConfiguracao: agora(),
      tokenRecusado: false,
      apiSemResponderDesde: null,
    };
    log.info({ alvos: dentro.length }, 'configuração da coleta recebida');
    return proximaEm * 1000;
  }

  return { buscar, estado: () => estado };
}

export type FonteDaConfiguracao = ReturnType<typeof criarFonteDaConfiguracao>;
