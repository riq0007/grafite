import {
  COLUNAS_DA_TELA_INICIAL,
  DENSIDADES,
  DESTAQUES,
  LIMITES_DAS_PREFERENCIAS,
  PADRAO_DE_FABRICA,
  type POSICOES_DO_DOCK,
  TEMAS,
  TEMPOS_DO_AVISO,
} from '@grafite/domain';
import {
  COLUNAS_DAS_OCORRENCIAS,
  casca,
  densidades,
  destaques,
  type PosicaoDoDock,
  RAIO_BASE_MAXIMO,
  RAIO_BASE_PADRAO,
  temas,
} from '@grafite/ui';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as daWeb from './preferencias.ts';

const ordenadas = (lista: readonly unknown[]) => lista.map(String).sort();

// O domínio escreve as listas de opções sem depender do pacote visual (design, decisão 1): um
// tema, um destaque ou uma densidade nova nos tokens reprova aqui até entrar no domínio.
describe('o modelo das preferências no domínio', () => {
  it('tem os temas, os destaques e as densidades dos tokens do @grafite/ui', () => {
    expect(ordenadas(TEMAS)).toEqual(ordenadas(Object.keys(temas)));
    expect(ordenadas(DESTAQUES)).toEqual(ordenadas(Object.keys(destaques)));
    expect(ordenadas(DENSIDADES)).toEqual(ordenadas(Object.keys(densidades)));
  });

  it('tem as colunas da tela inicial e as posições do dock da casca', () => {
    expect(ordenadas(COLUNAS_DA_TELA_INICIAL)).toEqual(ordenadas(COLUNAS_DAS_OCORRENCIAS));
    expectTypeOf<(typeof POSICOES_DO_DOCK)[number]>().toEqualTypeOf<PosicaoDoDock>();
  });

  it('tem os limites e os padrões de fábrica numéricos dos tokens', () => {
    expect(LIMITES_DAS_PREFERENCIAS.raio).toEqual({ minimo: 0, maximo: RAIO_BASE_MAXIMO });
    expect(LIMITES_DAS_PREFERENCIAS.tamanhoDoDock).toEqual({
      minimo: casca.tamanhoItemDockMinimo,
      maximo: casca.tamanhoItemDockMaximo,
    });
    expect(PADRAO_DE_FABRICA.aparencia.raio).toBe(RAIO_BASE_PADRAO);
    expect(PADRAO_DE_FABRICA.dock.tamanho).toBe(casca.tamanhoItemDock);
  });

  it('é o modelo que a web usa, sem uma cópia própria', () => {
    expect(daWeb.PADRAO_DE_FABRICA).toBe(PADRAO_DE_FABRICA);
    expect(daWeb.TEMPOS_DO_AVISO).toBe(TEMPOS_DO_AVISO);
  });
});
