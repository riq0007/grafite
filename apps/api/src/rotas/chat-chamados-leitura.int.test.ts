// A leitura de quem participa do chamado (spec chamados, "Leitura do chamado pela pessoa", "Resposta
// nova", "Resumo dos tempos" e "Fechamento do chamado"; spec chat, "Chamado citado numa mensagem";
// spec modulo-chat, "Lista do Chat" e "Vista Chamados"; change chat-com-chamados, design, decisões 5,
// 9 e 15; tarefa 3.8): o chamado de outra pessoa como inexistente, a nota e o anexo dela de fora, a
// conversa nas palavras do colaborador, com as etapas, a resposta nova e o "Reabrir até", a lista na
// ordem do domínio, com o fechado vencido, e o resumo do chip.
import { chamados, mensagensDosChamados, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';

const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);
const MINUTO = 60_000;

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

interface ItemLido {
  especie: string;
  id: string;
  em: string;
  texto?: string;
  evento?: string;
  frase?: string;
  autor?: { nome: string };
  anexos?: { id: string }[];
  resumo?: unknown;
  opcoes?: string[] | null;
  escolhida?: unknown;
}

interface ChamadoLido {
  numero: number;
  situacao: string;
  fechado: boolean;
  situacaoEmTexto: string;
  atende: { nome: string } | null;
  etapas: { situacao: string; agora: boolean; estado: string; em: string | null }[];
  previsao: string | null;
  reabrirAte: string | null;
  conversa: ItemLido[];
  respostaNova: { quantas: number; desde: string | null };
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-chamados-leitura-${enderecos}.local`);
  await c.entrar();
});

const daTi = (acao: string, numero: number, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/${acao}`, c.como('ana'), corpo);

async function anexoDaAna(nome: string) {
  const r = await c.cliente.enviarBytes(
    'POST',
    `/chamados/anexos?nome=${encodeURIComponent(nome)}`,
    c.como('ana'),
    PDF(nome),
  );
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { id: string }).id;
}

