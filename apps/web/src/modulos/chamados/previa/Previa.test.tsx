// As peças da prévia do colaborador (change chamados-da-ti, design, decisão 16): a tela da aba, a
// faixa e a grade dos tipos com os atalhos de 1 a 9.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FaixaDaAba } from './FaixaDaAba.tsx';
import { GradeDosTipos, type TipoNaGrade } from './GradeDosTipos.tsx';
import { TelaDaAba } from './TelaDaAba.tsx';

afterEach(cleanup);

const TONER: TipoNaGrade = {
  id: 'toner',
  nome: 'Toner',
  icone: 'gota',
  frase: 'A impressora está sem toner ou a cópia saiu fraca',
};
const COMPUTADOR: TipoNaGrade = {
  id: 'computador',
  nome: 'Computador',
  icone: 'notebook',
  frase: 'Não liga, está lento ou travando',
};
const IMPRESSORA: TipoNaGrade = {
  id: 'impressora',
  nome: 'Impressora',
  icone: 'impressora',
  frase: 'Mancha, atola ou não imprime',
};
const TRES = [TONER, COMPUTADOR, IMPRESSORA];

const tipoNumero = (n: number): TipoNaGrade => ({
  id: `t${n}`,
  nome: `Tipo ${n}`,
  icone: 'reticencias',
  frase: `Frase ${n}`,
});

const cartoes = () => screen.getAllByRole('listitem');

