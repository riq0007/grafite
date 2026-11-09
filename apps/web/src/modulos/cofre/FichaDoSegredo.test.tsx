import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { criarClienteDeConsultas } from '../../api/consultas.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { criarRoteador } from '../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../sessao/useAcesso.ts';
import { noComputador } from '../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Ficha = components['schemas']['FichaDoSegredo'];

const ANA = { tipo: 'conta', id: 'ana', nome: 'Ana Souza' } as const;

const SWITCH: Ficha = {
  id: 'switch',
  nome: 'Switch do CPD',
  tipo: 'conta-administrativa',
  classificacao: 'equipamento',
  identificador: 'admin',
  endereco: 'https://10.0.5.2',
  pessoa: { id: 'carla', nome: 'Carla Dias' },
  validade: '2027-03-31',
  proximaRotacao: null,
  situacao: 'ativo',
  notas: 'No rack 2.',
  ativos: [{ id: 'sw', rotulo: 'Switch CPD', patrimonio: 'PAT-00610' }],
  valorTrocadoEm: '2026-10-01T12:00:00.000Z',
  criadoEm: '2026-10-01T12:00:00.000Z',
  atualizadoEm: '2026-10-01T12:00:00.000Z',
  acesso: [ANA],
  permite: { revelar: true, administrar: true },
};

const USA = naOrganizacao('cofre.usar', 'pessoas.ver', 'ativos.ver');
const ADMINISTRA = naOrganizacao('cofre.administrar', 'cofre.usar', 'ativos.ver', 'pessoas.ver');

/** O segredo no servidor do teste: a ficha devolve o estado, e as ações o mudam e guardam o corpo. */
function servidorDoSegredo(inicial: Ficha) {
  const estado = { ficha: inicial };
  const corpos: Record<string, unknown[]> = {};
  const caminho = `/api/cofre/segredos/${inicial.id}`;
  const guardar = async (pedido: Request) => {
    const chave = `${pedido.method} ${new URL(pedido.url).pathname}`;
    const texto = await pedido.text();
    corpos[chave] = [...(corpos[chave] ?? []), texto ? JSON.parse(texto) : null];
    return texto ? JSON.parse(texto) : null;
  };
  const servidor: ServidorDeTeste = {
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
    'GET /api/cofre/liberacao': () => Response.json({ liberadoAte: null }),
    'GET /api/cofre/segredos': () =>
      Response.json({ segredos: [estado.ficha], permite: { cadastrar: true } }),
    [`GET ${caminho}`]: () => Response.json(estado.ficha),
    [`PATCH ${caminho}`]: async (pedido) => {
      const { valor: _, ...dados } = (await guardar(pedido)) as Record<string, unknown>;
      estado.ficha = { ...estado.ficha, ...dados } as Ficha;
      return Response.json(estado.ficha);
    },
    [`POST ${caminho}/inativacao`]: async (pedido) => {
      await guardar(pedido);
      estado.ficha = { ...estado.ficha, situacao: 'inativo' };
      return Response.json(estado.ficha);
    },
    [`POST ${caminho}/reativacao`]: async (pedido) => {
      await guardar(pedido);
      estado.ficha = { ...estado.ficha, situacao: 'ativo' };
      return Response.json(estado.ficha);
    },
    [`PUT ${caminho}/acesso`]: async (pedido) => {
      const { titulares } = (await guardar(pedido)) as {
        titulares: { tipo: 'conta' | 'grupo' | 'perfil'; id: string }[];
      };
      const nomes: Record<string, string> = { ana: 'Ana Souza', suporte: 'Suporte' };
      estado.ficha = {
        ...estado.ficha,
        acesso: titulares.map((titular) => ({ ...titular, nome: nomes[titular.id] ?? '' })),
      };
      return Response.json(estado.ficha);
    },
    'GET /api/cofre/titulares': () =>
      Response.json({
        contas: [{ id: 'ana', nome: 'Ana Souza', usuario: 'ana' }],
        grupos: [{ id: 'suporte', nome: 'Suporte' }],
        perfis: [{ id: 'tecnico', nome: 'Técnico' }],
      }),
    'GET /api/cofre/pessoas': () =>
      Response.json({
        pessoas: [
          { id: 'carla', nome: 'Carla Dias' },
          { id: 'davi', nome: 'Davi Rocha' },
        ],
      }),
    'GET /api/ativos': () =>
      Response.json({
        itens: [
          {
            id: 'roteador',
            rotulo: 'Roteador da filial',
            patrimonio: 'PAT-00412',
            tipo: { nome: 'Roteador' },
          },
        ],
      }),
    'POST /api/cofre/segredos': async (pedido) => {
      await guardar(pedido);
      return Response.json({ ...estado.ficha, id: 'criado' }, { status: 201 });
    },
    'GET /api/cofre/segredos/criado': () => Response.json({ ...estado.ficha, id: 'criado' }),
  };
  return { servidor, estado, corpos };
}

