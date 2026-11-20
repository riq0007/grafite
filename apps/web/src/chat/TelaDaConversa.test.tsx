// A conversa aberta (spec modulo-chat, "Conversa na tela"; spec chat, "Não lidas", "Link da
// mensagem" e "Chamados da conversa"): o cabeçalho e as abas, as mensagens seguidas juntas, os dias
// e o evento, a abertura na primeira não lida, na última ou na mensagem do link, a leitura com a
// conversa à vista, "Mensagens anteriores", a conversa presa embaixo e "Mensagens novas · 2".
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { abrirOChat as abrir, comOChat, fecharOChat } from '../teste/chat.tsx';
import { CONTA_DE_EXEMPLO, type ServidorDeTeste } from '../teste/sessao.ts';
import type { ConversaAberta } from './consultas.ts';
import type { MensagemDoChat } from './conversa.ts';

const CONVERSA = '0199a6e0-0000-7000-8000-00000000c0e1';
const CAMINHO = `/api/chat/conversas/${CONVERSA}`;

/** O id da mensagem n: os ids crescem com n, como os `uuidv7()` com a hora. */
const id = (n: number) => `0199a6e0-0000-7000-8000-${String(n).padStart(12, '0')}`;

const PAULO = {
  conta: '0199a6e0-0000-7000-8000-0000000000c2',
  nome: 'Paulo Nunes',
  daTi: false,
  foto: null,
};
const TATIANA = {
  conta: '0199a6e0-0000-7000-8000-0000000000c3',
  nome: 'Tatiana Ramos',
  daTi: false,
  foto: null,
};
const ANA = { conta: CONTA_DE_EXEMPLO.id ?? '', nome: 'Ana Souza', daTi: true, foto: null };

/** O momento de agora nos testes: 10:40 de 20/11/2026 em Brasília. */
const AGORA = new Date('2026-11-20T13:40:00.000Z');

/** Às hh:mm de um dia de novembro de 2026, em Brasília. */
const as = (hora: string, dia = 20) => {
  const [horas = 0, minutos = 0] = hora.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, dia, horas + 3, minutos)).toISOString();
};

/** A mensagem n de Paulo Nunes, às 09:00 de 20/11 em Brasília, mais n minutos. */
const mensagem = (n: number, mudar: Partial<MensagemDoChat> = {}): MensagemDoChat => ({
  id: id(n),
  especie: 'mensagem',
  autor: PAULO,
  texto: `Mensagem ${n}`,
  evento: null,
  criadaEm: new Date(Date.UTC(2026, 10, 20, 12, n)).toISOString(),
  respondida: null,
  reacoes: [],
  anexos: [],
  citacoes: [],
  chamado: null,
  ...mudar,
});

const varias = (de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => mensagem(de + i));

const EQUIPE: ConversaAberta = {
  id: CONVERSA,
  tipo: 'equipe',
  nome: 'Equipe Financeiro',
  outra: null,
  pessoas: 12,
  escreveGrupo: null,
  arquivada: false,
  silenciada: false,
  lidaAte: null,
  escreve: true,
  recusa: null,
};

const naoEncontrado = (detalhe: string) =>
  Response.json(
    {
      type: 'urn:grafite:problema:nao-encontrado',
      title: 'Não encontrado',
      status: 404,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status: 404 },
  );

/**
 * A conversa no servidor de teste: o cabeçalho, as mensagens de 50 em 50, como a API as dá (as
 * mais novas, antes, depois ou ao redor de uma), a leitura, que só anda para a frente, e o que cada
 * pedido buscou.
 */
