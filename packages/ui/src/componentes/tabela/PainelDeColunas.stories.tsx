import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { type ColunaDoPainel, PainelDeColunas } from './PainelDeColunas.tsx';

const meta: Meta = { title: 'Componentes/Painel de colunas' };
export default meta;

type Historia = StoryObj<{ aoMudar?: (aVista: string[]) => void }>;

/** As colunas da tabela dos ativos, nos grupos do painel. */
const COLUNAS: ColunaDoPainel[] = [
  { chave: 'ativo.rotulo', rotulo: 'Ativo', grupo: 'Identificação', principal: true },
  { chave: 'patrimonio', rotulo: 'Patrimônio', grupo: 'Identificação' },
  { chave: 'serie', rotulo: 'Série', grupo: 'Identificação' },
  { chave: 'hostname', rotulo: 'Hostname', grupo: 'Identificação' },
  { chave: 'ativo.tipo', rotulo: 'Tipo', grupo: 'Identificação' },
  { chave: 'local', rotulo: 'Local', grupo: 'Localização' },
  { chave: 'responsavel', rotulo: 'Responsável', grupo: 'Localização' },
  { chave: 'ip', rotulo: 'IP', grupo: 'Rede' },
  { chave: 'mac', rotulo: 'MAC', grupo: 'Rede' },
  { chave: 'processador', rotulo: 'Processador', grupo: 'Inventário de hardware' },
  { chave: 'memoria', rotulo: 'Memória', grupo: 'Inventário de hardware' },
  { chave: 'ativo.situacao', rotulo: 'Situação', grupo: 'Registro' },
  { chave: 'ativo.criado-em', rotulo: 'Cadastrado em', grupo: 'Registro' },
];

const A_VISTA = ['ativo.rotulo', 'patrimonio', 'hostname', 'local', 'ativo.situacao'];

function Painel({ aoMudar }: { aoMudar?: (aVista: string[]) => void }) {
  const [aVista, definirAVista] = useState(A_VISTA);
  return (
    <div style={{ maxWidth: '640px' }}>
      <PainelDeColunas
        colunas={COLUNAS}
        aVista={aVista}
        aoMudar={(novas) => {
          definirAVista(novas);
          aoMudar?.(novas);
        }}
      />
    </div>
  );
}

/** As colunas à vista, pela chave, com a principal no alto. */
const colunasAVista = (canvas: HTMLElement) => {
  const principal = canvas.querySelector<HTMLElement>('[data-principal]');
  const lista = within(canvas).getByRole('grid', { name: 'Colunas à vista' });
  return [
    principal?.dataset.coluna,
    ...within(lista)
      .getAllByRole('row')
      .map((linha) => linha.dataset.key),
  ];
};

/** As marcas das colunas disponíveis, pelo nome. */
const marca = (canvas: HTMLElement, nome: string) =>
  within(canvas).getByRole('checkbox', { name: new RegExp(`^${nome}`) });

/** As colunas disponíveis à vista na busca, pelo nome. */
const disponiveis = (canvas: HTMLElement) =>
  within(canvas)
    .getAllByRole('checkbox')
    .map((caixa) => caixa.closest('label')?.textContent);

/** As colunas disponíveis nos grupos e as à vista na ordem da tabela, com a principal fixa. */
export const Padrao: Historia = {
  render: () => <Painel />,
};

/** A coluna principal fica marcada e em primeiro lugar, sem como escondê-la nem movê-la. */
export const ColunaPrincipal: Historia = {
  render: () => <Painel />,
  play: async ({ canvasElement }) => {
    const principal = marca(canvasElement, 'Ativo');
    await expect(principal).toBeChecked();
    await expect(principal).toBeDisabled();
    await expect(colunasAVista(canvasElement)[0]).toBe('ativo.rotulo');
    await expect(within(canvasElement).queryByRole('button', { name: /Mover Ativo/ })).toBeNull();
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Arrastar Ativo' }),
    ).toBeNull();
    await expect(
      within(canvasElement).getByRole('button', { name: 'Mover Patrimônio para cima' }),
    ).toBeDisabled();
  },
};

