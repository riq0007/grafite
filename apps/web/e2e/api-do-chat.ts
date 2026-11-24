// A API do chat simulada, para as pontas a ponta do app do chat (change chat-com-chamados, tarefa
// 5.3): a lista das conversas e dos chamados, a conversa aberta, as mensagens que a tela manda, com
// os anexos e a miniatura da imagem, a leitura e a conversa do chamado, montadas do que a simulação
// guarda, como a API. A sessão é a de uma colaboradora, Fernanda Rocha, com o "Usar o chat" e o
// "Pedir chamados pelo chat" na organização inteira, como o perfil Colaborador do runbook.
import { readFileSync } from 'node:fs';
import type { components } from '@grafite/api-client';
import type { Page, Route } from '@playwright/test';
import { type PermissaoDaSessao, SEM_SESSAO, sessaoDe } from './fixtures.ts';

type Esquemas = components['schemas'];
type Mensagem = Esquemas['MensagemDoChat'];
type ContaDoChat = Esquemas['ContaDoChat'];
type ConversaAberta = Esquemas['ConversaAberta'];
type ChamadoNaLista = Esquemas['ChamadoDeQuemParticipa'];
type ConversaDoChamado = Esquemas['ConversaDoChamadoDeQuemParticipa'];
type AnexoDaMensagem = Esquemas['AnexoDaMensagem'];

const DA_COLABORADORA: PermissaoDaSessao[] = [
  { chave: 'chat.usar', organizacao: true, locais: [] },
  { chave: 'chamados.pedir', organizacao: true, locais: [] },
];

/** A sessão de Fernanda Rocha, colaboradora: só o chat e o pedido de chamados por ele. */
export const SESSAO_DA_COLABORADORA = sessaoDe(
  { usuario: 'fernanda.rocha', nome: 'Fernanda Rocha' },
  DA_COLABORADORA,
);

