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