/** A busca acha a coluna pelo rótulo sem diferenciar acento e maiúsculas, e diz quando não acha. */
export const Busca: Historia = {
  render: () => <Painel />,
  play: async ({ canvasElement }) => {
    const campo = within(canvasElement).getByRole('searchbox', { name: 'Buscar colunas' });
    await userEvent.type(campo, 'memoria');
    await expect(disponiveis(canvasElement)).toEqual(['Memória']);
    await expect(within(canvasElement).getByText('Inventário de hardware')).toBeVisible();
    await expect(within(canvasElement).queryByText('Localização')).toBeNull();
    await userEvent.clear(campo);
    await userEvent.type(campo, 'HOST');
    await expect(disponiveis(canvasElement)).toEqual(['Hostname']);
    await userEvent.clear(campo);
    await userEvent.type(campo, 'xyz');
    await expect(within(canvasElement).getByText('Nenhuma coluna com “xyz”.')).toBeVisible();
  },
};

/** A coluna marcada entra no fim das colunas à vista. */
export const MostrarColuna: Historia = {
  args: { aoMudar: fn() },
  render: (args) => <Painel aoMudar={args.aoMudar} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.click(marca(canvasElement, 'IP'));
    await expect(args.aoMudar).toHaveBeenLastCalledWith([...A_VISTA, 'ip']);
    await expect(colunasAVista(canvasElement).at(-1)).toBe('ip');
  },
};

/** A coluna desmarcada sai das colunas à vista. */
export const OcultarColuna: Historia = {
  args: { aoMudar: fn() },
  render: (args) => <Painel aoMudar={args.aoMudar} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.click(marca(canvasElement, 'Hostname'));
    await expect(args.aoMudar).toHaveBeenLastCalledWith([
      'ativo.rotulo',
      'patrimonio',
      'local',
      'ativo.situacao',
    ]);
    await expect(marca(canvasElement, 'Hostname')).not.toBeChecked();
  },
};

/**
 * Com o foco em "Hostname", a terceira coluna à vista, "Mover para cima" faz dela a segunda, e o foco
 * fica na linha dela.
 */
export const MoverParaCima: Historia = {
  args: { aoMudar: fn() },
  render: (args) => <Painel aoMudar={args.aoMudar} />,
  play: async ({ args, canvasElement }) => {
    within(canvasElement).getByRole('button', { name: 'Mover Hostname para cima' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.aoMudar).toHaveBeenLastCalledWith([
      'ativo.rotulo',
      'hostname',
      'patrimonio',
      'local',
      'ativo.situacao',
    ]);
    // Na segunda posição, a primeira depois da principal, não sobe mais: o foco passa ao outro botão.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(canvasElement).getByRole('button', { name: 'Mover Hostname para baixo' }),
      ),
    );
  },
};

/** "Mover para baixo" leva a coluna uma posição abaixo, e o foco continua nela. */
export const MoverParaBaixo: Historia = {
  args: { aoMudar: fn() },
  render: (args) => <Painel aoMudar={args.aoMudar} />,
  play: async ({ args, canvasElement }) => {
    within(canvasElement).getByRole('button', { name: 'Mover Patrimônio para baixo' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.aoMudar).toHaveBeenLastCalledWith([
      'ativo.rotulo',
      'hostname',
      'patrimonio',
      'local',
      'ativo.situacao',
    ]);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(canvasElement).getByRole('button', { name: 'Mover Patrimônio para baixo' }),
      ),
    );
  },
};

/**
 * Pelo teclado: da linha, a seta para a direita leva à alça; Enter começa o arraste, as setas
 * escolhem onde a coluna entra, e Enter a solta.
 */
export const ArrastePeloTeclado: Historia = {
  args: { aoMudar: fn() },
  render: (args) => <Painel aoMudar={args.aoMudar} />,
  play: async ({ args, canvasElement }) => {
    within(canvasElement).getByRole('row', { name: 'Situação' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(document.activeElement).toBe(
      within(canvasElement).getByRole('button', { name: 'Arrastar Situação' }),
    );
    await userEvent.keyboard('{Enter}');
    // Começa depois da própria Situação; cada seta sobe um lugar, até entre Patrimônio e Hostname.
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(args.aoMudar).toHaveBeenLastCalledWith([
        'ativo.rotulo',
        'patrimonio',
        'ativo.situacao',
        'hostname',
        'local',
      ]),
    );
  },
};

/**
 * Um DataTransfer de teste: o do navegador, num arraste sintético, não deixa mudar o efeito
 * permitido, e o React Aria recusaria a soltura.
 */
function transferenciaDeTeste() {
  const dados = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    files: [] as File[],
    get types() {
      return [...dados.keys()];
    },
    get items() {
      const lista = [...dados].map(([type, valor]) => ({
        kind: 'string',
        type,
        getAsString: (receber: (texto: string) => void) => receber(valor),
        getAsFile: () => null,
      }));
      return Object.assign(lista, {
        add: (valor: string, tipo: string) => {
          dados.set(tipo, valor);
        },
        clear: () => dados.clear(),
      });
    },
    setData: (tipo: string, valor: string) => {
      dados.set(tipo, valor);
    },
    getData: (tipo: string) => dados.get(tipo) ?? '',
    clearData: () => dados.clear(),
    setDragImage: () => undefined,
  };
}

