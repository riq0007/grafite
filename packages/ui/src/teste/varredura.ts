// Utilitário de teste dos tokens: as entradas da varredura do gerador, as mesmas nos testes do tema
// e nos das situações e dos dados.
import type { EntradaDoTema } from '../tokens/gerador.ts';
import type { Tom } from '../tokens/papeis.ts';

/**
 * Todas as entradas da varredura: matizes de 15 em 15, três cromas e três contrastes por tom, e o
 * OLED. São 433.
 */
export function varredura(): EntradaDoTema[] {
  const entradas: EntradaDoTema[] = [];
  for (const tom of ['escuro', 'claro'] as Tom[]) {
    for (let matiz = 0; matiz < 360; matiz += 15) {
      for (const croma of [0, 0.03, 0.06]) {
        for (const nivel of [0, 45, 100]) {
          entradas.push({ tom, base: { matiz, croma }, contraste: nivel });
        }
      }
    }
  }
  entradas.push({ tom: 'escuro', base: { matiz: 0, croma: 0 }, contraste: 70, oled: true });
  return entradas;
}

/** O nome da entrada no relatório dos testes. */
export const nomeDaEntrada = (e: EntradaDoTema) =>
  `${e.tom} ${e.base.matiz}/${e.base.croma} contraste ${e.contraste}${e.oled ? ' oled' : ''}`;
