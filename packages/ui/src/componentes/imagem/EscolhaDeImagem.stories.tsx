import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { Avatar } from '../avatar/Avatar.tsx';
import {
  EscolhaDeImagem,
  FORMATO_NAO_ACEITO,
  FORMATOS_DE_IMAGEM,
  type PropsDaEscolhaDeImagem,
} from './EscolhaDeImagem.tsx';

const RETRATO = new URL('../avatar/exemplos/retrato-128.svg?no-inline', import.meta.url).href;
const OUTRO_RETRATO = new URL('../avatar/exemplos/retrato-256.svg?no-inline', import.meta.url).href;

const meta: Meta<typeof EscolhaDeImagem> = {
  title: 'Componentes/Escolha de imagem',
  component: EscolhaDeImagem,
};
export default meta;

type Historia = StoryObj<typeof EscolhaDeImagem>;

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

/** O campo de arquivo escondido que "Escolher imagem" abre. */
const campoDeArquivo = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('input[type="file"]') as HTMLInputElement;

/** A área da imagem, onde se solta um arquivo. */
const areaDaImagem = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[data-area-da-imagem]') as HTMLElement;

const PNG = () => new File(['png'], 'foto.png', { type: 'image/png' });
const GIF = () => new File(['gif'], 'animacao.gif', { type: 'image/gif' });

/**
 * Solta os arquivos na área, como o navegador faz quando se arrasta do computador. O arquivo de um
 * `DataTransfer` criado pela página não tem a entrada do sistema de arquivos, que o React Aria usa
 * para saber que é um arquivo (e não uma pasta): aqui ela vem simulada, como o sistema a daria.
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

const Retrato = ({ endereco }: { endereco: string }) => (
  <Avatar nome="Ana Souza" imagem={endereco} tamanho="ficha" decorativo />
);

/**
 * A escolha com o estado de quem a usa: a imagem atual, o envio e a recusa. O envio só termina
 * quando o teste manda, por `concluirOEnvio`, com a imagem nova ou com a recusa da API.
 */
let concluirOEnvio: ((recusa?: string) => void) | null = null;

function ComEnvio({
  inicial,
  aoEscolher,
  aoRemover,
}: {
  inicial?: string;
  aoEscolher?: (arquivo: File) => void;
  aoRemover?: () => unknown;
}) {
  const [imagem, definirImagem] = useState(inicial);
  const [progresso, definirProgresso] = useState<number | null | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);
  return (
    <EscolhaDeImagem
      rotulo="Foto de Ana Souza"
      imagem={imagem ? <Retrato endereco={imagem} /> : undefined}
      vazio={<Avatar nome="Ana Souza" tamanho="ficha" decorativo />}
      progresso={progresso}
      erro={erro}
      aoEscolher={(arquivo) => {
        aoEscolher?.(arquivo);
        definirErro(null);
        definirProgresso(40);
        concluirOEnvio = (recusa) => {
          definirProgresso(undefined);
          if (recusa) definirErro(recusa);
          else definirImagem(OUTRO_RETRATO);
        };
      }}
      aoRemover={async () => {
        aoRemover?.();
        definirImagem(undefined);
        return { ok: true };
      }}
    />
  );
}

/** Sem imagem: o estado vazio, só com "Escolher imagem". */
export const Vazia: Historia = {
  tags: ['captura'],
  args: { rotulo: 'Imagem do modelo', aoEscolher: fn(), aoRemover: fn() },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('group', { name: 'Imagem do modelo' })).toBeInTheDocument();
    await expect(tela.getByText('Sem imagem')).toBeInTheDocument();
    await expect(tela.getByRole('button', { name: 'Escolher imagem' })).toBeInTheDocument();
    await expect(tela.queryByRole('button', { name: 'Remover imagem' })).toBeNull();
  },
};

/** Com imagem: ela aparece na área, e há "Remover imagem". */
export const ComImagem: Historia = {
  tags: ['captura'],
  args: {
    rotulo: 'Foto de Ana Souza',
    imagem: <Retrato endereco={RETRATO} />,
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ ok: true as const })),
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(areaDaImagem(canvasElement).querySelector('img')).not.toBeNull();
    await expect(tela.queryByText('Sem imagem')).toBeNull();
    await expect(tela.getByRole('button', { name: 'Remover imagem' })).toBeInTheDocument();
  },
};

