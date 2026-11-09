// O coletor (spec coletor-local, disponibilidade-de-rede, impressoras-por-snmp e saude-do-control-id;
// design do P2a, decisão 8, do P2b, decisões 4 e 5, e do P2c, decisão 4): liga a configuração, o
// agendador, o ping, a leitura SNMP, a sondagem do Control iD, o juntador dos lotes e a fila em
// disco. A configuração vem na partida e no prazo que a API der, e a
// coleta de um tipo que este coletor ainda não conhece fica de fora. Com o token recusado, na
// configuração ou num lote, o coletor para de coletar, guarda a fila e volta sozinho quando a API
// aceitar o token de novo.

import { type AlvoAgendado, criarAgendador } from './agendador.ts';
import type { RespostaDaApi } from './api.ts';
import {
  type AlvoDaColeta,
  type ConfiguracaoDaColeta,
  criarFonteDaConfiguracao,
  type Registro,
} from './configuracao.ts';
import {
  leiturasDoControle,
  type PedidoDaSondagem,
  type SondagemLida,
  sondarControle,
} from './control-id.ts';
import { criarFila } from './fila.ts';
import { criarJuntador, type LoteParaEnviar } from './lotes.ts';
import { executarPing, leiturasDoPing, type ResultadoDoPing } from './ping.ts';
import { type LeituraSnmp, leiturasDaImpressora, lerImpressora, type PedidoSnmp } from './snmp.ts';

/** Em quanto tempo buscar a configuração de novo depois de uma falha inesperada, em ms. */
const DEPOIS_DE_FALHAR = 60_000;

/** Cada coleta de cada alvo, no intervalo dela. */
const alvosAgendados = (alvos: AlvoDaColeta[]): AlvoAgendado[] =>
  alvos.flatMap(({ ativoId, ip, coletas }) =>
    coletas.flatMap((coleta): AlvoAgendado[] => {
      const intervalo = coleta.intervalo * 1000;
      switch (coleta.tipo) {
        case 'ping':
          return [{ ativoId, ip, intervalo, coleta: { tipo: 'ping' } }];
        case 'snmp': {
          const { versao, comunidade } = coleta;
          return [{ ativoId, ip, intervalo, coleta: { tipo: 'snmp', versao, comunidade } }];
        }
        case 'controlid': {
          const { porta, usuario, senha } = coleta;
          return [{ ativoId, ip, intervalo, coleta: { tipo: 'controlid', porta, usuario, senha } }];
        }
        default:
          return [];
      }
    }),
  );

export function criarColetor({
  api,
  pasta,
  agora = () => new Date(),
  log,
  ping = (ip) => executarPing(ip),
  snmp = (pedido) => lerImpressora(pedido),
  controlId = (pedido) => sondarControle(pedido),
  aleatorio = Math.random,
}: {
  api: {
    configuracao: () => Promise<RespostaDaApi<ConfiguracaoDaColeta>>;
    lote: (lote: LoteParaEnviar) => Promise<RespostaDaApi<unknown>>;
  };
  pasta: string;
  agora?: () => Date;
  log: Registro;
  ping?: (ip: string) => Promise<ResultadoDoPing>;
  snmp?: (pedido: PedidoSnmp) => Promise<LeituraSnmp>;
  controlId?: (pedido: PedidoDaSondagem) => Promise<SondagemLida>;
  aleatorio?: () => number;
}) {
  const fonte = criarFonteDaConfiguracao({ api, agora, log });
  const fila = criarFila({
    pasta,
    api,
    agora,
    log,
    aoRecusarToken: () => void buscarConfiguracao(),
  });
  const juntador = criarJuntador({ guardar: (lote) => fila.guardar(lote) });
  const agendador = criarAgendador({
    aleatorio,
    executar: async ({ ativoId, ip, coleta }) => {
      const momento = agora();
      if (coleta.tipo === 'ping') {
        juntador.adicionar(leiturasDoPing(ativoId, await ping(ip), momento));
        return;
      }
      if (coleta.tipo === 'snmp') {
        const { versao, comunidade } = coleta;
        const lida = await snmp({ ip, versao, comunidade });
        juntador.adicionar(leiturasDaImpressora(ativoId, lida, momento));
        return;
      }
      const { porta, usuario, senha } = coleta;
      // A sondagem que falha no próprio coletor vai sem valor: "sem dado".
      const sondada = await controlId({ ip, porta, usuario, senha }).catch(() => null);
      juntador.adicionar(leiturasDoControle(ativoId, sondada, momento));
    },
  });
  let proxima: ReturnType<typeof setTimeout> | null = null;
  let buscando: Promise<void> | null = null;
  let parado = false;

  function marcarBusca(espera: number) {
    if (proxima) clearTimeout(proxima);
    proxima = setTimeout(() => void buscarConfiguracao(), espera);
  }

  /** Busca a configuração, troca os alvos e marca a busca seguinte; uma busca por vez. */
  function buscarConfiguracao(): Promise<void> {
    buscando ??= (async () => {
      try {
        const espera = await fonte.buscar();
        if (parado) return;
        const { alvos, tokenRecusado } = fonte.estado();
        agendador.definirAlvos(alvosAgendados(alvos));
        if (!tokenRecusado) fila.retomar();
        marcarBusca(espera);
      } catch (erro) {
        log.warn({ motivo: String(erro) }, 'falha ao aplicar a configuração da coleta');
        if (!parado) marcarBusca(DEPOIS_DE_FALHAR);
      } finally {
        buscando = null;
      }
    })();
    return buscando;
  }

  return {
    async iniciar() {
      parado = false;
      await fila.iniciar();
      void fila.esvaziar();
      await buscarConfiguracao();
    },
    buscarConfiguracao,
    /** Fecha agora o lote com as leituras juntadas. */
    fecharLote: () => juntador.fechar(),
    /** Para de coletar e de mandar, e guarda na fila as leituras que ainda não viraram lote. */
    async parar() {
      parado = true;
      if (proxima) clearTimeout(proxima);
      proxima = null;
      agendador.parar();
      await buscando;
      await fila.parar();
      await juntador.encerrar();
    },
    estado: () => ({
      configuracao: fonte.estado(),
      fila: fila.estado(),
      agendador: agendador.estado(),
    }),
  };
}

export type Coletor = ReturnType<typeof criarColetor>;
