// A conversa na tela (spec modulo-chat, "Conversa na tela"; spec chat, "Não lidas" e "Link da
// mensagem"): o trecho carregado, que cresce pelas pontas e se relê sem buracos, a abertura na
// mensagem do link, na primeira não lida ou na última, e a ordem do que a tela mostra, com os dias, o
// separador "Mensagens novas" e as mensagens seguidas da mesma pessoa juntas.
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it, vi } from 'vitest';
import {
  abrirTrecho,
  type BuscarPagina,
  type ItemNaTela,
  itensDaConversa,
  juntarPagina,
  type MensagemDoChat,
  novasDesde,
  type PaginaDeMensagens,
  type PedidoDaPagina,
  quandoNoChat,
  relerTrecho,
  rotuloDoDia,
  type TrechoDaConversa,
} from './conversa.ts';

const dataHora = criarDataHora('America/Sao_Paulo');

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
const ANA = {
  conta: '0199a6e0-0000-7000-8000-0000000000c1',
  nome: 'Ana Souza',
  daTi: true,
  foto: null,
};

/** A mensagem n de Paulo Nunes, às 10:00 de 20/11 em Brasília, mais n minutos. */
const mensagem = (n: number, mudar: Partial<MensagemDoChat> = {}): MensagemDoChat => ({
  id: id(n),
  especie: 'mensagem',
  autor: PAULO,
  texto: `Mensagem ${n}`,
  evento: null,
  criadaEm: new Date(Date.UTC(2026, 10, 20, 13, n)).toISOString(),
  respondida: null,
  reacoes: [],
  anexos: [],
  citacoes: [],
  chamado: null,
  ...mudar,
});

const varias = (de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => mensagem(de + i));

const pagina = (
  itens: MensagemDoChat[],
  mudar: Partial<PaginaDeMensagens> = {},
): PaginaDeMensagens => ({ itens, lidaAte: null, anteriores: false, seguintes: false, ...mudar });

const trecho = (
  itens: MensagemDoChat[],
  mudar: Partial<TrechoDaConversa> = {},
): TrechoDaConversa => ({
  itens,
  anteriores: false,
  seguintes: false,
  lidaAte: null,
  lidaAoAbrir: null,
  ...mudar,
});

const ids = (itens: readonly { id: string }[]) => itens.map((item) => item.id);

describe('juntarPagina', () => {
  it('sem trecho, a página vira o trecho, com as pontas e a última lida dela', () => {
    const junto = juntarPagina(
      undefined,
      {},
      pagina(varias(51, 100), { anteriores: true, lidaAte: id(80) }),
    );
    expect(ids(junto.itens)).toEqual(ids(varias(51, 100)));
    expect(junto).toMatchObject({
      anteriores: true,
      seguintes: false,
      lidaAte: id(80),
      lidaAoAbrir: id(80),
    });
  });

  it('as mensagens anteriores entram antes do trecho, com a ponta de cima da página', () => {
    const antes = trecho(varias(51, 100), { anteriores: true, lidaAoAbrir: id(90) });
    const junto = juntarPagina(
      antes,
      { antes: id(51) },
      pagina(varias(1, 50), { anteriores: false, seguintes: true }),
    );
    expect(ids(junto.itens)).toEqual(ids(varias(1, 100)));
    expect(junto).toMatchObject({ anteriores: false, seguintes: false, lidaAoAbrir: id(90) });
  });

  it('as mensagens seguintes entram depois do trecho, com a ponta de baixo da página', () => {
    const antes = trecho(varias(1, 50), { anteriores: true, seguintes: true });
    const junto = juntarPagina(
      antes,
      { depois: id(50) },
      pagina(varias(51, 60), { anteriores: true, seguintes: false }),
    );
    expect(ids(junto.itens)).toEqual(ids(varias(1, 60)));
    expect(junto).toMatchObject({ anteriores: true, seguintes: false });
  });

  it('sem nada depois, o trecho chega ao fim, com as mesmas mensagens', () => {
    const antes = trecho(varias(1, 50), { seguintes: true });
    const junto = juntarPagina(
      antes,
      { depois: id(50) },
      pagina([], { anteriores: true, seguintes: false }),
    );
    expect(ids(junto.itens)).toEqual(ids(varias(1, 50)));
    expect(junto.seguintes).toBe(false);
  });

  it('a página relida troca as mensagens que cobre e guarda as de fora dela', () => {
    const antes = trecho(varias(1, 100));
    const comReacao = mensagem(90, {
      reacoes: [
        { texto: '+1', contas: [{ conta: ANA.conta, nome: 'Ana Souza (TI)' }], minha: true },
      ],
    });
    const relida = [...varias(52, 89), comReacao, ...varias(91, 101)];
    const junto = juntarPagina(antes, {}, pagina(relida, { anteriores: true }));
    expect(ids(junto.itens)).toEqual(ids(varias(1, 101)));
    expect(junto.itens.find((item) => item.id === id(90))?.reacoes).toHaveLength(1);
    expect(junto).toMatchObject({ anteriores: false, seguintes: false });
  });

  it('a página ao redor de uma mensagem troca só o que cobre', () => {
    const antes = trecho(varias(26, 75), { anteriores: true, seguintes: true });
    const junto = juntarPagina(
      antes,
      { em: id(26) },
      pagina(
        varias(1, 50).map((item) => ({ ...item, texto: 'Relida' })),
        {
          anteriores: false,
          seguintes: true,
        },
      ),
    );
    expect(ids(junto.itens)).toEqual(ids(varias(1, 75)));
    expect(junto.itens.filter((item) => item.texto === 'Relida')).toHaveLength(50);
    expect(junto).toMatchObject({ anteriores: false, seguintes: true });
  });

  it('a página longe do trecho, sem nada em comum, fica no lugar dele, sem buraco', () => {
    const antes = trecho(varias(1, 50));
    const junto = juntarPagina(antes, {}, pagina(varias(120, 169), { anteriores: true }));
    expect(ids(junto.itens)).toEqual(ids(varias(120, 169)));
    expect(junto.anteriores).toBe(true);
  });

  it('a última lida só anda para a frente, e a da abertura fica', () => {
    const antes = trecho(varias(1, 50), { lidaAte: id(50), lidaAoAbrir: id(40) });
    const junto = juntarPagina(antes, {}, pagina(varias(1, 51), { lidaAte: id(45) }));
    expect(junto.lidaAte).toBe(id(50));
    expect(junto.lidaAoAbrir).toBe(id(40));
    expect(juntarPagina(antes, {}, pagina(varias(1, 51), { lidaAte: id(51) })).lidaAte).toBe(
      id(51),
    );
  });
});

