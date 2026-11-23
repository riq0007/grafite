// A tela do chamado no chat (spec modulo-chat, "Chamado no chat"; change chat-com-chamados, tarefa
// 4.6): a volta a um chamado lê a conversa de novo e não mostra a guardada, que não tem o que chegou
// fora da tela: a tela abre na "Resposta nova", e as opções de uma pergunta já respondida não ficam
// clicáveis. A conversa que uma ação devolve depois de a tela sair também não fica guardada. O chamado
// que muda à vista mostra a resposta sem tirar o que se escreve, e a notificação dele não vira aviso
// (spec modulo-chat, "Telas do chat atualizadas e avisos").
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { abrirOChat, comOChat, fecharOChat } from '../teste/chat.tsx';
import type { ChamadoDeQuemParticipa, ConversaDoChamadoNoChat } from './consultas.ts';

afterEach(() => {
  fecharOChat();
  vi.restoreAllMocks();
});

const id = (n: number) => `0199a6e0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const EM = '2026-11-11T12:00:00Z';
const ANA = { nome: 'Ana Souza', daTi: true, minha: false };
const IMPRESSORA = { nome: 'Impressora', icone: 'impressora' } as const;

type ItemDaConversa = ConversaDoChamadoNoChat['conversa'][number];

const mensagem = (n: number, texto: string): ItemDaConversa => ({
  especie: 'mensagem',
  id: id(n),
  em: EM,
  autor: ANA,
  texto,
  anexos: [],
  opcoes: null,
  escolhida: null,
  cartao: null,
});

const conversa = (
  numero: number,
  titulo: string,
  mudar: Partial<ConversaDoChamadoNoChat> = {},
): ConversaDoChamadoNoChat => ({
  numero,
  titulo,
  tipo: IMPRESSORA,
  situacao: 'em-atendimento',
  fechado: false,
  situacaoEmTexto: 'Em andamento',
  abertoEm: EM,
  atende: null,
  etapas: [],
  previsao: null,
  reabrirAte: null,
  ativo: null,
  resumo: '',
  anexosDosCampos: [],
  origem: null,
  conversa: [],
  respostaNova: { quantas: 0, desde: null },
  avaliacao: null,
  ...mudar,
});

const naLista = (numero: number, titulo: string): ChamadoDeQuemParticipa => ({
  numero,
  titulo,
  tipo: IMPRESSORA,
  situacao: 'em-atendimento',
  fechado: false,
  situacaoEmTexto: 'Em andamento',
  abertoEm: EM,
  resolvidoEm: null,
  atende: null,
  respostaNova: 0,
  ultimaMensagem: null,
});

const PASTA = 'Sem acesso à pasta do Financeiro';
const IMPRESSORA_MANCHANDO = 'Impressora manchando';

async function irAoOutro(numero: number) {
  const outros = await screen.findByRole('navigation', { name: 'Seus outros chamados' });
  fireEvent.click(within(outros).getByRole('link', { name: new RegExp(`#${numero}`) }));
}

