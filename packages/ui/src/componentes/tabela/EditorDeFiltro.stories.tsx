import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Selecao } from '../selecao/Selecao.tsx';
import { EditorDeFiltro, type PropsDoEditorDeFiltro } from './EditorDeFiltro.tsx';
import type { FiltroDoEditor } from './filtro.ts';

const meta: Meta = {
  title: 'Componentes/Editor de filtro',
  decorators: [
    (Historia) => (
      <div style={{ maxWidth: '360px' }}>
        <Historia />
      </div>
    ),
  ],
};
export default meta;

interface Espioes {
  aoAplicar?: (filtro: FiltroDoEditor) => void;
  aoTirar?: () => void;
}

type Historia = StoryObj<Espioes>;

const TIPOS = [
  { id: 'impressora', rotulo: 'Impressora' },
  { id: 'switch', rotulo: 'Switch' },
  { id: 'computador', rotulo: 'Computador' },
];

const LOCAIS = [
  { id: 'jundiai', rotulo: 'Jundiaí' },
  { id: 'campinas', rotulo: 'Campinas' },
];

/** O seletor do local que a tela dá ao editor, como a árvore dos locais na aplicação. */
const seletorDeLocal: PropsDoEditorDeFiltro['seletorDeLocal'] = ({ valor, aoMudar, erro }) => (
  <Selecao
    rotulo="Local"
    opcoes={LOCAIS}
    selectedKey={valor}
    onSelectionChange={(chave) => aoMudar(chave === null ? null : String(chave))}
    erro={erro}
  />
);

const tela = (canvas: HTMLElement) => within(canvas);

const aplicar = (canvas: HTMLElement) =>
  userEvent.click(tela(canvas).getByRole('button', { name: 'Aplicar filtro' }));

/** O filtro de texto que já existe, com "Tirar filtro". */
export const Texto: Historia = {
  render: () => (
    <EditorDeFiltro
      coluna="Hostname"
      tipo="texto"
      podeFicarVazia
      filtro={{ operador: 'contem', texto: 'almox' }}
      aoAplicar={() => {}}
      aoTirar={() => {}}
    />
  ),
};

/** O texto digitado, com Enter, vira o filtro "Contém"; o filtro novo não tem "Tirar filtro". */
export const AplicarTexto: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Hostname"
      tipo="texto"
      podeFicarVazia
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await expect(tela(canvasElement).getByRole('radio', { name: 'Contém' })).toBeChecked();
    await expect(tela(canvasElement).queryByRole('button', { name: 'Tirar filtro' })).toBeNull();
    await userEvent.type(
      tela(canvasElement).getByRole('textbox', { name: 'Texto' }),
      'almox{Enter}',
    );
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({ operador: 'contem', texto: 'almox' });
  },
};

/** Sem o texto, o editor recusa no campo e não aplica. */
export const TextoVazio: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Hostname"
      tipo="texto"
      podeFicarVazia
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await aplicar(canvasElement);
    await expect(tela(canvasElement).getByText('Digite o texto do filtro.')).toBeVisible();
    await expect(
      tela(canvasElement).getByRole('textbox', { name: 'Texto' }),
    ).toHaveAccessibleDescription(/Digite o texto do filtro/);
    await expect(args.aoAplicar).not.toHaveBeenCalled();
  },
};

/** "Garantia até" só com "Até" 31/12/2026: o intervalo sem o início. */
export const IntervaloDeDatas: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Garantia até"
      tipo="data"
      podeFicarVazia
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(tela(canvasElement).getByRole('spinbutton', { name: /^dia, Até/ }));
    await userEvent.keyboard('31122026');
    await aplicar(canvasElement);
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({ operador: 'entre', ate: '2026-12-31' });
  },
};

/** 31/02/2026 em "De": o campo recusa a data, e o filtro não é aplicado, mesmo com o "Até". */
export const DataInexistente: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Garantia até"
      tipo="data"
      podeFicarVazia
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(tela(canvasElement).getByRole('spinbutton', { name: /^dia, Até/ }));
    await userEvent.keyboard('31122026');
    await userEvent.click(tela(canvasElement).getByRole('spinbutton', { name: /^dia, De/ }));
    await userEvent.keyboard('31022026');
    await aplicar(canvasElement);
    await expect(tela(canvasElement).getByText('A data 31/02/2026 não existe.')).toBeVisible();
    await expect(args.aoAplicar).not.toHaveBeenCalled();
  },
};

