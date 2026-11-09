// As regras de alerta na tela (spec modulo-alertas, "Regras na tela"; change p3a-regras-e-alertas,
// design, decisão 11): a lista para quem administra os alertas, o formulário com os campos da
// condição escolhida e as mensagens no campo, a ficha com a condição que não muda, a inativação e a
// reativação.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Regra = components['schemas']['RegraDeAlerta'];

const TIPO_IMPRESSORA = '0199d3a0-0000-7000-8000-0000000000b1';

const regra = (id: string, mudancas: Partial<Regra> = {}): Regra => ({
  id,
  nome: 'Toner em 10% ou menos',
  condicao: 'toner.nivel',
  parametros: { limite: 10, folga: 5 },
  duracao: 0,
  severidade: 'critico',
  escopo: { tipo: 'organizacao', id: null, nome: null },
  excecoes: [],
  situacao: 'ativa',
  deFabrica: true,
  criadoEm: '2026-10-14T10:00:00.000Z',
  atualizadoEm: '2026-10-14T10:00:00.000Z',
  ...mudancas,
});

const TONER = regra('0199d3a0-0000-7000-8000-00000000r001');
const OFFLINE = regra('0199d3a0-0000-7000-8000-00000000r002', {
  nome: 'Servidor offline',
  condicao: 'rede.offline',
  parametros: {},
  duracao: 2,
  severidade: 'atencao',
  escopo: { tipo: 'tipo', id: TIPO_IMPRESSORA, nome: 'Servidor' },
  excecoes: [
    {
      lugar: { tipo: 'local', id: '0199d3a0-0000-7000-8000-0000000000l1', nome: 'Laboratório' },
      efeito: 'nao-alertar',
    },
    {
      lugar: { tipo: 'local', id: '0199d3a0-0000-7000-8000-0000000000l2', nome: 'Almoxarifado' },
      efeito: 'nao-alertar',
    },
  ],
  situacao: 'inativa',
  deFabrica: false,
});
const COLETOR = regra('0199d3a0-0000-7000-8000-00000000r003', {
  nome: 'Coletor sem contato',
  condicao: 'coletor.sem-contato',
  parametros: { minutos: 10 },
});

const ADMINISTRA = naOrganizacao('alertas.administrar', 'alertas.ver');
const VE = naOrganizacao('alertas.ver');

