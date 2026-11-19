// O chat da conta (spec chat, "Quem usa o chat", "Conversas", "Conversa direta", "Não lidas",
// "Silenciar uma conversa" e "Permissões, auditoria e eventos do chat"; spec modulo-chat, "Trilha do
// chat" e "Lista do Chat"; change chat-com-chamados, tarefa 3.1): o resumo, as conversas da conta,
// com as seções e os contadores, a escolha da pessoa da direta e a foto de quem usa o chat. A
// permissão vem antes: quem não usa o chat, o módulo desligado, a conversa de outros e quem saiu do
// grupo. As ordens e os contadores são do domínio (`chat/listas.ts`); aqui fica um caso de cada
// ligação.
import { atribuicoes, contas, naOrganizacao, perfis, pessoas } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { imagemDeTeste } from '../../test/imagens.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarGrupo,
  criarLocal,
  criarPerfil,
  criarRelogio,
  incluirNoGrupo,
} from '../../test/integracao.ts';

interface ConversaNaLista {
  id: string;
  tipo: 'direta' | 'equipe' | 'canal';
  nome: string;
  naoLidas: number;
  silenciada: boolean;
  ultimaMensagemEm: string | null;
  outra: { conta: string; nome: string; daTi: boolean; foto: { id: string } | null } | null;
}

interface ListaDoChat {
  equipesECanais: ConversaNaLista[];
  recentes: ConversaNaLista[];
}

interface PessoaDoChat {
  conta: string;
  nome: string;
  daTi: boolean;
  foto: { id: string } | null;
  conversa: string | null;
}

let api: ApiDeTeste;

/** Cada teste monta a organização dele, num endereço próprio. */
let c: ChatDeTeste;
let enderecos = 0;

