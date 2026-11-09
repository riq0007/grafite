import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Botao } from '../botao/Botao.tsx';
import { CampoDeTexto } from '../campo/CampoDeTexto.tsx';
import { Dialogo } from './Dialogo.tsx';
import { Gaveta } from './Gaveta.tsx';

const meta: Meta = { title: 'Componentes/Diálogo e gaveta' };
export default meta;

type Historia = StoryObj;

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

function DarBaixa() {
  return (
    <Dialogo
      alerta
      titulo="Dar baixa no ativo?"
      gatilho={<Botao nivel="destrutivo">Dar baixa</Botao>}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao nivel="destrutivo" onPress={fechar}>
            Dar baixa
          </Botao>
        </>
      )}
    >
      <p style={{ margin: 0 }}>
        O ativo PAT-00412 sai do inventário e a baixa entra no histórico. Não dá para desfazer.
      </p>
      <CampoDeTexto rotulo="Motivo da baixa" />
    </Dialogo>
  );
}

/** Tab repetido não sai da camada aberta. */
async function conferirFocoPreso(camada: HTMLElement, vezes = 6) {
  for (let i = 0; i < vezes; i++) {
    await userEvent.tab();
    await expect(camada.contains(document.activeElement)).toBe(true);
  }
}

/**
 * Um diálogo aberto por fora, sem gatilho, como a confirmação ao sair de uma tela com mudanças:
 * quem o abre decide quando, e o foco volta para onde estava quando ele fecha.
 */
function SairSemSalvar({ aoDescartar }: { aoDescartar: () => void }) {
  const [aberto, definirAberto] = useState(false);
  return (
    <>
      <Botao onPress={() => definirAberto(true)}>Ir para outra tela</Botao>
      <Dialogo
        alerta
        titulo="Descartar as mudanças?"
        aberto={aberto}
        aoMudarAberto={definirAberto}
        acoes={(fechar) => (
          <>
            <Botao onPress={fechar}>Continuar editando</Botao>
            <Botao
              nivel="destrutivo"
              onPress={() => {
                aoDescartar();
                fechar();
              }}
            >
              Descartar mudanças
            </Botao>
          </>
        )}
      >
        <p style={{ margin: 0 }}>As mudanças que não foram salvas saem.</p>
      </Dialogo>
    </>
  );
}

export const DialogoSemGatilho: StoryObj<{ aoDescartar: () => void }> = {
  args: { aoDescartar: fn() },
  render: (args) => <SairSemSalvar aoDescartar={args.aoDescartar} />,
  play: async ({ args, canvasElement }) => {
    const abrir = within(canvasElement).getByRole('button', { name: 'Ir para outra tela' });
    await userEvent.click(abrir);
    const dialogo = await corpoDe(canvasElement).findByRole('alertdialog', {
      name: 'Descartar as mudanças?',
    });
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(abrir).toHaveFocus());
    await userEvent.click(abrir);
    const deNovo = await corpoDe(canvasElement).findByRole('alertdialog');
    await userEvent.click(within(deNovo).getByRole('button', { name: 'Descartar mudanças' }));
    await expect(args.aoDescartar).toHaveBeenCalledOnce();
  },
};

/** Cenário da spec: Esc fecha o diálogo e o foco volta ao botão que o abriu. */
export const DialogoFechaComEsc: Historia = {
  render: () => <DarBaixa />,
  play: async ({ canvasElement }) => {
    const gatilho = within(canvasElement).getByRole('button', { name: 'Dar baixa' });
    await userEvent.click(gatilho);
    const dialogo = await corpoDe(canvasElement).findByRole('alertdialog', {
      name: 'Dar baixa no ativo?',
    });
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
    await conferirFocoPreso(dialogo);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(gatilho).toHaveFocus());
  },
};

/** "Cancelar" fecha; clicar fora não fecha uma confirmação (a decisão é explícita). */
export const DialogoSoFechaPorDecisao: Historia = {
  render: () => <DarBaixa />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const gatilho = within(canvasElement).getByRole('button', { name: 'Dar baixa' });
    await userEvent.click(gatilho);
    const dialogo = await corpo.findByRole('alertdialog');
    await userEvent.click(canvasElement.ownerDocument.body);
    await expect(corpo.queryByRole('alertdialog')).not.toBeNull();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(corpo.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(gatilho).toHaveFocus());
  },
};

