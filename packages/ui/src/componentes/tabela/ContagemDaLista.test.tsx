// A contagem acima da tabela (spec componentes-base, "Situação, tempo e contagem nas tabelas";
// change tabelas-consistentes, design, decisão 3).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContagemDaLista } from './ContagemDaLista.tsx';

afterEach(cleanup);

describe('ContagemDaLista', () => {
  it('lista dos perfis: o número e o nome no plural, ou no singular com um', () => {
    const { rerender } = render(<ContagemDaLista quantos={3} singular="perfil" plural="perfis" />);
    expect(screen.getByText('3 perfis')).toBeTruthy();
    rerender(<ContagemDaLista quantos={1} singular="perfil" plural="perfis" />);
    expect(screen.getByText('1 perfil')).toBeTruthy();
    rerender(<ContagemDaLista quantos={1234} singular="registro" plural="registros" />);
    expect(screen.getByText('1.234 registros')).toBeTruthy();
  });
});
