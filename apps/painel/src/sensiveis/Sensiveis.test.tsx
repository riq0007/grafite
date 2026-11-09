// As operações sensíveis pelo painel (spec painel-da-operacao, "Operações sensíveis no painel"): a
// restauração por um backup da lista, a volta à versão anterior e a troca da chave do cofre, cada
// uma explicando antes o que faz e pedindo o nome do banco digitado, como o comando pede, contra o
// servidor de mentira em memória.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiEmMemoria } from '../../simulado/api-em-memoria.ts';
import { App } from '../App.tsx';

afterEach(() => {
  cleanup();
});

const andamento = () => screen.findByRole('region', { name: 'Andamento da tarefa' });

async function abrirSensiveis() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Operações sensíveis' }));
}

async function responder(titulo: string, resposta: string, botao: string) {
  const dialogo = await screen.findByRole('dialog', { name: titulo });
  const campo = dialogo.querySelector('input') as HTMLInputElement;
  fireEvent.change(campo, { target: { value: resposta } });
  fireEvent.click(within(dialogo).getByRole('button', { name: botao }));
  return dialogo;
}

describe('as operações sensíveis', () => {
  it('Restauração pelo painel: pelo backup da lista, com o nome do banco, e o fim diz o banco de antes e o que conferir', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirSensiveis();
    const restauracao = screen.getByRole('region', { name: 'Restaurar a produção' });
    expect(restauracao.textContent).toContain('O banco e os arquivos de antes ficam guardados');
    fireEvent.click(await within(restauracao).findByRole('radio', { name: /2026-10-28T0500Z/ }));
    fireEvent.click(
      within(restauracao).getByRole('button', {
        name: 'Restaurar a produção a partir do backup 2026-10-28T0500Z',
      }),
    );
    await responder('Senha', 'senha-do-postgres', 'Responder');
    const confirmacao = await responder('Confirmação', 'grafite', 'Confirmar');
    expect(confirmacao.textContent).toContain(
      'Para restaurar a produção a partir do backup 2026-10-28T0500Z, digite o nome do banco da produção',
    );
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain(
        'A produção foi restaurada do backup 2026-10-28T0500Z. O banco de antes ficou guardado como grafite_antes_',
      ),
    );
    expect((await andamento()).textContent).toContain('("Depois da restauração")');
  });

  it('Confirmação que não confere: na volta da produção, outro nome não muda nada, e o painel diz que não confere', async () => {
    const { api, dominio } = apiEmMemoria();
    render(<App api={api} />);
    await abrirSensiveis();
    const volta = screen.getByRole('region', { name: 'Voltar à versão anterior' });
    expect(volta.textContent).toContain('sem desfazer as migrations');
    fireEvent.click(within(volta).getByRole('radio', { name: 'Produção' }));
    fireEvent.click(within(volta).getByRole('button', { name: 'Voltar a produção à 0.1.0' }));
    await responder('Confirmação', 'outro_banco', 'Confirmar');
    await screen.findByText('Voltar à versão anterior não terminou: o motivo está acima.');
    expect((await andamento()).textContent).toContain(
      'O texto digitado não confere com grafite. Nada foi feito.',
    );
    expect(dominio.estado().ambientes.producao).toMatchObject({
      atual: '0.1.1',
      anterior: '0.1.0',
    });
  });

  it('o ambiente sem versão anterior não tem a volta, com o motivo escrito', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirSensiveis();
    const volta = screen.getByRole('region', { name: 'Voltar à versão anterior' });
    fireEvent.click(within(volta).getByRole('radio', { name: 'Teste' }));
    expect(volta.textContent).toContain(
      'O teste não tem versão anterior: ela só existe depois de uma atualização.',
    );
    expect(within(volta).queryByRole('button', { name: /Voltar o teste/ })).toBeNull();
  });

  it('a troca da chave pede o nome do banco e diz onde guardar a chave anterior', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirSensiveis();
    const troca = screen.getByRole('region', { name: 'Trocar a chave do cofre' });
    fireEvent.click(within(troca).getByRole('button', { name: 'Trocar a chave do cofre' }));
    const dialogo = await responder('Confirmação', 'grafite', 'Confirmar');
    expect(dialogo.textContent).toContain(
      'Para trocar a chave do cofre nos dois ambientes, digite o nome do banco da produção',
    );
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain('junto dos backups feitos até hoje'),
    );
  });
});
