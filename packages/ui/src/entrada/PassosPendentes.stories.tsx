import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, type Mock, userEvent, waitFor, within } from 'storybook/test';
import { comTelaPorTras } from '../teste/tela.tsx';
import { PassoDaSenhaNova, type PropsDoPassoDaSenhaNova } from './PassoDaSenhaNova.tsx';
import { PassoDoCodigo, type PropsDoPassoDoCodigo } from './PassoDoCodigo.tsx';
import { TelaDeEntrada } from './TelaDeEntrada.tsx';

const meta: Meta = {
  title: 'Entrada/Passos pendentes',
  parameters: { layout: 'fullscreen' },
};
export default meta;

type HistoriaDoCodigo = StoryObj<{
  aoMandar: Mock<PropsDoPassoDoCodigo['aoMandar']>;
  aoSair: Mock<() => void>;
  diasDeConfianca?: number;
}>;

const doCodigo = {
  args: { aoMandar: fn(async () => ({ ok: true }) as const), aoSair: fn() },
  render: ({ aoMandar, aoSair, diasDeConfianca }) => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <PassoDoCodigo aoMandar={aoMandar} aoSair={aoSair} diasDeConfianca={diasDeConfianca} />
    </TelaDeEntrada>
  ),
} satisfies HistoriaDoCodigo;

const CONFIAR = 'Confiar neste aparelho por 30 dias';
const EXPLICACAO =
  'Nas próximas entradas neste navegador, só a senha. O Cofre continua pedindo o código.';

export const CodigoDoApp: HistoriaDoCodigo = {
  ...doCodigo,
  play: async ({ canvasElement, args: { aoMandar } }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('heading', { name: 'Verificação em dois passos' })).toBeVisible();
    const campo = tela.getByLabelText('Código do app');
    await expect(campo).toHaveFocus();
    await expect(campo).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(campo).toHaveAttribute('inputmode', 'numeric');
    await userEvent.type(campo, '123456{Enter}');
    await expect(aoMandar).toHaveBeenCalledTimes(1);
    await expect(aoMandar).toHaveBeenCalledWith('123456', { confiar: false });
    // Sem o prazo da confiança, a caixa não aparece.
    await expect(tela.queryByRole('checkbox')).toBeNull();
  },
};

export const CodigoDeRecuperacao: HistoriaDoCodigo = {
  ...doCodigo,
  play: async ({ canvasElement, args: { aoMandar } }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Usar um código de recuperação' }));
    const campo = tela.getByLabelText('Código de recuperação');
    await expect(campo).toHaveFocus();
    await expect(tela.queryByLabelText('Código do app')).toBeNull();
    await userEvent.type(campo, 'a7k2m-9qx4t{Enter}');
    await expect(aoMandar).toHaveBeenCalledWith('a7k2m-9qx4t', { confiar: false });
    await userEvent.click(tela.getByRole('button', { name: 'Usar o código do app' }));
    await expect(tela.getByLabelText('Código do app')).toHaveFocus();
  },
};

export const CodigoRecusado: HistoriaDoCodigo = {
  ...doCodigo,
  args: { aoMandar: fn(async () => ({ erro: 'Código incorreto.' })), aoSair: fn() },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.type(tela.getByLabelText('Código do app'), '000000{Enter}');
    await expect(await tela.findByRole('alert')).toHaveTextContent('Código incorreto.');
    await expect(tela.getByLabelText('Código do app')).toHaveValue('');
    await expect(tela.getByLabelText('Código do app')).toHaveFocus();
  },
};

// Spec tela-de-entrada, "Passos pendentes na tela" (change aparelho-confiavel, design, decisão 6).
export const CaixaDoAparelhoConfiavel: HistoriaDoCodigo = {
  ...doCodigo,
  args: { ...doCodigo.args, diasDeConfianca: 30 },
  play: async ({ canvasElement, args: { aoMandar } }) => {
    const tela = within(canvasElement);
    const caixa = tela.getByRole('checkbox', { name: CONFIAR });
    await expect(caixa).not.toBeChecked();
    await expect(caixa).toHaveAccessibleDescription(EXPLICACAO);
    await expect(tela.getByText(EXPLICACAO)).toBeVisible();
    // O código continua com o foco: a caixa é escolha de quem quer.
    await expect(tela.getByLabelText('Código do app')).toHaveFocus();
    await userEvent.click(caixa);
    await expect(caixa).toBeChecked();
    await userEvent.type(tela.getByLabelText('Código do app'), '123456{Enter}');
    await expect(aoMandar).toHaveBeenCalledWith('123456', { confiar: true });
  },
};

