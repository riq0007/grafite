// As mudanças da conta nas tabelas, na seção Tabelas dos Ajustes (spec ajustes-do-sistema, "Seção
// Tabelas"; design do visoes-da-conta, decisão 6).
import { filaDeAvisos } from '@grafite/ui';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProvedorDaSessao } from '../../../sessao/useSessao.tsx';
import { comApi } from '../../../teste/provedores.tsx';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { MudancasNasTabelas } from './MudancasNasTabelas.tsx';

afterEach(() => {
  cleanup();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
});

const DEFINICAO = { colunas: [{ chave: 'ativo.rotulo' }], ordenacao: null, filtros: [] };
const mudancas = (visao: string) => ({
  visao,
  definicao: DEFINICAO,
  atualizadaEm: '2026-10-13T12:00:00.000Z',
});

/** O servidor com as mudanças da conta, e os pedidos, pelo método, o caminho e a busca. */
function servidorDasMudancas(iniciais: ReturnType<typeof mudancas>[]) {
  const pedidos: string[] = [];
  let guardadas = iniciais;
  const servidor: ServidorDeTeste = {
    'GET /api/visoes': (pedido) => {
      pedidos.push(`GET ${new URL(pedido.url).search}`);
      return Response.json({ visoes: [], mudancas: guardadas, permite: { compartilhar: false } });
    },
    'DELETE /api/visoes/mudancas': (pedido) => {
      pedidos.push(`DELETE ${new URL(pedido.url).search}`);
      guardadas = [];
      return new Response(null, { status: 204 });
    },
  };
  return { servidor, pedidos };
}

function abrir(servidor: ServidorDeTeste, permissoes = naOrganizacao('ativos.ver')) {
  const Api = comApi(servidor);
  render(
    <ProvedorDaSessao loja={sessaoAtiva(permissoes, servidor)}>
      <Api>
        <MudancasNasTabelas />
      </Api>
    </ProvedorDaSessao>,
  );
}

const retornos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('as mudanças da conta nas tabelas', () => {
  it('diz em quantas visões há mudanças e restaura todas depois da confirmação', async () => {
    const { servidor, pedidos } = servidorDasMudancas([
      mudancas('fabrica'),
      mudancas('1c8d2e3f-4051-4b6c-9d7e-8f9a0b1c2d3e'),
    ]);
    abrir(servidor);
    expect(await screen.findByText('Suas mudanças estão guardadas em 2 visões.')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restaurar as minhas mudanças nas tabelas' }),
    );
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Restaurar as suas mudanças nas tabelas?',
    });
    expect(
      within(confirmacao).getByText('As 2 visões voltam a abrir como estão salvas.'),
    ).toBeTruthy();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(retornos()).toContain('Mudanças nas tabelas restauradas.'));
    expect(pedidos).toContain('DELETE ?tabela=ativos');
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Restaurar as minhas mudanças nas tabelas' }),
      ).toBeNull(),
    );
  });

  it('uma visão só, no singular', async () => {
    abrir(servidorDasMudancas([mudancas('fabrica')]).servidor);
    expect(await screen.findByText('Suas mudanças estão guardadas em 1 visão.')).toBeTruthy();
  });

  it('sem mudanças, nada aparece', async () => {
    const { servidor, pedidos } = servidorDasMudancas([]);
    abrir(servidor);
    await waitFor(() => expect(pedidos).toEqual(['GET ?tabela=ativos']));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sem ver a tabela, não pergunta à API', async () => {
    const { servidor, pedidos } = servidorDasMudancas([mudancas('fabrica')]);
    abrir(servidor, naOrganizacao('organizacao.editar'));
    await act(async () => {});
    expect(pedidos).toEqual([]);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
