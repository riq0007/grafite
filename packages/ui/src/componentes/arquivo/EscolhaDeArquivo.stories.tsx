import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { esvaziarOAnunciador } from '../../teste/anunciador.ts';
import {
  type ArquivoDaEscolha,
  EscolhaDeArquivo,
  FORMATOS_DE_ARQUIVO,
  LIMITE_DOS_ARQUIVOS,
} from './EscolhaDeArquivo.tsx';

const meta: Meta<typeof EscolhaDeArquivo> = {
  title: 'Componentes/Escolha de arquivo',
  component: EscolhaDeArquivo,
};
export default meta;

type Historia = StoryObj<typeof EscolhaDeArquivo>;

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

/** O campo de arquivo escondido que "Enviar arquivo" e "Trocar" abrem. */
const campoDeArquivo = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('input[type="file"]') as HTMLInputElement;

/** A área do arquivo, onde se solta um arquivo. */
const areaDoArquivo = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[data-area-do-arquivo]') as HTMLElement;

const NOTA: ArquivoDaEscolha = {
  nome: 'nota-fiscal-1234.pdf',
  bytes: 240 * 1024,
  endereco: '/api/ativos/a1/campos/c1/arquivo/f1/completa',
};

const PDF = () => new File(['%PDF-1.7'], 'laudo.pdf', { type: 'application/pdf' });

/** Um arquivo do tamanho dado, sem ocupar a memória: só o tamanho é lido antes do envio. */
const comTamanho = (nome: string, bytes: number) => {
  const arquivo = new File(['x'], nome, { type: 'application/zip' });
  Object.defineProperty(arquivo, 'size', { value: bytes });
  return arquivo;
};

/**
 * Solta os arquivos na área, como o navegador faz quando se arrasta do computador, com a entrada do
 * sistema de arquivos simulada, que o React Aria usa para saber que é um arquivo.
 */
function soltar(area: HTMLElement, arquivos: File[]) {
  const transferencia = new DataTransfer();
  transferencia.effectAllowed = 'all';
  for (const arquivo of arquivos) transferencia.items.add(arquivo);
  const entrada = spyOn(DataTransferItem.prototype, 'webkitGetAsEntry').mockReturnValue({
    isFile: true,
    isDirectory: false,
  } as FileSystemEntry);
  const caixa = area.getBoundingClientRect();
  const posicao = { clientX: caixa.x + caixa.width / 2, clientY: caixa.y + caixa.height / 2 };
  try {
    for (const tipo of ['dragenter', 'dragover', 'drop']) {
      area.dispatchEvent(
        new DragEvent(tipo, {
          bubbles: true,
          cancelable: true,
          dataTransfer: transferencia,
          ...posicao,
        }),
      );
    }
  } finally {
    entrada.mockRestore();
  }
}

/** Sem arquivo: "Sem arquivo", "Enviar arquivo" e a regra dos formatos. */
export const SemArquivo: Historia = {
  args: { rotulo: 'Laudo técnico', aoEscolher: fn(), aoRemover: fn() },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('group', { name: 'Laudo técnico' })).toBeInTheDocument();
    await expect(tela.getByText('Sem arquivo')).toBeInTheDocument();
    await expect(tela.getByRole('button', { name: 'Enviar arquivo' })).toBeInTheDocument();
    await expect(
      tela.getByText(
        'PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP, até 25 MB.',
      ),
    ).toBeInTheDocument();
    await expect(tela.queryByRole('link', { name: 'Baixar' })).toBeNull();
    await expect(tela.queryByRole('button', { name: 'Remover' })).toBeNull();
  },
};

/** Com arquivo: o nome, o tamanho, "Baixar", "Trocar" e "Remover". */
export const ComArquivo: Historia = {
  tags: ['captura'],
  args: {
    rotulo: 'Laudo técnico',
    arquivo: NOTA,
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ ok: true as const })),
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('nota-fiscal-1234.pdf')).toBeInTheDocument();
    await expect(tela.getByText('240 KB')).toBeInTheDocument();
    const baixar = tela.getByRole('link', { name: 'Baixar' });
    await expect(baixar).toHaveAttribute('href', NOTA.endereco);
    await expect(baixar).toHaveAttribute('download', 'nota-fiscal-1234.pdf');
    await expect(tela.getByRole('button', { name: 'Trocar' })).toBeInTheDocument();
    await expect(tela.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  },
};

/**
 * Num formulário, como o campo de arquivo da ficha do ativo: o rótulo à vista, acima da escolha, dá
 * o nome dela, e a descrição, abaixo, fica ligada a ela.
 */
