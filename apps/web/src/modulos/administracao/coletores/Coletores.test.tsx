import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Coletor = components['schemas']['Coletor'];

const MINUTO = 60_000;
const TOKEN = 'tK3x9Qw2Lm7Rv5Zp8Yc1Nb4Hd6Fg0Js2Ua7Ie3Ok9Pq'; // gitleaks:allow: token fictício do teste
const antes = (minutos: number) => new Date(Date.now() - minutos * MINUTO).toISOString();

const coletor = (id: string, nome: string, extras: Partial<Coletor> = {}): Coletor => ({
  id,
  nome,
  faixas: ['10.0.0.0/24'],
  situacao: 'ativo',
  ultimoContatoEm: antes(2),
  versao: '0.3.0',
  criadoEm: '2026-10-01T12:00:00.000Z',
  ...extras,
});

const CAMPINAS = coletor('campinas', 'Coletor de Campinas', { ultimoContatoEm: antes(25) });
const JUNDIAI = coletor('jundiai', 'Coletor de Jundiaí', {
  faixas: ['10.0.0.0/24', '10.0.5.0/24'],
});
const SERVIDOR = coletor('servidor', 'Servidor', {
  faixas: [],
  ultimoContatoEm: null,
  versao: null,
});
const ANTIGO = coletor('antigo', 'Coletor antigo', {
  situacao: 'inativo',
  ultimoContatoEm: antes(3 * 24 * 60),
});

const problema = (status: number, codigo: string, detalhe: string, campos?: object) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos && { campos }),
    },
    { status },
  );

