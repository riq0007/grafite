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
import { REGISTRO } from '../registro.ts';
import { registroDaConta } from '../registroDaConta.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Item = components['schemas']['ItemDoCofre'];

const item = (id: string, nome: string, extras: Partial<Item> = {}): Item => ({
  id,
  nome,
  tipo: 'usuario-e-senha',
  classificacao: 'compartilhado',
  identificador: null,
  endereco: null,
  pessoa: null,
  validade: null,
  proximaRotacao: null,
  situacao: 'ativo',
  ...extras,
});

const SWITCH = item('switch', 'Switch do CPD', {
  tipo: 'conta-administrativa',
  classificacao: 'equipamento',
  identificador: 'admin',
  validade: '2027-03-31',
});
const WIFI = item('wifi', 'Senha do Wi-Fi visitantes', {
  tipo: 'wi-fi',
  pessoa: { id: 'carla', nome: 'Carla Dias' },
  validade: '2026-09-30',
  proximaRotacao: '2026-10-01',
});
const ANTIGO = item('antigo', 'Servidor antigo', { situacao: 'inativo' });

const USA = naOrganizacao('cofre.usar');
const ADMINISTRA = naOrganizacao('cofre.administrar', 'cofre.usar');
const SEM_DOIS_PASSOS =
  'Cadastre a verificação em dois passos em Ajustes › Conta para usar o cofre.';

