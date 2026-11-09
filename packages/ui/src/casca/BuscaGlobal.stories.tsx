import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { House, Palette, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from '../componentes/botao/Botao.tsx';
import { CampoDeTexto } from '../componentes/campo/CampoDeTexto.tsx';
import { comTelaPorTras } from '../teste/tela.tsx';
import { BuscaGlobal, type GrupoDaBusca, type PropsDaBuscaGlobal } from './BuscaGlobal.tsx';

/** Resultados de exemplo, na forma que o app entrega à busca. */
const GRUPOS_DE_EXEMPLO: readonly GrupoDaBusca[] = [
  {
    id: 'ir-para',
    nome: 'Ir para',
    resultados: [
      { id: '/', rotulo: 'Início', icone: House },
      { id: '/ajustes', rotulo: 'Ajustes', icone: Settings },
    ],
  },
  {
    id: 'ajustes',
    nome: 'Ajustes',
    resultados: [
      { id: 'dock', rotulo: 'Dock', caminho: 'Ajustes', icone: Settings },
      { id: 'tamanho-do-dock', rotulo: 'Tamanho do dock', caminho: 'Ajustes › Dock' },
      { id: 'tema', rotulo: 'Tema', caminho: 'Ajustes › Aparência', icone: Palette },
    ],
  },
];

const meta: Meta<typeof BuscaGlobal> = {
  title: 'Casca/Busca',
  component: BuscaGlobal,
  args: {
    aberta: true,
    aoMudarAberta: fn(),
    termo: 'dock',
    aoMudarTermo: fn(),
    grupos: GRUPOS_DE_EXEMPLO,
    aoEscolher: fn(),
  },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<typeof BuscaGlobal>;

const corpo = () => within(document.body);

/** A busca aberta, com os resultados em grupos e o caminho de cada um em texto secundário. */
export const Resultados: Historia = {
  play: async () => {
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    await expect(within(dialogo).getByRole('searchbox', { name: 'Buscar' })).toHaveValue('dock');
    const ajustes = within(dialogo).getByRole('group', { name: 'Ajustes' });
    await expect(
      within(ajustes).getByRole('option', { name: 'Tamanho do dock' }),
    ).toHaveAccessibleDescription('Ajustes › Dock');
    await expect(within(dialogo).getByRole('group', { name: 'Ir para' })).toBeInTheDocument();
  },
};

/** A busca aberta sobre a tela, para a captura de referência. */
export const Aberta: Historia = { decorators: [comTelaPorTras] };

/** Sem nenhum resultado, a busca diz o que foi procurado. */
export const NadaEncontrado: Historia = {
  args: { termo: 'xyz', grupos: [] },
  play: async () => {
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    // Espera o fim da animação de abrir, que começa na opacidade zero.
    await waitFor(() =>
      expect(within(dialogo).getByText('Nada encontrado para “xyz”.')).toBeVisible(),
    );
  },
};

/** Mantém a raiz com um atributo só durante a história. */
const comAtributo =
  (nome: string, valor: string): Decorator =>
  (Historia) => {
    document.documentElement.setAttribute(nome, valor);
    return <Historia />;
  };

/** Com a transparência reduzida, a camada da busca fica sólida, sem desfoque. */
export const TransparenciaReduzida: Historia = {
  decorators: [comAtributo('data-transparency', 'reduzida')],
  play: async () => {
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    const painel = dialogo.parentElement as HTMLElement;
    await expect(getComputedStyle(painel).backdropFilter).toBe('none');
    document.documentElement.removeAttribute('data-transparency');
  },
};

/** Como o app usa a busca: fechada no início, e vazia a cada vez que abre. */
function BuscaComGatilho(props: PropsDaBuscaGlobal) {
  const [aberta, definirAberta] = useState(false);
  const [termo, definirTermo] = useState('');
  const mudarAberta = (valor: boolean) => {
    if (valor) definirTermo('');
    definirAberta(valor);
    props.aoMudarAberta(valor);
  };
  return (
    <div style={{ display: 'flex', gap: 'var(--esp-3)', alignItems: 'end' }}>
      <Botao onPress={() => mudarAberta(true)}>Abrir a busca</Botao>
      <CampoDeTexto rotulo="Anotação" />
      <BuscaGlobal
        {...props}
        aberta={aberta}
        aoMudarAberta={mudarAberta}
        termo={termo}
        aoMudarTermo={definirTermo}
      />
    </div>
  );
}

/** Ctrl+K abre a busca mesmo com o foco num campo de texto; com ela aberta, o atalho a fecha. */
export const AtalhoComFocoNumCampo: Historia = {
  render: (args) => <BuscaComGatilho {...args} />,
  play: async ({ canvasElement }) => {
    const campo = within(canvasElement).getByRole('textbox', { name: 'Anotação' });
    await userEvent.click(campo);
    await userEvent.keyboard('troca de toner');
    await userEvent.keyboard('{Control>}k{/Control}');
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    const busca = within(dialogo).getByRole('searchbox', { name: 'Buscar' });
    await waitFor(() => expect(busca).toHaveFocus());
    await expect(busca).toHaveValue('');
    await expect(campo).toHaveValue('troca de toner');
    await userEvent.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(corpo().queryByRole('dialog', { name: 'Busca' })).toBeNull());
    await waitFor(() => expect(campo).toHaveFocus());
  },
};

/** O resultado escolhido, marcado no campo pelo foco virtual. */
const escolhido = (busca: HTMLElement) => {
  const id = busca.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id)?.querySelector('[slot="label"]')?.textContent : null;
};

