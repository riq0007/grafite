import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { IDS, SENHA_TEMPORARIA, simularAdministracao } from './api-da-administracao.ts';
import { escolherLocal, preencherAtribuicao } from './escolhas.ts';
import { expect, semRolagemHorizontal, sessaoDe, test } from './fixtures.ts';

// Specs modulo-administracao, administracao-de-pessoas, perfis-e-grupos, locais e
// consulta-da-auditoria, com a web compilada e a API simulada.

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });
const secoes = (pagina: Page) =>
  pagina.getByRole('navigation', { name: 'Seções da Administração' });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
/** O valor ao lado do rótulo, numa lista de dados. */
const valorDe = (pagina: Page, rotulo: string) =>
  pagina
    .locator('dt', { hasText: new RegExp(`^${rotulo}$`) })
    .locator('xpath=following-sibling::dd');

/** Escolhe uma opção de um grupo de rádios clicando no rótulo, como o usuário. */
const escolher = (pagina: Page, grupo: string, nome: string) =>
  pagina
    .getByRole('radiogroup', { name: grupo })
    .locator('label')
    .filter({ has: pagina.getByRole('radio', { name: nome, exact: true }) })
    .click();

/** Um retrato para enviar como foto. */
const RETRATO = fileURLToPath(new URL('./exemplos/retrato.svg', import.meta.url));

/** Escolhe uma imagem de um campo de escolha de imagem, pelo botão, como o usuário. */
async function enviarImagem(pagina: Page, campo: string, botao: string, arquivo: string) {
  const seletor = pagina.waitForEvent('filechooser');
  await pagina.getByRole('group', { name: campo }).getByRole('button', { name: botao }).click();
  await (await seletor).setFiles(arquivo);
}