export const ComoCampoDoFormulario: Historia = {
  tags: ['captura'],
  args: {
    rotulo: 'PDF da nota fiscal',
    rotuloAVista: true,
    descricao: 'Restrito: só quem vê os campos restritos vê este valor.',
    arquivo: NOTA,
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ ok: true as const })),
  },
  play: async ({ canvasElement }) => {
    const grupo = within(canvasElement).getByRole('group', { name: 'PDF da nota fiscal' });
    await expect(within(grupo).getByText('PDF da nota fiscal')).toBeVisible();
    await expect(grupo).toHaveAccessibleDescription(
      'Restrito: só quem vê os campos restritos vê este valor.',
    );
  },
};

/** Quem só vê o arquivo baixa, sem trocar nem remover; sem arquivo, nada a fazer. */
export const SomenteLeitura: Historia = {
  args: { rotulo: 'Laudo técnico', arquivo: NOTA },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('link', { name: 'Baixar' })).toBeInTheDocument();
    await expect(tela.queryByRole('button', { name: 'Trocar' })).toBeNull();
    await expect(tela.queryByRole('button', { name: 'Remover' })).toBeNull();
    await expect(campoDeArquivo(canvasElement)).toBeNull();
  },
};

/** "Enviar arquivo" abre a escolha de arquivos, com os formatos aceitos, e envia o escolhido. */
export const EnviarUmArquivo: Historia = {
  args: { rotulo: 'Laudo técnico', aoEscolher: fn(), aoRemover: fn() },
  play: async ({ args, canvasElement }) => {
    const campo = campoDeArquivo(canvasElement);
    await expect(campo.accept).toBe(FORMATOS_DE_ARQUIVO.join(','));
    const abrir = spyOn(campo, 'click').mockImplementation(() => {});
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Enviar arquivo' }));
    await expect(abrir).toHaveBeenCalledOnce();

    const arquivo = PDF();
    await userEvent.upload(campo, arquivo);
    await expect(args.aoEscolher).toHaveBeenCalledWith(arquivo);
  },
};

/** Arrastar um arquivo para a área envia, como "Enviar arquivo". */
export const ArrastarUmArquivo: Historia = {
  args: { rotulo: 'Laudo técnico', aoEscolher: fn(), aoRemover: fn() },
  play: async ({ args, canvasElement }) => {
    soltar(areaDoArquivo(canvasElement), [PDF()]);
    await waitFor(() => expect(args.aoEscolher).toHaveBeenCalledOnce());
    const [enviado] = (args.aoEscolher as ReturnType<typeof fn>).mock.calls[0] as [File];
    await expect(enviado.name).toBe('laudo.pdf');
  },
};

/** Durante o envio: "Enviando…" com o progresso, sem outra escolha e sem remover. */
export const Enviando: Historia = {
  args: {
    rotulo: 'Laudo técnico',
    arquivo: NOTA,
    progresso: 40,
    aoEscolher: fn(),
    aoRemover: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const barra = tela.getByRole('progressbar', { name: 'Enviando…' });
    await expect(barra).toHaveAttribute('aria-valuenow', '40');
    await expect(tela.getByRole('button', { name: 'Remover' })).toBeDisabled();
    const abrir = spyOn(campoDeArquivo(canvasElement), 'click').mockImplementation(() => {});
    await userEvent.click(tela.getByRole('button', { name: /^Trocar/ }));
    await expect(abrir).not.toHaveBeenCalled();
    soltar(areaDoArquivo(canvasElement), [PDF()]);
    await expect(args.aoEscolher).not.toHaveBeenCalled();
  },
};

/**
 * A escolha com os formatos, o limite e as regras dados, como a da planilha da importação: a janela
 * do sistema filtra os formatos, e o limite dado recusa antes do envio.
 */