export const AparelhoConfiavelPorUmDia: HistoriaDoCodigo = {
  ...doCodigo,
  args: { ...doCodigo.args, diasDeConfianca: 1 },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('checkbox', { name: 'Confiar neste aparelho por 1 dia' }),
    ).toBeVisible();
  },
};

export const PrazoZero: HistoriaDoCodigo = {
  ...doCodigo,
  args: { ...doCodigo.args, diasDeConfianca: 0 },
  play: async ({ canvasElement, args: { aoMandar } }) => {
    const tela = within(canvasElement);
    await expect(tela.queryByRole('checkbox')).toBeNull();
    await expect(tela.queryByText(EXPLICACAO)).toBeNull();
    await userEvent.type(tela.getByLabelText('Código do app'), '123456{Enter}');
    await expect(aoMandar).toHaveBeenCalledWith('123456', { confiar: false });
  },
};

export const CodigoDeRecuperacaoSemACaixa: HistoriaDoCodigo = {
  ...doCodigo,
  args: { ...doCodigo.args, diasDeConfianca: 30 },
  play: async ({ canvasElement, args: { aoMandar } }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('checkbox', { name: CONFIAR }));
    await userEvent.click(tela.getByRole('button', { name: 'Usar um código de recuperação' }));
    await expect(tela.queryByRole('checkbox')).toBeNull();
    await expect(tela.queryByText(EXPLICACAO)).toBeNull();
    // A marca de antes não vai com o código de recuperação.
    await userEvent.type(tela.getByLabelText('Código de recuperação'), 'a7k2m-9qx4t{Enter}');
    await expect(aoMandar).toHaveBeenCalledWith('a7k2m-9qx4t', { confiar: false });
    // De volta ao código do app, a caixa volta, como estava.
    await userEvent.click(tela.getByRole('button', { name: 'Usar o código do app' }));
    await expect(tela.getByRole('checkbox', { name: CONFIAR })).toBeChecked();
  },
};

export const SairDoCodigo: HistoriaDoCodigo = {
  ...doCodigo,
  play: async ({ canvasElement, args: { aoSair } }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Sair' }));
    await expect(aoSair).toHaveBeenCalledTimes(1);
  },
};

type HistoriaDaSenha = StoryObj<{
  aoTrocar: Mock<PropsDoPassoDaSenhaNova['aoTrocar']>;
  aoSair: Mock<() => void>;
  senhaAtual?: string;
}>;

/** A regra de exemplo: a mesma frase da regra do domínio para o caso curto. */
const avaliarSenha = (senha: string) =>
  [...senha].length < 12 ? 'Use pelo menos 12 caracteres.' : null;

const daSenha = {
  args: {
    aoTrocar: fn(async () => ({ ok: true }) as const),
    aoSair: fn(),
    senhaAtual: 'K7Q2-M9XA-4TPE-W3RZ',
  },
  render: ({ aoTrocar, aoSair, senhaAtual }) => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <PassoDaSenhaNova
        aoTrocar={aoTrocar}
        aoSair={aoSair}
        senhaAtual={senhaAtual}
        avaliarSenha={avaliarSenha}
      />
    </TelaDeEntrada>
  ),
} satisfies HistoriaDaSenha;

export const SenhaNova: HistoriaDaSenha = {
  ...daSenha,
  play: async ({ canvasElement, args: { aoTrocar } }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('heading', { name: 'Crie a sua senha' })).toBeVisible();
    const nova = tela.getByLabelText('Senha nova');
    await expect(nova).toHaveFocus();
    await expect(nova).toHaveAccessibleDescription(
      'Use pelo menos 12 caracteres. Uma frase longa é uma boa senha.',
    );
    await expect(tela.queryByLabelText('Senha temporária')).toBeNull();
    await userEvent.type(nova, 'girafa azul no telhado');
    await userEvent.type(
      tela.getByLabelText('Confirmar a senha nova'),
      'girafa azul no telhado{Enter}',
    );
    await expect(aoTrocar).toHaveBeenCalledWith({
      senhaAtual: 'K7Q2-M9XA-4TPE-W3RZ',
      senhaNova: 'girafa azul no telhado',
    });
  },
};

