import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from './Botao.tsx';

const meta: Meta<typeof Botao> = {
  title: 'Componentes/Botão',
  component: Botao,
  args: { children: 'Salvar', nivel: 'primario', onPress: fn() },
  argTypes: {
    nivel: {
      control: 'inline-radio',
      options: ['primario', 'secundario', 'terciario', 'destrutivo'],
    },
  },
};
export default meta;

type Historia = StoryObj<typeof Botao>;

const linha = { display: 'flex', gap: 'var(--esp-2)', alignItems: 'center' } as const;

export const Padrao: Historia = {};

/**
 * Cor computada de um token, para comparar com o estilo aplicado. Mexe no DOM: calcule
 * antes do waitFor, nunca dentro dele (o waitFor reage a mutações e entraria em laço).
 */
function corDoToken(token: string): string {
  const amostra = document.createElement('span');
  amostra.style.backgroundColor = `var(${token})`;
  document.body.append(amostra);
  const cor = getComputedStyle(amostra).backgroundColor;
  amostra.remove();
  return cor;
}

/** Hover e pressionado usam os tokens de estado (o contraste deles é verificado). */
export const HoverEPressionado: Historia = {
  render: () => (
    <div style={linha}>
      <Botao nivel="primario">Salvar</Botao>
      <Botao>Cancelar</Botao>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const salvar = tela.getByRole('button', { name: 'Salvar' });
    const fundo = () => getComputedStyle(salvar).backgroundColor;
    const [padrao, hover, pressionado] = [
      '--cor-destaque',
      '--cor-destaque-hover',
      '--cor-destaque-pressionado',
    ].map(corDoToken);
    await userEvent.hover(salvar);
    await waitFor(() => expect(fundo()).toBe(hover));
    await userEvent.pointer({ keys: '[MouseLeft>]', target: salvar });
    await waitFor(() => expect(fundo()).toBe(pressionado));
    await userEvent.pointer({ keys: '[/MouseLeft]', target: salvar });
    await userEvent.unhover(salvar);
    await waitFor(() => expect(fundo()).toBe(padrao));

    const cancelar = tela.getByRole('button', { name: 'Cancelar' });
    await expect(getComputedStyle(cancelar).backgroundImage).toBe('none');
    await userEvent.hover(cancelar);
    await expect(getComputedStyle(cancelar).backgroundImage).toContain('linear-gradient');
  },
};

/** Os quatro níveis. Nenhum vira cápsula, nem com a base de raio no máximo (24 px). */
export const Niveis: Historia = {
  render: () => (
    <div style={linha}>
      <Botao nivel="primario">Salvar</Botao>
      <Botao>Cancelar</Botao>
      <Botao nivel="terciario">Mais opções</Botao>
      <Botao nivel="destrutivo" icone={Trash2}>
        Excluir
      </Botao>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const raiz = document.documentElement;
    const baseOriginal = raiz.style.getPropertyValue('--raio-base');
    try {
      raiz.style.setProperty('--raio-base', '24px');
      for (const botao of within(canvasElement).getAllByRole('button')) {
        const raio = Number.parseFloat(getComputedStyle(botao).borderTopLeftRadius);
        await expect(raio).toBeLessThan(botao.getBoundingClientRect().height / 2);
      }
    } finally {
      raiz.style.setProperty('--raio-base', baseOriginal);
    }
  },
};

/** Cenário da spec: "Salvar" e "Excluir" juntos têm aparências diferentes. */
export const SalvarEExcluir: Historia = {
  render: () => (
    <div style={linha}>
      <Botao nivel="primario">Salvar</Botao>
      <Botao nivel="destrutivo">Excluir</Botao>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const salvar = getComputedStyle(tela.getByRole('button', { name: 'Salvar' }));
    const excluir = getComputedStyle(tela.getByRole('button', { name: 'Excluir' }));
    await expect(excluir.backgroundColor).not.toBe(salvar.backgroundColor);
    await expect(excluir.color).not.toBe(salvar.color);
    const critico = getComputedStyle(document.documentElement).getPropertyValue('--cor-critico');
    const amostra = document.createElement('span');
    amostra.style.color = critico;
    canvasElement.append(amostra);
    await expect(excluir.color).toBe(getComputedStyle(amostra).color);
    amostra.remove();
  },
};

/** Estados estáticos de cada nível; hover, pressionado e foco aparecem na interação. */
export const Estados: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-3)' }}>
      {(['primario', 'secundario', 'terciario', 'destrutivo'] as const).map((nivel) => (
        <div key={nivel} style={linha}>
          <Botao nivel={nivel}>Padrão</Botao>
          <Botao nivel={nivel} icone={Download}>
            Com ícone
          </Botao>
          <Botao nivel={nivel} isDisabled>
            Desabilitado
          </Botao>
          <Botao nivel={nivel} carregando>
            Carregando
          </Botao>
        </div>
      ))}
    </div>
  ),
};

function SalvarComEspera() {
  const [carregando, setCarregando] = useState(false);
  return (
    <Botao nivel="primario" carregando={carregando} onPress={() => setCarregando(true)}>
      Salvar alterações
    </Botao>
  );
}

/** Ao carregar, o botão indica o processamento, não aciona de novo e mantém a largura. */
export const CarregandoMantemALargura: Historia = {
  render: () => <SalvarComEspera />,
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Salvar alterações' });
    const larguraAntes = botao.getBoundingClientRect().width;
    await userEvent.click(botao);
    await expect(botao).toHaveAttribute('aria-disabled', 'true');
    await expect(botao).toHaveAccessibleName(/Processando/);
    await expect(botao.getBoundingClientRect().width).toBe(larguraAntes);
  },
};

/** O foco pelo teclado mostra o anel do destaque; o clique do mouse não mostra. */
export const FocoVisivel: Historia = {
  render: () => (
    <div style={linha}>
      <Botao nivel="primario">Salvar</Botao>
      <Botao>Cancelar</Botao>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    const salvar = tela.getByRole('button', { name: 'Salvar' });
    await expect(salvar).toHaveFocus();
    await expect(getComputedStyle(salvar).outlineStyle).toBe('solid');
    await expect(getComputedStyle(salvar).outlineWidth).toBe('2px');
    const cancelar = tela.getByRole('button', { name: 'Cancelar' });
    await userEvent.click(cancelar);
    await expect(getComputedStyle(cancelar).outlineStyle).toBe('none');
  },
};
