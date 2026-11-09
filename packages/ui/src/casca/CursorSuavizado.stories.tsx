import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from '../componentes/botao/Botao.tsx';
import { CampoDeTexto } from '../componentes/campo/CampoDeTexto.tsx';
import { ControleSegmentado, Segmento } from '../componentes/escolhas/ControleSegmentado.tsx';
import { ItemDeMenu, Menu } from '../componentes/menu/Menu.tsx';
import { CursorSuavizado, type PropsDoCursorSuavizado } from './CursorSuavizado.tsx';

const meta: Meta<typeof CursorSuavizado> = {
  title: 'Casca/Cursor suavizado',
  component: CursorSuavizado,
  args: { tipo: 'suavizado', suavizacao: 95, abracar: true },
  render: (args) => <Cenario {...args} />,
};

/** Elementos por onde o cursor passa nas histórias. */
function Cenario(props: PropsDoCursorSuavizado) {
  const [temporario, definirTemporario] = useState(true);
  return (
    <div style={{ display: 'grid', gap: 'var(--esp-4)', padding: 'var(--esp-8)' }}>
      <div style={{ display: 'flex', gap: 'var(--esp-4)', alignItems: 'end' }}>
        <Botao>Salvar</Botao>
        <CampoDeTexto rotulo="Nome" />
        <Menu rotulo="Ações" gatilho={<Botao>Ações</Botao>}>
          <ItemDeMenu id="duplicar">Duplicar</ItemDeMenu>
          <ItemDeMenu id="arquivar">Arquivar</ItemDeMenu>
        </Menu>
        {temporario && <Botao onPress={() => definirTemporario(false)}>Sai ao clicar</Botao>}
        <ControleSegmentado rotulo="Posição" defaultValue="embaixo">
          <Segmento value="embaixo">Embaixo</Segmento>
          <Segmento value="esquerda">À esquerda</Segmento>
        </ControleSegmentado>
        <p style={{ margin: 0 }} data-testid="texto">
          Texto comum
        </p>
      </div>
      <button type="button" style={{ width: 480 }}>
        Linha larga, como a de uma tabela
      </button>
      <div data-testid="rolagem" style={{ height: 80, overflow: 'auto', width: 240 }}>
        <div style={{ height: 120 }} />
        <Botao>No fim da rolagem</Botao>
        <div style={{ height: 120 }} />
      </div>
      <CursorSuavizado {...props} />
    </div>
  );
}
export default meta;

type Historia = StoryObj<typeof CursorSuavizado>;

const parte = (nome: 'ponto' | 'anel') =>
  document.querySelector<HTMLElement>(`[data-cursor="${nome}"]`) as HTMLElement;

/** Centro de um elemento na tela. */
const centro = (elemento: Element) => {
  const caixa = elemento.getBoundingClientRect();
  return { x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 2 };
};

/** Move o mouse sobre um elemento, num ponto dele. */
async function moverPara(elemento: Element, dx = 0, dy = 0) {
  const { x, y } = centro(elemento);
  await userEvent.pointer({ target: elemento, coords: { clientX: x + dx, clientY: y + dy } });
  return { x: x + dx, y: y + dy };
}

/** O ponto segue o mouse sem atraso, e o anel chega a ele depois, suavizado. */
export const PontoEAnel: Historia = {
  play: async ({ canvasElement }) => {
    const texto = within(canvasElement).getByTestId('texto');
    const alvo = await moverPara(texto);
    const ponto = centro(parte('ponto'));
    await expect(Math.abs(ponto.x - alvo.x)).toBeLessThan(1);
    await expect(Math.abs(ponto.y - alvo.y)).toBeLessThan(1);
    await expect(parte('anel')).toHaveAttribute('data-visivel');
    await waitFor(() => {
      const anel = centro(parte('anel'));
      expect(Math.abs(anel.x - alvo.x)).toBeLessThan(1);
      expect(Math.abs(anel.y - alvo.y)).toBeLessThan(1);
    });
    await expect(document.documentElement).toHaveAttribute('data-cursor-suavizado');
  },
};

/** Num campo de texto, o ponto e o anel somem e volta o cursor de texto do sistema. */
export const SomeNoCampoDeTexto: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await moverPara(tela.getByTestId('texto'));
    await expect(parte('ponto')).toHaveAttribute('data-visivel');
    const campo = tela.getByRole('textbox', { name: 'Nome' });
    await moverPara(campo);
    await expect(parte('ponto')).not.toHaveAttribute('data-visivel');
    await expect(parte('anel')).not.toHaveAttribute('data-visivel');
    await expect(document.documentElement).not.toHaveAttribute('data-cursor-suavizado');
    await expect(getComputedStyle(campo).cursor).toBe('text');
  },
};

/** O cursor não recebe eventos e fica acima de um menu aberto. */
export const AcimaDeUmMenu: Historia = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Ações' }));
    const menu = await within(document.body).findByRole('menu', { name: 'Ações' });
    await moverPara(within(menu).getByRole('menuitem', { name: 'Arquivar' }));
    const camada = parte('ponto').parentElement as HTMLElement;
    const popover = menu.closest('[data-trigger]') ?? menu.parentElement;
    await expect(Number(getComputedStyle(camada).zIndex)).toBeGreaterThan(
      Number(getComputedStyle(popover as Element).zIndex) || 0,
    );
    await expect(getComputedStyle(parte('ponto')).pointerEvents).toBe('none');
    await expect(parte('ponto').closest('[aria-hidden="true"]')).not.toBeNull();
    await userEvent.keyboard('{Escape}');
  },
};

