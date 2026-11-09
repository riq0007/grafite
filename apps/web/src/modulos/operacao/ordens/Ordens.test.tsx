import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { ordem, resolvida, servidorDasOrdens } from '../../../teste/ordens.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { haDias, PAT00412 } from '../../../teste/solicitacoes.ts';

// A tela das ordens de serviço (spec modulo-operacao, "Tela das ordens de serviço" e "Operação
// atualizada pelos eventos"; spec ordens-de-servico, "Mudança da situação das OS em lote"; change
// p4e-ordens-de-servico, design, decisão 8).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const ATENDE = naOrganizacao('ordens.ver', 'ordens.atender');
const VE = naOrganizacao('ordens.ver');

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

const tabela = () => screen.findByRole('grid', { name: 'Ordens de serviço' });
const linhas = async () =>
  within(await tabela())
    .getAllByRole('row')
    .slice(1);
const textoDasLinhas = async () => (await linhas()).map((linha) => linha.textContent);
const linhaDa = async (numero: number) => {
  const linha = (await linhas()).find(
    (atual) => within(atual).getAllByRole('rowheader')[0]?.textContent === String(numero),
  );
  if (!linha) throw new Error(`A OS ${numero} não está na lista.`);
  return linha;
};
const selecionar = async (numero: number) =>
  fireEvent.click(within(await linhaDa(numero)).getByText(String(numero)), { ctrlKey: true });

