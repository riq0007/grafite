import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { type AvisosDaChegada, ProvedorDaChegada } from '../chegada/avisos.tsx';
import { criarRoteador } from '../rotas/arvore.ts';
import { criarLojaDaSessao, type LojaDaSessao } from './loja.ts';
import { pagina } from './pagina.ts';

const ORGANIZACAO = { nome: 'Empresa' };
const CONTA = { usuario: 'ana.souza', nome: 'Ana Souza' };
const sessao = (pendencia: string | null, csrf = 'csrf') => ({
  conta: CONTA,
  pendencia,
  csrf,
  expiraEm: '2099-01-01T00:00:00.000Z',
  acesso: { permissoes: [] },
});
const estado = (corpo: unknown) => () => Response.json({ organizacao: ORGANIZACAO, sessao: corpo });
const json = (corpo: unknown) => () => Response.json(corpo);
const vazia = () => new Response(null, { status: 204 });
const problema = (status: number, codigo: string) => () =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: 'Este endereço não pertence a nenhuma organização.',
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

type Passo = [caminho: string, resposta: () => Response];

let lojas: LojaDaSessao[] = [];
let pedidos: Request[] = [];

/** Um servidor que espera os pedidos na ordem dada e responde a cada um. */
function servidor(...passos: Passo[]) {
  return async (pedido: Request) => {
    const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
    // As notificações do sino, que a casca lê a cada sessão, ficam fora da ordem dos passos.
    if (caminho === 'GET /api/notificacoes') {
      return Response.json({ itens: [], naoLidas: 0, proximo: null });
    }
    pedidos.push(pedido);
    const passo = passos.shift();
    if (!passo) throw new Error(`Pedido a mais: ${caminho}.`);
    if (passo[0] !== caminho) throw new Error(`Esperava ${passo[0]}, e veio ${caminho}.`);
    return passo[1]();
  };
}

/** Abre o app como a chegada o deixa: a sessão já validada. */
async function abrir(
  passos: Passo[],
  { avisos, endereco = '/' }: { avisos?: AvisosDaChegada; endereco?: string } = {},
) {
  const loja = criarLojaDaSessao({ buscar: servidor(...passos) });
  lojas.push(loja);
  await loja.validar();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  const app = <App roteador={roteador} sessao={loja} />;
  render(avisos ? <ProvedorDaChegada avisos={avisos}>{app}</ProvedorDaChegada> : app);
  return { loja, roteador };
}

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });
/** A tela de entrada; com a casca coberta, o menu dela também se chama "Usuário". */
const naEntrada = () =>
  within(document.querySelector<HTMLElement>('[data-tela-de-entrada]') ?? document.body);
const preencher = (rotulo: string, valor: string) =>
  fireEvent.change(naEntrada().getByLabelText(rotulo), { target: { value: valor } });
const tocar = (nome: string) => fireEvent.click(naEntrada().getByRole('button', { name: nome }));
const corpoDe = (caminho: string) =>
  pedidos.find((pedido) => `${pedido.method} ${new URL(pedido.url).pathname}` === caminho)?.json();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const loja of lojas) loja.parar();
  lojas = [];
  pedidos = [];
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

