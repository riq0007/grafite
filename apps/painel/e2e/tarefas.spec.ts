// As tarefas do painel na página compilada (spec painel-da-operacao, "Tarefas do painel pelos
// mesmos comandos"): o andamento ao vivo pelos eventos do servidor, a confirmação digitada, uma
// tarefa por vez, o aviso antes de fechar a página no meio de uma tarefa e os logs com a busca.
import { andamento, escolher, expect, linhaDoServico, test } from './painel.ts';

test.describe('com a produção e o teste parados', () => {
  test.use({
    cenario: { esperaMs: 150, parados: ['grafite', 'grafite-coletor', 'grafite-teste'] },
  });

  test('Grafite parado: o painel mostra os dois parados e liga a produção, com o andamento ao vivo', async ({
    page,
    painel,
  }) => {
    await painel.abrir();
    await expect(linhaDoServico(page, 'Grafite')).toContainText('Parado');
    await expect(linhaDoServico(page, 'Grafite Teste')).toContainText('Parado');
    const avisos = page.getByRole('region', { name: 'Avisos' });
    await expect(avisos).toContainText('O Grafite está parado.');
    await expect(avisos).toContainText('O Grafite Teste está parado.');
    await linhaDoServico(page, 'Grafite').getByRole('button', { name: 'Ligar a produção' }).click();
    await expect(andamento(page)).toContainText(
      'A produção foi ligada e responde, na versão 0.1.1.',
    );
    await expect(linhaDoServico(page, 'Grafite')).toContainText('Rodando');
    await expect(linhaDoServico(page, 'Grafite Coletor')).toContainText('Rodando');
    await expect(
      linhaDoServico(page, 'Grafite Teste').getByRole('button', { name: 'Ligar o teste' }),
    ).toBeEnabled();
  });
});

test('Desligar a produção: o painel pede o nome do banco digitado e só então para o app e o coletor', async ({
  page,
  painel,
}) => {
  await painel.abrir();
  await linhaDoServico(page, 'Grafite')
    .getByRole('button', { name: 'Desligar a produção' })
    .click();
  const dialogo = page.getByRole('dialog', { name: 'Confirmação' });
  await expect(dialogo).toContainText(
    'Para desligar a produção, digite o nome do banco da produção',
  );
  await expect(linhaDoServico(page, 'Grafite')).toContainText('Rodando');
  const campo = dialogo.getByRole('textbox', { name: 'Texto da confirmação' });
  await campo.fill('grafite');
  await campo.press('Enter');
  await expect(andamento(page)).toContainText(
    'A produção foi desligada: o app e o coletor estão parados.',
  );
  await expect(linhaDoServico(page, 'Grafite')).toContainText('Parado');
  await expect(linhaDoServico(page, 'Grafite Coletor')).toContainText('Parado');
  await expect(linhaDoServico(page, 'Grafite Teste')).toContainText('Rodando');
});

test.describe('com cada passo demorado', () => {
  test.use({ cenario: { esperaMs: 3000 } });

  test('Duas tarefas ao mesmo tempo: enquanto a atualização roda, o backup espera, e a página avisa antes de fechar', async ({
    page,
    painel,
  }) => {
    await painel.abrir();
    await page.getByRole('tab', { name: 'Atualização' }).click();
    await escolher(page, 'Pacote da versão', /grafite-0\.2\.0-windows-x64\.zip/);
    await page.getByRole('button', { name: 'Atualizar o teste' }).click();
    await expect(andamento(page)).toContainText('Conferindo o pacote');

    await page.getByRole('tab', { name: 'Backups' }).click();
    await expect(page.getByRole('button', { name: 'Fazer o backup agora' })).toBeDisabled();
    await expect(
      page.getByText('Enquanto "Atualizar um ambiente" roda, as outras ações esperam.'),
    ).toBeVisible();
    // O servidor também recusa a segunda tarefa, com o motivo, e não a roda.
    const recusa = await page.request.post(`${painel.endereco}/api/tarefas`, {
      data: { tarefa: 'backup-agora', campos: {} },
    });
    expect(recusa.status()).toBe(409);
    expect(await recusa.json()).toEqual({
      mensagem: '"Atualizar um ambiente" está rodando: "Fazer o backup agora" espera ela terminar.',
    });

    // Fechar a página no meio da tarefa pede a confirmação do navegador; quem fica, vê o fim.
    const aviso = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const dialogo = await aviso;
    expect(dialogo.type()).toBe('beforeunload');
    await dialogo.dismiss();
    await expect(andamento(page)).toContainText('O teste roda a versão 0.2.0.', {
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Fazer o backup agora' })).toBeEnabled();
  });
});

test('os logs: as últimas linhas do serviço e a busca por um texto', async ({ page, painel }) => {
  await painel.abrir();
  await page.getByRole('tab', { name: 'Logs' }).click();
  await escolher(page, 'Serviço', 'Grafite Coletor');
  const log = page.getByRole('region', { name: 'Log do Grafite Coletor' });
  await expect(log).toContainText('grafite-coletor.out.log');
  await expect(log.getByRole('listitem')).toHaveCount(100);
  await page.getByRole('searchbox', { name: 'Buscar no log' }).fill('COLETA ATRASADA');
  await expect(log.getByRole('listitem')).toHaveCount(4);
  await expect(log.getByRole('listitem').first()).toContainText(
    'Coleta atrasada: Disponibilidade na rede',
  );
});
