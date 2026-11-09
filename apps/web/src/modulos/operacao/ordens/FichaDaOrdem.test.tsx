import { criarDataHora, filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import {
  CARLA,
  type OrdemDeTeste,
  ordem,
  resolvida,
  servidorDasOrdens,
} from '../../../teste/ordens.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { ALMOXARIFADO } from '../../../teste/solicitacoes.ts';

// A ficha da OS, com o histórico, as peças e as ações da situação (spec modulo-operacao, "Ficha da
// ordem de serviço" e "Operação atualizada pelos eventos"; spec ordens-de-servico, "Quem vê e quem
// atende as OS"; change p4e-ordens-de-servico, design, decisão 8).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const { formatarDataEHora } = criarDataHora();

const LANCADA_EM = '2026-10-21T14:00:00.000Z';
const FONTE = { id: 'fnt65w', codigo: 'FNT-65W', nome: 'Fonte 65W', abrir: true };

/** A OS 12 resolvida com a Fonte 65W do Almoxarifado, que Bruno só vê. */
const comAFonte = resolvida(12, {
  pecas: [
    {
      id: 'p1',
      consumivel: FONTE,
      quantidade: 1,
      local: ALMOXARIFADO,
      movimento: 'm1',
      lancadaPor: CARLA,
      lancadaEm: LANCADA_EM,
    },
  ],
  permite: { atender: false },
});

const naoEncontrada = () =>
  Response.json(
    {
      type: 'urn:grafite:problema:nao-encontrado',
      title: 'Não encontrado',
      status: 404,
      detail: 'Ordem de serviço não encontrada.',
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status: 404 },
  );

/** As OS, cada uma também pela ficha. */
function servidorDaFicha(ordens: OrdemDeTeste[]) {
  const base = servidorDasOrdens(ordens);
  const servidor: ServidorDeTeste = { ...base.servidor, 'GET /api/ordens/9999': naoEncontrada };
  for (const { numero } of ordens) {
    servidor[`GET /api/ordens/${numero}`] = () => {
      const atual = base.estado.ordens.find((o) => o.numero === numero);
      return atual ? Response.json(atual) : naoEncontrada();
    };
  }
  return { ...base, servidor };
}

const VE = naOrganizacao('ordens.ver', 'estoque.ver');
const ATENDE = naOrganizacao('ordens.ver', 'ordens.atender', 'estoque.ver', 'estoque.movimentar');

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes: PermissaoDaSessao[],
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

/** O título da ficha carregada: o do carregamento também diz "OS 12". */
const titulo = async () => {
  await screen.findByRole('region', { name: 'Histórico' });
  return screen.getByRole('heading', { level: 1, name: /OS 12/ });
};
const botoesDasAcoes = () =>
  [
    'Mudar a situação',
    'Lançar peça',
    'Resolver',
    'Corrigir',
    'Encerrar sem resolver',
    'Reabrir',
    'Encerrar',
  ]
    .filter((rotulo) => screen.queryByRole('button', { name: rotulo }))
    .sort();

describe('a ficha da OS', () => {
  it('OS resolvida na ficha: Bruno vê o ativo, o histórico, a peça e o que foi feito, sem nenhuma ação', async () => {
    const { servidor } = servidorDaFicha([comAFonte]);
    abrir('/operacao/ordens/12', servidor, VE);
    expect((await titulo()).textContent).toContain('Resolvida');
    expect(screen.getByRole('link', { name: 'Dell Latitude 5440 · NB-0031' })).toBeTruthy();
    expect(screen.getByText('Fonte trocada', { selector: 'dd' })).toBeTruthy();
    const historico = screen.getByRole('region', { name: 'Histórico' });
    expect(
      within(historico)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('Resolvida'), expect.stringContaining('Aberta')]);
    expect(within(historico).getAllByText(/Carla Dias/)).toHaveLength(2);
    const pecas = screen.getByRole('region', { name: 'Peças' });
    expect(within(pecas).getByText(/1 FNT-65W · Fonte 65W/)).toBeTruthy();
    expect(
      within(pecas).getByText(
        `de Jundiaí › Almoxarifado, por Carla Dias em ${formatarDataEHora(new Date(LANCADA_EM))}`,
      ),
    ).toBeTruthy();
    expect(within(pecas).getByRole('link', { name: 'Ver nas movimentações' })).toBeTruthy();
    expect(botoesDasAcoes()).toEqual([]);
  });

  // Spec componentes-base, "Lista de dados" (change cabecalhos-e-fichas, decisão 3).
  it('Dados da ordem de serviço: o ativo, o local, o problema e a abertura, cada um como termo e definição na lista de dados', async () => {
    const { servidor } = servidorDaFicha([comAFonte]);
    abrir('/operacao/ordens/12', servidor, VE);
    await titulo();
    const termos = screen.getAllByRole('term');
    expect(termos.map((termo) => termo.textContent)).toEqual(
      expect.arrayContaining(['Ativo', 'Local', 'Problema', 'Aberta']),
    );
    for (const termo of termos) {
      expect(termo.nextElementSibling?.tagName).toBe('DD');
      expect(termo.closest('[data-lista-de-dados]')).toBeTruthy();
    }
  });

  it('Ações da Resolvida: Carla reabre ou encerra, sem lançar peça nem mudar a situação', async () => {
    const { servidor } = servidorDaFicha([resolvida(12)]);
    abrir('/operacao/ordens/12', servidor, ATENDE);
    await titulo();
    expect(botoesDasAcoes()).toEqual(['Encerrar', 'Reabrir']);
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
    expect(await screen.findByRole('dialog', { name: 'Reabrir a OS 12' })).toBeTruthy();
  });

  it('a em aberto oferece as ações dela, e a ficha mostra a solicitação de origem e o fornecedor', async () => {
    const { servidor } = servidorDaFicha([
      ordem(12, {
        situacao: 'aguardando-fornecedor',
        solicitacao: { id: 's43', numero: 43, pessoa: { id: 'joana', nome: 'Joana Prado' } },
        fornecedor: { id: 'dell', nome: 'Dell Assistência', abrir: false },
        osDoFornecedor: 'DL-5521',
      }),
    ]);
    abrir('/operacao/ordens/12', servidor, ATENDE);
    await titulo();
    expect(botoesDasAcoes()).toEqual(
      ['Corrigir', 'Encerrar sem resolver', 'Lançar peça', 'Mudar a situação', 'Resolver'].sort(),
    );
    expect(screen.getByRole('link', { name: 'Solicitação 43 · Joana Prado' })).toBeTruthy();
    expect(screen.getByText('Dell Assistência · OS DL-5521')).toBeTruthy();
  });

  it('o histórico diz a reabertura e o encerramento sem resolver', async () => {
    const base = ordem(12);
    const [abertura] = base.historico;
    const { servidor } = servidorDaFicha([
      ordem(12, {
        situacao: 'encerrada',
        motivoDoEncerramento: 'Equipamento substituído',
        encerradaPor: CARLA,
        encerradaEm: LANCADA_EM,
        historico: [
          {
            id: 'h12-encerrada',
            situacao: 'encerrada',
            texto: 'Equipamento substituído',
            fornecedor: null,
            mudadaPor: CARLA,
            mudadaEm: LANCADA_EM,
          },
          {
            id: 'h12-reaberta',
            situacao: 'em-atendimento',
            texto: 'Voltou a desligar sozinho',
            fornecedor: null,
            mudadaPor: CARLA,
            mudadaEm: LANCADA_EM,
          },
          {
            id: 'h12-resolvida',
            situacao: 'resolvida',
            texto: 'Fonte trocada',
            fornecedor: null,
            mudadaPor: CARLA,
            mudadaEm: LANCADA_EM,
          },
          ...(abertura ? [abertura] : []),
        ],
      }),
    ]);
    abrir('/operacao/ordens/12', servidor, VE);
    await titulo();
    const historico = screen.getByRole('region', { name: 'Histórico' });
    const textos = within(historico)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(textos[0]).toContain('Encerrada sem resolver');
    expect(textos[0]).toContain('Equipamento substituído');
    expect(textos[1]).toContain('Reaberta');
    expect(textos[1]).toContain('Voltou a desligar sozinho');
    expect(textos[2]).toContain('Resolvida');
  });

  // Spec componentes-base, "Cabeçalho da página" (change cabecalho-em-toda-tela, decisão 1).
  it('Tela carregando: o título "OS 12" já está no cabeçalho da página, no mesmo lugar depois', async () => {
    const { servidor } = servidorDaFicha([comAFonte]);
    let chegar: () => void = () => undefined;
    const pronta = new Promise<void>((resolver) => {
      chegar = resolver;
    });
    const responder = servidor['GET /api/ordens/12'];
    servidor['GET /api/ordens/12'] = async (pedido) => {
      await pronta;
      return responder?.(pedido) ?? naoEncontrada();
    };
    abrir('/operacao/ordens/12', servidor, VE);
    await screen.findByText('Carregando a ordem de serviço…');
    const carregando = screen.getByRole('heading', { level: 1, name: 'OS 12' });
    expect(carregando.closest('[data-cabecalho-da-pagina]')).toBeTruthy();
    chegar();
    expect((await titulo()).closest('[data-cabecalho-da-pagina]')).toBeTruthy();
  });

  it('OS que não existe: a ficha diz que não a encontrou', async () => {
    const { servidor } = servidorDaFicha([]);
    abrir('/operacao/ordens/9999', servidor, VE);
    expect(await screen.findByText('Ordem de serviço não encontrada.')).toBeTruthy();
    cleanup();
    abrir('/operacao/ordens/doze', servidor, VE);
    expect(await screen.findByText('Ordem de serviço não encontrada.')).toBeTruthy();
  });

  it('OS resolvida com a ficha aberta: o evento relê a ficha', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDaFicha([ordem(12, { situacao: 'em-atendimento' })]);
    abrir('/operacao/ordens/12', servidor, VE, canal);
    expect((await titulo()).textContent).toContain('Em atendimento');
    estado.ordens = [resolvida(12)];
    canal.publicar({
      id: 'e1',
      tipo: 'ordens.mudaram',
      momento: '2026-10-22T12:00:00.000Z',
      alvo: { tipo: 'ordem', id: 'o12' },
    });
    await waitFor(async () => expect((await titulo()).textContent).toContain('Resolvida'));
    expect(screen.getByText('Fonte trocada', { selector: 'dd' })).toBeTruthy();
  });

  it('a linha da lista abre a ficha', async () => {
    const { servidor } = servidorDaFicha([ordem(12)]);
    const roteador = abrir('/operacao/ordens', servidor, VE);
    const tabela = await screen.findByRole('grid', { name: 'Ordens de serviço' });
    fireEvent.click(within(tabela).getByText('12'));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/ordens/12'));
    expect(await titulo()).toBeTruthy();
  });
});
