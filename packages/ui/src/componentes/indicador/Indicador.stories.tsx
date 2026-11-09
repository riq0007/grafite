import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Botao } from '../botao/Botao.tsx';
import { Indicador } from './Indicador.tsx';

const meta: Meta<typeof Indicador> = {
  title: 'Componentes/Indicador',
  component: Indicador,
};
export default meta;

type Historia = StoryObj<typeof Indicador>;

/** O indicador fica na superfície da janela, como na tela dos indicadores. */
const superficie = {
  maxWidth: 'calc(var(--esp-12) * 12)',
  padding: 'var(--esp-4)',
  borderRadius: 'var(--raio-janela)',
  background: 'var(--cor-superficie)',
} as const;

const DECISAO_DO_TONER =
  'Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.';

export const DentroDaMeta: Historia = {
  render: () => (
    <div style={superficie}>
      <Indicador
        nome="Tempo até reconhecer o Crítico"
        mede="Da abertura ao reconhecimento, nos alertas Críticos do período."
        base="Mediana de 12 alertas Críticos"
        valor="18 min"
        anterior="26 min"
        meta="30 min"
        situacao="dentro"
        decisao="Confira quem pode tratar os alertas e quem recebe o Crítico por e-mail e no celular."
      />
    </div>
  ),
};

/** Cenário da spec: fora da meta, a situação e a decisão ficam em texto, sem depender da cor. */
export const ForaDaMeta: Historia = {
  render: () => (
    <div style={superficie}>
      <Indicador
        nome="Tempo de atendimento do toner"
        mede="Do alerta do toner à troca, nos toners trocados no período."
        base="Mediana de 7 trocas"
        valor="3,2 dias"
        anterior="2,3 dias"
        meta="2 dias"
        situacao="fora"
        decisao={DECISAO_DO_TONER}
        acao={<Botao>Mudar a meta</Botao>}
      >
        <ul style={{ margin: 0, paddingInlineStart: 'var(--esp-4)', color: 'var(--cor-texto)' }}>
          <li>Impressora do RH, Jundiaí: esperando há 3 dias</li>
          <li>Impressora de Campinas, Campinas: 4 dias</li>
        </ul>
      </Indicador>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const secao = tela.getByRole('region', { name: 'Tempo de atendimento do toner' });
    await expect(within(secao).getByText('Fora da meta')).toBeVisible();
    await expect(within(secao).getByText(DECISAO_DO_TONER, { exact: false })).toBeVisible();
  },
};

/** Cenário da spec: sem valor, o motivo fica no lugar do número, e nunca um zero. */
export const SemDado: Historia = {
  render: () => (
    <div style={superficie}>
      <Indicador
        nome="Disponibilidade dos ativos"
        mede="O tempo de cada ativo sem responder, pelos alertas de ativo offline."
        semValor="Nenhuma regra de ativo offline ativa."
        anterior="sem dado"
        meta="99%"
        situacao="sem-dado"
        decisao="Confira a rede e a energia desses ativos, ou se eles ainda estão em uso."
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('Nenhuma regra de ativo offline ativa.')).toBeVisible();
    await expect(tela.getByText('Sem dado')).toBeVisible();
    await expect(canvasElement.querySelector('[data-valor]')).toBeNull();
  },
};