/** Os coletores no servidor do teste: a lista devolve o estado, e as ações o mudam. */
function servidorDosColetores(inicial: Coletor[]) {
  const estado = { coletores: inicial };
  const corpos: Record<string, unknown[]> = {};
  const lista = vi.fn(() =>
    Response.json({ coletores: estado.coletores, permite: { cadastrar: true } }),
  );
  const guardar = async (pedido: Request) => {
    const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
    const texto = await pedido.text();
    corpos[caminho] = [...(corpos[caminho] ?? []), texto ? JSON.parse(texto) : null];
  };
  const trocar = (novo: Coletor) => {
    estado.coletores = estado.coletores.map((atual) => (atual.id === novo.id ? novo : atual));
    return novo;
  };
  const servidor: ServidorDeTeste = {
    'GET /api/coletores': lista,
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  for (const atual of inicial) {
    const caminho = `/api/coletores/${atual.id}`;
    servidor[`PATCH ${caminho}`] = async (pedido) => {
      await guardar(pedido.clone());
      const corpo = (await pedido.json()) as Partial<Coletor>;
      const antes = estado.coletores.find((c) => c.id === atual.id) as Coletor;
      return Response.json(trocar({ ...antes, ...corpo }));
    };
    servidor[`POST ${caminho}/token`] = async (pedido) => {
      await guardar(pedido);
      const antes = estado.coletores.find((c) => c.id === atual.id) as Coletor;
      return Response.json({ coletor: antes, token: TOKEN });
    };
    servidor[`POST ${caminho}/inativacao`] = async (pedido) => {
      await guardar(pedido);
      const antes = estado.coletores.find((c) => c.id === atual.id) as Coletor;
      return Response.json(trocar({ ...antes, situacao: 'inativo' }));
    };
    servidor[`POST ${caminho}/reativacao`] = async (pedido) => {
      await guardar(pedido);
      const antes = estado.coletores.find((c) => c.id === atual.id) as Coletor;
      return Response.json(trocar({ ...antes, situacao: 'ativo' }));
    };
  }
  return { servidor, estado, corpos, lista };
}

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('coletores.administrar'),
  canal: CanalDeEventos = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const campo = (rotulo: string) =>
  screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement | HTMLTextAreaElement;
const linhasDaTabela = async () =>
  within(await screen.findByRole('grid', { name: 'Coletores' }))
    .getAllByRole('row')
    .slice(1);

describe('lista de coletores', () => {
  it('mostra os ativos com as faixas, o último contato, a versão e a situação; a linha abre a ficha', async () => {
    const { servidor } = servidorDosColetores([CAMPINAS, JUNDIAI, SERVIDOR, ANTIGO]);
    const roteador = abrir('/administracao/coletores', servidor);
    const tabela = await screen.findByRole('grid', { name: 'Coletores' });
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((coluna) => coluna.textContent),
    ).toEqual(['Nome', 'Faixas', 'Último contato', 'Versão', 'Situação']);
    const linhas = await linhasDaTabela();
    expect(linhas.map((linha) => linha.textContent)).toEqual([
      'Coletor de Campinas10.0.0.0/24Sem contato há 25 min0.3.0Ativo',
      'Coletor de Jundiaí10.0.0.0/24, 10.0.5.0/24Há 2 min0.3.0Ativo',
      'ServidorNenhuma faixaSem contato ainda—Ativo',
    ]);
    // O coletor parado chama a atenção com o ícone e o texto, não só pela cor.
    const parado = within(linhas[0] as HTMLElement).getByText('Sem contato há 25 min');
    expect(parado.closest('[data-situacao]')?.getAttribute('data-situacao')).toBe('atencao');

    fireEvent.click(screen.getByRole('radio', { name: 'Inativos' }));
    await waitFor(async () =>
      expect((await linhasDaTabela()).map((linha) => linha.textContent)).toEqual([
        'Coletor antigo10.0.0.0/24Há 3 d0.3.0Inativo',
      ]),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }));
    fireEvent.click(await screen.findByText('Coletor de Jundiaí'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/coletores/jundiai'),
    );
  });

  it('sem nenhum coletor, diz isso e oferece o primeiro cadastro', async () => {
    const { servidor } = servidorDosColetores([]);
    const roteador = abrir('/administracao/coletores', servidor);
    expect(await screen.findByText('Nenhum coletor ainda.')).toBeTruthy();
    const botoes = screen.getAllByRole('button', { name: 'Novo coletor' });
    fireEvent.click(botoes[botoes.length - 1] as HTMLElement);
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/coletores/novo'),
    );
  });

  it('sem coletores.administrar, a seção diz a quem pedir acesso, sem pedir a lista', async () => {
    const { servidor, lista } = servidorDosColetores([JUNDIAI]);
    abrir('/administracao/coletores', servidor, naOrganizacao('pessoas.ver'));
    expect(await screen.findByText('Você não tem acesso a Coletores.')).toBeTruthy();
    expect(lista).not.toHaveBeenCalled();
  });

  it('a idade anda na virada do minuto, e a lista é relida a cada 60 s', async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    vi.setSystemTime(new Date('2026-10-12T12:00:00.000Z'));
    const { servidor, lista } = servidorDosColetores([
      coletor('jundiai', 'Coletor de Jundiaí', {
        ultimoContatoEm: new Date('2026-10-12T11:35:00.000Z').toISOString(),
      }),
    ]);
    abrir('/administracao/coletores', servidor);
    expect(await screen.findByText('Sem contato há 25 min')).toBeTruthy();
    const pedidos = lista.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(await screen.findByText('Sem contato há 26 min')).toBeTruthy();
    expect(lista.mock.calls.length).toBeGreaterThan(pedidos);
  });

  it('o evento coletores.mudaram relê a lista', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDosColetores([JUNDIAI]);
    abrir('/administracao/coletores', servidor, undefined, canal);
    await screen.findByText('Coletor de Jundiaí');
    estado.coletores = [{ ...JUNDIAI, nome: 'Coletor de Jundiaí 2' }];
    canal.publicar({
      id: 'e1',
      tipo: 'coletores.mudaram',
      momento: '2026-10-12T12:00:00.000Z',
      alvo: { tipo: 'coletor', id: 'jundiai' },
    });
    expect(await screen.findByText('Coletor de Jundiaí 2')).toBeTruthy();
  });
});

