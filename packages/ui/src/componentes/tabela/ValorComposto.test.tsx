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

  // O respiro entre as partes é do estilo, e o texto precisa do espaço dele: sem isso, o leitor de
  // tela, a busca na página e quem lê o texto da célula recebem "Reconhecidopor Ana Souza".
  it('separa as partes com um espaço no texto', () => {
    const { container } = render(
      <ValorComposto fixo={<strong>Reconhecido</strong>}>
        <span>por Ana Souza</span>
      </ValorComposto>,
    );
    expect(container.textContent).toBe('Reconhecido por Ana Souza');
  });

  it('separa também as partes do fixo e as do resto, dadas juntas', () => {
    const { container } = render(
      <ValorComposto
        fixo={
          <>
            <span>8%</span>
            <strong>Desatualizado</strong>
          </>
        }
      >
        <span>Black Toner Cartridge</span>
        <time>há 12 dias</time>
      </ValorComposto>,
    );
    expect(container.textContent).toBe('8% Desatualizado Black Toner Cartridge há 12 dias');
    expect(container.querySelector('[data-parte="fixo"]')?.textContent).toBe('8% Desatualizado');
    expect(container.querySelector('[data-parte="resto"]')?.textContent).toBe(
      'Black Toner Cartridge há 12 dias',
    );
  });

  it('a parte que não desenha nada não deixa espaço sobrando no texto', () => {
    const Nada = () => null;
    const { container } = render(
      <ValorComposto
        fixo={
          <>
            <strong>Online</strong>
            {false}
          </>
        }
      >
        {null}
        <time>há 2 min</time>
      </ValorComposto>,
    );
    expect(container.textContent).toBe('Online há 2 min');
    // O componente que não desenha nada ainda conta como parte: o espaço dele é o que sobra.
    const comNada = render(
      <ValorComposto fixo={<strong>Online</strong>}>
        <Nada />
      </ValorComposto>,
    );
    expect(comNada.container.textContent?.trim()).toBe('Online');
  });
});
