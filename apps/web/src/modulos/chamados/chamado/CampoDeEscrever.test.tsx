// O campo de escrever do chamado aberto (spec modulo-chamados, "Campo de escrever"; change
// chat-com-chamados, design, decisão 15, "O lado da TI na tela", tarefa 4.13 e os pontos da
// revisão dela): o "/ativo" lido na pausa e no envio, com a recusa, a falha e a leitura ainda no
// ar, e o foco depois da nota, das opções e do envio.
import { HORARIO_DA_TI_PADRAO, TIPOS_DE_CHAMADO_DE_FABRICA } from '@grafite/domain';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import {
  AGORA_DOS_MOCKUPS,
  ANA,
  FUSO_DOS_MOCKUPS,
  servidorDoQuadro,
} from '../../../teste/chamados.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import type { FichaDoChamado } from '../consultas.ts';

afterEach(() => {
  cleanup();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

const TIPO = TIPOS_DE_CHAMADO_DE_FABRICA[0];
if (!TIPO) throw new Error('Sem os tipos de fábrica.');

/** O chamado em atendimento com Ana Souza, a conta da sessão, com a impressora ligada. */
const FICHA: FichaDoChamado = {
  numero: 1042,
  titulo: 'Impressora manchando',
  situacao: 'em-atendimento',
  versao: 3,
  origem: 'ti',
  origemNoChat: null,
  abertoEm: '2026-11-11T11:00:00.000Z',
  fechado: false,
  reabrirAte: null,
  tipo: {
    id: '0199a6e0-0000-7000-8000-0000000000e1',
    nome: TIPO.nome,
    icone: TIPO.icone,
    podeVirarOs: true,
  },
  pessoa: {
    id: '0199a6e0-0000-7000-8000-0000000000d1',
    nome: 'Marina Rocha',
    local: 'Jundiaí › Recepção',
    abrir: false,
    contatos: null,
    usaOChat: true,
  },
  responsavel: {
    conta: ANA.conta,
    nome: ANA.nome,
    desde: '2026-11-11T11:05:00.000Z',
    naoAtendeMais: false,
  },
  ativo: {
    id: '0199a6e0-0000-7000-8000-0000000000a1',
    rotulo: 'HP LaserJet M404',
    patrimonio: 'PAT-00131',
    local: null,
    abrir: false,
    tipo: { nome: 'Impressora', icone: 'impressora' },
    usaConsumiveis: true,
    resumo: null,
  },
  locais: [],
  semLocal: true,
  permite: { atender: true },
  relogio: null,
  parouEm: null,
  horario: { ...HORARIO_DA_TI_PADRAO, dias: [...HORARIO_DA_TI_PADRAO.dias] },
  os: null,
  solicitacao: null,
  formulario: TIPO.formulario,
  respostas: {},
  citados: { ativos: [], locais: [], pessoas: [] },
  anexosDosCampos: [],
  resumo: '',
  conversa: [],
  respostasProntas: [],
};

/** O cartão da impressora 137, como a prévia o devolve. */
const CARTAO = {
  ativo: '0199a6e0-0000-7000-8000-0000000000a2',
  icone: 'impressora',
  tipo: 'Impressora',
  nome: 'Impressora 137',
  modelo: 'HP LaserJet M404',
  patrimonio: 'PAT-00137',
  ip: null,
  disponibilidade: null,
  suprimento: null,
  em: '2026-11-11T12:39:00.000Z',
};

const NAO_ENCONTRADO = () =>
  Response.json(
    {
      type: 'urn:grafite:problema:nao-encontrado',
      title: 'Não encontrado',
      status: 404,
      detail: 'O ativo não foi encontrado.',
      codigoDeRastreio: 'R7K2-9QXM',
      campos: { cartao: 'O ativo não foi encontrado.' },
    },
    { status: 404 },
  );

const SEM_CONEXAO = (): Response => {
  throw new TypeError('Failed to fetch');
};

/** Uma resposta que o teste solta quando quer. */
function adiada() {
  let soltar: (resposta: Response) => void = () => {};
  const resposta = new Promise<Response>((resolver) => {
    soltar = resolver;
  });
  return { resposta, soltar };
}

/** O chamado 1042, a prévia do cartão pelo `cartao` do teste e a mensagem, que guarda os pedidos. */
function servidorDoCampo(cartao: (pedido: Request) => Response | Promise<Response>) {
  const leituras: URLSearchParams[] = [];
  const enviados: unknown[] = [];
  const { servidor: dasTelas } = servidorDoQuadro();
  const servidor: ServidorDeTeste = {
    ...dasTelas,
    'GET /api/chamados/1042': () => Response.json(FICHA),
    'GET /api/chamados/1042/cartao': (pedido) => {
      leituras.push(new URL(pedido.url).searchParams);
      return cartao(pedido);
    },
    'POST /api/chamados/1042/mensagem': async (pedido) => {
      enviados.push(await pedido.json());
      return Response.json({
        numero: 1042,
        versao: 4,
        situacao: 'em-atendimento',
        responsavel: { id: ANA.conta, nome: ANA.nome },
      });
    },
  };
  return { servidor, leituras, enviados };
}

function abrirOChamado(servidor: ServidorDeTeste) {
  noComputador();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA_DOS_MOCKUPS);
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/chamados/1042'] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(naOrganizacao('chamados.atender'), servidor, {
        regiao: { fuso: FUSO_DOS_MOCKUPS },
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
}

const caixa = () =>
  screen.findByRole('textbox', { name: 'Mensagem para Marina' }) as Promise<HTMLTextAreaElement>;
const escrever = async (texto: string) =>
  fireEvent.change(await caixa(), { target: { value: texto } });
const enviar = () => fireEvent.click(screen.getByRole('button', { name: 'Enviar para Marina' }));
/** A espera da pausa na escrita, que lê o "/ativo", com folga. */
const PAUSA = { timeout: 3000 };
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

describe('o "/ativo" no campo de escrever', () => {
  it('a prévia que falha sem conexão não recusa o comando: o envio o lê de novo e manda com o cartão', async () => {
    let conectado = false;
    const { servidor, leituras, enviados } = servidorDoCampo(() =>
      conectado ? Response.json(CARTAO) : SEM_CONEXAO(),
    );
    abrirOChamado(servidor);
    await escrever('Olá\n/ativo PAT-00137');
    await screen.findByText('Sem conexão com o servidor. Tente de novo.', {}, PAUSA);
    // A pausa não repete sozinha.
    await esperar(800);
    expect(leituras).toHaveLength(1);

    conectado = true;
    enviar();
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(leituras).toHaveLength(2);
    expect(enviados[0]).toEqual({ texto: 'Olá', cartao: CARTAO.ativo });
  });

  it('o envio que relê e ainda falha para, com o texto como está', async () => {
    const { servidor, leituras, enviados } = servidorDoCampo(SEM_CONEXAO);
    abrirOChamado(servidor);
    await escrever('Olá\n/ativo PAT-00137');
    await screen.findByText('Sem conexão com o servidor. Tente de novo.', {}, PAUSA);
    enviar();
    await waitFor(() => expect(leituras).toHaveLength(2));
    await esperar(100);
    expect(enviados).toEqual([]);
    expect((await caixa()).value).toBe('Olá\n/ativo PAT-00137');
  });

  it('o comando recusado na pausa: o primeiro envio para, com o foco na caixa; o seguinte manda como está', async () => {
    const { servidor, enviados } = servidorDoCampo(NAO_ENCONTRADO);
    abrirOChamado(servidor);
    await escrever('Olá\n/ativo PAT-0137');
    await screen.findByText('O ativo PAT-0137 não foi encontrado.', {}, PAUSA);

    enviar();
    await esperar(100);
    expect(enviados).toEqual([]);
    expect(document.activeElement).toBe(await caixa());

    enviar();
    await waitFor(() => expect(enviados).toEqual([{ texto: 'Olá\n/ativo PAT-0137' }]));
  });

  it('a prévia da pausa ainda no ar: o envio espera por ela e manda com o cartão', async () => {
    const respostas: ReturnType<typeof adiada>[] = [];
    const { servidor, leituras, enviados } = servidorDoCampo(() => {
      const uma = adiada();
      respostas.push(uma);
      return uma.resposta;
    });
    abrirOChamado(servidor);
    await escrever('Olá\n/ativo PAT-00137');
    await waitFor(() => expect(leituras).toHaveLength(1), PAUSA);

    enviar();
    await esperar(100);
    // A da pausa chega primeiro; a outra, se houvesse, depois.
    for (const uma of respostas) {
      uma.soltar(Response.json(CARTAO));
      await esperar(50);
    }
    await waitFor(() => expect(enviados).toEqual([{ texto: 'Olá', cartao: CARTAO.ativo }]));
    expect(leituras).toHaveLength(1);
  });
});

describe('o foco no campo de escrever', () => {
  it('volta à caixa depois da mensagem mandada pelo botão', async () => {
    const { servidor, enviados } = servidorDoCampo(NAO_ENCONTRADO);
    abrirOChamado(servidor);
    await escrever('A impressora voltou?');
    enviar();
    await waitFor(() => expect(enviados).toHaveLength(1));
    await waitFor(async () => expect(document.activeElement).toBe(await caixa()));
  });

  it('não pula para a "Opção 1" ao voltar da nota, e tirar as opções o leva à caixa', async () => {
    const { servidor } = servidorDoCampo(NAO_ENCONTRADO);
    abrirOChamado(servidor);
    await caixa();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir uma escolha' }));
    const primeira = await screen.findByRole('textbox', { name: 'Opção 1' });
    await waitFor(() => expect(document.activeElement).toBe(primeira));

    fireEvent.click(screen.getByRole('radio', { name: 'Nota interna' }));
    await screen.findByRole('textbox', { name: 'Nota interna' });
    const mensagem = screen.getByRole('radio', { name: 'Mensagem para Marina' });
    mensagem.focus();
    fireEvent.click(mensagem);
    const deVolta = await screen.findByRole('textbox', { name: 'Opção 1' });
    await esperar(50);
    expect(document.activeElement).not.toBe(deVolta);

    fireEvent.click(screen.getByRole('button', { name: 'Tirar a opção 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tirar a opção 1' }));
    await waitFor(async () => expect(document.activeElement).toBe(await caixa()));
  });
});
