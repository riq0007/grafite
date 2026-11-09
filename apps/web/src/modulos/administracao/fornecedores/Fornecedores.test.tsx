import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

// A seção Fornecedores da Administração (spec modulo-administracao, "Tela de fornecedores", e
// fornecedores; change p4a-fornecedores, design, decisões 6 e 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Fornecedor = components['schemas']['Fornecedor'];

const fornecedor = (id: string, nome: string, extras: Partial<Fornecedor> = {}): Fornecedor => ({
  id,
  nome,
  cnpj: null,
  contato: null,
  email: null,
  telefone: null,
  observacoes: null,
  situacao: 'ativo',
  criadoEm: '2026-10-14T12:00:00.000Z',
  atualizadoEm: '2026-10-14T12:00:00.000Z',
  ...extras,
});

const HP = fornecedor('hp', 'HP Brasil', {
  cnpj: '12.345.678/0001-95',
  contato: 'Marina Lopes',
  email: 'vendas@hp.com.br',
  telefone: '(11) 4004-0000',
});
const LOCADORA = fornecedor('locadora', 'Locadora Norte', { contato: 'Carlos' });
const ANTIGA = fornecedor('antiga', 'Assistência Antiga', { situacao: 'inativo' });
/** O id que o servidor do teste dá ao fornecedor cadastrado. */
const CRIADO = 'locadora-sul';

const problema = (status: number, detalhe: string, campos?: object) =>
  Response.json(
    {
      type: 'urn:grafite:problema:conflito',
      title: 'Conflito',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos && { campos }),
    },
    { status },
  );

/** Os fornecedores no servidor do teste: a lista filtra pela busca e pela situação, como a API. */
function servidorDosFornecedores(
  inicial: Fornecedor[],
  { editar = true, ativos = 8 }: { editar?: boolean; ativos?: number | null } = {},
) {
  const estado = { fornecedores: [...inicial] };
  const corpos: Record<string, unknown[]> = {};
  const guardar = (caminho: string, corpo: unknown) => {
    corpos[caminho] = [...(corpos[caminho] ?? []), corpo];
  };
  const ficha = (atual: Fornecedor) => Response.json({ ...atual, permite: { editar } });
  const trocar = (id: string, mudanca: Partial<Fornecedor>) => {
    estado.fornecedores = estado.fornecedores.map((atual) =>
      atual.id === id ? { ...atual, ...mudanca } : atual,
    );
    return estado.fornecedores.find((atual) => atual.id === id) as Fornecedor;
  };
  const lista = vi.fn((pedido: Request) => {
    const parametros = new URL(pedido.url).searchParams;
    const busca = parametros.get('busca')?.toLowerCase() ?? '';
    const digitos = busca.replace(/\D/g, '');
    const situacao = parametros.get('situacao') ?? 'ativos';
    const itens = estado.fornecedores.filter(
      (atual) =>
        (situacao === 'todos' || (situacao === 'ativos') === (atual.situacao === 'ativo')) &&
        (busca === '' ||
          atual.nome.toLowerCase().includes(busca) ||
          (digitos !== '' && (atual.cnpj ?? '').replace(/\D/g, '').startsWith(digitos))),
    );
    return Response.json({
      itens,
      total: itens.length,
      proximo: null,
      permite: { cadastrar: editar },
    });
  });
  const servidor: ServidorDeTeste = {
    'GET /api/fornecedores': lista,
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
    'POST /api/fornecedores': async (pedido) => {
      const corpo = (await pedido.json()) as Partial<Fornecedor>;
      guardar('POST /api/fornecedores', corpo);
      if (corpo.nome?.toLowerCase() === 'hp brasil') {
        return problema(409, 'Já existe um fornecedor com este nome.', {
          nome: 'Já existe um fornecedor com este nome.',
        });
      }
      const criado = fornecedor(CRIADO, corpo.nome ?? '', {
        cnpj: corpo.cnpj ? '12.345.678/0001-95' : null,
        contato: corpo.contato ?? null,
      });
      estado.fornecedores = [...estado.fornecedores, criado];
      return Response.json({ ...criado, permite: { editar: true } }, { status: 201 });
    },
    [`GET /api/fornecedores/${CRIADO}`]: () =>
      ficha(estado.fornecedores.find((outro) => outro.id === CRIADO) as Fornecedor),
    [`GET /api/fornecedores/${CRIADO}/ativos`]: () => Response.json({ ativos: 0 }),
  };
  for (const atual of inicial) {
    const caminho = `/api/fornecedores/${atual.id}`;
    servidor[`GET ${caminho}`] = () =>
      ficha(estado.fornecedores.find((outro) => outro.id === atual.id) as Fornecedor);
    servidor[`GET ${caminho}/ativos`] = () => Response.json({ ativos });
    servidor[`PATCH ${caminho}`] = async (pedido) => {
      const corpo = (await pedido.json()) as Partial<Fornecedor>;
      guardar(`PATCH ${caminho}`, corpo);
      return ficha(trocar(atual.id, { ...corpo, cnpj: atual.cnpj }));
    };
    servidor[`POST ${caminho}/inativacao`] = () => {
      guardar(`POST ${caminho}/inativacao`, null);
      return ficha(trocar(atual.id, { situacao: 'inativo' }));
    };
    servidor[`POST ${caminho}/reativacao`] = () => {
      guardar(`POST ${caminho}/reativacao`, null);
      return ficha(trocar(atual.id, { situacao: 'ativo' }));
    };
  }
  return { servidor, estado, corpos, lista };
}

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[] = naOrganizacao(
    'fornecedores.ver',
    'fornecedores.editar',
    'ativos.ver',
  ),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const campo = (rotulo: string) =>
  screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement | HTMLTextAreaElement;
