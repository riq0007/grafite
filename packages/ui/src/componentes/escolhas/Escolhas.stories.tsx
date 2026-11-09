import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Checkbox, GrupoDeCheckboxes } from './Checkbox.tsx';
import { ControleSegmentado, Segmento } from './ControleSegmentado.tsx';
import { Interruptor } from './Interruptor.tsx';
import { GrupoDeRadios, Radio } from './Radio.tsx';

const meta: Meta = { title: 'Componentes/Escolhas' };
export default meta;

type Historia = StoryObj;

const coluna = { display: 'grid', gap: 'var(--esp-4)', justifyItems: 'start' } as const;

/** Estados estáticos; hover, pressionado e foco aparecem na interação. */
export const Estados: Historia = {
  render: () => (
    <div style={coluna}>
      <div style={{ display: 'flex', gap: 'var(--esp-4)' }}>
        <Checkbox>Desmarcado</Checkbox>
        <Checkbox defaultSelected>Marcado</Checkbox>
        <Checkbox isIndeterminate>Misto</Checkbox>
        <Checkbox isDisabled>Desabilitado</Checkbox>
      </div>
      <GrupoDeRadios rotulo="Criticidade" obrigatorio defaultValue="media">
        <Radio value="baixa">Baixa</Radio>
        <Radio value="media">Média</Radio>
        <Radio value="alta">Alta</Radio>
      </GrupoDeRadios>
      <GrupoDeCheckboxes
        rotulo="Avisos na tela"
        defaultValue={['critico', 'atencao']}
        descricao="O Crítico sempre aparece."
      >
        <Checkbox value="critico" isDisabled>
          Crítico
        </Checkbox>
        <Checkbox value="atencao">Atenção</Checkbox>
        <Checkbox value="info">Informação</Checkbox>
      </GrupoDeCheckboxes>
      <div style={{ display: 'flex', gap: 'var(--esp-4)' }}>
        <Interruptor>Avisos por e-mail</Interruptor>
        <Interruptor defaultSelected>Avisos na tela</Interruptor>
        <Interruptor isDisabled>Avisos por SMS</Interruptor>
      </div>
      <ControleSegmentado rotulo="Visualização" defaultValue="lista">
        <Segmento value="lista">Lista</Segmento>
        <Segmento value="grade">Grade</Segmento>
        <Segmento value="mapa">Mapa</Segmento>
      </ControleSegmentado>
    </div>
  ),
};

/** O texto em mais de uma linha: a caixa e a bolinha acompanham a primeira linha. */
export const TextoEmMaisDeUmaLinha: Historia = {
  render: () => (
    <div style={{ ...coluna, maxWidth: 'calc(var(--esp-12) * 6)' }}>
      <Checkbox>
        Criar contas, redefinir a senha e os dois passos, desbloquear, inativar, reativar e encerrar
        sessões
      </Checkbox>
      <GrupoDeRadios rotulo="Escopo" defaultValue="local">
        <Radio value="organizacao">Na organização inteira</Radio>
        <Radio value="local">
          Num local e no que estiver dentro dele, como um prédio e as salas
        </Radio>
      </GrupoDeRadios>
    </div>
  ),
};

/** Espaço marca e desmarca; o foco pelo teclado mostra o anel na caixa. */
export const CheckboxPeloTeclado: Historia = {
  render: () => <Checkbox>Ativo em garantia</Checkbox>,
  play: async ({ canvasElement }) => {
    const caixa = within(canvasElement).getByRole('checkbox', { name: 'Ativo em garantia' });
    await userEvent.tab();
    await expect(caixa).toHaveFocus();
    const desenho = canvasElement.querySelector('[data-parte="caixa"]');
    await expect(desenho).not.toBeNull();
    await expect(getComputedStyle(desenho as Element).outlineStyle).toBe('solid');
    await userEvent.keyboard(' ');
    await expect(caixa).toBeChecked();
    await userEvent.keyboard(' ');
    await expect(caixa).not.toBeChecked();
  },
};

