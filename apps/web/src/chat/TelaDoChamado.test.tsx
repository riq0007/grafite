// A tela do chamado no chat (spec modulo-chat, "Chamado no chat"; change chat-com-chamados, tarefa
// 4.6): a volta a um chamado lê a conversa de novo e não mostra a guardada, que não tem o que chegou
// fora da tela: a tela abre na "Resposta nova", e as opções de uma pergunta já respondida não ficam
// clicáveis. A conversa que uma ação devolve depois de a tela sair também não fica guardada.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirOChat, comOChat, fecharOChat } from '../teste/chat.tsx';
import type { ChamadoDeQuemParticipa, ConversaDoChamadoNoChat } from './consultas.ts';

afterEach(fecharOChat);

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
