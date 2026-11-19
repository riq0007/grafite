// As mensagens do chat (spec chat, "Conversas", "Conversa direta", "Mensagem", "Reações", "Link da
// mensagem" e "Chamado citado numa mensagem"; change chat-com-chamados, design, decisões 1, 3 e 11;
// tarefa 3.2): a conversa aberta, as páginas de 50, a mensagem, com a direta que nasce na primeira,
// a ordem pela trava da conversa e o `chat.mudou`. A permissão vem antes: quem não escreve no canal,
// a direta com quem não usa mais o chat, a conversa de outros e a citação do chamado que a conta não
// vê. As frases e o que a mensagem aceita são do domínio; aqui fica um caso de cada ligação.
import { conversas, eventos, mensagensDoChat, naOrganizacao } from '@grafite/db';
import { asc, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio, esperarNaTrava } from '../../test/integracao.ts';

interface MensagemLida {
  id: string;
  especie: 'mensagem' | 'evento';
  autor: { conta: string; nome: string; daTi: boolean };
  texto: string | null;
  criadaEm: string;
  respondida: { id: string; autor: string; comeco: string } | null;
  reacoes: { texto: string; contas: { conta: string; nome: string }[]; minha: boolean }[];
  anexos: unknown[];
  citacoes: {
    numero: number;
    inicio: number;
    fim: number;
    situacao: string;
    atende: string | null;
  }[];
}

interface Pagina {
  itens: MensagemLida[];
  lidaAte: string | null;
  anteriores: boolean;
  seguintes: boolean;
}

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

const pagina = async (usuario: UsuarioDoChat, conversa: string, busca = ''): Promise<Pagina> => {
  const r = await c.cliente.consultar(
    `/chat/conversas/${conversa}/mensagens${busca}`,
    c.como(usuario),
  );
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as Pagina;
};

const textos = (lida: Pagina) => lida.itens.map(({ texto }) => texto);

const escrever = (usuario: UsuarioDoChat, conversa: string, corpo: object) =>
  c.cliente.enviar('POST', `/chat/conversas/${conversa}/mensagens`, c.como(usuario), corpo);

const escreverA = (usuario: UsuarioDoChat, outra: UsuarioDoChat, corpo: object) =>
  c.cliente.enviar('POST', `/chat/diretas/${c.conta(outra)}/mensagens`, c.como(usuario), corpo);

const mensagensNoBanco = (conversa: string) =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .select({ id: mensagensDoChat.id, texto: mensagensDoChat.texto })
      .from(mensagensDoChat)
      .where(eq(mensagensDoChat.conversaId, conversa))
      .orderBy(asc(mensagensDoChat.id)),
  );