/** A descrição lida do elemento, pelo `aria-describedby`. */
const descricaoDe = (elemento: HTMLElement) =>
  (elemento.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('FaixaDaAba', () => {
  it('a trilha em pílulas, com a atual marcada, e o passo', () => {
    render(<FaixaDaAba trilha={['Aba', 'Abrir chamado', 'Impressora']} passo="2 de 3" />);
    // Nenhum passo é um link: a trilha é a lista nomeada, e não um marco de navegação.
    expect(screen.queryByRole('navigation')).toBeNull();
    const trilha = screen.getByRole('list', { name: 'Onde você está' });
    const passos = within(trilha).getAllByRole('listitem');
    expect(passos.map((passo) => passo.textContent)).toEqual([
      'Aba',
      'Abrir chamado',
      'Impressora',
    ]);
    expect(passos.map((passo) => passo.getAttribute('aria-current'))).toEqual([null, null, 'step']);
    expect(screen.getByText('2 de 3')).toBeTruthy();
  });

  it('quem pede, com o "(você)" quando é a própria conta', () => {
    const { rerender } = render(
      <FaixaDaAba
        trilha={['Aba', 'Abrir chamado']}
        passo="1 de 3"
        quem={{ nome: 'Fernanda Rocha', voce: true }}
      />,
    );
    expect(screen.getByText(/No nome de/).textContent).toBe('No nome de Fernanda Rocha (você)');
    rerender(
      <FaixaDaAba
        trilha={['Aba', 'Abrir chamado']}
        passo="1 de 3"
        quem={{ nome: 'Carla Dias', voce: false }}
      />,
    );
    expect(screen.getByText(/No nome de/).textContent).toBe('No nome de Carla Dias');
    rerender(<FaixaDaAba trilha={['Aba', 'Abrir chamado']} passo="1 de 3" />);
    expect(screen.queryByText(/No nome de/)).toBeNull();
  });

  it('o "Trocar" só aparece com a ação', () => {
    const aoTrocar = vi.fn();
    const { rerender } = render(
      <FaixaDaAba
        trilha={['Aba', 'Abrir chamado']}
        passo="1 de 3"
        quem={{ nome: 'Fernanda Rocha', voce: true }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Trocar' })).toBeNull();
    rerender(
      <FaixaDaAba
        trilha={['Aba', 'Abrir chamado']}
        passo="1 de 3"
        quem={{ nome: 'Fernanda Rocha', voce: true }}
        aoTrocar={aoTrocar}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    expect(aoTrocar).toHaveBeenCalledOnce();
  });
});

describe('TelaDaAba', () => {
  it('a faixa no alto, o miolo e o rodapé, com a frase e a ação', () => {
    render(
      <TelaDaAba
        rotulo="Como o colaborador vê"
        trilha={['Aba', 'Abrir chamado']}
        passo="1 de 3"
        rodape={{
          frase: 'A resposta chega aqui e no chat da aba.',
          acao: <button type="button">Enviar para a TI</button>,
        }}
      >
        <p>O miolo</p>
      </TelaDaAba>,
    );
    const tela = screen.getByRole('region', { name: 'Como o colaborador vê' });
    expect(within(tela).getByRole('list', { name: 'Onde você está' })).toBeTruthy();
    expect(within(tela).getByText('O miolo')).toBeTruthy();
    expect(within(tela).getByText('A resposta chega aqui e no chat da aba.')).toBeTruthy();
    expect(within(tela).getByRole('button', { name: 'Enviar para a TI' })).toBeTruthy();
  });

  it('sem rodapé, só a faixa e o miolo', () => {
    render(
      <TelaDaAba rotulo="Como o colaborador vê" trilha={['Aba']} passo="1 de 3">
        <p>O miolo</p>
      </TelaDaAba>,
    );
    const tela = screen.getByRole('region', { name: 'Como o colaborador vê' });
    expect(within(tela).getByText('O miolo')).toBeTruthy();
    expect(tela.lastElementChild?.textContent).toBe('O miolo');
  });
});

describe('GradeDosTipos', () => {
  it('cada tipo com o atalho, o ícone, o nome e a frase, na ordem', () => {
    render(<GradeDosTipos tipos={TRES} />);
    const lista = screen.getByRole('list', { name: 'Sobre o que é o chamado?' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens.map((item) => item.textContent)).toEqual([
      '1TonerA impressora está sem toner ou a cópia saiu fraca',
      '2ComputadorNão liga, está lento ou travando',
      '3ImpressoraMancha, atola ou não imprime',
    ]);
    for (const item of itens) expect(item.querySelectorAll('svg')).toHaveLength(1);
  });

  it('diz até qual tecla vai o atalho: o do último tipo, até o 9', () => {
    const { rerender } = render(<GradeDosTipos tipos={TRES} />);
    expect(screen.getByText(/^Aperte/).textContent).toBe('Aperte 1 a 3 ou clique');
    rerender(<GradeDosTipos tipos={[TONER]} />);
    expect(screen.getByText(/^Aperte/).textContent).toBe('Aperte 1 ou clique');
    rerender(<GradeDosTipos tipos={Array.from({ length: 10 }, (_, i) => tipoNumero(i + 1))} />);
    expect(screen.getByText(/^Aperte/).textContent).toBe('Aperte 1 a 9 ou clique');
    // O décimo fica sem atalho.
    expect(cartoes()[9]?.textContent).toBe('Tipo 10Frase 10');
  });

  it('marca o tipo editado e o novo', () => {
    render(
      <GradeDosTipos
        tipos={[{ ...IMPRESSORA, marca: 'editando' }, { ...tipoNumero(9), marca: 'novo' }, TONER]}
      />,
    );
    expect(within(cartoes()[0] as HTMLElement).getByText('editando')).toBeTruthy();
    expect(within(cartoes()[1] as HTMLElement).getByText('novo')).toBeTruthy();
    expect(within(cartoes()[2] as HTMLElement).queryByText(/editando|novo/)).toBeNull();
  });

  it('sem tipos, diz que nenhum aparece', () => {
    render(<GradeDosTipos tipos={[]} />);
    expect(screen.getByText('Nenhum tipo aparece para o colaborador.')).toBeTruthy();
    expect(screen.queryByText(/^Aperte/)).toBeNull();
  });

  it('sem a ação, a grade é só para ver, com o visto no escolhido', () => {
    render(<GradeDosTipos tipos={TRES} escolhido="impressora" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(
      cartoes().map((cartao) => cartao.querySelector('[data-parte="visto"]') !== null),
    ).toEqual([false, false, true]);
  });

  it('no tipo com selo, o selo fica no canto do visto e entra na descrição', () => {
    render(
      <GradeDosTipos
        tipos={[{ ...IMPRESSORA, marca: 'editando' }, TONER]}
        escolhido="impressora"
        aoEscolher={vi.fn()}
      />,
    );
    const impressora = screen.getByRole('button', { name: 'Impressora' });
    expect(impressora.getAttribute('aria-pressed')).toBe('true');
    expect(descricaoDe(impressora)).toBe('editando Mancha, atola ou não imprime');
    expect(impressora.querySelector('[data-parte="visto"]')).toBeNull();
  });

  it('com a ação, o clique escolhe, e o escolhido fica marcado', () => {
    const aoEscolher = vi.fn();
    render(<GradeDosTipos tipos={TRES} escolhido="computador" aoEscolher={aoEscolher} />);
    const impressora = screen.getByRole('button', { name: 'Impressora' });
    expect(descricaoDe(impressora)).toBe('Mancha, atola ou não imprime');
    expect(impressora.getAttribute('aria-keyshortcuts')).toBe('3');
    const computador = screen.getByRole('button', { name: 'Computador' });
    expect(computador.getAttribute('aria-pressed')).toBe('true');
    expect(computador.querySelector('[data-parte="visto"]')).not.toBeNull();
    expect(impressora.getAttribute('aria-pressed')).toBe('false');
    expect(impressora.querySelector('[data-parte="visto"]')).toBeNull();
    fireEvent.click(impressora);
    expect(aoEscolher).toHaveBeenCalledWith('impressora');
  });

  it('as teclas 1 a 9 escolhem pela posição, sem modificador', () => {
    const aoEscolher = vi.fn();
    render(<GradeDosTipos tipos={TRES} aoEscolher={aoEscolher} />);
    const toner = screen.getByRole('button', { name: 'Toner' });
    fireEvent.keyDown(toner, { key: '3' });
    expect(aoEscolher).toHaveBeenLastCalledWith('impressora');
    fireEvent.keyDown(toner, { key: '2', ctrlKey: true });
    fireEvent.keyDown(toner, { key: '4' });
    expect(aoEscolher).toHaveBeenCalledOnce();
  });
});