/** O cofre no servidor do teste: a lista responde os segredos e guarda os filtros pedidos. */
function servidorDoCofre(segredos: Item[], { cadastrar = false } = {}) {
  const pedidos: URLSearchParams[] = [];
  const lista = vi.fn((pedido: Request) => {
    pedidos.push(new URL(pedido.url).searchParams);
    return Response.json({ segredos, permite: { cadastrar } });
  });
  const servidor: ServidorDeTeste = {
    'GET /api/cofre/segredos': lista,
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  return { servidor, lista, pedidos };
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

const linhas = async () =>
  within(await screen.findByRole('grid', { name: 'Segredos' }))
    .getAllByRole('row')
    .slice(1);
const textoDasLinhas = async () => (await linhas()).map((linha) => linha.textContent);
const colunas = async () =>
  within(await screen.findByRole('grid', { name: 'Segredos' }))
    .getAllByRole('columnheader')
    .map((coluna) => coluna.textContent);

/** Um dia de outubro de 2026, ao meio-dia em Brasília. */
function hojeE(dia: string) {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.setSystemTime(new Date(`${dia}T15:00:00.000Z`));
}

describe('o módulo Cofre no registro', () => {
  it('fica depois do Ativos e antes da Administração, e no celular em "Mais"', () => {
    const ids = REGISTRO.map((modulo) => modulo.id);
    // Entre o Ativos e o Cofre fica o Alertas (spec modulo-alertas).
    expect(ids.indexOf('cofre')).toBeGreaterThan(ids.indexOf('ativos'));
    expect(ids.indexOf('administracao')).toBe(ids.indexOf('cofre') + 1);
    const cofre = REGISTRO.find((modulo) => modulo.id === 'cofre');
    expect(cofre).toMatchObject({ nome: 'Cofre', endereco: '/cofre', prioridadeNoCelular: 'mais' });
  });

  it('aparece para quem usa ou administra o cofre, e some com o módulo desligado', () => {
    const comCofre = (pode: (chave: string) => boolean, desligados: string[] = []) =>
      registroDaConta(REGISTRO, pode, desligados).some((modulo) => modulo.id === 'cofre');
    expect(comCofre((chave) => chave === 'cofre.usar')).toBe(true);
    expect(comCofre((chave) => chave === 'cofre.administrar')).toBe(true);
    expect(comCofre((chave) => chave === 'ativos.ver')).toBe(false);
    expect(comCofre((chave) => chave === 'cofre.usar', ['cofre'])).toBe(false);
  });
});

describe('lista dos segredos', () => {
  it('quem usa o cofre vê os segredos com o tipo, a classificação e a validade, sem a situação', async () => {
    hojeE('2026-10-12');
    const { servidor } = servidorDoCofre([WIFI, SWITCH]);
    abrir('/cofre', servidor, USA);
    expect(await colunas()).toEqual([
      'Nome',
      'Tipo',
      'Classificação',
      'Identificador',
      'Pessoa',
      'Validade',
    ]);
    expect(await textoDasLinhas()).toEqual([
      'Senha do Wi-Fi visitantesWi-FiCompartilhado—Carla Dias30/09/2026VencidoRotação atrasada',
      'Switch do CPDConta administrativaEquipamentoadmin—31/03/2027',
    ]);
    // O vencido chama a atenção com o ícone e o texto, não só pela cor.
    const vencido = screen.getByText('Vencido');
    expect(vencido.closest('[data-situacao]')?.getAttribute('data-situacao')).toBe('atencao');
    expect(screen.queryByRole('button', { name: 'Novo segredo' })).toBeNull();
  });

  it('quem administra vê a situação, filtra os inativos e cadastra', async () => {
    const { servidor, pedidos } = servidorDoCofre([SWITCH, ANTIGO], { cadastrar: true });
    const roteador = abrir('/cofre', servidor, ADMINISTRA);
    expect(await colunas()).toContain('Situação');
    expect((await linhas()).map((linha) => linha.textContent?.endsWith('Ativo') ?? false)).toEqual([
      true,
      false,
    ]);
    expect(pedidos.at(-1)?.get('situacao')).toBe('ativos');
    fireEvent.click(screen.getByRole('radio', { name: 'Inativos' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('situacao')).toBe('inativos'));
    expect(roteador.state.location.search).toMatchObject({ situacao: 'inativos' });
    fireEvent.click(screen.getByRole('button', { name: 'Novo segredo' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/cofre/novo'));
  });

  it('busca pelo texto e filtra pelo tipo e pela classificação', async () => {
    const { servidor, pedidos } = servidorDoCofre([SWITCH]);
    abrir('/cofre', servidor, USA);
    await linhas();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar segredos' }), {
      target: { value: 'cpd' },
    });
    await waitFor(() => expect(pedidos.at(-1)?.get('busca')).toBe('cpd'));
    fireEvent.click(screen.getByRole('button', { name: /Tipo/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Conta administrativa' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('tipo')).toBe('conta-administrativa'));
    fireEvent.click(screen.getByRole('button', { name: /Classificação/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Equipamento' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('classificacao')).toBe('equipamento'));
    // Quem só usa o cofre não escolhe a situação: vê só os ativos.
    expect(screen.queryByRole('radio', { name: 'Inativos' })).toBeNull();
  });

  it('a linha abre a ficha do segredo', async () => {
    const { servidor } = servidorDoCofre([SWITCH]);
    servidor['GET /api/cofre/segredos/switch'] = () => new Response(null, { status: 500 });
    const roteador = abrir('/cofre', servidor, USA);
    fireEvent.click(await screen.findByText('Switch do CPD'));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/cofre/switch'));
  });

  it('sem nenhum segredo, quem administra ouve "Nenhum segredo ainda." e cadastra o primeiro', async () => {
    const { servidor } = servidorDoCofre([], { cadastrar: true });
    abrir('/cofre', servidor, ADMINISTRA);
    expect(await screen.findByText('Nenhum segredo ainda.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Novo segredo' }).length).toBeGreaterThan(1);
  });

  it('sem nenhum segredo liberado, quem usa ouve que nada foi liberado ainda', async () => {
    const { servidor } = servidorDoCofre([]);
    abrir('/cofre', servidor, USA);
    expect(await screen.findByText('Nenhum segredo liberado para você ainda.')).toBeTruthy();
  });

  it('com a busca sem resultado, diz que nada foi encontrado e limpa os filtros', async () => {
    const { servidor, pedidos } = servidorDoCofre([]);
    abrir('/cofre?busca=impressora', servidor, USA);
    expect(await screen.findByText('Nenhum segredo encontrado.')).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(pedidos.at(-1)?.get('busca')).toBeNull());
  });
});

describe('o cofre sem acesso', () => {
  it('a conta sem os dois passos ouve o caminho até o cadastro, sem nenhum segredo', async () => {
    const servidor: ServidorDeTeste = {
      'GET /api/cofre/segredos': () =>
        Response.json(
          {
            type: 'urn:grafite:problema:cofre-sem-dois-passos',
            title: 'Sem a verificação em dois passos',
            status: 403,
            detail: SEM_DOIS_PASSOS,
            codigoDeRastreio: 'R7K2-9QXM',
          },
          { status: 403 },
        ),
    };
    const roteador = abrir('/cofre', servidor, USA);
    expect(await screen.findByText(SEM_DOIS_PASSOS)).toBeTruthy();
    expect(screen.queryByRole('grid', { name: 'Segredos' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Ajustes › Conta' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/ajustes/conta'));
  });

  it('a conta sem o cofre ouve que não tem acesso, sem pedir a lista', async () => {
    const { servidor, lista } = servidorDoCofre([SWITCH]);
    abrir('/cofre', servidor, naOrganizacao('ativos.ver'));
    expect(await screen.findByText('Você não tem acesso ao Cofre.')).toBeTruthy();
    expect(lista).not.toHaveBeenCalled();
  });
});

// A célula numa linha só (spec componentes-base, "Célula numa linha só"; change celulas-numa-linha,
// design, decisão 2).
describe('a validade do segredo numa coluna estreita', () => {
  it('põe a data e os avisos do que passou na parte fixa, sem nada que quebre a linha', async () => {
    hojeE('2026-10-12');
    const { servidor } = servidorDoCofre([WIFI, SWITCH]);
    abrir('/cofre', servidor, USA);
    const [wifi, doSwitch] = await linhas();

    const vencido = within(wifi as HTMLElement).getByText('Vencido');
    const fixo = vencido.closest('[data-parte="fixo"]');
    expect(fixo?.textContent).toBe('30/09/2026VencidoRotação atrasada');
    expect(
      within(doSwitch as HTMLElement)
        .getByText('31/03/2027')
        .closest('[data-parte]'),
    ).toBeTruthy();
  });
});
