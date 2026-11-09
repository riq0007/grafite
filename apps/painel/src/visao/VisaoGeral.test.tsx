// A tela principal do painel (spec painel-da-operacao, "Estado do servidor no painel"): cada serviço
// com o estado escrito e os botões, as versões, o backup, o certificado, o disco e a faixa de
// avisos, lidos de novo a cada 30 segundos, sobre o servidor de mentira em memória.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiEmMemoria } from '../../simulado/api-em-memoria.ts';
import { App } from '../App.tsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const linhaDo = async (servico: string) => {
  const tabela = await screen.findByRole('table', { name: 'Serviços' });
  const linha = within(tabela)
    .getAllByRole('row')
    .find((candidata) => within(candidata).queryByRole('rowheader', { name: servico }));
  if (linha === undefined) throw new Error(`Não há a linha do ${servico}.`);
  return linha;
};

describe('a tela principal', () => {
  it('mostra cada serviço com o estado escrito, as versões, o backup, o certificado e o disco', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    const tabela = await screen.findByRole('table', { name: 'Serviços' });
    expect(
      within(tabela)
        .getAllByRole('rowheader')
        .map((celula) => celula.textContent),
    ).toEqual([
      'Grafite',
      'Grafite Teste',
      'Grafite Coletor',
      'Grafite Proxy',
      'Grafite PostgreSQL Teste',
      'PostgreSQL da produção',
    ]);
    expect((await linhaDo('Grafite')).textContent).toContain('Rodando');
    // O proxy e os bancos sobem com o servidor: as linhas deles não têm botões.
    expect(within(await linhaDo('Grafite Proxy')).queryAllByRole('button')).toEqual([]);

    const producao = screen.getByRole('region', { name: 'Produção' });
    expect(producao.textContent).toContain('Versão 0.1.1');
    expect(producao.textContent).toContain('Anterior: 0.1.0');
    expect(producao.textContent).toContain('https://grafite.empresa.com.br');
    expect(screen.getByRole('region', { name: 'Teste' }).textContent).toContain(
      'Sem versão anterior',
    );
    const backup = screen.getByRole('region', { name: 'Backup' });
    expect(backup.textContent).toContain('Último backup: feito');
    expect(backup.textContent).toContain('D:\\Backups\\Grafite');
    expect(backup.textContent).toContain('Teste de restauração: feito');
    expect(screen.getByRole('region', { name: 'Certificado' }).textContent).toContain(
      'Vence em 75 dias',
    );
    expect(screen.getByRole('region', { name: 'Disco' }).textContent).toContain(
      '412 GB livres de 1.000 GB (41%)',
    );
    expect(screen.queryByRole('region', { name: 'Avisos' })).toBeNull();
  });

  it('Serviço parado: a linha do coletor diz "Parado" e tem o botão de ligar, e a faixa de avisos o diz', async () => {
    const { api, pedidas } = apiEmMemoria({ parados: ['grafite-coletor'] });
    render(<App api={api} />);
    const linha = await linhaDo('Grafite Coletor');
    expect(linha.textContent).toContain('Parado');
    fireEvent.click(within(linha).getByRole('button', { name: 'Ligar a produção' }));
    await vi.waitFor(() =>
      expect(pedidas).toEqual([{ tarefa: 'servicos-iniciar', campos: { ambiente: 'producao' } }]),
    );
    const avisos = screen.getByRole('region', { name: 'Avisos' });
    expect(avisos.textContent).toContain('O Grafite Coletor está parado.');
  });

  it('Certificado perto de vencer: a faixa de avisos diz em quantos dias ele vence e o que fazer', async () => {
    const { api } = apiEmMemoria({ diasDoCertificado: 10 });
    render(<App api={api} />);
    const avisos = await screen.findByRole('region', { name: 'Avisos' });
    expect(avisos.textContent).toContain(
      'O certificado do proxy vence em 10 dias. Ele se renova sozinho 30 dias antes: confira o token do DNS e o log do proxy, como diz o runbook ("Certificado").',
    );
  });

  it('Grafite parado: com a produção e o teste parados, mostra os dois parados e oferece ligar cada um', async () => {
    const { api } = apiEmMemoria({ parados: ['grafite', 'grafite-teste', 'grafite-coletor'] });
    render(<App api={api} />);
    const producao = await linhaDo('Grafite');
    const teste = await linhaDo('Grafite Teste');
    expect(producao.textContent).toContain('Parado');
    expect(teste.textContent).toContain('Parado');
    expect(within(producao).getByRole('button', { name: 'Ligar a produção' })).toBeDefined();
    expect(within(teste).getByRole('button', { name: 'Ligar o teste' })).toBeDefined();
    expect(within(producao).queryByRole('button', { name: 'Desligar a produção' })).toBeNull();
  });

  it('o serviço rodando oferece reiniciar e desligar o ambiente dele', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    const teste = await linhaDo('Grafite Teste');
    expect(
      within(teste)
        .getAllByRole('button')
        .map((botao) => botao.textContent),
    ).toEqual(['Reiniciar', 'Desligar']);
    expect(within(teste).getByRole('button', { name: 'Desligar o teste' })).toBeDefined();
  });

  it('lê o estado de novo a cada 30 segundos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = apiEmMemoria();
    const lido = vi.spyOn(api, 'estado');
    render(<App api={api} />);
    await screen.findByRole('table', { name: 'Serviços' });
    const antes = lido.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(lido.mock.calls.length).toBeGreaterThan(antes);
  });
});
