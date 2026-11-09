import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { nomesDasOpcoes } from '../../../teste/escolhas.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

beforeEach(() => {
  // O jsdom não cria endereços para os arquivos escolhidos; a prévia da imagem nova usa um.
  URL.createObjectURL = vi.fn(() => 'blob:previa');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Modelo = components['schemas']['Modelo'];
type Tipo = components['schemas']['TipoDeAtivo'];

const IMPRESSORA = { id: 'impressora', nome: 'Impressora', icone: 'impressora' } as const;
const CAMERA = { id: 'camera', nome: 'Câmera', icone: 'camera' } as const;

const tipoDeAtivo = (
  base: Pick<Tipo, 'id' | 'nome' | 'icone'>,
  situacao: Tipo['situacao'] = 'ativo',
): Tipo => ({
  ...base,
  capacidades: [],
  configuracaoDasCapacidades: {},
  primeiroCartao: null,
  campos: [],
  situacao,
  permite: { editar: true },
});

const TIPOS = [tipoDeAtivo(CAMERA, 'inativo'), tipoDeAtivo(IMPRESSORA)];

const modelo = (
  id: string,
  fabricante: string,
  nome: string,
  extras: Partial<Modelo> = {},
): Modelo => ({
  id,
  tipo: IMPRESSORA,
  fabricante,
  nome,
  imagem: null,
  situacao: 'ativo',
  permite: { editar: true },
  ...extras,
});

const M404 = modelo('m404', 'HP', 'LaserJet M404', { imagem: { id: 'img-1' } });
const C3010 = modelo('c3010', 'Ricoh', 'C3010');

const lista = (itens: Modelo[], proximo: string | null = null, total = itens.length) =>
  Response.json({ itens, proximo, total, permite: { cadastrar: true } });

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

/** O catálogo com os tipos e os modelos dados, e os parâmetros de cada leitura da lista. */
function catalogo(
  responder: (parametros: URLSearchParams) => Response = () => lista([M404, C3010]),
  extras: ServidorDeTeste = {},
) {
  const pedidos: URLSearchParams[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/tipos-de-ativo': () => Response.json({ tipos: TIPOS, permite: { cadastrar: true } }),
    'GET /api/modelos': (pedido) => {
      const parametros = new URL(pedido.url).searchParams;
      pedidos.push(parametros);
      return responder(parametros);
    },
    'GET /api/modelos/fabricantes': (pedido) => {
      const parametros = new URL(pedido.url).searchParams;
      const busca = parametros.get('busca') ?? '';
      // A Ricoh é a dos modelos de impressora; com o tipo, ela vem primeiro.
      const doTipo = parametros.get('tipo') === 'impressora' ? ['Ricoh'] : [];
      const achados = ['HP', 'Ricoh'].filter((nome) =>
        nome.toLowerCase().includes(busca.toLowerCase()),
      );
      return Response.json({
        fabricantes: [
          ...achados.filter((nome) => doTipo.includes(nome)),
          ...achados.filter((nome) => !doTipo.includes(nome)),
        ],
        doTipo: achados.filter((nome) => doTipo.includes(nome)),
      });
    },
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
    ...extras,
  };
  return { servidor, pedidos };
}

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('modelos.editar'),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const campoDeTexto = (rotulo: string) =>
  screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;
const tabela = () => screen.findByRole('grid', { name: 'Modelos' });
const linhas = async () =>
  within(await tabela())
    .getAllByRole('row')
    .slice(1);
const PNG = () => new File(['png'], 'impressora.png', { type: 'image/png' });

/** Escolhe o arquivo na escolha de imagem, como a escolha de arquivos do sistema. */
async function escolherArquivo(rotulo: string, arquivo: File) {
  const escolha = await screen.findByRole('group', { name: rotulo });
  const campoDeArquivo = escolha.querySelector('input[type="file"]') as HTMLElement;
  fireEvent.change(campoDeArquivo, { target: { files: [arquivo] } });
}

describe('lista de modelos', () => {
  it('mostra a imagem ou o ícone do tipo, o fabricante, o modelo, o tipo e a situação', async () => {
    const { servidor, pedidos } = catalogo();
    abrir('/gestao/catalogo/modelos', servidor);
    const grade = await tabela();
    expect(
      within(grade)
        .getAllByRole('columnheader')
        .map((coluna) => coluna.textContent),
    ).toEqual(['Imagem', 'Fabricante', 'Modelo', 'Tipo', 'Situação']);
    const [comImagem, semImagem] = await linhas();
    expect(comImagem?.textContent).toBe('HPLaserJet M404ImpressoraAtivo');
    expect(comImagem?.querySelector('img')?.getAttribute('src')).toBe(
      '/api/modelos/m404/imagem/img-1/64',
    );
    expect(semImagem?.textContent).toBe('RicohC3010ImpressoraAtivo');
    expect(semImagem?.querySelector('img')).toBeNull();
    expect(semImagem?.querySelector('svg.lucide-impressora')).not.toBeNull();
    expect(screen.getByText('2 modelos')).toBeTruthy();
    expect(pedidos[0]?.get('situacao')).toBe('ativos');
    expect(pedidos[0]?.has('tipo')).toBe(false);
  });

  it('os filtros de tipo e de situação e a busca vão ao endereço e à API, e se limpam', async () => {
    const { servidor, pedidos } = catalogo();
    const roteador = abrir('/gestao/catalogo/modelos', servidor);
    await tabela();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar modelos' }), {
      target: { value: 'laser' },
    });
    await waitFor(() => expect(pedidos.at(-1)?.get('busca')).toBe('laser'));
    expect(roteador.state.location.search).toMatchObject({ busca: 'laser' });

    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual([
      'Todos',
      'Câmera (inativo)',
      'Impressora',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Impressora' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('tipo')).toBe('impressora'));

    fireEvent.click(screen.getByRole('button', { name: /Situação/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Inativos' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('situacao')).toBe('inativos'));
    expect(roteador.state.location.search).toEqual({
      busca: 'laser',
      tipo: 'impressora',
      situacao: 'inativos',
    });

    const ativos = await screen.findByRole('group', { name: 'Filtros ativos' });
    expect(
      within(ativos)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Busca · laser', 'Tipo · Impressora', 'Situação · Inativos']);
    fireEvent.click(
      within(ativos).getByRole('button', { name: 'Limpar o filtro Tipo: Impressora' }),
    );
    await waitFor(() => expect(pedidos.at(-1)?.has('tipo')).toBe(false));
    fireEvent.click(within(ativos).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
    expect(pedidos.at(-1)?.get('situacao')).toBe('ativos');
  });

  it('os filtros do endereço valem ao abrir a lista', async () => {
    const { servidor, pedidos } = catalogo();
    abrir('/gestao/catalogo/modelos?tipo=impressora&situacao=todos&busca=hp', servidor);
    await tabela();
    expect(pedidos[0]?.get('tipo')).toBe('impressora');
    expect(pedidos[0]?.get('situacao')).toBe('todos');
    expect(pedidos[0]?.get('busca')).toBe('hp');
  });

  it('"Carregar mais" traz os próximos modelos ao fim, até o último', async () => {
    const { servidor } = catalogo((parametros) =>
      parametros.get('cursor') === 'c2' ? lista([C3010], null, 2) : lista([M404], 'c2', 2),
    );
    abrir('/gestao/catalogo/modelos', servidor);
    expect(await linhas()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('a linha abre a ficha, e quem edita modelos tem "Novo modelo"', async () => {
    const roteador = abrir('/gestao/catalogo/modelos', catalogo().servidor);
    const [primeira] = await linhas();
    fireEvent.click(within(primeira as HTMLElement).getByText('LaserJet M404'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/modelos/m404'),
    );
    await roteador.navigate({ to: '/gestao/catalogo/modelos' });
    fireEvent.click(await screen.findByRole('button', { name: 'Novo modelo' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/modelos/novo'),
    );
  });

  it('vazia, oferece "Limpar filtros" com filtro e "Novo modelo" sem filtro', async () => {
    const { servidor } = catalogo(() => lista([]));
    const roteador = abrir('/gestao/catalogo/modelos?busca=ninguem', servidor);
    const vazio = (await screen.findByText('Nenhum modelo encontrado.'))
      .parentElement as HTMLElement;
    fireEvent.click(within(vazio).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(roteador.state.location.search).toEqual({}));
    await waitFor(() =>
      expect(
        within(
          screen.getByText('Nenhum modelo encontrado.').parentElement as HTMLElement,
        ).getByRole('button', { name: 'Novo modelo' }),
      ).toBeTruthy(),
    );
  });

  // Spec componentes-base, "Ação principal da tela em destaque" (change um-destaque-por-tela).
  it('Lista vazia: o "Novo modelo" do estado vazio é secundário, e o do cabeçalho, o único primário', async () => {
    const { servidor } = catalogo(() => lista([]));
    abrir('/gestao/catalogo/modelos', servidor);
    const vazio = (await screen.findByText('Nenhum modelo encontrado.'))
      .parentElement as HTMLElement;
    const doVazio = within(vazio).getByRole('button', { name: 'Novo modelo' });
    expect(doVazio.getAttribute('data-nivel')).not.toBe('primario');
    const primarias = document.querySelectorAll('[data-nivel="primario"]');
    expect([...primarias].map((botao) => botao.textContent)).toEqual(['Novo modelo']);
  });

  it('sem modelos.editar, a lista não oferece o cadastro', async () => {
    abrir('/gestao/catalogo/modelos', catalogo().servidor, naOrganizacao('catalogo.administrar'));
    await tabela();
    expect(screen.queryByRole('button', { name: 'Novo modelo' })).toBeNull();
  });
});

describe('modelo novo', () => {
  const NOVO = modelo('m405', 'HP', 'LaserJet M405');

  async function preencher() {
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    expect((await screen.findAllByRole('option')).map((opcao) => opcao.textContent)).toEqual([
      'Impressora',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Impressora' }));
    const fabricante = screen.getByRole('combobox', { name: 'Fabricante' });
    fabricante.focus();
    fireEvent.change(fabricante, { target: { value: 'hp' } });
    fireEvent.click(await screen.findByRole('option', { name: 'HP' }));
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Fabricante' }) as HTMLInputElement).value).toBe(
        'HP',
      ),
    );
    fireEvent.change(campoDeTexto('Modelo'), { target: { value: ' LaserJet M405 ' } });
  }

  it('o fabricante abre pelo clique, com os já usados no tipo sugeridos', async () => {
    const { servidor } = catalogo();
    abrir('/gestao/catalogo/modelos/novo', servidor);
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Impressora' }));
    // As sugestões do tipo chegam depois da escolha dele.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Fabricante' }));
      expect(nomesDasOpcoes(screen.getAllByRole('option'))).toEqual(['Ricoh', 'HP']);
    });
    expect(screen.getByText('Já usados neste tipo')).toBeTruthy();
  });

  it('cadastra com o tipo entre os ativos e o fabricante sugerido, e envia a imagem logo depois', async () => {
    const corpos: unknown[] = [];
    const enviados: Request[] = [];
    const { servidor } = catalogo(undefined, {
      'POST /api/modelos': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(NOVO, { status: 201 });
      },
      'PUT /api/modelos/m405/imagem': (pedido) => {
        enviados.push(pedido);
        return Response.json({ ...NOVO, imagem: { id: 'img-2' } });
      },
      'GET /api/modelos/m405': () => Response.json({ ...NOVO, imagem: { id: 'img-2' } }),
    });
    const roteador = abrir('/gestao/catalogo/modelos/novo', servidor);
    await screen.findByRole('button', { name: 'Cadastrar' });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Escolha o tipo do modelo.')).toBeTruthy();
    expect(screen.getByText('Informe o fabricante.')).toBeTruthy();
    expect(screen.getByText('Informe o nome do modelo.')).toBeTruthy();
    expect(corpos).toEqual([]);

    await preencher();
    await escolherArquivo('Imagem do modelo', PNG());
    const escolha = screen.getByRole('group', { name: 'Imagem do modelo' });
    await waitFor(() =>
      expect(escolha.querySelector('img')?.getAttribute('src')).toBe('blob:previa'),
    );
    expect(enviados).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/modelos/m405'),
    );
    expect(corpos).toEqual([{ tipoId: 'impressora', fabricante: 'HP', nome: 'LaserJet M405' }]);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.headers.get('x-grafite-csrf')).toBe('csrf-de-teste');
    expect(avisos()).toContain('Modelo cadastrado.');
    const imagem = await screen.findByRole('group', { name: 'Imagem de HP LaserJet M405' });
    await waitFor(() =>
      expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
        '/api/modelos/m405/imagem/img-2/256',
      ),
    );
  });

  it('sem imagem, só cadastra', async () => {
    const { servidor } = catalogo(undefined, {
      'POST /api/modelos': () => Response.json(NOVO, { status: 201 }),
      'GET /api/modelos/m405': () => Response.json(NOVO),
    });
    const roteador = abrir('/gestao/catalogo/modelos/novo', servidor);
    await preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/modelos/m405'),
    );
    expect(avisos()).toEqual(['Modelo cadastrado.']);
  });

  it('a recusa da API aparece no campo, e a imagem não vai', async () => {
    const enviados: Request[] = [];
    const { servidor } = catalogo(undefined, {
      'POST /api/modelos': () =>
        problema(409, 'conflito', 'Já existe este modelo neste tipo.', {
          nome: 'Já existe este modelo neste tipo.',
        }),
      'PUT /api/modelos/m405/imagem': (pedido) => {
        enviados.push(pedido);
        return Response.json(NOVO);
      },
    });
    abrir('/gestao/catalogo/modelos/novo', servidor);
    await preencher();
    await escolherArquivo('Imagem do modelo', PNG());
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já existe este modelo neste tipo.')).toBeTruthy();
    expect(enviados).toEqual([]);
  });

  it('se a imagem é recusada, o modelo fica cadastrado e a ficha abre com o motivo', async () => {
    const { servidor } = catalogo(undefined, {
      'POST /api/modelos': () => Response.json(NOVO, { status: 201 }),
      'PUT /api/modelos/m405/imagem': () =>
        problema(413, 'imagem-grande-demais', 'A imagem passa de 10 MB.'),
      'GET /api/modelos/m405': () => Response.json(NOVO),
    });
    const roteador = abrir('/gestao/catalogo/modelos/novo', servidor);
    await preencher();
    await escolherArquivo('Imagem do modelo', PNG());
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/gestao/catalogo/modelos/m405'),
    );
    expect([...avisos()].sort()).toEqual([
      'A imagem do modelo não foi enviada.',
      'Modelo cadastrado.',
    ]);
    expect(
      filaDeAvisos.naTela.find(
        ({ aviso }) => aviso.titulo === 'A imagem do modelo não foi enviada.',
      )?.aviso.descricao,
    ).toBe('A imagem passa de 10 MB.');
  });

  it('sem modelos.editar, o cadastro diz que a conta não tem acesso', async () => {
    abrir(
      '/gestao/catalogo/modelos/novo',
      catalogo().servidor,
      naOrganizacao('catalogo.administrar'),
    );
    expect(await screen.findByText('Você não tem acesso ao cadastro de modelos.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadastrar' })).toBeNull();
  });
});

/** O destino de um link, como caminho e parâmetros. */
const destinoDe = (link: HTMLElement) =>
  new URL(link.getAttribute('href') ?? '', 'http://grafite.local');

describe('ficha do modelo', () => {
  const fichaDe = (extras: Partial<Modelo> = {}) => ({ ...M404, ...extras });
  const resumoCom = (quantos: number) => () =>
    Response.json({
      id: 'm404',
      fabricante: 'HP',
      nome: 'LaserJet M404',
      imagem: null,
      situacao: 'ativo',
      tipo: IMPRESSORA,
      ativos: { quantos, recortada: false },
    });

  it('mostra quantos ativos usam o modelo, com "Ver na tabela" (change relacoes-vivas)', async () => {
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/m404': () => Response.json(fichaDe()),
      'GET /api/modelos/m404/resumo': resumoCom(12),
    });
    abrir('/gestao/catalogo/modelos/m404', servidor, naOrganizacao('modelos.editar', 'ativos.ver'));
    expect(await screen.findByText('Ativos: 12')).toBeTruthy();
    const ver = destinoDe(screen.getByRole('link', { name: 'Ver na tabela' }));
    expect(ver.pathname).toBe('/ativos');
    expect(ver.searchParams.get('origem')).toBe('modelo:m404');
  });

  it('sem nenhum ativo, diz isso; sem ver ativos, não diz nada', async () => {
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/m404': () => Response.json(fichaDe()),
      'GET /api/modelos/m404/resumo': resumoCom(0),
    });
    abrir('/gestao/catalogo/modelos/m404', servidor, naOrganizacao('modelos.editar', 'ativos.ver'));
    expect(await screen.findByText('Nenhum ativo deste modelo.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ver na tabela' })).toBeNull();
    cleanup();
    abrir('/gestao/catalogo/modelos/m404', servidor);
    await screen.findByRole('heading', { level: 1, name: /HP LaserJet M404/ });
    expect(screen.queryByText(/Ativos:|Nenhum ativo/)).toBeNull();
  });

  it('mostra o tipo só para leitura, o fabricante, o nome e a imagem', async () => {
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/m404': () => Response.json(fichaDe()),
    });
    abrir('/gestao/catalogo/modelos/m404', servidor);
    const titulo = await screen.findByRole('heading', { level: 1, name: /HP LaserJet M404/ });
    expect(titulo.textContent).toContain('Ativo');
    expect(screen.getByText('Tipo: Impressora')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tipo/ })).toBeNull();
    expect((screen.getByRole('combobox', { name: 'Fabricante' }) as HTMLInputElement).value).toBe(
      'HP',
    );
    expect(campoDeTexto('Modelo').value).toBe('LaserJet M404');
    const imagem = screen.getByRole('group', { name: 'Imagem de HP LaserJet M404' });
    expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
      '/api/modelos/m404/imagem/img-1/256',
    );
    expect(within(imagem).getByRole('button', { name: 'Trocar imagem' })).toBeTruthy();
    expect(within(imagem).getByRole('button', { name: 'Remover imagem' })).toBeTruthy();
  });

  it('salva o fabricante e o nome, sem mandar o tipo', async () => {
    const corpos: unknown[] = [];
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/m404': () => Response.json(fichaDe()),
      'PATCH /api/modelos/m404': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(fichaDe({ nome: 'LaserJet M404dn' }));
      },
    });
    abrir('/gestao/catalogo/modelos/m404', servidor);
    await screen.findByRole('heading', { level: 1, name: /HP LaserJet M404/ });
    fireEvent.change(campoDeTexto('Modelo'), { target: { value: 'LaserJet M404dn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Modelo salvo.'));
    expect(corpos).toEqual([{ fabricante: 'HP', nome: 'LaserJet M404dn' }]);
    expect(
      await screen.findByRole('heading', { level: 1, name: /HP LaserJet M404dn/ }),
    ).toBeTruthy();
  });

  it('troca a imagem, que aparece na hora, e a remove com confirmação', async () => {
    let atual = fichaDe();
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/m404': () => Response.json(atual),
      'PUT /api/modelos/m404/imagem': () => {
        atual = fichaDe({ imagem: { id: 'img-3' } });
        return Response.json(atual);
      },
      'DELETE /api/modelos/m404/imagem': () => {
        atual = fichaDe({ imagem: null });
        return Response.json(atual);
      },
    });
    abrir('/gestao/catalogo/modelos/m404', servidor);
    await escolherArquivo('Imagem de HP LaserJet M404', PNG());
    await waitFor(() => expect(avisos()).toContain('Imagem do modelo trocada.'));
    const imagem = screen.getByRole('group', { name: 'Imagem de HP LaserJet M404' });
    await waitFor(() =>
      expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
        '/api/modelos/m404/imagem/img-3/256',
      ),
    );

    fireEvent.click(within(imagem).getByRole('button', { name: 'Remover imagem' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Remover imagem?' });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover imagem' }));
    await waitFor(() => expect(avisos()).toContain('Imagem do modelo removida.'));
    await waitFor(() => expect(imagem.querySelector('img')).toBeNull());
    expect(imagem.querySelector('svg.lucide-impressora')).not.toBeNull();
  });

  it('a recusa da imagem aparece junto da escolha, e a anterior continua', async () => {
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/m404': () => Response.json(fichaDe()),
      'PUT /api/modelos/m404/imagem': () =>
        problema(413, 'imagem-grande-demais', 'A imagem passa de 10 MB.'),
    });
    abrir('/gestao/catalogo/modelos/m404', servidor);
    await escolherArquivo('Imagem de HP LaserJet M404', PNG());
    const imagem = screen.getByRole('group', { name: 'Imagem de HP LaserJet M404' });
    expect((await within(imagem).findByRole('alert')).textContent).toBe('A imagem passa de 10 MB.');
    expect(imagem.querySelector('img')?.getAttribute('src')).toBe(
      '/api/modelos/m404/imagem/img-1/256',
    );
  });

  it('inativa com confirmação e reativa', async () => {
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/m404': () => Response.json(fichaDe()),
      'POST /api/modelos/m404/inativacao': () => Response.json(fichaDe({ situacao: 'inativo' })),
      'POST /api/modelos/m404/reativacao': () => Response.json(fichaDe()),
    });
    abrir('/gestao/catalogo/modelos/m404', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const dialogo = await screen.findByRole('alertdialog', {
      name: 'Inativar o modelo HP LaserJet M404?',
    });
    expect(dialogo.textContent).toContain('O modelo sai das escolhas dos ativos novos.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar o modelo' }));
    await waitFor(() => expect(avisos()).toContain('Modelo inativado.'));
    expect(
      (await screen.findByRole('heading', { level: 1, name: /HP LaserJet M404/ })).textContent,
    ).toContain('Inativo');
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(avisos()).toContain('Modelo reativado.'));
  });

  it('sem modelos.editar, a ficha é só leitura, com a imagem à vista', async () => {
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/m404': () => Response.json(fichaDe({ permite: { editar: false } })),
    });
    abrir('/gestao/catalogo/modelos/m404', servidor, naOrganizacao('catalogo.administrar'));
    await screen.findByRole('heading', { level: 1, name: /HP LaserJet M404/ });
    expect(campoDeTexto('Modelo').readOnly).toBe(true);
    expect(
      (screen.getByRole('combobox', { name: 'Fabricante' }) as HTMLInputElement).readOnly,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Inativar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trocar imagem' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Imagem de HP LaserJet M404' })).toBeTruthy();
  });

  it('o modelo que não existe diz isso', async () => {
    const { servidor } = catalogo(undefined, {
      'GET /api/modelos/sumiu': () => problema(404, 'nao-encontrado', 'Modelo não encontrado.'),
    });
    abrir('/gestao/catalogo/modelos/sumiu', servidor);
    expect(await screen.findByText('Modelo não encontrado.')).toBeTruthy();
  });
});
