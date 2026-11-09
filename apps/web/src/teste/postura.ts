// As posturas da casca nos testes de componente (spec posturas-da-casca): computador com ponteiro
// fino, na largura padrão da janela de teste, e celular, numa janela de 390 px.
import { vi } from 'vitest';

export function noComputador() {
  const original = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (consulta: string) => {
    const lista = original(consulta);
    if (consulta === '(pointer: fine)') Object.defineProperty(lista, 'matches', { value: true });
    return lista;
  });
}

export function noCelular() {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
}
