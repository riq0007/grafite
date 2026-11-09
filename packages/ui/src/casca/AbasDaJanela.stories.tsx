import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from '../componentes/botao/Botao.tsx';
import { CabecalhoDaPagina } from '../componentes/cabecalho/CabecalhoDaPagina.tsx';
import { type AbaNaJanela, AbasDaJanela } from './AbasDaJanela.tsx';
import { JanelaDeConteudo } from './Casca.tsx';

interface PropsDoExemplo {
  abas: readonly AbaNaJanela[];
  frente: string;
  /** Uma aba que o botão "Abrir <título>", fora da janela, abre na frente, como um campo faria. */
  aAbrir?: AbaNaJanela;
  /** A largura da caixa da janela, para as histórias que não cabem. */
  largura?: number;
  /** A altura da caixa da janela, para as histórias em que o conteúdo rola. */
  altura?: number;
  /** O botão "Trocar de tela", que dá uma chave nova à primeira aba, como a navegação faz. */
  trocarDeTela?: boolean;
  aoEscolher: (id: string) => void;
  aoFechar: (id: string) => void;
}

const meta: Meta<PropsDoExemplo> = {
  title: 'Casca/Abas da janela',
  component: JanelaComAbas,
  args: { aoEscolher: fn(), aoFechar: fn() },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<PropsDoExemplo>;

const texto = { color: 'var(--cor-texto)' } as const;

function Formulario({
  titulo,
  campo,
  ocultarComAbas,
}: {
  titulo: string;
  campo: string;
  ocultarComAbas?: boolean;
}) {
  return (
    <>
      <CabecalhoDaPagina titulo={titulo} ocultarComAbas={ocultarComAbas} />
      <label style={texto}>
        {campo} <input />
      </label>
    </>
  );
}

const ATIVO: AbaNaJanela = {
  id: 'tela',
  titulo: 'Novo ativo',
  conteudo: <Formulario titulo="Novo ativo" campo="Nome" />,
};

const LOCAL: AbaNaJanela = {
  id: 'cadastro-1',
  titulo: 'Novo local',
  fechavel: true,
  conteudo: <Formulario titulo="Novo local" campo="Nome do local" />,
};

/**
 * A janela com as abas e a aba da frente guardadas na história, como a casca do app guarda: a
 * escolha traz a aba para a frente, e o fechar a tira e volta à primeira.
 */
function JanelaComAbas({
  abas: iniciais,
  frente: inicial,
  aAbrir,
  largura,
  altura,
  trocarDeTela,
  ...avisos
}: PropsDoExemplo) {
  const [abas, definirAbas] = useState(iniciais);
  const [frente, definirFrente] = useState(inicial);
  const abrir = aAbrir;
  return (
    <div
      data-caixa
      style={{
        width: largura,
        padding: 'var(--esp-4)',
        // Com a altura, a janela ocupa a caixa, como na casca, e o conteúdo rola dentro dela.
        ...(altura && { height: altura, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }),
      }}
    >
      <div>
        {abrir && (
          <Botao
            onPress={() => {
              definirAbas((atuais) => [...atuais, abrir]);
              definirFrente(abrir.id);
            }}
          >
            Abrir {abrir.titulo}
          </Botao>
        )}
        {trocarDeTela && (
          <Botao
            onPress={() =>
              definirAbas((atuais) =>
                atuais.map((aba) => (aba.id === ATIVO.id ? { ...aba, chave: 'outra-tela' } : aba)),
              )
            }
          >
            Trocar de tela
          </Botao>
        )}
      </div>
      <JanelaDeConteudo>
        <AbasDaJanela
          abas={abas}
          frente={frente}
          aoEscolher={(id) => {
            avisos.aoEscolher(id);
            definirFrente(id);
          }}
          aoFechar={(id) => {
            avisos.aoFechar(id);
            definirAbas((atuais) => atuais.filter((aba) => aba.id !== id));
            definirFrente(ATIVO.id);
          }}
        />
      </JanelaDeConteudo>
    </div>
  );
}

/** A aba do cadastro do ativo e a do local que um campo dele abriu, na frente. */
export const DuasAbas: Historia = {
  args: { abas: [ATIVO, LOCAL], frente: LOCAL.id },
};

/**
 * As setas e o Home e o End andam entre as abas sem trocar a da frente; o Enter e o espaço trazem
 * a escolhida para a frente, e a aba anuncia a posição dela na barra.
 */
export const AbaDaFrentePeloTeclado: Historia = {
  args: { abas: [ATIVO, LOCAL], frente: LOCAL.id },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('tablist', { name: 'Abas da janela' })).toBeVisible();
    const ativo = tela.getByRole('tab', { name: 'Novo ativo' });
    const local = tela.getByRole('tab', { name: 'Novo local' });

    await userEvent.tab();
    await expect(local).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(ativo).toHaveFocus();
    await expect(ativo).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{Enter}');
    await expect(args.aoEscolher).toHaveBeenCalledWith('tela');
    await expect(ativo).toHaveAttribute('aria-selected', 'true');
    await expect(ativo).toHaveAttribute('aria-posinset', '1');
    await expect(ativo).toHaveAttribute('aria-setsize', '2');
    await expect(tela.getByRole('tabpanel', { name: 'Novo ativo' })).toBeVisible();
    await expect(tela.getByRole('textbox', { name: 'Nome' })).toBeVisible();

    await userEvent.keyboard('{End}');
    await expect(local).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(args.aoEscolher).toHaveBeenLastCalledWith('cadastro-1');
    await expect(local).toHaveAttribute('aria-selected', 'true');
    await expect(local).toHaveAttribute('aria-posinset', '2');
  },
};

