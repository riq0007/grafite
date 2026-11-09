import { criarDataHora, filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import {
  ALMOXARIFADO,
  CF258A,
  conserto,
  EXPEDICAO,
  PAT00412,
  type SolicitacaoDeTeste,
  servidorDasSolicitacoes,
  toner,
} from '../../../teste/solicitacoes.ts';

// A ficha da solicitação, com as ações, a alteração e a mudança da situação de uma solicitação
// (spec modulo-operacao, "Ficha da solicitação" e "Formulários das solicitações"; spec
// solicitacoes, "Alteração da solicitação" e "Quem vê e quem atende as solicitações"; change
// p4d-solicitacoes, design, decisão 8).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const { formatarData, formatarHora, formatarDataEHora } = criarDataHora();

const LIDO_EM = '2026-10-21T17:02:00.000Z';
const ENTREGUE_EM = '2026-10-21T18:30:00.000Z';
const CARLA = { id: 'carla', nome: 'Carla Dias' };
const PAT00415 = {
  id: 'pat00415',
  rotulo: 'HP LaserJet M404',
  patrimonio: 'PAT-00415',
  abrir: true,
};

const entregueDoAlmoxarifado = {
  origem: 'estoque' as const,
  local: ALMOXARIFADO,
  movimento: 'm1',
  fornecedor: null,
  entreguePor: CARLA,
  entregueEm: ENTREGUE_EM,
};

/** O toner 42, concluído pela entrega do preto do Almoxarifado. */
const tonerEntregue = toner(42, {
  situacao: 'concluida',
  impressoras: [
    {
      ativo: PAT00412,
      contador: { paginas: 48210, lidoEm: LIDO_EM },
      itens: [
        {
          id: 'i42',
          cor: 'preto',
          quantidade: 1,
          consumivel: CF258A,
          entrega: entregueDoAlmoxarifado,
        },
      ],
    },
  ],
  encerradaPor: CARLA,
  encerradaEm: ENTREGUE_EM,
  permite: { atender: false },
});

/** O toner 47, com o preto da PAT-00412 entregue e o da PAT-00415 pendente. */
const tonerEmParte = toner(47, {
  situacao: 'aguardando-entrega',
  impressoras: [
    {
      ativo: PAT00412,
      contador: { paginas: 48210, lidoEm: LIDO_EM },
      itens: [
        {
          id: 'i47a',
          cor: 'preto',
          quantidade: 1,
          consumivel: CF258A,
          entrega: entregueDoAlmoxarifado,
        },
      ],
    },
    {
      ativo: PAT00415,
      contador: null,
      itens: [{ id: 'i47b', cor: 'preto', quantidade: 1, consumivel: CF258A, entrega: null }],
    },
  ],
});

const impressoraPara = (ativo: typeof PAT00412) => ({
  ativo,
  local: EXPEDICAO,
  contador: { paginas: 50100, lidoEm: '2026-10-22T09:00:00.000Z' },
  cores: [
    {
      cor: 'preto',
      sugerido: 'cf258a',
      compativeis: [{ id: 'cf258a', codigo: 'CF258A', nome: 'HP 58A', saldo: 6 }],
    },
    { cor: 'ciano', sugerido: null, compativeis: [] },
    { cor: 'magenta', sugerido: null, compativeis: [] },
    { cor: 'amarelo', sugerido: null, compativeis: [] },
    { cor: 'colorido', sugerido: null, compativeis: [] },
  ],
});

const naoEncontrada = () =>
  Response.json(
    {
      type: 'urn:grafite:problema:nao-encontrado',
      title: 'Não encontrado',
      status: 404,
      detail: 'Solicitação não encontrada.',
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status: 404 },
  );

/** As solicitações, cada uma também pela ficha, e a alteração, que guarda os pedidos. */
function servidorDaFicha(solicitacoes: SolicitacaoDeTeste[]) {
  const { servidor: daLista, estado, lotes } = servidorDasSolicitacoes(solicitacoes);
  const corpos: unknown[] = [];
  const servidor: ServidorDeTeste = {
    ...daLista,
    'GET /api/solicitacoes/9999': naoEncontrada,
    'GET /api/solicitacoes/impressoras/pat00412': () => Response.json(impressoraPara(PAT00412)),
    'GET /api/solicitacoes/impressoras/pat00415': () => Response.json(impressoraPara(PAT00415)),
    'GET /api/pessoas/nomes': () =>
      Response.json({
        pessoas: [{ id: 'joana', nome: 'Joana Prado', doMesmoLocal: true }],
        total: 1,
      }),
  };
  for (const { numero } of solicitacoes) {
    const atual = () => estado.solicitacoes.find((s) => s.numero === numero);
    servidor[`GET /api/solicitacoes/${numero}`] = () => {
      const s = atual();
      return s ? Response.json(s) : naoEncontrada();
    };
    servidor[`PATCH /api/solicitacoes/${numero}`] = async (pedido) => {
      corpos.push(await pedido.json());
      return Response.json(atual());
    };
  }
  return { servidor, corpos, lotes };
}

const VE = naOrganizacao('solicitacoes.ver', 'estoque.ver');
const ATENDE = naOrganizacao('solicitacoes.ver', 'solicitacoes.atender');

function abrir(endereco: string, servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[]) {
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
const ACOES = [
  'Alterar',
  'Pedir ao fornecedor',
  'Entregar',
  'Concluir',
  'Mudar a situação',
  'Cancelar',
];
/** A ficha com os dados que chegaram, depois do título da carga. */
const fichaCarregada = () => screen.findByText('Pedida por', { selector: 'dt' });

const acoesNaFicha = () =>
  ACOES.filter((acao) => screen.queryByRole('button', { name: acao }) !== null);

describe('a ficha da solicitação', () => {
  it('Toner entregue na ficha: a impressora com o contador congelado e o preto entregue do Almoxarifado, sem ações', async () => {
    const { servidor } = servidorDaFicha([tonerEntregue]);
    abrir('/operacao/solicitacoes/42', servidor, VE);
    await fichaCarregada();
    const titulo = screen.getByRole('heading', { level: 1, name: /Solicitação 42/ });
    expect(titulo.textContent).toContain('Concluída');
    const impressoras = screen.getByRole('region', { name: 'Impressoras' });
    const lido = new Date(LIDO_EM);
    expect(
      within(impressoras).getByRole('link', { name: 'HP LaserJet M404 · PAT-00412' }),
    ).toBeTruthy();
    expect(
      within(impressoras).getByText(
        `Total de páginas: 48.210, lido em ${formatarData(lido).slice(0, 5)} ${formatarHora(lido)}`,
      ),
    ).toBeTruthy();
    const item = within(impressoras).getByRole('listitem');
    expect(item.textContent).toContain('1 Preto');
    expect(item.textContent).toContain('CF258A · HP 58A');
    expect(item.textContent).toContain(
      `Entregue do estoque, de Jundiaí › Almoxarifado, por Carla Dias em ${formatarDataEHora(new Date(ENTREGUE_EM))}`,
    );
    expect(
      within(item).getByRole('link', { name: 'Ver nas movimentações' }).getAttribute('href'),
    ).toBe('/operacao/movimentacoes?ativo=pat00412&consumivel=cf258a');
    const concluida = screen.getByText('Concluída', { selector: 'dt' }).nextElementSibling;
    expect(concluida?.textContent).toContain('Carla Dias');
    expect(acoesNaFicha()).toEqual([]);
  });

  it('Quem só vê: os dados da pendente, sem as ações', async () => {
    const { servidor } = servidorDaFicha([toner(43, { permite: { atender: false } })]);
    abrir('/operacao/solicitacoes/43', servidor, VE);
    await fichaCarregada();
    expect(screen.getByText('Joana Prado')).toBeTruthy();
    expect(screen.getByText('Pendente')).toBeTruthy();
    expect(acoesNaFicha()).toEqual([]);
  });

  it('Ações do conserto: Alterar, Concluir, Mudar a situação e Cancelar, sem Entregar e sem Pedir ao fornecedor', async () => {
    const { servidor } = servidorDaFicha([conserto(45, { situacao: 'em-atendimento' })]);
    abrir('/operacao/solicitacoes/45', servidor, ATENDE);
    await fichaCarregada();
    expect(screen.getByRole('link', { name: 'Dell Latitude 5440 · NB-0031' })).toBeTruthy();
    expect(screen.getByText('Não liga')).toBeTruthy();
    expect(acoesNaFicha()).toEqual(['Alterar', 'Concluir', 'Mudar a situação', 'Cancelar']);
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(await screen.findByRole('dialog', { name: 'Conclusão' })).toBeTruthy();
  });

  it('Solicitação que não existe: a ficha diz que ela não foi encontrada', async () => {
    const { servidor } = servidorDaFicha([]);
    abrir('/operacao/solicitacoes/9999', servidor, VE);
    expect(await screen.findByText('Solicitação não encontrada.')).toBeTruthy();
  });

  it('o número que não é número também não é encontrado, sem pedir à API', async () => {
    const { servidor } = servidorDaFicha([]);
    abrir('/operacao/solicitacoes/abc', servidor, VE);
    expect(await screen.findByText('Solicitação não encontrada.')).toBeTruthy();
  });

  it('a linha da lista abre a ficha', async () => {
    const { servidor } = servidorDaFicha([toner(42)]);
    const roteador = abrir('/operacao/solicitacoes', servidor, ATENDE);
    fireEvent.click(await screen.findByText('PAT-00412: 1 Preto'));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/solicitacoes/42'));
  });
});

describe('a alteração e a mudança da situação', () => {
  it('a alteração: o item entregue fica como estava, e a quantidade pendente muda, com o retorno', async () => {
    const { servidor, corpos } = servidorDaFicha([tonerEmParte]);
    abrir('/operacao/solicitacoes/47', servidor, ATENDE);
    fireEvent.click(await screen.findByRole('button', { name: 'Alterar' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Alterar a solicitação 47' });
    expect(within(gaveta).queryByRole('radio', { name: 'Conserto' })).toBeNull();
    await waitFor(() =>
      expect(
        (within(gaveta).getByRole('combobox', { name: 'Pedida por' }) as HTMLInputElement).value,
      ).toBe('Joana Prado'),
    );
    const entregue = await within(gaveta).findByRole('group', {
      name: 'HP LaserJet M404 · PAT-00412',
    });
    const pretoEntregue = within(entregue).getByRole('textbox', {
      name: 'Preto',
    }) as HTMLInputElement;
    expect(pretoEntregue.value).toBe('1');
    expect(pretoEntregue.readOnly).toBe(true);
    expect(within(entregue).getByText('Entregue')).toBeTruthy();
    expect(within(entregue).queryByRole('button', { name: 'Tirar a PAT-00412' })).toBeNull();
    const pendente = await within(gaveta).findByRole('group', {
      name: 'HP LaserJet M404 · PAT-00415',
    });
    const preto = within(pendente).getByRole('textbox', { name: 'Preto' }) as HTMLInputElement;
    expect(preto.value).toBe('1');
    fireEvent.change(preto, { target: { value: '2' } });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(avisos()).toContain('Solicitação alterada.'));
    expect(corpos).toEqual([
      {
        tipo: 'toner',
        pessoa: 'joana',
        observacao: null,
        impressoras: ['pat00412', 'pat00415'],
        itens: [{ impressora: 'pat00415', cor: 'preto', quantidade: 2, consumivel: 'cf258a' }],
      },
    ]);
  });

  it('a mudança da situação oferece só as situações a que a solicitação pode passar', async () => {
    const { servidor, lotes } = servidorDaFicha([conserto(45, { situacao: 'em-atendimento' })]);
    abrir('/operacao/solicitacoes/45', servidor, ATENDE);
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar a situação' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Mudar a situação' });
    expect(within(gaveta).getByText('Solicitação 45 · Conserto · Joana Prado')).toBeTruthy();
    expect(
      within(gaveta)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Concluída', 'Cancelada']);
    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Concluída' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    await waitFor(() => expect(avisos()).toContain('1 solicitação mudou.'));
    expect(lotes).toEqual([{ numeros: [45], situacao: 'concluida' }]);
  });
});
