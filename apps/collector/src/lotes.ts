// Os lotes de leituras (spec coletor-local, "Lotes de leituras"; design do P2a, decisão 8): o coletor
// junta as leituras e fecha um lote a cada 10 s, enquanto houver leituras novas, ou logo que juntar
// 1.000. Cada lote tem uma chave nova, que torna o reenvio inofensivo, e vai para a fila em disco,
// que o manda.
import { randomUUID } from 'node:crypto';
import { type DetalhesDaLeitura, LIMITE_DO_LOTE, type MetricaDaColeta } from '@grafite/domain';

/** A leitura como vai no lote para a API. */
export interface LeituraParaEnviar {
  ativoId: string;
  metrica: MetricaDaColeta;
  /** O item, como o suprimento ou o contador, nas métricas que têm vários por ativo. */
  item?: string;
  momento: string;
  /** O valor; as condições e as mensagens da impressora vão numa lista. */
  valor: string | number | string[] | null;
  /** Os detalhes do item, como a descrição, a capacidade e o nível de um suprimento. */
  detalhes?: DetalhesDaLeitura;
}

export interface LoteParaEnviar {
  chave: string;
  leituras: LeituraParaEnviar[];
}

/** De quanto em quanto tempo o lote fecha, em ms. */
const INTERVALO = 10_000;

export function criarJuntador({
  guardar,
  novaChave = randomUUID,
  intervalo = INTERVALO,
  limite = LIMITE_DO_LOTE,
}: {
  /** Guarda o lote na fila; nunca lança, a falha fica no log da fila. */
  guardar: (lote: LoteParaEnviar) => Promise<void>;
  novaChave?: () => string;
  intervalo?: number;
  limite?: number;
}) {
  let leituras: LeituraParaEnviar[] = [];

  async function fecharAte(minimo: number) {
    while (leituras.length > 0 && leituras.length >= minimo) {
      const lote = { chave: novaChave(), leituras: leituras.slice(0, limite) };
      leituras = leituras.slice(limite);
      await guardar(lote);
    }
  }

  /** Fecha agora as leituras juntadas, em lotes de até 1.000. */
  const fechar = () => fecharAte(1);

  const relogio = setInterval(() => void fechar(), intervalo);

  return {
    adicionar(novas: LeituraParaEnviar[]) {
      leituras.push(...novas);
      if (leituras.length >= limite) void fecharAte(limite);
    },
    fechar,
    /** Para o relógio e guarda o que ainda não virou lote. */
    async encerrar() {
      clearInterval(relogio);
      await fechar();
    },
  };
}

export type Juntador = ReturnType<typeof criarJuntador>;
