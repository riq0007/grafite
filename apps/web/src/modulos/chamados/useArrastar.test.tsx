// O arrastar das listas e das colunas dos chamados (change chamados-da-ti, design, decisão 15): o
// limiar de 4 px, o alvo sob o ponteiro e a metade dele, o alvo que recusa, o Esc e o clique que
// segue clique. O happy-dom não desenha: o desenho de cada teste diz onde fica cada elemento.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AlvoDoArraste, type Arraste, useArrastar } from './useArrastar.ts';

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  // O clique engolido depois de um arraste espera o fim da tarefa: ele não passa ao teste seguinte.
  await new Promise((pronto) => setTimeout(pronto, 0));
});

interface PropsDoQuadro {
  recebe?: (item: string, chave: string) => boolean;
  aoSoltar?: (item: string, alvo: AlvoDoArraste) => void;
  aoClicar?: () => void;
}

/** O quadro dos testes: um quadrado que se arrasta e as colunas de Renato e de Diego. */
function Quadro({ recebe, aoSoltar = () => {}, aoClicar }: PropsDoQuadro) {
  const { arraste, alca, alvo } = useArrastar<string>({ recebe, aoSoltar });
  return (
    <div>
      <button type="button" {...alca('#1038')} onClick={aoClicar}>
        #1038
      </button>
      <section {...alvo('renato')}>
        <span>Renato</span>
      </section>
      <section {...alvo('diego')}>Diego</section>
      <output>{arraste ? JSON.stringify(arraste) : 'parado'}</output>
    </div>
  );
}

/** Outro arraste na mesma tela, com uma coluna da mesma chave. */
function OutroQuadro() {
  const { alvo } = useArrastar<string>({ aoSoltar: () => {} });
  return <section {...alvo('renato')}>Renato do outro quadro</section>;
}

type Caixa = [x: number, y: number, largura: number, altura: number];

/** Onde fica cada elemento; o que vem depois fica por cima. Fora de tudo, o corpo da página. */
function desenhar(caixas: [Element, Caixa][]) {
  for (const [elemento, [x, y, largura, altura]] of caixas) {
    vi.spyOn(elemento, 'getBoundingClientRect').mockReturnValue(new DOMRect(x, y, largura, altura));
  }
  vi.spyOn(document, 'elementFromPoint').mockImplementation((px, py) => {
    const sob = caixas.findLast(
      ([, [x, y, largura, altura]]) => px >= x && px < x + largura && py >= y && py < y + altura,
    );
    return sob?.[0] ?? document.body;
  });
}

/** O quadro na tela, desenhado: o quadrado no alto, Renato à esquerda e Diego à direita. */
function naTela(props: PropsDoQuadro = {}) {
  const tela = render(<Quadro {...props} />);
  const botao = screen.getByRole('button', { name: '#1038' });
  desenhar([
    [botao, [10, 10, 60, 20]],
    [screen.getByText('Renato').closest('section') as Element, [0, 100, 100, 100]],
    [screen.getByText('Renato'), [10, 110, 50, 20]],
    [screen.getByText('Diego'), [200, 100, 100, 100]],
  ]);
  return { ...tela, botao };
}

const apertar = (elemento: Element, x = 20, y = 20, mais: PointerEventInit = {}) =>
  fireEvent.pointerDown(elemento, { button: 0, pointerId: 1, clientX: x, clientY: y, ...mais });
/** O movimento, com o botão principal apertado, a menos que o teste diga outros botões. */
const mover = (x: number, y: number, pointerId = 1, buttons = 1) =>
  fireEvent.pointerMove(window, { pointerId, clientX: x, clientY: y, buttons });
const soltar = (x: number, y: number, pointerId = 1) =>
  fireEvent.pointerUp(window, { pointerId, clientX: x, clientY: y });

/** O arraste que a tela mostra agora. */
function oArraste(): Arraste<string> | null {
  const texto = document.querySelector('output')?.textContent;
  return texto === 'parado' || !texto ? null : JSON.parse(texto);
}

