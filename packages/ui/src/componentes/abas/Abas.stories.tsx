import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Abas } from './Abas.tsx';

const meta: Meta = { title: 'Componentes/Abas' };
export default meta;

type Historia = StoryObj;

const texto = { margin: 0, color: 'var(--cor-texto)' } as const;

function SecoesDaFicha() {
  return (
    <Abas
      rotulo="Seções da ficha"
      abas={[
        {
          id: 'resumo',
          rotulo: 'Resumo',
          conteudo: <p style={texto}>Impressora em uso no Almoxarifado.</p>,
        },
        {
          id: 'historico',
          rotulo: 'Histórico',
          conteudo: <p style={texto}>Movido da Sede em março.</p>,
        },
        {
          id: 'arquivos',
          rotulo: 'Arquivos',
          conteudo: <p style={texto}>Nota fiscal e manual.</p>,
        },
      ]}
    />
  );
}

const SECOES_DOS_AJUSTES = [
  'Aparência',
  'Dock',
  'Cursor',
  'Notificações',
  'Tabelas',
  'Idioma e região',
  'Acessibilidade',
];

/**
 * Abas que não cabem na largura, como as sete seções dos padrões no celular: a faixa rola de lado,
 * cada aba numa linha só, e a tela não fica mais larga. A aba escolhida pelo teclado aparece.
 */
export const MuitasAbasNumaFaixaEstreita: Historia = {
  render: () => (
    <div data-faixa-estreita style={{ width: 300 }}>
      <Abas
        rotulo="Seções dos padrões"
        abas={SECOES_DOS_AJUSTES.map((nome) => ({
          id: nome,
          rotulo: nome,
          conteudo: <p style={texto}>A seção {nome}.</p>,
        }))}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixa = canvasElement.querySelector('[data-faixa-estreita]') as HTMLElement;
    const lista = tela.getByRole('tablist', { name: 'Seções dos padrões' });
    await expect(caixa.scrollWidth).toBeLessThanOrEqual(caixa.clientWidth);
    await expect(lista.scrollWidth).toBeGreaterThan(lista.clientWidth);
    const alturas = tela.getAllByRole('tab').map((aba) => aba.getBoundingClientRect().height);
    await expect(new Set(alturas).size).toBe(1);

    await userEvent.tab();
    await userEvent.keyboard('{End}');
    const ultima = tela.getByRole('tab', { name: 'Acessibilidade' });
    await expect(ultima).toHaveAttribute('aria-selected', 'true');
    await waitFor(() =>
      expect(ultima.getBoundingClientRect().right).toBeLessThanOrEqual(
        lista.getBoundingClientRect().right + 1,
      ),
    );
  },
};

/** As setas trocam a aba, e o painel acompanha. */
export const PeloTeclado: Historia = {
  render: () => <SecoesDaFicha />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('tablist', { name: 'Seções da ficha' })).toBeVisible();
    await userEvent.tab();
    await expect(tela.getByRole('tab', { name: 'Resumo' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(tela.getByRole('tab', { name: 'Histórico' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(tela.getByRole('tabpanel')).toHaveTextContent('Movido da Sede em março.');
  },
};

/**
 * A aba mantida, como a Dados da ficha do ativo, continua montada quando outra é escolhida: fica
 * escondida e guarda o que foi digitado. A outra sai, como sempre.
 */
export const AbaMantidaMontada: Historia = {
  render: () => (
    <Abas
      rotulo="Seções da ficha"
      manterMontadas={['dados']}
      abas={[
        {
          id: 'dados',
          rotulo: 'Dados',
          conteudo: (
            <label style={texto}>
              Hostname <input />
            </label>
          ),
        },
        {
          id: 'historico',
          rotulo: 'Histórico',
          conteudo: <p style={texto}>Movido da Sede em março.</p>,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.type(tela.getByRole('textbox', { name: 'Hostname' }), 'IMP-01');

    await userEvent.click(tela.getByRole('tab', { name: 'Histórico' }));
    await expect(tela.getByRole('tabpanel')).toHaveTextContent('Movido da Sede em março.');
    const campo = canvasElement.querySelector('input') as HTMLInputElement;
    await expect(campo).not.toBeVisible();
    await expect(tela.queryByRole('textbox', { name: 'Hostname' })).toBeNull();

    await userEvent.click(tela.getByRole('tab', { name: 'Dados' }));
    await expect(tela.getByRole('textbox', { name: 'Hostname' })).toHaveValue('IMP-01');
    await expect(tela.queryByText('Movido da Sede em março.')).toBeNull();
  },
};
