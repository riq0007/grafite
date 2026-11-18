import type { Meta, StoryObj } from '@storybook/react-vite';
import { Printer } from 'lucide-react';
import { expect, within } from 'storybook/test';
import { Icone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import { RotuloDeSituacao } from '../situacao/RotuloDeSituacao.tsx';
import { CabecalhoDaPagina } from './CabecalhoDaPagina.tsx';

// O cabeçalho da página (spec componentes-base, "Cabeçalho da página"; change cabecalhos-e-fichas,
// design, decisão 1).
const meta: Meta = { title: 'Componentes/Cabeçalho da página' };
export default meta;

type Historia = StoryObj;

/** O número do chamado, montado no texto: "#1041" escrito direto parece uma cor ao verificador. */
const numero = (valor: number) => `#${valor}`;

/** A ficha de uma OS: o título com o selo, o detalhe embaixo e as ações juntas, à direita. */
export const FichaDeUmaOrdem: Historia = {
  tags: ['captura'],
  render: () => (
    <div style={{ padding: 'var(--esp-4)', background: 'var(--cor-superficie)' }}>
      <CabecalhoDaPagina
        marca={<Icone icone={Printer} tamanho={24} />}
        titulo="OS 3"
        selos={<RotuloDeSituacao situacao="info">Aberta</RotuloDeSituacao>}
        detalhe="PAT-00139 · Impressora 139"
        acoes={
          <>
            <Botao nivel="primario">Mudar a situação</Botao>
            <Botao>Lançar peça</Botao>
            <Botao>Resolver</Botao>
          </>
        }
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const cabecalho = canvasElement.querySelector('[data-cabecalho-da-pagina]') as HTMLElement;
    const titulo = tela.getByRole('heading', { level: 1 });
    await expect(titulo.textContent).toContain('OS 3');
    const [mudar, lancar, resolver] = tela.getAllByRole('button') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];

    // Ações à direita: juntas, na mesma linha, e a última encostada na borda direita.
    await expect(lancar.getBoundingClientRect().top).toBe(mudar.getBoundingClientRect().top);
    await expect(resolver.getBoundingClientRect().top).toBe(mudar.getBoundingClientRect().top);
    const direita =
      cabecalho.getBoundingClientRect().right -
      Number.parseFloat(getComputedStyle(cabecalho).paddingRight);
    await expect(Math.abs(resolver.getBoundingClientRect().right - direita)).toBeLessThanOrEqual(1);
    await expect(mudar.getBoundingClientRect().left).toBeGreaterThan(
      titulo.getBoundingClientRect().right,
    );

    // Detalhe embaixo do título, no texto secundário.
    const detalhe = tela.getByText('PAT-00139 · Impressora 139');
    await expect(detalhe.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      titulo.getBoundingClientRect().bottom - 1,
    );
  },
};

/** Uma lista: só o título e a ação de cadastro, à direita. */
export const ListaComAcao: Historia = {
  tags: ['captura'],
  render: () => (
    <div style={{ padding: 'var(--esp-4)', background: 'var(--cor-superficie)' }}>
      <CabecalhoDaPagina titulo="Pessoas" acoes={<Botao nivel="primario">Nova pessoa</Botao>} />
    </div>
  ),
};

/**
 * Com a trilha e o quadro, como o chamado aberto (m03 dos chamados): a trilha em cima, o quadro à
 * direita do título e das ações, e as ações embaixo do título, a partir da esquerda, com a principal
 * fechando o grupo.
 */