function servidorDaConversa({
  cabecalho = {},
  mensagens = [],
  lidaAte = null,
  outros = {},
}: {
  cabecalho?: Partial<ConversaAberta>;
  mensagens?: MensagemDoChat[];
  lidaAte?: string | null;
  outros?: ServidorDeTeste;
} = {}) {
  const estado = {
    mensagens: [...mensagens],
    lidaAte,
    leituras: [] as string[],
    paginas: [] as string[],
  };
  const servidor: ServidorDeTeste = {
    [`GET ${CAMINHO}`]: () => Response.json({ ...EQUIPE, lidaAte: estado.lidaAte, ...cabecalho }),
    [`GET ${CAMINHO}/mensagens`]: (pedido) => {
      const busca = new URL(pedido.url).searchParams;
      estado.paginas.push(busca.toString());
      const todas = estado.mensagens;
      const posicao = (alvo: string) => todas.findIndex((item) => item.id === alvo);
      let de = Math.max(0, todas.length - 50);
      let ate = todas.length;
      const em = busca.get('em');
      const antes = busca.get('antes');
      const depois = busca.get('depois');
      if (em !== null) {
        const ali = posicao(em);
        if (ali === -1) return naoEncontrado('A mensagem não foi encontrada.');
        de = Math.max(0, ali - 25);
        ate = Math.min(todas.length, ali + 25);
      } else if (antes !== null) {
        ate = posicao(antes);
        de = Math.max(0, ate - 50);
      } else if (depois !== null) {
        de = posicao(depois) + 1;
        ate = Math.min(todas.length, de + 50);
      }
      return Response.json({
        itens: todas.slice(de, ate),
        lidaAte: estado.lidaAte,
        anteriores: de > 0,
        seguintes: ate < todas.length,
      });
    },
    [`POST ${CAMINHO}/leitura`]: async (pedido) => {
      const { ate } = (await pedido.json()) as { ate: string };
      estado.leituras.push(ate);
      if (estado.lidaAte === null || ate > estado.lidaAte) estado.lidaAte = ate;
      return Response.json({ lidaAte: estado.lidaAte });
    },
    ...outros,
  };
  return { servidor, estado };
}

/** O evento da conversa, como o servidor o empurra a quem participa. */
const conversaMudou = (n: number) => ({
  id: `0199a6e0-0000-7000-8000-0000000009${String(n).padStart(2, '0')}`,
  tipo: 'chat.mudou' as const,
  momento: AGORA.toISOString(),
  alvo: { tipo: 'conversa', id: CONVERSA },
});

/** A área das mensagens com a altura do conteúdo, a da janela e o ponto da rolagem. */
function rolar(
  area: HTMLElement,
  medidas: { conteudo: () => number; janela: number; topo: number },
) {
  Object.defineProperty(area, 'scrollHeight', { configurable: true, get: medidas.conteudo });
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: medidas.janela });
  area.scrollTop = medidas.topo;
  fireEvent.scroll(area);
}

const areaDasMensagens = () => screen.findByRole('region', { name: 'Mensagens' });

