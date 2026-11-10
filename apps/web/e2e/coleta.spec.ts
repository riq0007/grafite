import type { Page } from '@playwright/test';
import { IDS_DO_CATALOGO } from './api-do-catalogo.ts';
import { IDS_DOS_ATIVOS, simularAtivos } from './api-dos-ativos.ts';
import { simularColetores } from './api-dos-coletores.ts';
import { abrirCartao } from './etapas.ts';
import { expect, test } from './fixtures.ts';

// Specs coletor-local, disponibilidade-de-rede, impressoras-por-snmp, saude-do-control-id e
// modulo-administracao, com a web compilada e a API simulada: os coletores na Administração, o campo
// de IP do ping no tipo, a coluna Disponibilidade, o painel e a coluna Suprimentos das impressoras, e
// a saúde e a coluna do Control iD.

const titulo = (pagina: Page, nome: string | RegExp) =>
  pagina.getByRole('heading', { level: 1, name: nome });
const avisos = (pagina: Page) => pagina.getByRole('region', { name: /Avisos/ });
const tabela = (pagina: Page) => pagina.getByRole('grid', { name: 'Ativos', exact: true });
const linha = (pagina: Page, texto: string) =>
  tabela(pagina).getByRole('row').filter({ hasText: texto });

/** Marca uma caixa clicando no rótulo dela, como o usuário. */
const marcar = (pagina: Page, nome: string | RegExp) =>
  pagina
    .locator('label')
    .filter({ has: pagina.getByRole('checkbox', { name: nome }) })
    .click();