/**
 * Cada aba de cadastro tem o botão de fechar, fora da aba e da lista, que o teclado alcança logo
 * depois dela; a primeira aba não tem. Com uma aba só, a barra some.
 */
export const FecharPeloBotao: Historia = {
  args: { abas: [ATIVO, LOCAL], frente: LOCAL.id },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const lista = tela.getByRole('tablist', { name: 'Abas da janela' });
    await expect(tela.queryByRole('button', { name: 'Fechar Novo ativo' })).toBeNull();
    const fechar = tela.getByRole('button', { name: 'Fechar Novo local' });
    await expect(lista).not.toContainElement(fechar);

    await userEvent.tab();
    await userEvent.tab();
    await expect(fechar).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.aoFechar).toHaveBeenCalledWith('cadastro-1');

    await waitFor(() => expect(tela.queryByRole('tablist')).toBeNull());
    await expect(tela.queryByRole('tabpanel')).toBeNull();
    await expect(tela.getByRole('textbox', { name: 'Nome' })).toBeVisible();
  },
};

/** O cadastro do ativo com mais campos do que cabem na janela. */
const ATIVO_LONGO: AbaNaJanela = {
  id: 'tela',
  titulo: 'Novo ativo',
  conteudo: (
    <>
      <CabecalhoDaPagina titulo="Novo ativo" />
      {Array.from({ length: 16 }, (_, indice) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: os campos do exemplo são fixos.
        <label key={indice} style={{ ...texto, display: 'grid' }}>
          Campo {indice + 1} <input />
        </label>
      ))}
    </>
  ),
};

/** Um cadastro de exemplo, com mais campos do que cabem na janela. */
function CamposDemais({ titulo }: { titulo: string }) {
  return (
    <>
      <CabecalhoDaPagina titulo={titulo} />
      {Array.from({ length: 16 }, (_, indice) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: os campos do exemplo são fixos.
        <label key={indice} style={{ ...texto, display: 'grid' }}>
          {titulo}, campo {indice + 1} <input />
        </label>
      ))}
    </>
  );
}

const LOCAL_LONGO: AbaNaJanela = {
  ...LOCAL,
  conteudo: <CamposDemais titulo="Novo local" />,
};

/**
 * Cada aba guarda o ponto da rolagem: a aba que vem para a frente pela primeira vez começa no topo,
 * e a volta a uma aba mostra o mesmo ponto em que ela estava.
 */
