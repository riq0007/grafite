import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTA_DE_EXEMPLO } from '../teste/sessao.ts';
import {
  criarLojaDaSessao,
  type EstadoDaSessao,
  type LojaDaSessao,
  type ServidorDaSessao,
} from './loja.ts';
import { type PermissaoDaSessao, useAcesso } from './useAcesso.ts';
import { ProvedorDaSessao } from './useSessao.tsx';

let lojas: LojaDaSessao[] = [];

afterEach(() => {
  cleanup();
  for (const loja of lojas) loja.parar();
  lojas = [];
});

const PERMISSOES: PermissaoDaSessao[] = [
  { chave: 'pessoas.ver', organizacao: false, locais: ['jundiai'] },
  { chave: 'auditoria.ver', organizacao: true, locais: [] },
];

function acessoNa(estado: EstadoDaSessao, servidor?: ServidorDaSessao) {
  const loja = criarLojaDaSessao({
    buscar: async () => {
      throw new Error('O teste não fala com o servidor.');
    },
    estado,
    servidor,
  });
  lojas.push(loja);
  const envolver = ({ children }: { children: ReactNode }) => (
    <ProvedorDaSessao loja={loja}>{children}</ProvedorDaSessao>
  );
  return renderHook(() => useAcesso(), { wrapper: envolver }).result;
}

const ATIVA = (permissoes: PermissaoDaSessao[]) => ({
  organizacao: { nome: 'Empresa' },
  sessao: {
    conta: { usuario: 'ana.souza', nome: 'Ana Souza' },
    pendencia: null,
    csrf: 'csrf',
    expiraEm: '2099-01-01T00:00:00.000Z',
    acesso: { permissoes },
  },
});

describe('useAcesso', () => {
  it('muda só quando o acesso muda, e não a cada nova validação da sessão', async () => {
    const respostas = [ATIVA(PERMISSOES), ATIVA([...PERMISSOES]), ATIVA([])];
    const loja = criarLojaDaSessao({
      buscar: async () => Response.json(respostas.shift()),
    });
    lojas.push(loja);
    await loja.validar();
    const envolver = ({ children }: { children: ReactNode }) => (
      <ProvedorDaSessao loja={loja}>{children}</ProvedorDaSessao>
    );
    const acesso = renderHook(() => useAcesso(), { wrapper: envolver }).result;
    const primeiro = acesso.current;
    await act(() => loja.validar());
    expect(acesso.current).toBe(primeiro);
    await act(() => loja.validar());
    expect(acesso.current).not.toBe(primeiro);
    expect(acesso.current.pode('pessoas.ver')).toBe(false);
  });

  it('pode o que a conta tem, em qualquer escopo', () => {
    const acesso = acessoNa({
      tipo: 'ativa',
      organizacao: 'Empresa',
      conta: CONTA_DE_EXEMPLO,
      csrf: 'csrf',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: { permissoes: PERMISSOES },
    });
    expect(acesso.current.pode('pessoas.ver')).toBe(true);
    expect(acesso.current.pode('auditoria.ver')).toBe(true);
    expect(acesso.current.pode('acessos.administrar')).toBe(false);
    expect(acesso.current.permissoes).toEqual(PERMISSOES);
  });

  it('backup.administrar só vale na organização que opera o servidor', () => {
    const ativa: EstadoDaSessao = {
      tipo: 'ativa',
      organizacao: 'Empresa',
      conta: CONTA_DE_EXEMPLO,
      csrf: 'csrf',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: {
        permissoes: [
          { chave: 'backup.administrar', organizacao: true, locais: [] },
          { chave: 'tarefas.administrar', organizacao: true, locais: [] },
        ],
      },
    };
    const naCliente = acessoNa(ativa, {
      ambiente: 'producao',
      operaOServidor: false,
      modulosDesligados: [],
    });
    expect(naCliente.current.pode('backup.administrar')).toBe(false);
    expect(naCliente.current.pode('tarefas.administrar')).toBe(true);
    const naOperadora = acessoNa(ativa, {
      ambiente: 'producao',
      operaOServidor: true,
      modulosDesligados: [],
    });
    expect(naOperadora.current.pode('backup.administrar')).toBe(true);
  });

  it('a sessão desconhecida não tem permissão nenhuma', () => {
    const acesso = acessoNa({ tipo: 'desconhecida' });
    expect(acesso.current.pode('pessoas.ver')).toBe(false);
    expect(acesso.current.permissoes).toEqual([]);
  });

  it('a sessão pendente também não', () => {
    const acesso = acessoNa({
      tipo: 'pendente',
      pendencia: 'cadastrar-dois-passos',
      organizacao: 'Empresa',
      conta: CONTA_DE_EXEMPLO,
      csrf: 'csrf',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: { permissoes: PERMISSOES },
    });
    expect(acesso.current.pode('pessoas.ver')).toBe(false);
  });
});
