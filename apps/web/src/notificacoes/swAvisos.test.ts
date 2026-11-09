// O service worker dos avisos do push (spec notificacoes, "Push por severidade"; change
// p3c-email-e-push, design, decisão 7): o arquivo que o Workbox importa mostra o push pelo sistema
// do aparelho e, ao toque, leva o Grafite ao endereço da notificação. Roda aqui num escopo de
// service worker falso.
import { describe, expect, it, vi } from 'vitest';
import codigo from '../../public/sw-avisos.js?raw';

const ORIGEM = 'https://grafite.empresa.com.br';

interface JanelaFalsa {
  url: string;
  focus: () => Promise<JanelaFalsa>;
  postMessage: (mensagem: unknown) => void;
}

function escopoFalso({ janelas = [] as JanelaFalsa[] } = {}) {
  const ouvintes = new Map<string, (evento: object) => void>();
  const mostradas: Array<{ titulo: string; opcoes: NotificationOptions }> = [];
  const abertas: string[] = [];
  const escopo = {
    location: { origin: ORIGEM },
    addEventListener: (tipo: string, ouvinte: (evento: object) => void) =>
      ouvintes.set(tipo, ouvinte),
    registration: {
      showNotification: async (titulo: string, opcoes: NotificationOptions) => {
        mostradas.push({ titulo, opcoes });
      },
    },
    clients: {
      matchAll: async () => janelas,
      openWindow: async (url: string) => {
        abertas.push(url);
        return null;
      },
    },
  };
  new Function('self', codigo)(escopo);
  async function disparar(tipo: string, dados: object) {
    const esperas: Promise<unknown>[] = [];
    ouvintes.get(tipo)?.({
      ...dados,
      waitUntil: (espera: Promise<unknown>) => esperas.push(espera),
    });
    await Promise.all(esperas);
  }
  return { mostradas, abertas, disparar };
}

const CONTEUDO = {
  titulo: 'Crítico: Black Toner Cartridge em 8%',
  corpo: 'HP LaserJet M404 · PAT-00412',
  destino: '/ativos/0199d3a0-0000-7000-8000-0000000000a1',
  severidade: 'critico',
  etiqueta: '0199d3a0-0000-7000-8000-0000000000e1',
};

const push = (conteudo: unknown) => ({ data: { json: () => conteudo } });

describe('push', () => {
  it('mostra o título, o corpo, a etiqueta e o ícone, e o crítico fica até o toque', async () => {
    const sw = escopoFalso();
    await sw.disparar('push', push(CONTEUDO));
    expect(sw.mostradas).toEqual([
      {
        titulo: CONTEUDO.titulo,
        opcoes: {
          body: CONTEUDO.corpo,
          tag: CONTEUDO.etiqueta,
          icon: '/icones/pwa-192.png',
          data: { destino: CONTEUDO.destino },
          requireInteraction: true,
        },
      },
    ]);
  });

  it('o que não é crítico some sozinho', async () => {
    const sw = escopoFalso();
    await sw.disparar('push', push({ ...CONTEUDO, severidade: 'atencao' }));
    expect(sw.mostradas[0]?.opcoes.requireInteraction).toBe(false);
  });

  it('o push sem conteúdo legível mostra um aviso do Grafite que abre a tela inicial', async () => {
    const sw = escopoFalso();
    await sw.disparar('push', {
      data: {
        json: () => {
          throw new SyntaxError('JSON inválido');
        },
      },
    });
    await sw.disparar('push', { data: null });
    expect(sw.mostradas.map(({ titulo, opcoes }) => [titulo, opcoes.body, opcoes.data])).toEqual([
      ['Grafite', 'Há uma notificação nova.', { destino: '/' }],
      ['Grafite', 'Há uma notificação nova.', { destino: '/' }],
    ]);
  });
});

describe('toque no push', () => {
  const toque = (destino: unknown) => {
    const notificacao = { data: { destino }, close: vi.fn() };
    return { notificacao, evento: { notification: notificacao } };
  };

  it('foca a janela aberta do Grafite e pede que ela abra o endereço', async () => {
    const mensagens: unknown[] = [];
    const janela: JanelaFalsa = {
      url: `${ORIGEM}/`,
      focus: vi.fn(async () => janela),
      postMessage: (mensagem) => mensagens.push(mensagem),
    };
    const sw = escopoFalso({ janelas: [janela] });
    const { notificacao, evento } = toque(CONTEUDO.destino);
    await sw.disparar('notificationclick', evento);
    expect(notificacao.close).toHaveBeenCalled();
    expect(janela.focus).toHaveBeenCalled();
    expect(mensagens).toEqual([{ tipo: 'grafite:abrir', destino: CONTEUDO.destino }]);
    expect(sw.abertas).toEqual([]);
  });

  it('sem janela aberta, abre uma nova no endereço', async () => {
    const sw = escopoFalso();
    await sw.disparar('notificationclick', toque(CONTEUDO.destino).evento);
    expect(sw.abertas).toEqual([`${ORIGEM}${CONTEUDO.destino}`]);
  });

  it('o endereço de outro site vira a tela inicial do Grafite', async () => {
    const sw = escopoFalso();
    await sw.disparar('notificationclick', toque('https://outro.exemplo.test/x').evento);
    await sw.disparar('notificationclick', toque('//outro.exemplo.test/x').evento);
    expect(sw.abertas).toEqual([`${ORIGEM}/`, `${ORIGEM}/`]);
  });
});