/** As setas passam de um grupo ao outro com o foco no campo, e Enter aciona o escolhido. */
export const SetasEntreGrupos: Historia = {
  play: async ({ args }) => {
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    const busca = within(dialogo).getByRole('searchbox', { name: 'Buscar' });
    await waitFor(() => expect(busca).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(escolhido(busca)).toBe('Início'));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(escolhido(busca)).toBe('Dock'));
    await expect(busca).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(escolhido(busca)).toBe('Ajustes'));
    await userEvent.keyboard('{Enter}');
    await expect(args.aoEscolher).toHaveBeenCalledWith('/ajustes');
  },
};

/** O clique também aciona um resultado. */
export const CliqueEscolhe: Historia = {
  play: async ({ args }) => {
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    await userEvent.click(within(dialogo).getByRole('option', { name: 'Tema' }));
    await expect(args.aoEscolher).toHaveBeenCalledWith('tema');
  },
};

/** Esc fecha a busca, mesmo com texto no campo, e o foco volta a quem a abriu. */
export const EscFecha: Historia = {
  render: (args) => <BuscaComGatilho {...args} />,
  play: async ({ canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Abrir a busca' });
    await userEvent.click(botao);
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    await waitFor(() =>
      expect(within(dialogo).getByRole('searchbox', { name: 'Buscar' })).toHaveFocus(),
    );
    await userEvent.keyboard('dock{Escape}');
    await waitFor(() => expect(corpo().queryByRole('dialog', { name: 'Busca' })).toBeNull());
    await waitFor(() => expect(botao).toHaveFocus());
  },
};

/** Um clique fora da busca a fecha. */
export const CliqueForaFecha: Historia = {
  render: (args) => <BuscaComGatilho {...args} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Abrir a busca' }));
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    const fundo = dialogo.parentElement?.parentElement as HTMLElement;
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: fundo,
      coords: { clientX: 4, clientY: 4 },
    });
    await waitFor(() => expect(corpo().queryByRole('dialog', { name: 'Busca' })).toBeNull());
    await expect(args.aoMudarAberta).toHaveBeenLastCalledWith(false);
  },
};

