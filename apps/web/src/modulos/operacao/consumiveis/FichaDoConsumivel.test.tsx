import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

// O cadastro e a ficha do consumível (spec modulo-operacao, "Cadastro e ficha do consumível" e
// "Operação atualizada pelos eventos"; spec consumiveis; change p4b-consumiveis, design, decisões 6
// e 7).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Ficha = components['schemas']['FichaDoConsumivel'];
type Modelo = Ficha['modelos'][number];

const IMPRESSORA = { id: 'impressora', nome: 'Impressora' };
const M404: Modelo = {
  id: 'm404',
  fabricante: 'HP',
  nome: 'LaserJet M404',
  situacao: 'ativo',
  tipo: IMPRESSORA,
};
const M428: Modelo = { ...M404, id: 'm428', nome: 'LaserJet M428' };

const ficha = (extras: Partial<Ficha> = {}): Ficha => ({
  id: 'cf258a',
  codigo: 'CF258A',
  nome: 'HP 58A',
  tipo: 'toner',
  cor: 'preto',
  rendimento: 3000,
  situacao: 'ativo',
  criadoEm: '2026-10-19T12:00:00.000Z',
  atualizadoEm: '2026-10-19T12:00:00.000Z',
  fornecedores: [{ id: 'hp', nome: 'HP Brasil', situacao: 'ativo' }],
  modelos: [M404],
  permite: { editar: true },
  ...extras,
});

const EDITA = naOrganizacao('consumiveis.ver', 'consumiveis.editar');
const VE = naOrganizacao('consumiveis.ver');

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