test.describe('os coletores', () => {
  test('cadastra um coletor com as faixas, copia o token e depois o troca', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const api = await simularColetores(page);
    await page.goto('/administracao/coletores');
    await expect(page.getByText('Nenhum coletor ainda.')).toBeVisible();
    await page.getByRole('button', { name: 'Novo coletor' }).first().click();
    await expect(titulo(page, 'Novo coletor')).toBeVisible();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Coletor de Jundiaí');
    await page.getByRole('textbox', { name: 'Faixas de rede' }).fill('10.0.0.0/24\n10.0.5.0/24');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();

    const dialogo = page.getByRole('dialog', { name: 'Token do Coletor de Jundiaí' });
    await expect(dialogo.getByText('Copie o token agora: ele não aparece de novo.')).toBeVisible();
    const primeiro = api.ultimoToken ?? '';
    await expect(dialogo.getByText(primeiro)).toBeVisible();
    await dialogo.getByRole('button', { name: 'Copiar' }).click();
    await expect(dialogo.getByRole('button', { name: 'Copiado' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(primeiro);
    await dialogo.getByRole('button', { name: 'Fechar' }).click();

    await expect(titulo(page, /Coletor de Jundiaí/)).toBeVisible();
    await expect(page).toHaveURL(/\/administracao\/coletores\/[0-9a-f-]+$/);
    await expect(page.getByText(primeiro)).toHaveCount(0);
    expect(api.coletores.map(({ nome, faixas }) => ({ nome, faixas }))).toEqual([
      { nome: 'Coletor de Jundiaí', faixas: ['10.0.0.0/24', '10.0.5.0/24'] },
    ]);

    await page.getByRole('button', { name: 'Trocar o token' }).click();
    const confirmacao = page.getByRole('alertdialog', {
      name: 'Trocar o token do Coletor de Jundiaí?',
    });
    await expect(confirmacao).toContainText('O token atual para de valer na hora');
    await confirmacao.getByRole('button', { name: 'Trocar o token' }).click();
    const novo = page.getByRole('dialog', { name: 'Token do Coletor de Jundiaí' });
    await expect(novo.getByText(api.ultimoToken ?? '?')).toBeVisible();
    expect(api.ultimoToken).not.toBe(primeiro);
    await expect(avisos(page).getByText('Token trocado.')).toBeVisible();
    await novo.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByText(api.ultimoToken ?? '?')).toHaveCount(0);
  });
});

test.describe('a disponibilidade na rede', () => {
  test('o tipo liga a disponibilidade escolhendo o campo de IP do ping', async ({ page }) => {
    const api = await simularAtivos(page);
    // A impressora ganha um segundo campo de IP: a ficha pede a escolha.
    const ipDaGerencia = '00000000-0000-4000-8000-000000000141';
    api.catalogo.campos.push({
      id: ipDaGerencia,
      rotulo: 'IP da gerência',
      tipo: 'ip',
      grupo: 'Rede',
      configuracao: {},
      restrito: false,
      escrita: 'manual',
      situacao: 'ativo',
    });
    const impressora = api.catalogo.tipos.find(({ id }) => id === IDS_DO_CATALOGO.impressora);
    impressora?.campos.push({ campoId: ipDaGerencia, obrigatorio: false });

    await page.goto(`/gestao/catalogo/tipos/${IDS_DO_CATALOGO.impressora}`);
    await expect(titulo(page, /Impressora/)).toBeVisible();
    await marcar(page, /^Disponibilidade na rede/);
    await page.getByRole('button', { name: /Campo de IP do ping/ }).click();
    await expect(page.getByRole('option')).toHaveText(['IP', 'IP da gerência']);
    await page.getByRole('option', { name: 'IP da gerência', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(avisos(page).getByText('Tipo salvo.')).toBeVisible();
    expect(impressora).toMatchObject({
      capacidades: ['rede.disponibilidade'],
      configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: ipDaGerencia } },
    });
  });

  test('a coluna mostra a situação em texto e filtra pelos offline', async ({ page }) => {
    const api = await simularAtivos(page);
    const impressora = api.catalogo.tipos.find(({ id }) => id === IDS_DO_CATALOGO.impressora);
    Object.assign(impressora ?? {}, {
      capacidades: ['rede.disponibilidade'],
      configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: IDS_DOS_ATIVOS.ip } },
    });
    const agora = Date.now();
    const leitura = (situacao: 'online' | 'offline', minutos: number) => ({
      situacao,
      momento: new Date(agora - minutos * 60_000).toISOString(),
      desde: new Date(agora - 60 * 60_000).toISOString(),
      motivo: null,
      latencia: situacao === 'online' ? { valor: 3, inconsistente: false } : null,
      coletor: 'Coletor de Jundiaí',
    });
    for (const ativo of api.ativos) {
      if (ativo.id === IDS_DOS_ATIVOS.daExpedicao) ativo.disponibilidade = leitura('online', 1);
      if (ativo.id === IDS_DOS_ATIVOS.doRh) ativo.disponibilidade = leitura('offline', 20);
    }

    await page.goto('/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.disponibilidade');
    await expect(linha(page, 'HP LaserJet M404')).toContainText('Online');
    await expect(linha(page, 'Impressora do RH')).toContainText('Offline');
    await expect(linha(page, 'Impressora do RH')).toContainText('Desatualizado');

    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Filtros' });
    await editor.getByRole('option', { name: 'Disponibilidade', exact: true }).click();
    // Cada situação diz quantos ativos traz.
    await editor
      .locator('label')
      .filter({ has: page.getByRole('checkbox', { name: 'Offline (1)' }) })
      .click();
    await editor.getByRole('button', { name: 'Mostrar 1 ativo' }).click();
    await expect(page.getByRole('group', { name: 'Filtros ativos' })).toContainText(
      'Disponibilidade',
    );
    await expect(linha(page, 'Impressora do RH')).toBeVisible();
    await expect(linha(page, 'HP LaserJet M404')).toHaveCount(0);
  });

  // A célula numa linha só (spec componentes-base, "Célula numa linha só"; change
  // celulas-numa-linha, design, decisão 5).
  test('a coluna estreita não aumenta a linha, e o resumo traz o valor inteiro', async ({
    page,
  }) => {
    // O relógio falso adianta a pausa de 1,5 s do resumo, como no teste dele.
    await page.clock.install();
    const api = await simularAtivos(page);
    const impressora = api.catalogo.tipos.find(({ id }) => id === IDS_DO_CATALOGO.impressora);
    Object.assign(impressora ?? {}, {
      capacidades: ['rede.disponibilidade'],
      configuracaoDasCapacidades: { 'rede.disponibilidade': { campoDoIp: IDS_DOS_ATIVOS.ip } },
    });
    const agora = Date.now();
    const leitura = (situacao: 'online' | 'offline', minutos: number) => ({
      situacao,
      momento: new Date(agora - minutos * 60_000).toISOString(),
      desde: new Date(agora - 60 * 60_000).toISOString(),
      motivo: null,
      latencia: situacao === 'online' ? { valor: 3, inconsistente: false } : null,
      coletor: 'Coletor de Jundiaí',
    });
    for (const ativo of api.ativos) {
      if (ativo.id === IDS_DOS_ATIVOS.daExpedicao) ativo.disponibilidade = leitura('online', 1);
      if (ativo.id === IDS_DOS_ATIVOS.doRh) ativo.disponibilidade = leitura('offline', 20);
    }
    const altura = async (texto: string) => (await linha(page, texto).boundingBox())?.height ?? 0;
    /** A altura da célula composta da linha: uma linha de texto cabe na da tabela. */
    const alturaDoComposto = (texto: string) =>
      linha(page, texto)
        .locator('[data-parte="fixo"]')
        .evaluate((fixo) => fixo.parentElement?.getBoundingClientRect().height ?? 0);

    // Na largura de fábrica, a situação e a idade aparecem inteiras.
    await page.goto('/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.disponibilidade');
    await expect(linha(page, 'HP LaserJet M404')).toContainText('Online');
    const idade = linha(page, 'HP LaserJet M404').locator('[data-parte="resto"]');
    expect(await idade.evaluate((parte) => parte.scrollWidth <= parte.clientWidth)).toBe(true);
    const deFabrica = await altura('HP LaserJet M404');
    expect(deFabrica).toBeGreaterThan(0);

    // Com a coluna em 64 px, a menor largura, nenhuma linha cresce nem quebra em duas.
    await page.goto('/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.disponibilidade:64');
    await expect(linha(page, 'Impressora do RH')).toContainText('Offline');
    for (const texto of ['HP LaserJet M404', 'Impressora do RH']) {
      expect(await altura(texto)).toBe(deFabrica);
      expect(await alturaDoComposto(texto)).toBeLessThanOrEqual(deFabrica);
    }

    // O que a célula cortou aparece inteiro no resumo da linha.
    const nome = linha(page, 'Impressora do RH').getByText('Impressora do RH');
    const resumo = page.getByRole('tooltip');
    await expect(async () => {
      await page.mouse.move(0, 0);
      await nome.hover();
      await page.clock.fastForward(1_500);
      await expect(resumo).toBeVisible({ timeout: 4_000 });
    }).toPass({ timeout: 15_000 });
    await expect(resumo).toContainText('Disponibilidade');
    await expect(resumo).toContainText('Offline');
  });
});

