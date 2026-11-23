import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { LugarDeSoltar, useArquivosSoltos } from './LugarDeSoltar.tsx';

/** A caixa de dentro, que recebe os arquivos soltos e os mostra; ocupada, como no envio, não recebe. */
function CaixaQueRecebe({ ocupada }: { ocupada: boolean }) {
  const [recebidos, definirRecebidos] = useState<string[]>([]);
  useArquivosSoltos(
    ocupada
      ? null
      : (arquivos) => definirRecebidos((antes) => [...antes, ...arquivos.map(({ name }) => name)]),
  );
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <textarea aria-label="Escrever uma mensagem em Equipe Financeiro" rows={2} />
      <ul aria-label="Anexos da mensagem" style={{ margin: 0 }}>
        {recebidos.map((nome) => (
          <li key={nome}>{nome}</li>
        ))}
      </ul>
    </div>
  );
}

interface PropsDaConversa {
  /** Sem a caixa, como no canal em que a conta não escreve. */
  comCaixa: boolean;
  /** A caixa ocupada, como durante o envio. */
  ocupada: boolean;
}

function Conversa({ comCaixa, ocupada }: PropsDaConversa) {
  return (
    <LugarDeSoltar>
      <section
        aria-label="Conversa"
        style={{
          display: 'grid',
          alignContent: 'space-between',
          gap: 16,
          padding: 16,
          height: 320,
        }}
      >
        <p style={{ margin: 0 }}>
          Paulo Nunes: A impressora do 2º andar está manchando a folha. Mandei a foto.
        </p>
        {comCaixa ? <CaixaQueRecebe ocupada={ocupada} /> : <p>Só TI escreve neste canal.</p>}
      </section>
    </LugarDeSoltar>
  );
}

const meta: Meta<typeof Conversa> = {
  title: 'Componentes/Lugar de soltar',
  component: Conversa,
  args: { comCaixa: true, ocupada: false },
  decorators: [
    (Historia) => (
      <div style={{ maxWidth: 560 }}>
        <Historia />
      </div>
    ),
  ],
};
export default meta;

type Historia = StoryObj<typeof Conversa>;

type Arrasto = 'dragenter' | 'dragover' | 'dragleave' | 'drop';

/**
 * O arrasto que chega ao elemento, como o do navegador: os arquivos do computador, ou o texto
 * selecionado. Devolve se alguém o tratou.
 */
function arrastar(alvo: Element, tipo: Arrasto, conteudo: File[] | string) {
  const dados = new DataTransfer();
  if (typeof conteudo === 'string') dados.setData('text/plain', conteudo);
  else {
    for (const arquivo of conteudo) dados.items.add(arquivo);
    // O arquivo do computador tem a entrada dele no sistema de arquivos, que o React Aria lê para
    // separar os arquivos das pastas; o criado aqui não tem, e o Chromium a dá como nula.
    Object.defineProperty(dados, 'items', {
      value: conteudo.map((arquivo) => ({
        kind: 'file',
        type: arquivo.type,
        getAsFile: () => arquivo,
        webkitGetAsEntry: () => ({ isFile: true, isDirectory: false }),
      })),
    });
  }
  // O arrasto do computador permite copiar; o `DataTransfer` criado aqui não é de arrastar, e o
  // Chromium o deixa em "none", que o React Aria lê como o arrasto que não se solta.
  Object.defineProperty(dados, 'effectAllowed', { value: 'all' });
  const { left, top, width, height } = alvo.getBoundingClientRect();
  const evento = new DragEvent(tipo, {
    bubbles: true,
    cancelable: true,
    dataTransfer: dados,
    clientX: left + width / 2,
    clientY: top + height / 2,
  });
  alvo.dispatchEvent(evento);
  return evento.defaultPrevented;
}

const relatorio = () => new File(['%PDF-1.7'], 'relatorio.pdf', { type: 'application/pdf' });
const foto = () => new File(['x'], 'folha-manchada.jpg', { type: 'image/jpeg' });

