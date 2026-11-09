import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { ordem } from '../../../teste/ordens.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import {
  conserto,
  type SolicitacaoDeTeste,
  servidorDasSolicitacoes,
} from '../../../teste/solicitacoes.ts';

// A OS na solicitação de conserto (spec modulo-operacao, "Ficha da solicitação" e "Formulários das
// ordens de serviço"; spec solicitacoes, "Conserto com a ordem de serviço"; change
// p4e-ordens-de-servico, design, decisão 8): "Abrir OS" na ficha e na linha, que leva à ficha da OS
// nova, a OS na ficha e na lista, e nenhuma ação da solicitação que segue a OS.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const SOLICITACOES_E_OS = naOrganizacao(
  'solicitacoes.ver',
  'solicitacoes.atender',
  'ordens.ver',
  'ordens.atender',
);
const SO_SOLICITACOES = naOrganizacao('solicitacoes.ver', 'solicitacoes.atender');

const daSolicitacao43 = ordem(12, {
  solicitacao: { id: 's43', numero: 43, pessoa: { id: 'joana', nome: 'Joana Prado' } },
});

/** As solicitações, cada uma pela ficha, a abertura da OS e a ficha da OS nova. */
function servidorDoConserto(solicitacoes: SolicitacaoDeTeste[]) {
  const { servidor: daLista, estado } = servidorDasSolicitacoes(solicitacoes);
  const aberturas: number[] = [];
  const servidor: ServidorDeTeste = {
    ...daLista,
    'GET /api/ordens/12': () => Response.json(daSolicitacao43),
  };
  for (const { numero } of solicitacoes) {
    servidor[`GET /api/solicitacoes/${numero}`] = () =>
      Response.json(estado.solicitacoes.find((s) => s.numero === numero));
    servidor[`POST /api/solicitacoes/${numero}/ordem`] = () => {
      aberturas.push(numero);
      estado.solicitacoes = estado.solicitacoes.map((s) =>
        s.numero === numero
          ? {
              ...s,
              situacao: 'em-atendimento',
              ordem: { numero: 12, situacao: 'aberta', abrir: true },
            }
          : s,
      );
      return Response.json(daSolicitacao43, { status: 201 });
    };
  }
  return { servidor, aberturas };
}

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

const ACOES = [
  'Abrir OS',
  'Alterar',
  'Concluir',
  'Mudar a situação',
  'Cancelar',
  'Pedir ao fornecedor',
];
const botoesDasAcoes = () =>
  ACOES.filter((rotulo) => screen.queryByRole('button', { name: rotulo }));
const fichaCarregada = () => screen.findByText('Pedida por', { selector: 'dt' });

describe('a OS na solicitação de conserto', () => {
  it('Ações do conserto: quem atende as solicitações e as OS também abre a OS', async () => {
    const { servidor } = servidorDoConserto([conserto(43, { situacao: 'em-atendimento' })]);
    abrir('/operacao/solicitacoes/43', servidor, SOLICITACOES_E_OS);
    await fichaCarregada();
    expect(botoesDasAcoes()).toEqual([
      'Abrir OS',
      'Alterar',
      'Concluir',
      'Mudar a situação',
      'Cancelar',
    ]);
    cleanup();
    abrir('/operacao/solicitacoes/43', servidor, SO_SOLICITACOES);
    await fichaCarregada();
    expect(botoesDasAcoes()).not.toContain('Abrir OS');
  });

  it('Conserto aberto como OS: "Abrir OS" leva à ficha da OS nova, com "OS 12 aberta."', async () => {
    const { servidor, aberturas } = servidorDoConserto([conserto(43)]);
    const roteador = abrir('/operacao/solicitacoes/43', servidor, SOLICITACOES_E_OS);
    await fichaCarregada();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir OS' }));
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain('OS 12 aberta.'),
    );
    expect(aberturas).toEqual([43]);
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/ordens/12'));
    expect(await screen.findByText('Não liga', { selector: 'dd' })).toBeTruthy();
  });

  it('Conserto com a OS: a ficha mostra "OS 12 · Aguardando peça", que leva à OS, sem nenhuma ação', async () => {
    const { servidor } = servidorDoConserto([
      conserto(43, {
        situacao: 'em-atendimento',
        ordem: { numero: 12, situacao: 'aguardando-peca', abrir: true },
      }),
    ]);
    abrir('/operacao/solicitacoes/43', servidor, SOLICITACOES_E_OS);
    await fichaCarregada();
    const link = screen.getByRole('link', { name: 'OS 12 · Aguardando peça' });
    expect(link.getAttribute('href')).toBe('/operacao/ordens/12');
    expect(botoesDasAcoes()).toEqual([]);
  });

  it('quem não vê as OS vê a OS da solicitação sem o caminho', async () => {
    const { servidor } = servidorDoConserto([
      conserto(43, {
        situacao: 'em-atendimento',
        ordem: { numero: 12, situacao: 'aberta', abrir: false },
      }),
    ]);
    abrir('/operacao/solicitacoes/43', servidor, SO_SOLICITACOES);
    await fichaCarregada();
    expect(screen.getByText('OS 12 · Aberta')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'OS 12 · Aberta' })).toBeNull();
  });

  it('a lista mostra a OS ao lado da situação, e a linha que segue a OS não tem ações', async () => {
    const { servidor } = servidorDoConserto([
      conserto(43, {
        situacao: 'em-atendimento',
        ordem: { numero: 12, situacao: 'aberta', abrir: true },
      }),
      conserto(44),
    ]);
    abrir('/operacao/solicitacoes', servidor, SOLICITACOES_E_OS);
    const tabela = await screen.findByRole('grid', { name: 'Solicitações' });
    await waitFor(() => expect(within(tabela).getAllByRole('row')).toHaveLength(3));
    const [, primeira] = within(tabela).getAllByRole('row');
    expect(primeira?.textContent).toContain('Em atendimento · OS 12');
    expect(screen.queryByRole('button', { name: 'Ações da solicitação 43' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ações da solicitação 44' }));
    expect(await screen.findByRole('menuitem', { name: 'Abrir OS' })).toBeTruthy();
  });

  it('"Abrir OS" na linha também leva à ficha da OS nova', async () => {
    const { servidor, aberturas } = servidorDoConserto([conserto(44)]);
    const roteador = abrir('/operacao/solicitacoes', servidor, SOLICITACOES_E_OS);
    fireEvent.click(await screen.findByRole('button', { name: 'Ações da solicitação 44' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Abrir OS' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/operacao/ordens/12'));
    expect(aberturas).toEqual([44]);
  });
});
