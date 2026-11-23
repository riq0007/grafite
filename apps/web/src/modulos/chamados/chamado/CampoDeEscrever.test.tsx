// O campo de escrever do chamado aberto (spec modulo-chamados, "Campo de escrever"; change
// chat-com-chamados, design, decisão 15, "O lado da TI na tela", tarefa 4.13 e os pontos da
// revisão dela): o "/ativo" lido na pausa e no envio, com a recusa, a falha e a leitura ainda no
// ar, o foco depois da nota, das opções e do envio, e o que entra no meio do campo, que vem à vista.
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

/** Os elementos que rolaram para perto, na ordem: o meio do campo rola por dentro na janela baixa. */
function rolagens() {
  const rolar = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
  return {
    vistos: () => rolar.mock.contexts as Element[],
    esquecer: () => rolar.mockClear(),
  };
}

/** A recusa do envio, com a frase no campo que a teve. */
const RECUSADO = (campos: Record<string, string>) => () =>
  Response.json(
    {
      type: 'urn:grafite:problema:dados-invalidos',
      title: 'Dados inválidos',
      status: 400,
      detail: 'Confira os campos indicados.',
      codigoDeRastreio: 'ABCD-1234',
      campos,
    },
    { status: 400 },
  );

const tirarOCartao = () =>
  screen.findByRole('button', { name: 'Tirar o cartão de Impressora 137' }, PAUSA);

function anexar(...arquivos: File[]) {
  const entrada = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!entrada) throw new Error('O campo não anexa.');
  fireEvent.change(entrada, { target: { files: arquivos } });
}

describe('o que entra no meio do campo vem à vista', () => {
  it('a recusa do "/ativo", ao aparecer e de novo no envio que para nela', async () => {
    const rolou = rolagens();
    const { servidor, enviados } = servidorDoCampo(NAO_ENCONTRADO);
    abrirOChamado(servidor);
    await escrever('Olá\n/ativo PAT-0137');
    const recusa = await screen.findByText('O ativo PAT-0137 não foi encontrado.', {}, PAUSA);
    await waitFor(() => expect(rolou.vistos()).toContain(recusa));
    rolou.esquecer();

    enviar();
    await esperar(100);
    expect(enviados).toEqual([]);
    expect(rolou.vistos()).toContain(recusa);
  });

  it('o cartão que o "/ativo" põe no campo', async () => {
    const rolou = rolagens();
    const { servidor } = servidorDoCampo(() => Response.json(CARTAO));
    abrirOChamado(servidor);
    await escrever('Olá\n/ativo PAT-00137');
    const tirar = await tirarOCartao();
    await waitFor(() => expect(rolou.vistos().some((visto) => visto.contains(tirar))).toBe(true));
  });

  it.each([
    ['texto', 'A mensagem passa de 4.000 caracteres.'],
    ['opcoes', 'As opções precisam ser diferentes.'],
    ['anexos', 'Um dos anexos não foi encontrado.'],
    ['cartao', 'O ativo do cartão não foi encontrado.'],
  ])('a recusa do envio no campo %s, também quando ela se repete', async (campo, frase) => {
    const rolou = rolagens();
    const { servidor } = servidorDoCampo(() => Response.json(CARTAO));
    abrirOChamado({
      ...servidor,
      'POST /api/chamados/1042/mensagem': RECUSADO({ [campo]: frase }),
    });
    // O cartão e as opções, para as recusas deles terem onde ficar.
    await escrever('Olá\n/ativo PAT-00137');
    await tirarOCartao();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir uma escolha' }));
    await screen.findByRole('textbox', { name: 'Opção 1' });

    enviar();
    const recusa = await screen.findByText(frase);
    await waitFor(() => expect(rolou.vistos()).toContain(recusa));
    rolou.esquecer();

    enviar();
    await waitFor(() => expect(rolou.vistos()).toContain(screen.getByText(frase)));
  });

  it('a falha do envio, no pé, que a tela estreita rola', async () => {
    const rolou = rolagens();
    const { servidor } = servidorDoCampo(NAO_ENCONTRADO);
    abrirOChamado({ ...servidor, 'POST /api/chamados/1042/mensagem': SEM_CONEXAO });
    await escrever('A impressora voltou?');
    enviar();
    const falha = await screen.findByText('Sem conexão com o servidor. Tente de novo.');
    await waitFor(() => expect(rolou.vistos().some((visto) => visto.contains(falha))).toBe(true));
    rolou.esquecer();

    enviar();
    await waitFor(() => {
      const deNovo = screen.getByText('Sem conexão com o servidor. Tente de novo.');
      expect(rolou.vistos().some((visto) => visto.contains(deNovo))).toBe(true);
    });
  });

  it('o arquivo que entra na lista e as recusas dos arquivos, a do servidor e a de antes do envio', async () => {
    const rolou = rolagens();
    const { servidor } = servidorDoCampo(NAO_ENCONTRADO);
    abrirOChamado({
      ...servidor,
      // O servidor recusa o formato do programa; a foto fica no ar, na lista, com o progresso.
      'POST /api/chamados/anexos': (pedido) =>
        new URL(pedido.url).searchParams.get('nome') === 'programa.exe'
          ? RECUSADO({ arquivo: 'O formato do arquivo não é aceito.' })()
          : new Promise<Response>(() => {}),
    });
    await caixa();
    anexar(new File([new Uint8Array(5)], 'programa.exe'));
    const doServidor = await screen.findByText('programa.exe: Confira os campos indicados.');
    await waitFor(() => expect(rolou.vistos()).toContain(doServidor));

    anexar(new File([new Uint8Array(5)], 'foto.png', { type: 'image/png' }));
    const nome = await screen.findByText('foto.png');
    await waitFor(() => expect(rolou.vistos().some((visto) => visto.contains(nome))).toBe(true));
    rolou.esquecer();

    anexar(new File([], 'vazio.txt'));
    const antesDoEnvio = await screen.findByText('vazio.txt: O arquivo está vazio.');
    await waitFor(() => expect(rolou.vistos()).toContain(antesDoEnvio));
  });
});