export const SenhasDiferentes: HistoriaDaSenha = {
  ...daSenha,
  play: async ({ canvasElement, args: { aoTrocar } }) => {
    const tela = within(canvasElement);
    await userEvent.type(tela.getByLabelText('Senha nova'), 'girafa azul no telhado');
    await userEvent.type(
      tela.getByLabelText('Confirmar a senha nova'),
      'girafa verde no telhado{Enter}',
    );
    await expect(tela.getByLabelText('Confirmar a senha nova')).toHaveAccessibleDescription(
      'As senhas não são iguais.',
    );
    await expect(aoTrocar).not.toHaveBeenCalled();
  },
};

export const RegraAntesDeEnviar: HistoriaDaSenha = {
  ...daSenha,
  play: async ({ canvasElement, args: { aoTrocar } }) => {
    const tela = within(canvasElement);
    await userEvent.type(tela.getByLabelText('Senha nova'), 'curta123');
    await userEvent.type(tela.getByLabelText('Confirmar a senha nova'), 'curta123{Enter}');
    // A regra continua à vista, e o motivo da recusa vem logo depois dela.
    await expect(tela.getByLabelText('Senha nova')).toHaveAccessibleDescription(
      /boa senha\. Use pelo menos 12 caracteres\.$/,
    );
    await expect(aoTrocar).not.toHaveBeenCalled();
  },
};

export const RecusaDaApiNoCampo: HistoriaDaSenha = {
  ...daSenha,
  args: {
    ...daSenha.args,
    aoTrocar: fn(async () => ({
      erro: 'A senha não pode conter o seu usuário.',
      campo: 'senhaNova' as const,
    })),
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.type(tela.getByLabelText('Senha nova'), 'ana.souza para sempre');
    await userEvent.type(
      tela.getByLabelText('Confirmar a senha nova'),
      'ana.souza para sempre{Enter}',
    );
    await waitFor(() =>
      expect(tela.getByLabelText('Senha nova')).toHaveAccessibleDescription(
        /A senha não pode conter o seu usuário\.$/,
      ),
    );
  },
};

/** Depois de recarregar a página no meio da entrada, a senha temporária já não está na memória. */
export const PedeASenhaTemporaria: HistoriaDaSenha = {
  ...daSenha,
  args: { ...daSenha.args, senhaAtual: undefined },
  play: async ({ canvasElement, args: { aoTrocar } }) => {
    const tela = within(canvasElement);
    const temporaria = tela.getByLabelText('Senha temporária');
    await expect(temporaria).toHaveFocus();
    await userEvent.type(temporaria, 'K7Q2-M9XA-4TPE-W3RZ');
    await userEvent.type(tela.getByLabelText('Senha nova'), 'girafa azul no telhado');
    await userEvent.type(
      tela.getByLabelText('Confirmar a senha nova'),
      'girafa azul no telhado{Enter}',
    );
    await expect(aoTrocar).toHaveBeenCalledWith({
      senhaAtual: 'K7Q2-M9XA-4TPE-W3RZ',
      senhaNova: 'girafa azul no telhado',
    });
  },
};

export const SairDaSenhaNova: HistoriaDaSenha = {
  ...daSenha,
  play: async ({ canvasElement, args: { aoSair } }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Sair' }));
    await expect(aoSair).toHaveBeenCalledTimes(1);
  },
};

/** O passo do código como abre, sem interação: a referência da regressão visual. */
export const VistaDoCodigo: HistoriaDoCodigo = { ...doCodigo, decorators: [comTelaPorTras] };

/** O passo da senha nova como abre, com a regra à vista: a referência da regressão visual. */
export const VistaDaSenhaNova: HistoriaDaSenha = { ...daSenha, decorators: [comTelaPorTras] };
