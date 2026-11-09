// As listas dos alertas (spec modulo-alertas, "Lista dos alertas abertos" e "Lista dos alertas
// resolvidos"; change p3a-regras-e-alertas, design, decisão 11): as colunas, a situação em texto, o
// reconhecer e o adiar, os filtros e a ordem no endereço, a linha que abre a ficha, a página
// seguinte e os estados vazios e de falha.
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Alerta = components['schemas']['AlertaNaLista'];
type Regra = components['schemas']['RegraDeAlerta'];

const MINUTO = 60_000;
// Meio minuto a mais: a idade não cai para o minuto de baixo quando a resposta chega depois.
const antes = (minutos: number) => new Date(Date.now() - (minutos + 0.5) * MINUTO).toISOString();

const IMPRESSORA_DO_RH = {
  tipo: 'ativo' as const,
  id: '0199d3a0-0000-7000-8000-0000000000a1',
  nome: 'Impressora do RH',
  patrimonio: 'PAT-00412',
  tipoDoAtivo: {
    id: '0199d3a0-0000-7000-8000-0000000000b1',
    nome: 'Impressora',
    icone: 'impressora' as const,
  },
  imagem: null,
  modelo: null,
};

const alerta = (id: string, mudancas: Partial<Alerta> = {}): Alerta => ({
  id,
  regra: { id: 'r-toner', nome: 'Toner em 10% ou menos' },
  condicao: 'toner.nivel',
  severidade: 'critico',
  texto: 'Toner preto em 8%',
  situacao: 'aberto',
  alvo: IMPRESSORA_DO_RH,
  abertoEm: antes(32),
  resolvidoEm: null,
  comoTerminou: null,
  reconhecido: null,
  adiado: null,
  silencio: null,
  permite: { tratar: true },
  ...mudancas,
});

const TONER = alerta('al-toner');
const PAPEL = alerta('al-papel', {
  regra: { id: 'r-papel', nome: 'Impressora pede atenção' },
  condicao: 'impressora.condicao',
  severidade: 'atencao',
  texto: 'Pouco papel',
  abertoEm: antes(7 * 60),
  reconhecido: { nome: 'Bruno Lima', em: antes(10) },
});
const COLETOR = alerta('al-coletor', {
  regra: { id: 'r-coletor', nome: 'Coletor sem contato' },
  condicao: 'coletor.sem-contato',
  texto: 'Coletor sem contato',
  alvo: { tipo: 'coletor', id: '0199d3a0-0000-7000-8000-0000000000c9', nome: 'Coletor de Jundiaí' },
  abertoEm: antes(15),
});

const regra = (id: string, nome: string): Regra => ({
  id,
  nome,
  condicao: 'toner.nivel',
  parametros: { limite: 10, folga: 5 },
  duracao: 0,
  severidade: 'critico',
  escopo: { tipo: 'organizacao', id: null, nome: null },
  excecoes: [],
  situacao: 'ativa',
  deFabrica: true,
  criadoEm: antes(1000),
  atualizadoEm: antes(1000),
});

const VE = naOrganizacao('alertas.ver');
const TRATA = naOrganizacao('alertas.tratar', 'alertas.ver');

/** O servidor dos alertas: a lista responde as páginas dadas e guarda os filtros de cada pedido. */
function servidorDosAlertas(
  paginas: { itens: Alerta[]; total?: number; proximo?: string | null }[],
) {
  const pedidos: URLSearchParams[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/alertas': (pedido) => {
      const parametros = new URL(pedido.url).searchParams;
      pedidos.push(parametros);
      const pagina = parametros.get('cursor') ? (paginas[1] ?? paginas[0]) : paginas[0];
      return Response.json({
        itens: pagina?.itens ?? [],
        total: pagina?.total ?? pagina?.itens.length ?? 0,
        proximo: pagina?.proximo ?? null,
      });
    },
    'GET /api/regras-de-alerta': () =>
      Response.json({
        regras: [
          regra('r-toner', 'Toner em 10% ou menos'),
          regra('r-papel', 'Impressora pede atenção'),
        ],
        permite: { cadastrar: false },
      }),
  };
  return { servidor, pedidos };
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

