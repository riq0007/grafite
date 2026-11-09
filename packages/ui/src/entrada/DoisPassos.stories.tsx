import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, type Mock, userEvent, waitFor, within } from 'storybook/test';
import { comTelaPorTras } from '../teste/tela.tsx';
import { CadastroDosDoisPassos, type PropsDoCadastro } from './CadastroDosDoisPassos.tsx';
import { CodigosDeRecuperacao } from './CodigosDeRecuperacao.tsx';
import { TelaDeEntrada } from './TelaDeEntrada.tsx';

/** Exemplo: a chave das RFCs 4226 e 6238 e códigos inventados, que nenhuma conta usa. */
const EXEMPLO = {
  chave: 'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ',
  uri: 'otpauth://totp/Grafite%3Aana.souza%20(Empresa%20de%20exemplo)?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Grafite&algorithm=SHA1&digits=6&period=30',
  codigos: [
    'a7k2m-9qx4t',
    'b3n8p-2wr6v',
    'c5t1x-7hz3k',
    'd9m4q-1vb8r',
    'e2w6y-5kd0n',
    'f8r3z-6tp2m',
    'g1v7k-3nx9w',
    'h4b0d-8qm5t',
    'j6p9r-0yc4v',
    'k0x5n-4ga7z',
  ],
};

const meta: Meta = {
  title: 'Entrada/Verificação em dois passos',
  parameters: { layout: 'fullscreen' },
};
export default meta;

type HistoriaDoCadastro = StoryObj<{
  aoConfirmar: Mock<PropsDoCadastro['aoConfirmar']>;
  aoSair: Mock<() => void>;
  copiar: Mock<(texto: string) => Promise<void>>;
}>;

const doCadastro = {
  args: {
    aoConfirmar: fn(async () => ({ ok: true }) as const),
    aoSair: fn(),
    copiar: fn(async () => {}),
  },
  render: ({ aoConfirmar, aoSair, copiar }) => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <CadastroDosDoisPassos
        chave={EXEMPLO.chave}
        uri={EXEMPLO.uri}
        aoConfirmar={aoConfirmar}
        aoSair={aoSair}
        copiar={copiar}
      />
    </TelaDeEntrada>
  ),
} satisfies HistoriaDoCadastro;

export const Cadastro: HistoriaDoCadastro = {
  ...doCadastro,
  play: async ({ canvasElement, args: { copiar } }) => {
    const tela = within(canvasElement);
    await expect(
      tela.getByRole('heading', { name: 'Cadastre a verificação em dois passos' }),
    ).toBeVisible();
    await expect(tela.getByRole('img', { name: 'QR code para o app autenticador' })).toBeVisible();
    // A chave aparece em grupos de 4 e vai sem espaços para a área de transferência.
    const chave = tela.getByRole('group', { name: 'Chave para o app autenticador' });
    await expect(within(chave).getByText(EXEMPLO.chave)).toBeVisible();
    await userEvent.click(within(chave).getByRole('button', { name: 'Copiar' }));
    await expect(copiar).toHaveBeenCalledWith('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    await expect(await within(chave).findByRole('button', { name: 'Copiado' })).toBeVisible();
  },
};

/**
 * Quando a exigência surge com a casca aberta, o cadastro diz por que apareceu, logo depois do
 * título.
 */
export const CadastroExigidoComACascaAberta: HistoriaDoCadastro = {
  ...doCadastro,
  render: ({ aoConfirmar, aoSair, copiar }) => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <CadastroDosDoisPassos
        chave={EXEMPLO.chave}
        uri={EXEMPLO.uri}
        aoConfirmar={aoConfirmar}
        aoSair={aoSair}
        copiar={copiar}
        aviso="A verificação em dois passos passou a ser exigida para a sua conta."
      />
    </TelaDeEntrada>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const titulo = tela.getByRole('heading', { name: 'Cadastre a verificação em dois passos' });
    const aviso = tela.getByText(
      'A verificação em dois passos passou a ser exigida para a sua conta.',
    );
    await expect(aviso).toBeVisible();
    await expect(titulo.nextElementSibling).toBe(aviso);
  },
};

export const ConfirmarComOCodigo: HistoriaDoCadastro = {
  ...doCadastro,
  play: async ({ canvasElement, args: { aoConfirmar } }) => {
    const tela = within(canvasElement);
    const campo = tela.getByLabelText('Código do app');
    await expect(campo).toHaveAttribute('autocomplete', 'one-time-code');
    await userEvent.type(campo, '287082{Enter}');
    await expect(aoConfirmar).toHaveBeenCalledWith('287082');
  },
};

