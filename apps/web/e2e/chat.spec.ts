import type { Locator, Page } from '@playwright/test';
import { EQUIPE, simularChat, simularSessaoDaColaboradora } from './api-do-chat.ts';
import { expect, test } from './fixtures.ts';

// Specs modulo-chat e componentes-base, com a web compilada e a API do chat simulada (change
// chat-com-chamados, tarefa 5.3): a entrada da colaboradora no app do chat, a lista, a conversa e
// o chamado; o botão direito na mensagem; o print colado, o arquivo solto e a miniatura.

const lista = (pagina: Page) => pagina.getByRole('region', { name: 'Chat' });
const mensagens = (pagina: Page) => pagina.getByRole('region', { name: 'Mensagens' });
const caixa = (pagina: Page) =>
  pagina.getByRole('textbox', { name: 'Escrever uma mensagem em Equipe Financeiro' });
const anexosDaCaixa = (pagina: Page) => pagina.getByRole('list', { name: 'Anexos da mensagem' });
/** A mensagem na conversa, por um trecho do texto dela. */
const mensagem = (pagina: Page, trecho: string) =>
  mensagens(pagina).locator('li[data-escrita]').filter({ hasText: trecho });
const menuDaMensagem = (pagina: Page, autor: string) =>
  pagina.getByRole('menu', { name: `Ações da mensagem de ${autor}` });

/** Os pedidos à API que nem a fixture nem a simulação do chat respondem, para o fim do teste. */
function naoSimulados(pagina: Page) {
  const faltam: string[] = [];
  pagina.on('response', (resposta) => {
    if (resposta.status() !== 501) return;
    faltam.push(`${resposta.request().method()} ${new URL(resposta.url()).pathname}`);
  });
  return faltam;
}

/** O meio do elemento na janela, onde o clique do `page.mouse` cai. */
async function meioDe(alvo: Locator) {
  const caixaDoAlvo = await alvo.boundingBox();
  if (!caixaDoAlvo) throw new Error('O alvo não está na tela.');
  return { x: caixaDoAlvo.x + caixaDoAlvo.width / 2, y: caixaDoAlvo.y + caixaDoAlvo.height / 2 };
}

/**
 * O botão direito no meio do elemento, pelo `page.mouse`: com um menu aberto, a tela fica inerte, e
 * o `locator.click` esperaria o elemento receber o ponteiro. Devolve o ponto do clique.
 */
async function botaoDireito(pagina: Page, alvo: Locator) {
  const ponto = await meioDe(alvo);
  await pagina.mouse.click(ponto.x, ponto.y, { button: 'right' });
  return ponto;
}

/**
 * Anota, a cada `contextmenu` que chega à janela, se o navegador abriria o menu dele: o evento que
 * ninguém preveniu. O ouvinte da janela, na bolha, vem depois dos da tela.
 */
async function ouvirOMenuDoNavegador(pagina: Page) {
  await pagina.evaluate(() => {
    const janela = window as Window & { menusDoNavegador?: boolean[] };
    janela.menusDoNavegador = [];
    window.addEventListener('contextmenu', (evento) => {
      janela.menusDoNavegador?.push(!evento.defaultPrevented);
    });
  });
  return () =>
    pagina.evaluate(
      () => (window as Window & { menusDoNavegador?: boolean[] }).menusDoNavegador ?? [],
    );
}

/** O menu abriu com o canto no ponto do clique, como o "bottom start" do menu de contexto do kit. */
async function abriuNoPonto(menu: Locator, ponto: { x: number; y: number }) {
  const caixaDoMenu = await menu.boundingBox();
  expect(caixaDoMenu).not.toBeNull();
  expect(Math.abs((caixaDoMenu?.x ?? 0) - ponto.x)).toBeLessThan(16);
  expect(Math.abs((caixaDoMenu?.y ?? 0) - ponto.y)).toBeLessThan(16);
}