/** O intervalo de uma coluna com unidade, como o nível dos suprimentos: os limites dizem o "%". */
export const NumerosComUnidade: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Suprimentos"
      tipo="numero"
      unidade="%"
      podeFicarVazia
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await userEvent.type(tela(canvasElement).getByRole('textbox', { name: 'De (%)' }), '0');
    await userEvent.type(tela(canvasElement).getByRole('textbox', { name: 'Até (%)' }), '20');
    await aplicar(canvasElement);
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({ operador: 'entre', de: 0, ate: 20 });
  },
};

/** Os números como o pt-BR escreve, e a recusa do início depois do fim. */
export const Numeros: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Valor de compra"
      tipo="numero"
      podeFicarVazia
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const de = tela(canvasElement).getByRole('textbox', { name: 'De' });
    const ate = tela(canvasElement).getByRole('textbox', { name: 'Até' });
    await userEvent.type(de, '10');
    await userEvent.type(ate, '5');
    await aplicar(canvasElement);
    await expect(tela(canvasElement).getByText('O início vem depois do fim.')).toBeVisible();
    await expect(args.aoAplicar).not.toHaveBeenCalled();
    await userEvent.clear(de);
    await userEvent.type(de, '1.000,00');
    await userEvent.clear(ate);
    await userEvent.type(ate, '5.000');
    await aplicar(canvasElement);
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({
      operador: 'entre',
      de: 1000,
      ate: 5000,
    });
  },
};

/** "É qualquer de" uma ou mais opções, e a recusa sem nenhuma. */
export const EscolhaDeOpcoes: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Tipo"
      tipo="escolha"
      podeFicarVazia={false}
      opcoes={TIPOS}
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await aplicar(canvasElement);
    await expect(tela(canvasElement).getByText('Escolha pelo menos uma opção.')).toBeVisible();
    await userEvent.click(tela(canvasElement).getByRole('checkbox', { name: 'Impressora' }));
    await userEvent.click(tela(canvasElement).getByRole('checkbox', { name: 'Switch' }));
    await aplicar(canvasElement);
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({
      operador: 'qualquer',
      valores: ['impressora', 'switch'],
    });
  },
};

/** "Em" um local, pelo seletor que a tela dá ao editor. */
export const Local: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Local"
      tipo="local"
      podeFicarVazia={false}
      seletorDeLocal={seletorDeLocal}
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await aplicar(canvasElement);
    await expect(tela(canvasElement).getByText('Escolha um local.')).toBeVisible();
    await userEvent.click(tela(canvasElement).getByRole('button', { name: /Local/ }));
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Jundiaí' }));
    await aplicar(canvasElement);
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({ operador: 'em', local: 'jundiai' });
  },
};

/** "Está vazio" não pede valor. */
export const EstaVazio: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Responsável"
      tipo="escolha"
      podeFicarVazia
      opcoes={TIPOS}
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(tela(canvasElement).getByRole('radio', { name: 'Está vazio' }));
    await expect(tela(canvasElement).queryByRole('checkbox')).toBeNull();
    await aplicar(canvasElement);
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({ operador: 'vazio' });
  },
};

/** A coluna que só aceita vazio e preenchido, como a de um ativo ligado. */
export const SoVazioEPreenchido: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Ativo ligado"
      tipo={null}
      podeFicarVazia
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await expect(
      tela(canvasElement)
        .getAllByRole('radio')
        .map((opcao) => opcao.closest('label')?.textContent),
    ).toEqual(['Está vazio', 'Está preenchido']);
    await userEvent.click(tela(canvasElement).getByRole('radio', { name: 'Está preenchido' }));
    await aplicar(canvasElement);
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({ operador: 'preenchido' });
  },
};

/** A situação: uma escolha só, sem a condição. */
export const Situacao: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Situação"
      tipo="situacao"
      podeFicarVazia={false}
      opcoes={[
        { id: 'ativos', rotulo: 'Ativos' },
        { id: 'em-uso', rotulo: 'Em uso' },
        { id: 'inativos', rotulo: 'Inativos' },
      ]}
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await expect(tela(canvasElement).queryByRole('radiogroup', { name: 'Condição' })).toBeNull();
    await userEvent.click(tela(canvasElement).getByRole('radio', { name: 'Inativos' }));
    await aplicar(canvasElement);
    await expect(args.aoAplicar).toHaveBeenLastCalledWith({
      operador: 'situacao',
      situacao: 'inativos',
    });
  },
};