describe('os anexos colados e soltos no campo (tarefa 4.19 do chat-com-chamados)', () => {
  /** O chamado 1042 que guarda os nomes dos arquivos enviados e as notas. */
  function servidorDosAnexos() {
    const nomes: (string | null)[] = [];
    const notas: unknown[] = [];
    const { servidor } = servidorDoCampo(NAO_ENCONTRADO);
    abrirOChamado({
      ...servidor,
      'POST /api/chamados/anexos': (pedido) => {
        const nome = new URL(pedido.url).searchParams.get('nome');
        nomes.push(nome);
        return Response.json(
          { id: `a-${nomes.length}`, nome, tipo: 'image/png', bytes: 2048 },
          { status: 201 },
        );
      },
      'POST /api/chamados/1042/nota': async (pedido) => {
        notas.push(await pedido.json());
        return Response.json({
          numero: 1042,
          versao: 4,
          situacao: 'em-atendimento',
          responsavel: { id: ANA.conta, nome: ANA.nome },
        });
      },
    });
    return { nomes, notas };
  }

  it('o print colado na nota, sem escrever, vai só com ele pelo Ctrl+Enter', async () => {
    const { nomes, notas } = servidorDosAnexos();
    await caixa();
    fireEvent.click(screen.getByRole('radio', { name: 'Nota interna' }));
    const nota = await screen.findByRole('textbox', { name: 'Nota interna' });
    const print = new File([new Uint8Array(2048)], 'image.png', { type: 'image/png' });
    const colou = fireEvent.paste(nota, {
      clipboardData: { files: [print], getData: () => '' },
    });
    expect(colou).toBe(false);
    // As 09:40 de São Paulo, o fuso da conta.
    expect(await screen.findByText('Imagem colada 11-11-2026 09.40.00.png')).toBeTruthy();
    expect(nomes).toEqual(['Imagem colada 11-11-2026 09.40.00.png']);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar a nota' }).hasAttribute('disabled')).toBe(
        false,
      ),
    );
    fireEvent.keyDown(nota, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(notas).toEqual([{ texto: '', anexos: ['a-1'] }]));
  });

  it('o arquivo solto sobre a conversa do chamado entra no campo', async () => {
    const { nomes } = servidorDosAnexos();
    await caixa();
    const conversa = screen.getByRole('region', { name: 'Conversa' });
    const pdf = new File(['%PDF-1.7'], 'orcamento.pdf', { type: 'application/pdf' });
    const arrasto = {
      dataTransfer: {
        types: ['Files'],
        items: [{ kind: 'file', type: pdf.type, getAsFile: () => pdf }],
        effectAllowed: 'all',
      },
    };
    expect(fireEvent.dragEnter(conversa, arrasto)).toBe(false);
    expect(fireEvent.dragOver(conversa, arrasto)).toBe(false);
    expect(await screen.findByText('Solte para anexar')).toBeTruthy();
    expect(fireEvent.drop(conversa, arrasto)).toBe(false);
    expect(await screen.findByText('orcamento.pdf')).toBeTruthy();
    expect(nomes).toEqual(['orcamento.pdf']);
  });
});