describe('coletor novo', () => {
  it('cadastra com o nome e as faixas, mostra o token uma vez, com "Copiar", e abre a ficha', async () => {
    const corpos: unknown[] = [];
    const { servidor, estado } = servidorDosColetores([]);
    servidor['POST /api/coletores'] = async (pedido) => {
      corpos.push(await pedido.json());
      estado.coletores = [JUNDIAI];
      return Response.json({ coletor: JUNDIAI, token: TOKEN }, { status: 201 });
    };
    const roteador = abrir('/administracao/coletores/novo', servidor);
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o nome do coletor.')).toBeTruthy();

    fireEvent.change(campo('Nome'), { target: { value: ' Coletor de Jundiaí ' } });
    fireEvent.change(campo('Faixas de rede'), {
      target: { value: '10.0.0.0/24\n10.0.0.300/24' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Use uma faixa como 10.0.0.0/24.')).toBeTruthy();
    expect(corpos).toEqual([]);

    fireEvent.change(campo('Faixas de rede'), {
      target: { value: '10.0.0.0/24\n\n 10.0.5.0/24 \n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Token do Coletor de Jundiaí' });
    expect(corpos).toEqual([
      { nome: 'Coletor de Jundiaí', faixas: ['10.0.0.0/24', '10.0.5.0/24'] },
    ]);
    expect(within(dialogo).getByText(TOKEN)).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Copiar' })).toBeTruthy();
    expect(within(dialogo).getByText('Copie o token agora: ele não aparece de novo.')).toBeTruthy();
    expect(avisos()).toContain('Coletor cadastrado.');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/coletores/jundiai'),
    );
    expect(await screen.findByRole('button', { name: 'Trocar o token' })).toBeTruthy();
    expect(screen.queryByText(TOKEN)).toBeNull();
  });

  it('o nome repetido aparece no campo, e o formulário continua preenchido', async () => {
    const { servidor } = servidorDosColetores([]);
    servidor['POST /api/coletores'] = () =>
      problema(409, 'conflito', 'Já existe um coletor com este nome.', {
        nome: 'Já existe um coletor com este nome.',
      });
    abrir('/administracao/coletores/novo', servidor);
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.change(campo('Nome'), { target: { value: 'coletor de jundiai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já existe um coletor com este nome.')).toBeTruthy();
    expect(campo('Nome').getAttribute('aria-invalid')).toBe('true');
    expect(campo('Nome').value).toBe('coletor de jundiai');
  });
});

describe('ficha do coletor', () => {
  it('mostra o contato, a versão e o cadastro, e salva o nome e as faixas', async () => {
    const { servidor, corpos } = servidorDosColetores([JUNDIAI]);
    abrir('/administracao/coletores/jundiai', servidor);
    const titulo = await screen.findByRole('heading', { level: 1, name: /Coletor de Jundiaí/ });
    expect(titulo.textContent).toContain('Ativo');
    expect(screen.getByText(/Há 2 min/)).toBeTruthy();
    expect(screen.getByText('0.3.0')).toBeTruthy();
    expect(campo('Faixas de rede').value).toBe('10.0.0.0/24\n10.0.5.0/24');
    fireEvent.change(campo('Faixas de rede'), { target: { value: '10.0.0.0/16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Coletor salvo.'));
    expect(corpos['PATCH /api/coletores/jundiai']).toEqual([
      { nome: 'Coletor de Jundiaí', faixas: ['10.0.0.0/16'] },
    ]);
  });

  it('"Trocar o token" pede confirmação e mostra o token novo uma vez', async () => {
    const { servidor, corpos } = servidorDosColetores([JUNDIAI]);
    abrir('/administracao/coletores/jundiai', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar o token' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Trocar o token do Coletor de Jundiaí?',
    });
    expect(confirmacao.textContent).toContain(
      'O token atual para de valer na hora, e o coletor que o usa para de coletar até receber o novo.',
    );
    expect(corpos['POST /api/coletores/jundiai/token']).toBeUndefined();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Trocar o token' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Token do Coletor de Jundiaí' });
    expect(within(dialogo).getByText(TOKEN)).toBeTruthy();
    expect(avisos()).toContain('Token trocado.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByText(TOKEN)).toBeNull());
  });

  it('inativa com confirmação, e reativa', async () => {
    const { servidor } = servidorDosColetores([JUNDIAI]);
    abrir('/administracao/coletores/jundiai', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar o Coletor de Jundiaí?',
    });
    expect(confirmacao.textContent).toContain(
      'O coletor para de coletar, e os ativos dele passam ao coletor que alcançar o IP deles.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar o coletor' }));
    await waitFor(() => expect(avisos()).toContain('Coletor inativado.'));
    const titulo = await screen.findByRole('heading', { level: 1, name: /Coletor de Jundiaí/ });
    await waitFor(() => expect(titulo.textContent).toContain('Inativo'));
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(avisos()).toContain('Coletor reativado.'));
    await waitFor(() => expect(titulo.textContent).toContain('Ativo'));
  });

  it('o coletor que não existe diz isso', async () => {
    const { servidor } = servidorDosColetores([JUNDIAI]);
    abrir('/administracao/coletores/outro', servidor);
    expect(await screen.findByText('Coletor não encontrado.')).toBeTruthy();
  });
});
