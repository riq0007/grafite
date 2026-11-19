import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampoDeHora } from './CampoDeHora.tsx';

afterEach(cleanup);

/** O texto à vista do campo, sem as marcas invisíveis de direção do texto. */
const textoDa = (elemento: HTMLElement) => (elemento.textContent ?? '').replace(/\p{Cf}/gu, '');

const caixa = () => screen.getByRole('group', { name: 'Início' });
const horas = () => screen.getByRole('spinbutton', { name: /^hora/i });

/** Textos dos elementos que o campo referencia em aria-describedby. */
function descricoesDe(campo: HTMLElement): string[] {
  return (campo.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '');
}

function Controlado({
  inicial,
  aoMudar,
}: {
  inicial: number | null;
  aoMudar: (valor: number | null) => void;
}) {
  const [valor, definirValor] = useState(inicial);
  return (
    <CampoDeHora
      rotulo="Início"
      valor={valor}
      aoMudar={(novo) => {
        definirValor(novo);
        aoMudar(novo);
      }}
    />
  );
}

describe('CampoDeHora', () => {
  it('mostra os minutos do dia como a hora em 24 h, com o zero à esquerda', () => {
    render(<CampoDeHora rotulo="Início" valor={8 * 60 + 5} aoMudar={() => {}} />);
    expect(textoDa(caixa())).toBe('08:05');
  });

  it('sem hora, mostra o lugar das horas e dos minutos', () => {
    render(<CampoDeHora rotulo="Início" valor={null} aoMudar={() => {}} />);
    expect(textoDa(caixa())).toBe('––:––');
  });

  it('digitar 1745 dá 17:45, em minutos do dia, sem manhã nem tarde', async () => {
    const aoMudar = vi.fn();
    render(<Controlado inicial={null} aoMudar={aoMudar} />);
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(2);
    await userEvent.click(horas());
    await userEvent.keyboard('1745');
    expect(textoDa(caixa())).toBe('17:45');
    expect(aoMudar).toHaveBeenLastCalledWith(17 * 60 + 45);
  });

  it('apagar as horas e os minutos dá nulo', async () => {
    const aoMudar = vi.fn();
    render(<Controlado inicial={8 * 60} aoMudar={aoMudar} />);
    await userEvent.click(horas());
    await userEvent.keyboard('{Backspace}{Tab}{Backspace}');
    expect(textoDa(caixa())).toBe('––:––');
    expect(aoMudar).toHaveBeenLastCalledWith(null);
  });

  it('apagar só as horas e sair do campo volta à hora de antes, sem mudar o valor', async () => {
    const aoMudar = vi.fn();
    render(<Controlado inicial={8 * 60} aoMudar={aoMudar} />);
    await userEvent.click(horas());
    await userEvent.keyboard('{Backspace}');
    expect(textoDa(caixa())).toBe('––:00');
    await userEvent.click(document.body);
    expect(textoDa(caixa())).toBe('08:00');
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('sem hora, a hora pela metade fica à vista ao sair do campo, e o valor segue nulo', async () => {
    const aoMudar = vi.fn();
    render(<Controlado inicial={null} aoMudar={aoMudar} />);
    await userEvent.click(screen.getByRole('spinbutton', { name: /^minuto/i }));
    await userEvent.keyboard('30');
    await userEvent.click(document.body);
    expect(textoDa(caixa())).toBe('––:30');
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('o erro de fora aparece em texto, ligado ao campo', () => {
    render(
      <CampoDeHora
        rotulo="Início"
        valor={18 * 60}
        aoMudar={() => {}}
        erro="O fim vem depois do início."
      />,
    );
    expect(descricoesDe(caixa())).toContain('O fim vem depois do início.');
  });
});