/** Pelo mouse, a coluna arrastada para cima de outra entra antes dela. */
export const ArrastePeloMouse: Historia = {
  args: { aoMudar: fn() },
  render: (args) => <Painel aoMudar={args.aoMudar} />,
  play: async ({ args, canvasElement }) => {
    const lista = within(canvasElement).getByRole('grid', { name: 'Colunas à vista' });
    const linha = (chave: string) =>
      lista.querySelector<HTMLElement>(`[role="row"][data-key="${chave}"]`) as HTMLElement;
    const transferencia = transferenciaDeTeste();
    const arrastar = (tipo: string, alvo: HTMLElement, y: number) => {
      const evento = new DragEvent(tipo, {
        bubbles: true,
        cancelable: true,
        clientX: alvo.getBoundingClientRect().left + 20,
        clientY: y,
      });
      Object.defineProperty(evento, 'dataTransfer', { value: transferencia });
      alvo.dispatchEvent(evento);
    };
    const origem = linha('local');
    const destino = linha('patrimonio');
    const meio = (elemento: HTMLElement) => {
      const caixa = elemento.getBoundingClientRect();
      return caixa.top + caixa.height / 2;
    };
    const pausa = () => new Promise((resolver) => setTimeout(resolver, 50));
    // Como no navegador: o React Aria marca o arraste em curso antes de o ponteiro chegar ao destino.
    arrastar('dragstart', origem, meio(origem));
    await pausa();
    // A borda de cima do destino: a coluna entra antes dele.
    const acima = destino.getBoundingClientRect().top + 3;
    arrastar('dragenter', destino, acima);
    arrastar('dragover', destino, acima);
    await pausa();
    arrastar('dragover', destino, acima + 1);
    arrastar('drop', destino, acima + 1);
    arrastar('dragend', origem, acima + 1);
    await waitFor(() =>
      expect(args.aoMudar).toHaveBeenLastCalledWith([
        'ativo.rotulo',
        'local',
        'patrimonio',
        'hostname',
        'ativo.situacao',
      ]),
    );
  },
};

/** As colunas com um grupo dos outros tipos, como a tabela filtrada por um tipo as dá. */
const COM_OUTROS_TIPOS: ColunaDoPainel[] = [
  { chave: 'ativo.rotulo', rotulo: 'Ativo', grupo: 'Identificação', principal: true },
  { chave: 'ip', rotulo: 'IP', grupo: 'Rede' },
  { chave: 'processador', rotulo: 'Processador', grupo: 'Outros tipos' },
  { chave: 'memoria', rotulo: 'Memória', grupo: 'Outros tipos' },
];

/** "Outros tipos" abre recolhido, com quantas colunas tem; a marcada nele continua à vista. */
export const OutrosTiposRecolhido: Historia = {
  render: () => (
    <PainelDeColunas
      colunas={COM_OUTROS_TIPOS}
      aVista={['ativo.rotulo', 'memoria']}
      aoMudar={() => {}}
      recolhidos={['Outros tipos']}
    />
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixas = () =>
      tela.getAllByRole('checkbox').map((caixa) => caixa.closest('label')?.textContent ?? '');
    await expect(caixas().some((rotulo) => rotulo.startsWith('Processador'))).toBe(false);
    await userEvent.click(tela.getByRole('button', { name: 'Mostrar Outros tipos (2)' }));
    await expect(caixas().some((rotulo) => rotulo.startsWith('Processador'))).toBe(true);
    await userEvent.click(tela.getByRole('button', { name: 'Esconder Outros tipos' }));
    // A busca acha também no grupo recolhido.
    await userEvent.type(tela.getByRole('searchbox', { name: 'Buscar colunas' }), 'proces');
    await expect(caixas().some((rotulo) => rotulo.startsWith('Processador'))).toBe(true);
  },
};