/** Um servidor de mensagens de 1 a `total`, em páginas de 50, como a API. */
function servidor(total: number, lidaAte: string | null = null) {
  const todas = varias(1, total);
  const pedidos: PedidoDaPagina[] = [];
  const buscar: BuscarPagina = vi.fn(async (pedido: PedidoDaPagina) => {
    pedidos.push(pedido);
    const posicao = (alvo: string) => todas.findIndex((item) => item.id === alvo);
    let de: number;
    let ate: number;
    if (pedido.antes) {
      ate = posicao(pedido.antes);
      de = Math.max(0, ate - 50);
    } else if (pedido.depois) {
      de = posicao(pedido.depois) + 1;
      ate = Math.min(todas.length, de + 50);
    } else if (pedido.em) {
      const em = posicao(pedido.em);
      de = Math.max(0, em - 25);
      ate = Math.min(todas.length, em + 25);
    } else {
      ate = todas.length;
      de = Math.max(0, ate - 50);
    }
    return pagina(todas.slice(de, ate), {
      anteriores: de > 0,
      seguintes: ate < todas.length,
      lidaAte,
    });
  });
  return { buscar, pedidos, todas };
}

describe('abrirTrecho', () => {
  it('abre nas mais novas, com a última lida dentro delas', async () => {
    const { buscar, pedidos } = servidor(120, id(110));
    const aberto = await abrirTrecho(buscar, null);
    expect(pedidos).toEqual([{}]);
    expect(ids(aberto.itens)).toEqual(ids(varias(71, 120)));
    expect(aberto).toMatchObject({ anteriores: true, seguintes: false, lidaAoAbrir: id(110) });
  });

  it('com a última lida antes das mais novas, abre ao redor dela, na primeira não lida', async () => {
    const { buscar, pedidos } = servidor(200, id(60));
    const aberto = await abrirTrecho(buscar, null);
    expect(pedidos).toEqual([{}, { em: id(60) }]);
    expect(ids(aberto.itens)).toEqual(ids(varias(35, 84)));
    expect(aberto).toMatchObject({ anteriores: true, seguintes: true, lidaAoAbrir: id(60) });
  });

  it('a conversa nunca lida abre nas mais novas', async () => {
    const { buscar, pedidos } = servidor(200, null);
    const aberto = await abrirTrecho(buscar, null);
    expect(pedidos).toEqual([{}]);
    expect(aberto.lidaAoAbrir).toBeNull();
    expect(ids(aberto.itens)).toEqual(ids(varias(151, 200)));
  });

  it('o link abre ao redor da mensagem dele', async () => {
    const { buscar, pedidos } = servidor(200, id(190));
    const aberto = await abrirTrecho(buscar, id(30));
    expect(pedidos).toEqual([{ em: id(30) }]);
    expect(ids(aberto.itens)).toEqual(ids(varias(5, 54)));
    expect(aberto).toMatchObject({ anteriores: true, seguintes: true });
  });
});

