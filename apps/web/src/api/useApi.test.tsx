import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { criarCliente } from './cliente.ts';
import { ProvedorDaApi, useApi } from './useApi.tsx';

function QuemUsa() {
  const api = useApi();
  return <p>{typeof api.GET === 'function' ? 'cliente pronto' : 'sem cliente'}</p>;
}

describe('useApi', () => {
  it('entrega aos módulos o cliente do provedor', () => {
    const cliente = criarCliente({
      csrf: () => null,
      aoPerderASessao: () => {},
      aoMudarOAcesso: () => {},
    });
    render(
      <ProvedorDaApi cliente={cliente}>
        <QuemUsa />
      </ProvedorDaApi>,
    );
    expect(screen.getByText('cliente pronto')).toBeTruthy();
  });

  it('fora do provedor, diz o que falta', () => {
    expect(() => render(<QuemUsa />)).toThrow('useApi() precisa do ProvedorDaApi');
  });
});