describe('useArrastar', () => {
  it('até 4 px o clique segue clique: nada começa, nem sobre a coluna, e o clique chega', () => {
    const aoSoltar = vi.fn();
    const aoClicar = vi.fn();
    const { botao } = naTela({ aoSoltar, aoClicar });
    // Como o quadrado dentro da coluna de Renato: apertado e solto sobre ela, sem passar do limiar.
    apertar(botao, 30, 120);
    mover(33, 120);
    mover(32, 122);
    expect(oArraste()).toBeNull();
    soltar(32, 122);
    fireEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledTimes(1);
    expect(aoSoltar).not.toHaveBeenCalled();
  });

  it('começa nos 4 px, em qualquer direção, com o item, o ponteiro e quanto ele andou', () => {
    const { botao } = naTela();
    apertar(botao);
    mover(23, 22);
    expect(oArraste()).toBeNull();
    mover(20, 24);
    expect(oArraste()).toEqual({
      item: '#1038',
      x: 20,
      y: 24,
      dx: 0,
      dy: 4,
      alvo: null,
      recebe: false,
    });
    soltar(20, 24);
    expect(oArraste()).toBeNull();
    apertar(botao);
    mover(23, 23);
    expect(oArraste()).toMatchObject({ x: 23, y: 23, dx: 3, dy: 3 });
  });

  it('o alvo é o deste arraste sob o ponteiro, subindo do que está nele, com a metade: o encaixe', () => {
    const { botao } = naTela();
    apertar(botao);
    mover(30, 120);
    expect(oArraste()).toMatchObject({ alvo: { chave: 'renato', metade: 'antes' }, recebe: true });
    mover(30, 150);
    expect(oArraste()?.alvo).toEqual({ chave: 'renato', metade: 'depois' });
    mover(250, 199);
    expect(oArraste()?.alvo).toEqual({ chave: 'diego', metade: 'depois' });
    mover(150, 150);
    expect(oArraste()).toMatchObject({ alvo: null, recebe: false });
  });

  it('solta no alvo que recebe: o item e o alvo, uma vez, e o arraste acaba', () => {
    const aoSoltar = vi.fn();
    const { botao } = naTela({ aoSoltar });
    apertar(botao);
    mover(30, 140);
    soltar(30, 120);
    expect(aoSoltar).toHaveBeenCalledTimes(1);
    expect(aoSoltar).toHaveBeenCalledWith('#1038', { chave: 'renato', metade: 'antes' });
    expect(oArraste()).toBeNull();
    mover(30, 170);
    soltar(30, 170);
    expect(aoSoltar).toHaveBeenCalledTimes(1);
  });

  it('o alvo que recusa não recebe, e soltar nele não faz nada', () => {
    const aoSoltar = vi.fn();
    const recebe = vi.fn((_item: string, chave: string) => chave !== 'diego');
    const { botao } = naTela({ aoSoltar, recebe });
    apertar(botao);
    mover(250, 150);
    expect(oArraste()).toMatchObject({ alvo: { chave: 'diego' }, recebe: false });
    expect(recebe).toHaveBeenLastCalledWith('#1038', 'diego');
    soltar(250, 150);
    expect(aoSoltar).not.toHaveBeenCalled();
    apertar(botao);
    mover(30, 150);
    expect(oArraste()).toMatchObject({ alvo: { chave: 'renato' }, recebe: true });
  });

  it('sem o recebe, todo alvo recebe; fora de um alvo, soltar não faz nada', () => {
    const aoSoltar = vi.fn();
    const { botao } = naTela({ aoSoltar });
    apertar(botao);
    mover(250, 150);
    expect(oArraste()?.recebe).toBe(true);
    mover(150, 150);
    soltar(150, 150);
    expect(aoSoltar).not.toHaveBeenCalled();
  });

  it('o clique depois do arraste não chega ao item; o do clique seguinte, sim', () => {
    const aoClicar = vi.fn();
    const { botao } = naTela({ aoClicar });
    apertar(botao);
    mover(30, 120);
    soltar(20, 20);
    fireEvent.click(botao);
    expect(aoClicar).not.toHaveBeenCalled();
    apertar(botao);
    soltar(20, 20);
    fireEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it('o clique depois do arraste não chega ao quadro, que o recebe com a soltura fora do item', () => {
    const aoClicarNoQuadro = vi.fn();
    const { botao, container } = naTela();
    const quadro = container.firstElementChild as HTMLElement;
    quadro.addEventListener('click', aoClicarNoQuadro);
    apertar(botao);
    mover(30, 120);
    soltar(30, 120);
    // Apertado no quadrado e solto na coluna, o navegador manda o clique ao ancestral comum dos dois.
    expect(fireEvent.click(quadro)).toBe(false);
    expect(aoClicarNoQuadro).not.toHaveBeenCalled();
    fireEvent.click(quadro);
    expect(aoClicarNoQuadro).toHaveBeenCalledTimes(1);
  });

  it('o arraste que acaba fora do item não engole o clique seguinte, nem o de teclado', async () => {
    const aoClicar = vi.fn();
    const { botao } = naTela({ aoClicar });
    apertar(botao);
    mover(250, 150);
    soltar(250, 150);
    apertar(botao);
    soltar(20, 20);
    fireEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledTimes(1);
    apertar(botao);
    mover(250, 150);
    soltar(250, 150);
    await act(() => new Promise((pronto) => setTimeout(pronto, 0)));
    fireEvent.click(botao);
    expect(aoClicar).toHaveBeenCalledTimes(2);
  });

  it('o Esc cancela o arraste e não chega à tela; antes dos 4 px e parado, ele segue', () => {
    const aoSoltar = vi.fn();
    const aoClicar = vi.fn();
    const teclas = vi.fn();
    const { botao } = naTela({ aoSoltar, aoClicar });
    document.body.addEventListener('keydown', teclas);
    try {
      apertar(botao);
      mover(22, 20);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(teclas).toHaveBeenCalledTimes(1);
      mover(30, 120);
      expect(oArraste()?.alvo?.chave).toBe('renato');
      fireEvent.keyDown(document.body, { key: 'a' });
      expect(teclas).toHaveBeenCalledTimes(2);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(teclas).toHaveBeenCalledTimes(2);
      expect(oArraste()).toBeNull();
      mover(30, 150);
      expect(oArraste()).toBeNull();
      soltar(30, 150);
      fireEvent.click(botao);
      expect(aoSoltar).not.toHaveBeenCalled();
      expect(aoClicar).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(teclas).toHaveBeenCalledTimes(3);
    } finally {
      document.body.removeEventListener('keydown', teclas);
    }
  });

  it('o pointercancel cancela, e o aperto seguinte começa outro arraste', () => {
    const aoSoltar = vi.fn();
    const { botao } = naTela({ aoSoltar });
    apertar(botao);
    mover(30, 120);
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(oArraste()).toBeNull();
    mover(30, 150);
    expect(oArraste()).toBeNull();
    soltar(30, 150);
    expect(aoSoltar).not.toHaveBeenCalled();
    apertar(botao);
    mover(30, 120);
    expect(oArraste()?.alvo?.chave).toBe('renato');
  });

  it('o movimento sem o botão principal acaba o arraste sem soltar: a soltura que se perdeu', () => {
    const aoSoltar = vi.fn();
    const { botao } = naTela({ aoSoltar });
    // Sem a captura, a soltura pode não chegar (o Alt+Tab, um diálogo, o menu do botão direito): o
    // mouse volta a mover sem o botão, e o arraste acaba ali.
    apertar(botao);
    mover(30, 120);
    mover(30, 150, 1, 0);
    expect(oArraste()).toBeNull();
    soltar(30, 150);
    expect(aoSoltar).not.toHaveBeenCalled();
    // Só com o botão direito apertado, também; e o aperto seguinte começa outro arraste.
    apertar(botao, 40, 20);
    mover(30, 120);
    mover(30, 150, 1, 2);
    expect(oArraste()).toBeNull();
    apertar(botao, 50, 25);
    mover(54, 25);
    expect(oArraste()).toMatchObject({ dx: 4, dy: 0 });
    mover(30, 120);
    soltar(30, 120);
    expect(aoSoltar).toHaveBeenCalledTimes(1);
  });

  it('o movimento sem o botão acaba também o aperto antes dos 4 px e o arraste cancelado pelo Esc', () => {
    const { botao } = naTela();
    apertar(botao);
    mover(21, 20, 1, 0);
    apertar(botao, 40, 20);
    mover(44, 20);
    expect(oArraste()).toMatchObject({ dx: 4, dy: 0 });
    mover(30, 120);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    mover(30, 150, 1, 0);
    apertar(botao, 50, 25);
    mover(54, 25);
    expect(oArraste()).toMatchObject({ dx: 4, dy: 0 });
  });

  it('a janela que perde o foco acaba o arraste sem soltar; o foco que sai de um elemento, não', () => {
    const aoSoltar = vi.fn();
    const { botao } = naTela({ aoSoltar });
    apertar(botao);
    mover(30, 120);
    fireEvent.blur(botao);
    expect(oArraste()?.alvo?.chave).toBe('renato');
    fireEvent.blur(window);
    expect(oArraste()).toBeNull();
    mover(30, 150);
    expect(oArraste()).toBeNull();
    soltar(30, 150);
    expect(aoSoltar).not.toHaveBeenCalled();
    apertar(botao, 40, 20);
    mover(44, 20);
    expect(oArraste()).toMatchObject({ dx: 4, dy: 0 });
  });

  it('o botão direito não arrasta, e um segundo ponteiro não mexe no arraste', () => {
    const aoSoltar = vi.fn();
    const { botao } = naTela({ aoSoltar });
    apertar(botao, 20, 20, { button: 2 });
    mover(30, 120);
    expect(oArraste()).toBeNull();
    soltar(30, 120);
    apertar(botao);
    apertar(botao, 20, 20, { pointerId: 2 });
    mover(30, 120, 2);
    expect(oArraste()).toBeNull();
    soltar(30, 120, 2);
    fireEvent.pointerCancel(window, { pointerId: 2 });
    mover(30, 120);
    expect(oArraste()?.item).toBe('#1038');
    soltar(30, 120);
    expect(aoSoltar).toHaveBeenCalledTimes(1);
  });

  it('o recebe e o soltar são os da última renderização, também no meio do arraste', () => {
    const primeiro = vi.fn();
    const ultimo = vi.fn();
    const { botao, rerender } = naTela({ aoSoltar: primeiro });
    apertar(botao);
    mover(250, 150);
    expect(oArraste()?.recebe).toBe(true);
    // Os dados mudam no meio do arraste: Diego deixa de atender os locais do chamado.
    rerender(<Quadro aoSoltar={ultimo} recebe={(_item, chave) => chave !== 'diego'} />);
    mover(251, 150);
    expect(oArraste()).toMatchObject({ alvo: { chave: 'diego' }, recebe: false });
    mover(30, 120);
    soltar(30, 120);
    expect(primeiro).not.toHaveBeenCalled();
    expect(ultimo).toHaveBeenCalledWith('#1038', { chave: 'renato', metade: 'antes' });
  });

  it('os alvos de outro arraste na mesma tela não contam, nem com a mesma chave', () => {
    render(
      <>
        <Quadro />
        <OutroQuadro />
      </>,
    );
    desenhar([
      [screen.getByRole('button', { name: '#1038' }), [10, 10, 60, 20]],
      [screen.getByText('Renato do outro quadro'), [400, 100, 100, 100]],
    ]);
    apertar(screen.getByRole('button', { name: '#1038' }));
    mover(450, 150);
    expect(oArraste()).toMatchObject({ alvo: null, recebe: false });
  });

  it('o arrastar do próprio navegador fica desligado no item', () => {
    const { botao } = naTela();
    expect(fireEvent.dragStart(botao)).toBe(false);
  });

  it('desmontar no meio do arraste tira os ouvintes da janela', () => {
    const aoSoltar = vi.fn();
    const { botao, unmount } = naTela({ aoSoltar });
    apertar(botao);
    mover(30, 120);
    const tirar = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(tirar.mock.calls.map(([tipo]) => tipo).sort()).toEqual([
      'blur',
      'keydown',
      'pointercancel',
      'pointermove',
      'pointerup',
    ]);
    soltar(30, 120);
    expect(aoSoltar).not.toHaveBeenCalled();
  });
});