const id = (n: number) => `0199d3a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** As conversas da conta: a equipe, o canal em que só a TI escreve e a conversa direta. */
export const EQUIPE = id(9001);
export const CANAL = id(9002);
export const DIRETA = id(9003);

const EU: ContaDoChat = {
  conta: SESSAO_DA_COLABORADORA.sessao.conta.id,
  nome: 'Fernanda Rocha',
  daTi: false,
  foto: null,
};
const PAULO: ContaDoChat = { conta: id(8002), nome: 'Paulo Nunes', daTi: false, foto: null };
const TATIANA: ContaDoChat = { conta: id(8003), nome: 'Tatiana Ramos', daTi: false, foto: null };
const BRUNO: ContaDoChat = { conta: id(8004), nome: 'Bruno Lima', daTi: true, foto: null };

/** A miniatura de 512 px de uma foto deitada, como a API a grava. */
const MINIATURA = { largura: 512, altura: 288 };

/** Uma foto deitada no lugar da miniatura que a API gera: um SVG de 512 × 288. */
export const FOTO_DEITADA = readFileSync(
  new URL('./exemplos/foto-deitada.svg', import.meta.url),
  'utf-8',
);

/** Um documento qualquer, no lugar dos arquivos que a API guarda. */
const ARQUIVO = '%PDF-1.4\n%simulado\n';

const problema = (status: number, codigo: string, detalhe: string, campos?: object) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({
    type: `urn:grafite:problema:${codigo}`,
    title: detalhe,
    status,
    detail: detalhe,
    codigoDeRastreio: 'T5EX-2E2E',
    ...(campos && { campos }),
  }),
});

/** A data de minutos atrás, para os textos da tela não dependerem do dia em que o teste roda. */
const ha = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

interface ConversaGuardada {
  cabecalho: Omit<ConversaAberta, 'id' | 'lidaAte'>;
  mensagens: Mensagem[];
  lidaAte: string | null;
}

/** Uma mensagem guardada, que a tela manda, com o corpo. */
export interface PedidoDeMensagem {
  conversa: string;
  corpo: { texto?: string; respondeA?: string | null; anexos?: string[] };
}

/**
 * A sessão da colaboradora na página, por cima da da fixture: sem sessão até a entrada, quando
 * `entrou` começa falso, e com ela depois. A resposta da entrada é a da sessão.
 */
export async function simularSessaoDaColaboradora(pagina: Page, { entrou = true } = {}) {
  let comSessao = entrou;
  const estado = () => ({
    ambiente: 'producao',
    organizacao: { ...SEM_SESSAO.organizacao, operaOServidor: false, modulosDesligados: [] },
    sessao: comSessao ? SESSAO_DA_COLABORADORA.sessao : null,
  });
  await pagina.route('**/api/sessao', (rota) => {
    const metodo = rota.request().method();
    if (metodo === 'GET') return rota.fulfill({ json: estado() });
    if (metodo !== 'POST') return rota.fallback();
    comSessao = true;
    return rota.fulfill({ json: SESSAO_DA_COLABORADORA });
  });
}

/**
 * Simula a API do chat na página. A Equipe Financeiro tem a mensagem com o PDF anexado; o #1041
 * espera a resposta da colaboradora, com a pergunta da TI, e o #1044 está com Bruno Lima.
 */
export async function simularChat(pagina: Page) {
  let seguinte = 500;
  const novoId = () => id(seguinte++);
  const mensagem = (
    n: number,
    autor: ContaDoChat,
    texto: string | null,
    minutos: number,
    mudar: Partial<Mensagem> = {},
  ): Mensagem => ({
    id: id(n),
    especie: 'mensagem',
    autor,
    texto,
    evento: null,
    criadaEm: ha(minutos),
    respondida: null,
    reacoes: [],
    anexos: [],
    citacoes: [],
    chamado: null,
    ...mudar,
  });

  const conversas: Record<string, ConversaGuardada> = {
    [EQUIPE]: {
      cabecalho: {
        tipo: 'equipe',
        nome: 'Equipe Financeiro',
        outra: null,
        pessoas: 12,
        escreveGrupo: null,
        arquivada: false,
        silenciada: false,
        escreve: true,
        recusa: null,
      },
      mensagens: [
        mensagem(1, TATIANA, 'Bom dia! Quem vai fechar o relatório de despesas hoje?', 50),
        mensagem(
          2,
          PAULO,
          'A impressora do Financeiro está manchando todas as folhas, e o fechamento é às 16h.',
          40,
          {
            reacoes: [
              {
                texto: '+1',
                contas: [{ conta: TATIANA.conta, nome: TATIANA.nome }],
                minha: false,
              },
            ],
          },
        ),
        mensagem(3, PAULO, 'Segue o orçamento do toner.', 39, {
          anexos: [
            {
              id: id(301),
              nome: 'orcamento-do-toner.pdf',
              tipo: 'application/pdf',
              bytes: 182_000,
              miniatura: null,
            },
          ],
        }),
        mensagem(4, EU, 'Eu vou abrir um chamado agora.', 30),
      ],
      lidaAte: id(4),
    },
    [CANAL]: {
      cabecalho: {
        tipo: 'canal',
        nome: 'Avisos da TI',
        outra: null,
        pessoas: null,
        escreveGrupo: 'TI',
        arquivada: false,
        silenciada: false,
        escreve: false,
        recusa: 'Só TI escreve neste canal.',
      },
      mensagens: [mensagem(10, BRUNO, 'A rede do 2º andar para às 18h para a manutenção.', 90)],
      lidaAte: id(10),
    },
    [DIRETA]: {
      cabecalho: {
        tipo: 'direta',
        nome: PAULO.nome,
        outra: PAULO,
        pessoas: null,
        escreveGrupo: null,
        arquivada: false,
        silenciada: false,
        escreve: true,
        recusa: null,
      },
      mensagens: [mensagem(20, PAULO, 'Você já falou com a TI?', 20)],
      lidaAte: id(20),
    },
  };

  const naLista = (numero: number, mudar: Partial<ChamadoNaLista>): ChamadoNaLista => ({
    numero,
    titulo: `Chamado ${numero}`,
    tipo: { nome: 'Computador', icone: 'computador' },
    situacao: 'em-atendimento',
    fechado: false,
    situacaoEmTexto: 'Em andamento',
    abertoEm: ha(180),
    resolvidoEm: null,
    atende: null,
    pelaTi: false,
    respostaNova: 0,
    ultimaMensagem: null,
    ...mudar,
  });
  const chamados: Esquemas['ChamadosDeQuemParticipa'] = {
    abertos: [
      naLista(1041, {
        titulo: 'Sem acesso à pasta do Financeiro',
        tipo: { nome: 'Acesso e senha', icone: 'cadeado' },
        situacao: 'aguardando',
        situacaoEmTexto: 'Aguardando você',
        atende: 'Bruno Lima',
        respostaNova: 1,
      }),
      naLista(1044, { titulo: 'Teclado com teclas falhando', atende: 'Bruno Lima' }),
    ],
    resolvidos: [],
    seguintes: false,
  };
  const VOCE = { nome: EU.nome, daTi: false, minha: true };
  const DA_TI = { nome: BRUNO.nome, daTi: true, minha: false };
  const etapas = (agora: ConversaDoChamado['situacao'], chegou: number) =>
    (['triagem', 'em-atendimento', 'aguardando', 'resolvido'] as const).map((situacao, i) => ({
      situacao,
      agora: situacao === agora,
      estado: i < chegou ? ('chegou' as const) : ('ainda-nao' as const),
      em: i < chegou ? ha(180 - i * 30) : null,
    }));
  const doChamado = (numero: number, mudar: Partial<ConversaDoChamado>): ConversaDoChamado => ({
    numero,
    titulo: chamados.abertos.find((chamado) => chamado.numero === numero)?.titulo ?? '',
    tipo: { nome: 'Computador', icone: 'computador' },
    situacao: 'em-atendimento',
    fechado: false,
    situacaoEmTexto: 'Em andamento',
    abertoEm: ha(180),
    atende: { nome: BRUNO.nome, desde: ha(150) },
    etapas: etapas('em-atendimento', 2),
    previsao: null,
    reabrirAte: null,
    ativo: null,
    resumo: '',
    anexosDosCampos: [],
    origem: null,
    origens: [],
    conversa: [],
    pelaTi: false,
    andamento: null,
    respostaNova: { quantas: 0, desde: null },
    avaliacao: null,
    ...mudar,
  });
  const conversasDosChamados = new Map<number, ConversaDoChamado>([
    [
      1041,
      doChamado(1041, {
        tipo: { nome: 'Acesso e senha', icone: 'cadeado' },
        situacao: 'aguardando',
        situacaoEmTexto: 'Aguardando você',
        etapas: etapas('aguardando', 3),
        resumo: 'Pasta: Financeiro · Acesso: Leitura e escrita',
        conversa: [
          {
            especie: 'evento',
            id: id(401),
            em: ha(180),
            evento: 'abertura',
            frase: 'Recebemos o seu chamado',
            resumo: null,
          },
          {
            especie: 'mensagem',
            id: id(402),
            em: ha(170),
            autor: VOCE,
            texto: 'Preciso da pasta amanhã cedo para o fechamento.',
            anexos: [],
            opcoes: null,
            escolhida: null,
            cartao: null,
          },
          {
            especie: 'mensagem',
            id: id(403),
            em: ha(60),
            autor: DA_TI,
            texto: 'Não achei uma pasta com esse nome. Confirme o nome exato, por favor.',
            anexos: [],
            opcoes: ['É “Financeiro 2026”', 'Vou conferir'],
            escolhida: null,
            cartao: null,
          },
        ],
        respostaNova: { quantas: 1, desde: id(403) },
      }),
    ],
    [
      1044,
      doChamado(1044, {
        resumo: 'Equipamento: Teclado · Problema: Teclas falhando',
        conversa: [
          {
            especie: 'mensagem',
            id: id(411),
            em: ha(120),
            autor: DA_TI,
            texto: 'Separei um teclado novo. Passo aí depois do almoço.',
            anexos: [],
            opcoes: null,
            escolhida: null,
            cartao: null,
          },
        ],
      }),
    ],
  ]);

  const anexosEnviados = new Map<string, AnexoDaMensagem>();
  const pedidos: PedidoDeMensagem[] = [];

  const lista = (): Esquemas['ListaDoChat'] => {
    const daLista = ([conversa, guardada]: [string, ConversaGuardada]) => ({
      id: conversa,
      tipo: guardada.cabecalho.tipo,
      nome: guardada.cabecalho.nome,
      naoLidas: 0,
      silenciada: guardada.cabecalho.silenciada,
      ultimaMensagemEm: guardada.mensagens.at(-1)?.criadaEm ?? null,
      outra: guardada.cabecalho.outra,
    });
    const todas = Object.entries(conversas);
    return {
      equipesECanais: todas.filter(([, { cabecalho }]) => cabecalho.tipo !== 'direta').map(daLista),
      recentes: todas.filter(([, { cabecalho }]) => cabecalho.tipo === 'direta').map(daLista),
    };
  };

  /** As últimas 50 mensagens, como a primeira página da API. */
  const pagina50 = (guardada: ConversaGuardada): Esquemas['PaginaDeMensagens'] => ({
    itens: guardada.mensagens.slice(-50),
    lidaAte: guardada.lidaAte,
    anteriores: guardada.mensagens.length > 50,
    seguintes: false,
  });

  /** Confere e guarda a mensagem nova, como a API: sem o texto, ela vai só com os anexos. */
  const gravar = (conversa: string, corpo: PedidoDeMensagem['corpo'], rota: Route) => {
    const guardada = conversas[conversa];
    if (!guardada) return rota.fulfill(problema(404, 'nao-encontrado', 'Conversa não encontrada.'));
    if (guardada.cabecalho.recusa) {
      return rota.fulfill(problema(409, 'conflito', guardada.cabecalho.recusa));
    }
    const texto = (corpo.texto ?? '').trim();
    const anexos = (corpo.anexos ?? []).flatMap((anexo) => anexosEnviados.get(anexo) ?? []);
    if (texto === '' && anexos.length === 0) {
      return rota.fulfill(
        problema(400, 'dados-invalidos', 'Confira os campos indicados.', {
          texto: 'Escreva a mensagem.',
        }),
      );
    }
    const respondida = guardada.mensagens.find(({ id: outra }) => outra === corpo.respondeA);
    const nova: Mensagem = {
      id: novoId(),
      especie: 'mensagem',
      autor: EU,
      texto: texto === '' ? null : texto,
      evento: null,
      criadaEm: new Date().toISOString(),
      respondida: respondida
        ? { id: respondida.id, autor: respondida.autor.nome, comeco: respondida.texto ?? '' }
        : null,
      reacoes: [],
      anexos,
      citacoes: [],
      chamado: null,
    };
    guardada.mensagens.push(nova);
    guardada.lidaAte = nova.id;
    pedidos.push({ conversa, corpo });
    return rota.fulfill({ status: 201, json: nova });
  };

  await pagina.route(/\/api\/chat\/conversas(\?.*)?$/, (rota) =>
    rota.request().method() === 'GET' ? rota.fulfill({ json: lista() }) : rota.fallback(),
  );
  await pagina.route(/\/api\/chat\/chamados(\?.*)?$/, (rota) =>
    rota.request().method() === 'GET' ? rota.fulfill({ json: chamados }) : rota.fallback(),
  );
  await pagina.route(/\/api\/chat\/resumo(\?.*)?$/, (rota) =>
    rota.fulfill({
      json: {
        naoLidas: 0,
        chamadosComRespostaNova: chamados.abertos.filter(({ respostaNova }) => respostaNova > 0)
          .length,
      } satisfies Esquemas['ResumoDoChat'],
    }),
  );
  // O anexo vai antes da mensagem, sem dono; a imagem ganha a miniatura, como na API.
  await pagina.route(/\/api\/chat\/anexos(\?.*)?$/, (rota) => {
    if (rota.request().method() !== 'POST') return rota.fallback();
    const nome = new URL(rota.request().url()).searchParams.get('nome') ?? 'arquivo';
    const imagem = /\.(png|jpe?g|webp)$/i.test(nome);
    const enviado: AnexoDaMensagem = {
      id: novoId(),
      nome,
      tipo: imagem ? 'image/png' : 'application/pdf',
      bytes: rota.request().postDataBuffer()?.length ?? 0,
      miniatura: imagem ? MINIATURA : null,
    };
    anexosEnviados.set(enviado.id, enviado);
    const { miniatura: _, ...semAMiniatura } = enviado;
    return rota.fulfill({
      status: 201,
      json: semAMiniatura satisfies Esquemas['AnexoEnviado'],
    });
  });
  await pagina.route(
    /\/api\/chat\/conversas\/[0-9a-f-]{36}(\/[a-z]+)?(\/[0-9a-f-]{36}(\/miniatura)?)?(\?.*)?$/,
    (rota) => {
      const url = new URL(rota.request().url());
      const [, , , , conversa = '', parte, anexo, miniatura] = url.pathname.split('/');
      const guardada = conversas[conversa];
      if (!guardada)
        return rota.fulfill(problema(404, 'nao-encontrado', 'Conversa não encontrada.'));
      const metodo = rota.request().method();
      if (parte === undefined && metodo === 'GET') {
        return rota.fulfill({
          json: { id: conversa, lidaAte: guardada.lidaAte, ...guardada.cabecalho },
        });
      }
      if (parte === 'mensagens' && metodo === 'GET') {
        return rota.fulfill({ json: pagina50(guardada) });
      }
      if (parte === 'mensagens' && metodo === 'POST') {
        return gravar(conversa, rota.request().postDataJSON(), rota);
      }
      if (parte === 'leitura' && metodo === 'POST') {
        const { ate } = rota.request().postDataJSON() as { ate: string };
        if (guardada.lidaAte === null || ate > guardada.lidaAte) guardada.lidaAte = ate;
        return rota.fulfill({ json: { lidaAte: guardada.lidaAte ?? ate } });
      }
      if (parte === 'anexos' && anexo && metodo === 'GET') {
        return miniatura
          ? rota.fulfill({ headers: { 'content-type': 'image/svg+xml' }, body: FOTO_DEITADA })
          : rota.fulfill({ headers: { 'content-type': 'application/pdf' }, body: ARQUIVO });
      }
      return rota.fallback();
    },
  );
  await pagina.route(/\/api\/chat\/chamados\/\d+(\/[a-z]+)?(\?.*)?$/, (rota) => {
    const [, , , , numero, parte] = new URL(rota.request().url()).pathname.split('/');
    const conversa = conversasDosChamados.get(Number(numero));
    if (!conversa) return rota.fulfill(problema(404, 'nao-encontrado', 'Chamado não encontrado.'));
    const metodo = rota.request().method();
    if (parte === undefined && metodo === 'GET') return rota.fulfill({ json: conversa });
    if (parte === 'vista' && metodo === 'POST') {
      conversa.respostaNova = { quantas: 0, desde: null };
      return rota.fulfill({ json: conversa });
    }
    return rota.fallback();
  });

  return {
    /** As mensagens que a tela mandou, na ordem. */
    pedidos,
    /** As mensagens da conversa, como a simulação as guarda. */
    mensagensDe: (conversa: string) => conversas[conversa]?.mensagens ?? [],
  };
}