/**
 * No grupo de checkboxes, cada opção é uma parada de Tab, e a desabilitada fica de fora; o nome e
 * a descrição do grupo chegam ao leitor de tela.
 */
export const GrupoDeCheckboxesPeloTeclado: Historia = {
  render: () => (
    <GrupoDeCheckboxes
      rotulo="Avisos na tela"
      defaultValue={['critico']}
      descricao="O Crítico sempre aparece."
    >
      <Checkbox value="critico" isDisabled>
        Crítico
      </Checkbox>
      <Checkbox value="atencao">Atenção</Checkbox>
      <Checkbox value="info">Informação</Checkbox>
    </GrupoDeCheckboxes>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const grupo = tela.getByRole('group', { name: 'Avisos na tela' });
    await expect(grupo).toHaveAccessibleDescription('O Crítico sempre aparece.');
    await expect(tela.getByRole('checkbox', { name: 'Crítico' })).toBeChecked();
    await expect(tela.getByRole('checkbox', { name: 'Crítico' })).toBeDisabled();
    await userEvent.tab();
    await expect(tela.getByRole('checkbox', { name: 'Atenção' })).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(tela.getByRole('checkbox', { name: 'Atenção' })).toBeChecked();
    await userEvent.tab();
    await expect(tela.getByRole('checkbox', { name: 'Informação' })).toHaveFocus();
  },
};

/** As setas movem a escolha dentro do grupo, que é uma só parada de Tab. */
export const RadiosPeloTeclado: Historia = {
  render: () => (
    <GrupoDeRadios rotulo="Criticidade" defaultValue="baixa">
      <Radio value="baixa">Baixa</Radio>
      <Radio value="media">Média</Radio>
      <Radio value="alta">Alta</Radio>
    </GrupoDeRadios>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await expect(tela.getByRole('radio', { name: 'Baixa' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(tela.getByRole('radio', { name: 'Média' })).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');
    await expect(tela.getByRole('radio', { name: 'Alta' })).toBeChecked();
    await userEvent.keyboard('{ArrowUp}');
    await expect(tela.getByRole('radio', { name: 'Média' })).toBeChecked();
  },
};

/** Espaço liga e desliga o interruptor. */
/** A explicação fica embaixo do nome e é anunciada com o interruptor. */
export const InterruptorComDescricao: Historia = {
  render: () => (
    <Interruptor descricao="Ao parar o mouse 1,5 s sobre uma linha, mostra as colunas que estão fora da tela.">
      Resumo da linha
    </Interruptor>
  ),
  play: async ({ canvasElement }) => {
    const interruptor = within(canvasElement).getByRole('switch', { name: 'Resumo da linha' });
    await expect(interruptor).toHaveAccessibleDescription(
      'Ao parar o mouse 1,5 s sobre uma linha, mostra as colunas que estão fora da tela.',
    );
  },
};

export const InterruptorPeloTeclado: Historia = {
  render: () => <Interruptor>Avisos por e-mail</Interruptor>,
  play: async ({ canvasElement }) => {
    const chave = within(canvasElement).getByRole('switch', { name: 'Avisos por e-mail' });
    await userEvent.tab();
    await expect(chave).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(chave).toBeChecked();
    await userEvent.keyboard(' ');
    await expect(chave).not.toBeChecked();
  },
};

/** No controle segmentado, as setas trocam o segmento escolhido. */
export const SegmentadoPeloTeclado: Historia = {
  render: () => (
    <ControleSegmentado rotulo="Visualização" defaultValue="lista">
      <Segmento value="lista">Lista</Segmento>
      <Segmento value="grade">Grade</Segmento>
      <Segmento value="mapa">Mapa</Segmento>
    </ControleSegmentado>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await expect(tela.getByRole('radio', { name: 'Lista' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(tela.getByRole('radio', { name: 'Grade' })).toBeChecked();
    await userEvent.keyboard('{ArrowRight}');
    await expect(tela.getByRole('radio', { name: 'Mapa' })).toBeChecked();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(tela.getByRole('radio', { name: 'Grade' })).toBeChecked();
  },
};