describe('a tela das ordens de serviço', () => {
  it('mostra o número, a situação, o ativo, o problema, o local, a solicitação, quando foi aberta e a última mudança', async () => {
    const { servidor } = servidorDasOrdens([
      ordem(12, {
        situacao: 'aguardando-peca',
        solicitacao: { id: 's43', numero: 43, pessoa: { id: 'joana', nome: 'Joana Prado' } },
        historico: [
          {
            id: 'h12-peca',
            situacao: 'aguardando-peca',
            texto: 'Fonte pedida ao almoxarifado',
            fornecedor: null,
            mudadaPor: { id: 'davi', nome: 'Davi Rocha' },
            mudadaEm: haDias(1),
          },
        ],
      }),
      ordem(11, { ativo: PAT00412, problema: 'Não puxa o papel' }),
    ]);
    abrir('/operacao/ordens', servidor);
    const cabecalhos = within(await tabela())
      .getAllByRole('columnheader')
      .map((coluna) => coluna.textContent);
    expect(cabecalhos).toEqual([
      'Número',
      'Situação',
      'Ativo',
      'Problema',
      'Local',
      'Solicitação',
      'Aberta',
      'Última mudança',
      'Ações',
    ]);
    const [primeira, segunda] = await textoDasLinhas();
    for (const texto of [
      '12',
      'Aguardando peça',
      'NB-0031 · Dell Latitude 5440',
      'Não liga',
      'Jundiaí › Expedição',
      'Solicitação 43',
      'Há 3 d',
      'Há 1 d · Davi Rocha',
    ]) {
      expect(primeira).toContain(texto);
    }
    expect(segunda).toContain('PAT-00412 · HP LaserJet M404');
    expect(segunda).toContain('Não puxa o papel');
    expect(screen.getByText('2 ordens de serviço')).toBeTruthy();
  });

  it('Em aberto por padrão: o filtro diz "Em aberto", e "Todas" traz as resolvidas', async () => {
    const { servidor, pedidos } = servidorDasOrdens([ordem(12), resolvida(11)]);
    const roteador = abrir('/operacao/ordens', servidor, VE);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(pedidos[0]?.get('situacao')).toBeNull();
    const filtro = screen.getByRole('button', { name: /Situação/ });
    expect(filtro.textContent).toContain('Em aberto');
    fireEvent.click(filtro);
    fireEvent.click(await screen.findByRole('option', { name: 'Todas' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    expect(roteador.state.location.search).toMatchObject({ situacao: 'todas' });
    expect((await textoDasLinhas())[1]).toContain('Resolvida');
  });

  it('Busca pelo patrimônio: a lista mostra as OS do NB-0031, e o endereço guarda a busca', async () => {
    const { servidor, pedidos } = servidorDasOrdens([
      ordem(12),
      ordem(11, { ativo: PAT00412, problema: 'Não puxa o papel' }),
    ]);
    const roteador = abrir('/operacao/ordens', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar nas ordens de serviço' }), {
      target: { value: 'nb-0031' },
    });
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect((await textoDasLinhas())[0]).toContain('NB-0031');
    expect(roteador.state.location.search).toMatchObject({ busca: 'nb-0031' });
    expect(pedidos.at(-1)?.get('busca')).toBe('nb-0031');
  });

  it('filtra pelo local do endereço', async () => {
    const { servidor, pedidos } = servidorDasOrdens([ordem(12)]);
    abrir('/operacao/ordens?local=expedicao', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(pedidos[0]?.get('local')).toBe('expedicao');
    expect(screen.getByRole('group', { name: 'Filtros ativos' })).toBeTruthy();
  });

  it('Primeira ordem de serviço: sem nenhuma, diz que não há OS ainda e oferece "Nova ordem de serviço"', async () => {
    const { servidor } = servidorDasOrdens([]);
    const roteador = abrir('/operacao/ordens', servidor);
    expect(await screen.findByText('Nenhuma ordem de serviço ainda.')).toBeTruthy();
    const [nova] = screen.getAllByRole('button', { name: 'Nova ordem de serviço' });
    if (nova) fireEvent.click(nova);
    await waitFor(() => expect(roteador.state.location.search).toMatchObject({ nova: true }));
  });

  it('Nenhuma em aberto: diz que não há OS em aberto e oferece "Ver todas"', async () => {
    const { servidor } = servidorDasOrdens([resolvida(11)]);
    const roteador = abrir('/operacao/ordens', servidor, VE);
    expect(await screen.findByText('Nenhuma ordem de serviço em aberto.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(roteador.state.location.search).toMatchObject({ situacao: 'todas' });
  });

  it('com os filtros sem resultado, diz que não há OS com esses filtros e limpa os filtros', async () => {
    const { servidor } = servidorDasOrdens([ordem(12)]);
    const roteador = abrir('/operacao/ordens?busca=impressora', servidor);
    expect(await screen.findByText('Nenhuma ordem de serviço com esses filtros.')).toBeTruthy();
    fireEvent.click(within(await tabela()).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    expect(roteador.state.location.search).toEqual({});
  });

  it('carrega mais pelo cursor, e a seleção continua', async () => {
    const { servidor } = servidorDasOrdens([ordem(12), ordem(11), ordem(10)], { porPagina: 2 });
    abrir('/operacao/ordens', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    await selecionar(12);
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(async () => expect(await linhas()).toHaveLength(3));
    const acoes = screen.getByRole('toolbar', { name: 'Ações da seleção' });
    expect(within(acoes).getByText('1 selecionado')).toBeTruthy();
  });

  it('Resolvidas encerradas em lote: as cinco mudam, com o retorno, e a seleção limpa', async () => {
    const numeros = [15, 14, 13, 12, 11];
    const { servidor, lotes } = servidorDasOrdens(numeros.map((numero) => resolvida(numero)));
    abrir('/operacao/ordens?situacao=resolvida', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(5));
    for (const numero of numeros) await selecionar(numero);
    const acoes = screen.getByRole('toolbar', { name: 'Ações da seleção' });
    expect(within(acoes).getByText('5 selecionados')).toBeTruthy();
    fireEvent.click(within(acoes).getByRole('button', { name: 'Mudar a situação' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Mudar a situação' });
    expect(within(gaveta).getByText('5 ordens de serviço selecionadas')).toBeTruthy();
    expect(
      within(gaveta)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Em atendimento', 'Aguardando peça', 'Encerrada']);
    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Encerrada' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
        '5 ordens de serviço mudaram.',
      ),
    );
    expect(lotes).toEqual([{ numeros: [11, 12, 13, 14, 15], situacao: 'encerrada' }]);
    // As cinco saem das resolvidas, e a seleção é limpa.
    expect(await screen.findByText('Nenhuma ordem de serviço com esses filtros.')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Mudar a situação' })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Ações da seleção' })).toBeNull();
  });

  it('Uma em aberto no encerramento em lote: o retorno diz qual ficou como estava', async () => {
    const { servidor } = servidorDasOrdens([
      resolvida(13),
      ordem(12, { situacao: 'em-atendimento' }),
    ]);
    abrir('/operacao/ordens?situacao=todas', servidor);
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    await selecionar(13);
    await selecionar(12);
    fireEvent.click(screen.getByRole('button', { name: 'Mudar a situação' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Mudar a situação' });
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    expect(await within(gaveta).findByText('Escolha a situação.')).toBeTruthy();
    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Encerrada' }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Mudar' }));
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
        '1 ordem de serviço mudou. A 12 não: ainda não foi resolvida.',
      ),
    );
  });

  it('Quem só vê: a lista, sem a seleção nem a "Nova ordem de serviço"', async () => {
    const { servidor } = servidorDasOrdens([ordem(12, { permite: { atender: false } })]);
    abrir('/operacao/ordens', servidor, VE);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    await selecionar(12);
    expect(screen.queryByRole('toolbar', { name: 'Ações da seleção' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nova ordem de serviço' })).toBeNull();
  });

  it('OS aberta com a lista aberta: o evento relê a lista', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDasOrdens([ordem(12)]);
    abrir('/operacao/ordens', servidor, VE, canal);
    await waitFor(async () => expect(await linhas()).toHaveLength(1));
    estado.ordens = [ordem(13, { problema: 'Teclado falhando' }), ...estado.ordens];
    canal.publicar({
      id: 'e1',
      tipo: 'ordens.mudaram',
      momento: '2026-10-22T12:00:00.000Z',
      alvo: { tipo: 'ordem', id: 'o13' },
    });
    await waitFor(async () => expect(await linhas()).toHaveLength(2));
    expect((await textoDasLinhas())[0]).toContain('Teclado falhando');
  });

  it('sem a permissão, diz que a conta não tem acesso às ordens de serviço', async () => {
    const { servidor, lista } = servidorDasOrdens([]);
    abrir('/operacao/ordens', servidor, naOrganizacao('estoque.ver'));
    expect(await screen.findByText('Você não tem acesso às ordens de serviço.')).toBeTruthy();
    expect(lista).not.toHaveBeenCalled();
  });
});