/** "Escolher imagem" abre a escolha de arquivos já filtrada pelos formatos aceitos. */
export const EscolherImagem: Historia = {
  args: { rotulo: 'Imagem do modelo', aoEscolher: fn(), aoRemover: fn() },
  play: async ({ args, canvasElement }) => {
    const campo = campoDeArquivo(canvasElement);
    await expect(campo.accept).toBe(FORMATOS_DE_IMAGEM.join(','));
    await expect(campo.hasAttribute('capture')).toBe(false);

    // O botão abre a escolha do sistema (aqui, só conferida).
    const abrir = spyOn(campo, 'click').mockImplementation(() => {});
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Escolher imagem' }));
    await expect(abrir).toHaveBeenCalledOnce();

    const arquivo = PNG();
    await userEvent.upload(campo, arquivo);
    await expect(args.aoEscolher).toHaveBeenCalledWith(arquivo);
  },
};

/** Durante o envio: "Enviando…" com o progresso, e "Remover imagem" desabilitado. */
export const Enviando: Historia = {
  tags: ['captura'],
  args: {
    rotulo: 'Foto de Ana Souza',
    imagem: <Retrato endereco={RETRATO} />,
    progresso: 40,
    aoEscolher: fn(),
    aoRemover: fn(),
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const barra = tela.getByRole('progressbar', { name: 'Enviando…' });
    await expect(barra).toHaveAttribute('aria-valuenow', '40');
    await expect(tela.getByRole('button', { name: 'Remover imagem' })).toBeDisabled();
  },
};

/** Durante o envio, nenhuma outra escolha: nem pelo botão, nem soltando outro arquivo. */
export const EnviandoSemOutraEscolha: Historia = {
  args: Enviando.args,
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const abrir = spyOn(campoDeArquivo(canvasElement), 'click').mockImplementation(() => {});
    await userEvent.click(tela.getByRole('button', { name: /^Escolher imagem/ }));
    await expect(abrir).not.toHaveBeenCalled();
    await expect(tela.getByRole('button', { name: 'Remover imagem' })).toBeDisabled();

    soltar(areaDaImagem(canvasElement), [PNG()]);
    await expect(args.aoEscolher).not.toHaveBeenCalled();
  },
};

/** O envio inteiro: escolher, ver o progresso e depois a imagem nova. */
export const EnviarUmaImagem: Historia = {
  args: { aoEscolher: fn(), aoRemover: fn() },
  render: (args) => (
    <ComEnvio inicial={RETRATO} aoEscolher={args.aoEscolher} aoRemover={args.aoRemover} />
  ),
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const arquivo = PNG();
    await userEvent.upload(campoDeArquivo(canvasElement), arquivo);
    await expect(args.aoEscolher).toHaveBeenCalledWith(arquivo);
    await expect(await tela.findByText('Enviando…')).toBeInTheDocument();
    await expect(tela.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');

    concluirOEnvio?.();
    await waitFor(() => expect(tela.queryByRole('progressbar')).toBeNull());
    const imagem = areaDaImagem(canvasElement).querySelector('img') as HTMLImageElement;
    await expect(imagem.getAttribute('src')).toBe(OUTRO_RETRATO);
  },
};

/** Arrastar um arquivo para a área envia a imagem, como "Escolher imagem". */
export const ArrastarUmArquivo: Historia = {
  args: { rotulo: 'Imagem do modelo', aoEscolher: fn(), aoRemover: fn() },
  play: async ({ args, canvasElement }) => {
    const arquivo = PNG();
    soltar(areaDaImagem(canvasElement), [arquivo]);
    await waitFor(() => expect(args.aoEscolher).toHaveBeenCalledOnce());
    const [enviado] = (args.aoEscolher as ReturnType<typeof fn>).mock.calls[0] as [File];
    await expect(enviado.name).toBe('foto.png');
    await expect(enviado.type).toBe('image/png');
  },
};

