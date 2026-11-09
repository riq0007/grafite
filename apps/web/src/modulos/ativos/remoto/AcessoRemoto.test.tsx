// A tela do acesso remoto (spec acesso-remoto, "Tela do acesso remoto"; change acesso-remoto-vnc,
// design, decisão 3): o nome e o patrimônio, a situação em texto, a senha pedida num diálogo, o
// Ctrl+Alt+Del, o ajustar à janela, o desconectar, o motivo do fim, o conectar de novo e a tela sem
// permissão. O cliente VNC fica de fora: a sessão é simulada, com os eventos dela.
import type { components } from '@grafite/api-client';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, sessaoAtiva } from '../../../teste/sessao.ts';
import { type EventosDaSessao, enderecoDaPonte } from './sessao.ts';

interface SessaoSimulada {
  endereco: string;
  eventos: EventosDaSessao;
  ajustar: boolean;
  enviarSenha: ReturnType<typeof vi.fn>;
  ctrlAltDel: ReturnType<typeof vi.fn>;
  mudarAjuste: ReturnType<typeof vi.fn>;
  desconectar: ReturnType<typeof vi.fn>;
}

const { sessoes } = vi.hoisted(() => ({ sessoes: [] as SessaoSimulada[] }));

vi.mock('./sessao.ts', async (original) => ({
  ...(await original<typeof import('./sessao.ts')>()),
  abrirSessaoRemota: (
    _tela: HTMLElement,
    endereco: string,
    eventos: EventosDaSessao,
    { ajustar }: { ajustar: boolean },
  ) => {
    const sessao = {
      endereco,
      eventos,
      ajustar,
      enviarSenha: vi.fn(),
      ctrlAltDel: vi.fn(),
      mudarAjuste: vi.fn(),
      desconectar: vi.fn(),
    };
    sessoes.push(sessao);
    return {
      enviarSenha: sessao.enviarSenha,
      ctrlAltDel: sessao.ctrlAltDel,
      ajustar: sessao.mudarAjuste,
      desconectar: sessao.desconectar,
    };
  },
}));

afterEach(() => {
  cleanup();
  sessoes.length = 0;
  localStorage.clear();
});

type Ficha = components['schemas']['FichaDoAtivo'];

const fichaDe = (acessoRemoto: boolean): Ficha => ({
  id: 'a1',
  rotulo: 'Computador da recepção',
  tipo: { id: 'computador', nome: 'Computador', icone: 'generico' },
  modelo: null,
  imagem: null,
  patrimonio: 'PAT-00321',
  serie: null,
  hostname: null,
  local: null,
  responsavel: null,
  uso: 'em-uso',
  situacao: 'ativo',
  criadoEm: '2026-10-09T12:00:00.000Z',
  atualizadoEm: '2026-10-09T12:00:00.000Z',
  valores: {},
  estado: {},
  referencias: { pessoas: {}, locais: {}, ativos: {}, fornecedores: {}, arquivos: {} },
  permite: {
    editar: false,
    verRestritos: false,
    editarRestritos: false,
    verResponsavel: false,
    acessoRemoto,
  },
});

function abrir(acessoRemoto = true) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/ativos/a1/remoto'] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(naOrganizacao('ativos.ver', 'ativos.acesso-remoto'), {
        'GET /api/ativos/a1': () => Response.json(fichaDe(acessoRemoto)),
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const situacao = () =>
  screen.getByRole('status', { name: 'Situação da conexão' }).textContent ?? '';
const ultima = () => {
  const sessao = sessoes.at(-1);
  if (!sessao) throw new Error('Nenhuma sessão aberta.');
  return sessao;
};

