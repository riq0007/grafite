// Os backups, a preparação do teste e os logs pelo painel (spec painel-da-operacao, "Tarefas do
// painel pelos mesmos comandos"): o backup agora, a lista dos backups de cada destino, o teste de
// restauração, a preparação do teste com o nome do banco do teste digitado e os logs de cada
// serviço, com as últimas linhas e a busca, contra o servidor de mentira em memória.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiEmMemoria } from '../../simulado/api-em-memoria.ts';
import { App } from '../App.tsx';

afterEach(() => {
  cleanup();
});

const andamento = () => screen.findByRole('region', { name: 'Andamento da tarefa' });

async function abrir(aba: string) {
  fireEvent.click(await screen.findByRole('tab', { name: aba }));
}

describe('os backups pelo painel', () => {
  it('lista os backups de cada destino, e o backup agora entra na lista', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrir('Backups');
    const destino = await screen.findByRole('table', { name: 'Backups em D:\\Backups\\Grafite' });
    expect(destino.textContent).toContain('2026-10-28T0500Z');
    expect(
      screen.getByRole('table', { name: 'Backups em \\\\nas01\\backups\\grafite' }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Fazer o backup agora' }));
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain(
        'Backup 2026-10-28T1200Z feito em todos os destinos e conferido',
      ),
    );
    await vi.waitFor(() =>
      expect(
        screen.getByRole('table', { name: 'Backups em D:\\Backups\\Grafite' }).textContent,
      ).toContain('2026-10-28T1200Z'),
    );
  });

  it('testa a restauração do backup mais novo', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrir('Backups');
    fireEvent.click(await screen.findByRole('button', { name: 'Testar a restauração' }));
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain(
        'restaurou na instância do teste: 48 tabelas, 12.840 linhas e 37 arquivos conferidos.',
      ),
    );
  });

  it('prepara o teste com a cópia da produção, depois do nome do banco do teste digitado', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrir('Backups');
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar o teste' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmação' });
    expect(dialogo.textContent).toContain('grafite_teste');
    fireEvent.change(within(dialogo).getByRole('textbox'), {
      target: { value: 'grafite_teste' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain(
        'O teste recebeu a cópia da produção, com os endereços do teste.',
      ),
    );
  });
});

describe('os logs pelo painel', () => {
  it('mostra as últimas linhas do log do serviço escolhido e acha o texto da busca', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrir('Logs');
    const log = await screen.findByRole('region', { name: 'Log do Grafite' });
    await vi.waitFor(() => expect(within(log).getAllByRole('listitem').length).toBe(100));
    expect(log.textContent).toContain('C:\\Grafite\\producao\\logs\\grafite.out.log');

    fireEvent.click(screen.getByRole('radio', { name: 'Grafite Coletor' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no log' }), {
      target: { value: 'atrasada' },
    });
    const doColetor = await screen.findByRole('region', { name: 'Log do Grafite Coletor' });
    await vi.waitFor(() => {
      const linhas = within(doColetor).getAllByRole('listitem');
      expect(linhas.length).toBe(4);
      for (const linha of linhas) expect(linha.textContent).toContain('Coleta atrasada');
    });
  });
});
