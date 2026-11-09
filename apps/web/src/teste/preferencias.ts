// A cópia das preferências no navegador, nos testes: o que ela guarda e as preferências que valem
// por ela, resolvidas como a casca as resolve, para os testes não dependerem do formato.
import {
  aplicarMudanca,
  lerAjustes,
  type PreferenciasDaInterface,
  resolverPreferencias,
} from '@grafite/domain';

const CHAVE = 'grafite.preferencias';

/** A cópia como está no navegador; `null` sem cópia. */
export function copiaDasPreferencias(): Record<string, unknown> | null {
  return JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
}

/** Guarda uma cópia, como uma página anterior teria deixado. */
export function guardarCopia(copia: Record<string, unknown>): void {
  localStorage.setItem(CHAVE, JSON.stringify(copia));
}

/** As preferências que valem pela cópia: os padrões, a camada da conta e os pendentes. */
export function preferenciasDaCopia(): PreferenciasDaInterface {
  const copia = copiaDasPreferencias();
  return resolverPreferencias(
    copia?.organizacao,
    aplicarMudanca(lerAjustes(copia?.conta), (copia?.pendentes as object | undefined) ?? {}),
  );
}