export const ComTrilhaEQuadro: Historia = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-6)', background: 'var(--cor-superficie)' }}>
      {(
        [
          ['larga', 960],
          ['estreita', 480],
          ['sem-acoes', 960],
        ] as const
      ).map(([caso, largura]) => (
        <div key={caso} data-caso={caso} style={{ width: largura, padding: 'var(--esp-4)' }}>
          <CabecalhoDaPagina
            trilha={
              <nav aria-label={`Trilha ${caso}`}>Chamados › Acesso e senha › {numero(1041)}</nav>
            }
            titulo={`${numero(1041)} Sem acesso à pasta do Financeiro`}
            detalhe="Aguardando o colaborador · Fernanda Rocha · Financeiro, 2º andar"
            quadro={
              <div data-quadro style={{ display: 'grid', justifyItems: 'end' }}>
                <span>Prazo do tipo, 4 h, no horário da TI</span>
                <b>Relógio parado</b>
                <span>Parou às 09:21 · restam 1 h 44 min</span>
                {caso === 'sem-acoes' && <span>Resposta atrasada desde 08:30</span>}
              </div>
            }
            acoes={
              caso !== 'sem-acoes' && (
                <>
                  <Botao>Transferir</Botao>
                  <Botao>Resolver</Botao>
                  <Botao nivel="primario">Responder</Botao>
                </>
              )
            }
          />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const caixa = (elemento: Element) => elemento.getBoundingClientRect();
    const medir = (caso: string) => {
      const area = canvasElement.querySelector(`[data-caso="${caso}"]`) as HTMLElement;
      const cabecalho = area.querySelector('[data-cabecalho-da-pagina]') as HTMLElement;
      const botoes = within(area).queryAllByRole('button');
      return {
        cabecalho: caixa(cabecalho),
        direita:
          caixa(cabecalho).right - Number.parseFloat(getComputedStyle(cabecalho).paddingRight),
        trilha: caixa(within(area).getByRole('navigation')),
        titulo: caixa(within(area).getByRole('heading', { level: 1 })),
        textos: caixa(within(area).getByRole('heading', { level: 1 }).parentElement as HTMLElement),
        quadro: caixa(area.querySelector('[data-quadro]') as HTMLElement),
        primeira: botoes[0] && caixa(botoes[0]),
        ultima: botoes.at(-1) && caixa(botoes.at(-1) as HTMLElement),
      };
    };

    // Na largura que comporta: a trilha em cima, o quadro à direita, encostado na borda, e as ações
    // embaixo do título, a partir da esquerda, na mesma linha.
    const larga = medir('larga');
    const [primeira, ultima] = [larga.primeira as DOMRect, larga.ultima as DOMRect];
    await expect(larga.trilha.bottom).toBeLessThanOrEqual(larga.titulo.top);
    await expect(larga.quadro.left).toBeGreaterThan(larga.titulo.right);
    await expect(Math.abs(larga.quadro.right - larga.direita)).toBeLessThanOrEqual(1);
    await expect(larga.quadro.top).toBeGreaterThanOrEqual(larga.trilha.bottom);
    await expect(primeira.top).toBeGreaterThanOrEqual(larga.titulo.bottom);
    await expect(Math.abs(primeira.left - larga.titulo.left)).toBeLessThanOrEqual(1);
    await expect(ultima.top).toBe(primeira.top);

    // Na estreita, o quadro desce para baixo das ações, ainda à direita.
    const estreita = medir('estreita');
    await expect(estreita.quadro.top).toBeGreaterThanOrEqual((estreita.ultima as DOMRect).bottom);
    await expect(Math.abs(estreita.quadro.right - estreita.direita)).toBeLessThanOrEqual(1);
    await expect(
      Math.abs((estreita.primeira as DOMRect).left - estreita.titulo.left),
    ).toBeLessThanOrEqual(1);

    // Sem as ações, com o quadro mais alto que o título e o detalhe, o título fica no alto, no mesmo
    // lugar.
    const semAcoes = medir('sem-acoes');
    await expect(semAcoes.quadro.height).toBeGreaterThan(semAcoes.textos.height);
    await expect(semAcoes.titulo.top - semAcoes.cabecalho.top).toBe(
      larga.titulo.top - larga.cabecalho.top,
    );
  },
};
