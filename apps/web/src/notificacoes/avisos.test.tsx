// Os avisos das notificações (spec notificacoes, "Aviso na tela conforme as preferências", "Aviso
// numa aba só" e "Modo Foco"; change p3b-notificacoes-no-servidor, design, decisão 9): só a
// notificação que chega com a aplicação aberta vira aviso, conforme as preferências e o Foco, na
// aba usada por último; o aviso sai quando a notificação é lida ou o alerta deixa de pedir ação.
import type { components } from '@grafite/api-client';
import type { AjustesDasPreferencias } from '@grafite/domain';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { criarRoteador } from '../rotas/arvore.ts';
import { noComputador } from '../teste/postura.ts';
import { sessaoAtiva } from '../teste/sessao.ts';
import { CANAL_DAS_ABAS } from './abaDaVez.ts';

type Notificacao = components['schemas']['NotificacaoNaLista'];

afterEach(() => {
  cleanup();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const ALERTA_ABERTO = {
  id: 'al1',
  situacao: 'aberto' as const,
  reconhecido: null,
  adiado: null,
  permite: { tratar: true },
};

const notificacao = (dados: Partial<Notificacao> = {}): Notificacao => ({
  id: 'n1',
  severidade: 'critico',
  titulo: 'Black Toner Cartridge em 8%',
  descricao: 'HP LaserJet M404 · PAT-00412',
  origem: 'Alertas',
  destino: '/ajustes',
  criadaEm: new Date(Date.now() + 1_000).toISOString(),
  lida: false,
  alerta: ALERTA_ABERTO,
  ...dados,
});

const ANTIGA = notificacao({
  id: 'n0',
  titulo: 'Coletor sem contato',
  criadaEm: new Date(Date.now() - 60 * 60_000).toISOString(),
  alerta: null,
});

/** Abre a aplicação com as notificações do servidor, que o teste troca entre as leituras. */
function abrir(preferencias: AjustesDasPreferencias = {}) {
  const servidor = { itens: [ANTIGA] as Notificacao[] };
  noComputador();
  const canal = criarCanalDeEventos();
  render(
    <App
      roteador={criarRoteador(createMemoryHistory({ initialEntries: ['/'] }))}
      sessao={sessaoAtiva(
        [],
        {
          'GET /api/notificacoes': () =>
            Response.json({
              itens: servidor.itens,
              naoLidas: servidor.itens.filter(({ lida }) => !lida).length,
              proximo: null,
            }),
        },
        preferencias,
      )}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  /** O servidor passa a ter estas notificações, e o evento chega à aba. */
  const chegar = (...itens: Notificacao[]) => {
    servidor.itens = itens;
    act(() =>
      canal.publicar({
        id: `evento-${Math.random()}`,
        tipo: 'notificacoes.mudaram',
        momento: new Date().toISOString(),
        alvo: null,
      }),
    );
  };
  return { chegar };
}

const titulosNaTela = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const avisoDe = (titulo: string) =>
  filaDeAvisos.naTela.find(({ aviso }) => aviso.titulo === titulo)?.aviso;

/** Espera a primeira leitura das notificações, que nunca vira aviso. */
const lido = () => screen.findByRole('button', { name: /^Notificações, 1 não lida/ });

describe('avisos das notificações', () => {
  it('só a notificação que chega com a aplicação aberta vira aviso, com as ações do alerta', async () => {
    const { chegar } = abrir();
    await lido();
    expect(titulosNaTela()).toEqual([]);
    chegar(notificacao(), ANTIGA);
    await waitFor(() => expect(titulosNaTela()).toEqual(['Black Toner Cartridge em 8%']));
    const aviso = avisoDe('Black Toner Cartridge em 8%');
    expect(aviso?.situacao).toBe('critico');
    expect(aviso?.aoReconhecer).toBeTypeOf('function');
    expect(aviso?.rotuloDoAdiar).toBe('Adiar 15 min');
    expect(aviso?.aoAbrir).toBeTypeOf('function');
  });

  it('a Atenção desligada nos Ajustes vai só para a central', async () => {
    const { chegar } = abrir({ notificacoes: { atencao: false } });
    await lido();
    chegar(notificacao({ severidade: 'atencao', alerta: null }), ANTIGA);
    await screen.findByRole('button', { name: 'Notificações, 2 não lidas' });
    expect(titulosNaTela()).toEqual([]);
  });

  it('com o Foco ligado, só o Crítico vira aviso', async () => {
    const { chegar } = abrir({ notificacoes: { foco: true } });
    await lido();
    chegar(
      notificacao({ id: 'n2', severidade: 'info', titulo: 'Backup concluído', alerta: null }),
      ANTIGA,
    );
    await screen.findByRole('button', { name: 'Notificações, 2 não lidas, Foco ligado' });
    expect(titulosNaTela()).toEqual([]);
    chegar(notificacao(), ANTIGA);
    await waitFor(() => expect(titulosNaTela()).toEqual(['Black Toner Cartridge em 8%']));
  });

  it('o aviso sai quando o alerta é reconhecido em outro lugar', async () => {
    const { chegar } = abrir();
    await lido();
    chegar(notificacao(), ANTIGA);
    await waitFor(() => expect(titulosNaTela()).toEqual(['Black Toner Cartridge em 8%']));
    chegar(
      notificacao({
        alerta: {
          ...ALERTA_ABERTO,
          reconhecido: { nome: 'Bruno Lima', em: new Date().toISOString() },
        },
      }),
      ANTIGA,
    );
    await waitFor(() => expect(titulosNaTela()).toEqual([]));
  });

  it('o aviso sai quando a notificação é lida em outra aba', async () => {
    const { chegar } = abrir();
    await lido();
    chegar(notificacao({ alerta: null }), ANTIGA);
    await waitFor(() => expect(titulosNaTela()).toEqual(['Black Toner Cartridge em 8%']));
    chegar(notificacao({ alerta: null, lida: true }), ANTIGA);
    await waitFor(() => expect(titulosNaTela()).toEqual([]));
  });

  it('com outra aba usada depois, o aviso fica para ela, e esta só atualiza o sino', async () => {
    const { chegar } = abrir();
    await lido();
    const outraAba = new BroadcastChannel(CANAL_DAS_ABAS);
    outraAba.postMessage({ tipo: 'em-uso', aba: 'outra', momento: Date.now() + 5_000 });
    // A mensagem chega pelo laço de eventos.
    await new Promise((resolver) => setTimeout(resolver, 50));
    chegar(notificacao(), ANTIGA);
    await screen.findByRole('button', { name: 'Notificações, 2 não lidas' });
    expect(titulosNaTela()).toEqual([]);
    outraAba.close();
  });
});