describe('a porta', () => {
  it('sem sessão, mostra só a entrada, e a casca não monta', async () => {
    await abrir([['GET /api/sessao', estado(null)]]);
    expect(await titulo('Entrar')).toBeTruthy();
    expect(screen.getByText('Empresa')).toBeTruthy();
    expect(screen.getByLabelText('Usuário')).toBeTruthy();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Dock' })).toBeNull();
    expect(screen.queryByText('Ambiente de teste')).toBeNull();
  });

  it('no ambiente de teste, a entrada avisa acima do formulário', async () => {
    await abrir([
      [
        'GET /api/sessao',
        json({
          ambiente: 'teste',
          organizacao: { ...ORGANIZACAO, operaOServidor: false },
          sessao: null,
        }),
      ],
    ]);
    await titulo('Entrar');
    const aviso = screen.getByText('Ambiente de teste');
    expect(
      screen.getByText(
        'Os dados são uma cópia da produção. O que mudar aqui não vai para a produção.',
      ),
    ).toBeTruthy();
    expect(
      aviso.compareDocumentPosition(screen.getByLabelText('Usuário')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('avisa a chegada de que a entrada se desenhou', async () => {
    const telaDesenhada = vi.fn();
    await abrir([['GET /api/sessao', estado(null)]], {
      avisos: { preferenciasAplicadas: () => {}, telaDesenhada },
    });
    await titulo('Entrar');
    expect(telaDesenhada).toHaveBeenCalledWith('entrada');
    expect(telaDesenhada).not.toHaveBeenCalledWith('casca');
  });

  it('com a sessão valendo, abre a casca', async () => {
    await abrir([['GET /api/sessao', estado(sessao(null))]]);
    expect(await titulo('O que resolver agora')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).toBeNull();
  });

  it('usuário e senha, depois o código, e a casca', async () => {
    await abrir([
      ['GET /api/sessao', estado(null)],
      ['POST /api/sessao', estado(sessao('segundo-passo'))],
      ['POST /api/sessao/segundo-passo', estado(sessao(null))],
    ]);
    await titulo('Entrar');
    preencher('Usuário', 'ana.souza');
    preencher('Senha', 'cavalo bateria grampo');
    tocar('Entrar');
    await screen.findByLabelText('Código do app');
    expect(await corpoDe('POST /api/sessao')).toEqual({
      usuario: 'ana.souza',
      senha: 'cavalo bateria grampo',
    });
    preencher('Código do app', '287082');
    tocar('Continuar');
    expect(await titulo('O que resolver agora')).toBeTruthy();
    expect(await corpoDe('POST /api/sessao/segundo-passo')).toEqual({ codigo: '287082' });
  });

  it.each([
    [9, 'info', 'Restam 9 códigos de recuperação.'],
    [1, 'info', 'Resta 1 código de recuperação.'],
    [0, 'atencao', 'Este era o seu último código de recuperação. Gere novos na sua conta.'],
  ])(
    'com um código de recuperação e %i restantes, avisa quantos restam',
    async (restantes, situacao, texto) => {
      await abrir([
        ['GET /api/sessao', estado(sessao('segundo-passo'))],
        [
          'POST /api/sessao/segundo-passo',
          json({ organizacao: ORGANIZACAO, sessao: sessao(null), codigosRestantes: restantes }),
        ],
      ]);
      tocar('Usar um código de recuperação');
      preencher('Código de recuperação', 'a7k2m-9qx4t');
      tocar('Continuar');
      await titulo('O que resolver agora');
      expect(filaDeAvisos.naTela.map(({ aviso }) => [aviso.situacao, aviso.titulo])).toContainEqual(
        [situacao, texto],
      );
    },
  );

  it('a senha temporária, a senha nova, o cadastro dos dois passos, os códigos, e a casca', async () => {
    await abrir([
      ['GET /api/sessao', estado(null)],
      ['POST /api/sessao', estado(sessao('trocar-senha'))],
      [
        'PUT /api/conta/senha',
        json({
          organizacao: ORGANIZACAO,
          sessao: sessao('cadastrar-dois-passos'),
          sessoesEncerradas: 0,
        }),
      ],
      [
        'POST /api/conta/dois-passos/cadastro',
        json({ chave: 'GEZD GNBV', uri: 'otpauth://totp/x' }),
      ],
      [
        'POST /api/conta/dois-passos/confirmacao',
        json({
          organizacao: ORGANIZACAO,
          sessao: sessao(null),
          codigosDeRecuperacao: ['a7k2m-9qx4t', 'b3n8p-2wr6v'],
          sessoesEncerradas: 0,
        }),
      ],
    ]);
    await titulo('Entrar');
    preencher('Usuário', 'ana.souza');
    preencher('Senha', 'K7QM-2XWT-9HDP-4RVN');
    tocar('Entrar');
    await screen.findByLabelText('Senha nova');
    // A senha temporária já foi digitada nesta entrada: a tela não a pede de novo.
    expect(screen.queryByLabelText('Senha temporária')).toBeNull();
    preencher('Senha nova', 'cavalo bateria grampo correto');
    preencher('Confirmar a senha nova', 'cavalo bateria grampo correto');
    tocar('Trocar a senha');
    expect(await titulo('Cadastre a verificação em dois passos')).toBeTruthy();
    expect(await corpoDe('PUT /api/conta/senha')).toEqual({
      senhaAtual: 'K7QM-2XWT-9HDP-4RVN',
      senhaNova: 'cavalo bateria grampo correto',
    });
    expect(screen.getByText('GEZD GNBV')).toBeTruthy();
    preencher('Código do app', '287082');
    tocar('Ativar');
    expect(await titulo('Guarde os códigos de recuperação')).toBeTruthy();
    const lista = screen.getByRole('list', { name: 'Códigos de recuperação' });
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['a7k2m-9qx4t', 'b3n8p-2wr6v']);
    // Só "Continuar" leva à casca, que ainda não montou.
    expect(screen.queryByRole('banner')).toBeNull();
    tocar('Continuar');
    expect(await titulo('O que resolver agora')).toBeTruthy();
  });

  it('a senha nova recusada pela regra não sai, e o motivo aparece', async () => {
    await abrir([['GET /api/sessao', estado(sessao('trocar-senha'))]]);
    preencher('Senha temporária', 'K7QM-2XWT-9HDP-4RVN');
    preencher('Senha nova', 'curta');
    preencher('Confirmar a senha nova', 'curta');
    tocar('Trocar a senha');
    expect(await screen.findByText('Use pelo menos 12 caracteres.')).toBeTruthy();
    expect(pedidos).toHaveLength(1);
  });

  it('"Sair" num passo pendente encerra a sessão e volta ao usuário e senha', async () => {
    await abrir([
      ['GET /api/sessao', estado(sessao('segundo-passo'))],
      ['DELETE /api/sessao', vazia],
    ]);
    await screen.findByLabelText('Código do app');
    tocar('Sair');
    expect(await titulo('Entrar')).toBeTruthy();
    expect(screen.getByLabelText('Usuário')).toBeTruthy();
    expect(pedidos.at(-1)?.method).toBe('DELETE');
  });

  it('o cadastro que não começa diz o motivo e deixa tentar de novo', async () => {
    await abrir([
      ['GET /api/sessao', estado(sessao('cadastrar-dois-passos'))],
      ['POST /api/conta/dois-passos/cadastro', () => Response.error()],
      ['POST /api/conta/dois-passos/cadastro', json({ chave: 'GEZD GNBV', uri: 'otpauth://x' })],
    ]);
    expect(await screen.findByText('Sem conexão com o servidor. Tente de novo.')).toBeTruthy();
    tocar('Tentar de novo');
    expect(await titulo('Cadastre a verificação em dois passos')).toBeTruthy();
  });

  it('o endereço desconhecido mostra a explicação, sem os campos', async () => {
    await abrir([['GET /api/sessao', problema(404, 'endereco-desconhecido')]]);
    expect(await titulo('Endereço desconhecido')).toBeTruthy();
    expect(
      screen.getByText(
        'Este endereço não está ligado a nenhuma organização do Grafite. Confira o endereço com a TI.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Usuário')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });
});

describe('a sessão que termina no meio do uso', () => {
  /** Um pedido de um módulo recebe `sem-sessao`. */
  const terminar = (loja: LojaDaSessao) =>
    act(async () => {
      await loja.cliente.GET('/conta');
    });
  const semRede = (): Response => {
    throw new TypeError('Failed to fetch');
  };

  it('a resposta sem-sessao cobre a casca, que fica inerte, e a entrada traz o usuário', async () => {
    const { loja } = await abrir(
      [
        ['GET /api/sessao', estado(sessao(null))],
        ['GET /api/conta', problema(401, 'sem-sessao')],
      ],
      { endereco: '/ajustes' },
    );
    const barra = await screen.findByRole('banner');
    await terminar(loja);
    expect(await titulo('Entrar')).toBeTruthy();
    expect(screen.getByText('Sua sessão terminou. Entre de novo para continuar.')).toBeTruthy();
    expect(naEntrada().getByLabelText('Usuário')).toHaveProperty('value', 'ana.souza');
    expect(naEntrada().getByLabelText('Senha')).toBe(document.activeElement);
    // A casca continua montada, escondida e fora do alcance do teclado e do leitor de tela.
    expect(barra.isConnected).toBe(true);
    expect(barra.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('a mesma conta volta à casca, no mesmo endereço e no mesmo estado', async () => {
    const { loja, roteador } = await abrir(
      [
        ['GET /api/sessao', estado(sessao(null))],
        ['GET /api/conta', problema(401, 'sem-sessao')],
        ['POST /api/sessao', estado(sessao(null, 'csrf-novo'))],
      ],
      { endereco: '/ajustes' },
    );
    const barra = await screen.findByRole('banner');
    const endereco = roteador.state.location.href;
    await terminar(loja);
    await titulo('Entrar');
    preencher('Senha', 'cavalo bateria grampo');
    tocar('Entrar');
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Entrar' })).toBeNull());
    expect(screen.getByRole('banner')).toBe(barra);
    expect(barra.closest('[inert]')).toBeNull();
    expect(roteador.state.location.href).toBe(endereco);
  });

  it('outra conta recarrega a página, sem mostrar a casca da anterior', async () => {
    const recarregar = vi.spyOn(pagina, 'recarregar').mockImplementation(() => {});
    const { loja } = await abrir([
      ['GET /api/sessao', estado(sessao(null))],
      ['GET /api/conta', problema(401, 'sem-sessao')],
      [
        'POST /api/sessao',
        estado({ ...sessao(null), conta: { usuario: 'bruno.lima', nome: 'Bruno Lima' } }),
      ],
    ]);
    const barra = await screen.findByRole('banner');
    await terminar(loja);
    await titulo('Entrar');
    preencher('Usuário', 'bruno.lima');
    preencher('Senha', 'outra senha qualquer');
    tocar('Entrar');
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
    expect(barra.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('a sessão desconhecida que, ao validar, não vale mais cobre a casca; e qualquer conta a tira', async () => {
    const recarregar = vi.spyOn(pagina, 'recarregar').mockImplementation(() => {});
    await abrir([
      ['GET /api/sessao', semRede],
      ['GET /api/sessao', estado(null)],
      ['POST /api/sessao', estado(sessao(null))],
    ]);
    const barra = await screen.findByRole('banner');
    window.dispatchEvent(new Event('online'));
    expect(await titulo('Entrar')).toBeTruthy();
    expect(barra.closest('[inert]')).not.toBeNull();
    expect(screen.queryByText('Sua sessão terminou. Entre de novo para continuar.')).toBeNull();
    // A casca abriu sem servidor, sem dado de conta nenhuma: quem entrar fica com ela.
    preencher('Usuário', 'ana.souza');
    preencher('Senha', 'cavalo bateria grampo');
    tocar('Entrar');
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Entrar' })).toBeNull());
    expect(screen.getByRole('banner')).toBe(barra);
    expect(recarregar).not.toHaveBeenCalled();
  });
});

describe('a pendência que surge com a casca aberta', () => {
  it('cobre a casca com o cadastro e a mensagem da exigência; vistos os códigos, a casca volta como estava', async () => {
    const { loja, roteador } = await abrir(
      [
        ['GET /api/sessao', estado(sessao(null))],
        ['GET /api/conta', problema(403, 'pendencia')],
        ['GET /api/sessao', estado(sessao('cadastrar-dois-passos'))],
        [
          'POST /api/conta/dois-passos/cadastro',
          json({ chave: 'GEZD GNBV', uri: 'otpauth://totp/x' }),
        ],
        [
          'POST /api/conta/dois-passos/confirmacao',
          json({
            organizacao: ORGANIZACAO,
            sessao: sessao(null, 'csrf-novo'),
            codigosDeRecuperacao: ['a7k2m-9qx4t', 'b3n8p-2wr6v'],
            sessoesEncerradas: 0,
          }),
        ],
      ],
      { endereco: '/ajustes' },
    );
    const barra = await screen.findByRole('banner');
    const endereco = roteador.state.location.href;
    // Um módulo pede algo, e a API recusa pela pendência que acabou de surgir.
    await act(async () => {
      await loja.cliente.GET('/conta');
    });
    expect(await titulo('Cadastre a verificação em dois passos')).toBeTruthy();
    expect(
      naEntrada().getByText('A verificação em dois passos passou a ser exigida para a sua conta.'),
    ).toBeTruthy();
    expect(barra.isConnected).toBe(true);
    expect(barra.closest('[inert]')).not.toBeNull();
    await naEntrada().findByText('GEZD GNBV');
    preencher('Código do app', '287082');
    tocar('Ativar');
    expect(await titulo('Guarde os códigos de recuperação')).toBeTruthy();
    tocar('Continuar');
    await vi.waitFor(() => expect(barra.closest('[inert]')).toBeNull());
    expect(screen.getByRole('banner')).toBe(barra);
    expect(roteador.state.location.href).toBe(endereco);
  });
});
