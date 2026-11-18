// A conta do prazo dos chamados nas telas (spec modulo-chamados, "Selos, prazo em texto e
// movimento"; change chamados-da-ti, design, decisões 20 e 22): o relógio da resposta da API, com
// os instantes em datas, a situação do prazo agora, que anda na virada do minuto, e o selo dela.
import type { components } from '@grafite/api-client';
import {
  type HorarioDaTi,
  type RelogioDoChamado,
  type SituacaoDoPrazo,
  situacaoDoPrazo,
} from '@grafite/domain';
import { type Situacao, useDataHora } from '@grafite/ui';
import { useMemo } from 'react';
import { useAgora } from '../../casca/status/useAgora.ts';

/** O relógio guardado do chamado, como a API o manda, com os instantes em texto. */
export type RelogioDaApi = NonNullable<components['schemas']['FichaDoChamado']['relogio']>;

/** O relógio da resposta como o domínio o conta, com os instantes em datas. */
export function relogioDaApi(relogio: RelogioDaApi): RelogioDoChamado {
  return {
    prazo: relogio.prazo,
    contadoS: relogio.contadoS,
    relogioDesde: relogio.relogioDesde === null ? null : new Date(relogio.relogioDesde),
    primeiraRespostaEm:
      relogio.primeiraRespostaEm === null ? null : new Date(relogio.primeiraRespostaEm),
  };
}

/** A situação do prazo de um chamado agora. */
export type ContarOPrazo = (relogio: RelogioDaApi, horario: HorarioDaTi) => SituacaoDoPrazo;

/**
 * A conta do prazo num momento e num fuso: a do gancho, e a da tela que já tem o momento dela, para
 * a idade do mais antigo e o prazo virarem no mesmo minuto.
 */
export function contadorDoPrazo(agora: Date, fuso: string): ContarOPrazo {
  return (relogio, horario) => situacaoDoPrazo(relogioDaApi(relogio), horario, agora, fuso);
}

/**
 * A conta do prazo agora, que muda na virada do minuto, como a idade das leituras, sem pedir de
 * novo ao servidor. A tela chama o gancho uma vez e conta cada chamado com ele, para o texto, o
 * grupo e a ordem andarem juntos; o chamado que vem sem relógio não é contado. O grupo sai no fuso
 * das preferências, e não no do horário da TI.
 */
export function useContarOPrazo(): ContarOPrazo {
  const agora = useAgora();
  const { fuso } = useDataHora();
  return useMemo(() => contadorDoPrazo(agora, fuso), [agora, fuso]);
}

/** A marca do selo de cada grupo: o estourado é crítico, e o que vence em até 2 h, atenção. */
const MARCA_DO_GRUPO: Record<SituacaoDoPrazo['grupo'], Situacao> = {
  estourado: 'critico',
  'ate-2-horas': 'atencao',
  hoje: 'neutra',
  'depois-de-hoje': 'neutra',
  parado: 'neutra',
};

/**
 * O selo do prazo, como o da prévia do quadrado: a situação inteira, com a primeira letra
 * maiúscula ("Estourado há 20 min", "Vence em 2 h", "Relógio parado" ou "Prazo ilegível"), na marca
 * do grupo.
 */
export function seloDoPrazo(situacao: SituacaoDoPrazo | null): { texto: string; marca: Situacao } {
  if (!situacao) return { texto: 'Prazo ilegível', marca: 'neutra' };
  const { texto, grupo } = situacao;
  return { texto: texto.charAt(0).toUpperCase() + texto.slice(1), marca: MARCA_DO_GRUPO[grupo] };
}
