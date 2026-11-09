import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { criarLojaDaSessao, type LojaDaSessao } from './loja.ts';
import { ProvedorDaSessao, useLojaDaSessao, useSessao } from './useSessao.tsx';

function QuemEsta() {
  const sessao = useSessao();
  const loja = useLojaDaSessao();
  return (
    <p>
      {sessao.tipo === 'ativa' ? `Sessão de ${sessao.conta.nome}` : `Sessão: ${sessao.tipo}`}
      {typeof loja.entrar === 'function' ? ', com as ações' : ''}
    </p>
  );
}

let loja: LojaDaSessao | undefined;
afterEach(() => loja?.parar());

describe('useSessao', () => {
  it('entrega o estado da loja e acompanha as mudanças', async () => {
    const respostas = [
      Response.json({ organizacao: { nome: 'Empresa' }, sessao: null }),
      Response.json({
        organizacao: { nome: 'Empresa' },
        sessao: {
          conta: { usuario: 'ana.souza', nome: 'Ana Souza' },
          pendencia: null,
          csrf: 'csrf',
          expiraEm: '2099-01-01T00:00:00.000Z',
          acesso: { permissoes: [] },
        },
      }),
    ];
    loja = criarLojaDaSessao({ buscar: async () => respostas.shift() ?? Response.error() });
    render(
      <ProvedorDaSessao loja={loja}>
        <QuemEsta />
      </ProvedorDaSessao>,
    );
    expect(screen.getByText('Sessão: validando, com as ações')).toBeTruthy();
    await act(() => loja?.validar());
    expect(screen.getByText('Sessão: sem-sessao, com as ações')).toBeTruthy();
    await act(() => loja?.entrar({ usuario: 'ana.souza', senha: 'cavalo bateria grampo' }));
    expect(screen.getByText('Sessão de Ana Souza, com as ações')).toBeTruthy();
  });

  it('fora do provedor, diz o que falta', () => {
    expect(() => render(<QuemEsta />)).toThrow('useSessao() precisa do ProvedorDaSessao');
  });
});
