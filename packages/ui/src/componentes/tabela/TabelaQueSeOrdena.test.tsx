// A tabela que se ordena redesenha as linhas quando as colunas mudam (change chamados-da-ti, tarefa
// 5.20): o React Aria guarda as linhas desenhadas, e a coluna que passa a mostrar outra coisa, como o
// "copiado daqui" da origem de um Rascunho, precisa chegar às linhas que já estavam lá. Com o
// `aoAbrir` (tarefa 5.25), as setas só andam pelas linhas, e o clique e o Enter abrem a linha.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ColunaQueSeOrdena, TabelaQueSeOrdena } from './TabelaQueSeOrdena.tsx';

afterEach(cleanup);

interface Tipo {
  id: string;
  nome: string;
}

const TIPOS: Tipo[] = [
  { id: 'a', nome: 'Toner' },
  { id: 'b', nome: 'Computador' },
];

const colunas = (marcado: string | null): ColunaQueSeOrdena<Tipo>[] => [
  {
    id: 'tipo',
    titulo: 'Tipo',
    nomeDaLinha: true,
    celula: (tipo) => (tipo.id === marcado ? `${tipo.nome} · copiado daqui` : tipo.nome),
  },
];

function Tabela({ marcado }: { marcado: string | null }) {
  return (
    <>
      <h2 id="titulo">Tipos</h2>
      <TabelaQueSeOrdena
        aria-labelledby="titulo"
        itens={TIPOS}
        idDe={(tipo) => tipo.id}
        nomeDe={(tipo) => tipo.nome}
        colunas={colunas(marcado)}
        escolhido="a"
        aoEscolher={() => {}}
        alca={() => ({ onPointerDown: () => {} })}
        alvo={(tipo) => ({ 'data-tipo': tipo.id })}
        arraste={null}
        menuDaLinha={() => []}
      />
    </>
  );
}

/** A tabela das listas que abrem cada item numa gaveta, como a das respostas prontas. */
function TabelaQueAbre({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  return (
    <>
      <h2 id="titulo">Respostas prontas</h2>
      <TabelaQueSeOrdena
        aria-labelledby="titulo"
        itens={TIPOS}
        idDe={(tipo) => tipo.id}
        nomeDe={(tipo) => tipo.nome}
        colunas={colunas(null)}
        aoAbrir={aoAbrir}
        alca={() => ({ onPointerDown: () => {} })}
        alvo={(tipo) => ({ 'data-tipo': tipo.id })}
        arraste={null}
        menuDaLinha={() => []}
      />
    </>
  );
}

describe('TabelaQueSeOrdena', () => {
  it('redesenha as linhas que já estavam lá quando as colunas mudam', () => {
    const { rerender } = render(<Tabela marcado={null} />);
    expect(screen.queryByText('Computador · copiado daqui')).toBeNull();

    rerender(<Tabela marcado="b" />);

    expect(screen.getByText('Computador · copiado daqui')).toBeTruthy();
  });

  it('com o aoAbrir, as setas só andam pelas linhas, e o Enter abre a linha', async () => {
    const aoAbrir = vi.fn();
    const usuario = userEvent.setup();
    render(<TabelaQueAbre aoAbrir={aoAbrir} />);

    await usuario.tab();
    await usuario.keyboard('{ArrowDown}');

    expect(aoAbrir).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('row', { selected: true })).toHaveLength(0);

    await usuario.keyboard('{Enter}');

    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('com o aoAbrir, o clique abre a linha', async () => {
    const aoAbrir = vi.fn();
    const usuario = userEvent.setup();
    render(<TabelaQueAbre aoAbrir={aoAbrir} />);

    await usuario.click(screen.getByText('Computador'));

    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith('b');
  });
});