/** Com "Do sistema", nada do cursor suavizado aparece. */
export const DoSistema: Historia = {
  args: { tipo: 'sistema' },
  play: async ({ canvasElement }) => {
    await moverPara(within(canvasElement).getByTestId('texto'));
    await expect(document.querySelector('[data-cursor="ponto"]')).toBeNull();
    await expect(document.documentElement).not.toHaveAttribute('data-cursor-suavizado');
  },
};

/** O tipo de cursor escolhido na tela, como na seção Cursor dos Ajustes. */
function CenarioComEscolha(props: PropsDoCursorSuavizado) {
  const [tipo, definirTipo] = useState(props.tipo);
  return (
    <div style={{ padding: 'var(--esp-8)' }}>
      <ControleSegmentado
        rotulo="Tipo de cursor"
        value={tipo}
        onChange={(valor) => definirTipo(valor as PropsDoCursorSuavizado['tipo'])}
      >
        <Segmento value="suavizado">Suavizado</Segmento>
        <Segmento value="sistema">Do sistema</Segmento>
      </ControleSegmentado>
      <CursorSuavizado {...props} tipo={tipo} />
    </div>
  );
}

/**
 * Escolher "Do sistema" com um clique devolve o cursor do sistema, e ele continua de volta depois
 * dos quadros seguintes ao clique, quando o cursor suavizado já saiu.
 */
export const DoSistemaPeloClique: Historia = {
  render: (args) => <CenarioComEscolha {...args} />,
  play: async ({ canvasElement }) => {
    const doSistema = within(canvasElement).getByText('Do sistema');
    await moverPara(doSistema);
    await expect(document.documentElement).toHaveAttribute('data-cursor-suavizado');
    await userEvent.click(doSistema);
    await waitFor(() => expect(document.querySelector('[data-cursor="ponto"]')).toBeNull());
    await new Promise((resolver) => requestAnimationFrame(() => requestAnimationFrame(resolver)));
    await expect(document.documentElement).not.toHaveAttribute('data-cursor-suavizado');
  },
};

/** O anel abraça o botão: o contorno com 4 px de folga de cada lado, e o ponto some. */
export const AbracaUmBotao: Historia = {
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Salvar' });
    await moverPara(botao);
    const caixa = botao.getBoundingClientRect();
    await waitFor(() => {
      const anel = parte('anel').getBoundingClientRect();
      expect(Math.abs(anel.width - (caixa.width + 8))).toBeLessThan(0.5);
      expect(Math.abs(anel.height - (caixa.height + 8))).toBeLessThan(0.5);
      expect(Math.abs(anel.left - (caixa.left - 4))).toBeLessThan(0.5);
    });
    await expect(parte('anel')).toHaveAttribute('data-abracando');
    await expect(parte('ponto')).not.toHaveAttribute('data-visivel');
  },
};

/** Item de menu e linha larga não são abraçados: o anel continua redondo e o ponto, à vista. */
export const SemAbracoEmMenuOuLinha: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await moverPara(tela.getByRole('button', { name: 'Linha larga, como a de uma tabela' }));
    await expect(parte('anel')).not.toHaveAttribute('data-abracando');
    await expect(parte('ponto')).toHaveAttribute('data-visivel');
    await userEvent.click(tela.getByRole('button', { name: 'Ações' }));
    const menu = await within(document.body).findByRole('menu', { name: 'Ações' });
    await moverPara(within(menu).getByRole('menuitem', { name: 'Duplicar' }));
    await expect(parte('anel')).not.toHaveAttribute('data-abracando');
    await expect(parte('ponto')).toHaveAttribute('data-visivel');
    await userEvent.keyboard('{Escape}');
  },
};

/** Quando o elemento abraçado some, o anel volta à forma redonda, sem o mouse se mover. */
export const VoltaAoRedondo: Historia = {
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Sai ao clicar' });
    await moverPara(botao);
    await expect(parte('anel')).toHaveAttribute('data-abracando');
    await userEvent.click(botao);
    await waitFor(() => expect(parte('anel')).not.toHaveAttribute('data-abracando'));
    await waitFor(() => expect(parte('anel').getBoundingClientRect().width).toBeCloseTo(26, 0));
  },
};

/** Rolar põe outro elemento sob o ponteiro parado, e o anel passa a abraçá-lo. */
export const RecalculaAoRolar: Historia = {
  play: async ({ canvasElement }) => {
    const rolagem = within(canvasElement).getByTestId('rolagem');
    const caixa = rolagem.getBoundingClientRect();
    await userEvent.pointer({
      target: rolagem,
      coords: { clientX: caixa.left + 20, clientY: caixa.top + 20 },
    });
    await expect(parte('anel')).not.toHaveAttribute('data-abracando');
    rolagem.scrollTop = 110;
    await waitFor(() => expect(parte('anel')).toHaveAttribute('data-abracando'));
  },
};

/** Os segmentos de um controle segmentado também são abraçados. */
export const AbracaUmSegmento: Historia = {
  play: async ({ canvasElement }) => {
    const segmento = within(canvasElement).getByText('À esquerda');
    await moverPara(segmento);
    await expect(parte('anel')).toHaveAttribute('data-abracando');
  },
};