/** Os arquivos sobre a conversa mostram "Solte para anexar", e soltos vão à caixa, na ordem. */
export const SoltarNaConversa: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixa = tela.getByRole('textbox', { name: 'Escrever uma mensagem em Equipe Financeiro' });
    const texto = tela.getByText(/Paulo Nunes/);
    await expect(tela.queryByText('Solte para anexar')).toBeNull();

    // Sobre o texto da conversa, e não só sobre a caixa.
    await expect(arrastar(texto, 'dragenter', [relatorio(), foto()])).toBe(true);
    await expect(arrastar(texto, 'dragover', [relatorio(), foto()])).toBe(true);
    await expect(await tela.findByText('Solte para anexar')).toBeVisible();
    // O aviso cobre a conversa, e o ponteiro passa por ele até o que está embaixo.
    const { left, top, width, height } = caixa.getBoundingClientRect();
    await expect(document.elementFromPoint(left + width / 2, top + height / 2)).toBe(caixa);

    await expect(arrastar(texto, 'drop', [relatorio(), foto()])).toBe(true);
    const anexos = tela.getByRole('list', { name: 'Anexos da mensagem' });
    await waitFor(() =>
      expect(
        within(anexos)
          .getAllByRole('listitem')
          .map(({ textContent }) => textContent),
      ).toEqual(['relatorio.pdf', 'folha-manchada.jpg']),
    );
    await expect(tela.queryByText('Solte para anexar')).toBeNull();
  },
};

/** O arquivo que sai da conversa sem ser solto tira o aviso, e nada entra. */
export const ArrastoQueSai: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixa = tela.getByRole('textbox', { name: 'Escrever uma mensagem em Equipe Financeiro' });
    arrastar(caixa, 'dragenter', [relatorio()]);
    await expect(await tela.findByText('Solte para anexar')).toBeVisible();
    arrastar(caixa, 'dragleave', [relatorio()]);
    await waitFor(() => expect(tela.queryByText('Solte para anexar')).toBeNull());
    await expect(tela.queryAllByRole('listitem')).toHaveLength(0);
  },
};

/**
 * O texto arrastado segue para a caixa, como o navegador faz: o lugar não o trata nem mostra o
 * aviso.
 */
export const TextoArrastado: Historia = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixa = tela.getByRole('textbox', { name: 'Escrever uma mensagem em Equipe Financeiro' });
    await expect(arrastar(caixa, 'dragenter', 'Mandei a foto.')).toBe(false);
    await expect(arrastar(caixa, 'dragover', 'Mandei a foto.')).toBe(false);
    await expect(tela.queryByText('Solte para anexar')).toBeNull();
    await expect(arrastar(caixa, 'drop', 'Mandei a foto.')).toBe(false);
  },
};

/**
 * Sem a caixa, como no canal em que a conta não escreve, o lugar não recebe: o arquivo fica para a
 * guarda da casca, que o segura com o cursor de que não se solta.
 */
export const SemACaixa: Historia = {
  args: { comCaixa: false },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const frase = tela.getByText('Só TI escreve neste canal.');
    await expect(arrastar(frase, 'dragenter', [relatorio()])).toBe(false);
    await expect(arrastar(frase, 'dragover', [relatorio()])).toBe(false);
    await expect(tela.queryByText('Solte para anexar')).toBeNull();
  },
};

/** Durante o envio, a caixa não recebe, e o arquivo solto não entra. */
export const DuranteOEnvio: Historia = {
  args: { ocupada: true },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const caixa = tela.getByRole('textbox', { name: 'Escrever uma mensagem em Equipe Financeiro' });
    await expect(arrastar(caixa, 'dragover', [relatorio()])).toBe(false);
    await expect(tela.queryByText('Solte para anexar')).toBeNull();
    arrastar(caixa, 'drop', [relatorio()]);
    await expect(tela.queryAllByRole('listitem')).toHaveLength(0);
  },
};
