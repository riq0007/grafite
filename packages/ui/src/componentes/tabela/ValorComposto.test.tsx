// O valor composto da célula (spec componentes-base, "Célula numa linha só"; change
// celulas-numa-linha, design, decisão 2): a parte fixa e o resto, cada um numa parte própria, para
// o corte seguir a ordem. O corte em si depende do desenho, e a história o confere no navegador.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ValorComposto } from './ValorComposto.tsx';

afterEach(cleanup);

describe('ValorComposto', () => {
  it('põe o fixo antes do resto, cada um na parte dele', () => {
    const { container } = render(
      <ValorComposto fixo={<strong>Offline</strong>}>há 12 min</ValorComposto>,
    );
    const partes = [...container.querySelectorAll('[data-parte]')];
    expect(partes.map((parte) => parte.getAttribute('data-parte'))).toEqual(['fixo', 'resto']);
    expect(partes[0]?.textContent).toBe('Offline');
    expect(partes[1]?.textContent).toBe('há 12 min');
  });

  it('sem o resto, fica só o fixo', () => {
    const { container } = render(<ValorComposto fixo={<strong>Não verificado</strong>} />);
    expect(screen.getByText('Não verificado')).toBeTruthy();
    expect(container.querySelector('[data-parte="resto"]')).toBeNull();
  });

  it('o resto vazio, como a idade de uma leitura que não houve, não deixa uma parte vazia', () => {
    const { container } = render(
      <ValorComposto fixo={<strong>Sem dado</strong>}>
        {null}
        {false}
      </ValorComposto>,
    );
    expect(container.querySelector('[data-parte="resto"]')).toBeNull();
  });
});