test.describe('administradora', () => {
  test('cadastra uma pessoa, que aparece na lista', async ({ page }) => {
    const api = await simularAdministracao(page);
    await page.goto('/');
    await dock(page).getByRole('button', { name: 'Administração' }).click();
    await expect(page).toHaveURL(/\/administracao\/pessoas$/);
    await expect(titulo(page, 'Pessoas')).toBeVisible();

    await page.getByRole('button', { name: 'Nova pessoa' }).click();
    await expect(titulo(page, 'Nova pessoa')).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Eduarda Lima');
    await page.getByRole('textbox', { name: 'E-mail' }).fill('eduarda.lima@empresa.com.br');
    await page.getByRole('textbox', { name: 'Matrícula' }).fill('004515');
    await escolherLocal(page, 'Local de trabalho', 'Jundiaí › Expedição');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();

    await expect(titulo(page, /Eduarda Lima/)).toBeVisible();
    await expect(avisos(page).getByText('Pessoa cadastrada.')).toBeVisible();
    expect(api.corposDe('POST /api/pessoas')).toEqual([
      {
        nome: 'Eduarda Lima',
        email: 'eduarda.lima@empresa.com.br',
        matricula: '004515',
        telefone: null,
        localId: IDS.expedicao,
      },
    ]);

    await secoes(page).getByRole('link', { name: 'Pessoas' }).click();
    const linha = page.getByRole('row', { name: /Eduarda Lima/ });
    await expect(linha).toContainText('004515');
    await expect(linha).toContainText('Jundiaí › Expedição');
  });

  test('cria a conta da pessoa e mostra a senha temporária uma vez só', async ({ page }) => {
    const api = await simularAdministracao(page);
    await page.goto(`/administracao/pessoas/${IDS.daniel}`);
    await expect(titulo(page, /Daniel Rocha/)).toBeVisible();
    await page.getByRole('tab', { name: 'Acesso' }).click();
    await expect(page.getByText('Esta pessoa não tem conta.')).toBeVisible();

    await page.getByRole('button', { name: 'Criar conta' }).click();
    const criar = page.getByRole('dialog', { name: 'Criar a conta de Daniel Rocha' });
    await criar.getByRole('textbox', { name: 'Usuário' }).fill('Daniel.Rocha');
    await criar.getByRole('button', { name: 'Criar conta' }).click();

    const criada = page.getByRole('dialog', { name: 'Conta criada' });
    await expect(criada.getByRole('group', { name: 'Senha temporária' })).toContainText(
      SENHA_TEMPORARIA,
    );
    await expect(criada).toContainText('Passe à pessoa o usuário daniel.rocha');
    await expect(criada).toContainText('Esta senha não aparece de novo.');
    expect(api.corposDe(`POST /api/pessoas/${IDS.daniel}/conta`)).toEqual([
      { usuario: 'daniel.rocha', exigeDoisPassos: false },
    ]);

    await criada.getByRole('button', { name: 'Concluir' }).click();
    await expect(criada).toHaveCount(0);
    await expect(valorDe(page, 'Usuário')).toHaveText('daniel.rocha');
    await expect(valorDe(page, 'Senha')).toHaveText(
      'Temporária: a próxima entrada pede uma senha nova.',
    );
    await expect(page.getByText(SENHA_TEMPORARIA)).toHaveCount(0);
  });

  test('atribui um perfil num local, e a conta passa a poder só nele', async ({ page }) => {
    const api = await simularAdministracao(page);
    await page.goto(`/administracao/pessoas/${IDS.carla}`);
    await expect(titulo(page, /Carla Dias/)).toBeVisible();
    await page.getByRole('tab', { name: 'Acesso' }).click();
    await expect(page.getByText('Esta conta não tem perfis.')).toBeVisible();

    await page.getByRole('button', { name: 'Atribuir perfil' }).click();
    const dialogo = await preencherAtribuicao(
      page,
      'Atribuir um perfil a Carla Dias',
      'Consulta de pessoas',
      'Jundiaí',
    );
    await expect(dialogo.getByRole('region', { name: 'Resultado' })).toContainText(
      'Carla Dias passa a ter Consulta de pessoas em Jundiaí e no que está dentro.',
    );
    await dialogo.getByRole('button', { name: 'Atribuir perfil' }).click();

    await expect(dialogo).toHaveCount(0);
    await expect(avisos(page).getByText('Perfil atribuído.')).toBeVisible();
    expect(api.corposDe('POST /api/atribuicoes')).toEqual([
      { perfilId: IDS.consultaDePessoas, contaId: IDS.contaDaCarla, localId: IDS.jundiai },
    ]);
    const perfis = page.getByRole('list', { name: 'Perfis da conta' });
    await expect(perfis).toContainText('Consulta de pessoas');
    await expect(perfis).toContainText('Jundiaí · Atribuído direto à conta');
    const pode = page.getByRole('list', { name: 'O que esta conta pode fazer' });
    await expect(pode.locator(':scope > li')).toHaveCount(1);
    await expect(pode).toContainText('Ver pessoas e contas — Jundiaí');
    await expect(pode).toContainText(
      'Vem do perfil Consulta de pessoas em Jundiaí, atribuído direto à conta.',
    );
  });

  test('cadastra um local na raiz e o move para dentro de outro', async ({ page }) => {
    const api = await simularAdministracao(page);
    await page.goto('/administracao/locais');
    await expect(page.getByRole('treegrid', { name: 'Locais' })).toBeVisible();

    await page.getByRole('button', { name: 'Novo local' }).click();
    const gaveta = page.getByRole('dialog', { name: 'Novo local na raiz' });
    await gaveta.getByRole('textbox', { name: 'Nome' }).fill('Almoxarifado');
    await gaveta.getByRole('button', { name: /Tipo/ }).click();
    await page.getByRole('option', { name: 'Setor' }).click();
    await gaveta.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(gaveta).toHaveCount(0);
    await expect(avisos(page).getByText('Local cadastrado.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Almoxarifado' })).toBeVisible();
    await expect(page.getByRole('row', { name: 'Almoxarifado, Setor' })).toHaveAttribute(
      'aria-level',
      '1',
    );

    await page.getByRole('button', { name: 'Mover para…' }).click();
    const mover = page.getByRole('dialog', { name: 'Mover Almoxarifado para…' });
    await escolherLocal(page, 'Para dentro de', 'Jundiaí › Expedição', mover);
    await mover.getByRole('button', { name: 'Mover', exact: true }).click();

    await expect(mover).toHaveCount(0);
    await expect(avisos(page).getByText('Local movido.')).toBeVisible();
    const [novo] = api.estado.locais.filter((local) => local.nome === 'Almoxarifado');
    expect(api.corposDe(`POST /api/locais/${novo?.id}/movimento`)).toEqual([
      { paiId: IDS.expedicao },
    ]);
    const movido = page.getByRole('row', { name: 'Almoxarifado, Setor' });
    await expect(movido).toHaveAttribute('aria-level', '3');
    await expect(movido).toBeFocused();
    await expect(valorDe(page, 'Caminho')).toHaveText('Jundiaí › Expedição › Almoxarifado');
  });

  test('filtra a auditoria pelo código de rastreio, que fica no endereço', async ({ page }) => {
    const api = await simularAdministracao(page);
    await page.goto('/administracao/auditoria');
    const registros = page.getByRole('grid', { name: 'Registros da auditoria' });
    await expect(page.getByText('3 registros')).toBeVisible();

    await page.getByRole('textbox', { name: 'Código de rastreio' }).fill('r7k2-9qxm');
    await expect(page).toHaveURL(/[?&]rastreio=R7K2-9QXM/);
    await expect(page.getByText('1 registro', { exact: true })).toBeVisible();
    // A primeira linha é a do cabeçalho.
    await expect(registros.getByRole('row')).toHaveCount(2);
    await expect(registros.getByRole('row').nth(1)).toContainText('Local cadastrado');
    await expect(page.getByRole('group', { name: 'Filtros ativos' })).toContainText(
      'Código de rastreio · R7K2-9QXM',
    );
    expect(api.consultasA('/api/auditoria').at(-1)?.get('rastreio')).toBe('R7K2-9QXM');

    // O endereço com o filtro abre a lista já filtrada.
    await page.reload();
    await expect(page.getByText('1 registro', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Código de rastreio' })).toHaveValue(
      'R7K2-9QXM',
    );
  });

  test('troca a foto da pessoa na ficha, e a foto nova aparece na ficha e na lista', async ({
    page,
  }) => {
    const api = await simularAdministracao(page);
    await page.goto(`/administracao/pessoas/${IDS.carla}`);
    await expect(titulo(page, /Carla Dias/)).toBeVisible();

    const envio = page.waitForRequest(
      (pedido) =>
        pedido.method() === 'PUT' && pedido.url().endsWith(`/api/pessoas/${IDS.carla}/foto`),
    );
    await enviarImagem(page, 'Foto de Carla Dias', 'Trocar foto', RETRATO);
    // Os bytes crus da imagem, com o token da sessão.
    const pedido = await envio;
    expect(pedido.headers()['content-type']).toBe('application/octet-stream');
    expect(pedido.headers()['x-grafite-csrf']).toBe('csrf-de-teste');
    await expect(avisos(page).getByText('Foto trocada.')).toBeVisible();

    const foto = api.estado.pessoas.find((pessoa) => pessoa.id === IDS.carla)?.foto;
    expect(foto).toBeTruthy();
    const miniatura = new RegExp(`/api/pessoas/${IDS.carla}/foto/${foto?.id}/64 64w`);
    const noTitulo = titulo(page, /Carla Dias/).locator('img');
    await expect(noTitulo).toHaveAttribute('srcset', miniatura);
    await expect
      .poll(() => noTitulo.evaluate((imagem: HTMLImageElement) => imagem.naturalWidth))
      .toBeGreaterThan(0);

    await secoes(page).getByRole('link', { name: 'Pessoas' }).click();
    await expect(page.getByRole('row', { name: /Carla Dias/ }).locator('img')).toHaveAttribute(
      'srcset',
      miniatura,
    );
  });

  test('"Tentar de novo" põe a tarefa com falha de volta na fila, e ela sai da lista', async ({
    page,
  }) => {
    const api = await simularAdministracao(page);
    await page.goto('/administracao/tarefas');
    await expect(titulo(page, 'Tarefas')).toBeVisible();
    const tarefas = page.getByRole('list', { name: 'Tarefas com falha' }).getByRole('listitem');
    await expect(tarefas).toHaveCount(2);

    await tarefas.first().getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(avisos(page).getByText('Tarefa de volta na fila.')).toBeVisible();
    await expect(tarefas).toHaveCount(1);
    await expect(tarefas.first()).toContainText('05/10/2026');
    expect(
      api.corposDe(`POST /api/tarefas-com-falha/${IDS.manutencaoDeOntem}/repeticao`),
    ).toHaveLength(1);
  });

  test('salva os padrões da organização, e sair com mudanças pede confirmação', async ({
    page,
    servidor,
  }) => {
    await simularAdministracao(page);
    await page.goto('/administracao/padroes/aparencia');
    await expect(titulo(page, 'Padrões')).toBeVisible();
    await expect(page.getByText('Nenhuma mudança para salvar.')).toBeVisible();

    await escolher(page, 'Tema', 'Névoa');
    await expect(page.getByText('1 ajuste mudou.')).toBeVisible();
    // A casca de quem edita só muda depois de salvar.
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'grafite');

    const gravacao = page.waitForRequest(
      (pedido) => pedido.method() === 'PATCH' && pedido.url().endsWith('/api/organizacao/padroes'),
    );
    await page.getByRole('button', { name: 'Salvar padrões' }).click();
    expect((await gravacao).postDataJSON()).toEqual({ mudancas: { aparencia: { tema: 'nevoa' } } });
    await expect(avisos(page).getByText('Padrões salvos.')).toBeVisible();
    await expect(page.getByText('Nenhuma mudança para salvar.')).toBeVisible();
    // A administradora não escolheu um tema nos Ajustes dela: o padrão novo vale na casca dela.
    await expect(html).toHaveAttribute('data-theme', 'nevoa');

    // Uma mudança sem salvar: sair da tela pede confirmação, e trocar de aba, não.
    await page.getByRole('tab', { name: 'Dock' }).click();
    await escolher(page, 'Posição', 'À esquerda');
    await expect(page.getByText('1 ajuste mudou.')).toBeVisible();
    const confirmacao = page.getByRole('alertdialog', {
      name: 'Descartar as mudanças nos padrões?',
    });
    await secoes(page).getByRole('link', { name: 'Pessoas' }).click();
    await confirmacao.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(confirmacao).toBeHidden();
    await expect(page).toHaveURL(/\/administracao\/padroes\/dock$/);
    await expect(page.getByText('1 ajuste mudou.')).toBeVisible();

    await secoes(page).getByRole('link', { name: 'Pessoas' }).click();
    await confirmacao.getByRole('button', { name: 'Descartar mudanças' }).click();
    await expect(titulo(page, 'Pessoas')).toBeVisible();
    expect(servidor.padroesDaOrganizacao).toEqual({ aparencia: { tema: 'nevoa' } });
  });
});