describe('relerTrecho', () => {
  it('no fim da conversa, relê das mais novas para trás até o começo do trecho, sem estendê-lo', async () => {
    const { buscar, pedidos } = servidor(230);
    const lido = trecho(varias(101, 200), { anteriores: true });
    const { pedido, pagina: relida } = await relerTrecho(buscar, lido);
    expect(pedidos).toEqual([{}, { antes: id(181) }, { antes: id(131) }]);
    expect(pedido).toEqual({});
    expect(ids(relida.itens)).toEqual(ids(varias(101, 230)));
    const junto = juntarPagina(lido, pedido, relida);
    expect(ids(junto.itens)).toEqual(ids(varias(101, 230)));
    expect(junto).toMatchObject({ anteriores: true, seguintes: false });
  });

  it('longe do fim, relê do começo do trecho para a frente, até o fim dele, sem estendê-lo', async () => {
    const { buscar, pedidos } = servidor(300);
    const lido = trecho(varias(101, 180), { anteriores: true, seguintes: true });
    const { pedido, pagina: relida } = await relerTrecho(buscar, lido);
    expect(pedidos).toEqual([{ em: id(101) }, { depois: id(125) }, { depois: id(175) }]);
    const junto = juntarPagina(lido, pedido, relida);
    expect(ids(junto.itens)).toEqual(ids(varias(101, 180)));
    expect(junto).toMatchObject({ anteriores: true, seguintes: true });
  });

  it('a mensagem que chega entra no fim, sem trazer anteriores', async () => {
    let lido = trecho(varias(151, 200), { anteriores: true });
    for (const total of [201, 202]) {
      const { buscar } = servidor(total);
      const { pedido, pagina: relida } = await relerTrecho(buscar, lido);
      lido = juntarPagina(lido, pedido, relida);
      expect(ids(lido.itens)).toEqual(ids(varias(151, total)));
      expect(lido).toMatchObject({ anteriores: true, seguintes: false });
    }
  });

  it('no começo da conversa, a releitura fica sem anteriores', async () => {
    const { buscar } = servidor(300);
    const lido = trecho(varias(1, 40), { seguintes: true });
    const { pedido, pagina: relida } = await relerTrecho(buscar, lido);
    const junto = juntarPagina(lido, pedido, relida);
    expect(ids(junto.itens)).toEqual(ids(varias(1, 40)));
    expect(junto).toMatchObject({ anteriores: false, seguintes: true });
  });

  it('a conversa sem mensagens relê as mais novas', async () => {
    const { buscar, pedidos } = servidor(0);
    const { pagina: relida } = await relerTrecho(buscar, trecho([]));
    expect(pedidos).toEqual([{}]);
    expect(relida.itens).toEqual([]);
  });
});

const HOJE = new Date('2026-11-20T15:00:00.000Z');

describe('rotuloDoDia e quandoNoChat', () => {
  it('dizem hoje, ontem e o dia, sem o ano no ano de agora, pelo fuso', () => {
    expect(rotuloDoDia(new Date('2026-11-20T03:00:00.000Z'), HOJE, dataHora)).toBe('Hoje');
    // 02:30 de 20/11 em UTC é 23:30 de 19/11 em Brasília.
    expect(rotuloDoDia(new Date('2026-11-20T02:30:00.000Z'), HOJE, dataHora)).toBe('Ontem');
    expect(rotuloDoDia(new Date('2026-11-12T15:00:00.000Z'), HOJE, dataHora)).toBe('12/11');
    expect(rotuloDoDia(new Date('2025-12-30T15:00:00.000Z'), HOJE, dataHora)).toBe('30/12/2025');
    expect(quandoNoChat(new Date('2026-11-20T13:19:00.000Z'), HOJE, dataHora)).toBe('hoje, 10:19');
    expect(quandoNoChat(new Date('2026-11-19T20:05:00.000Z'), HOJE, dataHora)).toBe('ontem, 17:05');
    expect(quandoNoChat(new Date('2026-11-12T13:19:00.000Z'), HOJE, dataHora)).toBe('12/11, 10:19');
  });
});

/** O que a tela mostra, em texto, para comparar a ordem. */
const emTexto = (itens: readonly ItemNaTela[]) =>
  itens.map((item) => {
    switch (item.tipo) {
      case 'dia':
        return `dia ${item.rotulo}`;
      case 'novas':
        return 'novas';
      case 'evento':
        return `evento ${item.mensagem.texto ?? item.mensagem.evento}`;
      default:
        return `${item.seguida ? 'seguida' : item.mensagem.autor.nome} ${item.mensagem.texto}`;
    }
  });

