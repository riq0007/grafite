import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BuscaComSugestoes } from './BuscaComSugestoes.tsx';

afterEach(cleanup);

const locais = [
  { id: 'sede', rotulo: 'Sede' },
  { id: 'almoxarifado', rotulo: 'Almoxarifado central' },
];

describe('BuscaComSugestoes', () => {
  it('é uma caixa de combinação nomeada pelo rótulo visível', () => {
    render(<BuscaComSugestoes rotulo="Local" sugestoes={locais} placeholder="Buscar local" />);
    const busca = screen.getByRole('combobox', { name: 'Local' });
    expect(busca.getAttribute('placeholder')).toBe('Buscar local');
  });

  it('obrigatória e com erro de fora', () => {
    render(
      <BuscaComSugestoes rotulo="Local" sugestoes={locais} obrigatorio erro="Local desativado." />,
    );
    const busca = screen.getByRole('combobox', { name: 'Local' });
    expect((busca as HTMLInputElement).required).toBe(true);
    expect(busca.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Local desativado.')).toBeDefined();
  });

  it('a opção com o detalhe o mostra embaixo do nome, como a descrição dela', async () => {
    render(
      <BuscaComSugestoes
        rotulo="Ativo"
        sugestoes={[
          { id: 'pat-139', rotulo: 'Impressora 139', detalhe: 'Impressora · ADM › sala01' },
          { id: 'pat-140', rotulo: 'Switch 140' },
        ]}
        defaultInputValue=""
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mostrar as opções de/ }));
    const comDetalhe = await screen.findByRole('option', { name: 'Impressora 139' });
    const descricao = document.getElementById(comDetalhe.getAttribute('aria-describedby') ?? '');
    expect(descricao?.textContent).toBe('Impressora · ADM › sala01');
    const semDetalhe = screen.getByRole('option', { name: 'Switch 140' });
    expect(semDetalhe.getAttribute('aria-describedby')).toBeNull();
  });

  it('a ação na linha do rótulo faz só o dela, sem abrir a lista, e diz se a área dela está à vista', () => {
    const pressionadas: string[] = [];
    const { rerender } = render(
      <BuscaComSugestoes
        rotulo="Ativo"
        sugestoes={locais}
        acaoDoRotulo={{
          texto: 'Mais opções de busca',
          expandida: false,
          aoPressionar: () => pressionadas.push('mais'),
        }}
      />,
    );
    const acao = screen.getByRole('button', { name: 'Mais opções de busca' });
    expect(acao.getAttribute('aria-expanded')).toBe('false');
    expect(acao.getAttribute('aria-controls')).toBeNull();
    fireEvent.click(acao);
    expect(pressionadas).toEqual(['mais']);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Ativo' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    rerender(
      <BuscaComSugestoes
        rotulo="Ativo"
        sugestoes={locais}
        acaoDoRotulo={{
          texto: 'Esconder as opções de busca',
          expandida: true,
          controla: 'filtros',
          aoPressionar: () => pressionadas.push('esconder'),
        }}
      />,
    );
    const esconder = screen.getByRole('button', { name: 'Esconder as opções de busca' });
    expect(esconder.getAttribute('aria-expanded')).toBe('true');
    expect(esconder.getAttribute('aria-controls')).toBe('filtros');
  });
});