function abrir(endereco: string, servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[]) {
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
/** O valor de um dado da ficha, pelo rótulo dele. */
const dado = (rotulo: string) =>
  screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling?.textContent;
const texto = (rotulo: string) =>
  screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement | HTMLTextAreaElement;
const escolher = async (rotulo: RegExp, opcao: string) => {
  fireEvent.click(screen.getByRole('button', { name: rotulo }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
};

describe('cadastro do segredo', () => {
  it('esconde o valor, confere os campos e abre a ficha com "Segredo cadastrado."', async () => {
    const { servidor, corpos } = servidorDoSegredo(SWITCH);
    const roteador = abrir('/cofre/novo', servidor, ADMINISTRA);
    const valor = (await screen.findByLabelText(/^Valor/)) as HTMLInputElement;
    expect(valor.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(valor.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o nome do segredo.')).toBeTruthy();
    expect(screen.getByText('Escolha o tipo do segredo.')).toBeTruthy();
    expect(screen.getByText('Escolha a classificação do segredo.')).toBeTruthy();
    expect(screen.getByText('Informe o valor do segredo.')).toBeTruthy();
    expect(corpos['POST /api/cofre/segredos']).toBeUndefined();

    fireEvent.change(texto('Nome'), { target: { value: 'Switch do CPD' } });
    await escolher(/Tipo/, 'Conta administrativa');
    await escolher(/Classificação/, 'Equipamento');
    fireEvent.change(texto('Identificador'), { target: { value: 'admin' } });
    fireEvent.change(texto('Endereço'), { target: { value: 'https://10.0.5.2' } });
    fireEvent.change(valor, { target: { value: ' S3nh@ ' } });
    const pessoa = screen.getByRole('combobox', { name: 'Pessoa' }) as HTMLInputElement;
    await waitFor(() => expect(pessoa.disabled).toBe(false));
    pessoa.focus();
    fireEvent.change(pessoa, { target: { value: 'car' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Carla Dias' }));
    const ativo = screen.getByRole('combobox', { name: 'Incluir um ativo' });
    ativo.focus();
    fireEvent.change(ativo, { target: { value: 'rot' } });
    fireEvent.click(await screen.findByRole('option', { name: 'PAT-00412 · Roteador da filial' }));
    expect(
      await within(await screen.findByRole('list', { name: 'Ativos ligados' })).findByText(
        'PAT-00412 · Roteador da filial',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/cofre/criado'));
    await waitFor(() => expect(avisos()).toContain('Segredo cadastrado.'));
    expect(corpos['POST /api/cofre/segredos']).toEqual([
      {
        nome: 'Switch do CPD',
        tipo: 'conta-administrativa',
        classificacao: 'equipamento',
        identificador: 'admin',
        endereco: 'https://10.0.5.2',
        notas: null,
        validade: null,
        proximaRotacao: null,
        pessoaId: 'carla',
        ativoIds: ['roteador'],
        valor: ' S3nh@ ',
      },
    ]);
  });

  it('a recusa da API aparece no campo dela', async () => {
    const { servidor } = servidorDoSegredo(SWITCH);
    servidor['POST /api/cofre/segredos'] = () =>
      Response.json(
        {
          type: 'urn:grafite:problema:dados-invalidos',
          title: 'Dados inválidos',
          status: 400,
          detail: 'Confira os campos indicados.',
          codigoDeRastreio: 'R7K2-9QXM',
          campos: { pessoaId: 'A pessoa escolhida está inativa. Escolha uma pessoa ativa.' },
        },
        { status: 400 },
      );
    abrir('/cofre/novo', servidor, ADMINISTRA);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Wi-Fi' },
    });
    await escolher(/Tipo/, 'Wi-Fi');
    await escolher(/Classificação/, 'Compartilhado');
    fireEvent.change(screen.getByLabelText(/^Valor/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(
      await screen.findByText('A pessoa escolhida está inativa. Escolha uma pessoa ativa.'),
    ).toBeTruthy();
  });

  it('quem não administra o cofre não cadastra', async () => {
    const { servidor } = servidorDoSegredo(SWITCH);
    abrir('/cofre/novo', servidor, USA);
    expect(await screen.findByText('Você não tem acesso ao cadastro de segredos.')).toBeTruthy();
  });
});

describe('ficha do segredo', () => {
  it('quem só usa o cofre vê os dados, a pessoa e os ativos, só para leitura', async () => {
    const { servidor } = servidorDoSegredo({
      ...SWITCH,
      acesso: undefined,
      permite: { revelar: true, administrar: false },
    });
    abrir('/cofre/switch', servidor, USA);
    const titulo = await screen.findByRole('heading', { name: /Switch do CPD/ });
    expect(titulo.textContent).toContain('Ativo');
    expect(dado('Identificador')).toBe('admin');
    expect(screen.getByRole('link', { name: 'Carla Dias' }).getAttribute('href')).toBe(
      '/administracao/pessoas/carla',
    );
    expect(screen.getByRole('link', { name: 'PAT-00610 · Switch CPD' }).getAttribute('href')).toBe(
      '/ativos/sw',
    );
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trocar o valor' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Inativar' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Acesso' })).toBeNull();
  });

  it('quem administra edita os dados sem ver o valor: "Segredo salvo."', async () => {
    const { servidor, corpos } = servidorDoSegredo(SWITCH);
    abrir('/cofre/switch', servidor, ADMINISTRA);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(screen.queryByLabelText(/^Valor/, { selector: 'input' })).toBeNull();
    fireEvent.change(texto('Identificador'), { target: { value: 'root' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Segredo salvo.'));
    expect(corpos['PATCH /api/cofre/segredos/switch']?.[0]).toMatchObject({
      identificador: 'root',
      pessoaId: 'carla',
      ativoIds: ['sw'],
    });
    expect(corpos['PATCH /api/cofre/segredos/switch']?.[0]).not.toHaveProperty('valor');
    await waitFor(() => expect(dado('Identificador')).toBe('root'));
  });

  it('"Trocar o valor" pede o valor novo, sem mostrar o antigo: "Valor trocado."', async () => {
    const { servidor, corpos } = servidorDoSegredo(SWITCH);
    abrir('/cofre/switch', servidor, ADMINISTRA);
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar o valor' }));
    const dialogo = await screen.findByRole('dialog');
    const novo = within(dialogo).getByLabelText(/^Valor novo/) as HTMLInputElement;
    expect(novo.value).toBe('');
    expect(novo.type).toBe('password');
    fireEvent.change(novo, { target: { value: 'N0v@' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Trocar o valor' }));
    await waitFor(() => expect(avisos()).toContain('Valor trocado.'));
    expect(corpos['PATCH /api/cofre/segredos/switch']).toEqual([{ valor: 'N0v@' }]);
  });

  it('"Inativar" pede a confirmação, e "Reativar" volta o segredo', async () => {
    const { servidor } = servidorDoSegredo(SWITCH);
    abrir('/cofre/switch', servidor, ADMINISTRA);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(confirmacao.textContent).toContain(
      'O segredo sai da lista de quem o usa e não pode mais ser revelado. Ele pode ser reativado.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar' }));
    await waitFor(() => expect(avisos()).toContain('Segredo inativado.'));
    expect((await screen.findByRole('heading', { name: /Switch do CPD/ })).textContent).toContain(
      'Inativo',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(avisos()).toContain('Segredo reativado.'));
  });

  it('o acesso mostra os titulares pelo nome, inclui e retira: "Acesso salvo."', async () => {
    const { servidor, corpos } = servidorDoSegredo(SWITCH);
    abrir('/cofre/switch', servidor, ADMINISTRA);
    const acesso = (await screen.findByRole('heading', { name: 'Acesso' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(acesso).getByText('Ana Souza')).toBeTruthy();
    const incluir = within(acesso).getByRole('combobox', {
      name: 'Incluir no acesso',
    }) as HTMLInputElement;
    await waitFor(() => expect(incluir.disabled).toBe(false));
    incluir.focus();
    fireEvent.change(incluir, { target: { value: 'sup' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Grupo Suporte' }));
    fireEvent.click(within(acesso).getByRole('button', { name: 'Incluir' }));
    await waitFor(() => expect(avisos()).toContain('Acesso salvo.'));
    expect(corpos['PUT /api/cofre/segredos/switch/acesso']?.[0]).toEqual({
      titulares: [
        { tipo: 'conta', id: 'ana' },
        { tipo: 'grupo', id: 'suporte' },
      ],
    });
    expect(await within(acesso).findByText('Suporte')).toBeTruthy();
    fireEvent.click(within(acesso).getByRole('button', { name: 'Retirar Ana Souza do acesso' }));
    await waitFor(() =>
      expect(corpos['PUT /api/cofre/segredos/switch/acesso']?.[1]).toEqual({
        titulares: [{ tipo: 'grupo', id: 'suporte' }],
      }),
    );
  });
});