function servidorDasRegras(regras: Regra[]) {
  const servidor: ServidorDeTeste = {
    'GET /api/regras-de-alerta': () => Response.json({ regras, permite: { cadastrar: true } }),
    'GET /api/tipos-de-ativo': () =>
      Response.json({
        tipos: [
          {
            id: TIPO_IMPRESSORA,
            nome: 'Impressora',
            icone: 'impressora',
            capacidades: [],
            configuracaoDasCapacidades: {},
            campos: [],
            situacao: 'ativo',
            permite: { editar: false },
          },
        ],
        permite: { cadastrar: false },
      }),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  for (const uma of regras) {
    servidor[`GET /api/regras-de-alerta/${uma.id}`] = () => Response.json(uma);
  }
  return servidor;
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

const escolher = async (rotulo: RegExp, opcao: string) => {
  fireEvent.click(screen.getByRole('button', { name: rotulo }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
};

describe('lista das regras', () => {
  it('quem administra vê as regras, com a condição, a duração, o escopo, as exceções e a situação', async () => {
    abrir('/alertas/regras', servidorDasRegras([TONER, OFFLINE, COLETOR]), ADMINISTRA);
    const grade = await screen.findByRole('grid', { name: 'Regras de alerta' });
    expect(screen.getByText(/^Uma regra diz quando abrir um alerta/)).toBeTruthy();
    expect(
      within(grade)
        .getAllByRole('columnheader')
        .map((coluna) => coluna.textContent),
    ).toEqual(['Nome', 'Condição', 'Duração', 'Severidade', 'Escopo', 'Exceções', 'Situação']);
    const [toner, offline, coletor] = within(grade).getAllByRole('row').slice(1);
    expect(toner?.textContent).toContain('Nível do toner em 10% ou menos, volta acima de 15%');
    expect(toner?.textContent).toContain('Na hora');
    expect(toner?.textContent).toContain('Organização inteira');
    expect(toner?.textContent).toContain('Ativa');
    expect(toner?.textContent).toContain('Sem exceções');
    expect(offline?.textContent).toContain('2 exceções');
    expect(offline?.textContent).toContain('Ativo offline');
    expect(offline?.textContent).toContain('2 min');
    expect(offline?.textContent).toContain('Tipo: Servidor');
    expect(offline?.textContent).toContain('Inativa');
    expect(coletor?.textContent).toContain('Coletor sem contato há 10 minutos');
    expect(screen.getByRole('button', { name: 'Nova regra' })).toBeTruthy();
  });

  it('quem só vê os alertas não tem acesso às regras', async () => {
    abrir('/alertas/regras', servidorDasRegras([TONER]), VE);
    expect(await screen.findByText('Você não tem acesso às regras de alerta.')).toBeTruthy();
  });
});

describe('nova regra', () => {
  it('mostra os campos de cada condição', async () => {
    abrir('/alertas/regras/nova', servidorDasRegras([]), ADMINISTRA);
    await screen.findByRole('textbox', { name: /^Nome/ });
    await escolher(/Condição$/, 'Nível do toner');
    expect(screen.getByRole('textbox', { name: /^Limite/ })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /^Folga/ })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /^Duração/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Escopo$/ })).toBeTruthy();
    await escolher(/Condição$/, 'Coletor sem contato');
    expect(screen.getByRole('textbox', { name: /^Minutos/ })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /^Duração/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Escopo$/ })).toBeNull();
    await escolher(/Condição$/, 'Condição da impressora');
    expect(screen.getByRole('checkbox', { name: 'Sem papel' })).toBeTruthy();
  });

  it('cadastra a regra do toner de um tipo, com o retorno, e abre a ficha dela', async () => {
    const servidor = servidorDasRegras([]);
    let corpo: unknown;
    const criada = regra('0199d3a0-0000-7000-8000-00000000r010', { nome: 'Toner das impressoras' });
    servidor['POST /api/regras-de-alerta'] = async (pedido) => {
      corpo = await pedido.json();
      return Response.json(criada, { status: 201 });
    };
    servidor[`GET /api/regras-de-alerta/${criada.id}`] = () => Response.json(criada);
    const roteador = abrir('/alertas/regras/nova', servidor, ADMINISTRA);
    fireEvent.change(await screen.findByRole('textbox', { name: /^Nome/ }), {
      target: { value: 'Toner das impressoras' },
    });
    await escolher(/Condição$/, 'Nível do toner');
    fireEvent.change(screen.getByRole('textbox', { name: /^Limite/ }), { target: { value: '15' } });
    await escolher(/Severidade$/, 'Atenção');
    await escolher(/Escopo$/, 'Um tipo');
    await escolher(/Tipo$/, 'Impressora');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Regra salva.')).toBeTruthy();
    expect(corpo).toEqual({
      nome: 'Toner das impressoras',
      condicao: 'toner.nivel',
      parametros: { limite: 15, folga: 5 },
      duracao: 0,
      severidade: 'atencao',
      escopo: { tipo: 'tipo', id: TIPO_IMPRESSORA },
      excecoes: [],
    });
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe(`/alertas/regras/${criada.id}`),
    );
  });

  it('mostra no campo a recusa do domínio, antes de enviar, e a da API', async () => {
    const servidor = servidorDasRegras([]);
    const envio = vi.fn(() =>
      Response.json(
        {
          type: 'urn:grafite:problema:conflito',
          title: 'Conflito',
          status: 409,
          detail: 'Já existe uma regra com esse nome.',
          codigoDeRastreio: 'ABCD-1234',
          campos: { nome: 'Já existe uma regra com esse nome.' },
        },
        { status: 409 },
      ),
    );
    servidor['POST /api/regras-de-alerta'] = envio;
    abrir('/alertas/regras/nova', servidor, ADMINISTRA);
    fireEvent.change(await screen.findByRole('textbox', { name: /^Nome/ }), {
      target: { value: 'Toner' },
    });
    await escolher(/Condição$/, 'Nível do toner');
    fireEvent.change(screen.getByRole('textbox', { name: /^Limite/ }), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe um limite de 1 a 99%.')).toBeTruthy();
    expect(envio).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: /^Limite/ }), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Já existe uma regra com esse nome.')).toBeTruthy();
    expect(envio).toHaveBeenCalledOnce();
  });
});

