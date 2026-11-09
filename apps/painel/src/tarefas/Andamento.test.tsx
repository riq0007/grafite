// O andamento das tarefas e os diálogos (spec painel-da-operacao, "Tarefas do painel pelos mesmos
// comandos"): o que o comando escreve aparece ao vivo, as perguntas e as confirmações viram
// diálogos, a senha é digitada sem aparecer, o fim diz o resultado, as outras ações esperam com o
// motivo escrito e a página avisa antes de fechar no meio de uma tarefa.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { apiEmMemoria } from '../../simulado/api-em-memoria.ts';
import { App } from '../App.tsx';

afterEach(() => {
  cleanup();
});

const linhaDo = async (servico: string) => {
  const tabela = await screen.findByRole('table', { name: 'Serviços' });
  const linha = within(tabela)
    .getAllByRole('row')
    .find((candidata) => within(candidata).queryByRole('rowheader', { name: servico }));
  if (linha === undefined) throw new Error(`Não há a linha do ${servico}.`);
  return linha;
};

const andamento = () => screen.findByRole('region', { name: 'Andamento da tarefa' });

describe('o andamento das tarefas', () => {
  it('Desligar a produção: o painel pede o nome do banco digitado e só então para o app e o coletor', async () => {
    const { api, dominio } = apiEmMemoria();
    render(<App api={api} />);
    fireEvent.click(
      within(await linhaDo('Grafite')).getByRole('button', { name: 'Desligar a produção' }),
    );

    const dialogo = await screen.findByRole('dialog', { name: 'Confirmação' });
    expect(dialogo.textContent).toContain(
      'Para desligar a produção, digite o nome do banco da produção',
    );
    expect(dialogo.textContent).toContain('grafite');
    expect(dominio.estado().servicos.find(({ id }) => id === 'grafite')?.estado).toBe('rodando');

    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'grafite' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));

    const painel = await andamento();
    await screen.findByText('Pronto: Desligar um ambiente.');
    expect(painel.textContent).toContain(
      'A produção foi desligada: o app e o coletor estão parados.',
    );
    expect((await linhaDo('Grafite')).textContent).toContain('Parado');
  });

  it('a confirmação que não confere não muda nada, e o painel diz o motivo', async () => {
    const { api, dominio } = apiEmMemoria();
    render(<App api={api} />);
    fireEvent.click(
      within(await linhaDo('Grafite')).getByRole('button', { name: 'Desligar a produção' }),
    );
    const dialogo = await screen.findByRole('dialog', { name: 'Confirmação' });
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'grafite_teste' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Desligar um ambiente não terminou: o motivo está acima.');
    expect((await andamento()).textContent).toContain(
      'O texto digitado não confere com grafite. Nada foi feito.',
    );
    expect(dominio.estado().servicos.find(({ id }) => id === 'grafite')?.estado).toBe('rodando');
  });

  it('Tarefa que falha: o teste do e-mail recusado mostra o motivo, e a tela continua', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await linhaDo('Grafite');
    await act(async () => {
      await api.iniciar('email-testar', { para: 'ti@empresa.com.br' });
    });
    await screen.findByText('Testar o e-mail não terminou: o motivo está acima.');
    expect((await andamento()).textContent).toContain(
      'O servidor de e-mail recusou a autenticação. (535 Authentication failed)',
    );
    expect(screen.getByRole('table', { name: 'Serviços' })).toBeDefined();
  });

  it('a senha é digitada sem aparecer e não volta no andamento', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await linhaDo('Grafite');
    await act(async () => {
      await api.iniciar('email-configurar', {
        smtp: 'smtp://grafite@smtp.empresa.com.br:587',
        remetente: 'Grafite <grafite@empresa.com.br>',
      });
    });
    const dialogo = await screen.findByRole('dialog', { name: 'Senha' });
    expect(dialogo.textContent).toContain('Senha do SMTP');
    const campo = dialogo.querySelector('input');
    expect(campo?.getAttribute('type')).toBe('password');
    fireEvent.change(campo as HTMLInputElement, { target: { value: 'S3nh4-do-smtp' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Responder' }));
    await screen.findByText('Pronto: Configurar o e-mail.');
    expect((await andamento()).textContent).not.toContain('S3nh4-do-smtp');
  });

  it('enquanto uma tarefa roda, as outras ações esperam, com o motivo escrito, e a página avisa antes de fechar', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    fireEvent.click(
      within(await linhaDo('Grafite')).getByRole('button', { name: 'Desligar a produção' }),
    );
    await screen.findByRole('dialog', { name: 'Confirmação' });
    const teste = await linhaDo('Grafite Teste');
    expect(
      (within(teste).getByRole('button', { name: 'Reiniciar o teste' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText('Enquanto "Desligar um ambiente" roda, as outras ações esperam.'),
    ).toBeDefined();

    const fechar = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(fechar);
    expect(fechar.defaultPrevented).toBe(true);

    fireEvent.click(within(await andamento()).getByRole('button', { name: 'Cancelar a tarefa' }));
    await screen.findByText('Desligar um ambiente não terminou: o motivo está acima.');
    const depois = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(depois);
    expect(depois.defaultPrevented).toBe(false);
  });
});