const opcoes = (mudar: { lidaAoAbrir?: string | null } = {}) => ({
  conta: ANA.conta,
  lidaAoAbrir: null,
  agora: HOJE,
  dataHora,
  ...mudar,
});

describe('itensDaConversa', () => {
  it('põe o dia antes da primeira mensagem de cada dia', () => {
    const itens = itensDaConversa(
      [
        mensagem(1, { criadaEm: '2026-11-12T13:00:00.000Z', texto: 'a' }),
        mensagem(2, { criadaEm: '2026-11-19T13:00:00.000Z', texto: 'b' }),
        mensagem(3, { criadaEm: '2026-11-20T13:00:00.000Z', texto: 'c' }),
        mensagem(4, { criadaEm: '2026-11-20T13:01:00.000Z', texto: 'd' }),
      ],
      opcoes(),
    );
    expect(emTexto(itens)).toEqual([
      'dia 12/11',
      'Paulo Nunes a',
      'dia Ontem',
      'Paulo Nunes b',
      'dia Hoje',
      'Paulo Nunes c',
      'seguida d',
    ]);
  });

  it('junta as mensagens seguidas da mesma pessoa até 5 min, sem a respondida e sem evento no meio', () => {
    const itens = itensDaConversa(
      [
        mensagem(1, { texto: 'a' }),
        mensagem(5, { texto: 'b' }),
        mensagem(11, { texto: 'c' }),
        mensagem(12, { texto: 'd', autor: TATIANA }),
        mensagem(13, { texto: 'e' }),
        mensagem(14, {
          texto: 'f',
          respondida: { id: id(12), autor: 'Tatiana Ramos', comeco: 'd' },
        }),
        mensagem(15, { especie: 'evento', texto: null, evento: 'virou-chamado', autor: ANA }),
        mensagem(16, { texto: 'g' }),
      ],
      opcoes(),
    );
    expect(emTexto(itens)).toEqual([
      'dia Hoje',
      'Paulo Nunes a',
      'seguida b',
      'Paulo Nunes c',
      'Tatiana Ramos d',
      'Paulo Nunes e',
      'Paulo Nunes f',
      'evento virou-chamado',
      'Paulo Nunes g',
    ]);
  });

  it('põe "Mensagens novas" antes da primeira mensagem dos outros depois da última lida', () => {
    const itens = itensDaConversa(
      [
        mensagem(1, { texto: 'a' }),
        mensagem(2, { texto: 'b', autor: ANA }),
        mensagem(3, { especie: 'evento', texto: null, evento: 'virou-chamado', autor: TATIANA }),
        mensagem(4, { texto: 'c' }),
        mensagem(5, { texto: 'd' }),
      ],
      opcoes({ lidaAoAbrir: id(1) }),
    );
    expect(emTexto(itens)).toEqual([
      'dia Hoje',
      'Paulo Nunes a',
      'Ana Souza b',
      'evento virou-chamado',
      'novas',
      'Paulo Nunes c',
      'seguida d',
    ]);
  });

  it('sem a última lida, ou com tudo lido, não põe "Mensagens novas"', () => {
    const mensagens = [mensagem(1), mensagem(2)];
    expect(emTexto(itensDaConversa(mensagens, opcoes()))).not.toContain('novas');
    expect(emTexto(itensDaConversa(mensagens, opcoes({ lidaAoAbrir: id(2) })))).not.toContain(
      'novas',
    );
  });

  it('a primeira não lida de um dia novo fica depois do dia', () => {
    const itens = itensDaConversa(
      [
        mensagem(1, { criadaEm: '2026-11-19T13:00:00.000Z', texto: 'a' }),
        mensagem(2, { criadaEm: '2026-11-20T13:00:00.000Z', texto: 'b' }),
      ],
      opcoes({ lidaAoAbrir: id(1) }),
    );
    expect(emTexto(itens)).toEqual([
      'dia Ontem',
      'Paulo Nunes a',
      'dia Hoje',
      'novas',
      'Paulo Nunes b',
    ]);
  });
});

describe('novasDesde', () => {
  it('conta as mensagens dos outros depois da última vista, sem os eventos e sem as da conta', () => {
    const mensagens = [
      mensagem(1),
      mensagem(2),
      mensagem(3, { autor: ANA }),
      mensagem(4, { especie: 'evento', texto: null, evento: 'virou-chamado' }),
      mensagem(5, { autor: TATIANA }),
    ];
    expect(novasDesde(mensagens, ANA.conta, id(1))).toBe(2);
    expect(novasDesde(mensagens, ANA.conta, id(5))).toBe(0);
    expect(novasDesde(mensagens, ANA.conta, null)).toBe(0);
  });
});