const diretasNoBanco = () =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx.select({ id: conversas.id }).from(conversas).where(eq(conversas.tipo, 'direta')),
  );

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-mensagens-${enderecos}.local`);
  await c.entrar();
});

describe('a permissão', () => {
  it('quem não escreve no canal recebe a frase, e nada é gravado', async () => {
    const avisos = await c.criarCanal('Avisos da TI', { escreve: c.grupos.ti });
    const recusada = await escrever('fernanda', avisos, { texto: 'Posso escrever aqui?' });
    expect(recusada.statusCode).toBe(409);
    expect(recusada.json()).toMatchObject({ detail: 'Só TI escreve neste canal.' });
    expect(await mensagensNoBanco(avisos)).toEqual([]);

    const aberta = await c.cliente.consultar(`/chat/conversas/${avisos}`, c.como('fernanda'));
    expect(aberta.json()).toMatchObject({
      escreve: false,
      recusa: 'Só TI escreve neste canal.',
      escreveGrupo: 'TI',
    });

    const daAna = await escrever('ana', avisos, { texto: 'O sistema volta às 14h.' });
    expect(daAna.statusCode, daAna.body).toBe(201);
    expect(textos(await pagina('fernanda', avisos))).toEqual(['O sistema volta às 14h.']);
  });

  it('a direta com quem não usa mais o chat fica para ler, e a mensagem é recusada', async () => {
    const direta = await c.criarDireta('fernanda', 'paulo');
    await c.mensagem(direta, 'paulo', 'Até amanhã.');
    await c.sairDoGrupo('paulo', c.grupos.todos);

    for (const recusada of [
      await escrever('fernanda', direta, { texto: 'Você volta quando?' }),
      await escreverA('fernanda', 'paulo', { texto: 'Você volta quando?' }),
    ]) {
      expect(recusada.statusCode).toBe(409);
      expect(recusada.json()).toMatchObject({ detail: 'Paulo Nunes não usa mais o chat.' });
    }
    expect(textos(await pagina('fernanda', direta))).toEqual(['Até amanhã.']);
    expect(await diretasNoBanco()).toHaveLength(1);
  });

  it('a conversa de outros responde como inexistente', async () => {
    const direta = await c.criarDireta('fernanda', 'ana');
    const equipeTi = await c.criarEquipe('Equipe TI', c.grupos.ti);
    for (const [usuario, conversa] of [
      ['paulo', direta],
      ['fernanda', equipeTi],
    ] as const) {
      for (const r of [
        await c.cliente.consultar(`/chat/conversas/${conversa}`, c.como(usuario)),
        await c.cliente.consultar(`/chat/conversas/${conversa}/mensagens`, c.como(usuario)),
        await escrever(usuario, conversa, { texto: 'Oi.' }),
      ]) {
        expect(r.statusCode).toBe(404);
        expect(r.json()).toMatchObject({ detail: 'Conversa não encontrada.' });
      }
    }
    // O link da mensagem diz que a mensagem não foi encontrada.
    const doLink = await c.cliente.consultar(
      `/chat/conversas/${direta}/mensagens?em=${await c.mensagem(direta, 'ana', 'Oi.')}`,
      c.como('paulo'),
    );
    expect(doLink.statusCode).toBe(404);
    expect(doLink.json()).toMatchObject({ detail: 'A mensagem não foi encontrada.' });
    const naoExiste = await c.cliente.consultar(
      '/chat/conversas/0195f0a0-0000-7000-8000-000000000000',
      c.como('fernanda'),
    );
    expect(naoExiste.statusCode).toBe(404);
  });

  it('a citação do chamado que a conta não vê fica como o texto', async () => {
    const numero = await c.abrirChamado('fernanda');
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const daFernanda = await escrever('fernanda', equipe, { texto: `Abri o #${numero} agora.` });
    expect(daFernanda.statusCode, daFernanda.body).toBe(201);
    // A Fernanda participa do chamado, e a Ana o vê com `chamados.ver`.
    const citacao = {
      numero,
      inicio: 7,
      fim: 12,
      situacao: 'Em andamento',
      atende: 'Ana Souza',
    };
    expect((await pagina('fernanda', equipe)).itens[0]?.citacoes).toEqual([citacao]);
    expect(daFernanda.json()).toMatchObject({ citacoes: [citacao] });
    // O Paulo e a Tatiana, não, e o número que não é de um chamado fica como o texto.
    expect((await pagina('paulo', equipe)).itens[0]?.citacoes).toEqual([]);
    const direta = await c.criarDireta('paulo', 'tatiana');
    await escrever('paulo', direta, { texto: `Vi o #${numero} e o #9999.` });
    expect((await pagina('tatiana', direta)).itens[0]?.citacoes).toEqual([]);

    // Aberto a partir da equipe, quem participa dela vê o resumo, também em outra conversa.
    const [origem] = await mensagensNoBanco(equipe);
    await c.virarChamadoDa(numero, equipe, origem?.id ?? '', 'fernanda');
    expect((await pagina('paulo', equipe)).itens[0]?.citacoes).toEqual([citacao]);
    expect((await pagina('tatiana', direta)).itens[0]?.citacoes).toEqual([
      { ...citacao, inicio: 5, fim: 10 },
    ]);

    // Com o módulo Chamados desligado, nenhuma citação vira o chip.
    await desligarModulos(api, c.org, ['chamados']);
    expect((await pagina('fernanda', equipe)).itens[0]?.citacoes).toEqual([]);
  });

  it('a arquivada abre para ler e recusa a mensagem', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    await c.mensagem(equipe, 'paulo', 'Antes de arquivar.');
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .update(conversas)
        .set({ arquivadaEm: api.relogio.agora() })
        .where(eq(conversas.id, equipe)),
    );
    const aberta = await c.cliente.consultar(`/chat/conversas/${equipe}`, c.como('fernanda'));
    expect(aberta.json()).toMatchObject({
      arquivada: true,
      escreve: false,
      recusa: 'Esta equipe foi arquivada.',
    });
    expect(textos(await pagina('fernanda', equipe))).toEqual(['Antes de arquivar.']);
    const recusada = await escrever('fernanda', equipe, { texto: 'Ainda dá?' });
    expect(recusada.statusCode).toBe(409);
    expect(recusada.json()).toMatchObject({ detail: 'A equipe Equipe Financeiro está arquivada.' });
  });

  it('a respondida de outra conversa é recusada', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const canal = await c.criarCanal('Geral');
    const doCanal = await c.mensagem(canal, 'ana', 'Bom dia.');
    const recusada = await escrever('fernanda', equipe, { texto: 'Bom dia!', respondeA: doCanal });
    expect(recusada.statusCode).toBe(400);
    expect(recusada.json()).toMatchObject({
      campos: { respondeA: 'A mensagem respondida não está nesta conversa.' },
    });
    expect(await mensagensNoBanco(equipe)).toEqual([]);
  });
});

