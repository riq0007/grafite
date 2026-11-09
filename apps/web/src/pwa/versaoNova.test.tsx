import { criarFilaDeAvisos, RegiaoDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { criarRoteador } from '../rotas/arvore.ts';
import { sessaoAtiva } from '../teste/sessao.ts';
import { type OpcoesDoRegistro, registrarServiceWorker } from './versaoNova.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** O virtual:pwa-register simulado: guarda as opções e devolve a troca de versão. */
function registroSimulado() {
  const trocarDeVersao = vi.fn(async (_recarregar?: boolean) => {});
  let opcoes: OpcoesDoRegistro = {};
  const registrar = vi.fn((recebidas: OpcoesDoRegistro = {}) => {
    opcoes = recebidas;
    return trocarDeVersao;
  });
  return { registrar, trocarDeVersao, opcoes: () => opcoes };
}

/** Registra com uma fila própria, desenhada numa região de avisos. */
function registrarComARegiao() {
  const fila = criarFilaDeAvisos();
  render(<RegiaoDeAvisos fila={fila} />);
  const simulado = registroSimulado();
  registrarServiceWorker({ registrar: simulado.registrar, fila });
  return { ...simulado, fila };
}

const avisoDaVersao = () => screen.findByRole('alertdialog', { name: /Nova versão do Grafite/ });

describe('versão nova', () => {
  it('registra o service worker logo ao abrir', () => {
    const { registrar } = registrarComARegiao();
    expect(registrar).toHaveBeenCalledOnce();
    expect(registrar.mock.calls[0]?.[0]).toMatchObject({ immediate: true });
  });

  it('uma versão nova vira o aviso persistente de Informação "Nova versão do Grafite"', async () => {
    const { opcoes, fila } = registrarComARegiao();
    act(() => opcoes().onNeedRefresh?.());
    const aviso = await avisoDaVersao();
    expect(within(aviso).getByText('Informação')).toBeTruthy();
    expect(fila.naTela[0]?.duracao).toBeUndefined();
  });

  it('"Atualizar" passa à versão nova recarregando a página', async () => {
    const { opcoes, trocarDeVersao } = registrarComARegiao();
    act(() => opcoes().onNeedRefresh?.());
    fireEvent.click(within(await avisoDaVersao()).getByRole('button', { name: 'Atualizar' }));
    expect(trocarDeVersao).toHaveBeenCalledWith(true);
  });

  it('"Fechar" deixa a troca para a próxima abertura, sem recarregar', async () => {
    const { opcoes, trocarDeVersao } = registrarComARegiao();
    act(() => opcoes().onNeedRefresh?.());
    fireEvent.click(within(await avisoDaVersao()).getByRole('button', { name: 'Fechar' }));
    expect(trocarDeVersao).not.toHaveBeenCalled();
  });

  it('confere se há versão nova a cada hora', () => {
    vi.useFakeTimers();
    const { opcoes } = registrarComARegiao();
    const registro = { update: vi.fn(async () => {}) } as unknown as ServiceWorkerRegistration;
    opcoes().onRegisteredSW?.('/sw.js', registro);
    vi.advanceTimersByTime(60 * 60 * 1000 - 1);
    expect(registro.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(registro.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(registro.update).toHaveBeenCalledTimes(3);
  });

  it('o aviso não entra na central de notificações', async () => {
    render(
      <App
        roteador={criarRoteador(createMemoryHistory({ initialEntries: ['/'] }))}
        sessao={sessaoAtiva()}
      />,
    );
    const { registrar, opcoes } = registroSimulado();
    registrarServiceWorker({ registrar });
    act(() => opcoes().onNeedRefresh?.());
    const aviso = await avisoDaVersao();
    const sino = screen.getByRole('button', { name: 'Notificações, nenhuma não lida' });
    fireEvent.click(sino);
    const central = await screen.findByRole('dialog', { name: 'Notificações' });
    expect(await within(central).findByText('Nenhuma notificação.')).toBeTruthy();
    fireEvent.click(within(aviso).getByRole('button', { name: 'Fechar' }));
  });
});