test.describe('a entrada da colaboradora', () => {
  test.use({ primeiraTelaVista: false });

  test('pela raiz, entra no app do chat, abre a equipe, escreve e abre o chamado', async ({
    page,
  }) => {
    const faltam = naoSimulados(page);
    await simularSessaoDaColaboradora(page, { entrou: false });
    const chat = await simularChat(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-chegada', 'entrada');
    const entrada = page.locator('[data-tela-de-entrada]');
    await entrada.getByLabel('Usuário').fill('fernanda.rocha');
    const senha = entrada.getByLabel('Senha', { exact: true });
    await senha.fill('cavalo bateria grampo');
    await senha.press('Enter');

    // O Chat é o único módulo da casca que ela vê, com o app próprio: a raiz dá lugar a ele.
    await expect(page).toHaveURL(/\/chat$/);
    await expect(
      lista(page).getByRole('heading', { level: 2, name: 'Chamados · 2' }),
    ).toBeVisible();
    await expect(
      lista(page).getByRole('link', {
        name: 'Sem acesso à pasta do Financeiro, Aguardando você, chamado 1041, 1 resposta nova',
      }),
    ).toBeVisible();
    await expect(
      lista(page).getByRole('link', {
        name: 'Teclado com teclas falhando, Em andamento, chamado 1044',
      }),
    ).toBeVisible();

    await lista(page).getByRole('link', { name: 'Equipe Financeiro', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/chat/c/${EQUIPE}$`));
    await expect(mensagem(page, 'Eu vou abrir um chamado agora.')).toBeVisible();
    await caixa(page).fill('Abri o chamado da impressora.');
    await caixa(page).press('Enter');
    await expect(mensagem(page, 'Abri o chamado da impressora.')).toBeVisible();
    await expect(caixa(page)).toHaveValue('');
    expect(chat.pedidos).toEqual([
      {
        conversa: EQUIPE,
        corpo: expect.objectContaining({ texto: 'Abri o chamado da impressora.' }),
      },
    ]);

    await lista(page)
      .getByRole('link', { name: /chamado 1041/ })
      .click();
    await expect(page).toHaveURL(/\/chat\/chamados\/1041$/);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Sem acesso à pasta do Financeiro' }),
    ).toBeVisible();
    await expect(page.getByText('Chamado #1041')).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Conversa do chamado' })
        .getByText('Não achei uma pasta com esse nome. Confirme o nome exato, por favor.'),
    ).toBeVisible();
    expect(faltam).toEqual([]);
  });
});

test.describe('na conversa aberta', () => {
  // O app do chat não tem a chegada da casca: a espera dela ficaria para sempre.
  test.use({ esperarAChegada: false });

  test.beforeEach(async ({ page }) => {
    await simularSessaoDaColaboradora(page);
  });

  test('o botão direito abre o menu da mensagem no ponteiro, e em outra mensagem, o dela', async ({
    page,
  }) => {
    const faltam = naoSimulados(page);
    await simularChat(page);
    await page.goto(`/chat/c/${EQUIPE}`);
    const paulo = mensagem(page, 'manchando todas as folhas');
    await expect(paulo).toBeVisible();
    const menusDoNavegador = await ouvirOMenuDoNavegador(page);

    const ponto = await botaoDireito(page, paulo.getByText(/manchando todas as folhas/));
    const doPaulo = menuDaMensagem(page, 'Paulo Nunes');
    await expect(doPaulo).toBeVisible();
    await expect(doPaulo.getByRole('menuitem', { name: 'Responder' })).toBeFocused();
    await abriuNoPonto(doPaulo, ponto);
    // A mensagem fica marcada enquanto o menu dela está aberto.
    await expect(paulo.locator('[data-presa]')).toHaveCount(1);

    // Com o menu aberto, o botão direito em outra mensagem fecha o dele e abre o dela.
    const tatiana = mensagem(page, 'Quem vai fechar o relatório');
    const outro = await botaoDireito(page, tatiana.getByText(/Quem vai fechar o relatório/));
    const daTatiana = menuDaMensagem(page, 'Tatiana Ramos');
    await expect(daTatiana).toBeVisible();
    await expect(doPaulo).toHaveCount(0);
    await expect(daTatiana.getByRole('menuitem', { name: 'Responder' })).toBeFocused();
    await abriuNoPonto(daTatiana, outro);
    await expect(tatiana.locator('[data-presa]')).toHaveCount(1);
    await expect(paulo.locator('[data-presa]')).toHaveCount(0);
    // Nenhum dos dois cliques abriu o menu do navegador.
    expect(await menusDoNavegador()).toEqual([false, false]);

    await page.keyboard.press('Escape');
    await expect(daTatiana).toHaveCount(0);
    expect(faltam).toEqual([]);
  });

  test('"Responder" no menu do botão direito deixa o foco na caixa, com a mensagem respondida', async ({
    page,
  }) => {
    const chat = await simularChat(page);
    await page.goto(`/chat/c/${EQUIPE}`);
    const paulo = mensagem(page, 'manchando todas as folhas');
    await expect(paulo).toBeVisible();

    await botaoDireito(page, paulo.getByText(/manchando todas as folhas/));
    const doPaulo = menuDaMensagem(page, 'Paulo Nunes');
    await doPaulo.getByRole('menuitem', { name: 'Responder' }).click();
    await expect(doPaulo).toHaveCount(0);
    await expect(caixa(page)).toBeFocused();
    await expect(page.getByRole('button', { name: 'Tirar a mensagem respondida' })).toBeVisible();

    await page.keyboard.type('Já pedi o toner.');
    await page.keyboard.press('Enter');
    await expect(mensagem(page, 'Já pedi o toner.')).toBeVisible();
    const respondida = chat.mensagensDe(EQUIPE).find(({ texto }) => texto?.includes('manchando'));
    expect(chat.pedidos.at(-1)?.corpo.respondeA).toBe(respondida?.id);
  });

  test('no link do anexo, o botão direito fica com o menu do navegador', async ({ page }) => {
    await simularChat(page);
    await page.goto(`/chat/c/${EQUIPE}`);
    const pdf = mensagem(page, 'Segue o orçamento do toner.').getByRole('link', {
      name: /orcamento-do-toner\.pdf/,
    });
    await expect(pdf).toBeVisible();
    const menusDoNavegador = await ouvirOMenuDoNavegador(page);

    await botaoDireito(page, pdf);
    expect(await menusDoNavegador()).toEqual([true]);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('o print colado entra com o nome da colagem e vai na mensagem, com a miniatura', async ({
    page,
  }) => {
    const faltam = naoSimulados(page);
    const chat = await simularChat(page);
    await page.goto(`/chat/c/${EQUIPE}`);
    await caixa(page).click();
    // O print, como o navegador o cola: um PNG com o nome "image.png".
    await caixa(page).evaluate(async (campo) => {
      const tela = document.createElement('canvas');
      tela.width = 64;
      tela.height = 36;
      const imagem = await new Promise<Blob>((resolver, recusar) =>
        tela.toBlob(
          (dados) => (dados ? resolver(dados) : recusar(new Error('sem o PNG'))),
          'image/png',
        ),
      );
      const colado = new DataTransfer();
      colado.items.add(new File([imagem], 'image.png', { type: 'image/png' }));
      campo.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: colado, bubbles: true, cancelable: true }),
      );
    });
    const anexo = anexosDaCaixa(page).getByRole('listitem');
    await expect(anexo).toHaveText([/^Imagem colada \d{2}-\d{2}-\d{4} \d{2}\.\d{2}\.\d{2}\.png/]);
    await expect(page.getByRole('button', { name: /^Tirar Imagem colada / })).toBeVisible();

    // Só com o anexo, sem o texto.
    await caixa(page).press('Enter');
    await expect(anexosDaCaixa(page)).toHaveCount(0);
    expect(chat.pedidos.at(-1)?.corpo.anexos).toHaveLength(1);
    const miniatura = mensagens(page).locator('a[download^="Imagem colada "] img');
    await expect(miniatura).toBeVisible();
    // A de 512 × 288 do servidor, no quadrado de 320 px da conversa, já carregada.
    await expect(miniatura).toHaveAttribute('width', '320');
    await expect(miniatura).toHaveAttribute('height', '180');
    await expect
      .poll(() => miniatura.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(512);
    const lados = await miniatura.boundingBox();
    expect(Math.round(lados?.width ?? 0)).toBe(320);
    expect(Math.round(lados?.height ?? 0)).toBe(180);
    expect(faltam).toEqual([]);
  });

  test('o arquivo solto na conversa entra como anexo, com o aviso durante o arrasto', async ({
    page,
  }) => {
    const chat = await simularChat(page);
    await page.goto(`/chat/c/${EQUIPE}`);
    const alvo = mensagem(page, 'Bom dia!');
    await expect(alvo).toBeVisible();
    // O arrasto de um arquivo do computador, como o do navegador: com a entrada dele no sistema de
    // arquivos, que o React Aria lê para separar os arquivos das pastas, e permitindo copiar.
    const arrastar = (tipo: 'dragenter' | 'dragover' | 'drop') =>
      alvo.evaluate((elemento, tipoDoEvento) => {
        const arquivo = new File(['%PDF-1.7'], 'fechamento-de-outubro.pdf', {
          type: 'application/pdf',
        });
        const dados = new DataTransfer();
        dados.items.add(arquivo);
        Object.defineProperty(dados, 'items', {
          value: [
            {
              kind: 'file',
              type: arquivo.type,
              getAsFile: () => arquivo,
              webkitGetAsEntry: () => ({ isFile: true, isDirectory: false }),
            },
          ],
        });
        Object.defineProperty(dados, 'effectAllowed', { value: 'all' });
        const { left, top, width, height } = elemento.getBoundingClientRect();
        const evento = new DragEvent(tipoDoEvento, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dados,
          clientX: left + width / 2,
          clientY: top + height / 2,
        });
        elemento.dispatchEvent(evento);
        return evento.defaultPrevented;
      }, tipo);

    expect(await arrastar('dragenter')).toBe(true);
    expect(await arrastar('dragover')).toBe(true);
    await expect(page.getByText('Solte para anexar')).toBeVisible();
    expect(await arrastar('drop')).toBe(true);
    await expect(anexosDaCaixa(page).getByRole('listitem')).toHaveText([
      /^fechamento-de-outubro\.pdf/,
    ]);
    await expect(page.getByText('Solte para anexar')).toHaveCount(0);
    // O "Tirar" só aparece com o anexo enviado, e a caixa só manda depois dele.
    await expect(
      page.getByRole('button', { name: 'Tirar fechamento-de-outubro.pdf' }),
    ).toBeVisible();

    await caixa(page).press('Enter');
    await expect(
      mensagens(page).getByRole('link', { name: /fechamento-de-outubro\.pdf/ }),
    ).toBeVisible();
    expect(chat.pedidos.at(-1)?.corpo.anexos).toHaveLength(1);
  });
});
