// Os alertas em "O que resolver agora" (spec modulo-alertas, "Ocorrências em 'O que resolver
// agora'"; change p3a-regras-e-alertas, design, decisão 11): a fonte do módulo lê os alertas abertos
// que a conta vê, sem os adiados e sem os dos ativos silenciados, página a página até o teto da
// tela inicial, e o evento `alertas.mudaram` a faz ler de novo, como no fim de um adiamento.
import type { OcorrenciaAberta } from '@grafite/ui';
import type { FonteDeOcorrencias } from '../tipos.ts';
import type { AlertaNaLista } from './consultas.ts';
import { destinoDoAlvo, miniaturaDoAlvo } from './textos.ts';

/** Quantos alertas a tela inicial mostra, no máximo. */
export const TETO_DA_TELA_INICIAL = 500;

const POR_PAGINA = 100;

/** O alerta como uma ocorrência: o ativo, ou o coletor com a imagem genérica, e quando abriu. */
export function ocorrenciaDo(alerta: AlertaNaLista): OcorrenciaAberta {
  const { tipo, imagemDoAtivo, imagemDoModelo } = miniaturaDoAlvo(alerta.alvo);
  return {
    id: alerta.id,
    severidade: alerta.severidade,
    texto: alerta.texto,
    ativo:
      alerta.alvo.tipo === 'ativo'
        ? { nome: alerta.alvo.nome, tipo, imagemDoAtivo, imagemDoModelo }
        : { nome: alerta.alvo.nome, tipo },
    desde: new Date(alerta.abertoEm),
    destino: destinoDoAlvo(alerta.alvo),
  };
}

export const fonteDosAlertas: FonteDeOcorrencias = {
  permissoes: ['alertas.ver', 'alertas.tratar', 'alertas.administrar'],
  buscar: async (sinal, { api }) => {
    const alertas: AlertaNaLista[] = [];
    let cursor: string | undefined;
    do {
      const { data } = await api.GET('/alertas', {
        params: {
          query: { situacao: 'abertos', paraResolver: 'true', limite: POR_PAGINA, cursor },
        },
        signal: sinal,
      });
      if (!data) throw new Error('Não foi possível carregar os alertas.');
      alertas.push(...data.itens);
      cursor = data.proximo ?? undefined;
    } while (cursor && alertas.length < TETO_DA_TELA_INICIAL);
    return alertas.slice(0, TETO_DA_TELA_INICIAL).map(ocorrenciaDo);
  },
  assinar: (aoMudar, { canal }) => canal.ouvir('alertas.mudaram', aoMudar),
};