describe('a tela do acesso remoto', () => {
  it('Máquina com senha: pede a senha num diálogo e, com ela, mostra Conectado', async () => {
    abrir();
    expect(
      (await screen.findByRole('heading', { name: /Acesso remoto · Computador da recepção/ }))
        .textContent,
    ).toContain('PAT-00321');
    await waitFor(() => expect(sessoes).toHaveLength(1));
    expect(ultima().endereco).toBe(enderecoDaPonte('a1', window.location));
    expect(ultima().ajustar).toBe(true);
    expect(situacao()).toBe('Conectando…');
    expect(screen.getByRole('button', { name: 'Ctrl+Alt+Del' }).hasAttribute('disabled')).toBe(
      true,
    );

    act(() => ultima().eventos.aoPedirSenha(false));
    const dialogo = await screen.findByRole('dialog', { name: 'Senha do VNC' });
    expect(within(dialogo).queryByLabelText('Usuário')).toBeNull();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Entrar' }));
    await within(dialogo).findByText('Informe a senha do VNC.');
    fireEvent.change(within(dialogo).getByLabelText('Senha'), { target: { value: 'segredo' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Entrar' }));
    expect(ultima().enviarSenha).toHaveBeenCalledWith({ senha: 'segredo' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    act(() => ultima().eventos.aoConectar());
    expect(situacao()).toBe('Conectado');
    fireEvent.click(screen.getByRole('button', { name: 'Ctrl+Alt+Del' }));
    expect(ultima().ctrlAltDel).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ajustar à janela' }));
    expect(ultima().mudarAjuste).toHaveBeenCalledWith(false);
  });

  it('a máquina que pede o usuário, e o cancelar que desconecta', async () => {
    abrir();
    await waitFor(() => expect(sessoes).toHaveLength(1));
    act(() => ultima().eventos.aoPedirSenha(true));
    const dialogo = await screen.findByRole('dialog', { name: 'Senha do VNC' });
    fireEvent.change(within(dialogo).getByLabelText('Usuário'), { target: { value: 'suporte' } });
    fireEvent.change(within(dialogo).getByLabelText('Senha'), { target: { value: 'segredo' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Entrar' }));
    expect(ultima().enviarSenha).toHaveBeenCalledWith({ usuario: 'suporte', senha: 'segredo' });

    act(() => ultima().eventos.aoPedirSenha(false));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );
    expect(ultima().desconectar).toHaveBeenCalled();
  });

  it('o fim pela ponte mostra o motivo, e Conectar de novo abre outra sessão', async () => {
    abrir();
    await waitFor(() => expect(sessoes).toHaveLength(1));
    act(() => ultima().eventos.aoConectar());
    act(() => ultima().eventos.aoDesconectar('A máquina não respondeu no VNC.'));
    expect(situacao()).toBe('DesconectadoA máquina não respondeu no VNC.');
    fireEvent.click(screen.getByRole('button', { name: 'Conectar de novo' }));
    await waitFor(() => expect(sessoes).toHaveLength(2));
    expect(situacao()).toBe('Conectando…');
    screen.getByRole('button', { name: 'Desconectar' });
  });

  it('o desconectar de quem usa não mostra motivo; o fim sem motivo diz que a conexão terminou', async () => {
    abrir();
    await waitFor(() => expect(sessoes).toHaveLength(1));
    act(() => ultima().eventos.aoConectar());
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    expect(ultima().desconectar).toHaveBeenCalled();
    act(() => ultima().eventos.aoDesconectar(null));
    expect(situacao()).toBe('Desconectado');

    fireEvent.click(screen.getByRole('button', { name: 'Conectar de novo' }));
    await waitFor(() => expect(sessoes).toHaveLength(2));
    act(() => ultima().eventos.aoDesconectar(null));
    expect(situacao()).toBe('DesconectadoA conexão foi encerrada.');
  });

  it('sem o acesso remoto no local, a tela diz que não tem acesso e não conecta', async () => {
    abrir(false);
    await screen.findByText('Você não tem acesso ao acesso remoto desta máquina.');
    expect(sessoes).toHaveLength(0);
  });
});

describe('o endereço da ponte', () => {
  it('usa o wss com o https e o ws com o http, pelo /api', () => {
    expect(enderecoDaPonte('a1', { protocol: 'https:', host: 'grafite.empresa.com' })).toBe(
      'wss://grafite.empresa.com/api/ativos/a1/acesso-remoto',
    );
    expect(enderecoDaPonte('a1', { protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/api/ativos/a1/acesso-remoto',
    );
  });
});