/** No filtro que já existe, "Tirar filtro" o remove. */
export const TirarFiltro: Historia = {
  args: { aoAplicar: fn(), aoTirar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Hostname"
      tipo="texto"
      podeFicarVazia
      filtro={{ operador: 'contem', texto: 'almox' }}
      aoAplicar={args.aoAplicar ?? (() => {})}
      aoTirar={args.aoTirar}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await expect(tela(canvasElement).getByRole('textbox', { name: 'Texto' })).toHaveValue('almox');
    await userEvent.click(tela(canvasElement).getByRole('button', { name: 'Tirar filtro' }));
    await expect(args.aoTirar).toHaveBeenCalledOnce();
    await expect(args.aoAplicar).not.toHaveBeenCalled();
  },
};

/** As opções com quantos registros cada uma traz: as com zero no fim, com "(0)" em texto. */
const COM_CONTAGENS = [
  { id: 'impressora', rotulo: 'Impressora', quantos: 134 },
  { id: 'computador', rotulo: 'Computador', quantos: 0 },
  { id: 'switch', rotulo: 'Switch', quantos: 1204 },
];

/** O resultado das opções marcadas, como a tela dos ativos o diz. */
const mostrar = (valores: readonly string[]) => {
  const soma = valores.reduce(
    (total, valor) => total + (COM_CONTAGENS.find((opcao) => opcao.id === valor)?.quantos ?? 0),
    0,
  );
  return valores.length === 0 ? null : `Mostrar ${soma.toLocaleString('pt-BR')} ativos`;
};

/** Cada opção diz quantos registros traz, e o botão diz quantos a tabela vai mostrar. */
export const ComContagens: Historia = {
  args: { aoAplicar: fn() },
  render: (args) => (
    <EditorDeFiltro
      coluna="Tipo"
      tipo="escolha"
      podeFicarVazia={false}
      opcoes={COM_CONTAGENS}
      resultadoDaEscolha={mostrar}
      aoAplicar={args.aoAplicar ?? (() => {})}
    />
  ),
  play: async ({ args, canvasElement }) => {
    const caixas = tela(canvasElement).getAllByRole('checkbox');
    await expect(caixas.map((caixa) => caixa.closest('label')?.textContent)).toEqual([
      'Impressora (134)',
      'Switch (1.204)',
      'Computador (0)',
    ]);
    await expect(tela(canvasElement).getByRole('button', { name: 'Aplicar filtro' })).toBeVisible();
    await userEvent.click(tela(canvasElement).getByText('Impressora (134)'));
    await userEvent.click(tela(canvasElement).getByText('Switch (1.204)'));
    const botao = tela(canvasElement).getByRole('button', { name: 'Mostrar 1.338 ativos' });
    await userEvent.click(botao);
    await expect(args.aoAplicar).toHaveBeenCalledWith({
      operador: 'qualquer',
      valores: ['impressora', 'switch'],
    });
  },
};

const MUITAS = Array.from({ length: 25 }, (_, indice) => ({
  id: `opcao-${indice + 1}`,
  rotulo: `Opção ${String(indice + 1).padStart(2, '0')}`,
}));

/** Acima de 20 opções, as 20 primeiras e "Mostrar mais"; a marcada mais abaixo continua à vista. */
export const MuitasOpcoes: Historia = {
  render: () => (
    <EditorDeFiltro
      coluna="Sala"
      tipo="escolha"
      podeFicarVazia={false}
      opcoes={MUITAS}
      filtro={{ operador: 'qualquer', valores: ['opcao-24'] }}
      aoAplicar={() => {}}
    />
  ),
  play: async ({ canvasElement }) => {
    const rotulos = () =>
      tela(canvasElement)
        .getAllByRole('checkbox')
        .map((caixa) => caixa.closest('label')?.textContent);
    await expect(rotulos()).toHaveLength(21);
    await expect(rotulos()).toContain('Opção 24');
    await expect(rotulos()).not.toContain('Opção 25');
    await userEvent.click(tela(canvasElement).getByRole('button', { name: 'Mostrar mais' }));
    await expect(rotulos()).toHaveLength(25);
    await expect(tela(canvasElement).queryByRole('button', { name: 'Mostrar mais' })).toBeNull();
  },
};

/** As contagens à vista, para a captura: as opções com zero no fim, com "(0)". */
export const ContagensAVista: Historia = {
  render: () => (
    <EditorDeFiltro
      coluna="Tipo"
      tipo="escolha"
      podeFicarVazia={false}
      opcoes={COM_CONTAGENS}
      filtro={{ operador: 'qualquer', valores: ['impressora'] }}
      resultadoDaEscolha={mostrar}
      aoAplicar={() => {}}
    />
  ),
};
