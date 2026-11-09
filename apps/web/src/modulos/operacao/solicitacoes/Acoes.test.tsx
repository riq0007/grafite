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
import {
  ALMOXARIFADO,
  CF258A,
  conserto,
  EXPEDICAO,
  haDias,
  PAT00412,
  type SolicitacaoDeTeste,
  servidorDasSolicitacoes,
  toner,
} from '../../../teste/solicitacoes.ts';

// As ações de cada solicitação na gaveta, pela linha da lista (spec modulo-operacao, "Tela das
// solicitações" e "Formulários das solicitações"; spec solicitacoes, "Situação da solicitação",
// "Pedido ao fornecedor" e "Entrega do toner"; change p4d-solicitacoes, design, decisão 8).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const PAT00415 = {
  id: 'pat00415',
  rotulo: 'HP LaserJet M404',
  patrimonio: 'PAT-00415',
  abrir: true,
};
const SUL = { id: 'sul', nome: 'Locadora Sul', abrir: true };

/** O toner 44: 2 pretos para a PAT-00412 e 1 para a PAT-00415. */
const tonerDeDuas = toner(44, {
  impressoras: [
    {
      ativo: PAT00412,
      contador: { paginas: 48210, lidoEm: haDias(3) },
      itens: [{ id: 'i44a', cor: 'preto', quantidade: 2, consumivel: CF258A, entrega: null }],
    },
    {
      ativo: PAT00415,
      contador: null,
      itens: [{ id: 'i44b', cor: 'preto', quantidade: 1, consumivel: CF258A, entrega: null }],
    },
  ],
});

const impressoraPara = (ativo: typeof PAT00412) => ({
  ativo,
  local: EXPEDICAO,
  contador: { paginas: 48210, lidoEm: haDias(0) },
  cores: [
    {
      cor: 'preto',
      sugerido: 'cf258a',
      compativeis: [{ id: 'cf258a', codigo: 'CF258A', nome: 'HP 58A', saldo: 7 }],
    },
    { cor: 'ciano', sugerido: null, compativeis: [] },
    { cor: 'magenta', sugerido: null, compativeis: [] },
    { cor: 'amarelo', sugerido: null, compativeis: [] },
    { cor: 'colorido', sugerido: null, compativeis: [] },
  ],
});

const saldo = (local: typeof ALMOXARIFADO, quantidade: number) => ({
  id: `saldo-${local.id}`,
  consumivel: { ...CF258A, tipo: 'toner', cor: 'preto', situacao: 'ativo' },
  local,
  saldo: quantidade,
  minimo: 0,
  situacao: quantidade > 0 ? 'em-estoque' : 'sem-estoque',
  abaixoDesde: null,
  permite: { movimentar: true },
});

const conflito = (campos: Record<string, string>) =>
  Response.json(
    {
      type: 'urn:grafite:problema:conflito',
      title: 'Conflito',
      status: 409,
      detail: Object.values(campos)[0],
      codigoDeRastreio: 'R7K2-9QXM',
      campos,
    },
    { status: 409 },
  );