/** A busca abre em 180 ms com leve escala; com movimento reduzido, a escala some e fica a opacidade. */
export const AbrirComMovimentoReduzido: Historia = {
  decorators: [comAtributo('data-motion', 'reduzido')],
  render: (args) => <BuscaComGatilho {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Abrir a busca' }));
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    const painel = dialogo.parentElement as HTMLElement;
    await expect(getComputedStyle(painel).animationDuration).toBe('0.18s, 0s');
    document.documentElement.removeAttribute('data-motion');
    await waitFor(() => expect(painel).not.toHaveAttribute('data-entering'));
  },
};

/** Resultados de um provedor de exemplo, como os ativos que o P1 vai buscar no servidor. */
const ATIVOS_DE_EXEMPLO: GrupoDaBusca = {
  id: 'ativos',
  nome: 'Ativos',
  estado: 'pronto',
  resultados: [
    { id: 'ativo:switch-cpd', rotulo: 'Switch do CPD (exemplo)', caminho: 'Ativos › Rede' },
  ],
};

/** Um provedor que responde depois de 400 ms, ou que falha, como o app entrega à busca. */
function BuscaComProvedor({ falhar, ...props }: PropsDaBuscaGlobal & { falhar?: boolean }) {
  const [ativos, definirAtivos] = useState<GrupoDaBusca>({
    ...ATIVOS_DE_EXEMPLO,
    estado: 'buscando',
    resultados: [],
  });
  useEffect(() => {
    const espera = setTimeout(
      () =>
        definirAtivos(
          falhar ? { ...ATIVOS_DE_EXEMPLO, estado: 'erro', resultados: [] } : ATIVOS_DE_EXEMPLO,
        ),
      400,
    );
    return () => clearTimeout(espera);
  }, [falhar]);
  return <BuscaGlobal {...props} grupos={[...GRUPOS_DE_EXEMPLO, ativos]} />;
}

/**
 * Enquanto o provedor busca, o grupo dele diz "Buscando…" e os resultados locais já podem ser
 * escolhidos. Os do provedor chegam abaixo, sem trocar o resultado escolhido, e são anunciados.
 */
export const ProvedorLento: Historia = {
  render: (args) => <BuscaComProvedor {...args} />,
  play: async ({ args }) => {
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    const busca = within(dialogo).getByRole('searchbox', { name: 'Buscar' });
    const ativos = within(dialogo).getByRole('group', { name: 'Ativos' });
    await expect(within(ativos).getByText('Buscando…')).toBeInTheDocument();
    await waitFor(() => expect(busca).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(escolhido(busca)).toBe('Dock'));
    await within(ativos).findByRole('option', { name: 'Switch do CPD (exemplo)' });
    await expect(within(ativos).queryByText('Buscando…')).toBeNull();
    await expect(escolhido(busca)).toBe('Dock');
    await expect(within(dialogo).getByRole('status')).toHaveTextContent('Ativos: 1 resultado');
    await userEvent.keyboard('{Enter}');
    await expect(args.aoEscolher).toHaveBeenCalledWith('dock');
  },
};

/** Um provedor que falha mostra o erro no grupo dele, e os outros grupos continuam utilizáveis. */
export const ProvedorComFalha: Historia = {
  render: (args) => <BuscaComProvedor {...args} falhar />,
  play: async ({ args }) => {
    const dialogo = await corpo().findByRole('dialog', { name: 'Busca' });
    const ativos = within(dialogo).getByRole('group', { name: 'Ativos' });
    await within(ativos).findByText('Não foi possível buscar em Ativos agora.');
    await expect(within(dialogo).getByRole('status')).toHaveTextContent(
      'Não foi possível buscar em Ativos agora.',
    );
    await waitFor(() =>
      expect(within(dialogo).getByRole('searchbox', { name: 'Buscar' })).toHaveFocus(),
    );
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.aoEscolher).toHaveBeenCalledWith('/');
  },
};
