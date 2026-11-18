import { cleanup, render, screen } from '@testing-library/react';
import { Lock, type LucideIcon } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { ICONES_DAS_SITUACOES, RotuloDeSituacao, type Situacao } from './RotuloDeSituacao.tsx';

afterEach(cleanup);

describe('RotuloDeSituacao', () => {
  it('comunica a situação pelo texto; ícone e cor são complemento', () => {
    render(<RotuloDeSituacao situacao="atencao">Em manutenção</RotuloDeSituacao>);
    const rotulo = screen.getByText('Em manutenção').closest('[data-situacao]');
    expect(rotulo?.getAttribute('data-situacao')).toBe('atencao');
    expect(rotulo?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('cada situação tem ícone de forma própria, para distinguir sem depender da cor', () => {
    const situacoes: Situacao[] = ['neutra', 'sucesso', 'info', 'atencao', 'critico'];
    const formas = situacoes.map((situacao) => {
      const { container, unmount } = render(
        <RotuloDeSituacao situacao={situacao}>Texto</RotuloDeSituacao>,
      );
      const forma = container.querySelector('svg')?.getAttribute('class');
      unmount();
      return forma;
    });
    expect(formas.every(Boolean)).toBe(true);
    expect(new Set(formas).size).toBe(situacoes.length);
  });

  it('o ícone próprio troca o da situação, que segue no selo', () => {
    const desenho = (Svg: LucideIcon) => {
      const { container, unmount } = render(<Svg />);
      const tracos = container.querySelector('svg')?.innerHTML;
      unmount();
      return tracos;
    };
    render(
      <RotuloDeSituacao situacao="info" icone={Lock}>
        Só a TI abre
      </RotuloDeSituacao>,
    );
    const rotulo = screen.getByText('Só a TI abre').closest('[data-situacao]');
    expect(rotulo?.getAttribute('data-situacao')).toBe('info');
    const icones = rotulo?.querySelectorAll('svg') ?? [];
    expect(icones).toHaveLength(1);
    expect(icones[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(icones[0]?.innerHTML).toBe(desenho(Lock));
    expect(icones[0]?.innerHTML).not.toBe(desenho(ICONES_DAS_SITUACOES.info));
  });
});
