// A tabela que se ordena redesenha as linhas quando as colunas mudam (change chamados-da-ti, tarefa
// 5.20): o React Aria guarda as linhas desenhadas, e a coluna que passa a mostrar outra coisa, como o
// "copiado daqui" da origem de um Rascunho, precisa chegar às linhas que já estavam lá.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type ColunaQueSeOrdena, TabelaQueSeOrdena } from './TabelaQueSeOrdena.tsx';

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

describe('TabelaQueSeOrdena', () => {
  it('redesenha as linhas que já estavam lá quando as colunas mudam', () => {
    const { rerender } = render(<Tabela marcado={null} />);
    expect(screen.queryByText('Computador · copiado daqui')).toBeNull();

    rerender(<Tabela marcado="b" />);

    expect(screen.getByText('Computador · copiado daqui')).toBeTruthy();
  });
});