/** O GIF arrastado é recusado junto da escolha, e a imagem anterior continua. */
export const FormatoRecusado: Historia = {
  args: {
    rotulo: 'Foto de Ana Souza',
    imagem: <Retrato endereco={RETRATO} />,
    aoEscolher: fn(),
    aoRemover: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    soltar(areaDaImagem(canvasElement), [GIF()]);
    await expect(await tela.findByRole('alert')).toHaveTextContent(FORMATO_NAO_ACEITO);
    await expect(args.aoEscolher).not.toHaveBeenCalled();
    await expect(areaDaImagem(canvasElement).querySelector('img')).not.toBeNull();

    // A escolha seguinte tira a recusa.
    await userEvent.upload(campoDeArquivo(canvasElement), PNG());
    await expect(args.aoEscolher).toHaveBeenCalledOnce();
    await expect(tela.queryByRole('alert')).toBeNull();
  },
};

/** Com a recusa: o motivo junto da escolha, e a imagem anterior continua. */
export const ComRecusa: Historia = {
  tags: ['captura'],
  args: {
    rotulo: 'Foto de Ana Souza',
    imagem: <Retrato endereco={RETRATO} />,
    erro: 'A imagem passa de 10 MB.',
    aoEscolher: fn(),
    aoRemover: fn(),
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('alert')).toHaveTextContent('A imagem passa de 10 MB.');
    await expect(areaDaImagem(canvasElement).querySelector('img')).not.toBeNull();
  },
};

/** A recusa da API aparece junto da escolha, e a imagem anterior continua. */
export const RecusaDaApi: Historia = {
  args: { aoEscolher: fn(), aoRemover: fn() },
  render: (args) => (
    <ComEnvio inicial={RETRATO} aoEscolher={args.aoEscolher} aoRemover={args.aoRemover} />
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.upload(campoDeArquivo(canvasElement), PNG());
    await tela.findByRole('progressbar');
    concluirOEnvio?.('A imagem passa de 10 MB.');
    await expect(await tela.findByRole('alert')).toHaveTextContent('A imagem passa de 10 MB.');
    const imagem = areaDaImagem(canvasElement).querySelector('img') as HTMLImageElement;
    await expect(imagem.getAttribute('src')).toBe(RETRATO);
  },
};

/** Cenário da spec: "Remover imagem" pelo teclado, confirmado, e o foco em "Escolher imagem". */
export const RemoverPeloTeclado: Historia = {
  args: { aoEscolher: fn(), aoRemover: fn() },
  render: (args) => (
    <ComEnvio inicial={RETRATO} aoEscolher={args.aoEscolher} aoRemover={args.aoRemover} />
  ),
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const remover = tela.getByRole('button', { name: 'Remover imagem' });
    while (document.activeElement !== remover) await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    const confirmacao = await corpoDe(canvasElement).findByRole('alertdialog', {
      name: 'Remover imagem?',
    });
    await expect(args.aoRemover).not.toHaveBeenCalled();
    const confirmar = within(confirmacao).getByRole('button', { name: 'Remover imagem' });
    while (document.activeElement !== confirmar) await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(corpoDe(canvasElement).queryByRole('alertdialog')).toBeNull());
    await expect(args.aoRemover).toHaveBeenCalledOnce();
    await expect(tela.queryByRole('button', { name: 'Remover imagem' })).toBeNull();
    await waitFor(() =>
      expect(tela.getByRole('button', { name: 'Escolher imagem' })).toHaveFocus(),
    );
  },
};

/** Cancelar a remoção não muda nada, e o foco volta a "Remover imagem". */
export const CancelarARemocao: Historia = {
  args: {
    rotulo: 'Foto de Ana Souza',
    imagem: <Retrato endereco={RETRATO} />,
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ ok: true as const })),
  },
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const remover = tela.getByRole('button', { name: 'Remover imagem' });
    await userEvent.click(remover);
    const confirmacao = await corpoDe(canvasElement).findByRole('alertdialog');
    await userEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(remover).toHaveFocus());
    await expect(args.aoRemover).not.toHaveBeenCalled();
  },
};