const ler = async (usuario: UsuarioDoChat, numero: number) => {
  const r = await c.cliente.consultar(`/chat/chamados/${numero}`, c.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as ChamadoLido;
};

const avancar = (minutos: number) => api.relogio.avancar(minutos * MINUTO);

describe('a leitura de quem participa', () => {
  it('o chamado de outra pessoa responde como inexistente, e a nota e o anexo dela não vão', async () => {
    const numero = await c.abrirChamado('fernanda');
    const daMensagem = await anexoDaAna('foto da cadeira.pdf');
    const daNota = await anexoDaAna('orçamento.pdf');
    for (const r of [
      await daTi('mensagem', numero, { texto: 'Qual é a sala?', anexos: [daMensagem] }),
      await daTi('nota', numero, { texto: 'Pedir a cadeira ao patrimônio.', anexos: [daNota] }),
    ]) {
      expect(r.statusCode, r.body).toBe(200);
    }

    // Paulo não participa; Ana atende, mas não é a pessoa nem abriu pelo chat; Rita não usa o chat.
    for (const usuario of ['paulo', 'ana'] as const) {
      for (const caminho of [
        `/chat/chamados/${numero}`,
        `/chat/chamados/${numero}/anexos/${daMensagem}`,
      ]) {
        const r = await c.cliente.consultar(caminho, c.como(usuario));
        expect(r.statusCode, `${usuario} ${caminho}`).toBe(404);
      }
    }
    expect(
      (await c.cliente.consultar(`/chat/chamados/${numero}`, c.como('paulo'))).json(),
    ).toMatchObject({ detail: 'Chamado não encontrado.' });
    expect((await c.cliente.consultar(`/chat/chamados/${numero}`, c.como('rita'))).statusCode).toBe(
      403,
    );
    const daLista = await c.cliente.consultar('/chat/chamados', c.como('paulo'));
    expect(daLista.statusCode, daLista.body).toBe(200);
    expect(JSON.stringify(daLista.json())).not.toContain(`"numero":${numero}`);

    const lido = await ler('fernanda', numero);
    expect(lido.conversa.map(({ especie, texto }) => ({ especie, texto }))).toEqual([
      { especie: 'evento', texto: undefined },
      { especie: 'mensagem', texto: 'Qual é a sala?' },
    ]);
    expect(lido.conversa[1]?.anexos?.map(({ id }) => id)).toEqual([daMensagem]);
    expect(JSON.stringify(lido)).not.toContain('patrimônio');
    const baixado = await c.cliente.consultar(
      `/chat/chamados/${numero}/anexos/${daMensagem}`,
      c.como('fernanda'),
    );
    expect(baixado.statusCode).toBe(200);
    const daNotaBaixado = await c.cliente.consultar(
      `/chat/chamados/${numero}/anexos/${daNota}`,
      c.como('fernanda'),
    );
    expect(daNotaBaixado.statusCode).toBe(404);
    expect(daNotaBaixado.json()).toMatchObject({ detail: 'Arquivo não encontrado.' });
  });

  it('as etapas, os eventos nas palavras do colaborador, a resposta nova e o "Reabrir até"', async () => {
    const abertoEm = api.relogio.agora().toISOString();
    const numero = await c.abrirChamado('fernanda');
    avancar(5);
    const perguntaEm = api.relogio.agora().toISOString();
    expect((await daTi('mensagem', numero, { texto: 'Qual é a sala?' })).statusCode).toBe(200);

    const aberto = await ler('fernanda', numero);
    expect(aberto).toMatchObject({
      numero,
      situacao: 'em-atendimento',
      fechado: false,
      situacaoEmTexto: 'Em andamento',
      atende: { nome: 'Ana Souza' },
      reabrirAte: null,
    });
    expect(aberto.previsao).toMatch(/^responde em ~/);
    expect(aberto.etapas).toEqual([
      { situacao: 'triagem', agora: false, estado: 'chegou', em: abertoEm },
      { situacao: 'em-atendimento', agora: true, estado: 'chegou', em: abertoEm },
      { situacao: 'aguardando', agora: false, estado: 'ainda-nao', em: null },
      { situacao: 'resolvido', agora: false, estado: 'ainda-nao', em: null },
    ]);
    expect(aberto.conversa.map(({ especie, frase, texto }) => frase ?? texto ?? especie)).toEqual([
      'Ana Souza abriu este chamado para você',
      'Qual é a sala?',
    ]);
    const pergunta = aberto.conversa[1]?.id ?? '';
    expect(aberto.respostaNova).toEqual({ quantas: 1, desde: pergunta });
    // Abrir a conversa não tira a resposta nova.
    expect((await ler('fernanda', numero)).respostaNova.quantas).toBe(1);

    avancar(14);
    const resolvidoEm = api.relogio.agora().toISOString();
    expect((await daTi('resolver', numero, { feito: 'Troquei a cadeira.' })).statusCode).toBe(200);
    const resolvido = await ler('fernanda', numero);
    expect(resolvido).toMatchObject({
      situacao: 'resolvido',
      fechado: false,
      situacaoEmTexto: 'Resolvido',
      previsao: null,
      reabrirAte: '2026-11-24',
      respostaNova: { quantas: 0, desde: null },
    });
    expect(resolvido.etapas.at(-1)).toEqual({
      situacao: 'resolvido',
      agora: true,
      estado: 'chegou',
      em: resolvidoEm,
    });
    const doResolvido = resolvido.conversa.at(-1);
    expect(doResolvido).toMatchObject({
      especie: 'evento',
      evento: 'resolveu',
      frase: 'Ana Souza resolveu o chamado',
      resumo: {
        abertoEm,
        primeiraResposta: { em: perguntaEm, tempo: '5 min' },
        resolvido: { em: resolvidoEm, tempo: '19 min' },
        atendeu: 'Ana Souza',
      },
    });
    expect(resolvido.conversa.at(-2)).toMatchObject({
      especie: 'mensagem',
      texto: 'Troquei a cadeira.',
    });
  });
});

describe('a pergunta e o assumir desfeito', () => {
  it('a escolha vai na pergunta, com quem escolheu e quando, e o assumir desfeito sai', async () => {
    const numero = await c.abrirChamado('fernanda');
    const linha = (valores: Partial<typeof mensagensDosChamados.$inferInsert>) =>
      naOrganizacao(api.banco, c.org, async (tx) => {
        const [chamado] = await tx
          .select({ id: chamados.id })
          .from(chamados)
          .where(eq(chamados.numero, numero));
        const [gravada] = await tx
          .insert(mensagensDosChamados)
          .values({
            orgId: c.org,
            chamadoId: chamado?.id ?? '',
            especie: 'evento',
            criadaEm: api.relogio.agora(),
            ...valores,
          })
          .returning({ id: mensagensDosChamados.id });
        return gravada?.id ?? '';
      });
    avancar(1);
    const pergunta = await linha({
      especie: 'mensagem',
      autorConta: c.conta('ana'),
      texto: 'Posso passar amanhã?',
      opcoes: ['Pode ser', 'Prefiro hoje'],
    });
    avancar(1);
    const escolhidaEm = api.relogio.agora().toISOString();
    await linha({
      autorConta: c.conta('fernanda'),
      evento: 'escolheu',
      dados: { mensagem: pergunta, opcao: 'Pode ser' },
    });
    // A Ana assume de novo e desfaz: a pessoa não lê nenhum dos dois.
    avancar(1);
    await linha({ autorConta: c.conta('ana'), evento: 'assumiu', dados: {} });
    await linha({ autorConta: c.conta('ana'), evento: 'desfez', dados: {} });

    const lido = await ler('fernanda', numero);
    expect(lido.conversa.map(({ evento, especie }) => evento ?? especie)).toEqual([
      'abertura',
      'mensagem',
    ]);
    expect(lido.conversa[1]).toMatchObject({
      opcoes: ['Pode ser', 'Prefiro hoje'],
      escolhida: { opcao: 'Pode ser', por: 'Fernanda Rocha', minha: true, em: escolhidaEm },
    });
    const daTatiana = await c.cliente.consultar(`/chat/chamados/${numero}`, c.como('tatiana'));
    expect(daTatiana.statusCode).toBe(404);
  });
});

describe('o resumo do chip', () => {
  it('a quem participa e a quem vê com chamados.ver, com as últimas; a quem é da conversa, sem elas', async () => {
    const numero = await c.abrirChamado('fernanda');
    const direta = await c.criarDireta('fernanda', 'paulo');
    const mensagem = await c.mensagem(direta, 'paulo', 'A cadeira da sala 3 quebrou.');
    await c.virarChamadoDa(numero, direta, mensagem, 'fernanda');
    avancar(1);
    expect((await daTi('mensagem', numero, { texto: 'Já vi aqui.' })).statusCode).toBe(200);
    avancar(1);
    expect((await daTi('nota', numero, { texto: 'Pedir ao patrimônio.' })).statusCode).toBe(200);
    await c.deixarAguardando(numero);

    const resumo = (usuario: UsuarioDoChat) =>
      c.cliente.consultar(`/chat/chamados/${numero}/resumo`, c.como(usuario));
    type Resumo = {
      numero: number;
      situacao: string;
      atende: string | null;
      detalhes: { ultimas: { especie: string; texto: string; autor: string }[] } | null;
    };

    // Paulo é da conversa de origem: vê o resumo sem as últimas mensagens, e a espera é a da TI.
    const doPaulo = await resumo('paulo');
    expect(doPaulo.statusCode, doPaulo.body).toBe(200);
    expect(doPaulo.json()).toMatchObject({
      numero,
      situacao: 'Aguardando o colaborador',
      atende: 'Ana Souza',
      detalhes: null,
    });

    const daFernanda = (await resumo('fernanda')).json() as Resumo;
    expect(daFernanda.situacao).toBe('Aguardando você');
    expect(daFernanda.detalhes?.ultimas).toEqual([
      expect.objectContaining({ especie: 'mensagem', texto: 'Já vi aqui.', autor: 'Ana Souza' }),
    ]);

    // Ana vê o chamado com chamados.ver, pelo chamados.atender: as duas últimas que ela vê, também a
    // nota.
    const daAna = (await resumo('ana')).json() as Resumo;
    expect(daAna.situacao).toBe('Aguardando o colaborador');
    expect(daAna.detalhes?.ultimas.map(({ texto }) => texto)).toEqual([
      'Já vi aqui.',
      'Pedir ao patrimônio.',
    ]);

    // Tatiana não participa do chamado nem da conversa, e não o vê.
    const daTatiana = await resumo('tatiana');
    expect(daTatiana.statusCode).toBe(404);
    expect(daTatiana.json()).toMatchObject({ detail: 'Chamado não encontrado.' });
  });
});

describe('a lista de quem participa', () => {
  it('os abertos e os resolvidos, na ordem do domínio, com o fechado vencido e a página', async () => {
    const resolverAgora = async (numero: number) => {
      avancar(1);
      expect((await daTi('resolver', numero, { feito: 'Feito.' })).statusCode).toBe(200);
    };
    const vencido = await c.abrirChamado('fernanda');
    await resolverAgora(vencido);
    const fechadoPelaTarefa = await c.abrirChamado('fernanda');
    await resolverAgora(fechadoPelaTarefa);
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .update(chamados)
        .set({ fechadoEm: new Date(api.relogio.agora().getTime() + MINUTO) })
        .where(eq(chamados.numero, fechadoPelaTarefa)),
    );

    // Dez dias depois: o primeiro resolvido venceu sem a tarefa o fechar.
    avancar(10 * 24 * 60);
    await c.entrar();
    const reabre = await c.abrirChamado('fernanda');
    await resolverAgora(reabre);
    avancar(1);
    const emAndamento = await c.abrirChamado('fernanda');
    avancar(1);
    const aguardando = await c.abrirChamado('fernanda');
    expect((await daTi('esperar', aguardando, { texto: 'Qual é a sala?' })).statusCode).toBe(200);
    avancar(1);
    // O da Tatiana, que a Fernanda abriu pelo chat; e o do Paulo, de que ela não participa.
    const daTatiana = await c.abrirChamado('tatiana');
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    await c.virarChamadoDa(daTatiana, equipe, await c.mensagem(equipe, 'tatiana'), 'fernanda');
    await c.abrirChamado('paulo');

    type Lista = {
      abertos: { numero: number; situacaoEmTexto: string }[];
      resolvidos: { numero: number; fechado: boolean; situacaoEmTexto: string }[];
      seguintes: boolean;
    };
    const r = await c.cliente.consultar('/chat/chamados', c.como('fernanda'));
    expect(r.statusCode, r.body).toBe(200);
    const lista = r.json() as Lista;
    expect(lista.abertos.map(({ numero, situacaoEmTexto }) => [numero, situacaoEmTexto])).toEqual([
      [aguardando, 'Aguardando você'],
      [daTatiana, 'Em andamento'],
      [emAndamento, 'Em andamento'],
    ]);
    expect(
      lista.resolvidos.map(({ numero, fechado, situacaoEmTexto }) => [
        numero,
        fechado,
        situacaoEmTexto,
      ]),
    ).toEqual([
      [reabre, false, 'Resolvido'],
      [fechadoPelaTarefa, true, 'Fechado'],
      [vencido, true, 'Fechado'],
    ]);
    expect(lista.seguintes).toBe(false);

    const seguinte = await c.cliente.consultar(
      `/chat/chamados?resolvidosAntes=${reabre}`,
      c.como('fernanda'),
    );
    expect(seguinte.statusCode, seguinte.body).toBe(200);
    expect(seguinte.json()).toMatchObject({
      abertos: [],
      resolvidos: [{ numero: fechadoPelaTarefa }, { numero: vencido }],
      seguintes: false,
    });
  });
});
