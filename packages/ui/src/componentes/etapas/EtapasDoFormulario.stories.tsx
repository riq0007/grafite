import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { JanelaDeConteudo } from '../../casca/Casca.tsx';
import { RolagemDaJanela } from '../../casca/RolagemDaJanela.tsx';
import { type EtapaDoFormulario, EtapasDoFormulario } from './EtapasDoFormulario.tsx';

interface PropsDoExemplo {
  etapas: readonly EtapaDoFormulario[];
  atual: string;
  /** A largura da caixa da janela, para ver a faixa do celular. */
  largura?: number;
  /** A altura da caixa da janela, com o painel mais alto que ela, para ver a lista presa. */
  altura?: number;
  numerar?: boolean;
  /** O que fica embaixo da lista: a situação do rascunho no cadastro, as alterações na ficha. */
  rodape?: string;
  aoEscolher: (id: string) => void;
}

const meta: Meta<PropsDoExemplo> = {
  title: 'Componentes/Etapas do formulário',
  component: Exemplo,
  args: { aoEscolher: fn() },
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj<PropsDoExemplo>;

/** As etapas do cadastro de uma impressora, com a do Modelo aberta. */
const IMPRESSORA: EtapaDoFormulario[] = [
  { id: 'tipo', nome: 'Tipo', situacao: 'Impressora' },
  { id: 'modelo', nome: 'Modelo', situacao: 'HP LaserJet M404' },
  { id: 'identificacao', nome: 'Identificação', situacao: 'Opcional' },
  { id: 'uso', nome: 'Uso', situacao: 'Preenchida' },
  { id: 'rede', nome: 'Rede', situacao: 'Falta: IP', tom: 'atencao' },
  { id: 'administrativo', nome: 'Administrativo', situacao: 'Opcional' },
];

/** Antes do tipo: só o Tipo abre, e as outras dizem por quê. */
const SEM_TIPO: EtapaDoFormulario[] = [
  { id: 'tipo', nome: 'Tipo', situacao: 'Falta escolher', tom: 'atencao' },
  ...['Modelo', 'Identificação', 'Uso', 'Administrativo'].map((nome) => ({
    id: nome,
    nome,
    situacao: '',
    motivo: 'Escolha o tipo antes',
  })),
];

const texto = { color: 'var(--cor-texto)', margin: 0 } as const;

/** As etapas com a atual guardada na história, como o cadastro guarda, e o painel dela. */
function Exemplo({
  etapas,
  atual: inicial,
  largura,
  altura,
  numerar,
  rodape = 'Rascunho guardado agora',
  aoEscolher,
}: PropsDoExemplo) {
  const [atual, definirAtual] = useState(inicial);
  const etapa = etapas.find((candidata) => candidata.id === atual);
  return (
    <div
      data-caixa
      style={{
        width: largura,
        padding: 'var(--esp-4)',
        // Com a altura, a janela ocupa a caixa, como na casca, e o painel rola dentro dela.
        ...(altura && { height: altura, display: 'grid', gridTemplateRows: 'minmax(0, 1fr)' }),
      }}
    >
      <JanelaDeConteudo>
        <RolagemDaJanela>
          <EtapasDoFormulario
            rotulo="Etapas do cadastro"
            etapas={etapas}
            atual={atual}
            numerar={numerar}
            aoEscolher={(id) => {
              aoEscolher(id);
              definirAtual(id);
            }}
            rodape={<p style={{ ...texto, color: 'var(--cor-texto-2)' }}>{rodape}</p>}
          >
            <h2 style={texto}>{etapa?.nome}</h2>
            {altura &&
              Array.from({ length: 30 }, (_, indice) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: as linhas do exemplo são fixas.
                <p key={indice} style={texto}>
                  Linha {indice + 1} do painel da etapa.
                </p>
              ))}
          </EtapasDoFormulario>
        </RolagemDaJanela>
      </JanelaDeConteudo>
    </div>
  );
}

/** O cadastro de uma impressora, com a etapa do Modelo aberta e o IP faltando na Rede. */
export const SeisEtapas: Historia = {
  args: { etapas: IMPRESSORA, atual: 'modelo' },
};

