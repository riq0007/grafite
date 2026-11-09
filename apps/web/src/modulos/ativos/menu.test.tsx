// O menu do Ativos no dock com os dados (spec modulo-ativos, "Ativos no dock"; spec
// visoes-de-tabela, "Visões fixadas no menu"; change visoes-no-dock, design, decisão 2).
import type { components } from '@grafite/api-client';
import { type AjustesDasPreferencias, type Permissao, resolverPreferencias } from '@grafite/domain';
import { filaDeAvisos, iconeDoTipo } from '@grafite/ui';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { criarCliente } from '../../api/cliente.ts';
import { comOsMenusDinamicos } from '../../casca/menusDinamicos.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import { registroDaConta } from '../registroDaConta.ts';
import type { ConsultaDoMenu } from '../tipos.ts';
import { ativos } from './modulo.ts';
import { abrir, servidorDeAtivos, tabela } from './tabela/teste.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

type Visao = components['schemas']['VisaoDaTabela'];
type Tipo = components['schemas']['TipoDeAtivo'];

const visao = (id: string, nome: string, compartilhada: boolean): Visao => ({
  id,
  nome,
  compartilhada,
  definicao: { colunas: [{ chave: 'ativo.rotulo' }], ordenacao: null, filtros: [] },
  permite: { editar: !compartilhada },
});

const DE_JUNDIAI = visao('1c8d2e3f-4051-4b6c-9d7e-8f9a0b1c2d3e', 'Impressoras de Jundiaí', true);
const DO_CPD = visao('2d9e3f4a-5162-4c7d-8e8f-9a0b1c2d3e4f', 'Switches do CPD', true);
const MEUS_NOTEBOOKS = visao('3e0f4a5b-6273-4d8e-9f0a-0b1c2d3e4f5a', 'Meus notebooks', false);
/** Uma visão que não está mais na lista da API: removida, ou que a conta não pode mais usar. */
const SUMIU = '4f1a5b6c-7384-4e9f-8a1b-1c2d3e4f5a6b';

const tipo = (id: string, nome: string, extras: Partial<Tipo> = {}): Tipo => ({
  id,
  nome,
  icone: 'impressora',
  capacidades: [],
  configuracaoDasCapacidades: {},
  primeiroCartao: null,
  campos: [],
  situacao: 'ativo',
  permite: { editar: false },
  ...extras,
});

const IMPRESSORA = tipo('impressora', 'Impressora');
const SWITCH = tipo('switch', 'Switch', { icone: 'switch' });
const FAX = tipo('fax', 'Fax', { icone: 'generico', situacao: 'inativo' });

const api = criarCliente({
  csrf: () => null,
  aoPerderASessao: () => {},
  aoMudarOAcesso: () => {},
});

const SO_VER: Permissao[] = ['ativos.ver'];

/** O menu do Ativos de quem só vê ativos, com as camadas das preferências e os dados dados. */
function menuCom({
  organizacao = {},
  conta = {},
  visoes = [DE_JUNDIAI, DO_CPD, MEUS_NOTEBOOKS],
  tipos = [IMPRESSORA, SWITCH, FAX],
}: {
  organizacao?: AjustesDasPreferencias;
  conta?: AjustesDasPreferencias;
  /** Nenhuma enquanto carregam. */
  visoes?: Visao[] | null;
  tipos?: Tipo[] | null;
}) {
  const pode = (chave: Permissao) => SO_VER.includes(chave);
  const ler = <TDado,>(consulta: ConsultaDoMenu<TDado>) => {
    const [chave] = consulta.queryKey;
    const dado =
      chave === 'visoes' && visoes
        ? { visoes, mudancas: [], permite: { compartilhar: false } }
        : chave === 'tipos-de-ativo' && tipos
          ? { tipos, permite: { cadastrar: false } }
          : undefined;
    return dado as TDado | undefined;
  };
  const [modulo] = comOsMenusDinamicos(registroDaConta([ativos], pode), {
    ler,
    api,
    preferencias: resolverPreferencias(organizacao, conta),
    pode,
  });
  return modulo?.menu;
}

const fixadas = (camada: 'fixadas' | 'fixadasPelaOrganizacao', ids: string[]) => ({
  tabelas: { [camada]: { ativos: ids } },
});