export const RolagemDeCadaAba: Historia = {
  args: { abas: [ATIVO_LONGO, LOCAL_LONGO], frente: ATIVO_LONGO.id, altura: 360 },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const area = canvasElement.querySelector('[data-rolagem-da-janela]') as HTMLElement;
    area.scrollTop = 200;
    await waitFor(() => expect(area).toHaveAttribute('data-mais-acima'));

    await userEvent.click(tela.getByRole('tab', { name: 'Novo local' }));
    await expect(area.scrollTop).toBe(0);
    area.scrollTop = 120;
    await waitFor(() => expect(area).toHaveAttribute('data-mais-acima'));

    await userEvent.click(tela.getByRole('tab', { name: 'Novo ativo' }));
    await waitFor(() => expect(area.scrollTop).toBe(200));
    await userEvent.click(tela.getByRole('tab', { name: 'Novo local' }));
    await waitFor(() => expect(area.scrollTop).toBe(120));
  },
};

/** A chave nova do conteúdo, como a de outra tela na mesma aba, volta a aba ao começo. */
export const ChaveNovaNoComeco: Historia = {
  args: { abas: [ATIVO_LONGO], frente: ATIVO_LONGO.id, altura: 360, trocarDeTela: true },
  play: async ({ canvasElement }) => {
    const area = canvasElement.querySelector('[data-rolagem-da-janela]') as HTMLElement;
    area.scrollTop = 200;
    await waitFor(() => expect(area).toHaveAttribute('data-mais-acima'));
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Trocar de tela' }));
    await waitFor(() => expect(area.scrollTop).toBe(0));
  },
};

/** A caixa de um elemento: o título que sai da vista fica com 1 px, cortado. */
const tamanho = (elemento: HTMLElement) => elemento.getBoundingClientRect().height;

/**
 * O título que a primeira aba já mostra sai da vista com a barra das abas e volta quando ela some.
 * Fora da vista, ele continua achado pelo leitor de tela e pelo foco.
 */
export const TituloSaiComABarra: Historia = {
  args: {
    abas: [{ ...ATIVO, conteudo: <Formulario titulo="Novo ativo" campo="Nome" ocultarComAbas /> }],
    frente: ATIVO.id,
    aAbrir: LOCAL,
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const titulo = tela.getByRole('heading', { level: 1, name: 'Novo ativo' });
    await expect(tamanho(titulo)).toBeGreaterThan(1);

    await userEvent.click(tela.getByRole('button', { name: 'Abrir Novo local' }));
    await userEvent.click(await tela.findByRole('tab', { name: 'Novo ativo' }));
    await expect(tela.getByRole('heading', { level: 1, name: 'Novo ativo' })).toBe(titulo);
    await expect(tamanho(titulo)).toBeLessThanOrEqual(1);
    titulo.focus();
    await expect(titulo).toHaveFocus();
    // O título do cadastro da outra aba, sem a opção, continua à vista.
    await userEvent.click(tela.getByRole('tab', { name: 'Novo local' }));
    await expect(
      tamanho(tela.getByRole('heading', { level: 1, name: 'Novo local' })),
    ).toBeGreaterThan(1);

    await userEvent.click(tela.getByRole('button', { name: 'Fechar Novo local' }));
    await waitFor(() => expect(tela.queryByRole('tablist')).toBeNull());
    await expect(tamanho(titulo)).toBeGreaterThan(1);
  },
};

const linhaDo = (canvas: HTMLElement) =>
  canvas.querySelector('[data-cabecalho-da-pagina]') as HTMLElement;

/**
 * Espaço depois do cabeçalho: a tela que põe o cabeçalho e o conteúdo lado a lado, sem um contêiner
 * dela, tem o conteúdo a 4 passos da linha (spec componentes-base, "Cabeçalho da página"; change
 * cabecalho-em-toda-tela, design, decisão 5).
 */
export const EspacoDepoisDoCabecalho: Historia = {
  args: { abas: [ATIVO], frente: ATIVO.id },
  play: async ({ canvasElement }) => {
    const cabecalho = linhaDo(canvasElement);
    const campo = within(canvasElement).getByText('Nome').closest('label') as HTMLElement;
    const passos = Number.parseFloat(getComputedStyle(canvasElement).getPropertyValue('--esp-4'));
    await expect(
      Math.abs(
        campo.getBoundingClientRect().top - cabecalho.getBoundingClientRect().bottom - passos,
      ),
    ).toBeLessThanOrEqual(1);
  },
};