/** A recusa da remoção fica na confirmação, e a imagem continua. */
export const RemocaoRecusada: Historia = {
  args: {
    rotulo: 'Foto de Ana Souza',
    imagem: <Retrato endereco={RETRATO} />,
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ erro: 'Sem conexão com o servidor.' })),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Remover imagem' }));
    const confirmacao = await corpoDe(canvasElement).findByRole('alertdialog');
    await userEvent.click(within(confirmacao).getByRole('button', { name: 'Remover imagem' }));
    await expect(await within(confirmacao).findByRole('alert')).toHaveTextContent(
      'Sem conexão com o servidor.',
    );
  },
};

/** Tudo pelo teclado: a ordem do Tab passa pela área, por "Escolher imagem" e por "Remover imagem". */
export const PeloTeclado: Historia = {
  args: {
    rotulo: 'Foto de Ana Souza',
    imagem: <Retrato endereco={RETRATO} />,
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ ok: true as const })),
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    await expect(document.activeElement).toBe(
      tela.getByRole('button', { name: 'Soltar ou colar uma imagem' }),
    );
    await expect(areaDaImagem(canvasElement)).toHaveAttribute('data-focus-visible');

    await userEvent.tab();
    const escolher = tela.getByRole('button', { name: 'Escolher imagem' });
    await expect(escolher).toHaveFocus();
    const abrir = spyOn(campoDeArquivo(canvasElement), 'click').mockImplementation(() => {});
    await userEvent.keyboard('{Enter}');
    await expect(abrir).toHaveBeenCalledOnce();

    await userEvent.tab();
    await expect(tela.getByRole('button', { name: 'Remover imagem' })).toHaveFocus();
  },
};

/**
 * Num formulário, como o campo de imagem da ficha do ativo: o rótulo à vista, acima da escolha, dá
 * o nome dela, e a descrição, abaixo, fica ligada a ela.
 */
export const ComoCampoDoFormulario: Historia = {
  tags: ['captura'],
  args: {
    rotulo: 'Foto da etiqueta',
    rotuloAVista: true,
    descricao: 'Restrito: só quem vê os campos restritos vê este valor.',
    imagem: <Retrato endereco={RETRATO} />,
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ ok: true as const })),
  },
  play: async ({ canvasElement }) => {
    const grupo = within(canvasElement).getByRole('group', { name: 'Foto da etiqueta' });
    await expect(within(grupo).getByText('Foto da etiqueta')).toBeVisible();
    await expect(grupo).toHaveAccessibleDescription(
      'Restrito: só quem vê os campos restritos vê este valor.',
    );
  },
};

/** Quem só vê a imagem não troca nem remove: a escolha só a mostra, sem a área de soltar. */
export const SomenteLeitura: Historia = {
  args: { rotulo: 'Foto da etiqueta', imagem: <Retrato endereco={RETRATO} /> },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('group', { name: 'Foto da etiqueta' })).toBeInTheDocument();
    await expect(canvasElement.querySelector('img')).not.toBeNull();
    await expect(tela.queryByRole('button')).toBeNull();
    await expect(campoDeArquivo(canvasElement)).toBeNull();
    await expect(areaDaImagem(canvasElement)).toBeNull();
    await expect(tela.queryByText(/até 10 MB/)).toBeNull();
  },
};

/** Os textos da foto da pessoa, como na seção Conta: "Trocar foto" e "Remover foto". */
export const FotoDaPessoa: Historia = {
  args: {
    rotulo: 'Foto de Ana Souza',
    imagem: <Retrato endereco={RETRATO} />,
    rotuloDeEscolher: 'Trocar foto',
    rotuloDeRemover: 'Remover foto',
    explicacaoDaRemocao: 'A foto deixa de aparecer na hora. Para voltar, envie a foto de novo.',
    aoEscolher: fn(),
    aoRemover: fn(async () => ({ ok: true as const })),
  } satisfies PropsDaEscolhaDeImagem,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByRole('button', { name: 'Trocar foto' })).toBeInTheDocument();
    await userEvent.click(tela.getByRole('button', { name: 'Remover foto' }));
    const confirmacao = await corpoDe(canvasElement).findByRole('alertdialog', {
      name: 'Remover foto?',
    });
    await expect(confirmacao).toHaveTextContent('A foto deixa de aparecer na hora.');
    await userEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }));
  },
};