describe('o menu do Ativos com os dados', () => {
  it('Só os ativos: "Todos os ativos", os tipos ativos direto no menu e, depois de uma linha, as fixadas pela organização, na ordem, e as da conta, sem repetir', () => {
    expect(
      menuCom({
        organizacao: fixadas('fixadasPelaOrganizacao', [DO_CPD.id, DE_JUNDIAI.id]),
        conta: fixadas('fixadas', [MEUS_NOTEBOOKS.id, DO_CPD.id]),
      }),
    ).toEqual([
      { rotulo: 'Todos os ativos', destino: '/ativos' },
      {
        rotulo: 'Impressora',
        destino: '/ativos?origem=tipo:impressora',
        icone: iconeDoTipo('impressora'),
      },
      { rotulo: 'Switch', destino: '/ativos?origem=tipo:switch', icone: iconeDoTipo('switch') },
      { rotulo: 'Switches do CPD', destino: `/ativos?visao=${DO_CPD.id}`, separadoAntes: true },
      { rotulo: 'Impressoras de Jundiaí', destino: `/ativos?visao=${DE_JUNDIAI.id}` },
      { rotulo: 'Meus notebooks', destino: `/ativos?visao=${MEUS_NOTEBOOKS.id}` },
    ]);
  });

  it('a fixada que saiu da lista da API, removida ou que a conta não pode mais usar, sai do menu', () => {
    const rotulos = menuCom({ conta: fixadas('fixadas', [SUMIU, MEUS_NOTEBOOKS.id]) })?.map(
      (item) => item.rotulo,
    );
    expect(rotulos).toEqual(['Todos os ativos', 'Impressora', 'Switch', 'Meus notebooks']);
  });

  it('sem tipo ativo, ou enquanto os dados carregam, o menu sai sem os tipos e sem as fixadas', () => {
    expect(menuCom({ tipos: [FAX] })?.map((item) => item.rotulo)).toEqual(['Todos os ativos']);
    expect(
      menuCom({
        conta: fixadas('fixadas', [MEUS_NOTEBOOKS.id]),
        visoes: null,
        tipos: null,
      })?.map((item) => item.rotulo),
    ).toEqual(['Todos os ativos']);
  });
});

/** Abre o menu do Ativos pelo teclado, no item do dock. */
async function menuDoDock() {
  const dock = await screen.findByRole('navigation', { name: 'Dock' });
  fireEvent.keyDown(within(dock).getByRole('button', { name: 'Ativos' }), { key: 'ArrowUp' });
  return screen.findByRole('menu', { name: 'Ativos' });
}

const nomes = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);

describe('o menu do Ativos no dock', () => {
  it('Impressoras pelo menu: "Ativos › Impressora" abre a tabela com a origem do tipo', async () => {
    const { servidor } = servidorDeAtivos();
    servidor['GET /api/tipos-de-ativo/impressora/resumo'] = () =>
      Response.json({
        id: 'impressora',
        nome: 'Impressora',
        icone: 'impressora',
        situacao: 'ativo',
        ativos: { quantos: 2, recortada: false },
      });
    const roteador = abrir('/', servidor, [{ chave: 'ativos.ver', organizacao: true, locais: [] }]);
    await screen.findByRole('heading', { level: 1, name: 'O que resolver agora' });
    const menu = await menuDoDock();
    await waitFor(() => expect(nomes(menu)).toEqual(['Todos os ativos', 'Impressora', 'Switch']));
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Impressora' }));
    await waitFor(() =>
      expect(roteador.state.location.search).toMatchObject({ origem: 'tipo:impressora' }),
    );
    await tabela();
    const daOrigem = await screen.findByRole('group', { name: 'Origem da tabela' });
    await waitFor(() => expect(daOrigem.textContent).toContain('Ativos do tipo Impressora'));
  });

  it('Tipo inativado: o tipo sai do menu do Ativos sem recarregar', async () => {
    const { servidor } = servidorDeAtivos();
    const original = servidor['GET /api/tipos-de-ativo'];
    let switchInativo = false;
    servidor['GET /api/tipos-de-ativo'] = async (pedido) => {
      const resposta = await original?.(pedido);
      const corpo = (await resposta?.json()) as { tipos: { id: string; situacao: string }[] };
      return Response.json({
        ...corpo,
        tipos: corpo.tipos.map((um) =>
          um.id === 'switch' && switchInativo ? { ...um, situacao: 'inativo' } : um,
        ),
      });
    };
    const canal = criarCanalDeEventos();
    abrir('/', servidor, [{ chave: 'ativos.ver', organizacao: true, locais: [] }], canal);
    await screen.findByRole('heading', { level: 1, name: 'O que resolver agora' });
    await waitFor(async () =>
      expect(nomes(await menuDoDock())).toEqual(['Todos os ativos', 'Impressora', 'Switch']),
    );
    switchInativo = true;
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000021',
      tipo: 'catalogo.mudou',
      momento: '2026-10-29T12:00:00.000Z',
      alvo: { tipo: 'tipo', id: 'switch' },
    });
    await waitFor(async () =>
      expect(nomes(await menuDoDock())).toEqual(['Todos os ativos', 'Impressora']),
    );
  });

  it('a visão fixada pela conta aparece no menu e abre a tabela nela', async () => {
    const { servidor } = servidorDeAtivos();
    servidor['GET /api/visoes'] = () =>
      Response.json({
        visoes: [DE_JUNDIAI, MEUS_NOTEBOOKS],
        mudancas: [],
        permite: { compartilhar: false },
      });
    const roteador = abrir(
      '/',
      servidor,
      [{ chave: 'ativos.ver', organizacao: true, locais: [] }],
      undefined,
      fixadas('fixadas', [MEUS_NOTEBOOKS.id]),
    );
    await screen.findByRole('heading', { level: 1, name: 'O que resolver agora' });
    const menu = await menuDoDock();
    await waitFor(() =>
      expect(nomes(menu)).toEqual(['Todos os ativos', 'Impressora', 'Switch', 'Meus notebooks']),
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Meus notebooks' }));
    await waitFor(() =>
      expect(roteador.state.location.search).toMatchObject({ visao: MEUS_NOTEBOOKS.id }),
    );
    await tabela();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Visão/ }).textContent).toContain(
        'Meus notebooks',
      ),
    );
  });
});
