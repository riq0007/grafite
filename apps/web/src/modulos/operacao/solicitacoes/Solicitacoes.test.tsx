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
import {
  conserto,
  equipamento,
  PAT00412,
  servidorDasSolicitacoes,
  toner,
} from '../../../teste/solicitacoes.ts';

// A tela das solicitações (spec modulo-operacao, "Tela das solicitações" e "Operação atualizada
// pelos eventos"; spec solicitacoes, "Mudança da situação em lote"; change p4d-solicitacoes,
// design, decisão 8).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const ATENDE = naOrganizacao('solicitacoes.ver', 'solicitacoes.atender');
const VE = naOrganizacao('solicitacoes.ver');

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[] = ATENDE,
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

const tabela = () => screen.findByRole('grid', { name: 'Solicitações' });
const linhas = async () =>
  within(await tabela())
    .getAllByRole('row')
    .slice(1);
const textoDasLinhas = async () => (await linhas()).map((linha) => linha.textContent);
/** A linha da solicitação pelo número, na primeira célula. */
const linhaDa = async (numero: number) => {
  const linha = (await linhas()).find(
    (atual) => within(atual).getAllByRole('rowheader')[0]?.textContent === String(numero),
  );
  if (!linha) throw new Error(`A solicitação ${numero} não está na lista.`);
  return linha;
};
const selecionar = async (numero: number) =>
  fireEvent.click(within(await linhaDa(numero)).getByText(String(numero)), { ctrlKey: true });