const grade = (nome: string) => screen.findByRole('grid', { name: nome });
const linhas = async (nome = 'Alertas abertos') =>
  within(await grade(nome))
    .getAllByRole('row')
    .slice(1);
const colunas = async (nome = 'Alertas abertos') =>
  within(await grade(nome))
    .getAllByRole('columnheader')
    .map((coluna) => coluna.textContent);

describe('lista dos alertas abertos', () => {
  it('mostra o total, as colunas e a situação de cada alerta em texto', async () => {
    // O servidor diz que quem só vê não trata nenhum deles.
    const soVe = (de: Alerta): Alerta => ({ ...de, permite: { tratar: false } });
    const { servidor } = servidorDosAlertas([
      { itens: [soVe(TONER), soVe(COLETOR), soVe(PAPEL)], total: 3 },
    ]);
    abrir('/alertas', servidor, VE);
    expect(await screen.findByText('3 abertos')).toBeTruthy();
    expect(await colunas()).toEqual([
      'Imagem',
      'Ativo',
      'Alerta',
      'Regra',
      'Há',
      'Severidade',
      'Situação',
    ]);
    const [toner, coletor, papel] = await linhas();
    expect(within(toner as HTMLElement).getByText('Impressora do RH')).toBeTruthy();
    expect(within(toner as HTMLElement).getByText('32 min')).toBeTruthy();
    // Situação do alerta: no selo, como nas outras tabelas (change tabelas-consistentes).
    const aberto = within(toner as HTMLElement).getByText('Aberto');
    expect(aberto.closest('[data-situacao]')?.getAttribute('data-situacao')).toBe('atencao');
    // A severidade em texto, com o ícone, e não só pela cor.
    const critico = within(toner as HTMLElement).getByText('Crítico');
    expect(critico.closest('[data-situacao]')?.getAttribute('data-situacao')).toBe('critico');
    expect(within(coletor as HTMLElement).getByText('Coletor de Jundiaí')).toBeTruthy();
    expect(
      within(papel as HTMLElement)
        .getByText('Reconhecido')
        .closest('[data-situacao]'),
    ).toBeTruthy();
    expect(within(papel as HTMLElement).getByText('por Bruno Lima')).toBeTruthy();
    expect(within(papel as HTMLElement).getByText('7 h')).toBeTruthy();
    // Quem só vê não trata.
    expect(screen.queryByRole('button', { name: 'Reconhecer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Adiar' })).toBeNull();
  });

  it('mostra o adiamento e o silêncio do ativo', async () => {
    const adiado = alerta('al-adiado', {
      adiado: { ate: '2026-10-14T17:30:00.000Z', nome: 'Ana Souza' },
      silencio: { ate: null, motivo: 'Em manutenção' },
    });
    const { servidor } = servidorDosAlertas([{ itens: [adiado] }]);
    abrir('/alertas', servidor, VE);
    const [linha] = await linhas();
    expect(
      within(linha as HTMLElement)
        .getByText('Adiado')
        .closest('[data-situacao]'),
    ).toBeTruthy();
    expect(within(linha as HTMLElement).getByText(/^até \d{2}:\d{2}$/)).toBeTruthy();
    expect(within(linha as HTMLElement).getByText('Ativo silenciado')).toBeTruthy();
  });

  it('quem trata reconhece e adia, com o retorno, e a lista lê de novo', async () => {
    const { servidor, pedidos } = servidorDosAlertas([{ itens: [TONER] }]);
    const reconhecimento = vi.fn(() =>
      Response.json({ reconhecido: { nome: 'Ana Souza', em: new Date().toISOString() } }),
    );
    let corpoDoAdiamento: unknown;
    const ate = new Date(Date.now() + 30 * MINUTO).toISOString();
    servidor['POST /api/alertas/al-toner/reconhecimento'] = reconhecimento;
    servidor['POST /api/alertas/al-toner/adiamento'] = async (pedido) => {
      corpoDoAdiamento = await pedido.json();
      return Response.json({ adiado: { ate, nome: 'Ana Souza' } });
    };
    abrir('/alertas', servidor, TRATA);
    await linhas();
    const lidas = pedidos.length;
    fireEvent.click(screen.getByRole('button', { name: 'Reconhecer' }));
    expect(await screen.findByText('Alerta reconhecido.')).toBeTruthy();
    expect(reconhecimento).toHaveBeenCalledOnce();
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(lidas));

    fireEvent.click(screen.getByRole('button', { name: 'Adiar' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      '15 minutos',
      '30 minutos',
      '1 hora',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: '30 minutos' }));
    expect(await screen.findByText(/^Alerta adiado até \d{2}:\d{2}\.$/)).toBeTruthy();
    expect(corpoDoAdiamento).toEqual({ minutos: 30 });
  });

  it('a recusa do servidor aparece no aviso', async () => {
    const { servidor } = servidorDosAlertas([{ itens: [TONER] }]);
    servidor['POST /api/alertas/al-toner/reconhecimento'] = () =>
      Response.json(
        {
          type: 'urn:grafite:problema:conflito',
          title: 'Conflito',
          status: 409,
          detail: 'O alerta já foi resolvido.',
          codigoDeRastreio: 'ABCD-1234',
        },
        { status: 409 },
      );
    abrir('/alertas', servidor, TRATA);
    await linhas();
    fireEvent.click(screen.getByRole('button', { name: 'Reconhecer' }));
    expect(await screen.findByText('O alerta já foi resolvido.')).toBeTruthy();
  });

  it('filtra pela severidade e pela regra, e ordena pelas colunas, no endereço', async () => {
    const { servidor, pedidos } = servidorDosAlertas([{ itens: [TONER] }]);
    const roteador = abrir('/alertas', servidor, VE);
    await linhas();
    expect(pedidos.at(-1)?.get('situacao')).toBe('abertos');
    fireEvent.click(screen.getByRole('button', { name: /Severidade/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Crítico' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('severidade')).toBe('critico'));
    fireEvent.click(screen.getByRole('button', { name: /Regra/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Impressora pede atenção' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('regra')).toBe('r-papel'));
    expect(roteador.state.location.search).toMatchObject({
      severidade: 'critico',
      regra: 'r-papel',
    });
    fireEvent.click(
      within(await grade('Alertas abertos')).getByRole('columnheader', { name: /Ativo/ }),
    );
    await waitFor(() => expect(pedidos.at(-1)?.get('ordem')).toBe('ativo'));
    expect(pedidos.at(-1)?.get('direcao')).toBe('asc');
  });

  it('a linha abre a ficha do ativo, e a do coletor, a tela dele', async () => {
    const { servidor } = servidorDosAlertas([{ itens: [TONER, COLETOR] }]);
    servidor[`GET /api/ativos/${IMPRESSORA_DO_RH.id}`] = () => new Response(null, { status: 500 });
    const roteador = abrir('/alertas', servidor, VE);
    fireEvent.click(await screen.findByText('Coletor de Jundiaí'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe(
        '/administracao/coletores/0199d3a0-0000-7000-8000-0000000000c9',
      ),
    );
  });

  it('traz a página seguinte com "Carregar mais"', async () => {
    const { servidor, pedidos } = servidorDosAlertas([
      { itens: [TONER], total: 2, proximo: 'cursor-2' },
      { itens: [PAPEL], total: 2 },
    ]);
    abrir('/alertas', servidor, VE);
    await linhas();
    fireEvent.click(await screen.findByRole('button', { name: /Carregar mais/ }));
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    expect(pedidos.at(-1)?.get('cursor')).toBe('cursor-2');
  });

  it('sem alertas, diz que nada está aberto; com filtros, oferece limpá-los', async () => {
    const { servidor } = servidorDosAlertas([{ itens: [] }]);
    abrir('/alertas', servidor, VE);
    expect(await screen.findByText('Nenhum alerta aberto.')).toBeTruthy();
    cleanup();
    const filtrado = servidorDosAlertas([{ itens: [] }]);
    abrir('/alertas?severidade=info', filtrado.servidor, VE);
    expect(await screen.findByText('Nenhum alerta com esses filtros.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(filtrado.pedidos.at(-1)?.get('severidade')).toBeNull());
  });

  it('com a falha da API, diz que não carregou e tenta de novo', async () => {
    const { servidor } = servidorDosAlertas([{ itens: [TONER] }]);
    let falhas = 1;
    const lista = servidor['GET /api/alertas'];
    servidor['GET /api/alertas'] = (pedido) => {
      if (falhas-- > 0) {
        return Response.json(
          {
            type: 'urn:grafite:problema:erro-interno',
            title: 'Erro interno',
            status: 500,
            detail: 'Erro.',
            codigoDeRastreio: 'ABCD-1234',
          },
          { status: 500 },
        );
      }
      return lista?.(pedido) ?? new Response(null, { status: 500 });
    };
    abrir('/alertas', servidor, VE);
    expect(await screen.findByText(/^Não foi possível carregar os alertas\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await linhas()).toHaveLength(1);
  });
});

describe('lista dos alertas resolvidos', () => {
  it('mostra quando abriu, quando terminou e como, do mais recente', async () => {
    const resolvido = alerta('al-resolvido', {
      situacao: 'resolvido',
      resolvidoEm: '2026-10-14T13:00:00.000Z',
      abertoEm: '2026-10-14T10:00:00.000Z',
      comoTerminou: 'voltou-ao-normal',
    });
    const encerrado = alerta('al-encerrado', {
      situacao: 'resolvido',
      resolvidoEm: '2026-10-14T12:00:00.000Z',
      abertoEm: '2026-10-14T09:00:00.000Z',
      comoTerminou: 'regra-deixou-de-valer',
    });
    const { servidor, pedidos } = servidorDosAlertas([{ itens: [resolvido, encerrado] }]);
    abrir('/alertas/resolvidos', servidor, VE);
    expect(await colunas('Alertas resolvidos')).toEqual([
      'Imagem',
      'Ativo',
      'Alerta',
      'Regra',
      'Abriu',
      'Terminou',
      'Como terminou',
      'Severidade',
    ]);
    const [primeira, segunda] = await linhas('Alertas resolvidos');
    expect(within(primeira as HTMLElement).getByText('Voltou ao normal')).toBeTruthy();
    expect(within(segunda as HTMLElement).getByText('A regra deixou de valer')).toBeTruthy();
    expect(pedidos.at(-1)?.get('situacao')).toBe('resolvidos');
  });

  it('o filtro do ativo vem do endereço, com o nome dele, e se limpa', async () => {
    const { servidor, pedidos } = servidorDosAlertas([{ itens: [] }]);
    abrir(
      `/alertas/resolvidos?ativo=${IMPRESSORA_DO_RH.id}&nomeDoAtivo=Impressora%20do%20RH`,
      servidor,
      VE,
    );
    expect(await screen.findByText('Nenhum alerta resolvido com esses filtros.')).toBeTruthy();
    expect(pedidos.at(-1)?.get('ativo')).toBe(IMPRESSORA_DO_RH.id);
    const ativos = screen.getByRole('group', { name: 'Filtros ativos' });
    expect(within(ativos).getByText('Impressora do RH')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('ativo')).toBeNull());
  });

  it('sem resolvidos, diz que não há nenhum', async () => {
    const { servidor } = servidorDosAlertas([{ itens: [] }]);
    abrir('/alertas/resolvidos', servidor, VE);
    expect(await screen.findByText('Nenhum alerta resolvido.')).toBeTruthy();
  });
});
