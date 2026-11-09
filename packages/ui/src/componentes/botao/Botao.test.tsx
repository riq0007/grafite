import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Botao } from './Botao.tsx';

afterEach(cleanup);

describe('Botao', () => {
  it('o nível padrão é o secundário, e cada nível fica marcado para o estilo', () => {
    render(
      <>
        <Botao>Cancelar</Botao>
        <Botao nivel="primario">Salvar</Botao>
        <Botao nivel="terciario">Mais opções</Botao>
        <Botao nivel="destrutivo">Excluir</Botao>
      </>,
    );
    const nivel = (nome: string) =>
      screen.getByRole('button', { name: nome }).getAttribute('data-nivel');
    expect(nivel('Cancelar')).toBe('secundario');
    expect(nivel('Salvar')).toBe('primario');
    expect(nivel('Mais opções')).toBe('terciario');
    expect(nivel('Excluir')).toBe('destrutivo');
  });

  it('é type="button" por padrão, para não enviar formulário sem querer', () => {
    render(<Botao>Filtrar</Botao>);
    expect(screen.getByRole('button', { name: 'Filtrar' }).getAttribute('type')).toBe('button');
  });

  it('desabilitado não aciona', async () => {
    const acionar = vi.fn();
    render(
      <Botao isDisabled onPress={acionar}>
        Salvar
      </Botao>,
    );
    const botao = screen.getByRole('button', { name: 'Salvar' });
    await userEvent.click(botao);
    expect(acionar).not.toHaveBeenCalled();
    expect(botao.hasAttribute('disabled')).toBe(true);
  });

  it('carregando: não aciona de novo, fica indisponível e anuncia o processamento', async () => {
    const acionar = vi.fn();
    render(
      <Botao nivel="primario" carregando onPress={acionar}>
        Salvar
      </Botao>,
    );
    const botao = screen.getByRole('button', { name: /Salvar.*Processando/ });
    await userEvent.click(botao);
    expect(acionar).not.toHaveBeenCalled();
    expect(botao.getAttribute('aria-disabled')).toBe('true');
    expect(botao.hasAttribute('data-pending')).toBe(true);
  });

  it('carregando continua focável, para o leitor de tela acompanhar a operação', async () => {
    render(<Botao carregando>Salvar</Botao>);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Salvar/ }));
  });

  it('o rótulo de carregando pode ser trocado', () => {
    render(
      <Botao carregando rotuloCarregando="Enviando">
        Enviar
      </Botao>,
    );
    expect(screen.getByRole('button', { name: /Enviar.*Enviando/ })).toBeDefined();
  });
});