describe('a conversa aberta', () => {
  it('o cabeçalho da equipe, do canal e da direta', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const primeira = await c.mensagem(equipe, 'paulo', 'Uma.');
    await c.lerAte('fernanda', equipe, primeira);
    await c.silenciar('fernanda', equipe);
    const daEquipe = await c.cliente.consultar(`/chat/conversas/${equipe}`, c.como('fernanda'));
    expect(daEquipe.json()).toEqual({
      id: equipe,
      tipo: 'equipe',
      nome: 'Equipe Financeiro',
      outra: null,
      pessoas: 3,
      escreveGrupo: null,
      arquivada: false,
      silenciada: true,
      lidaAte: primeira,
      escreve: true,
      recusa: null,
    });

    const direta = await c.criarDireta('fernanda', 'ana');
    const daDireta = await c.cliente.consultar(`/chat/conversas/${direta}`, c.como('fernanda'));
    expect(daDireta.json()).toMatchObject({
      tipo: 'direta',
      nome: 'Ana Souza (TI)',
      outra: { conta: c.conta('ana'), nome: 'Ana Souza', daTi: true, foto: null },
      pessoas: null,
      lidaAte: null,
      escreve: true,
    });
  });
});

describe('as mensagens', () => {
  it('a direta nasce com a primeira mensagem, e escolher a pessoa de novo usa a mesma', async () => {
    const vazia = await escreverA('fernanda', 'paulo', { texto: '   ' });
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json()).toMatchObject({ campos: { texto: 'Escreva a mensagem.' } });
    expect(await diretasNoBanco()).toEqual([]);

    const primeira = await escreverA('fernanda', 'paulo', { texto: 'Você já falou com a TI?' });
    expect(primeira.statusCode, primeira.body).toBe(201);
    const { conversa, mensagem } = primeira.json() as { conversa: string; mensagem: MensagemLida };
    expect(mensagem).toMatchObject({
      texto: 'Você já falou com a TI?',
      autor: { conta: c.conta('fernanda'), nome: 'Fernanda Rocha', daTi: false },
    });
    const resposta = await escreverA('paulo', 'fernanda', { texto: 'Ainda não.' });
    expect((resposta.json() as { conversa: string }).conversa).toBe(conversa);
    expect(await diretasNoBanco()).toEqual([{ id: conversa }]);
    expect(textos(await pagina('paulo', conversa))).toEqual([
      'Você já falou com a TI?',
      'Ainda não.',
    ]);

    const [linha] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select().from(conversas).where(eq(conversas.id, conversa)),
    );
    expect([linha?.contaA, linha?.contaB]).toEqual(
      [c.conta('fernanda'), c.conta('paulo')].map((id) => id.toLowerCase()).sort(),
    );

    const propria = await escreverA('fernanda', 'fernanda', { texto: 'Oi.' });
    expect(propria.statusCode).toBe(404);
  });

  it('as duas primeiras mensagens ao mesmo tempo ficam numa direta só', async () => {
    const [uma, outra] = await Promise.all([
      escreverA('fernanda', 'tatiana', { texto: 'Oi, Tatiana.' }),
      escreverA('tatiana', 'fernanda', { texto: 'Oi, Fernanda.' }),
    ]);
    expect(uma?.statusCode, uma?.body).toBe(201);
    expect(outra?.statusCode, outra?.body).toBe(201);
    expect(uma?.json().conversa).toBe(outra?.json().conversa);
    expect(await diretasNoBanco()).toHaveLength(1);
  });

  it('a mensagem que espera a trava da conversa fica depois da que a segurava', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    let preso: () => void = () => {};
    const travado = new Promise<void>((resolve) => {
      preso = resolve;
    });
    let soltar: () => void = () => {};
    const daTatiana = naOrganizacao(api.banco, c.org, async (tx) => {
      await tx
        .update(conversas)
        .set({ ultimaMensagemEm: api.relogio.agora() })
        .where(eq(conversas.id, equipe));
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
      await tx.insert(mensagensDoChat).values({
        orgId: c.org,
        conversaId: equipe,
        especie: 'mensagem',
        autorConta: c.conta('tatiana'),
        texto: 'Segurei a conversa.',
      });
    });
    await travado;
    const doPaulo = escrever('paulo', equipe, { texto: 'Esperei a trava.' });
    await esperarNaTrava(api, 1);
    soltar();
    await daTatiana;
    expect((await doPaulo).statusCode).toBe(201);
    expect((await mensagensNoBanco(equipe)).map(({ texto }) => texto)).toEqual([
      'Segurei a conversa.',
      'Esperei a trava.',
    ]);
  });

  it('a mensagem grava a última mensagem da conversa e manda o chat.mudou a quem participa', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    api.relogio.avancar(60_000);
    const r = await escrever('paulo', equipe, { texto: 'A impressora está manchando.' });
    expect(r.statusCode, r.body).toBe(201);
    const [linha] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select().from(conversas).where(eq(conversas.id, equipe)),
    );
    expect(linha?.ultimaMensagemEm?.toISOString()).toBe('2026-11-17T12:01:00.000Z');

    const daDireta = await escreverA('paulo', 'fernanda', { texto: 'Viu a equipe?' });
    const direta = (daDireta.json() as { conversa: string }).conversa;
    const gravados = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select().from(eventos).where(eq(eventos.tipo, 'chat.mudou')).orderBy(asc(eventos.id)),
    );
    expect(
      gravados.map(({ alvoTipo, alvoId, permissao, grupos, contas }) => ({
        alvoTipo,
        alvoId,
        permissao,
        grupos,
        contas: contas ? [...contas].sort() : null,
      })),
    ).toEqual([
      {
        alvoTipo: 'conversa',
        alvoId: equipe,
        permissao: 'chat.usar',
        grupos: [c.grupos.financeiro],
        contas: null,
      },
      {
        alvoTipo: 'conversa',
        alvoId: direta,
        permissao: null,
        grupos: null,
        contas: [c.conta('fernanda'), c.conta('paulo')].sort(),
      },
    ]);
  });

  it('a leitura traz o autor, a respondida e as reações, na ordem da primeira de cada texto', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const doPaulo = await c.mensagem(
      equipe,
      'paulo',
      'Pessoal, a impressora do Financeiro está manchando todas as folhas.',
    );
    await c.reagir('tatiana', doPaulo, 'Também manchou');
    api.relogio.avancar(1_000);
    await c.reagir('fernanda', doPaulo, '+1');
    api.relogio.avancar(1_000);
    await c.reagir('fernanda', doPaulo, 'Também manchou');
    const resposta = await escrever('tatiana', equipe, {
      texto: 'Aqui também manchou',
      respondeA: doPaulo,
    });
    expect(resposta.statusCode, resposta.body).toBe(201);

    const [primeira, segunda] = (await pagina('fernanda', equipe)).itens;
    expect(primeira?.reacoes).toEqual([
      {
        texto: 'Também manchou',
        contas: [
          { conta: c.conta('tatiana'), nome: 'Tatiana Ramos' },
          { conta: c.conta('fernanda'), nome: 'Fernanda Rocha' },
        ],
        minha: true,
      },
      {
        texto: '+1',
        contas: [{ conta: c.conta('fernanda'), nome: 'Fernanda Rocha' }],
        minha: true,
      },
    ]);
    expect(segunda).toMatchObject({
      texto: 'Aqui também manchou',
      autor: { conta: c.conta('tatiana'), nome: 'Tatiana Ramos', daTi: false },
      respondida: {
        id: doPaulo,
        autor: 'Paulo Nunes',
        comeco: 'Pessoal, a impressora do Financeiro está manchando todas as folhas.',
      },
      reacoes: [],
      anexos: [],
    });
    expect((await pagina('paulo', equipe)).itens[0]?.reacoes[1]?.minha).toBe(false);
  });

  it('as páginas de 50: as mais novas, antes, depois e ao redor de uma mensagem', async () => {
    const canal = await c.criarCanal('Geral');
    const ids: string[] = [];
    for (let i = 1; i <= 120; i += 1) ids.push(await c.mensagem(canal, 'ana', `Aviso ${i}.`));
    const aviso = (de: number, ate: number) =>
      Array.from({ length: ate - de + 1 }, (_, i) => `Aviso ${de + i}.`);

    const novas = await pagina('fernanda', canal);
    expect(textos(novas)).toEqual(aviso(71, 120));
    expect(novas).toMatchObject({ anteriores: true, seguintes: false, lidaAte: null });

    const antes = await pagina('fernanda', canal, `?antes=${ids[70]}`);
    expect(textos(antes)).toEqual(aviso(21, 70));
    expect(antes).toMatchObject({ anteriores: true, seguintes: true });
    const primeiras = await pagina('fernanda', canal, `?antes=${ids[20]}`);
    expect(textos(primeiras)).toEqual(aviso(1, 20));
    expect(primeiras.anteriores).toBe(false);

    const depois = await pagina('fernanda', canal, `?depois=${ids[9]}`);
    expect(textos(depois)).toEqual(aviso(11, 60));
    expect(depois).toMatchObject({ anteriores: true, seguintes: true });

    const emVolta = await pagina('fernanda', canal, `?em=${ids[59]}`);
    expect(textos(emVolta)).toEqual(aviso(35, 84));
    expect(emVolta).toMatchObject({ anteriores: true, seguintes: true });

    const deOutra = await c.cliente.consultar(
      `/chat/conversas/${canal}/mensagens?em=0195f0a0-0000-7000-8000-000000000000`,
      c.como('fernanda'),
    );
    expect(deOutra.statusCode).toBe(404);
    expect(deOutra.json()).toMatchObject({ detail: 'A mensagem não foi encontrada.' });
  });
});
