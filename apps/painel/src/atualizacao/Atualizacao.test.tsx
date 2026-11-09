// A atualização pelo painel (spec painel-da-operacao, "Tarefas do painel pelos mesmos comandos"): o
// pacote das pastas de Downloads e de C:\Temp, ou digitado, o teste proposto antes da produção e o
// resultado, com o backup de antes, sobre o servidor de mentira em memória.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiEmMemoria } from '../../simulado/api-em-memoria.ts';
import { App } from '../App.tsx';

afterEach(() => {
  cleanup();
});

const radio = (nome: string | RegExp) =>
  screen.getByRole('radio', { name: nome }) as HTMLInputElement;
const andamento = () => screen.findByRole('region', { name: 'Andamento da tarefa' });

async function abrirAtualizacao() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Atualização' }));
  await screen.findByRole('radio', { name: /grafite-0\.2\.0-windows-x64\.zip/ });
}

describe('a atualização pelo painel', () => {
  it('Atualização pelo painel: o teste primeiro, depois a produção, com o nome do banco digitado e o backup de antes', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirAtualizacao();
    expect(radio(/grafite-0\.2\.0-windows-x64\.zip/).checked).toBe(true);
    expect(radio('Teste').checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar o teste' }));
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain('O teste roda a versão 0.2.0.'),
    );

    // Com o teste na versão do pacote, a produção é a proposta.
    await vi.waitFor(() => expect(radio('Produção').checked).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar a produção' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmação' });
    expect(dialogo.textContent).toContain(
      'Para atualizar a produção para a 0.2.0, digite o nome do banco da produção',
    );
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'grafite' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain('A produção roda a versão 0.2.0.'),
    );
    expect((await andamento()).textContent).toContain(
      'Backup 2026-10-28T1200Z feito e conferido em D:\\Backups\\Grafite.',
    );
  });

  it('recusa na produção a versão que não roda no teste, sem mudar nada', async () => {
    const { api, dominio } = apiEmMemoria();
    render(<App api={api} />);
    await abrirAtualizacao();
    fireEvent.click(radio('Produção'));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar a produção' }));
    await screen.findByText('Atualizar um ambiente não terminou: o motivo está acima.');
    expect((await andamento()).textContent).toContain(
      'A produção só recebe a versão que já roda no teste, e o teste roda a 0.1.1: atualize o teste para a 0.2.0 antes.',
    );
    expect(dominio.estado().ambientes.producao.atual).toBe('0.1.1');
  });

  it('o pacote digitado, quando ele não está nas pastas', async () => {
    const { api, pedidas } = apiEmMemoria();
    render(<App api={api} />);
    await abrirAtualizacao();
    fireEvent.click(radio('Outro pacote'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Caminho do pacote' }), {
      target: { value: 'E:\\versoes\\grafite-0.3.0-windows-x64.zip' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar o teste' }));
    await vi.waitFor(() =>
      expect(pedidas).toEqual([
        {
          tarefa: 'atualizar',
          campos: { zip: 'E:\\versoes\\grafite-0.3.0-windows-x64.zip', ambiente: 'teste' },
        },
      ]),
    );
  });
});