/**
 * Título oculto com a barra das abas: o cabeçalho que só tem o título que a primeira aba repete não
 * deixa faixa nem linha em cima do conteúdo, e o título continua para o leitor de tela e o foco
 * (change cabecalho-em-toda-tela, design, decisão 6).
 */
export const CabecalhoSaiComABarra: Historia = {
  args: {
    abas: [{ ...ATIVO, conteudo: <Formulario titulo="Novo ativo" campo="Nome" ocultarComAbas /> }],
    frente: ATIVO.id,
    aAbrir: LOCAL,
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Abrir Novo local' }));
    await userEvent.click(await tela.findByRole('tab', { name: 'Novo ativo' }));
    const painel = canvasElement.querySelector('[data-aba-da-janela="tela"]') as HTMLElement;
    const campo = within(painel).getByText('Nome').closest('label') as HTMLElement;
    // O campo começa no topo do painel: nada do cabeçalho ocupa lugar em cima dele.
    await expect(
      Math.abs(campo.getBoundingClientRect().top - painel.getBoundingClientRect().top),
    ).toBeLessThanOrEqual(1);
    await expect(linhaDo(painel).getBoundingClientRect().height).toBe(0);
    const titulo = within(painel).getByRole('heading', { level: 1, name: 'Novo ativo' });
    titulo.focus();
    await expect(titulo).toHaveFocus();
  },
};

/** O conteúdo rola na área abaixo da barra, e a barra fica no lugar, fora da rolagem. */
export const BarraNoLugarAoRolar: Historia = {
  args: { abas: [ATIVO_LONGO, LOCAL], frente: ATIVO_LONGO.id, altura: 360 },
  play: async ({ canvasElement }) => {
    const barra = canvasElement.querySelector('[data-barra-de-abas]') as HTMLElement;
    const area = canvasElement.querySelector('[data-rolagem-da-janela]') as HTMLElement;
    await expect(area.contains(barra)).toBe(false);
    await expect(barra.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      area.getBoundingClientRect().top + 1,
    );
    await expect(area.scrollHeight).toBeGreaterThan(area.clientHeight);

    const topoDaBarra = barra.getBoundingClientRect().top;
    area.scrollTop = area.scrollHeight;
    await waitFor(() => expect(area).toHaveAttribute('data-mais-acima'));
    await expect(barra.getBoundingClientRect().top).toBe(topoDaBarra);
  },
};

const CADASTROS = ['Novo local', 'Nova pessoa', 'Novo modelo', 'Novo tipo', 'Novo fornecedor'];

/**
 * Mais abas do que cabem: a barra rola de lado, a janela não fica mais larga, e a aba da frente
 * fica à vista, também quando o teclado vai à primeira.
 */
export const MuitasAbas: Historia = {
  args: {
    largura: 480,
    abas: [
      ATIVO,
      ...CADASTROS.map((titulo, indice) => ({
        id: `cadastro-${indice + 1}`,
        titulo,
        fechavel: true,
        conteudo: <Formulario titulo={titulo} campo="Nome" />,
      })),
    ],
    frente: `cadastro-${CADASTROS.length}`,
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixa = canvasElement.querySelector('[data-caixa]') as HTMLElement;
    const lista = tela.getByRole('tablist', { name: 'Abas da janela' });
    const barra = lista.closest('[data-barra-de-abas]') as HTMLElement;
    await expect(caixa.scrollWidth).toBeLessThanOrEqual(caixa.clientWidth);
    await expect(barra.scrollWidth).toBeGreaterThan(barra.clientWidth);
    const alturas = tela.getAllByRole('tab').map((aba) => aba.getBoundingClientRect().height);
    await expect(new Set(alturas).size).toBe(1);

    const aVista = (aba: HTMLElement) => {
      const area = barra.getBoundingClientRect();
      const caixaDaAba = aba.getBoundingClientRect();
      return caixaDaAba.left >= area.left - 1 && caixaDaAba.right <= area.right + 1;
    };
    const ultima = tela.getByRole('tab', { name: 'Novo fornecedor' });
    await waitFor(() => expect(aVista(ultima)).toBe(true));

    await userEvent.tab();
    await expect(ultima).toHaveFocus();
    await userEvent.keyboard('{Home}');
    const primeira = tela.getByRole('tab', { name: 'Novo ativo' });
    await expect(primeira).toHaveFocus();
    await waitFor(() => expect(aVista(primeira)).toBe(true));
  },
};

