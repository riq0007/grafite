// O andamento e o lado de quem participa pela TI nas leituras do chat (spec chamados, "Quem atende
// pelo chat", "Leitura do chamado pela pessoa" e "Resposta nova"; spec chat, "Chamado citado numa
// mensagem"; change andamento-e-varias-mensagens, design, decisões 2 e 4; tarefa 3.1): quem recebe o
// `andamento`, com a versão, as ações e a pessoa; e, a Ana, que abriu pelo chat o chamado de Paulo e
// o atende, a espera, a abertura e nenhuma resposta nova, na lista, no chamado, no chip, em
// "Chamados da equipe" e no resumo do chat.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';

const MINUTO = 60_000;

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

interface ChamadoLido {
  numero: number;
  situacaoEmTexto: string;
  pelaTi: boolean;
  andamento: {
    versao: number;
    acoes: string[];
    pessoa: { nome: string; usaOChat: boolean };
  } | null;
  conversa: { especie: string; evento?: string; frase?: string }[];
  respostaNova: { quantas: number; desde: string | null };
}

interface ItemDaLista {
  numero: number;
  situacaoEmTexto: string;
  pelaTi: boolean;
  respostaNova: number;
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-chamados-andamento-${enderecos}.local`);
  await c.entrar();
});

const avancar = (minutos: number) => api.relogio.avancar(minutos * MINUTO);

const daTi = (usuario: UsuarioDoChat, acao: string, numero: number, corpo: object = {}) =>
  c.cliente.enviar('POST', `/chamados/${numero}/${acao}`, c.como(usuario), corpo);

const ler = async (usuario: UsuarioDoChat, numero: number) => {
  const r = await c.cliente.consultar(`/chat/chamados/${numero}`, c.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as ChamadoLido;
};

const versaoNaFicha = async (numero: number) => {
  const r = await c.cliente.consultar(`/chamados/${numero}`, c.como('ana'));
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { versao: number }).versao;
};

/** O chamado da pessoa que Ana abre pelo chat, da mensagem de Paulo no canal, e atende. */
async function abertoPelaAna(canal: string, pessoa: UsuarioDoChat = 'paulo') {
  const mensagem = await c.mensagem(canal, 'paulo', 'A impressora do Financeiro manchou.');
  const numero = await c.abrirChamado(pessoa, 'A impressora do Financeiro manchou.');
  await c.virarChamadoDa(numero, canal, mensagem, 'ana');
  return numero;
}

describe('o andamento', () => {
  it('vai a quem participa e atende os locais: a Ana, pela TI, e a pessoa que atende', async () => {
    const canal = await c.criarCanal('Geral');
    const numero = await abertoPelaAna(canal);

    // Ana abriu o chamado de Paulo pelo chat e atende a organização inteira: participa pela TI.
    const daAna = await ler('ana', numero);
    expect(daAna.pelaTi).toBe(true);
    expect(daAna.andamento).toEqual({
      versao: await versaoNaFicha(numero),
      acoes: ['passar', 'devolver', 'esperar', 'resolver'],
      pessoa: { nome: 'Paulo Nunes', usaOChat: true },
    });

    // Paulo só participa: nenhuma ação.
    const doPaulo = await ler('paulo', numero);
    expect(doPaulo.pelaTi).toBe(false);
    expect(doPaulo.andamento).toBeNull();

    // No aguardando, a versão nova, o retomar e nenhum devolver; no resolvido, só o reabrir.
    expect((await daTi('ana', 'esperar', numero, { texto: 'Qual é o andar?' })).statusCode).toBe(
      200,
    );
    expect((await ler('ana', numero)).andamento).toMatchObject({
      versao: await versaoNaFicha(numero),
      acoes: ['passar', 'retomar', 'resolver'],
    });
    expect((await daTi('ana', 'resolver', numero, { feito: 'Troquei o toner.' })).statusCode).toBe(
      200,
    );
    expect((await ler('ana', numero)).andamento?.acoes).toEqual(['reabrir']);

    // A pessoa que não usa o chat: a mensagem a ela fica no chamado.
    const daRita = await abertoPelaAna(canal, 'rita');
    expect((await ler('ana', daRita)).andamento?.pessoa).toEqual({
      nome: 'Rita Moraes',
      usaOChat: false,
    });

    // O chamado da própria Ana: ela participa como quem pediu, sem o aguardar e sem o reabrir.
    const proprio = await c.abrirChamado('ana', 'O monitor pisca.');
    const doProprio = await ler('ana', proprio);
    expect(doProprio.pelaTi).toBe(false);
    expect(doProprio.andamento).toEqual({
      versao: await versaoNaFicha(proprio),
      acoes: ['passar', 'devolver', 'resolver'],
      pessoa: { nome: 'Ana Souza', usaOChat: true },
    });
    // Devolvido à triagem, sem ninguém com ele: o assumir.
    expect((await daTi('ana', 'devolver', proprio)).statusCode).toBe(200);
    expect((await ler('ana', proprio)).andamento?.acoes).toEqual(['assumir', 'passar', 'resolver']);

    // Quem atende sem participar não lê o chamado pelo chat: segue pelo Chamados.
    const daFernanda = await c.abrirChamado('fernanda');
    const r = await c.cliente.consultar(`/chat/chamados/${daFernanda}`, c.como('ana'));
    expect(r.statusCode).toBe(404);
  });
});

describe('quem participa pela TI', () => {
  it('lê como a TI: a espera é da pessoa, a abertura é dela, e nenhuma resposta nova', async () => {
    const canal = await c.criarCanal('Geral');
    const numero = await abertoPelaAna(canal);
    avancar(1);
    const proprio = await c.abrirChamado('ana', 'O monitor pisca.');
    avancar(1);
    // Lívia, da TI, escreve a Paulo; depois Ana põe o chamado aguardando ele.
    expect(
      (await daTi('livia', 'mensagem', numero, { texto: 'Passo aí às 14h.' })).statusCode,
    ).toBe(200);
    avancar(1);
    expect((await daTi('ana', 'esperar', numero, { texto: 'Qual é o andar?' })).statusCode).toBe(
      200,
    );

    // O chamado: a espera "Aguardando o colaborador", a abertura dela e nenhuma resposta nova.
    const daAna = await ler('ana', numero);
    expect(daAna).toMatchObject({
      situacaoEmTexto: 'Aguardando o colaborador',
      respostaNova: { quantas: 0, desde: null },
    });
    const frases = (lido: ChamadoLido) =>
      lido.conversa.flatMap(({ especie, evento, frase }) =>
        especie === 'evento' && (evento === 'abertura' || evento === 'aguardando') ? [frase] : [],
      );
    expect(frases(daAna)).toEqual([
      'Você abriu este chamado para Paulo Nunes',
      'Aguardando o colaborador',
    ]);
    // Paulo lê o próprio chamado como quem pediu.
    const doPaulo = await ler('paulo', numero);
    expect(doPaulo).toMatchObject({ situacaoEmTexto: 'Aguardando você' });
    expect(doPaulo.respostaNova.quantas).toBe(2);
    expect(frases(doPaulo)).toEqual(['Ana Souza abriu este chamado para você', 'Aguardando você']);

    // A lista: o aguardando de Paulo não sobe, e o próprio, mais novo, vem antes.
    const lista = async (usuario: UsuarioDoChat) => {
      const r = await c.cliente.consultar('/chat/chamados', c.como(usuario));
      expect(r.statusCode, r.body).toBe(200);
      return (r.json() as { abertos: ItemDaLista[] }).abertos.map(
        ({ numero: n, situacaoEmTexto, pelaTi, respostaNova }) => ({
          numero: n,
          situacaoEmTexto,
          pelaTi,
          respostaNova,
        }),
      );
    };
    expect(await lista('ana')).toEqual([
      { numero: proprio, situacaoEmTexto: 'Em andamento', pelaTi: false, respostaNova: 0 },
      { numero, situacaoEmTexto: 'Aguardando o colaborador', pelaTi: true, respostaNova: 0 },
    ]);
    expect(await lista('paulo')).toEqual([
      { numero, situacaoEmTexto: 'Aguardando você', pelaTi: false, respostaNova: 2 },
    ]);

    // O chip da citação e o resumo dele.
    const citou = await c.cliente.enviar(
      'POST',
      `/chat/conversas/${canal}/mensagens`,
      c.como('paulo'),
      { texto: `Vi o #${numero}.` },
    );
    expect(citou.statusCode, citou.body).toBe(201);
    const noChip = async (usuario: UsuarioDoChat) => {
      const r = await c.cliente.consultar(`/chat/conversas/${canal}/mensagens`, c.como(usuario));
      expect(r.statusCode, r.body).toBe(200);
      const { itens } = r.json() as { itens: { citacoes: { situacao: string }[] }[] };
      return itens.flatMap(({ citacoes }) => citacoes.map(({ situacao }) => situacao));
    };
    expect(await noChip('ana')).toEqual(['Aguardando o colaborador']);
    expect(await noChip('paulo')).toEqual(['Aguardando você']);
    const noResumo = async (usuario: UsuarioDoChat) => {
      const r = await c.cliente.consultar(`/chat/chamados/${numero}/resumo`, c.como(usuario));
      expect(r.statusCode, r.body).toBe(200);
      return (r.json() as { situacao: string }).situacao;
    };
    expect(await noResumo('ana')).toBe('Aguardando o colaborador');
    expect(await noResumo('paulo')).toBe('Aguardando você');

    // "Chamados da equipe", no canal de onde ele foi aberto.
    const daConversa = async (usuario: UsuarioDoChat) => {
      const r = await c.cliente.consultar(`/chat/conversas/${canal}/chamados`, c.como(usuario));
      expect(r.statusCode, r.body).toBe(200);
      return (r.json() as { itens: { situacao: string }[] }).itens.map(({ situacao }) => situacao);
    };
    expect(await daConversa('ana')).toEqual(['Aguardando o colaborador']);
    expect(await daConversa('paulo')).toEqual(['Aguardando você']);
  });

  it('o resumo do chat conta a resposta nova a Paulo, e não a Ana, que atende pela TI', async () => {
    const canal = await c.criarCanal('Geral');
    const numero = await abertoPelaAna(canal);
    avancar(1);
    expect(
      (await daTi('livia', 'mensagem', numero, { texto: 'Passo aí às 14h.' })).statusCode,
    ).toBe(200);

    const resumo = async (usuario: UsuarioDoChat) => {
      const r = await c.cliente.consultar('/chat/resumo', c.como(usuario));
      expect(r.statusCode, r.body).toBe(200);
      return (r.json() as { chamadosComRespostaNova: number | null }).chamadosComRespostaNova;
    };
    expect(await resumo('ana')).toBe(0);
    expect(await resumo('paulo')).toBe(1);
  });
});