/** O consumível no servidor do teste, que guarda os pedidos. */
function servidorDoConsumivel(inicial: Ficha = ficha()) {
  const estado = { ficha: inicial };
  const corpos: Record<string, unknown[]> = {};
  const guardar = (caminho: string, corpo: unknown) => {
    corpos[caminho] = [...(corpos[caminho] ?? []), corpo];
  };
  const servidor: ServidorDeTeste = {
    'GET /api/consumiveis': () =>
      Response.json({ itens: [], total: 0, proximo: null, permite: { cadastrar: true } }),
    'GET /api/consumiveis/cf258a': () => Response.json(estado.ficha),
    'GET /api/consumiveis/modelos': () =>
      Response.json({
        modelos: [M404, M428].map(({ id, fabricante, nome, tipo }) => ({
          id,
          fabricante,
          nome,
          tipo,
        })),
      }),
    'GET /api/fornecedores/escolha': () =>
      Response.json({
        fornecedores: [
          { id: 'hp', nome: 'HP Brasil', cnpj: '12.345.678/0001-95' },
          { id: 'locadora', nome: 'Locadora Norte', cnpj: null },
        ],
      }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
    'POST /api/consumiveis': async (pedido) => {
      const corpo = (await pedido.json()) as { codigo: string };
      guardar('POST /api/consumiveis', corpo);
      if (corpo.codigo === 'TN-2370') {
        return problema(409, 'Já existe um consumível com este código.', {
          codigo: 'Já existe um consumível com este código.',
        });
      }
      return Response.json(estado.ficha, { status: 201 });
    },
    'PATCH /api/consumiveis/cf258a': async (pedido) => {
      const corpo = (await pedido.json()) as Partial<Ficha>;
      guardar('PATCH /api/consumiveis/cf258a', corpo);
      estado.ficha = { ...estado.ficha, nome: corpo.nome ?? estado.ficha.nome };
      return Response.json(estado.ficha);
    },
    'POST /api/consumiveis/cf258a/inativacao': () => {
      estado.ficha = { ...estado.ficha, situacao: 'inativo' };
      return Response.json(estado.ficha);
    },
    'POST /api/consumiveis/cf258a/reativacao': () => {
      estado.ficha = { ...estado.ficha, situacao: 'ativo' };
      return Response.json(estado.ficha);
    },
  };
  return { servidor, estado, corpos };
}

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[] = EDITA,
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
const texto = (rotulo: string) => screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;

/** Escolhe a opção de uma seleção pelo rótulo dela. */
async function escolher(rotulo: RegExp, opcao: string) {
  fireEvent.click(screen.getByRole('button', { name: rotulo }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

/** Inclui um item pela busca, escolhendo a opção sugerida. */
async function incluir(rotulo: string, busca: string, opcao: string) {
  const campo = screen.getByRole('combobox', { name: rotulo });
  campo.focus();
  fireEvent.change(campo, { target: { value: busca } });
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('o cadastro do consumível', () => {
  it('Primeiro consumível: a lista vazia oferece "Novo consumível", que abre o cadastro', async () => {
    const { servidor } = servidorDoConsumivel();
    const roteador = abrir('/operacao/consumiveis', servidor);
    expect(await screen.findByText('Nenhum consumível ainda.')).toBeTruthy();
    const [botao] = screen.getAllByRole('button', { name: 'Novo consumível' });
    if (botao) fireEvent.click(botao);
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/operacao/consumiveis/novo'),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo consumível' })).toBeTruthy();
  });

  it('Cadastro com o fornecedor e o modelo: manda os dados limpos e abre a ficha', async () => {
    const { servidor, corpos } = servidorDoConsumivel();
    const roteador = abrir('/operacao/consumiveis/novo', servidor);
    await screen.findByRole('heading', { level: 1, name: 'Novo consumível' });
    fireEvent.change(texto('Código'), { target: { value: ' CF258A ' } });
    await escolher(/Tipo/, 'Toner');
    await escolher(/Cor/, 'Preto');
    fireEvent.change(texto('Rendimento'), { target: { value: '3.000' } });
    await incluir('Incluir um fornecedor', 'hp', 'HP Brasil');
    await incluir('Incluir um modelo', 'm404', 'HP LaserJet M404 · Impressora');
    expect(
      within(screen.getByRole('list', { name: 'Fornecedores do consumível' })).getByText(
        'HP Brasil',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Modelos compatíveis' })).getByText(
        'HP LaserJet M404',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/operacao/consumiveis/cf258a'),
    );
    expect(corpos['POST /api/consumiveis']).toEqual([
      {
        codigo: 'CF258A',
        nome: null,
        tipo: 'toner',
        cor: 'preto',
        rendimento: 3000,
        fornecedores: ['hp'],
        modelos: ['m404'],
      },
    ]);
    expect(avisos()).toContain('Consumível cadastrado.');
  });

  it('Peça no catálogo: a peça se cadastra com o tipo Peça, sem a cor e sem o rendimento', async () => {
    // Spec consumiveis, "Consumível"; change p4e-ordens-de-servico.
    const { servidor, corpos } = servidorDoConsumivel();
    abrir('/operacao/consumiveis/novo', servidor);
    await screen.findByRole('heading', { level: 1, name: 'Novo consumível' });
    fireEvent.change(texto('Código'), { target: { value: 'FNT-65W' } });
    fireEvent.change(texto('Nome'), { target: { value: 'Fonte 65W' } });
    await escolher(/Tipo/, 'Peça');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(corpos['POST /api/consumiveis']).toEqual([
        {
          codigo: 'FNT-65W',
          nome: 'Fonte 65W',
          tipo: 'peca',
          cor: null,
          rendimento: null,
          fornecedores: [],
          modelos: [],
        },
      ]),
    );
    expect(avisos()).toContain('Consumível cadastrado.');
  });

  it('confere pelas regras do domínio antes de mandar, e mostra a recusa da API no campo', async () => {
    const { servidor, corpos } = servidorDoConsumivel();
    abrir('/operacao/consumiveis/novo', servidor);
    await screen.findByRole('heading', { level: 1, name: 'Novo consumível' });
    fireEvent.change(texto('Rendimento'), { target: { value: '3,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o código do consumível.')).toBeTruthy();
    expect(screen.getByText('Escolha o tipo do consumível.')).toBeTruthy();
    expect(screen.getByText('Use um número inteiro de páginas, de 1 a 1.000.000.')).toBeTruthy();
    expect(corpos['POST /api/consumiveis']).toBeUndefined();
    fireEvent.change(texto('Código'), { target: { value: 'TN-2370' } });
    fireEvent.change(texto('Rendimento'), { target: { value: '' } });
    await escolher(/Tipo/, 'Toner');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já existe um consumível com este código.')).toBeTruthy();
  });

  it('Fornecedor criado pelo consumível: o fornecedor cadastrado na aba entra na lista', async () => {
    const { servidor, corpos } = servidorDoConsumivel();
    servidor['POST /api/fornecedores'] = async (pedido) => {
      const corpo = (await pedido.json()) as { nome: string };
      return Response.json(
        {
          id: 'distribuidora',
          nome: corpo.nome,
          cnpj: null,
          contato: null,
          email: null,
          telefone: null,
          observacoes: null,
          situacao: 'ativo',
          criadoEm: '2026-10-19T12:00:00.000Z',
          atualizadoEm: '2026-10-19T12:00:00.000Z',
          permite: { editar: true },
        },
        { status: 201 },
      );
    };
    abrir(
      '/operacao/consumiveis/novo',
      servidor,
      naOrganizacao(
        'consumiveis.ver',
        'consumiveis.editar',
        'fornecedores.ver',
        'fornecedores.editar',
      ),
    );
    await screen.findByRole('heading', { level: 1, name: 'Novo consumível' });
    fireEvent.change(texto('Código'), { target: { value: 'CF258A' } });
    await escolher(/Tipo/, 'Toner');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar novo fornecedor' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo fornecedor' });
    fireEvent.change(texto('Nome'), { target: { value: 'Distribuidora Sul' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    const lista = await screen.findByRole('list', { name: 'Fornecedores do consumível' });
    expect(within(lista).getByText('Distribuidora Sul')).toBeTruthy();
    // O código digitado antes da aba continua no cadastro do consumível.
    expect(texto('Código').value).toBe('CF258A');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(corpos['POST /api/consumiveis']).toEqual([
        expect.objectContaining({ fornecedores: ['distribuidora'] }),
      ]),
    );
  });
});

describe('a ficha do consumível', () => {
  it('a linha da lista abre a ficha', async () => {
    const { servidor } = servidorDoConsumivel();
    servidor['GET /api/consumiveis'] = () =>
      Response.json({
        itens: [{ ...ficha(), modelos: 1 }],
        total: 1,
        proximo: null,
        permite: { cadastrar: true },
      });
    const roteador = abrir('/operacao/consumiveis', servidor);
    fireEvent.click(await screen.findByText('CF258A'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/operacao/consumiveis/cf258a'),
    );
  });

  it('quem edita salva a edição, com "Consumível salvo."', async () => {
    const { servidor, corpos } = servidorDoConsumivel();
    abrir('/operacao/consumiveis/cf258a', servidor);
    const nome = await screen.findByRole('textbox', { name: 'Nome' });
    expect((nome as HTMLInputElement).value).toBe('HP 58A');
    expect(texto('Rendimento').value).toBe('3.000');
    fireEvent.change(nome, { target: { value: 'HP 58A preto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar HP LaserJet M404' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(corpos['PATCH /api/consumiveis/cf258a']).toEqual([
        {
          codigo: 'CF258A',
          nome: 'HP 58A preto',
          tipo: 'toner',
          cor: 'preto',
          rendimento: 3000,
          fornecedores: ['hp'],
          modelos: [],
        },
      ]),
    );
    expect(avisos()).toContain('Consumível salvo.');
  });

  it('inativa com a confirmação e reativa, com os retornos', async () => {
    const { servidor } = servidorDoConsumivel();
    abrir('/operacao/consumiveis/cf258a', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar consumível' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar o consumível CF258A?',
    });
    expect(confirmacao.textContent).toContain(
      'O consumível sai dos consumíveis compatíveis dos modelos e dos ativos. Ele pode ser reativado.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar consumível' }));
    await waitFor(() => expect(avisos()).toContain('Consumível inativado.'));
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar consumível' }));
    await waitFor(() => expect(avisos()).toContain('Consumível reativado.'));
    expect(await screen.findByRole('button', { name: 'Inativar consumível' })).toBeTruthy();
  });

  it('Quem só vê: os dados, os fornecedores e os modelos, sem as ações nem as buscas', async () => {
    const { servidor } = servidorDoConsumivel(ficha({ permite: { editar: false } }));
    abrir('/operacao/consumiveis/cf258a', servidor, VE);
    expect(await screen.findByText('HP 58A')).toBeTruthy();
    expect(screen.getByText('3.000 páginas')).toBeTruthy();
    expect(screen.getByText('HP Brasil')).toBeTruthy();
    // Sem fornecedores.ver, o fornecedor não leva à ficha dele; o modelo leva à do modelo.
    expect(screen.queryByRole('link', { name: 'HP Brasil' })).toBeNull();
    expect(screen.getByRole('link', { name: 'HP LaserJet M404' }).getAttribute('href')).toBe(
      '/gestao/catalogo/modelos/m404',
    );
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Inativar consumível' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Incluir um modelo' })).toBeNull();
  });

  it('o fornecedor leva à ficha dele para quem vê os fornecedores', async () => {
    const { servidor } = servidorDoConsumivel(ficha({ permite: { editar: false } }));
    abrir(
      '/operacao/consumiveis/cf258a',
      servidor,
      naOrganizacao('consumiveis.ver', 'fornecedores.ver'),
    );
    expect((await screen.findByRole('link', { name: 'HP Brasil' })).getAttribute('href')).toBe(
      '/administracao/fornecedores/hp',
    );
  });

  it('Modelo renomeado com a ficha aberta: o nome novo aparece, e o que foi digitado fica', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDoConsumivel();
    abrir('/operacao/consumiveis/cf258a', servidor, EDITA, canal);
    const nome = await screen.findByRole('textbox', { name: 'Nome' });
    fireEvent.change(nome, { target: { value: 'HP 58A preto' } });
    estado.ficha = { ...estado.ficha, modelos: [{ ...M404, nome: 'LaserJet Pro M404' }] };
    canal.publicar({
      id: 'e1',
      tipo: 'catalogo.mudou',
      momento: '2026-10-19T12:00:00.000Z',
      alvo: { tipo: 'modelo', id: 'm404' },
    });
    expect(await screen.findByText('HP LaserJet Pro M404')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Nome' }) as HTMLInputElement).value).toBe(
      'HP 58A preto',
    );
  });

  it('sem a permissão, o endereço da ficha diz que a conta não tem acesso', async () => {
    const { servidor } = servidorDoConsumivel();
    abrir('/operacao/consumiveis/cf258a', servidor, naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso à Operação.')).toBeTruthy();
  });
});
