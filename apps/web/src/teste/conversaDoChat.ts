// A conversa do chat nos testes: as pessoas, as mensagens, o cabeçalho da Equipe Financeiro e o
// servidor da conversa, que dá as mensagens de 50 em 50, como a API, e guarda o que cada pedido fez.
import { fireEvent, screen } from '@testing-library/react';
import type { ConversaAberta } from '../chat/consultas.ts';
import type { MensagemDoChat } from '../chat/conversa.ts';
import { CONTA_DE_EXEMPLO, type ServidorDeTeste } from './sessao.ts';

export const CONVERSA = '0199a6e0-0000-7000-8000-00000000c0e1';
export const CAMINHO = `/api/chat/conversas/${CONVERSA}`;

/** O id da mensagem n: os ids crescem com n, como os `uuidv7()` com a hora. */
export const id = (n: number) => `0199a6e0-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const PAULO = {
  conta: '0199a6e0-0000-7000-8000-0000000000c2',
  nome: 'Paulo Nunes',
  daTi: false,
  foto: null,
};
export const TATIANA = {
  conta: '0199a6e0-0000-7000-8000-0000000000c3',
  nome: 'Tatiana Ramos',
  daTi: false,
  foto: null,
};
/** A conta da sessão dos testes. */
export const ANA = { conta: CONTA_DE_EXEMPLO.id ?? '', nome: 'Ana Souza', daTi: true, foto: null };

/** O momento de agora nos testes: 10:40 de 20/11/2026 em Brasília. */
export const AGORA = new Date('2026-11-20T13:40:00.000Z');

/** Às hh:mm de um dia de novembro de 2026, em Brasília. */
export const as = (hora: string, dia = 20) => {
  const [horas = 0, minutos = 0] = hora.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, dia, horas + 3, minutos)).toISOString();
};

/** A mensagem n de Paulo Nunes, às 09:00 de 20/11 em Brasília, mais n minutos. */
export const mensagem = (n: number, mudar: Partial<MensagemDoChat> = {}): MensagemDoChat => ({
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

export const varias = (de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => mensagem(de + i));

export const EQUIPE: ConversaAberta = {
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

export const naoEncontrado = (detalhe: string) =>
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

/** A recusa da API, com a frase do campo. */
export const recusada = (
  campos: Record<string, string>,
  detalhe = 'Confira os campos indicados.',
) =>
  Response.json(
    {
      type: 'urn:grafite:problema:dados-invalidos',
      title: 'Dados inválidos',
      status: 400,
      detail: detalhe,
      campos,
    },
    { status: 400, headers: { 'content-type': 'application/problem+json' } },
  );

/**
 * A conversa no servidor de teste: o cabeçalho, as mensagens de 50 em 50, como a API as dá (as
 * mais novas, antes, depois ou ao redor de uma), a leitura, que só anda para a frente, e o que cada
 * pedido buscou.
 */
export function servidorDaConversa({
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
export const conversaMudou = (n: number) => ({
  id: `0199a6e0-0000-7000-8000-0000000009${String(n).padStart(2, '0')}`,
  tipo: 'chat.mudou' as const,
  momento: AGORA.toISOString(),
  alvo: { tipo: 'conversa', id: CONVERSA },
});

/** A área das mensagens com a altura do conteúdo, a da janela e o ponto da rolagem. */
export function rolar(
  area: HTMLElement,
  medidas: { conteudo: () => number; janela: number; topo: number },
) {
  Object.defineProperty(area, 'scrollHeight', { configurable: true, get: medidas.conteudo });
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: medidas.janela });
  area.scrollTop = medidas.topo;
  fireEvent.scroll(area);
}

export const areaDasMensagens = () => screen.findByRole('region', { name: 'Mensagens' });

/** A mensagem na tela, pelo texto. */
export const mensagemNaTela = async (texto: string) => {
  const item = (await screen.findByText(texto)).closest('li');
  if (!item) throw new Error(`A mensagem "${texto}" não está numa lista.`);
  return item;
};
