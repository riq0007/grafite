import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { RolagemDaJanela } from './RolagemDaJanela.tsx';

interface PropsDoExemplo {
  /** Quantos campos a área tem: com muitos, ela rola. */
  campos: number;
  /** Linhas de texto no lugar dos campos, sem nada que o Tab alcance. */
  soTexto?: boolean;
}

/** A área numa caixa de altura fixa, como a janela da casca, com campos um embaixo do outro. */
function AreaComCampos({ campos, soTexto }: PropsDoExemplo) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 320 }}>
      <RolagemDaJanela>
        <div style={{ display: 'grid', gap: 'var(--esp-4)' }}>
          {Array.from({ length: campos }, (_, indice) =>
            soTexto ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: as linhas do exemplo são fixas.
              <p key={indice} style={{ margin: 0, color: 'var(--cor-texto)' }}>
                Linha {indice + 1} do texto de exemplo.
              </p>
            ) : (
              <label
                // biome-ignore lint/suspicious/noArrayIndexKey: os campos do exemplo são fixos.
                key={indice}
                style={{ display: 'grid', gap: 'var(--esp-1)', color: 'var(--cor-texto)' }}
              >
                Campo {indice + 1}
                <input />
              </label>
            ),
          )}
        </div>
      </RolagemDaJanela>
    </div>
  );
}

const meta: Meta<PropsDoExemplo> = {
  title: 'Casca/Rolagem da janela',
  component: AreaComCampos,
  args: { campos: 16 },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<PropsDoExemplo>;

const areaDe = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[data-rolagem-da-janela]') as HTMLElement;

const mascara = (area: HTMLElement) => getComputedStyle(area).maskImage;

/** As faixas esmaecidas da área, em px, pelas variáveis dela. */
function faixas(area: HTMLElement) {
  const estilo = getComputedStyle(area);
  return {
    cima: Number.parseFloat(estilo.getPropertyValue('--faixa-de-cima-da-janela')),
    baixo: Number.parseFloat(estilo.getPropertyValue('--faixa-de-baixo-da-janela')),
  };
}

/** Sem rolar, o conteúdo esmaece só embaixo, onde ainda há mais. */
export const EsmaecidaEmbaixo: Historia = {};

/**
 * Rolando, a faixa de cima aparece; no fim, só ela fica. A barra de rolagem fica fora da máscara,
 * com a largura dela medida na variável.
 */
export const BordasPelaRolagem: Historia = {
  play: async ({ canvasElement }) => {
    const area = areaDe(canvasElement);
    await waitFor(() => expect(area).toHaveAttribute('data-mais-abaixo'));
    await expect(area).not.toHaveAttribute('data-mais-acima');
    await expect(mascara(area)).not.toBe('none');
    // Os campos já levam o Tab até o conteúdo: a área não é mais uma parada.
    await expect(area.tabIndex).toBe(-1);
    await expect(area.style.getPropertyValue('--largura-da-barra')).toBe(
      `${area.offsetWidth - area.clientWidth}px`,
    );

    area.scrollTop = (area.scrollHeight - area.clientHeight) / 2;
    await waitFor(() => expect(area).toHaveAttribute('data-mais-acima'));
    await expect(area).toHaveAttribute('data-mais-abaixo');

    area.scrollTop = area.scrollHeight;
    await waitFor(() => expect(area).not.toHaveAttribute('data-mais-abaixo'));
    await expect(area).toHaveAttribute('data-mais-acima');
    await expect(mascara(area)).not.toBe('none');
  },
};

/** Só com texto, a área que rola entra na ordem do Tab, para o teclado alcançar o conteúdo. */
export const SoTextoNaOrdemDoTab: Historia = {
  args: { campos: 40, soTexto: true },
  play: async ({ canvasElement }) => {
    const area = areaDe(canvasElement);
    await expect(area.scrollHeight).toBeGreaterThan(area.clientHeight);
    await waitFor(() => expect(area.tabIndex).toBe(0));
    await userEvent.tab();
    await expect(area).toHaveFocus();
  },
};

/** O conteúdo que cabe inteiro não rola nem esmaece. */
export const ConteudoQueCabe: Historia = {
  args: { campos: 2 },
  play: async ({ canvasElement }) => {
    const area = areaDe(canvasElement);
    await expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight);
    await expect(area).not.toHaveAttribute('data-mais-acima');
    await expect(area).not.toHaveAttribute('data-mais-abaixo');
    await expect(mascara(area)).toBe('none');
  },
};

/** O Tab que chega a um campo da faixa de baixo rola a área até o campo sair inteiro dela. */
export const FocoForaDaFaixa: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const area = areaDe(canvasElement);
    const caixa = area.getBoundingClientRect();
    const { baixo } = faixas(area);
    await expect(baixo).toBeGreaterThan(0);
    const fimUtil = caixa.top + area.clientTop + area.clientHeight - baixo;

    // O primeiro campo que entra na faixa de baixo, e o anterior, inteiro à vista.
    const campos = tela.getAllByRole('textbox');
    const naFaixa = campos.findIndex((campo) => campo.getBoundingClientRect().bottom > fimUtil);
    await expect(naFaixa).toBeGreaterThan(0);
    const anterior = campos[naFaixa - 1] as HTMLElement;
    const alvo = campos[naFaixa] as HTMLElement;

    anterior.focus();
    await userEvent.tab();
    await expect(alvo).toHaveFocus();
    await waitFor(() =>
      expect(alvo.getBoundingClientRect().bottom).toBeLessThanOrEqual(fimUtil + 1),
    );
    await expect(area.scrollTop).toBeGreaterThan(0);
  },
};