export const CodigoIncorreto: HistoriaDoCadastro = {
  ...doCadastro,
  args: {
    ...doCadastro.args,
    aoConfirmar: fn(async () => ({
      erro: 'Código incorreto. Confira se o relógio do celular está certo e tente de novo.',
    })),
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.type(tela.getByLabelText('Código do app'), '000000{Enter}');
    await expect(await tela.findByRole('alert')).toHaveTextContent(
      'Código incorreto. Confira se o relógio do celular está certo e tente de novo.',
    );
    await expect(tela.getByLabelText('Código do app')).toHaveValue('');
  },
};

export const SairDoCadastro: HistoriaDoCadastro = {
  ...doCadastro,
  play: async ({ canvasElement, args: { aoSair } }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Sair' }));
    await expect(aoSair).toHaveBeenCalledTimes(1);
  },
};

type HistoriaDosCodigos = StoryObj<{
  aoContinuar: Mock<() => void>;
  copiar: Mock<(texto: string) => Promise<void>>;
}>;

export const Codigos: HistoriaDosCodigos = {
  args: { aoContinuar: fn(), copiar: fn(async () => {}) },
  render: ({ aoContinuar, copiar }) => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <CodigosDeRecuperacao codigos={EXEMPLO.codigos} aoContinuar={aoContinuar} copiar={copiar} />
    </TelaDeEntrada>
  ),
  play: async ({ canvasElement, args: { aoContinuar, copiar } }) => {
    const tela = within(canvasElement);
    await expect(
      tela.getByRole('heading', { name: 'Guarde os códigos de recuperação' }),
    ).toBeVisible();
    const lista = tela.getByRole('list', { name: 'Códigos de recuperação' });
    await expect(within(lista).getAllByRole('listitem')).toHaveLength(10);
    await expect(within(lista).getByText('a7k2m-9qx4t')).toBeVisible();
    const codigos = tela.getByRole('group', { name: 'Códigos de recuperação' });
    await userEvent.click(within(codigos).getByRole('button', { name: 'Copiar' }));
    await expect(copiar).toHaveBeenCalledWith(EXEMPLO.codigos.join('\n'));
    await expect(await within(codigos).findByRole('button', { name: 'Copiado' })).toBeVisible();
    await userEvent.click(tela.getByRole('button', { name: 'Continuar' }));
    await expect(aoContinuar).toHaveBeenCalledTimes(1);
  },
};

export const CopiaRecusadaPeloNavegador: HistoriaDosCodigos = {
  args: {
    aoContinuar: fn(),
    copiar: fn(async () => {
      throw new Error('negado');
    }),
  },
  render: Codigos.render,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Copiar' }));
    await waitFor(() =>
      expect(
        tela.getByText('Não foi possível copiar. Selecione os códigos e copie.'),
      ).toBeVisible(),
    );
  },
};

/** Nos Ajustes, o cadastro fica dentro da parte da conta: o título é h3, e o desistir é "Cancelar". */
export const CadastroNosAjustes: HistoriaDoCadastro = {
  ...doCadastro,
  render: ({ aoConfirmar, aoSair, copiar }) => (
    <CadastroDosDoisPassos
      chave={EXEMPLO.chave}
      uri={EXEMPLO.uri}
      aoConfirmar={aoConfirmar}
      aoSair={aoSair}
      rotuloDeSair="Cancelar"
      nivelDoTitulo={3}
      copiar={copiar}
    />
  ),
  play: async ({ canvasElement, args: { aoSair } }) => {
    const tela = within(canvasElement);
    await expect(
      tela.getByRole('heading', { level: 3, name: 'Cadastre a verificação em dois passos' }),
    ).toBeVisible();
    await userEvent.click(tela.getByRole('button', { name: 'Cancelar' }));
    await expect(aoSair).toHaveBeenCalledTimes(1);
  },
};

export const CodigosNosAjustes: HistoriaDosCodigos = {
  args: { aoContinuar: fn(), copiar: fn(async () => {}) },
  render: ({ aoContinuar, copiar }) => (
    <CodigosDeRecuperacao
      codigos={EXEMPLO.codigos}
      aoContinuar={aoContinuar}
      nivelDoTitulo={3}
      copiar={copiar}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', {
        level: 3,
        name: 'Guarde os códigos de recuperação',
      }),
    ).toBeVisible();
  },
};

/** O cadastro como abre, com o QR code e a chave: a referência da regressão visual. */
export const VistaDoCadastro: HistoriaDoCadastro = { ...doCadastro, decorators: [comTelaPorTras] };

/** Os códigos de recuperação como aparecem, antes de copiar: a referência da regressão visual. */
export const VistaDosCodigos: HistoriaDosCodigos = {
  args: Codigos.args,
  render: Codigos.render,
  decorators: [comTelaPorTras],
};
