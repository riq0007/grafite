import type { AjustesDasPreferencias } from '@grafite/domain';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory, createRoute } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Box } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { REGISTRO } from '../modulos/registro.ts';
import { definirModulo, type ModuloRegistrado } from '../modulos/tipos.ts';
import { criarRoteador } from '../rotas/arvore.ts';
import { raiz } from '../rotas/raiz.tsx';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { pagina } from '../sessao/pagina.ts';
import type { PermissaoDaSessao } from '../sessao/useAcesso.ts';
import { chaveDasVisoes, consultaDasVisoes, type VisaoDaTabela } from '../tabelas/visoes.ts';
import {
  CONTA_DE_EXEMPLO,
  estadoDaSessaoAtiva,
  naOrganizacao,
  type ServidorDeTeste,
  sessaoAtiva,
} from '../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

function abrir(endereco: string, sessao: LojaDaSessao = sessaoAtiva()) {
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(<App roteador={roteador} sessao={sessao} />);
  return roteador;
}

/** Postura computador: ponteiro fino, na largura padrão da janela de teste. */
function comPonteiroFino() {
  const original = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (consulta: string) => {
    const lista = original(consulta);
    if (consulta === '(pointer: fine)') Object.defineProperty(lista, 'matches', { value: true });
    return lista;
  });
}

const dock = () => screen.findByRole('navigation', { name: 'Dock' });
const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });

describe('casca do app', () => {
  it('monta o dock pelo registro, com Ajustes no fim, e marca o módulo atual', async () => {
    abrir('/ajustes');
    const itens = within(await dock()).getAllByRole('button');
    expect(itens.map((item) => item.getAttribute('aria-label'))).toEqual(['Início', 'Ajustes']);
    expect(
      within(await dock())
        .getByRole('button', { name: 'Ajustes' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('no ambiente de teste, a barra mostra o aviso antes da busca', async () => {
    abrir('/ajustes', sessaoAtiva([], {}, {}, {}, { ambiente: 'teste', operaOServidor: false }));
    await titulo('Aparência');
    const barra = screen.getByRole('banner');
    const aviso = within(barra).getByText('Ambiente de teste');
    const busca = within(barra).getByRole('button', { name: 'Buscar' });
    expect(aviso.compareDocumentPosition(busca) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('na produção, a barra não mostra o aviso do ambiente', async () => {
    abrir('/ajustes', sessaoAtiva([], {}, {}, {}, { ambiente: 'producao', operaOServidor: false }));
    await titulo('Aparência');
    expect(within(screen.getByRole('banner')).queryByText('Ambiente de teste')).toBeNull();
  });

  it('mostra na barra o nome do módulo atual', async () => {
    abrir('/ajustes');
    await titulo('Aparência');
    expect(within(screen.getByRole('banner')).getByText('Ajustes')).toBeTruthy();
  });

  it('escolher um módulo no dock troca o conteúdo e leva o foco ao título', async () => {
    const roteador = abrir('/');
    await titulo('O que resolver agora');
    fireEvent.click(within(await dock()).getByRole('button', { name: 'Ajustes' }));
    const novo = await titulo('Aparência');
    await waitFor(() => expect(document.activeElement).toBe(novo));
    expect(roteador.state.location.pathname).toBe('/ajustes');
  });

  it('o voltar do histórico devolve o módulo anterior, com o foco no título', async () => {
    const roteador = abrir('/');
    await titulo('O que resolver agora');
    fireEvent.click(within(await dock()).getByRole('button', { name: 'Ajustes' }));
    await titulo('Aparência');
    roteador.history.back();
    const anterior = await titulo('O que resolver agora');
    await waitFor(() => expect(document.activeElement).toBe(anterior));
    expect(
      within(await dock())
        .getByRole('button', { name: 'Início' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('não move o foco ao abrir a página, para o primeiro Tab ir a "Ir para o conteúdo"', async () => {
    abrir('/');
    await titulo('O que resolver agora');
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(document.activeElement).toBe(document.body);
  });

  describe('cursor suavizado', () => {
    const cursor = () => document.querySelector('[data-cursor="ponto"]');

    it('no computador, com os padrões de fábrica, a casca monta o cursor suavizado', async () => {
      comPonteiroFino();
      abrir('/');
      await titulo('O que resolver agora');
      expect(cursor()).not.toBeNull();
    });

    it('com "Do sistema" nas preferências, o cursor suavizado não é montado', async () => {
      comPonteiroFino();
      abrir('/', sessaoAtiva([], {}, { cursor: { tipo: 'sistema' } }));
      await titulo('O que resolver agora');
      expect(cursor()).toBeNull();
    });

    it('com o movimento reduzido nos Ajustes, o cursor suavizado não é montado', async () => {
      comPonteiroFino();
      abrir('/', sessaoAtiva([], {}, { acessibilidade: { movimento: 'reduzido' } }));
      await titulo('O que resolver agora');
      expect(cursor()).toBeNull();
    });
  });

  describe('notificações', () => {
    it('o sino da barra mostra que não há não lidas e abre a central vazia', async () => {
      abrir('/');
      await titulo('O que resolver agora');
      const sino = within(screen.getByRole('banner')).getByRole('button', {
        name: 'Notificações, nenhuma não lida',
      });
      fireEvent.click(sino);
      const central = await screen.findByRole('dialog', { name: 'Notificações' });
      expect(await within(central).findByText('Nenhuma notificação.')).toBeTruthy();
    });

    it('a barra mostra, nesta ordem, busca, rede, sino, relógio e usuário', async () => {
      abrir('/');
      await titulo('O que resolver agora');
      const barra = within(screen.getByRole('banner'));
      const itens = [
        barra.getByRole('button', { name: 'Buscar' }),
        barra.getByRole('status'),
        barra.getByRole('button', { name: /^Notificações/ }),
        screen.getByRole('banner').querySelector('time') as HTMLElement,
        barra.getByRole('button', { name: 'Ana Souza' }),
      ];
      for (let i = 1; i < itens.length; i++) {
        const anterior = itens[i - 1] as HTMLElement;
        const posicao = anterior.compareDocumentPosition(itens[i] as HTMLElement);
        expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING, `item ${i}`).toBeTruthy();
      }
    });
  });

  describe('busca', () => {
    const busca = () => screen.findByRole('dialog', { name: 'Busca' });

    it('o botão da barra abre a busca vazia, e escolher um módulo navega e fecha a busca', async () => {
      const roteador = abrir('/ajustes');
      await titulo('Aparência');
      fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
      const campo = within(await busca()).getByRole('searchbox', { name: 'Buscar' });
      expect(campo).toHaveProperty('value', '');
      fireEvent.change(campo, { target: { value: 'inicio' } });
      fireEvent.click(await within(await busca()).findByRole('option', { name: 'Início' }));
      await titulo('O que resolver agora');
      expect(roteador.state.location.pathname).toBe('/');
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Busca' })).toBeNull());
    });

    it('encontra um ajuste pelo nome, com o caminho, e escolhê-lo põe o foco no controle', async () => {
      comPonteiroFino();
      abrir('/');
      await titulo('O que resolver agora');
      fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
      const campo = within(await busca()).getByRole('searchbox', { name: 'Buscar' });
      fireEvent.change(campo, { target: { value: 'dock tamanho' } });
      const opcao = await within(await busca()).findByRole('option', { name: 'Tamanho do dock' });
      expect(opcao.textContent).toContain('Ajustes › Dock');
      fireEvent.click(opcao);
      await titulo('Dock');
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('slider', { name: 'Tamanho' })),
      );
    });

    it('Ctrl+K abre a busca de qualquer lugar da casca', async () => {
      abrir('/');
      await titulo('O que resolver agora');
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
      expect(await busca()).toBeTruthy();
    });

    it('a ação "Usar o tema Névoa" fecha a busca e troca o tema na hora', async () => {
      abrir('/');
      await titulo('O que resolver agora');
      fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
      const campo = within(await busca()).getByRole('searchbox', { name: 'Buscar' });
      fireEvent.change(campo, { target: { value: 'nevoa' } });
      const acoes = within(await busca()).getByRole('group', { name: 'Ações' });
      fireEvent.click(within(acoes).getByRole('option', { name: 'Usar o tema Névoa' }));
      await waitFor(() =>
        expect(document.documentElement.getAttribute('data-theme')).toBe('nevoa'),
      );
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Busca' })).toBeNull());
    });

    it('a ação "Abrir notificações" fecha a busca e abre a central', async () => {
      abrir('/');
      await titulo('O que resolver agora');
      fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
      const campo = within(await busca()).getByRole('searchbox', { name: 'Buscar' });
      fireEvent.change(campo, { target: { value: 'notificacoes' } });
      const acoes = within(await busca()).getByRole('group', { name: 'Ações' });
      fireEvent.click(within(acoes).getByRole('option', { name: 'Abrir notificações' }));
      const central = await screen.findByRole('dialog', { name: 'Notificações' });
      expect(await within(central).findByText('Nenhuma notificação.')).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Busca' })).toBeNull());
    });

    it('com o campo vazio, a busca mostra os módulos em Ir para', async () => {
      abrir('/');
      await titulo('O que resolver agora');
      fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
      const irPara = within(await busca()).getByRole('group', { name: 'Ir para' });
      expect(
        within(irPara)
          .getAllByRole('option')
          .map((opcao) => opcao.textContent),
      ).toEqual(['Início', 'Ajustes']);
    });
  });

  describe('foco pelo endereço', () => {
    /** Um alvo marcado com data-foco, como o controle de um ajuste; o foco vai ao botão dentro. */
    function alvo(id: string) {
      const marcado = document.createElement('div');
      marcado.setAttribute('data-foco', id);
      const botao = document.createElement('button');
      botao.textContent = 'Alvo';
      marcado.append(botao);
      document.body.append(marcado);
      return botao;
    }

    afterEach(() => {
      for (const marcado of document.querySelectorAll('[data-foco]')) marcado.remove();
    });

    it('com foco no endereço, o elemento marcado recebe o foco depois de navegar', async () => {
      const botao = alvo('tamanho-do-dock');
      const roteador = abrir('/');
      await titulo('O que resolver agora');
      await roteador.navigate({ to: '/ajustes/dock', search: { foco: 'tamanho-do-dock' } });
      await titulo('Dock');
      await waitFor(() => expect(document.activeElement).toBe(botao));
    });

    it('com um foco desconhecido, o foco vai ao título, como em qualquer navegação', async () => {
      const roteador = abrir('/');
      await titulo('O que resolver agora');
      await roteador.navigate({ to: '/ajustes/dock', search: { foco: 'nao-existe' } });
      const secao = await titulo('Dock');
      await waitFor(() => expect(document.activeElement).toBe(secao));
    });

    it('abrir a página já com foco no endereço põe o foco no elemento marcado', async () => {
      const botao = alvo('tamanho-do-dock');
      abrir('/ajustes/dock?foco=tamanho-do-dock');
      await titulo('Dock');
      await waitFor(() => expect(document.activeElement).toBe(botao));
    });

    it('um foco com caracteres fora de letras, números e hífen é ignorado', async () => {
      alvo('a"]');
      abrir('/ajustes/dock?foco=a%22%5D');
      await titulo('Dock');
      await new Promise((resolver) => setTimeout(resolver, 50));
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe('menu do usuário', () => {
    const abrirOMenu = async (nome: string) => {
      fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: nome }));
      return screen.findByRole('menu', { name: nome });
    };
    const itens = (menu: HTMLElement) =>
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent);

    it('mostra as iniciais e o nome da conta, com "Conta", "Ajustes do Sistema" e "Sair"', async () => {
      abrir('/');
      await titulo('O que resolver agora');
      const usuario = within(screen.getByRole('banner')).getByRole('button', { name: 'Ana Souza' });
      expect(usuario.textContent).toBe('AS');
      expect(itens(await abrirOMenu('Ana Souza'))).toEqual(['Conta', 'Ajustes do Sistema', 'Sair']);
    });

    it('com foto, o item de usuário mostra a foto da pessoa da conta, com o nome dela', async () => {
      abrir('/', sessaoAtiva([], {}, {}, { foto: { id: '0199a6e0-0000-7000-8000-0000000000f1' } }));
      await titulo('O que resolver agora');
      const usuario = within(screen.getByRole('banner')).getByRole('button', { name: 'Ana Souza' });
      expect(usuario.querySelector('img')?.getAttribute('srcset')).toContain(
        '/api/conta/foto/0199a6e0-0000-7000-8000-0000000000f1/64 64w',
      );
    });

    it('"Conta" leva à seção Conta dos Ajustes', async () => {
      const roteador = abrir('/');
      await titulo('O que resolver agora');
      const menu = await abrirOMenu('Ana Souza');
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Conta' }));
      await waitFor(() => expect(roteador.state.location.pathname).toBe('/ajustes/conta'));
    });

    it('"Ajustes do Sistema" abre o app Ajustes', async () => {
      const roteador = abrir('/');
      await titulo('O que resolver agora');
      const menu = await abrirOMenu('Ana Souza');
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ajustes do Sistema' }));
      await titulo('Aparência');
      expect(roteador.state.location.pathname).toBe('/ajustes');
    });

    /** Uma sessão valendo, num servidor que responde ao "Sair" com `resposta`. */
    const sessaoQueSai = (resposta: () => Response, pedidos: Request[]) =>
      criarLojaDaSessao({
        buscar: async (pedido) => {
          pedidos.push(pedido);
          return resposta();
        },
        estado: {
          tipo: 'ativa',
          organizacao: 'Empresa de exemplo',
          conta: CONTA_DE_EXEMPLO,
          csrf: 'csrf-de-teste',
          expiraEm: '2099-01-01T00:00:00.000Z',
          acesso: { permissoes: [] },
        },
      });

    it('"Sair" encerra a sessão e recarrega a página', async () => {
      const recarregar = vi.spyOn(pagina, 'recarregar').mockImplementation(() => {});
      const pedidos: Request[] = [];
      abrir(
        '/',
        sessaoQueSai(() => new Response(null, { status: 204 }), pedidos),
      );
      await titulo('O que resolver agora');
      const menu = await abrirOMenu('Ana Souza');
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sair' }));
      await waitFor(() => expect(recarregar).toHaveBeenCalledTimes(1));
      // As notificações do sino, que a casca lê a cada sessão, ficam fora da conta.
      const daSaida = pedidos.filter(
        (pedido) => !new URL(pedido.url).pathname.startsWith('/api/notificacoes'),
      );
      expect(daSaida.map((pedido) => [pedido.method, new URL(pedido.url).pathname])).toEqual([
        ['DELETE', '/api/sessao'],
      ]);
      expect(daSaida[0]?.headers.get('x-grafite-csrf')).toBe('csrf-de-teste');
    });

    it('"Sair" sem conexão avisa e não recarrega', async () => {
      const recarregar = vi.spyOn(pagina, 'recarregar').mockImplementation(() => {});
      abrir(
        '/',
        sessaoQueSai(() => {
          throw new TypeError('Failed to fetch');
        }, []),
      );
      await titulo('O que resolver agora');
      const menu = await abrirOMenu('Ana Souza');
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sair' }));
      await waitFor(() =>
        expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
          'Sem conexão com o servidor. Tente de novo.',
        ),
      );
      expect(recarregar).not.toHaveBeenCalled();
    });

    it('com a sessão desconhecida, o avatar é neutro e o menu só tem "Ajustes do Sistema"', async () => {
      abrir('/', criarLojaDaSessao({ estado: { tipo: 'desconhecida' } }));
      await titulo('O que resolver agora');
      const usuario = within(screen.getByRole('banner')).getByRole('button', { name: 'Usuário' });
      expect(usuario.textContent).toBe('');
      expect(itens(await abrirOMenu('Usuário'))).toEqual(['Ajustes do Sistema']);
    });
  });

  it('mostra na barra o relógio e o item de rede', async () => {
    abrir('/');
    await titulo('O que resolver agora');
    const barra = within(screen.getByRole('banner'));
    expect(barra.getByRole('status')).toBeTruthy();
    expect(screen.getByRole('banner').querySelector('time')).not.toBeNull();
  });

  it('num endereço desconhecido, nenhum módulo fica marcado como atual', async () => {
    abrir('/endereco-que-nao-existe');
    await titulo('Página não encontrada');
    expect(within(await dock()).queryByRole('button', { current: 'page' })).toBeNull();
  });

  it('põe o dock na posição e no tamanho salvos', async () => {
    comPonteiroFino();
    abrir('/', sessaoAtiva([], {}, { dock: { posicao: 'direita', tamanho: 36 } }));
    const nav = await dock();
    expect(nav.getAttribute('data-posicao')).toBe('direita');
    expect(nav.style.getPropertyValue('--tamanho-item-dock')).toBe('36px');
  });
});

describe('o que exige permissão', () => {
  /** Um módulo que exige `pessoas.ver`, antes de Ajustes, só para o teste. */
  const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
  const exemplo = definirModulo({
    id: 'exemplo',
    nome: 'Exemplo',
    icone: Box,
    endereco: '/exemplo',
    prioridadeNoCelular: 5,
    rotas,
    permissoes: ['pessoas.ver'],
  });
  // Sem a Administração, que também aparece com `pessoas.ver`.
  const outros = REGISTRO.filter((modulo) => modulo.id !== 'administracao');
  const comExemplo = [...outros.slice(0, -1), exemplo, ...outros.slice(-1)];

  async function modulosNaCasca(sessao: LojaDaSessao) {
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }), comExemplo);
    render(<App roteador={roteador} sessao={sessao} />);
    await titulo('O que resolver agora');
    const noDock = within(await dock())
      .getAllByRole('button')
      .map((item) => item.getAttribute('aria-label'));
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
    const irPara = within(await screen.findByRole('dialog', { name: 'Busca' })).getByRole('group', {
      name: 'Ir para',
    });
    const naBusca = within(irPara)
      .getAllByRole('option')
      .map((opcao) => opcao.textContent);
    return { noDock, naBusca };
  }

  it('sem a permissão, o módulo não aparece no dock nem na busca', async () => {
    expect(await modulosNaCasca(sessaoAtiva())).toEqual({
      noDock: ['Início', 'Ajustes'],
      naBusca: ['Início', 'Ajustes'],
    });
  });

  it('com a permissão, mesmo só num local, o módulo aparece no dock e na busca', async () => {
    const sessao = sessaoAtiva([{ chave: 'pessoas.ver', organizacao: false, locais: ['jundiai'] }]);
    expect(await modulosNaCasca(sessao)).toEqual({
      noDock: ['Início', 'Exemplo', 'Ajustes'],
      naBusca: ['Início', 'Exemplo', 'Ajustes'],
    });
  });
});

// O módulo que é parte de outro segue o interruptor do dono (change gestao-de-ativos, design,
// decisão 2).
describe('o módulo que é parte de outro', () => {
  // As rotas do Salas, que estão na árvore, num módulo que é parte do Ativos, só para o teste.
  const salas = REGISTRO.find((modulo) => modulo.id === 'salas');
  if (!salas) throw new Error('O Salas sumiu do registro.');
  const exemplo: ModuloRegistrado = { ...salas, id: 'exemplo', nome: 'Exemplo', parteDe: 'ativos' };
  const comExemplo = REGISTRO.map((modulo) => (modulo.id === 'salas' ? exemplo : modulo));

  it('Gestão de ativos com o Ativos desligado: a parte some do dock, e a tela dela diz que o dono está desligado', async () => {
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/salas'] }), comExemplo);
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(
          naOrganizacao('ativos.ver'),
          {},
          {},
          {},
          {
            modulosDesligados: ['ativos'],
          },
        )}
      />,
    );
    expect(
      await screen.findByText('O módulo Ativos está desligado nesta organização.'),
    ).toBeTruthy();
    expect(within(await dock()).queryByRole('button', { name: 'Exemplo' })).toBeNull();
    expect(within(await dock()).queryByRole('button', { name: 'Ativos' })).toBeNull();
  });
});

// Os itens de menu que vêm dos dados (spec estrutura-da-casca, "Itens de menu dos dados"; change
// visoes-no-dock, design, decisão 2).
describe('os itens de menu dos dados', () => {
  /** Um módulo com as visões dos ativos no menu, só para o teste. */
  const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
  const exemplo = definirModulo({
    id: 'exemplo',
    nome: 'Exemplo',
    icone: Box,
    endereco: '/exemplo',
    prioridadeNoCelular: 5,
    rotas,
    menu: [{ rotulo: 'Tudo', destino: '/exemplo' }],
    menuDinamico: {
      permissoes: ['ativos.ver'],
      consultas: (api) => [consultaDasVisoes(api, 'ativos')],
      montar: ({ menu, ler, api }) => [
        ...menu,
        ...(ler(consultaDasVisoes(api, 'ativos'))?.visoes ?? []).map((visao) => ({
          rotulo: visao.nome,
          destino: `/exemplo?visao=${visao.id}` as const,
        })),
      ],
    },
    eventos: { 'visoes.mudaram': () => [chaveDasVisoes('ativos')] },
  });
  // Sem o Ativos, que também pede as visões.
  const outros = REGISTRO.filter((modulo) => modulo.id !== 'ativos');
  const comExemplo = [...outros.slice(0, -1), exemplo, ...outros.slice(-1)];

  const IMPRESSORAS: VisaoDaTabela = {
    id: '1c8d2e3f-4051-4b6c-9d7e-8f9a0b1c2d3e',
    nome: 'Impressoras',
    compartilhada: true,
    definicao: { colunas: [{ chave: 'ativo.rotulo' }], ordenacao: null, filtros: [] },
    permite: { editar: false },
  };

  const listaDeVisoes = (visoes: VisaoDaTabela[]) =>
    Response.json({ visoes, mudancas: [], permite: { compartilhar: false } });

  function abrirComExemplo(
    permissoes: PermissaoDaSessao[],
    servidor: ServidorDeTeste,
    { canal = criarCanalDeEventos(), desligados = [] as string[] } = {},
  ) {
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }), comExemplo);
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(permissoes, servidor, {}, {}, { modulosDesligados: desligados })}
        consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
        canal={canal}
      />,
    );
    return roteador;
  }

  async function menuDoExemplo() {
    fireEvent.keyDown(within(await dock()).getByRole('button', { name: 'Exemplo' }), {
      key: 'ArrowUp',
    });
    return screen.findByRole('menu', { name: 'Exemplo' });
  }

  it('o menu do dock mostra a visão, que abre a tela nela, e o item some com a visão removida', async () => {
    const canal = criarCanalDeEventos();
    let visoes = [IMPRESSORAS];
    const roteador = abrirComExemplo(
      naOrganizacao('ativos.ver'),
      { 'GET /api/visoes': () => listaDeVisoes(visoes) },
      { canal },
    );
    await titulo('O que resolver agora');
    const menu = await menuDoExemplo();
    fireEvent.click(await within(menu).findByRole('menuitem', { name: 'Impressoras' }));
    await waitFor(() =>
      expect(roteador.state.location.href).toBe(`/exemplo?visao=${IMPRESSORAS.id}`),
    );

    visoes = [];
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000011',
      tipo: 'visoes.mudaram',
      momento: '2026-10-14T12:00:00.000Z',
      alvo: { tipo: 'visao', id: IMPRESSORAS.id },
    });
    await waitFor(async () => {
      const deNovo = await menuDoExemplo();
      expect(
        within(deNovo)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual(['Tudo']);
    });
  });

  it('sem a permissão do menu dos dados, fica o menu fixo, e os dados não são pedidos', async () => {
    const pedidas = vi.fn(() => listaDeVisoes([IMPRESSORAS]));
    abrirComExemplo([], { 'GET /api/visoes': pedidas });
    await titulo('O que resolver agora');
    const menu = await menuDoExemplo();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Tudo']);
    expect(pedidas).not.toHaveBeenCalled();
  });

  it('com o módulo desligado, ele some do dock, e os dados do menu não são pedidos', async () => {
    const pedidas = vi.fn(() => listaDeVisoes([IMPRESSORAS]));
    abrirComExemplo(
      naOrganizacao('ativos.ver'),
      { 'GET /api/visoes': pedidas },
      { desligados: ['exemplo'] },
    );
    await titulo('O que resolver agora');
    expect(within(await dock()).queryByRole('button', { name: 'Exemplo' })).toBeNull();
    expect(pedidas).not.toHaveBeenCalled();
  });
});