describe('a tela das solicitações', () => {
  it('mostra o número, o tipo, a situação, quem pediu, o pedido, os locais, o fornecedor e quando foi registrada', async () => {
    const { servidor } = servidorDasSolicitacoes([
      toner(42, {
        fornecedor: { id: 'sul', nome: 'Locadora Sul', abrir: true },
        osDoFornecedor: '5555',
      }),
      conserto(43, { situacao: 'em-atendimento' }),
      equipamento(44, { situacao: 'aguardando-entrega' }),
    ]);
    abrir('/operacao/solicitacoes', servidor);
    const cabecalhos = within(await tabela())
      .getAllByRole('columnheader')
      .map((coluna) => coluna.textContent);
    expect(cabecalhos).toEqual([
      'Número',
      'Tipo',
      'Situação',
      'Pedida por',
      'Pedido',
      'Locais',
      'Fornecedor',
      'Registrada',
      'Ações',
    ]);
    const [primeira, segunda, terceira] = await textoDasLinhas();
    for (const texto of [
      '42',
      'Toner',
      'Aberta',
      'Joana Prado',
      'PAT-00412: 1 Preto',
      'Jundiaí › Expedição',
      'Locadora Sul · OS 5555',
      'Há 3 d',
    ]) {
      expect(primeira).toContain(texto);
    }
    expect(segunda).toContain('Conserto');
    expect(segunda).toContain('Em atendimento');
    expect(segunda).toContain('NB-0031: Não liga');
    expect(terceira).toContain('Equipamento');
    expect(terceira).toContain('Aguardando entrega');
    expect(terceira).toContain('2 Notebook');
    expect(screen.getByText('3 solicitações')).toBeTruthy();
  });

  it('Pendentes por padrão: o filtro diz "Pendentes", e "Todas" traz as encerradas', async () => {
    const { servidor, pedidos } = servidorDasSolicitacoes([
      toner(42),
      conserto(43, { situacao: 'concluida' }),
      equipamento(44, { situacao: 'cancelada' }),
    ]);
    const roteador = abrir('/operacao/solicitacoes', servidor, VE);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(pedidos[0]?.get('situacao')).toBeNull();
    const filtro = screen.getByRole('button', { name: /Situação/ });
    expect(filtro.textContent).toContain('Pendentes');
    fireEvent.click(filtro);
    fireEvent.click(await screen.findByRole('option', { name: 'Todas' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(3));
    expect(roteador.state.location.search).toMatchObject({ situacao: 'todas' });
    expect(pedidos.at(-1)?.get('situacao')).toBe('todas');
    const textos = await textoDasLinhas();
    expect(textos[1]).toContain('Concluída');
    expect(textos[2]).toContain('Cancelada');
  });

  it('Busca pelo patrimônio: a lista mostra as da PAT-00412, e o endereço guarda a busca', async () => {
    const { servidor, pedidos } = servidorDasSolicitacoes([toner(42), conserto(43)]);
    const roteador = abrir('/operacao/solicitacoes', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar nas solicitações' }), {
      target: { value: '00412' },
    });
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect((await textoDasLinhas())[0]).toContain(PAT00412.patrimonio);
    expect(roteador.state.location.search).toMatchObject({ busca: '00412' });
    expect(pedidos.at(-1)?.get('busca')).toBe('00412');
    const filtros = screen.getByRole('group', { name: 'Filtros ativos' });
    expect(within(filtros).getByText(/00412/)).toBeTruthy();
  });

  it('filtra pelo tipo e pelo local do endereço', async () => {
    const { servidor, pedidos } = servidorDasSolicitacoes([toner(42), conserto(43)]);
    abrir('/operacao/solicitacoes?tipo=conserto&local=expedicao', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(pedidos[0]?.get('tipo')).toBe('conserto');
    expect(pedidos[0]?.get('local')).toBe('expedicao');
    const filtros = screen.getByRole('group', { name: 'Filtros ativos' });
    expect(within(filtros).getByText(/Conserto/)).toBeTruthy();
  });

  it('Primeira solicitação: sem nenhuma, diz que não há solicitação ainda e oferece "Nova solicitação"', async () => {
    const { servidor } = servidorDasSolicitacoes([]);
    const roteador = abrir('/operacao/solicitacoes', servidor);
    expect(await screen.findByText('Nenhuma solicitação ainda.')).toBeTruthy();
    const [nova] = screen.getAllByRole('button', { name: 'Nova solicitação' });
    if (nova) fireEvent.click(nova);
    await waitFor(() => expect(roteador.state.location.search).toMatchObject({ nova: 'toner' }));
  });

  it('Nenhuma pendente: diz que não há pendente e oferece "Ver todas", que mostra as encerradas', async () => {
    const { servidor } = servidorDasSolicitacoes([conserto(43, { situacao: 'concluida' })]);
    const roteador = abrir('/operacao/solicitacoes', servidor, VE);
    expect(await screen.findByText('Nenhuma solicitação pendente.')).toBeTruthy();
    expect(screen.queryByText('Nenhuma solicitação ainda.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(roteador.state.location.search).toMatchObject({ situacao: 'todas' });
  });

  it('com os filtros sem resultado, diz que não há solicitação com esses filtros e limpa os filtros', async () => {
    const { servidor } = servidorDasSolicitacoes([toner(42)]);
    const roteador = abrir('/operacao/solicitacoes?tipo=equipamento', servidor);
    expect(await screen.findByText('Nenhuma solicitação com esses filtros.')).toBeTruthy();
    // O botão do vazio, dentro da tabela; a faixa dos filtros ativos tem o dela.
    fireEvent.click(within(await tabela()).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(roteador.state.location.search).toEqual({});
  });

  it('carrega mais pelo cursor, e a seleção continua', async () => {
    const { servidor } = servidorDasSolicitacoes([toner(42), toner(41), toner(40)], {
      porPagina: 2,
    });
    abrir('/operacao/solicitacoes', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    await selecionar(42);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(3));
    const acoes = screen.getByRole('toolbar', { name: 'Ações da seleção' });
    expect(within(acoes).getByText('1 selecionado')).toBeTruthy();
  });

  it('Lote pela lista: três Abertas para Em atendimento, com o retorno, e a seleção limpa', async () => {
    const { servidor, lotes } = servidorDasSolicitacoes([toner(42), toner(41), conserto(40)]);
    abrir('/operacao/solicitacoes', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(3));
    for (const numero of [42, 41, 40]) await selecionar(numero);
    const acoes = screen.getByRole('toolbar', { name: 'Ações da seleção' });
    expect(within(acoes).getByText('3 selecionados')).toBeTruthy();
    fireEvent.click(within(acoes).getByRole('button', { name: 'Mudar a situação' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Mudar a situação' });
    expect(within(gaveta).getByText('3 solicitações selecionadas')).toBeTruthy();
    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Em atendimento' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
        '3 solicitações mudaram.',
      ),
    );
    expect(lotes).toEqual([{ numeros: [40, 41, 42], situacao: 'em-atendimento' }]);
    await waitFor(async () => {
      for (const texto of await textoDasLinhas()) expect(texto).toContain('Em atendimento');
    });
    expect(screen.queryByRole('dialog', { name: 'Mudar a situação' })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Ações da seleção' })).toBeNull();
  });

  it('Uma que não pode mudar: o retorno diz qual ficou como estava', async () => {
    const { servidor } = servidorDasSolicitacoes([
      conserto(43),
      conserto(42, { situacao: 'em-atendimento' }),
    ]);
    abrir('/operacao/solicitacoes', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    await selecionar(43);
    await selecionar(42);
    fireEvent.click(screen.getByRole('button', { name: 'Mudar a situação' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Mudar a situação' });
    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Em atendimento' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
        '1 solicitação mudou. A 42 não: já está em atendimento.',
      ),
    );
  });

  it('o lote pede a situação, e o cancelamento, o motivo', async () => {
    const { servidor, lotes } = servidorDasSolicitacoes([conserto(43)]);
    abrir('/operacao/solicitacoes', servidor);
    await selecionar(43);
    fireEvent.click(screen.getByRole('button', { name: 'Mudar a situação' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Mudar a situação' });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    expect(await within(gaveta).findByText('Escolha a situação.')).toBeTruthy();
    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Cancelada' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    expect(await within(gaveta).findByText('Informe o motivo do cancelamento.')).toBeTruthy();
    fireEvent.change(within(gaveta).getByRole('textbox', { name: /Motivo do cancelamento/ }), {
      target: { value: 'Pedido em duplicidade' },
    });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    await waitFor(() =>
      expect(lotes).toEqual([
        { numeros: [43], situacao: 'cancelada', motivo: 'Pedido em duplicidade' },
      ]),
    );
  });

  it('Quem só vê: a lista, sem a seleção nem a "Nova solicitação"', async () => {
    const { servidor } = servidorDasSolicitacoes([toner(42, { permite: { atender: false } })]);
    abrir('/operacao/solicitacoes', servidor, VE);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    await selecionar(42);
    expect(screen.queryByRole('toolbar', { name: 'Ações da seleção' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nova solicitação' })).toBeNull();
  });

  it('Solicitação registrada com a lista aberta: o evento relê a lista', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDasSolicitacoes([toner(42)]);
    abrir('/operacao/solicitacoes', servidor, VE, canal);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    estado.solicitacoes = [conserto(43), ...estado.solicitacoes];
    canal.publicar({
      id: 'e1',
      tipo: 'solicitacoes.mudaram',
      momento: '2026-10-21T12:00:00.000Z',
      alvo: { tipo: 'solicitacao', id: 's43' },
    });
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    expect((await textoDasLinhas())[0]).toContain('NB-0031: Não liga');
  });

  it('sem a permissão, diz que a conta não tem acesso às solicitações', async () => {
    const { servidor, lista } = servidorDasSolicitacoes([]);
    abrir('/operacao/solicitacoes', servidor, naOrganizacao('estoque.ver'));
    expect(await screen.findByText('Você não tem acesso às solicitações.')).toBeTruthy();
    expect(lista).not.toHaveBeenCalled();
  });
});