/** As solicitações e as ações delas no servidor do teste, que guarda os pedidos. */
function servidorDasAcoes(
  solicitacoes: SolicitacaoDeTeste[],
  { saldos = [saldo(ALMOXARIFADO, 6), saldo(EXPEDICAO, 1)] } = {},
) {
  const { servidor: daLista, estado } = servidorDasSolicitacoes(solicitacoes);
  const corpos: Record<string, unknown[]> = {};
  const acao =
    (nome: string, depois: (s: SolicitacaoDeTeste, corpo: never) => Partial<SolicitacaoDeTeste>) =>
    async (pedido: Request) => {
      const numero = Number(new URL(pedido.url).pathname.split('/')[3]);
      const corpo = await pedido.json();
      corpos[`${nome} ${numero}`] = [...(corpos[`${nome} ${numero}`] ?? []), corpo];
      if (nome === 'entrega' && numero === 44) {
        return conflito({
          'entregas.1.quantidade': 'O saldo do CF258A em Jundiaí › Almoxarifado é 0.',
        });
      }
      const atual = estado.solicitacoes.find((s) => s.numero === numero);
      if (!atual) throw new Error(`A solicitação ${numero} não está no servidor.`);
      const nova = { ...atual, ...depois(atual, corpo as never) };
      estado.solicitacoes = estado.solicitacoes.map((s) => (s.numero === numero ? nova : s));
      return Response.json(nova);
    };
  const servidor: ServidorDeTeste = {
    ...daLista,
    'GET /api/solicitacoes/impressoras/pat00412': () => Response.json(impressoraPara(PAT00412)),
    'GET /api/solicitacoes/impressoras/pat00415': () => Response.json(impressoraPara(PAT00415)),
    'GET /api/estoque/saldos': () =>
      Response.json({
        itens: saldos,
        total: saldos.length,
        proximo: null,
        permite: { movimentar: true },
      }),
    'GET /api/fornecedores/escolha': () =>
      Response.json({ fornecedores: [{ id: 'sul', nome: 'Locadora Sul', cnpj: null }] }),
  };
  for (const s of solicitacoes) {
    servidor[`POST /api/solicitacoes/${s.numero}/pedido`] = acao('pedido', () => ({
      fornecedor: SUL,
      situacao: 'aguardando-entrega',
    }));
    servidor[`POST /api/solicitacoes/${s.numero}/entrega`] = acao('entrega', () => ({
      situacao: 'concluida',
    }));
    servidor[`POST /api/solicitacoes/${s.numero}/conclusao`] = acao('conclusao', () => ({
      situacao: 'concluida',
    }));
    servidor[`POST /api/solicitacoes/${s.numero}/cancelamento`] = acao('cancelamento', () => ({
      situacao: 'cancelada',
    }));
  }
  return { servidor, corpos, estado };
}

const ATENDE_E_MOVIMENTA = naOrganizacao(
  'solicitacoes.ver',
  'solicitacoes.atender',
  'estoque.ver',
  'estoque.movimentar',
);
const ATENDE = naOrganizacao('solicitacoes.ver', 'solicitacoes.atender');

function abrir(servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[] = ATENDE_E_MOVIMENTA) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/operacao/solicitacoes'] }),
  );
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

/** As ações que a linha oferece, pelo menu dela. */
async function acoesDa(numero: number) {
  fireEvent.click(await screen.findByRole('button', { name: `Ações da solicitação ${numero}` }));
  const menu = await screen.findByRole('menu');
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
}