// A ordem do dock e os módulos tirados dele (spec dock, "Ordem dos módulos e módulos fora do dock";
// change dock-personalizavel, design, decisão 2).
describe('a ordem do dock da conta', () => {
  const doApp = (id: string) => {
    const modulo = REGISTRO.find((candidato) => candidato.id === id);
    if (!modulo) throw new Error(`O módulo ${id} sumiu do registro.`);
    return modulo;
  };
  // As rotas do Salas e as do Cofre, que estão na árvore, em dois módulos sem permissão nem dados,
  // só para o teste; o Arquivo tem um menu na barra superior.
  const oficina: ModuloRegistrado = {
    id: 'oficina',
    nome: 'Oficina',
    icone: Box,
    endereco: '/salas',
    prioridadeNoCelular: 4,
    rotas: doApp('salas').rotas,
  };
  const arquivo: ModuloRegistrado = {
    id: 'arquivo',
    nome: 'Arquivo',
    icone: Box,
    endereco: '/cofre',
    prioridadeNoCelular: 5,
    rotas: doApp('cofre').rotas,
    menusDaBarra: [{ rotulo: 'Visualizar', itens: [{ rotulo: 'Tudo', destino: '/cofre' }] }],
  };
  const comExemplos = [doApp('inicio'), oficina, arquivo, doApp('ajustes')];

  const noDock = (id: string) => ({ id, visivel: true });
  const tirado = (id: string) => ({ id, visivel: false });

  function abrirComExemplos(
    preferencias: AjustesDasPreferencias,
    { endereco = '/ajustes', servidor = {} as ServidorDeTeste, canal = criarCanalDeEventos() } = {},
  ) {
    comPonteiroFino();
    const roteador = criarRoteador(
      createMemoryHistory({ initialEntries: [endereco] }),
      comExemplos,
    );
    render(
      <App roteador={roteador} sessao={sessaoAtiva([], servidor, preferencias)} canal={canal} />,
    );
    return roteador;
  }

  const nomesNoDock = async () =>
    within(await dock())
      .getAllByRole('button')
      .map((item) => item.getAttribute('aria-label'));

  it('sem a escolha, o dock segue o registro, sem o Mais', async () => {
    abrirComExemplos({});
    expect(await nomesNoDock()).toEqual(['Início', 'Oficina', 'Arquivo', 'Ajustes']);
  });

  it('Ordem escolhida: o dock segue a lista da conta, com Ajustes no fim', async () => {
    abrirComExemplos({ dock: { modulos: [noDock('arquivo'), noDock('inicio')] } });
    expect(await nomesNoDock()).toEqual(['Arquivo', 'Início', 'Oficina', 'Ajustes']);
  });

  it('o módulo tirado do dock fica no Mais, antes de Ajustes, e o Mais o abre', async () => {
    const roteador = abrirComExemplos({ dock: { modulos: [tirado('oficina')] } });
    expect(await nomesNoDock()).toEqual(['Início', 'Arquivo', 'Mais', 'Ajustes']);
    fireEvent.click(within(await dock()).getByRole('button', { name: 'Mais' }));
    const menu = await screen.findByRole('menu', { name: 'Mais' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Oficina' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/salas'));
    // O módulo aberto pelo Mais é o atual: o Mais o marca.
    await waitFor(async () =>
      expect(
        within(await dock())
          .getByRole('button', { name: 'Mais' })
          .getAttribute('aria-current'),
      ).toBe('page'),
    );
  });

  it('Módulo tirado continua na busca: a busca o oferece e o abre, e a barra traz os menus dele', async () => {
    const roteador = abrirComExemplos({ dock: { modulos: [tirado('arquivo')] } });
    await titulo('Aparência');
    expect(await nomesNoDock()).not.toContain('Arquivo');
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Buscar' }));
    const busca = await screen.findByRole('dialog', { name: 'Busca' });
    const campo = within(busca).getByRole('searchbox', { name: 'Buscar' });
    fireEvent.change(campo, { target: { value: 'arquivo' } });
    fireEvent.click(await within(busca).findByRole('option', { name: 'Arquivo' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/cofre'));
    const barra = within(screen.getByRole('banner'));
    await waitFor(() => expect(barra.getByRole('button', { name: 'Visualizar' })).toBeTruthy());
    expect(barra.getAllByText('Arquivo').length).toBeGreaterThan(0);
  });

  it('o dock muda sem recarregar quando a ordem chega de outra sessão da conta', async () => {
    const canal = criarCanalDeEventos();
    let daConta: AjustesDasPreferencias = {};
    const estado = async () => {
      const corpo = await estadoDaSessaoAtiva().json();
      corpo.sessao.conta.preferencias = daConta;
      return Response.json(corpo);
    };
    abrirComExemplos({}, { servidor: { 'GET /api/sessao': estado }, canal });
    expect(await nomesNoDock()).toEqual(['Início', 'Oficina', 'Arquivo', 'Ajustes']);
    // A conta arruma o dock em outro aparelho: sobe o Arquivo e tira a Oficina.
    daConta = { dock: { modulos: [noDock('arquivo'), noDock('inicio'), tirado('oficina')] } };
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000021',
      tipo: 'preferencias.mudaram',
      momento: '2026-11-10T12:00:00.000Z',
      alvo: { tipo: 'conta', id: CONTA_DE_EXEMPLO.id },
    });
    await waitFor(
      async () => expect(await nomesNoDock()).toEqual(['Arquivo', 'Início', 'Mais', 'Ajustes']),
      { timeout: 3000 },
    );
  });
});
