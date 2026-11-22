// O botão direito com uma lista ou um popover aberto (spec componentes-base, "Botão direito com um
// menu, uma lista ou um popover aberto"; change chat-com-chamados, decisão 15): todo painel do kit
// aberto entra no registro, sem prop, como a lista de uma seleção, o editor de um filtro e o cartão
// do resumo. Os casos do menu de contexto, como o campo e o link fora dele, ficam nos testes dele.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuscaComSugestoes } from '../busca/BuscaComSugestoes.tsx';
import { GatilhoComCartao } from '../referencia/GatilhoComCartao.tsx';
import { Selecao } from '../selecao/Selecao.tsx';
import { Popover } from './Popover.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PONTO = { clientX: 300, clientY: 200 };
/** O aperto do botão direito no elemento. */
const apertar = (alvo: Element) =>
  fireEvent.pointerDown(alvo, { pointerType: 'mouse', button: 2, ...PONTO });
/** O "contextmenu" do mesmo clique; falso quando foi impedido. */
const soltarEm = (alvo: Element) => fireEvent.contextMenu(alvo, { button: 2, ...PONTO });

const SITUACOES = [
  { id: 'aberto', rotulo: 'Aberto' },
  { id: 'resolvido', rotulo: 'Resolvido' },
];

/** O editor de um filtro, aberto, com a lista da seleção dele, que abre depois, como pelo clique. */
function EditorComALista({ aoMudarOEditor }: { aoMudarOEditor: (aberto: boolean) => void }) {
  const ancora = useRef<HTMLButtonElement>(null);
  const [editor, definirEditor] = useState(true);
  const [lista, definirLista] = useState(false);
  useEffect(() => definirLista(true), []);
  return (
    <>
      <button ref={ancora} type="button">
        Situação
      </button>
      <Popover
        ancora={ancora}
        aberto={editor}
        aoMudarAberto={(aberto) => {
          aoMudarOEditor(aberto);
          definirEditor(aberto);
        }}
        titulo="Filtrar por situação"
      >
        <Selecao rotulo="Situação" opcoes={SITUACOES} isOpen={lista} onOpenChange={definirLista} />
        <input aria-label="Filtrar" />
        <a href="#ajuda">Ajuda do filtro</a>
        <button type="button">Aplicar</button>
      </Popover>
    </>
  );
}

describe('o botão direito com uma lista ou um popover aberto', () => {
  it('a lista de uma seleção no editor de um filtro: o botão direito no editor fecha só a lista', async () => {
    const aoMudarOEditor = vi.fn();
    render(<EditorComALista aoMudarOEditor={aoMudarOEditor} />);
    await screen.findByRole('listbox');
    const editor = screen.getByRole('dialog', { name: 'Filtrar por situação' });
    const titulo = within(editor).getByRole('heading', { name: 'Filtrar por situação' });
    apertar(titulo);
    expect(screen.queryByRole('listbox')).toBeNull();
    // No editor, que segue aberto, o "contextmenu" fica com o app.
    expect(soltarEm(titulo)).toBe(false);
    expect(aoMudarOEditor).not.toHaveBeenCalled();
    // Fora dele, com a tela inerte atrás do editor, o aperto cai no corpo da página: ele fecha.
    apertar(document.body);
    expect(aoMudarOEditor).toHaveBeenCalledWith(false);
  });

  it('dentro do popover, o campo e o link ficam com o navegador; o resto, com o app', async () => {
    render(<EditorComALista aoMudarOEditor={vi.fn()} />);
    await screen.findByRole('listbox');
    const editor = screen.getByRole('dialog', { name: 'Filtrar por situação' });
    const campo = within(editor).getByRole('textbox', { name: 'Filtrar' });
    // O botão direito no campo, com o foco nele, como o "Filtrar" da escolha em árvore.
    apertar(campo);
    expect(soltarEm(campo)).toBe(true);
    const link = within(editor).getByRole('link', { name: 'Ajuda do filtro' });
    apertar(link);
    expect(soltarEm(link)).toBe(true);
    const aplicar = within(editor).getByRole('button', { name: 'Aplicar' });
    apertar(aplicar);
    expect(soltarEm(aplicar)).toBe(false);
    // A tecla de menu solta no que tem o foco: o campo fica com o navegador, e o botão, com o app.
    fireEvent.keyDown(campo, { key: 'ContextMenu' });
    expect(fireEvent.contextMenu(campo)).toBe(true);
    fireEvent.keyDown(aplicar, { key: 'ContextMenu' });
    expect(fireEvent.contextMenu(aplicar)).toBe(false);
  });

  it('no campo da busca com a lista aberta, a lista fecha com o texto digitado, e o campo fica com o navegador', async () => {
    render(<BuscaComSugestoes rotulo="Local" sugestoes={SITUACOES} aceitaTextoLivre={false} />);
    const campo = screen.getByRole('combobox', { name: 'Local' }) as HTMLInputElement;
    act(() => campo.focus());
    fireEvent.change(campo, { target: { value: 'Abe' } });
    await screen.findByRole('listbox');
    apertar(campo);
    expect(screen.queryByRole('listbox')).toBeNull();
    // Fechar não é sair do campo: o texto fica, para colar nele, e a escolha não muda.
    expect(campo.value).toBe('Abe');
    expect(soltarEm(campo)).toBe(true);
    expect(document.activeElement).toBe(campo);
  });

  it('o cartão do resumo fecha já, sem a espera do ponteiro que sai', () => {
    render(
      <GatilhoComCartao titulo="Resumo do chamado 1045" cartao={() => <p>Impressora manchando</p>}>
        Chamado 1045
      </GatilhoComCartao>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chamado 1045' }));
    expect(screen.getByText('Impressora manchando')).toBeTruthy();
    apertar(document.body);
    expect(screen.queryByText('Impressora manchando')).toBeNull();
  });

  // No tablet, o cartão abre pelo toque, e o texto dele é para copiar (decisão 15): o toque longo
  // manda o "contextmenu" sem o botão direito, e o menu do navegador, com o copiar, fica.
  it('o toque longo dentro do cartão aberto pelo toque fica com o navegador; a tecla de menu, com o app', () => {
    render(
      <GatilhoComCartao titulo="Resumo do chamado 1045" cartao={() => <p>Impressora manchando</p>}>
        Chamado 1045
      </GatilhoComCartao>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chamado 1045' }));
    const texto = screen.getByText('Impressora manchando');
    fireEvent.pointerDown(texto, { pointerType: 'touch', button: 0, ...PONTO });
    expect(fireEvent.contextMenu(texto, PONTO)).toBe(true);
    // A tecla de menu depois do toque, no mesmo cartão: o app fica com o "contextmenu" dela.
    fireEvent.keyDown(texto, { key: 'ContextMenu' });
    expect(fireEvent.contextMenu(texto)).toBe(false);
  });
});