export const EscolhaDaPlanilha: Historia = {
  args: {
    rotulo: 'Planilha',
    rotuloAVista: true,
    formatos: ['.xlsx', '.csv'],
    limite: 10 * 1024 * 1024,
    regras: 'XLSX ou CSV, até 10 MB, com os títulos na primeira linha.',
    rotuloDoEnvio: 'Escolher planilha',
    aoEscolher: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const campo = campoDeArquivo(canvasElement);
    await expect(campo.accept).toBe('.xlsx,.csv');
    await expect(
      tela.getByText('XLSX ou CSV, até 10 MB, com os títulos na primeira linha.'),
    ).toBeInTheDocument();
    await expect(tela.getByRole('button', { name: 'Escolher planilha' })).toBeInTheDocument();
    await expect(tela.queryByRole('button', { name: 'Remover' })).toBeNull();

    await userEvent.upload(campo, comTamanho('inventario.xlsx', 10 * 1024 * 1024 + 1));
    await expect(await tela.findByRole('alert')).toHaveTextContent('O arquivo passa de 10 MB.');
    await expect(args.aoEscolher).not.toHaveBeenCalled();

    const planilha = new File(['Patrimônio;Local'], 'inventario.csv', { type: 'text/csv' });
    await userEvent.upload(campo, planilha);
    await expect(args.aoEscolher).toHaveBeenCalledWith(planilha);
  },
};

/** O arquivo grande demais e o vazio são recusados antes do envio, junto da escolha. */
export const RecusadoAntesDoEnvio: Historia = {
  args: { rotulo: 'Laudo técnico', aoEscolher: fn(), aoRemover: fn() },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.upload(
      campoDeArquivo(canvasElement),
      comTamanho('fotos.zip', LIMITE_DOS_ARQUIVOS + 1),
    );
    await expect(await tela.findByRole('alert')).toHaveTextContent('O arquivo passa de 25 MB.');
    soltar(areaDoArquivo(canvasElement), [comTamanho('vazio.pdf', 0)]);
    await waitFor(() => expect(tela.getByRole('alert')).toHaveTextContent('O arquivo está vazio.'));
    await expect(args.aoEscolher).not.toHaveBeenCalled();

    // A escolha seguinte tira a recusa.
    await userEvent.upload(campoDeArquivo(canvasElement), PDF());
    await expect(args.aoEscolher).toHaveBeenCalledOnce();
    await expect(tela.queryByRole('alert')).toBeNull();
  },
};

/** A recusa da API aparece junto da escolha, e o arquivo anterior continua. */
export const ComRecusa: Historia = {
  args: {
    rotulo: 'Laudo técnico',
    arquivo: NOTA,
    erro: 'Formato não aceito. Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.',
    aoEscolher: fn(),
    aoRemover: fn(),
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('alert')).toHaveTextContent('Formato não aceito.');
    await expect(tela.getByText('nota-fiscal-1234.pdf')).toBeInTheDocument();
  },
};

/** "Remover" pede a confirmação, com o nome do arquivo, e só então remove. */
export const RemoverComConfirmacao: Historia = {
  args: { rotulo: 'Laudo técnico', aoEscolher: fn(), aoRemover: fn() },
  render: (args) => {
    function ComArquivoParaRemover() {
      const [arquivo, definirArquivo] = useState<ArquivoDaEscolha | null>(NOTA);
      return (
        <EscolhaDeArquivo
          rotulo="Laudo técnico"
          arquivo={arquivo}
          aoEscolher={args.aoEscolher}
          aoRemover={async () => {
            await args.aoRemover?.();
            definirArquivo(null);
            return { ok: true };
          }}
        />
      );
    }
    return <ComArquivoParaRemover />;
  },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Remover' }));
    const confirmacao = await corpoDe(canvasElement).findByRole('alertdialog', {
      name: 'Remover arquivo?',
    });
    await expect(confirmacao).toHaveTextContent('nota-fiscal-1234.pdf');
    await expect(args.aoRemover).not.toHaveBeenCalled();
    await userEvent.click(within(confirmacao).getByRole('button', { name: 'Remover arquivo' }));
    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('alertdialog')).toBeNull());
    await expect(args.aoRemover).toHaveBeenCalledOnce();
    await expect(tela.getByText('Sem arquivo')).toBeInTheDocument();
    await waitFor(() => expect(tela.getByRole('button', { name: 'Enviar arquivo' })).toHaveFocus());
    // O botão da confirmação saiu com ela: o aviso do "Removendo" aponta para ele.
    esvaziarOAnunciador();
  },
};

/** A recusa da remoção fica na confirmação, e o arquivo continua. */
export const RemocaoRecusada: Historia = {
  args: {
    rotulo: 'Laudo técnico',
    arquivo: NOTA,
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ erro: 'Sem conexão com o servidor.' })),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Remover' }));
    const confirmacao = await corpoDe(canvasElement).findByRole('alertdialog');
    await userEvent.click(within(confirmacao).getByRole('button', { name: 'Remover arquivo' }));
    await expect(await within(confirmacao).findByRole('alert')).toHaveTextContent(
      'Sem conexão com o servidor.',
    );
  },
};