const linhasDaTabela = async () =>
  within(await screen.findByRole('grid', { name: 'Fornecedores' }))
    .getAllByRole('row')
    .slice(1)
    .map((linha) => linha.textContent);
const titulo = (nome: string | RegExp) => screen.findByRole('heading', { level: 1, name: nome });

describe('lista de fornecedores', () => {
  it('mostra os ativos pelo nome, com o CNPJ, o contato, o e-mail e o telefone; a situação mostra os inativos', async () => {
    const { servidor } = servidorDosFornecedores([HP, LOCADORA, ANTIGA]);
    const roteador = abrir('/administracao/fornecedores', servidor);
    const tabela = await screen.findByRole('grid', { name: 'Fornecedores' });
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((coluna) => coluna.textContent),
    ).toEqual(['Nome', 'CNPJ', 'Contato', 'E-mail', 'Telefone', 'Situação']);
    expect(await linhasDaTabela()).toEqual([
      'HP Brasil12.345.678/0001-95Marina Lopesvendas@hp.com.br(11) 4004-0000Ativo',
      'Locadora Norte—Carlos——Ativo',
    ]);
    expect(screen.getByText('2 fornecedores')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Inativos' }));
    await waitFor(async () =>
      expect(await linhasDaTabela()).toEqual(['Assistência Antiga————Inativo']),
    );
    expect(roteador.state.location.search).toEqual({ situacao: 'inativos' });
    fireEvent.click(await screen.findByText('Assistência Antiga'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/fornecedores/antiga'),
    );
  });

  it('sem nenhum fornecedor, diz isso e oferece o primeiro cadastro', async () => {
    const { servidor } = servidorDosFornecedores([]);
    const roteador = abrir('/administracao/fornecedores', servidor);
    expect(await screen.findByText('Nenhum fornecedor ainda.')).toBeTruthy();
    const botoes = screen.getAllByRole('button', { name: 'Novo fornecedor' });
    fireEvent.click(botoes[botoes.length - 1] as HTMLElement);
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/fornecedores/novo'),
    );
  });

  it('busca pelo nome e pelo começo do CNPJ, com a busca no endereço', async () => {
    const { servidor, lista } = servidorDosFornecedores([HP, LOCADORA]);
    const roteador = abrir('/administracao/fornecedores', servidor);
    await linhasDaTabela();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar fornecedores' }), {
      target: { value: '12.345.678' },
    });
    await waitFor(async () =>
      expect(await linhasDaTabela()).toEqual([
        'HP Brasil12.345.678/0001-95Marina Lopesvendas@hp.com.br(11) 4004-0000Ativo',
      ]),
    );
    expect(roteador.state.location.search).toEqual({ busca: '12.345.678' });
    const [ultimo] = lista.mock.calls.at(-1) ?? [];
    expect(new URL((ultimo as Request).url).searchParams.get('busca')).toBe('12.345.678');
  });

  it('sem nada encontrado, oferece limpar os filtros', async () => {
    const { servidor } = servidorDosFornecedores([HP]);
    abrir('/administracao/fornecedores?busca=xerox', servidor);
    expect(await screen.findByText('Nenhum fornecedor encontrado.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByText('HP Brasil')).toBeTruthy();
  });

  it('quem só vê não tem "Novo fornecedor"', async () => {
    const { servidor } = servidorDosFornecedores([HP], { editar: false });
    abrir('/administracao/fornecedores', servidor, naOrganizacao('fornecedores.ver'));
    expect(await screen.findByText('HP Brasil')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Novo fornecedor' })).toBeNull();
  });

  it('sem fornecedores.ver, a seção diz a quem pedir acesso, sem pedir a lista', async () => {
    const { servidor, lista } = servidorDosFornecedores([HP]);
    abrir('/administracao/fornecedores', servidor, naOrganizacao('pessoas.ver'));
    expect(await screen.findByText('Você não tem acesso a Fornecedores.')).toBeTruthy();
    expect(lista).not.toHaveBeenCalled();
  });
});

describe('o novo fornecedor', () => {
  it('cadastra com os dados conferidos e abre a ficha, com "Fornecedor cadastrado."', async () => {
    const { servidor, corpos } = servidorDosFornecedores([HP]);
    const roteador = abrir('/administracao/fornecedores/novo', servidor);
    await titulo('Novo fornecedor');
    fireEvent.change(campo('Nome'), { target: { value: '  Locadora   Sul ' } });
    fireEvent.change(campo('CNPJ'), { target: { value: '12.345.678/0001-95' } });
    fireEvent.change(campo('Contato'), { target: { value: 'Rita' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(avisos()).toContain('Fornecedor cadastrado.'));
    expect(corpos['POST /api/fornecedores']).toEqual([
      {
        nome: 'Locadora Sul',
        cnpj: '12345678000195',
        contato: 'Rita',
        email: null,
        telefone: null,
        observacoes: null,
      },
    ]);
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe(`/administracao/fornecedores/${CRIADO}`),
    );
    expect(await titulo(/Locadora Sul/)).toBeTruthy();
  });

  it('o CNPJ com o dígito errado e o e-mail ficam no campo, sem ir à API', async () => {
    const { servidor, corpos } = servidorDosFornecedores([]);
    abrir('/administracao/fornecedores/novo', servidor);
    await titulo('Novo fornecedor');
    fireEvent.change(campo('Nome'), { target: { value: 'Locadora Sul' } });
    fireEvent.change(campo('CNPJ'), { target: { value: '12.345.678/0001-96' } });
    fireEvent.change(campo('E-mail'), { target: { value: 'compras' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('CNPJ inválido: confira os 14 caracteres.')).toBeTruthy();
    expect(screen.getByText('Use um e-mail, como compras@empresa.com.br.')).toBeTruthy();
    expect(document.activeElement).toBe(campo('CNPJ'));
    expect(corpos['POST /api/fornecedores']).toBeUndefined();
  });

  it('o nome repetido que a API recusa fica no campo do nome', async () => {
    const { servidor } = servidorDosFornecedores([HP]);
    abrir('/administracao/fornecedores/novo', servidor);
    await titulo('Novo fornecedor');
    fireEvent.change(campo('Nome'), { target: { value: 'hp brasil' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já existe um fornecedor com este nome.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Novo fornecedor' })).toBeTruthy();
  });
});

describe('a ficha do fornecedor', () => {
  it('mostra o nome e a situação no título, salva a edição e diz "Fornecedor salvo."', async () => {
    const { servidor, corpos } = servidorDosFornecedores([HP]);
    abrir('/administracao/fornecedores/hp', servidor);
    const cabecalho = await titulo(/HP Brasil/);
    expect(cabecalho.textContent).toContain('Ativo');
    expect(campo('CNPJ').value).toBe('12.345.678/0001-95');
    fireEvent.change(campo('Telefone'), { target: { value: '(11) 4004-1111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(avisos()).toContain('Fornecedor salvo.'));
    expect(corpos['PATCH /api/fornecedores/hp']).toEqual([
      {
        nome: 'HP Brasil',
        cnpj: '12345678000195',
        contato: 'Marina Lopes',
        email: 'vendas@hp.com.br',
        telefone: '(11) 4004-1111',
        observacoes: null,
      },
    ]);
  });

  it('inativa com a confirmação e reativa, com os retornos', async () => {
    const { servidor, corpos } = servidorDosFornecedores([LOCADORA]);
    abrir('/administracao/fornecedores/locadora', servidor);
    await titulo(/Locadora Norte/);
    fireEvent.click(screen.getByRole('button', { name: 'Inativar fornecedor' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar o fornecedor Locadora Norte?',
    });
    expect(confirmacao.textContent).toContain(
      'O fornecedor continua nos registros que já apontam para ele, mas não pode mais ser escolhido.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar fornecedor' }));
    await waitFor(() => expect(avisos()).toContain('Fornecedor inativado.'));
    expect((await titulo(/Locadora Norte/)).textContent).toContain('Inativo');

    fireEvent.click(await screen.findByRole('button', { name: 'Reativar fornecedor' }));
    await waitFor(() => expect(avisos()).toContain('Fornecedor reativado.'));
    expect(corpos['POST /api/fornecedores/locadora/inativacao']).toHaveLength(1);
    expect(corpos['POST /api/fornecedores/locadora/reativacao']).toHaveLength(1);
  });

  it('quem só vê vê os dados, sem "Salvar alterações", "Inativar fornecedor" nem "Novo fornecedor"', async () => {
    const { servidor } = servidorDosFornecedores([HP], { editar: false });
    abrir('/administracao/fornecedores/hp', servidor, naOrganizacao('fornecedores.ver'));
    await titulo(/HP Brasil/);
    expect(screen.getByText('12.345.678/0001-95')).toBeTruthy();
    expect(screen.getByText('Marina Lopes')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const nome of ['Salvar alterações', 'Inativar fornecedor', 'Novo fornecedor']) {
      expect(screen.queryByRole('button', { name: nome })).toBeNull();
    }
    // Os dados na lista de dados (spec componentes-base, "Lista de dados"): termo e definição.
    const termos = screen.getAllByRole('term');
    expect(termos.map((termo) => termo.textContent)).toEqual([
      'CNPJ',
      'Contato',
      'E-mail',
      'Telefone',
      'Observações',
      'Cadastrado em',
    ]);
    for (const termo of termos) expect(termo.closest('[data-lista-de-dados]')).toBeTruthy();
  });

  it('mostra "Ativos deste fornecedor" com "Ver na tabela", que abre a tabela com a origem', async () => {
    const { servidor } = servidorDosFornecedores([HP]);
    abrir('/administracao/fornecedores/hp', servidor);
    expect(await screen.findByText('Ativos deste fornecedor: 8')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Ver na tabela' });
    expect(link.getAttribute('href')).toBe('/ativos?origem=fornecedor%3Ahp');
  });

  it('sem ativos, diz que não há nenhum, e sem ver os ativos, a linha some', async () => {
    let { servidor } = servidorDosFornecedores([HP], { ativos: 0 });
    abrir('/administracao/fornecedores/hp', servidor);
    expect(await screen.findByText('Nenhum ativo deste fornecedor.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ver na tabela' })).toBeNull();
    cleanup();

    ({ servidor } = servidorDosFornecedores([HP], { ativos: null }));
    abrir(
      '/administracao/fornecedores/hp',
      servidor,
      naOrganizacao('fornecedores.ver', 'fornecedores.editar'),
    );
    await titulo(/HP Brasil/);
    expect(screen.queryByText(/Ativos deste fornecedor/)).toBeNull();
  });
});