/** Escolhe a ação no menu da linha e devolve a gaveta dela. */
async function abrirAcao(numero: number, acao: string, titulo: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Ações da solicitação ${numero}` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: acao }));
  return screen.findByRole('dialog', { name: titulo });
}

/** O item da entrega na gaveta, como "PAT-00412: 1 Preto". */
const itemDaEntrega = (gaveta: HTMLElement, nome: string) =>
  within(gaveta).findByRole('group', { name: nome });

describe('as ações da linha', () => {
  it('cada linha oferece as ações que o tipo e a situação permitem', async () => {
    const { servidor } = servidorDasAcoes([
      toner(42),
      conserto(45, { situacao: 'em-atendimento' }),
      toner(46, { permite: { atender: false } }),
    ]);
    abrir(servidor);
    expect(await acoesDa(42)).toEqual([
      'Alterar',
      'Pedir ao fornecedor',
      'Entregar',
      'Mudar a situação',
      'Cancelar',
    ]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(await acoesDa(45)).toEqual(['Alterar', 'Concluir', 'Mudar a situação', 'Cancelar']);
    expect(screen.queryByRole('button', { name: 'Ações da solicitação 46' })).toBeNull();
  });

  it('quem só vê não tem as ações', async () => {
    const { servidor } = servidorDasAcoes([toner(42, { permite: { atender: false } })]);
    abrir(servidor, naOrganizacao('solicitacoes.ver'));
    await screen.findByRole('grid', { name: 'Solicitações' });
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ações da solicitação 42' })).toBeNull();
  });
});

describe('a entrega na gaveta', () => {
  it('Entrega pela gaveta: o preto do estoque, com o CF258A e o local de maior saldo, e o retorno', async () => {
    const { servidor, corpos } = servidorDasAcoes([toner(42)]);
    abrir(servidor);
    const gaveta = await abrirAcao(42, 'Entregar', 'Entrega');
    const item = await itemDaEntrega(gaveta, 'PAT-00412: 1 Preto');
    expect(
      (within(item).getByRole('checkbox', { name: 'Entregar' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (within(item).getByRole('radio', { name: 'Do estoque' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(within(item).getByRole('button', { name: /Consumível/ }).textContent).toContain(
      'CF258A · HP 58A',
    );
    await waitFor(() =>
      expect(within(item).getByRole('button', { name: /Local de origem/ }).textContent).toContain(
        'Jundiaí › Almoxarifado · saldo 6',
      ),
    );
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Lançar a entrega' }));
    await waitFor(() => expect(avisos()).toContain('Entrega lançada.'));
    expect(corpos['entrega 42']).toEqual([
      {
        entregas: [{ item: 'i42', origem: 'estoque', consumivel: 'cf258a', local: 'almoxarifado' }],
      },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Entrega' })).toBeNull());
  });

  it('Entrega maior que o saldo: a recusa fica no item da PAT-00415, e nada é entregue', async () => {
    const { servidor, corpos } = servidorDasAcoes([tonerDeDuas], {
      saldos: [saldo(ALMOXARIFADO, 2)],
    });
    abrir(servidor);
    const gaveta = await abrirAcao(44, 'Entregar', 'Entrega');
    const segunda = await itemDaEntrega(gaveta, 'PAT-00415: 1 Preto');
    await waitFor(() =>
      expect(
        within(segunda).getByRole('button', { name: /Local de origem/ }).textContent,
      ).toContain('Jundiaí › Almoxarifado · saldo 2'),
    );
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Lançar a entrega' }));
    expect(
      await within(segunda).findByText('O saldo do CF258A em Jundiaí › Almoxarifado é 0.'),
    ).toBeTruthy();
    const primeira = await itemDaEntrega(gaveta, 'PAT-00412: 2 Preto');
    expect(within(primeira).queryByText(/O saldo do CF258A/)).toBeNull();
    expect(corpos['entrega 44']).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Entrega' })).toBeTruthy();
  });

  it('sem saldo nos locais em que a conta movimenta, o estoque diz que não há saldo', async () => {
    const { servidor } = servidorDasAcoes([toner(42)], { saldos: [] });
    abrir(servidor);
    const gaveta = await abrirAcao(42, 'Entregar', 'Entrega');
    const item = await itemDaEntrega(gaveta, 'PAT-00412: 1 Preto');
    expect(
      await within(item).findByText('Sem saldo nos locais em que você movimenta o estoque.'),
    ).toBeTruthy();
  });

  it('Toner que veio da locadora: com o pedido, o item vem pelo fornecedor do pedido', async () => {
    const { servidor, corpos } = servidorDasAcoes([
      toner(43, { situacao: 'aguardando-entrega', fornecedor: SUL, osDoFornecedor: '7781' }),
    ]);
    abrir(servidor);
    const gaveta = await abrirAcao(43, 'Entregar', 'Entrega');
    const item = await itemDaEntrega(gaveta, 'PAT-00412: 1 Preto');
    expect(
      (within(item).getByRole('radio', { name: 'Pelo fornecedor' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (within(item).getByRole('combobox', { name: 'Fornecedor' }) as HTMLInputElement).value,
    ).toBe('Locadora Sul');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Lançar a entrega' }));
    await waitFor(() => expect(avisos()).toContain('Entrega lançada.'));
    expect(corpos['entrega 43']).toEqual([
      {
        entregas: [{ item: 'i43', origem: 'fornecedor', fornecedor: 'sul', consumivel: 'cf258a' }],
      },
    ]);
  });

  it('Sem movimentar o estoque: o item só vem pelo fornecedor', async () => {
    const { servidor } = servidorDasAcoes([toner(42)]);
    abrir(servidor, ATENDE);
    const gaveta = await abrirAcao(42, 'Entregar', 'Entrega');
    const item = await itemDaEntrega(gaveta, 'PAT-00412: 1 Preto');
    expect(
      (within(item).getByRole('radio', { name: 'Pelo fornecedor' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (within(item).getByRole('radio', { name: 'Do estoque' }) as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('Cor sem compatível: o estoque não oferece o local sem o consumível, e a entrega o pede', async () => {
    const { servidor, corpos } = servidorDasAcoes([
      toner(42, {
        impressoras: [
          {
            ativo: PAT00412,
            contador: null,
            itens: [{ id: 'i42', cor: 'ciano', quantidade: 1, consumivel: null, entrega: null }],
          },
        ],
      }),
    ]);
    abrir(servidor);
    const gaveta = await abrirAcao(42, 'Entregar', 'Entrega');
    const item = await itemDaEntrega(gaveta, 'PAT-00412: 1 Ciano');
    expect(within(item).getByText('Nenhum compatível dessa cor.')).toBeTruthy();
    expect(within(item).queryByRole('button', { name: /Local de origem/ })).toBeNull();
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Lançar a entrega' }));
    expect(await within(item).findByText('Escolha o consumível.')).toBeTruthy();
    expect(corpos['entrega 42']).toBeUndefined();
  });

  it('sem nenhum item escolhido, pede os itens a entregar', async () => {
    const { servidor, corpos } = servidorDasAcoes([toner(42)]);
    abrir(servidor);
    const gaveta = await abrirAcao(42, 'Entregar', 'Entrega');
    const item = await itemDaEntrega(gaveta, 'PAT-00412: 1 Preto');
    fireEvent.click(within(item).getByRole('checkbox', { name: 'Entregar' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Lançar a entrega' }));
    expect(await within(gaveta).findByText('Escolha os itens a entregar.')).toBeTruthy();
    expect(corpos['entrega 42']).toBeUndefined();
  });
});

describe('o pedido, a conclusão e o cancelamento na gaveta', () => {
  it('Toner pedido à locadora: o fornecedor e a OS, com o retorno', async () => {
    const { servidor, corpos } = servidorDasAcoes([toner(42)]);
    abrir(servidor);
    const gaveta = await abrirAcao(42, 'Pedir ao fornecedor', 'Pedido ao fornecedor');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Registrar o pedido' }));
    expect(await within(gaveta).findByText('Escolha o fornecedor.')).toBeTruthy();
    const campo = within(gaveta).getByRole('combobox', { name: 'Fornecedor' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'sul' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Locadora Sul' }));
    fireEvent.change(within(gaveta).getByRole('textbox', { name: 'Número da OS' }), {
      target: { value: ' OS-7781 ' },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Registrar o pedido' }));
    await waitFor(() => expect(avisos()).toContain('Pedido ao fornecedor registrado.'));
    expect(corpos['pedido 42']).toEqual([{ fornecedor: 'sul', os: 'OS-7781' }]);
  });

  it('Notebook consertado: o que foi feito, com o retorno', async () => {
    const { servidor, corpos } = servidorDasAcoes([conserto(45, { situacao: 'em-atendimento' })]);
    abrir(servidor);
    const gaveta = await abrirAcao(45, 'Concluir', 'Conclusão');
    expect(within(gaveta).getByText('Solicitação 45 · Conserto · Joana Prado')).toBeTruthy();
    fireEvent.change(within(gaveta).getByRole('textbox', { name: 'O que foi feito' }), {
      target: { value: 'Fonte trocada' },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(avisos()).toContain('Solicitação concluída.'));
    expect(corpos['conclusao 45']).toEqual([{ oQueFoiFeito: 'Fonte trocada' }]);
  });

  it('Cancelamento sem o motivo: a recusa no motivo, e depois o cancelamento com ele', async () => {
    const { servidor, corpos } = servidorDasAcoes([toner(42)]);
    abrir(servidor);
    const gaveta = await abrirAcao(42, 'Cancelar', 'Cancelamento');
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar a solicitação' }));
    expect(await within(gaveta).findByText('Informe o motivo do cancelamento.')).toBeTruthy();
    expect(corpos['cancelamento 42']).toBeUndefined();
    fireEvent.change(within(gaveta).getByRole('textbox', { name: 'Motivo' }), {
      target: { value: 'Pedido em duplicidade' },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Cancelar a solicitação' }));
    await waitFor(() => expect(avisos()).toContain('Solicitação cancelada.'));
    expect(corpos['cancelamento 42']).toEqual([{ motivo: 'Pedido em duplicidade' }]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cancelamento' })).toBeNull());
  });
});
