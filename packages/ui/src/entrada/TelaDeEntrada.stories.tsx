import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, type Mock, userEvent, waitFor, within } from 'storybook/test';
import { comTelaPorTras } from '../teste/tela.tsx';
import { EnderecoDesconhecido } from './EnderecoDesconhecido.tsx';
import {
  PassoDasCredenciais,
  type PropsDoPasso,
  type ResultadoDoPasso,
} from './PassoDasCredenciais.tsx';
import { PassoDoCodigo } from './PassoDoCodigo.tsx';
import { TelaDeEntrada } from './TelaDeEntrada.tsx';

const meta: Meta = {
  title: 'Entrada/Tela de entrada',
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Historia = StoryObj;

/** Uma resposta que o teste libera quando quer, para ver a tela no meio do envio. */
function respostaPendente() {
  let liberar: (resultado: ResultadoDoPasso) => void = () => {};
  const promessa = new Promise<ResultadoDoPasso>((resolver) => {
    liberar = resolver;
  });
  return { promessa, liberar };
}

export const Credenciais: Historia = {
  tags: ['captura'],
  decorators: [comTelaPorTras],
  render: function Render() {
    return (
      <TelaDeEntrada organizacao="Empresa de exemplo">
        <PassoDasCredenciais aoEntrar={fn(async () => ({ ok: true }) as const)} />
      </TelaDeEntrada>
    );
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('Empresa de exemplo')).toBeVisible();
    await expect(tela.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await expect(tela.getByLabelText('Usuário')).toHaveFocus();
    await expect(tela.getByLabelText('Usuário')).toHaveAttribute('autocomplete', 'username');
    await expect(tela.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
    await expect(tela.queryByText('Ambiente de teste')).toBeNull();
  },
};

/** No ambiente de teste, o aviso vem acima do formulário: o ícone, o texto e a frase. */
export const NoAmbienteDeTeste: Historia = {
  decorators: [comTelaPorTras],
  render: function Render() {
    return (
      <TelaDeEntrada organizacao="Empresa de exemplo" ambienteDeTeste>
        <PassoDasCredenciais aoEntrar={fn(async () => ({ ok: true }) as const)} />
      </TelaDeEntrada>
    );
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const aviso = tela.getByText('Ambiente de teste');
    await expect(aviso).toBeVisible();
    await expect(
      tela.getByText(
        'Os dados são uma cópia da produção. O que mudar aqui não vai para a produção.',
      ),
    ).toBeVisible();
    const usuario = tela.getByLabelText('Usuário');
    await expect(
      aviso.compareDocumentPosition(usuario) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(usuario).toHaveFocus();
  },
};

export const EnviaUmaVezComEnter: StoryObj<{ aoEntrar: Mock<PropsDoPasso['aoEntrar']> }> = {
  args: { aoEntrar: fn() },
  render: ({ aoEntrar }) => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <PassoDasCredenciais aoEntrar={aoEntrar} />
    </TelaDeEntrada>
  ),
  play: async ({ canvasElement, args: { aoEntrar } }) => {
    const tela = within(canvasElement);
    const resposta = respostaPendente();
    aoEntrar.mockImplementation(() => resposta.promessa);
    await userEvent.type(tela.getByLabelText('Usuário'), 'ana.souza');
    await userEvent.type(tela.getByLabelText('Senha'), 'cavalo bateria grampo correto{Enter}');
    await expect(aoEntrar).toHaveBeenCalledTimes(1);
    await expect(aoEntrar).toHaveBeenCalledWith({
      usuario: 'ana.souza',
      senha: 'cavalo bateria grampo correto',
    });
    await expect(tela.getByRole('button', { name: /Entrar/ })).toHaveAttribute(
      'data-pending',
      'true',
    );
    await userEvent.keyboard('{Enter}');
    await expect(aoEntrar).toHaveBeenCalledTimes(1);
    resposta.liberar({ ok: true });
    await waitFor(() =>
      expect(tela.getByRole('button', { name: 'Entrar' })).not.toHaveAttribute('data-pending'),
    );
  },
};

export const SessaoQueTerminou: Historia = {
  tags: ['captura'],
  decorators: [comTelaPorTras],
  render: () => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <PassoDasCredenciais
        usuarioInicial="ana.souza"
        aviso="Sua sessão terminou. Entre de novo para continuar."
        aoEntrar={fn(async () => ({ ok: true }) as const)}
      />
    </TelaDeEntrada>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(
      tela.getByText('Sua sessão terminou. Entre de novo para continuar.'),
    ).toBeVisible();
    await expect(tela.getByLabelText('Usuário')).toHaveValue('ana.souza');
    await expect(tela.getByLabelText('Senha')).toHaveFocus();
  },
};

export const Recusa: Historia = {
  render: () => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <PassoDasCredenciais
        aoEntrar={fn(async () => ({ erro: 'Usuário ou senha incorretos.', limparSenha: true }))}
      />
    </TelaDeEntrada>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.type(tela.getByLabelText('Usuário'), 'ana.souza');
    await userEvent.type(tela.getByLabelText('Senha'), 'senha errada{Enter}');
    await expect(await tela.findByRole('alert')).toHaveTextContent('Usuário ou senha incorretos.');
    await expect(tela.getByLabelText('Senha')).toHaveValue('');
    await expect(tela.getByLabelText('Senha')).toHaveFocus();
    await expect(tela.getByLabelText('Usuário')).toHaveValue('ana.souza');
  },
};