test.describe('conta sem permissões', () => {
  test.use({ semPermissoes: true });

  test('o dock e a busca não oferecem a Administração', async ({ page }) => {
    await page.goto('/');
    await expect(dock(page).getByRole('button', { name: 'Ajustes' })).toBeVisible();
    await expect(dock(page).getByRole('button', { name: 'Administração' })).toHaveCount(0);

    await page.keyboard.press('Control+k');
    await page.keyboard.type('pessoas');
    const busca = page.getByRole('dialog', { name: 'Busca' });
    await expect(busca.getByText('Nada encontrado para “pessoas”.')).toBeVisible();
    await expect(busca.getByRole('option', { name: /Pessoas|Nova pessoa/ })).toHaveCount(0);
  });

  test('o endereço da Administração diz a quem pedir acesso', async ({ page }) => {
    const api = await simularAdministracao(page);
    await page.goto('/administracao/pessoas');
    await expect(titulo(page, 'Administração')).toBeVisible();
    await expect(page.getByText('Você não tem acesso à Administração.')).toBeVisible();
    await expect(page.getByText('Peça acesso a Ana Souza.')).toBeVisible();
    expect(api.consultasA('/api/pessoas')).toEqual([]);
  });
});

test('sem acessos.ver, o endereço de Perfis diz a quem pedir acesso, sem pedir os perfis', async ({
  page,
}) => {
  const api = await simularAdministracao(page);
  const soPessoas = sessaoDe({ usuario: 'bruno.costa', nome: 'Bruno Costa' }, [
    { chave: 'pessoas.ver', organizacao: true, locais: [] },
  ]);
  await page.route('**/api/sessao', (rota) =>
    rota.request().method() === 'GET' ? rota.fulfill({ json: soPessoas }) : rota.fallback(),
  );
  await page.goto('/administracao/perfis');
  await expect(titulo(page, 'Perfis')).toBeVisible();
  await expect(page.getByText('Você não tem acesso a Perfis.')).toBeVisible();
  await expect(page.getByText('Peça acesso a Ana Souza.')).toBeVisible();
  await expect(secoes(page).getByRole('link')).toHaveText(['Pessoas']);
  expect(api.consultasA('/api/perfis')).toEqual([]);
});

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a Administração fica em "Mais", e a lista e a seção aparecem uma de cada vez', async ({
    page,
  }) => {
    await simularAdministracao(page);
    await page.goto('/');
    const abas = page.getByRole('navigation', { name: 'Módulos' });
    await expect(abas.getByRole('button', { name: 'Administração' })).toHaveCount(0);

    await abas.getByRole('button', { name: 'Mais' }).tap();
    await page
      .getByRole('dialog', { name: 'Mais' })
      .getByRole('button', { name: 'Administração' })
      .tap();
    await expect(page).toHaveURL(/\/administracao$/);
    await expect(abas.getByRole('button', { name: 'Mais' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(secoes(page).getByRole('link')).toHaveText([
      'Pessoas',
      'Perfis',
      'Grupos',
      'Diretório',
      'Locais',
      'Fornecedores',
      'Padrões',
      'Módulos',
      'Coletores',
      'Agentes',
      'Auditoria',
      'Tarefas',
    ]);
    await semRolagemHorizontal(page);

    await secoes(page).getByRole('link', { name: 'Locais' }).tap();
    await expect(page.getByRole('treegrid', { name: 'Locais' })).toBeVisible();
    await expect(secoes(page)).toBeHidden();
    await semRolagemHorizontal(page);
  });

  test('os padrões cabem na tela: as sete seções rolam de lado, e a barra do rascunho quebra a linha', async ({
    page,
  }) => {
    await simularAdministracao(page);
    await page.goto('/administracao/padroes/aparencia');
    await expect(page.getByRole('heading', { level: 1, name: 'Padrões' })).toBeVisible();
    await escolher(page, 'Tema', 'Papel');
    await expect(page.getByText('1 ajuste mudou.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar padrões' })).toBeInViewport();
    await semRolagemHorizontal(page);

    const secoesDosPadroes = page.getByRole('tablist', { name: 'Seções dos padrões' });
    await secoesDosPadroes.getByRole('tab', { name: 'Acessibilidade' }).tap();
    await expect(page).toHaveURL(/\/administracao\/padroes\/acessibilidade$/);
    await expect(secoesDosPadroes.getByRole('tab', { name: 'Acessibilidade' })).toBeInViewport();
    await semRolagemHorizontal(page);
  });
});