/**
 * A lista é uma navegação com o nome dela; a etapa atual é anunciada como a atual, com a situação
 * como descrição, e é o único ponto de Tab da lista.
 */
export const EtapaAtualAnunciada: Historia = {
  args: { etapas: IMPRESSORA, atual: 'identificacao' },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('navigation', { name: 'Etapas do cadastro' })).toBeVisible();
    const atual = tela.getByRole('button', { name: '3 · Identificação' });
    await expect(atual).toHaveAttribute('aria-current', 'step');
    await expect(atual).toHaveAccessibleDescription('Opcional');
    await expect(tela.getByRole('button', { name: '5 · Rede' })).toHaveAccessibleDescription(
      'Falta: IP',
    );
    const outras = tela.getAllByRole('button').filter((botao) => botao !== atual);
    for (const outra of outras) await expect(outra).not.toHaveAttribute('aria-current');

    await userEvent.tab();
    await expect(atual).toHaveFocus();
    await userEvent.tab();
    await expect(canvasElement.contains(document.activeElement)).toBe(false);
  },
};

/** As setas andam entre as etapas, nas duas direções, e o Enter e o espaço abrem a escolhida. */
export const EtapaPeloTeclado: Historia = {
  args: { etapas: IMPRESSORA, atual: 'modelo' },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const modelo = tela.getByRole('button', { name: '2 · Modelo' });
    const identificacao = tela.getByRole('button', { name: '3 · Identificação' });
    await userEvent.tab();
    await expect(modelo).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    await expect(identificacao).toHaveFocus();
    await expect(args.aoEscolher).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    await expect(args.aoEscolher).toHaveBeenCalledWith('identificacao');
    await expect(identificacao).toHaveAttribute('aria-current', 'step');
    await expect(modelo).not.toHaveAttribute('aria-current');

    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(tela.getByRole('button', { name: '5 · Rede' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}');
    await expect(tela.getByRole('button', { name: '3 · Identificação' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect(tela.getByRole('button', { name: '6 · Administrativo' })).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(args.aoEscolher).toHaveBeenLastCalledWith('administrativo');
    await userEvent.keyboard('{Home}');
    await expect(tela.getByRole('button', { name: '1 · Tipo' })).toHaveFocus();
  },
};

/**
 * Antes do tipo, as outras etapas ficam apagadas, com o motivo em texto: o foco chega a elas, para o
 * leitor de tela ler o motivo, e o clique e o Enter não as abrem.
 */
export const EtapaSemAEscolha: Historia = {
  args: { etapas: SEM_TIPO, atual: 'tipo' },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const modelo = tela.getByRole('button', { name: '2 · Modelo' });
    await expect(modelo).toHaveAttribute('aria-disabled', 'true');
    await expect(modelo).toHaveAccessibleDescription('Escolha o tipo antes');
    await expect(tela.getAllByText('Escolha o tipo antes')).toHaveLength(4);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await expect(modelo).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(args.aoEscolher).not.toHaveBeenCalled();

    await userEvent.click(modelo);
    await expect(args.aoEscolher).not.toHaveBeenCalled();
    await expect(tela.getByRole('button', { name: '1 · Tipo' })).toHaveAttribute(
      'aria-current',
      'step',
    );
  },
};

/**
 * Na janela estreita, como a do celular, a lista vira uma faixa que rola de lado, acima do painel,
 * sem alargar a janela, e a etapa atual fica à vista.
 */
export const NoCelular: Historia = {
  args: { etapas: IMPRESSORA, atual: 'rede', largura: 360 },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixa = canvasElement.querySelector('[data-caixa]') as HTMLElement;
    const lista = tela.getByRole('list');
    const etapas = tela.getAllByRole('button');
    const topos = new Set(etapas.map((etapa) => Math.round(etapa.getBoundingClientRect().top)));
    await expect(topos.size).toBe(1);
    await expect(caixa.scrollWidth).toBeLessThanOrEqual(caixa.clientWidth);
    await expect(lista.scrollWidth).toBeGreaterThan(lista.clientWidth);
    const painel = tela.getByRole('heading', { name: 'Rede' });
    await expect(painel.getBoundingClientRect().top).toBeGreaterThan(
      lista.getBoundingClientRect().bottom - 1,
    );
    const rede = tela.getByRole('button', { name: '5 · Rede' });
    await waitFor(() => {
      const area = lista.getBoundingClientRect();
      const daEtapa = rede.getBoundingClientRect();
      expect(daEtapa.left).toBeGreaterThanOrEqual(area.left - 1);
      expect(daEtapa.right).toBeLessThanOrEqual(area.right + 1);
    });
  },
};

/** No toque, cada etapa tem alvo de pelo menos 44 px. */
export const NoToque: Historia = {
  args: { etapas: IMPRESSORA, atual: 'modelo' },
  play: async ({ canvasElement }) => {
    const raiz = document.documentElement;
    raiz.setAttribute('data-postura', 'tablet');
    try {
      for (const etapa of within(canvasElement).getAllByRole('button')) {
        const caixa = etapa.getBoundingClientRect();
        await expect(caixa.height, etapa.textContent ?? '').toBeGreaterThanOrEqual(44);
      }
    } finally {
      raiz.removeAttribute('data-postura');
    }
  },
};

/**
 * Os cartões de uma ficha, sem a numeração (change ficha-em-cartoes): cada um com o resumo do que
 * tem, o que falta em atenção, e o cartão Uso aberto.
 */
export const CartoesDeUmaFicha: Historia = {
  args: {
    etapas: [
      { id: 'visao-geral', nome: 'Visão geral', situacao: '1 alerta aberto' },
      { id: 'identificacao', nome: 'Identificação', situacao: 'PAT-0142 · VNB3K21' },
      { id: 'uso', nome: 'Uso', situacao: 'Em uso · Jundiaí › Expedição' },
      { id: 'rede', nome: 'Rede', situacao: 'Falta: IP', tom: 'atencao' },
      {
        id: 'suprimentos',
        nome: 'Suprimentos e contadores',
        situacao: 'Preto em 18%',
        tom: 'atencao',
      },
      { id: 'administrativo', nome: 'Administrativo', situacao: 'Garantia até 03/2027' },
    ],
    atual: 'uso',
    numerar: false,
    rodape: 'Nenhuma alteração',
  },
};

/** Sem a numeração, como nos grupos de uma ficha, a atual é anunciada como a atual da lista. */
export const SemNumeracao: Historia = {
  args: {
    etapas: [
      { id: 'visao-geral', nome: 'Visão geral', situacao: 'Respondendo' },
      { id: 'uso', nome: 'Uso', situacao: 'Em uso · Expedição' },
      { id: 'administrativo', nome: 'Administrativo', situacao: 'Garantia até 03/2027' },
    ],
    atual: 'uso',
    numerar: false,
  },
  play: async ({ canvasElement }) => {
    const uso = within(canvasElement).getByRole('button', { name: 'Uso' });
    await expect(uso).toHaveAttribute('aria-current', 'true');
  },
};

/**
 * Com o painel mais alto que a janela, a lista continua à vista, inteira, enquanto o painel rola, e
 * fica abaixo da faixa esmaecida de cima.
 */
export const ListaAVistaComOPainelRolado: Historia = {
  args: { etapas: IMPRESSORA, atual: 'administrativo', altura: 560 },
  play: async ({ canvasElement }) => {
    const area = canvasElement.querySelector('[data-rolagem-da-janela]') as HTMLElement;
    const faixa = Number.parseFloat(
      getComputedStyle(area).getPropertyValue('--faixa-de-cima-da-janela'),
    );
    await expect(area.scrollHeight).toBeGreaterThan(area.clientHeight);
    area.scrollTop = area.scrollHeight;
    await waitFor(() => expect(area).toHaveAttribute('data-mais-acima'));

    const etapas = within(canvasElement).getAllByRole('button');
    const caixa = area.getBoundingClientRect();
    const primeira = (etapas[0] as HTMLElement).getBoundingClientRect();
    const ultima = (etapas.at(-1) as HTMLElement).getBoundingClientRect();
    await expect(primeira.top).toBeGreaterThanOrEqual(caixa.top + area.clientTop + faixa - 1);
    await expect(ultima.bottom).toBeLessThanOrEqual(caixa.top + area.clientTop + area.clientHeight);
  },
};