const lista = async (usuario: UsuarioDoChat): Promise<ListaDoChat> => {
  const r = await c.cliente.consultar('/chat/conversas', c.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as ListaDoChat;
};

const nomes = (conversas: ConversaNaLista[]) => conversas.map(({ nome }) => nome);

const resumo = async (usuario: UsuarioDoChat) => {
  const r = await c.cliente.consultar('/chat/resumo', c.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as { naoLidas: number; chamadosComRespostaNova: number | null };
};

const escolha = async (usuario: UsuarioDoChat, busca?: string): Promise<PessoaDoChat[]> => {
  const url =
    busca === undefined ? '/chat/pessoas' : `/chat/pessoas?busca=${encodeURIComponent(busca)}`;
  const r = await c.cliente.consultar(url, c.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { pessoas: PessoaDoChat[] }).pessoas;
};

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-conversas-${enderecos}.local`);
  await c.entrar();
});

describe('a permissão', () => {
  it('a conta sem chat.usar recebe 403 em todas as rotas, e nada é lido', async () => {
    for (const url of ['/chat/resumo', '/chat/conversas', '/chat/pessoas']) {
      const r = await c.cliente.consultar(url, c.como('rita'));
      expect(r.statusCode, url).toBe(403);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:sem-permissao',
        permissao: 'chat.usar',
      });
    }
  });

  it('com o módulo Chat desligado, as rotas respondem como o módulo desligado', async () => {
    await desligarModulos(api, c.org, ['chat']);
    for (const url of ['/chat/resumo', '/chat/conversas', '/chat/pessoas']) {
      const r = await c.cliente.consultar(url, c.como('fernanda'));
      expect(r.statusCode, url).toBe(403);
      expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:modulo-desligado' });
    }
  });

  it('a conversa direta de outros e a equipe de outro grupo não aparecem nem contam', async () => {
    const direta = await c.criarDireta('fernanda', 'ana');
    await c.mensagem(direta, 'ana', 'Bom dia, Fernanda!');
    const equipeTi = await c.criarEquipe('Equipe TI', c.grupos.ti);
    await c.mensagem(equipeTi, 'ana', 'Reunião às 14h.');

    expect(await lista('paulo')).toEqual({ equipesECanais: [], recentes: [] });
    expect((await resumo('paulo')).naoLidas).toBe(0);
    expect(nomes((await lista('fernanda')).recentes)).toEqual(['Ana Souza (TI)']);
    expect(nomes((await lista('ana')).equipesECanais)).toEqual(['Equipe TI']);
  });

  it('quem saiu do grupo deixa a equipe, e o contador dela sai do total', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    await c.mensagem(equipe, 'paulo', 'A impressora está manchando.');
    expect(nomes((await lista('tatiana')).equipesECanais)).toEqual(['Equipe Financeiro']);
    expect((await resumo('tatiana')).naoLidas).toBe(1);

    await c.sairDoGrupo('tatiana', c.grupos.financeiro);
    expect((await lista('tatiana')).equipesECanais).toEqual([]);
    expect((await resumo('tatiana')).naoLidas).toBe(0);
  });

  it('quem perdeu o chat.usar ao sair do grupo do perfil recebe 403 e sai da escolha', async () => {
    expect((await escolha('fernanda', 'tatiana')).map(({ nome }) => nome)).toEqual([
      'Tatiana Ramos',
    ]);
    await c.sairDoGrupo('tatiana', c.grupos.todos);
    const r = await c.cliente.consultar('/chat/conversas', c.como('tatiana'));
    expect(r.statusCode).toBe(403);
    expect(await escolha('fernanda', 'tatiana')).toEqual([]);
  });
});

describe('a lista das conversas', () => {
  it('EQUIPES E CANAIS pelo nome, RECENTES pela mensagem mais nova, sem as arquivadas', async () => {
    const avisos = await c.criarCanal('Avisos da TI', { escreve: c.grupos.ti, avisar: true });
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    await c.criarCanal('Antigo', { arquivada: true });
    await c.criarEquipe('Arquivada', c.grupos.financeiro, { arquivada: true });
    const comAna = await c.criarDireta('fernanda', 'ana');
    await c.mensagem(comAna, 'ana', 'Oi, Fernanda.');
    api.relogio.avancar(60_000);
    const comPaulo = await c.criarDireta('paulo', 'fernanda');
    await c.mensagem(comPaulo, 'paulo', 'Você já falou com a TI?');

    const daFernanda = await lista('fernanda');
    expect(daFernanda.equipesECanais.map(({ id, tipo, nome }) => ({ id, tipo, nome }))).toEqual([
      { id: avisos, tipo: 'canal', nome: 'Avisos da TI' },
      { id: equipe, tipo: 'equipe', nome: 'Equipe Financeiro' },
    ]);
    expect(daFernanda.recentes.map(({ id, nome }) => ({ id, nome }))).toEqual([
      { id: comPaulo, nome: 'Paulo Nunes' },
      { id: comAna, nome: 'Ana Souza (TI)' },
    ]);
    expect(daFernanda.recentes[1]?.outra).toEqual({
      conta: c.conta('ana'),
      nome: 'Ana Souza',
      daTi: true,
      foto: null,
    });
    expect(daFernanda.recentes[0]?.ultimaMensagemEm).toBe('2026-11-17T12:01:00.000Z');
    // A Ana vê o canal, mas não a equipe do Financeiro, de que não é.
    expect(nomes((await lista('ana')).equipesECanais)).toEqual(['Avisos da TI']);
  });

  it('as não lidas são as dos outros depois da última lida, até 100, e o silenciar fica marcado', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const primeira = await c.mensagem(equipe, 'paulo', 'Primeira.');
    await c.mensagem(equipe, 'fernanda', 'A minha não conta.');
    await c.mensagem(equipe, 'tatiana', 'Segunda.');
    await c.mensagem(equipe, 'paulo', 'Terceira.');
    expect((await lista('fernanda')).equipesECanais[0]).toMatchObject({
      naoLidas: 3,
      silenciada: false,
    });

    await c.lerAte('fernanda', equipe, primeira);
    expect((await lista('fernanda')).equipesECanais[0]?.naoLidas).toBe(2);

    await c.silenciar('fernanda', equipe);
    expect((await lista('fernanda')).equipesECanais[0]).toMatchObject({
      naoLidas: 2,
      silenciada: true,
    });

    // A conversa nunca lida conta a história inteira, até 100.
    const canal = await c.criarCanal('Geral');
    for (let i = 0; i < 101; i += 1) await c.mensagem(canal, 'ana', `Aviso ${i}.`);
    expect((await lista('paulo')).equipesECanais.find(({ id }) => id === canal)?.naoLidas).toBe(
      100,
    );
  });

  it('a foto de quem usa o chat; a direta com quem não usa mais fica na lista, sem a foto', async () => {
    const direta = await c.criarDireta('fernanda', 'paulo');
    await c.mensagem(direta, 'paulo', 'Até amanhã.');
    const trocada = await c.cliente.enviarBytes(
      'PUT',
      '/conta/foto',
      c.como('paulo'),
      await imagemDeTeste(120, 80).png().toBuffer(),
    );
    expect(trocada.statusCode, trocada.body).toBe(200);
    const foto = (trocada.json() as { foto: { id: string } }).foto;

    const [comPaulo] = (await lista('fernanda')).recentes;
    expect(comPaulo?.outra?.foto).toEqual(foto);
    expect((await escolha('fernanda', 'paulo'))[0]?.foto).toEqual(foto);
    const endereco = `/chat/contas/${c.conta('paulo')}/foto/${foto.id}/64`;
    const entregue = await c.cliente.consultar(endereco, c.como('fernanda'));
    expect(entregue.statusCode).toBe(200);
    expect(entregue.headers['content-type']).toBe('image/webp');
    expect((await c.cliente.consultar(endereco, c.como('rita'))).statusCode).toBe(403);

    await c.sairDoGrupo('paulo', c.grupos.todos);
    const [depois] = (await lista('fernanda')).recentes;
    expect(depois).toMatchObject({ id: direta, nome: 'Paulo Nunes', naoLidas: 1 });
    expect(depois?.outra?.foto).toBeNull();
    expect((await c.cliente.consultar(endereco, c.como('fernanda'))).statusCode).toBe(404);
  });
});

describe('o resumo', () => {
  it('o total sem as silenciadas e os chamados abertos com resposta nova', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const canal = await c.criarCanal('Avisos da TI');
    await c.mensagem(equipe, 'paulo', 'Uma.');
    await c.mensagem(equipe, 'paulo', 'Duas.');
    await c.mensagem(canal, 'ana', 'Três.');
    await c.silenciar('fernanda', canal);
    expect(await resumo('fernanda')).toEqual({ naoLidas: 2, chamadosComRespostaNova: 0 });

    const comResposta = await c.abrirChamado('fernanda');
    await c.mensagemDaTi(comResposta, 'Já vi aqui.');
    await c.mensagemDaTi(comResposta, 'Pode reiniciar?');
    const semResposta = await c.abrirChamado('fernanda', 'O mouse parou.');
    expect(semResposta).toBe(comResposta + 1);
    expect((await resumo('fernanda')).chamadosComRespostaNova).toBe(1);
    // A conta da TI não tem resposta nova do que ela mesma manda, e o chamado de outra pessoa não
    // conta para a Fernanda.
    expect((await resumo('ana')).chamadosComRespostaNova).toBe(0);
    expect((await resumo('paulo')).chamadosComRespostaNova).toBe(0);
  });

  it('sem os chamados com o módulo Chamados desligado', async () => {
    await desligarModulos(api, c.org, ['chamados']);
    expect((await resumo('fernanda')).chamadosComRespostaNova).toBeNull();
  });
});

describe('a escolha da pessoa da direta', () => {
  it('só quem usa o chat, sem a própria conta, pelas palavras do nome, até 20, pela ordem do nome', async () => {
    expect((await escolha('fernanda')).map(({ nome }) => nome)).toEqual([
      'Ana Souza',
      'Lívia Prates',
      'Paulo Nunes',
      'Tatiana Ramos',
    ]);
    const [ana] = await escolha('paulo', 'SOUZA');
    expect(ana).toEqual({
      conta: c.conta('ana'),
      nome: 'Ana Souza',
      daTi: true,
      foto: null,
      conversa: null,
    });
    expect((await escolha('paulo', 'livia pra')).map(({ nome }) => nome)).toEqual(['Lívia Prates']);

    const direta = await c.criarDireta('paulo', 'tatiana');
    await c.mensagem(direta, 'paulo', 'Oi.');
    expect((await escolha('paulo', 'tatiana'))[0]?.conversa).toBe(direta);
    expect((await escolha('fernanda', 'tatiana'))[0]?.conversa).toBeNull();

    for (let i = 0; i < 25; i += 1) {
      const conta = await criarConta(api, c.org, { usuario: `pessoa${i}`, nome: `Pessoa ${i}` });
      await incluirNoGrupo(api, c.org, { grupoId: c.grupos.todos, contaId: conta.id });
    }
    expect(await escolha('fernanda', 'pessoa')).toHaveLength(20);
  });

  it('fora a conta inativa, o perfil inativo, o grupo inativo e o chat.usar só num local', async () => {
    const doLocal = await criarConta(api, c.org, { usuario: 'local', nome: 'Pessoa do Local' });
    const jundiai = await criarLocal(api, c.org, { nome: 'Jundiaí', tipo: 'unidade' });
    await atribuir(api, c.org, {
      perfilId: c.perfis.colaborador,
      contaId: doLocal.id,
      localId: jundiai,
    });

    const doGrupoInativo = await criarConta(api, c.org, {
      usuario: 'inativo',
      nome: 'Pessoa do Grupo Inativo',
    });
    const inativo = await criarGrupo(api, c.org, { nome: 'Inativo', situacao: 'inativo' });
    await atribuir(api, c.org, { perfilId: c.perfis.colaborador, grupoId: inativo });
    await incluirNoGrupo(api, c.org, { grupoId: inativo, contaId: doGrupoInativo.id });

    const doPerfilInativo = await criarConta(api, c.org, {
      usuario: 'perfil',
      nome: 'Pessoa do Perfil Inativo',
    });
    const perfilInativo = await criarPerfil(api, c.org, {
      nome: 'Antigo',
      permissoes: ['chat.usar'],
      situacao: 'inativo',
    });
    await atribuir(api, c.org, { perfilId: perfilInativo, contaId: doPerfilInativo.id });

    const daAtribuicaoEncerrada = await criarConta(api, c.org, {
      usuario: 'encerrada',
      nome: 'Pessoa da Atribuição Encerrada',
    });
    const encerrada = await atribuir(api, c.org, {
      perfilId: c.perfis.colaborador,
      contaId: daAtribuicaoEncerrada.id,
    });
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .update(atribuicoes)
        .set({ encerradaEm: api.relogio.agora() })
        .where(eq(atribuicoes.id, encerrada)),
    );

    expect(await escolha('fernanda', 'pessoa')).toEqual([]);

    // Com o perfil reativado, a conta volta; inativa, sai de novo.
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx.update(perfis).set({ situacao: 'ativo' }).where(eq(perfis.id, perfilInativo)),
    );
    expect((await escolha('fernanda', 'pessoa')).map(({ nome }) => nome)).toEqual([
      'Pessoa do Perfil Inativo',
    ]);
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, doPerfilInativo.id)),
    );
    expect(await escolha('fernanda', 'pessoa')).toEqual([]);

    // A conta ativa da pessoa inativa também fica fora.
    await naOrganizacao(api.banco, c.org, async (tx) => {
      await tx.update(contas).set({ situacao: 'ativa' }).where(eq(contas.id, doPerfilInativo.id));
      const [conta] = await tx
        .select({ pessoaId: contas.pessoaId })
        .from(contas)
        .where(eq(contas.id, doPerfilInativo.id));
      await tx
        .update(pessoas)
        .set({ situacao: 'inativa' })
        .where(eq(pessoas.id, conta?.pessoaId ?? ''));
    });
    expect(await escolha('fernanda', 'pessoa')).toEqual([]);
  });
});