describe('ficha da regra', () => {
  it('edita a regra, sem trocar a condição, com o retorno', async () => {
    const servidor = servidorDasRegras([TONER]);
    let corpo: unknown;
    servidor[`PATCH /api/regras-de-alerta/${TONER.id}`] = async (pedido) => {
      corpo = await pedido.json();
      return Response.json({ ...TONER, nome: 'Toner baixo' });
    };
    abrir(`/alertas/regras/${TONER.id}`, servidor, ADMINISTRA);
    const nome = await screen.findByRole('textbox', { name: /^Nome/ });
    expect((nome as HTMLInputElement).value).toBe('Toner em 10% ou menos');
    const condicao = screen.getByRole('button', { name: /Condição$/ });
    expect(
      condicao.hasAttribute('disabled') || condicao.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    fireEvent.change(nome, { target: { value: 'Toner baixo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Regra salva.')).toBeTruthy();
    expect(corpo).toMatchObject({ nome: 'Toner baixo', condicao: 'toner.nivel' });
  });

  it('Exceção do modelo: inclui a exceção na regra do toner e salva com ela', async () => {
    const servidor = servidorDasRegras([TONER]);
    let corpo: { excecoes?: unknown } = {};
    servidor[`PATCH /api/regras-de-alerta/${TONER.id}`] = async (pedido) => {
      corpo = await pedido.json();
      return Response.json(TONER);
    };
    abrir(`/alertas/regras/${TONER.id}`, servidor, ADMINISTRA);
    await screen.findByRole('textbox', { name: /^Nome/ });
    fireEvent.click(screen.getByRole('button', { name: 'Incluir exceção' }));
    const excecao = screen.getByRole('group', { name: 'Exceção 1' });
    fireEvent.click(within(excecao).getByRole('button', { name: /Onde vale$/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Um tipo' }));
    fireEvent.click(within(excecao).getByRole('button', { name: /Tipo$/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Impressora' }));
    fireEvent.click(within(excecao).getByRole('button', { name: /Efeito$/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Outro limite' }));
    fireEvent.change(within(excecao).getByRole('textbox', { name: /^Limite/ }), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Regra salva.')).toBeTruthy();
    expect(corpo.excecoes).toEqual([
      {
        lugar: { tipo: 'tipo', id: TIPO_IMPRESSORA },
        efeito: 'outro-limite',
        limite: 20,
        folga: 5,
      },
    ]);
  });

  it('a regra do coletor não oferece exceções, e "Tirar" tira a exceção', async () => {
    abrir(`/alertas/regras/${COLETOR.id}`, servidorDasRegras([COLETOR]), ADMINISTRA);
    await screen.findByRole('textbox', { name: /^Nome/ });
    expect(screen.queryByRole('button', { name: 'Incluir exceção' })).toBeNull();
    cleanup();
    abrir(`/alertas/regras/${TONER.id}`, servidorDasRegras([TONER]), ADMINISTRA);
    await screen.findByRole('textbox', { name: /^Nome/ });
    fireEvent.click(screen.getByRole('button', { name: 'Incluir exceção' }));
    const excecao = screen.getByRole('group', { name: 'Exceção 1' });
    fireEvent.click(within(excecao).getByRole('button', { name: 'Tirar' }));
    expect(screen.queryByRole('group', { name: 'Exceção 1' })).toBeNull();
  });

  it('inativa com a confirmação e reativa, com o retorno', async () => {
    const servidor = servidorDasRegras([TONER, OFFLINE]);
    servidor[`POST /api/regras-de-alerta/${TONER.id}/inativacao`] = () =>
      Response.json({ ...TONER, situacao: 'inativa' });
    servidor[`POST /api/regras-de-alerta/${OFFLINE.id}/reativacao`] = () =>
      Response.json({ ...OFFLINE, situacao: 'ativa' });
    abrir(`/alertas/regras/${TONER.id}`, servidor, ADMINISTRA);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const confirmacao = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar a regra' }));
    expect(await screen.findByText('Regra inativada.')).toBeTruthy();
    cleanup();
    abrir(`/alertas/regras/${OFFLINE.id}`, servidor, ADMINISTRA);
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    expect(await screen.findByText('Regra reativada.')).toBeTruthy();
  });
});