test.describe('os suprimentos das impressoras', () => {
  /** A impressora com os suprimentos ligados, e o painel dado em cada ativo. */
  async function comSuprimentos(page: Page, niveis: { daExpedicao: number; doRh: number }) {
    const api = await simularAtivos(page);
    const impressora = api.catalogo.tipos.find(({ id }) => id === IDS_DO_CATALOGO.impressora);
    Object.assign(impressora ?? {}, {
      capacidades: ['snmp.suprimentos'],
      configuracaoDasCapacidades: {
        'snmp.suprimentos': { campoDoIp: IDS_DOS_ATIVOS.ip, versao: '2c', segredoId: null },
      },
    });
    const momento = new Date(Date.now() - 3 * 60_000).toISOString();
    const painel = (nivel: number, paginas: number) => ({
      motivo: null,
      resposta: {
        situacao: 'respondeu' as const,
        momento,
        desde: new Date(Date.now() - 600 * 60_000).toISOString(),
        coletor: 'Coletor de Jundiaí',
      },
      suprimentos: [
        {
          item: '1',
          descricao: 'Black Toner Cartridge',
          tipo: 'toner' as const,
          nivel: { tipo: 'medido' as const, percentual: nivel },
          momento,
        },
        {
          item: '2',
          descricao: 'Imaging Drum Unit',
          tipo: 'cilindro' as const,
          nivel: { tipo: 'medido' as const, percentual: 60 },
          momento,
        },
      ],
      contadores: [
        { item: '1', rotulo: 'Total de páginas', paginas, inconsistente: false, momento },
      ],
      paginasEmPretoEBranco: paginas,
      condicoes: { itens: [], momento },
      mensagens: { itens: [], momento },
      menor: {
        nivel: Math.min(nivel, 60),
        descricao: nivel < 60 ? 'Black Toner Cartridge' : 'Imaging Drum Unit',
        momento,
      },
      total: { paginas, momento },
    });
    for (const ativo of api.ativos) {
      if (ativo.id === IDS_DOS_ATIVOS.daExpedicao) {
        ativo.painelDeSuprimentos = painel(niveis.daExpedicao, 12500);
      }
      if (ativo.id === IDS_DOS_ATIVOS.doRh) ativo.painelDeSuprimentos = painel(niveis.doRh, 48210);
    }
    return api;
  }

  test('a ficha da impressora mostra o painel Suprimentos, com cada nível em texto', async ({
    page,
  }) => {
    await comSuprimentos(page, { daExpedicao: 8, doRh: 45 });
    await page.goto(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}`);
    await abrirCartao(page, 'Suprimentos e contadores');
    const painel = page.getByRole('region', { name: 'Suprimentos' });
    await expect(painel.getByText('Respondeu', { exact: true })).toBeVisible();
    await expect(painel.getByText('há 3 min').first()).toBeVisible();
    // Os cartuchos (change suprimentos-rostos-e-backups): o título traz o tipo e a descrição.
    const niveis = painel.getByRole('list', { name: 'Níveis dos suprimentos' });
    await expect(niveis.getByTitle('Toner · Black Toner Cartridge')).toContainText('8%');
    await expect(niveis.getByTitle('Cilindro · Imaging Drum Unit')).toContainText('60%');
    await expect(painel.getByText('12.500').first()).toBeVisible();
    await expect(painel.getByText('Nenhuma condição informada.')).toBeVisible();
  });

  test('a coluna Suprimentos filtrada até 20% traz só a impressora com pouco toner', async ({
    page,
  }) => {
    await comSuprimentos(page, { daExpedicao: 8, doRh: 45 });
    await page.goto('/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.suprimentos,coleta.paginas');
    await expect(linha(page, 'HP LaserJet M404')).toContainText('8%');
    await expect(linha(page, 'HP LaserJet M404')).toContainText('Black Toner Cartridge');
    await expect(linha(page, 'Impressora do RH')).toContainText('45%');

    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Filtros' });
    await editor.getByRole('option', { name: 'Suprimentos', exact: true }).click();
    await editor.getByRole('textbox', { name: 'Até (%)' }).fill('20');
    await editor.getByRole('button', { name: 'Aplicar filtro' }).click();
    await expect(page.getByRole('group', { name: 'Filtros ativos' })).toContainText('até 20%');
    await expect(linha(page, 'HP LaserJet M404')).toBeVisible();
    await expect(linha(page, 'Impressora do RH')).toHaveCount(0);
  });

  // O valor inteiro no resumo (spec tabelas-configuraveis, "Resumo da linha"; change
  // celulas-numa-linha, design, decisão 3).
  test('com a coluna Suprimentos estreita, o resumo da linha traz o suprimento inteiro', async ({
    page,
  }) => {
    // O relógio falso adianta a pausa de 1,5 s do resumo, como no teste dele.
    await page.clock.install();
    await comSuprimentos(page, { daExpedicao: 8, doRh: 45 });
    await page.goto('/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.suprimentos:64');
    await expect(linha(page, 'HP LaserJet M404')).toContainText('8%');

    const nome = linha(page, 'HP LaserJet M404').getByText('HP LaserJet M404');
    const resumo = page.getByRole('tooltip');
    await expect(async () => {
      await page.mouse.move(0, 0);
      await nome.hover();
      await page.clock.fastForward(1_500);
      await expect(resumo).toBeVisible({ timeout: 4_000 });
    }).toPass({ timeout: 15_000 });
    await expect(resumo).toContainText('Suprimentos');
    await expect(resumo).toContainText('Black Toner Cartridge');
    await expect(resumo).toContainText('há 3 min');

    // A descrição e a idade, que a célula cortou, não terminam em reticências nem saem do resumo.
    const resto = resumo.locator('[data-parte="resto"]');
    expect(await resto.evaluate((parte) => parte.scrollWidth <= parte.clientWidth + 1)).toBe(true);
    const caixa = await resumo.boundingBox();
    const lugar = await resto.boundingBox();
    expect(caixa).not.toBeNull();
    expect(lugar).not.toBeNull();
    expect((lugar?.x ?? 0) + (lugar?.width ?? 0)).toBeLessThanOrEqual(
      (caixa?.x ?? 0) + (caixa?.width ?? 0),
    );
    expect((lugar?.y ?? 0) + (lugar?.height ?? 0)).toBeLessThanOrEqual(
      (caixa?.y ?? 0) + (caixa?.height ?? 0),
    );
  });
});

test.describe('a saúde do Control iD', () => {
  /** O tipo com a saúde ligada, e a saúde dada em cada ativo. */
  async function comASaude(page: Page) {
    const api = await simularAtivos(page);
    const tipo = api.catalogo.tipos.find(({ id }) => id === IDS_DO_CATALOGO.impressora);
    Object.assign(tipo ?? {}, {
      capacidades: ['controlid.saude'],
      configuracaoDasCapacidades: {
        'controlid.saude': {
          campoDoIp: IDS_DOS_ATIVOS.ip,
          porta: 80,
          segredoId: '0199d3a0-0000-7000-8000-00000000d001',
        },
      },
    });
    const momento = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();
    const saude = (situacao: 'respondendo' | 'sem-resposta', minutos: number) => ({
      situacao,
      momento: momento(minutos),
      desde: momento(minutos),
      motivo: null,
      ultimoContato: momento(situacao === 'respondendo' ? minutos : minutos + 10),
      firmware: '6.12.2',
      produto: 'iDAccess Pro',
      login: 'tipo' as const,
      coletor: 'Coletor de Jundiaí',
    });
    for (const ativo of api.ativos) {
      if (ativo.id === IDS_DOS_ATIVOS.daExpedicao) ativo.controlId = saude('respondendo', 2);
      if (ativo.id === IDS_DOS_ATIVOS.doRh) ativo.controlId = saude('sem-resposta', 3);
    }
    return api;
  }

  test('a ficha do controle mostra a situação, o último contato, o firmware e o login', async ({
    page,
  }) => {
    await comASaude(page);
    await page.goto(`/ativos/${IDS_DOS_ATIVOS.daExpedicao}`);
    await abrirCartao(page, 'Saúde do Control iD');
    const saude = page.getByRole('region', { name: 'Saúde do Control iD' });
    await expect(saude.getByText('Respondendo', { exact: true })).toBeVisible();
    await expect(saude.getByText('há 2 min').first()).toBeVisible();
    await expect(saude).toContainText('6.12.2 · iDAccess Pro');
    await expect(saude).toContainText('Login do tipo');
    await expect(saude).toContainText('Coletor de Jundiaí');
  });

  test('a coluna Control iD filtrada por "Sem resposta" traz só o controle que não responde', async ({
    page,
  }) => {
    await comASaude(page);
    await page.goto('/ativos?visao=fabrica&colunas=ativo.rotulo,coleta.control-id');
    await expect(linha(page, 'HP LaserJet M404')).toContainText('Respondendo');
    await expect(linha(page, 'Impressora do RH')).toContainText('Sem resposta');

    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Filtros' });
    await editor.getByRole('option', { name: 'Control iD', exact: true }).click();
    await editor
      .locator('label')
      .filter({ has: page.getByRole('checkbox', { name: 'Sem resposta (1)' }) })
      .click();
    await editor.getByRole('button', { name: 'Mostrar 1 ativo' }).click();
    await expect(page.getByRole('group', { name: 'Filtros ativos' })).toContainText('Control iD');
    await expect(linha(page, 'Impressora do RH')).toBeVisible();
    await expect(linha(page, 'HP LaserJet M404')).toHaveCount(0);
  });
});