/**
 * A primeira aba guarda o que foi digitado quando a barra aparece e quando outra aba vai para a
 * frente: as de trás continuam montadas, escondidas e inertes.
 */
export const AbasGuardamOQueFoiDigitado: Historia = {
  args: { abas: [ATIVO], frente: ATIVO.id, aAbrir: LOCAL },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.queryByRole('tablist')).toBeNull();
    await userEvent.type(tela.getByRole('textbox', { name: 'Nome' }), 'IMP-01');

    await userEvent.click(tela.getByRole('button', { name: 'Abrir Novo local' }));
    await expect(await tela.findByRole('tablist', { name: 'Abas da janela' })).toBeVisible();
    await expect(tela.queryByRole('textbox', { name: 'Nome' })).toBeNull();
    const nomeDoAtivo = canvasElement.querySelector('input') as HTMLInputElement;
    await expect(nomeDoAtivo).not.toBeVisible();
    await expect(nomeDoAtivo.closest('[inert]')).not.toBeNull();
    await userEvent.type(tela.getByRole('textbox', { name: 'Nome do local' }), 'Sala 12');

    await userEvent.click(tela.getByRole('tab', { name: 'Novo ativo' }));
    await expect(tela.getByRole('textbox', { name: 'Nome' })).toHaveValue('IMP-01');
    await userEvent.click(tela.getByRole('tab', { name: 'Novo local' }));
    await expect(tela.getByRole('textbox', { name: 'Nome do local' })).toHaveValue('Sala 12');
  },
};

/** Mede a entrada da aba que o botão abre, com o movimento pedido no atributo da raiz. */
async function duracaoDaEntrada(canvasElement: HTMLElement, movimento: 'normal' | 'reduzido') {
  const raiz = document.documentElement;
  raiz.setAttribute('data-motion', movimento);
  try {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Abrir Novo local' }));
    const aba = await tela.findByRole('tab', { name: 'Novo local' });
    const estilo = getComputedStyle(aba);
    return { nome: estilo.animationName, segundos: Number.parseFloat(estilo.animationDuration) };
  } finally {
    raiz.removeAttribute('data-motion');
  }
}

/** A aba que abre entra com uma animação curta, de no máximo 300 ms. */
export const EntradaDaAba: Historia = {
  args: { abas: [ATIVO], frente: ATIVO.id, aAbrir: LOCAL },
  play: async ({ canvasElement }) => {
    const entrada = await duracaoDaEntrada(canvasElement, 'normal');
    await expect(entrada.nome).not.toBe('none');
    await expect(entrada.segundos).toBeGreaterThan(0);
    await expect(entrada.segundos).toBeLessThanOrEqual(0.3);
  },
};

/** Com movimento reduzido, a aba aparece sem animação. */
export const EntradaComMovimentoReduzido: Historia = {
  args: { abas: [ATIVO], frente: ATIVO.id, aAbrir: LOCAL },
  play: async ({ canvasElement }) => {
    const entrada = await duracaoDaEntrada(canvasElement, 'reduzido');
    await expect(entrada.segundos).toBe(0);
  },
};

/** No toque, cada aba e cada botão de fechar têm alvo de pelo menos 44 px. */
export const NoToque: Historia = {
  args: { abas: [ATIVO, LOCAL], frente: LOCAL.id },
  play: async ({ canvasElement }) => {
    const raiz = document.documentElement;
    raiz.setAttribute('data-postura', 'tablet');
    try {
      const tela = within(canvasElement);
      const alvos = [
        ...tela.getAllByRole('tab'),
        tela.getByRole('button', { name: 'Fechar Novo local' }),
      ];
      for (const alvo of alvos) {
        const caixa = alvo.getBoundingClientRect();
        await expect(caixa.width, alvo.textContent ?? '').toBeGreaterThanOrEqual(44);
        await expect(caixa.height, alvo.textContent ?? '').toBeGreaterThanOrEqual(44);
      }
    } finally {
      raiz.removeAttribute('data-postura');
    }
  },
};
