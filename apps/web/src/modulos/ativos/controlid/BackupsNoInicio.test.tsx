// O bloco "Backups do Control iD" do Início (spec tela-inicial, "Backups do Control iD no Início";
// change inicio-ajustavel, design, decisão 6).
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { naOrganizacao, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

type Situacao = 'ok' | 'parcial' | 'falha' | 'nada';

/** Os 14 dias de um controle, do mais antigo ao de hoje, com as situações dos últimos no fim. */
const diasCom = (ultimos: Situacao[]) => {
  const todos: Situacao[] = [...Array(14 - ultimos.length).fill('ok'), ...ultimos];
  return todos.map((situacao, indice) => ({
    data: `2026-10-${String(16 + indice).padStart(2, '0')}`,
    situacao,
  }));
};

const controle = (id: string, rotulo: string, ultimos: Situacao[], rostos: number) => ({
  controle: { id, rotulo, patrimonio: null },
  dias: diasCom(ultimos),
  ultimo: { usuarios: 3, rostos, concluidoEm: '2026-10-24T05:00:00.000Z', situacao: 'sucesso' },
  anterior: null,
  rostos: [],
});

describe('Backups do Control iD no Início', () => {
  it('controle sem backup: o da portaria primeiro, com os dias sem backup e os rostos', async () => {
    const pedidos: URL[] = [];
    const roteador = criarRoteador(createMemoryHistory({ initialEntries: ['/'] }));
    render(
      <App
        roteador={roteador}
        sessao={sessaoAtiva(naOrganizacao('controlid.ver'), {
          'GET /api/controlid/backups/resumo': (pedido) => {
            pedidos.push(new URL(pedido.url));
            return Response.json({
              controles: [
                controle('almox', 'Controle do almoxarifado', ['ok'], 48),
                controle(
                  'portaria',
                  'Controle da portaria',
                  ['nada', 'nada', 'nada', 'nada', 'nada'],
                  120,
                ),
              ],
            });
          },
        })}
        consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      />,
    );

    const lista = await screen.findByRole('list', { name: 'Backups do Control iD' });
    expect(pedidos[0]?.searchParams.get('dias')).toBe('14');
    // Só os controles: a faixa de cada um é outra lista, com um item por dia.
    const [portaria, almoxarifado] = Array.from(lista.children) as [HTMLElement, HTMLElement];
    expect(within(portaria).getByRole('link').textContent).toContain('Controle da portaria');
    expect(within(portaria).getByText('Sem backup há 5 dias')).toBeTruthy();
    expect(within(portaria).getByText('120 rostos')).toBeTruthy();
    expect(
      within(portaria).getByRole('list', { name: 'Backups de Controle da portaria' }),
    ).toBeTruthy();
    expect(within(almoxarifado).getByText('Em dia')).toBeTruthy();

    fireEvent.click(within(portaria).getByRole('link'));
    expect(roteador.state.location.pathname).toBe('/ativos/portaria');
  });
});
