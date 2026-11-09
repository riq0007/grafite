// A sessão do painel na página compilada (spec painel-da-operacao, "Painel aberto só no próprio
// servidor"): o endereço com o código abre a sessão, o código sai do endereço e não vale de novo, e
// a API recusa o pedido sem a sessão ou com outro endereço no Host.
import { expect, linhaDoServico, test } from './painel.ts';

test('Painel pelo atalho: o endereço com o código abre a sessão e mostra o estado do servidor', async ({
  page,
  painel,
}) => {
  await painel.abrir();
  await expect(page.getByRole('heading', { name: 'Painel da operação' })).toBeVisible();
  await expect(linhaDoServico(page, 'Grafite')).toContainText('Rodando');
  await expect(page.getByRole('region', { name: 'Certificado' })).toContainText('Vence em 75 dias');
  // O código sai do endereço, e a sessão fica no cookie: a página recarregada continua aberta.
  expect(new URL(page.url()).hash).toBe('');
  await page.reload();
  await expect(linhaDoServico(page, 'Grafite Coletor')).toContainText('Rodando');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('o código já usado não abre a sessão em outro navegador', async ({
  page,
  painel,
  browser,
}) => {
  await painel.abrir();
  await expect(linhaDoServico(page, 'Grafite')).toBeVisible();
  const outro = await browser.newContext();
  try {
    const pagina = await outro.newPage();
    await painel.abrir(pagina);
    await expect(pagina.getByRole('alert').first()).toHaveText(
      'O código deste endereço já foi usado: abra o painel de novo pelo comando.',
    );
    await expect(pagina.getByRole('table', { name: 'Serviços' })).toHaveCount(0);
  } finally {
    await outro.close();
  }
});

test('Pedido sem o código: a API recusa o pedido sem a sessão, sem rodar nada', async ({
  page,
  painel,
  playwright,
}) => {
  const programa = await playwright.request.newContext();
  try {
    const sem = await programa.post(`${painel.endereco}/api/tarefas`, {
      data: { tarefa: 'backup-agora', campos: {} },
    });
    expect(sem.status()).toBe(401);
    expect(await sem.json()).toEqual({
      mensagem: 'Abra o painel pelo comando: o endereço que ele abre traz o código da sessão.',
    });
    const outroHost = await programa.get(`${painel.endereco}/api/estado`, {
      headers: { host: 'grafite.empresa.com.br' },
    });
    expect(outroHost.status()).toBe(421);
  } finally {
    await programa.dispose();
  }
  // Nada rodou: a página, aberta depois com o código, não tem tarefa em andamento.
  await painel.abrir();
  await expect(linhaDoServico(page, 'Grafite')).toContainText('Rodando');
  await expect(page.getByRole('region', { name: 'Andamento da tarefa' })).toHaveCount(0);
});