const MENSAGENS = [
  'Muitas tentativas com este usuário. Tente de novo em 2 min.',
  'Sem conexão com o servidor. Tente de novo.',
  'Não foi possível entrar. Informe à TI o código R7K2-9QXM.',
];

/** As outras recusas mantêm a senha digitada: não foi ela que falhou. */
export const OutrasMensagens: Historia = {
  render: function Render() {
    let vez = 0;
    return (
      <TelaDeEntrada organizacao="Empresa de exemplo">
        <PassoDasCredenciais aoEntrar={async () => ({ erro: MENSAGENS[vez++] ?? '' })} />
      </TelaDeEntrada>
    );
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.type(tela.getByLabelText('Usuário'), 'ana.souza');
    await userEvent.type(tela.getByLabelText('Senha'), 'cavalo bateria grampo correto');
    for (const mensagem of MENSAGENS) {
      await userEvent.click(tela.getByRole('button', { name: 'Entrar' }));
      await waitFor(() => expect(tela.getByRole('alert')).toHaveTextContent(mensagem));
      await expect(tela.getByLabelText('Senha')).toHaveValue('cavalo bateria grampo correto');
    }
  },
};

export const EsqueciMinhaSenha: Historia = {
  render: () => (
    <TelaDeEntrada organizacao="Empresa de exemplo">
      <PassoDasCredenciais aoEntrar={fn(async () => ({ ok: true }) as const)} />
    </TelaDeEntrada>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const botao = tela.getByRole('button', { name: 'Esqueci minha senha' });
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(botao);
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    await expect(tela.getByText('Peça à TI para redefinir a sua senha.')).toBeVisible();
  },
};

export const EnderecoQueNinguemRegistrou: Historia = {
  tags: ['captura'],
  decorators: [comTelaPorTras],
  render: () => (
    <TelaDeEntrada>
      <EnderecoDesconhecido />
    </TelaDeEntrada>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(
      tela.getByText(
        'Este endereço não está ligado a nenhuma organização do Grafite. Confira o endereço com a TI.',
      ),
    ).toBeVisible();
    await expect(tela.queryByRole('textbox')).toBeNull();
    await expect(tela.queryByLabelText('Senha')).toBeNull();
  },
};

export const NoCelular: Historia = {
  ...Credenciais,
  globals: { viewport: { value: 'celular390', isRotated: false } },
  play: async ({ canvasElement }) => {
    const raiz = canvasElement.ownerDocument.documentElement;
    await expect(raiz.scrollWidth).toBeLessThanOrEqual(raiz.clientWidth);
  },
};

/**
 * No primeiro acesso, a entrada espera atrás das boas-vindas: invisível, fora do alcance do
 * teclado e sem o passo. Quando a chegada passa à entrada, o passo aparece com o foco no usuário.
 */
export const AtrasDasBoasVindas: Historia = {
  decorators: [
    (Historia) => {
      document.documentElement.setAttribute('data-chegada', 'boas-vindas');
      return <Historia />;
    },
  ],
  render: Credenciais.render,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const entrada = canvasElement.querySelector('[data-tela-de-entrada]') as HTMLElement;
    await expect(entrada).toHaveAttribute('inert');
    await expect(getComputedStyle(entrada).visibility).toBe('hidden');
    await expect(tela.queryByLabelText('Usuário')).toBeNull();
    document.documentElement.setAttribute('data-chegada', 'entrada');
    await waitFor(() => expect(tela.getByLabelText('Usuário')).toHaveFocus());
    await expect(entrada).not.toHaveAttribute('inert');
    await expect(getComputedStyle(entrada).visibility).toBe('visible');
    document.documentElement.removeAttribute('data-chegada');
  },
};

/** Uma entrada que passa ao código quando as credenciais são aceitas. */
function EntradaComDoisPassos() {
  const [passo, definirPasso] = useState<'credenciais' | 'codigo'>('credenciais');
  return (
    <TelaDeEntrada organizacao="Empresa de exemplo" passo={passo}>
      {passo === 'credenciais' ? (
        <PassoDasCredenciais
          aoEntrar={async () => {
            definirPasso('codigo');
            return { ok: true };
          }}
        />
      ) : (
        <PassoDoCodigo aoMandar={fn(async () => ({ ok: true }) as const)} aoSair={fn()} />
      )}
    </TelaDeEntrada>
  );
}

/**
 * A troca entre os passos é só de opacidade: o primeiro passo já nasce no lugar, e o seguinte
 * aparece por opacidade, sem nada se deslocar, também com o movimento reduzido.
 */
export const TrocaDePassoPorOpacidade: Historia = {
  render: () => <EntradaComDoisPassos />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const primeiro = tela.getByRole('heading', { name: 'Entrar' });
    await expect(getComputedStyle(primeiro).animationName).toBe('none');
    await userEvent.type(tela.getByLabelText('Usuário'), 'ana.souza');
    await userEvent.type(tela.getByLabelText('Senha'), 'cavalo bateria grampo{Enter}');
    const seguinte = await tela.findByRole('heading', { name: 'Verificação em dois passos' });
    const estilo = getComputedStyle(seguinte);
    await expect(estilo.animationName).toContain('aparecer');
    await expect(estilo.animationDuration).toBe('0.12s');
    await expect(estilo.transform).toBe('none');
  },
};