describe('a volta a um chamado', () => {
  it('lê a conversa de novo, sem mostrar a guardada, e abre na resposta nova que chegou fora da tela', async () => {
    let do1041 = conversa(1041, PASTA, { conversa: [mensagem(1, 'Vou olhar a pasta.')] });
    abrirOChat(
      '/chat/chamados/1041',
      comOChat({
        'GET /api/chat/chamados': () =>
          Response.json({
            abertos: [naLista(1041, PASTA), naLista(1045, IMPRESSORA_MANCHANDO)],
            resolvidos: [],
            seguintes: false,
          }),
        'GET /api/chat/chamados/1041': () => Response.json(do1041),
        'GET /api/chat/chamados/1045': () => Response.json(conversa(1045, IMPRESSORA_MANCHANDO)),
      }),
    );
    expect(await screen.findByText('Vou olhar a pasta.')).toBeTruthy();

    await irAoOutro(1045);
    expect(await screen.findByRole('heading', { name: IMPRESSORA_MANCHANDO })).toBeTruthy();

    // Ana responde no #1041 com a pessoa no #1045.
    do1041 = conversa(1041, PASTA, {
      conversa: [mensagem(1, 'Vou olhar a pasta.'), mensagem(2, 'Confirme o nome da pasta.')],
      respostaNova: { quantas: 1, desde: id(2) },
    });
    await irAoOutro(1041);
    expect(await screen.findByText('Abrindo o chamado…')).toBeTruthy();
    expect(screen.queryByText('Vou olhar a pasta.')).toBeNull();
    expect(await screen.findByText('Confirme o nome da pasta.')).toBeTruthy();
    expect(screen.getByText('Resposta nova')).toBeTruthy();
  });

  it('não guarda a conversa que a resposta devolve depois de a tela sair', async () => {
    let soltar = () => {};
    let leiturasDaLista = 0;
    const do1041 = conversa(1041, PASTA, { conversa: [mensagem(1, 'Vou olhar a pasta.')] });
    abrirOChat(
      '/chat/chamados/1041',
      comOChat({
        'GET /api/chat/chamados': () => {
          leiturasDaLista++;
          return Response.json({
            abertos: [naLista(1041, PASTA), naLista(1045, IMPRESSORA_MANCHANDO)],
            resolvidos: [],
            seguintes: false,
          });
        },
        'GET /api/chat/chamados/1041': () => Response.json(do1041),
        'GET /api/chat/chamados/1045': () => Response.json(conversa(1045, IMPRESSORA_MANCHANDO)),
        'POST /api/chat/chamados/1041/mensagens': () =>
          new Promise<Response>((resolve) => {
            soltar = () => resolve(Response.json(do1041));
          }),
      }),
    );
    const caixa = await screen.findByRole('textbox', { name: 'Responder no #1041' });
    fireEvent.change(caixa, { target: { value: 'É a pasta Financeiro 2026.' } });
    fireEvent.keyDown(caixa, { key: 'Enter' });

    // A pessoa vai ao #1045 antes de a resposta voltar, e ela volta com a tela do #1041 fora.
    await irAoOutro(1045);
    expect(await screen.findByRole('heading', { name: IMPRESSORA_MANCHANDO })).toBeTruthy();
    const antes = leiturasDaLista;
    soltar();
    await waitFor(() => expect(leiturasDaLista).toBeGreaterThan(antes));

    await irAoOutro(1041);
    expect(await screen.findByText('Abrindo o chamado…')).toBeTruthy();
  });
});