/**
 * Um diálogo que muda depois da ação, como o que passa a mostrar a senha temporária, e que avisa
 * quando fecha, por qualquer caminho.
 */
function GerarCodigo({ aoFechar }: { aoFechar: () => void }) {
  const [aberto, definirAberto] = useState(false);
  const [codigo, definirCodigo] = useState<string | null>(null);
  return (
    <Dialogo
      titulo={codigo ? 'Código gerado' : 'Gerar um código de acesso?'}
      gatilho={<Botao>Gerar código</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        if (abrir) return;
        definirCodigo(null);
        aoFechar();
      }}
      acoes={(fechar) =>
        codigo ? (
          <Botao nivel="primario" onPress={fechar}>
            Concluir
          </Botao>
        ) : (
          <>
            <Botao onPress={fechar}>Cancelar</Botao>
            <Botao nivel="primario" onPress={() => definirCodigo('7F3K-92QX')}>
              Gerar
            </Botao>
          </>
        )
      }
    >
      <p style={{ margin: 0 }}>
        {codigo ? `O código é ${codigo}. Ele não aparece de novo.` : 'O código vale por um dia.'}
      </p>
    </Dialogo>
  );
}

/** Aberto por fora: o título e as ações mudam com a etapa, e o fechamento é avisado. */
export const DialogoAbertoPorFora: StoryObj<{ aoFechar: () => void }> = {
  args: { aoFechar: fn() },
  render: (args) => <GerarCodigo {...args} />,
  play: async ({ canvasElement, args }) => {
    const corpo = corpoDe(canvasElement);
    const gatilho = within(canvasElement).getByRole('button', { name: 'Gerar código' });
    await userEvent.click(gatilho);
    const dialogo = await corpo.findByRole('dialog', { name: 'Gerar um código de acesso?' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Gerar' }));
    // A entrada começa transparente: sem um quadro desenhado, o véu ainda está invisível.
    const gerado = await corpo.findByRole('dialog', { name: 'Código gerado' });
    await waitFor(() => expect(gerado).toBeVisible());
    await expect(within(dialogo).getByText(/7F3K-92QX/)).toBeVisible();
    await expect(args.aoFechar).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await expect(args.aoFechar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(gatilho).toHaveFocus());
    // Reaberto, o diálogo volta à primeira etapa; a entrada começa transparente.
    await userEvent.click(gatilho);
    await waitFor(() =>
      expect(corpo.getByRole('dialog', { name: 'Gerar um código de acesso?' })).toBeVisible(),
    );
  },
};

function DetalhesDoAtivo() {
  return (
    <Gaveta titulo="PAT-00412 · HP LaserJet M404dn" gatilho={<Botao>Detalhes</Botao>}>
      <CampoDeTexto rotulo="Local" defaultValue="Almoxarifado · Jundiaí" />
      <CampoDeTexto rotulo="Responsável" defaultValue="Equipe de TI" />
    </Gaveta>
  );
}

/** A gaveta prende o foco, fecha com Esc e devolve o foco ao gatilho. */
export const GavetaFechaComEsc: Historia = {
  render: () => <DetalhesDoAtivo />,
  play: async ({ canvasElement }) => {
    const gatilho = within(canvasElement).getByRole('button', { name: 'Detalhes' });
    await userEvent.click(gatilho);
    const gaveta = await corpoDe(canvasElement).findByRole('dialog', {
      name: 'PAT-00412 · HP LaserJet M404dn',
    });
    await waitFor(() => expect(gaveta.contains(document.activeElement)).toBe(true));
    await conferirFocoPreso(gaveta);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(gatilho).toHaveFocus());
  },
};

/** A gaveta tem botão de fechar e fecha ao clicar fora dela. */
export const GavetaFechaPeloBotaoEAoClicarFora: Historia = {
  render: () => <DetalhesDoAtivo />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const gatilho = within(canvasElement).getByRole('button', { name: 'Detalhes' });
    await userEvent.click(gatilho);
    const gaveta = await corpo.findByRole('dialog');
    await userEvent.click(within(gaveta).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
    await userEvent.click(gatilho);
    await corpo.findByRole('dialog');
    await userEvent.pointer({ keys: '[MouseLeft]', coords: { clientX: 8, clientY: 8 } });
    await waitFor(() => expect(corpo.queryByRole('dialog')).toBeNull());
  },
};