/** A mensagem na tela, pelo texto. */
const mensagemNaTela = async (texto: string) => {
  const item = (await screen.findByText(texto)).closest('li');
  if (!item) throw new Error(`A mensagem "${texto}" não está numa lista.`);
  return item;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  fecharOChat();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('o cabeçalho e as abas', () => {
  it('a equipe tem quantas pessoas participam e as abas, com a Conversa escolhida', async () => {
    const { servidor } = servidorDaConversa({ mensagens: [mensagem(1)] });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const conversa = await screen.findByRole('region', { name: 'Equipe Financeiro' });
    expect(within(conversa).getByRole('heading', { level: 2 }).textContent).toBe(
      'Equipe Financeiro',
    );
    expect(within(conversa).getByText('12 pessoas')).toBeTruthy();
    expect(
      within(conversa)
        .getAllByRole('tab')
        .map((aba) => aba.textContent),
    ).toEqual(['Conversa', 'Arquivos', 'Chamados da equipe']);
    expect(within(conversa).getByRole('tab', { selected: true }).textContent).toBe('Conversa');
  });

  it('o canal diz quem escreve, com "Chamados do canal"', async () => {
    const { servidor } = servidorDaConversa({
      cabecalho: { tipo: 'canal', nome: 'Avisos da TI', pessoas: null, escreveGrupo: 'TI' },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const conversa = await screen.findByRole('region', { name: 'Avisos da TI' });
    expect(within(conversa).getByText('Só TI escreve')).toBeTruthy();
    expect(within(conversa).getByRole('tab', { name: 'Chamados do canal' })).toBeTruthy();
  });

  it('a direta não tem abas, e as mensagens ficam logo embaixo do cabeçalho', async () => {
    const { servidor } = servidorDaConversa({
      cabecalho: { tipo: 'direta', nome: 'Paulo Nunes', outra: PAULO, pessoas: null },
      mensagens: [mensagem(1)],
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const conversa = await screen.findByRole('region', { name: 'Paulo Nunes' });
    expect(await within(conversa).findByText('Mensagem 1')).toBeTruthy();
    expect(within(conversa).queryByRole('tablist')).toBeNull();
  });

  it('sem o módulo Chamados, a aba dos chamados sai', async () => {
    const { servidor } = servidorDaConversa();
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor, { modulosDesligados: ['chamados'] }));
    const conversa = await screen.findByRole('region', { name: 'Equipe Financeiro' });
    expect(
      within(conversa)
        .getAllByRole('tab')
        .map((aba) => aba.textContent),
    ).toEqual(['Conversa', 'Arquivos']);
  });

  it('Arquivos e "Chamados da equipe" listam o mais novo primeiro, com quem e quando', async () => {
    const arquivo = '0199a6e0-0000-7000-8000-00000000f001';
    const { servidor } = servidorDaConversa({
      outros: {
        [`GET ${CAMINHO}/arquivos`]: () =>
          Response.json({
            itens: [
              {
                id: arquivo,
                nome: 'despesas.xlsx',
                tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                bytes: 12_288,
                mensagem: id(2),
                autor: PAULO,
                enviadoEm: as('10:19'),
              },
            ],
            seguintes: false,
          }),
        [`GET ${CAMINHO}/chamados`]: () =>
          Response.json({
            itens: [
              {
                numero: 1045,
                titulo: 'Impressora manchando as folhas',
                situacao: 'Em andamento',
                atende: 'Bruno Lima',
                abriu: 'Fernanda Rocha',
                abertoEm: as('10:32'),
              },
            ],
            seguintes: false,
          }),
      },
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    fireEvent.click(await screen.findByRole('tab', { name: 'Arquivos' }));
    const doArquivo = await screen.findByRole('link', { name: 'despesas.xlsx' });
    expect(doArquivo.getAttribute('href')).toBe(`${CAMINHO}/anexos/${arquivo}`);
    expect(screen.getByText('12 KB · Paulo Nunes · hoje, 10:19')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Chamados da equipe' }));
    const chamado = await mensagemNaTela('Impressora manchando as folhas');
    expect(within(chamado).getByText('#1045')).toBeTruthy();
    expect(within(chamado).getByText('Em andamento')).toBeTruthy();
    expect(
      within(chamado).getByText('Bruno Lima atende · Aberto por Fernanda Rocha · hoje, 10:32'),
    ).toBeTruthy();
  });
});

describe('as mensagens', () => {
  it('juntam as seguidas da mesma pessoa, separam os dias e mostram o evento do chamado', async () => {
    const { servidor } = servidorDaConversa({
      mensagens: [
        mensagem(1, {
          autor: TATIANA,
          texto: 'Quem vai fechar o relatório de despesas?',
          criadaEm: as('17:05', 19),
        }),
        mensagem(2, {
          texto: 'A impressora do Financeiro está manchando todas as folhas.',
          criadaEm: as('10:19'),
          reacoes: [
            {
              texto: '+1',
              contas: [
                { conta: TATIANA.conta, nome: 'Tatiana Ramos' },
                { conta: ANA.conta, nome: 'Ana Souza (TI)' },
              ],
              minha: true,
            },
          ],
          chamado: { numero: 1045, abrir: true, mensagem: id(2) },
        }),
        mensagem(3, { texto: 'Alguém já avisou a TI?', criadaEm: as('10:21') }),
        mensagem(4, {
          especie: 'evento',
          autor: ANA,
          texto: null,
          evento: 'virou-chamado',
          criadaEm: as('10:32'),
          chamado: { numero: 1045, abrir: true, mensagem: id(2) },
        }),
        mensagem(5, { autor: ANA, texto: 'Já abri o chamado.', criadaEm: as('10:33') }),
      ],
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const area = await areaDasMensagens();
    await within(area).findByText('Já abri o chamado.');
    expect(
      within(area)
        .getAllByRole('heading', { level: 3 })
        .map((dia) => dia.textContent),
    ).toEqual(['Ontem', 'Hoje']);

    const doPaulo = await mensagemNaTela(
      'A impressora do Financeiro está manchando todas as folhas.',
    );
    expect(within(doPaulo).getByText('Paulo Nunes')).toBeTruthy();
    expect(within(doPaulo).getByText('10:19')).toBeTruthy();
    expect(within(doPaulo).getByText('Virou o chamado')).toBeTruthy();
    expect(within(doPaulo).getByText('+1: Tatiana Ramos e você')).toBeTruthy();
    const seguida = await mensagemNaTela('Alguém já avisou a TI?');
    expect(seguida.hasAttribute('data-seguida')).toBe(true);
    expect(within(seguida).queryByRole('img')).toBeNull();

    const evento = within(area)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.includes('transformou'));
    if (!evento) throw new Error('O evento não está na conversa.');
    expect(evento.textContent).toBe(
      'Você transformou esta mensagem no chamado #1045 · 10:32Abrir chamado',
    );
    expect(within(evento).getByRole('link', { name: 'esta mensagem' }).getAttribute('href')).toBe(
      `/chat/c/${CONVERSA}?m=${id(2)}`,
    );
    expect(within(evento).getByRole('link', { name: 'Abrir chamado' }).getAttribute('href')).toBe(
      '/chat/chamados/1045',
    );
    expect(within(await mensagemNaTela('Já abri o chamado.')).getByText('Você')).toBeTruthy();
  });

  it('"Mensagens anteriores" traz as 50 de antes da primeira', async () => {
    const { servidor, estado } = servidorDaConversa({ mensagens: varias(1, 60) });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const area = await areaDasMensagens();
    await within(area).findByText('Mensagem 60');
    expect(within(area).queryByText('Mensagem 10')).toBeNull();
    fireEvent.click(within(area).getByRole('button', { name: 'Mensagens anteriores' }));
    expect(await within(area).findByText('Mensagem 1')).toBeTruthy();
    expect(estado.paginas.at(-1)).toBe(`antes=${id(11)}`);
    expect(within(area).queryByRole('button', { name: 'Mensagens anteriores' })).toBeNull();
  });
});

describe('a abertura e a leitura', () => {
  it('abre na primeira não lida, com "Mensagens novas", e marca como lida a última mostrada', async () => {
    const { servidor, estado } = servidorDaConversa({
      mensagens: [mensagem(1, { autor: ANA }), mensagem(2), mensagem(3), mensagem(4)],
      lidaAte: id(2),
    });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const area = await areaDasMensagens();
    await within(area).findByText('Mensagem 4');
    const textos = within(area)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    const novas = textos.indexOf('Mensagens novas');
    expect(novas).toBeGreaterThan(-1);
    expect(textos[novas + 1]).toContain('Mensagem 3');
    await waitFor(() => expect(estado.leituras).toEqual([id(4)]));
  });

  it('a conversa que a conta nunca leu abre na última, sem o separador, e fica lida', async () => {
    const { servidor, estado } = servidorDaConversa({ mensagens: varias(1, 3) });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    const area = await areaDasMensagens();
    await within(area).findByText('Mensagem 3');
    expect(within(area).queryByText('Mensagens novas')).toBeNull();
    await waitFor(() => expect(estado.leituras).toEqual([id(3)]));
  });

  it('com a janela fora de vista, não lê; lê quando ela volta a ter o foco', async () => {
    const foco = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { servidor, estado } = servidorDaConversa({ mensagens: varias(1, 2) });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor));
    await within(await areaDasMensagens()).findByText('Mensagem 2');
    expect(estado.leituras).toEqual([]);
    foco.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(estado.leituras).toEqual([id(2)]));
  });

  it('o link da mensagem abre a conversa nela, marcada', async () => {
    const { servidor, estado } = servidorDaConversa({ mensagens: varias(1, 100) });
    abrir(`/chat/c/${CONVERSA}?m=${id(30).toUpperCase()}`, comOChat(servidor));
    const marcada = await mensagemNaTela('Mensagem 30');
    expect(marcada.getAttribute('aria-current')).toBe('true');
    expect(within(marcada).getByText('Mensagem do link')).toBeTruthy();
    expect(estado.paginas[0]).toBe(`em=${id(30)}`);
    expect(screen.getByRole('button', { name: 'Mensagens seguintes' })).toBeTruthy();
  });

  it('o link de uma mensagem que não é da conversa diz que ela não foi encontrada', async () => {
    const { servidor } = servidorDaConversa({ mensagens: varias(1, 3) });
    abrir(`/chat/c/${CONVERSA}?m=${id(99)}`, comOChat(servidor));
    expect(await screen.findByText('A mensagem não foi encontrada.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir a conversa' }).getAttribute('href')).toBe(
      `/chat/c/${CONVERSA}`,
    );
  });

  it('o link de uma conversa de que a conta não participa diz que a mensagem não foi encontrada', async () => {
    abrir(
      `/chat/c/${CONVERSA}?m=${id(1)}`,
      comOChat({
        [`GET ${CAMINHO}`]: () => naoEncontrado('Conversa não encontrada.'),
        [`GET ${CAMINHO}/mensagens`]: () => naoEncontrado('A mensagem não foi encontrada.'),
      }),
    );
    expect(await screen.findByText('A mensagem não foi encontrada.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para o Chat' })).toBeTruthy();
  });
});

describe('a conversa que recebe mensagens', () => {
  it('no fim, desce com a mensagem que chega, sem o aviso', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDaConversa({ mensagens: varias(1, 5) });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor), { canal });
    const area = await areaDasMensagens();
    await within(area).findByText('Mensagem 5');
    let altura = 2000;
    rolar(area, { conteudo: () => altura, janela: 500, topo: 1500 });
    estado.mensagens.push(mensagem(6, { autor: TATIANA }));
    altura = 2400;
    act(() => canal.publicar(conversaMudou(1)));
    await within(area).findByText('Mensagem 6');
    expect(area.scrollTop).toBe(2400);
    expect(screen.queryByRole('button', { name: /^Mensagens novas/ })).toBeNull();
  });

  it('rolada para cima, fica onde está e mostra "Mensagens novas · 2", que leva ao fim', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDaConversa({ mensagens: varias(1, 5) });
    abrir(`/chat/c/${CONVERSA}`, comOChat(servidor), { canal });
    const area = await areaDasMensagens();
    await within(area).findByText('Mensagem 5');
    rolar(area, { conteudo: () => 2000, janela: 500, topo: 0 });
    estado.mensagens.push(mensagem(6, { autor: TATIANA }), mensagem(7, { autor: TATIANA }));
    act(() => canal.publicar(conversaMudou(2)));
    const novas = await screen.findByRole('button', { name: 'Mensagens novas · 2' });
    expect(area.scrollTop).toBe(0);
    fireEvent.click(novas);
    expect(area.scrollTop).toBe(2000);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Mensagens novas/ })).toBeNull(),
    );
  });
});