describe('"Seus outros chamados"', () => {
  it('seguem a ordem da lista do Chat: os que aguardam a pessoa e depois o aberto mais novo', async () => {
    abrirOChat(
      '/chat/chamados/1041',
      comOChat({
        // A API não ordena os abertos.
        'GET /api/chat/chamados': () =>
          Response.json({
            abertos: [
              naLista(1041, PASTA),
              { ...naLista(1044, 'Teclado com teclas falhando'), abertoEm: '2026-11-11T12:40:00Z' },
              { ...naLista(1045, IMPRESSORA_MANCHANDO), abertoEm: '2026-11-11T13:32:00Z' },
              {
                ...naLista(1039, 'Sem acesso à VPN'),
                situacao: 'aguardando',
                situacaoEmTexto: 'Aguardando você',
                abertoEm: '2026-11-10T20:05:00Z',
              },
            ],
            resolvidos: [],
            seguintes: false,
          }),
        'GET /api/chat/chamados/1041': () => Response.json(conversa(1041, PASTA)),
      }),
    );
    const outros = await screen.findByRole('navigation', { name: 'Seus outros chamados' });
    expect(
      within(outros)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/chat/chamados/1039', '/chat/chamados/1045', '/chat/chamados/1044']);
  });
});

type Notificacao = components['schemas']['NotificacaoNaLista'];

/** A resposta da TI no chamado, como a API a notifica a quem participa, no app do chat. */
const respondeu = (numero: number): Notificacao => ({
  id: `n${numero}`,
  severidade: 'info',
  titulo: `Ana Souza respondeu o #${numero}`,
  descricao: 'Já troquei o toner.',
  origem: 'Chamados',
  destino: `/chat/chamados/${numero}`,
  criadaEm: new Date(Date.now() + 1_000).toISOString(),
  lida: false,
  alerta: null,
});

const mudou = (tipo: 'chamados.mudaram' | 'notificacoes.mudaram') => ({
  id: `evento-${tipo}`,
  tipo,
  momento: new Date().toISOString(),
  alvo: null,
});

describe('o chamado que muda à vista', () => {
  it('a resposta da TI aparece sem tirar o que se escreve, e só a notificação de outro chamado vira aviso', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const canal = criarCanalDeEventos();
    let do1045 = conversa(1045, IMPRESSORA_MANCHANDO, {
      conversa: [mensagem(1, 'Vou olhar a impressora.')],
    });
    const notificacoes = { itens: [] as Notificacao[], leituras: 0 };
    abrirOChat(
      '/chat/chamados/1045',
      comOChat({
        'GET /api/chat/chamados': () =>
          Response.json({
            abertos: [naLista(1045, IMPRESSORA_MANCHANDO), naLista(1041, PASTA)],
            resolvidos: [],
            seguintes: false,
          }),
        'GET /api/chat/chamados/1045': () => Response.json(do1045),
        'GET /api/notificacoes': () => {
          notificacoes.leituras++;
          return Response.json({
            itens: notificacoes.itens,
            naoLidas: notificacoes.itens.length,
            proximo: null,
          });
        },
      }),
      { canal },
    );
    const caixa = () =>
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Responder no #1045' });
    expect(await screen.findByText('Vou olhar a impressora.')).toBeTruthy();
    await waitFor(() => expect(notificacoes.leituras).toBe(1));
    caixa().focus();
    fireEvent.change(caixa(), { target: { value: 'A bandeja 2 também mancha.' } });

    // Ana responde no #1045, que está à vista, e no #1041.
    do1045 = conversa(1045, IMPRESSORA_MANCHANDO, {
      conversa: [mensagem(1, 'Vou olhar a impressora.'), mensagem(2, 'Já troquei o toner.')],
      respostaNova: { quantas: 1, desde: id(2) },
    });
    notificacoes.itens = [respondeu(1045), respondeu(1041)];
    act(() => {
      canal.publicar(mudou('chamados.mudaram'));
      canal.publicar(mudou('notificacoes.mudaram'));
    });
    expect(await screen.findByText('Já troquei o toner.')).toBeTruthy();
    const titulos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
    // Os dois avisos entrariam juntos, na mesma leitura.
    await waitFor(() => expect(titulos()).toContain('Ana Souza respondeu o #1041'));
    expect(titulos()).toEqual(['Ana Souza respondeu o #1041']);
    expect(caixa().value).toBe('A bandeja 2 também mancha.');
    expect(document.activeElement).toBe(caixa());
  });

  it('a notificação do chamado à vista no endereço da TI também não vira aviso', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const canal = criarCanalDeEventos();
    const notificacoes = { itens: [] as Notificacao[], leituras: 0 };
    abrirOChat(
      '/chat/chamados/1045',
      comOChat({
        'GET /api/chat/chamados': () =>
          Response.json({
            abertos: [naLista(1045, IMPRESSORA_MANCHANDO), naLista(1041, PASTA)],
            resolvidos: [],
            seguintes: false,
          }),
        'GET /api/chat/chamados/1045': () =>
          Response.json(
            conversa(1045, IMPRESSORA_MANCHANDO, {
              conversa: [mensagem(1, 'Vou olhar a impressora.')],
            }),
          ),
        'GET /api/notificacoes': () => {
          notificacoes.leituras++;
          return Response.json({
            itens: notificacoes.itens,
            naoLidas: notificacoes.itens.length,
            proximo: null,
          });
        },
      }),
      { canal },
    );
    expect(await screen.findByText('Vou olhar a impressora.')).toBeTruthy();
    await waitFor(() => expect(notificacoes.leituras).toBe(1));

    // A conta atende o #1045 e participa dele: a resposta da pessoa chega no endereço da TI.
    notificacoes.itens = [paraQuemAtende(1045), paraQuemAtende(1041)];
    act(() => canal.publicar(mudou('notificacoes.mudaram')));
    const titulos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
    await waitFor(() => expect(titulos()).toContain('Fernanda Rocha respondeu o #1041'));
    expect(titulos()).toEqual(['Fernanda Rocha respondeu o #1041']);
  });
});

/** A resposta da pessoa no chamado, como a API a notifica a quem o atende, no endereço da TI. */
const paraQuemAtende = (numero: number): Notificacao => ({
  ...respondeu(numero),
  id: `ti${numero}`,
  titulo: `Fernanda Rocha respondeu o #${numero}`,
  destino: `/chamados/${numero}`,
});
