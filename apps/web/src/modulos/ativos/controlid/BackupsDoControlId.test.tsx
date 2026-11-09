// Os backups do Control iD na web (spec backup-do-control-id; change p5a-backup-do-control-id,
// design, decisões 8 e 10): a tela com a situação por extenso, quem só vê, o primeiro backup, o
// "Backup de todos os controles" e o conteúdo com a busca.
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Backup = components['schemas']['BackupDoControlId'];

const backup = (id: string, extras: Partial<Backup> = {}): Backup => ({
  id,
  controle: { id: 'controle-1', rotulo: 'Controle da portaria', patrimonio: 'PAT-00778' },
  origem: 'agendado',
  situacao: 'sucesso',
  pedidoPor: null,
  pedidoEm: '2026-10-28T05:00:00.000Z',
  iniciadoEm: '2026-10-28T05:00:10.000Z',
  concluidoEm: '2026-10-28T05:01:00.000Z',
  coletor: 'Coletor de Jundiaí',
  temArquivo: true,
  tamanho: 2 * 1024 * 1024,
  registros: 640,
  fotos: 312,
  serie: '0M0100/123',
  firmware: '6.4.2',
  modelo: 'iDFace',
  categorias: [],
  erro: null,
  podeApagar: true,
  ...extras,
});

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('controlid.backup'),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        // O resumo dos últimos dias (change suprimentos-rostos-e-backups), vazio quando o teste não
        // fala dele.
        'GET /api/controlid/backups/resumo': () => Response.json({ controles: [] }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={criarCanalDeEventos()}
    />,
  );
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('a tela dos backups do Control iD', () => {
  it('mostra a situação por extenso, os números e o backup de todos', async () => {
    const todos = vi.fn(() => Response.json({ pedidos: 3, jaNaFila: 1, falhas: 0 }));
    abrir('/gestao/control-id/backups', {
      'GET /api/controlid/backups': () =>
        Response.json({
          itens: [
            backup('b1'),
            backup('b2', {
              situacao: 'falha',
              temArquivo: false,
              erro: 'O controle recusou o login do cofre.',
              podeApagar: true,
            }),
          ],
          proximo: null,
          podeFazer: true,
        }),
      'POST /api/controlid/backups/todos': todos,
    });
    const tabela = await screen.findByRole('grid', { name: 'Backups do Control iD' });
    await waitFor(() => expect(within(tabela).getAllByRole('row')).toHaveLength(3));
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(within(linhas[0] as HTMLElement).getByText('Sucesso')).toBeTruthy();
    expect(
      within(linhas[0] as HTMLElement).getByText('640 registros · 312 fotos · 2,0 MB'),
    ).toBeTruthy();
    expect(
      within(linhas[1] as HTMLElement).getByText('O controle recusou o login do cofre.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Backup de todos os controles' }));
    await waitFor(() => expect(todos).toHaveBeenCalled());
    await waitFor(() => expect(avisos()).toContain('3 backups na fila, 1 já estavam.'));
  });

  it('Quem só vê: sem o backup de todos nem apagar', async () => {
    abrir(
      '/gestao/control-id/backups',
      {
        'GET /api/controlid/backups': () =>
          Response.json({
            itens: [backup('b1', { podeApagar: false })],
            proximo: null,
            podeFazer: false,
          }),
      },
      naOrganizacao('controlid.ver'),
    );
    await screen.findByRole('grid', { name: 'Backups do Control iD' });
    expect(screen.queryByRole('button', { name: 'Backup de todos os controles' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Ver conteúdo' })).toBeTruthy();
  });

  it('Pessoa procurada no backup: o conteúdo com a busca', async () => {
    const conteudo = vi.fn((pedido: Request) => {
      const busca = new URL(pedido.url).searchParams.get('busca');
      return Response.json({
        abas: [
          { aba: 'pessoas', rotulo: 'Pessoas', total: 2 },
          { aba: 'grupos', rotulo: 'Grupos', total: 1 },
          { aba: 'regras', rotulo: 'Regras de acesso', total: 1 },
          { aba: 'horarios', rotulo: 'Horários', total: 1 },
        ],
        aba: 'pessoas',
        total: busca ? 1 : 2,
        linhas: [
          {
            id: '1',
            titulo: 'Marina Alves',
            detalhes: [{ rotulo: 'Matrícula', valor: '4821' }],
            foto: false,
          },
          ...(busca ? [] : [{ id: '2', titulo: 'Rafael Costa', detalhes: [], foto: false }]),
        ],
        proximo: null,
      });
    });
    abrir('/gestao/control-id/backups', {
      'GET /api/controlid/backups': () =>
        Response.json({ itens: [backup('b1')], proximo: null, podeFazer: true }),
      'GET /api/controlid/backups/b1/conteudo': conteudo,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver conteúdo' }));
    expect(await screen.findByText('Rafael Costa')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Procurar' }), {
      target: { value: 'marina' },
    });
    await waitFor(() => expect(screen.queryByText('Rafael Costa')).toBeNull());
    expect(await screen.findByText('Marina Alves')).toBeTruthy();
    expect(await screen.findByText('4821')).toBeTruthy();
  });

  it('Primeiro backup: a lista vazia diz como o backup começa', async () => {
    abrir('/gestao/control-id/backups', {
      'GET /api/controlid/backups': () =>
        Response.json({ itens: [], proximo: null, podeFazer: true }),
    });
    expect(await screen.findByText('Nenhum backup do Control iD ainda.')).toBeTruthy();
  });
});

// A comparação e a restauração (change p5b-comparacao-e-restauracao).
describe('as operações e o comparador', () => {
  it('Quem faz o backup sem restaurar: compara, sem restaurar; a Operação na fila avisa', async () => {
    const operacao = vi.fn(() =>
      Response.json(
        {
          id: 'o1',
          backupId: 'b1',
          ativoId: 'controle-1',
          tipo: 'comparacao',
          situacao: 'na-fila',
          categorias: null,
          pedidoPor: 'Ana Souza',
          pedidoEm: '2026-10-28T12:00:00.000Z',
          iniciadoEm: null,
          concluidoEm: null,
          coletor: null,
          resultado: [],
          aviso: null,
          erro: null,
        },
        { status: 201 },
      ),
    );
    abrir('/gestao/control-id/backups', {
      'GET /api/controlid/backups': () =>
        Response.json({ itens: [backup('b1')], proximo: null, podeFazer: true }),
      'POST /api/controlid/backups/b1/operacoes': operacao,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Comparar com o controle' }));
    await waitFor(() => expect(operacao).toHaveBeenCalled());
    await waitFor(() =>
      expect(avisos()).toContain(
        'Comparação na fila. O resultado aparece na seção Backups do controle.',
      ),
    );
    expect(screen.queryByRole('button', { name: 'Restaurar…' })).toBeNull();
  });

  it('Backup do PMG contra o CSV do controle: o comparador mostra os divergentes e os de um lado só', async () => {
    abrir(
      '/gestao/control-id/comparar',
      {
        'GET /api/controlid/backups': () =>
          Response.json({
            itens: [backup('b1'), backup('b2', { pedidoEm: '2026-10-27T05:00:00.000Z' })],
            proximo: null,
            podeFazer: true,
          }),
        'POST /api/controlid/comparador': () =>
          Response.json({
            a: 'PAT-00778 · 28/10/2026 02:00',
            b: 'PAT-00778 · 27/10/2026 02:00',
            tabelas: [
              {
                tabela: 'users',
                rotulo: 'Pessoas',
                identicos: 300,
                divergentes: [
                  {
                    id: '2',
                    nome: 'Rafael Costa',
                    campos: [{ campo: 'name', a: 'Rafael Costa', b: 'Rafael C.' }],
                  },
                ],
                soEmA: [],
                soEmB: [{ id: '3', nome: 'Nova pessoa' }],
              },
              {
                tabela: 'cards',
                rotulo: 'Cartões',
                identicos: 1,
                divergentes: [],
                soEmA: [],
                soEmB: [],
              },
            ],
          }),
      },
      naOrganizacao('controlid.ver'),
    );
    const selecoes = await screen.findAllByRole('button', { name: /Backup/ });
    expect(selecoes.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Comparar' })).toBeTruthy();
  });
});
