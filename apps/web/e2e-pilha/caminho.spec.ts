import { spawn } from 'node:child_process';
import { createECDH, createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, gunzipSync } from 'node:zlib';
import { auditoria, criarBanco, naOrganizacao } from '@grafite/db';
import { REGRAS_DE_FABRICA } from '@grafite/domain';
import { expect, type Locator, type Page, test } from '@playwright/test';
import pg from 'pg';
import { decifrarPush } from '../../api/test/canais.ts';
import { csvDoExcel, xlsxDeTabela } from '../../api/test/planilhas.ts';
import { iniciarSimuladorControlId } from '../../collector/test/simulador-control-id.ts';
import { iniciarSimuladorSnmp } from '../../collector/test/simulador-snmp.ts';
import {
  campoDeLocal,
  escolherEscopoNumLocal,
  escolherLocal,
  preencherAtribuicao,
} from '../e2e/escolhas.ts';
import { abrirCartao, abrirEtapa, escolherModelo, etapa, etapaAberta } from '../e2e/etapas.ts';
import { PORTA_DA_PILHA } from '../playwright.pilha.config.ts';
import { ENDERECO_DA_PILHA } from './subir.ts';

// O caminho da primeira conta, de ponta a ponta e sem nada simulado (design do F2a, decisão 16):
// a senha temporária, a senha nova, o cadastro dos dois passos com o código gerado da chave na
// tela, a casca com "Esta sessão", a saída, a entrada com o código e a auditoria do caminho. Num
// navegador à parte, ela confia no aparelho, entra de novo só com a senha e, esquecido o aparelho nos
// Ajustes, volta a digitar o código (change aparelho-confiavel). Depois,
// a primeira conta, administradora, dá a uma conta nova só as pessoas de um local (design do F2b,
// decisão 17): a conta nova entra noutro navegador, troca a senha e vê só o que o perfil dá. Por
// fim (design do F2c, decisão 20), com as duas contas abertas, a administradora troca a foto da
// conta nova e o tema padrão, e a conta nova vê as duas mudanças sem recarregar; a administradora
// encerra as sessões dela, que volta à tela de entrada, e as preferências da conta nova aparecem
// num navegador novo. No meio (design do P1a, decisão 9), a conta nova ganha os modelos e vê, na
// tela de modelos aberta, o modelo que a administradora cadastra, sem recarregar. Depois (design do
// P1b, decisão 13), ela passa a ver os ativos e vê, na lista aberta, o ativo que a administradora
// cadastra, em etapas, com o rascunho retomado noutro navegador dela (change cadastro-em-etapas); o Ativos desligado pela administradora some do dock dela e volta ao ser ligado, tudo
// sem recarregar. Depois (design do P1c, decisão 10), a administradora cadastra um campo restrito
// e dá à conta nova os restritos só em Jundiaí; a visão que ela compartilha aparece no menu da conta
// nova pelo evento, e a pessoal, não; como padrão da organização, a compartilhada abre a tabela da
// conta nova, que vê o valor restrito só em Jundiaí. Por último (design do P1d), a imagem que a
// administradora envia aparece na tabela da conta nova, e a ligação livre que ela faz, na ficha
// aberta da conta nova, pelo evento; a conta nova baixa o PDF que a administradora envia, com o nome
// original, e o histórico dela não mostra a mudança do campo restrito em Campinas. Depois (design do
// P1e), a administradora importa um XLSX e um CSV de verdade, e a tabela aberta da conta nova mostra
// os ativos importados, pelo evento; a ficha mostra a origem "Planilha", com a autora. Por fim
// (design do P1f), a administradora abre a etiqueta pela ficha, e o endereço do QR, aberto num
// navegador sem sessão, pede a entrada e, depois dela, abre a ficha. Depois (design do P2a), a
// administradora cadastra o coletor com as faixas e liga a disponibilidade na impressora; o processo
// do coletor, de verdade e com o token da tela, pinga uma impressora em 127.0.0.1 e outra em
// 192.0.2.1, e a tabela aberta da conta nova mostra uma Online e a outra Offline, pelo evento. Com
// os suprimentos também ligados (change p2b-impressoras-por-snmp), o mesmo coletor lê a impressora
// de 127.0.0.1 no simulador SNMP, numa porta alta, e a ficha dela mostra o toner, o total de
// páginas e o número de série que a coleta gravou, com o coletor. Com a senha do switch no cofre
// (change p2c-saude-do-control-id), a administradora liga a saúde do Control iD na impressora com
// esse login, e o coletor de verdade sonda o simulador da API do Control iD numa porta alta: a ficha
// mostra "Respondendo", o firmware e o número de série que a sondagem gravou. Com os alertas
// (change p3a-regras-e-alertas) e as notificações deles (change p3b-notificacoes-no-servidor), a
// administradora baixa a regra de fábrica do toner antes da coleta e a sobe depois dela: o alerta
// do toner abre na hora, e o aviso Crítico aparece na tela da regra, com o sino contando a não
// lida. Ela reconhece pelo aviso, e a central mostra a notificação lida, com quem reconheceu; o
// alerta aparece em "O que resolver agora" e na ficha, que também dizem quem reconheceu. Com o
// e-mail e o push (change p3c-email-e-push), ela inscreve o navegador, com a inscrição simulada que
// aponta para o serviço de push falso da pilha, e o alerta do toner faz chegar o e-mail do crítico
// ao SMTP da pilha e o push, decifrado com as chaves da inscrição, ao serviço falso. Os indicadores
// (change p3d-indicadores) mostram o Crítico do toner reconhecido em menos de 1 min, dentro da meta,
// e o toner ainda sem troca, sem dado. Com os fornecedores (change p4a-fornecedores), a
// administradora cadastra a HP Brasil, a escolhe como fornecedor da PAT-00412 e a vê nos ativos do
// fornecedor. Com os consumíveis (change p4b-consumiveis), ela liga os consumíveis compatíveis na
// impressora, cadastra o CF258A com a HP Brasil e a HP LaserJet M404 e o vê no cartão da PAT-00412.
// Com o estoque (change p4c-estoque), ela lança a entrada de 10 CF258A no Almoxarifado, define o
// mínimo 5, lança a saída de 6 para a PAT-00412 e vê a ocorrência no Início. Com as ordens de
// serviço (change p4e-ordens-de-servico), ela abre a OS de um conserto da PAT-00412, lança nela 1
// Peça do Almoxarifado, resolve a OS e vê a solicitação concluída e a saída com "OS 1". Com os
// indicadores da operação (change p4f-indicadores-da-operacao), ela vê o tempo de resolução com a
// OS 1 e muda a meta das OS repetidas, que a auditoria registra. Por fim (changes
// inventario-pelo-agente-glpi e distribuicao-de-software), o teste faz o papel do agente do GLPI de um
// computador: o CONTACT no endereço que a administradora gera e, depois que ela liga o agente à
// PAT-00412 e distribui um pacote de 9 MB, o Deploy, com as partes conferidas pelo SHA-512; a ficha
// da distribuição mostra a máquina concluída, com o log.

declare global {
  interface Window {
    __mesmaPagina?: boolean;
  }
}

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A chave do app autenticador, em base32 (RFC 4648), como a tela a mostra. */
function deBase32(texto: string): Buffer {
  const bytes: number[] = [];
  let valor = 0;
  let bits = 0;
  for (const caractere of texto.replace(/\s/g, '').toUpperCase()) {
    valor = ((valor << 5) | ALFABETO_BASE32.indexOf(caractere)) & 0xffffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((valor >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/** O código de 6 dígitos de um passo de 30 s (RFC 6238), como um app autenticador o mostra. */
function codigoDoApp(chave: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', deBase32(chave)).update(contador).digest();
  const deslocamento = (hmac.at(-1) ?? 0) & 0xf;
  return String((hmac.readUInt32BE(deslocamento) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const passoAgora = () => Math.floor(Date.now() / 30_000);

/**
 * Cada navegador chega à API com um endereço próprio, como pelo proxy da produção, que a API
 * reconhece no 127.0.0.1: o limite de requisições é por IP, e o caminho, muito mais rápido que uma
 * pessoa, passaria das 600 por minuto se as duas contas e os coletores somassem num endereço só.
 */
const doEndereco = (final: number) => ({
  extraHTTPHeaders: { 'X-Forwarded-For': `198.51.100.${final}` },
});

/**
 * O mesmo navegador passa a chegar por outro endereço. Os trechos longos da administradora, com
 * uma recarga da página atrás da outra, passam das 600 por minuto num endereço só desde os módulos
 * de 28/10, que pesam mais na abertura da casca: ela troca de endereço no começo deles.
 */
const trocarDeEndereco = (pagina: Page, final: number) =>
  pagina.setExtraHTTPHeaders({ 'X-Forwarded-For': `198.51.100.${final}` });

test.use(doEndereco(1));

const SENHA_NOVA = 'cavalo bateria grampo correto';
const SENHA_DO_BRUNO = 'girassol trilho manga azulejo';

/** A senha temporária como a tela a mostra: 16 caracteres em grupos de 4. */
const FORMATO_DA_SENHA_TEMPORARIA = /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/;

const entrada = (pagina: Page) => pagina.locator('[data-tela-de-entrada]');
const titulo = (pagina: Page, nome: string) =>
  pagina.getByRole('heading', { level: 1, name: nome, exact: true });

async function entrarCom(pagina: Page, usuario: string, senha: string) {
  await entrada(pagina).getByLabel('Usuário').fill(usuario);
  const campo = entrada(pagina).getByLabel('Senha', { exact: true });
  await campo.fill(senha);
  await campo.press('Enter');
}

async function trocarASenha(pagina: Page, senha: string) {
  await expect(titulo(pagina, 'Crie a sua senha')).toBeVisible();
  await entrada(pagina).getByLabel('Senha nova', { exact: true }).fill(senha);
  await entrada(pagina).getByLabel('Confirmar a senha nova').fill(senha);
  await entrada(pagina).getByRole('button', { name: 'Trocar a senha' }).click();
}

const dock = (pagina: Page) => pagina.getByRole('navigation', { name: 'Dock' });
const secoes = (pagina: Page) =>
  pagina.getByRole('navigation', { name: 'Seções da Administração' });
const secoesDoCatalogo = (pagina: Page) =>
  pagina.getByRole('navigation', { name: 'Seções do catálogo' });

/**
 * Escolhe a sugestão de um campo de busca com sugestões, depois de digitar parte dela, até o campo
 * mostrá-la: as sugestões da API podem chegar no meio do clique, e o campo volta vazio.
 */
async function escolherSugestao(pagina: Page, campo: string, digitado: string, sugestao: string) {
  const entrada = pagina.getByRole('combobox', { name: campo, exact: true });
  await expect(async () => {
    await entrada.fill(digitado);
    await pagina.getByRole('option', { name: sugestao, exact: true }).click({ timeout: 2_000 });
    await expect(entrada).toHaveValue(sugestao, { timeout: 1_000 });
  }).toPass();
}

/**
 * Escolhe uma opção de uma seleção, como o usuário. O nome do botão termina pelo rótulo, depois da
 * opção escolhida, e só ele abre uma lista: a trava do campo tem o rótulo no nome também.
 */
async function selecionar(pagina: Page, rotulo: string, opcao: string) {
  await pagina
    .getByRole('button', { name: new RegExp(`${rotulo}$`) })
    .and(pagina.locator('[aria-haspopup="listbox"]'))
    .click();
  await pagina.getByRole('option', { name: opcao, exact: true }).click();
}

/** Liga ou desliga um módulo opcional na seção Módulos, clicando no rótulo do interruptor. */
const interruptorDoModulo = (pagina: Page, nome: string) =>
  pagina.locator('label').filter({ has: pagina.getByRole('switch', { name: nome }) });

/** Escolhe uma opção de um grupo de rádios clicando no rótulo, como o usuário. */
const escolher = (pagina: Page, grupo: string, nome: string) =>
  pagina
    .getByRole('radiogroup', { name: grupo })
    .locator('label')
    .filter({ has: pagina.getByRole('radio', { name: nome, exact: true }) })
    .click();

/** Um retrato em SVG, para enviar como foto. */
const RETRATO = fileURLToPath(new URL('../e2e/exemplos/retrato.svg', import.meta.url));

/** Um PDF mínimo, que a API reconhece pelo conteúdo. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n');

/** Escolhe uma imagem de um campo de escolha de imagem, pelo botão, como o usuário. */
async function enviarImagem(pagina: Page, campo: string, botao: string, arquivo: string) {
  const seletor = pagina.waitForEvent('filechooser');
  await pagina.getByRole('group', { name: campo }).getByRole('button', { name: botao }).click();
  await (await seletor).setFiles(arquivo);
}

/** A linha do ativo na tabela dos ativos, pelo texto dela, como o patrimônio. */
/** Abre a importação nova, escolhe a impressora e envia a planilha, que abre o rascunho. */
async function importarPlanilha(
  pagina: Page,
  arquivo: { name: string; mimeType: string; buffer: Buffer },
) {
  await pagina.goto('/gestao/importacoes/nova');
  await selecionar(pagina, 'Tipo dos ativos', 'Impressora');
  await pagina
    .getByRole('group', { name: 'Planilha' })
    .locator('input[type="file"]')
    .setInputFiles(arquivo);
  await expect(pagina.getByRole('heading', { level: 1, name: arquivo.name })).toBeVisible();
}

/** "Importar", com a confirmação, e a importação vai para a fila. */
async function confirmarAImportacao(pagina: Page, nome: string) {
  await pagina.getByRole('button', { name: 'Importar' }).click();
  await pagina
    .getByRole('alertdialog', { name: `Importar ${nome}?` })
    .getByRole('button', { name: 'Importar' })
    .click();
  await expect(pagina.getByText('Importação na fila.')).toBeVisible();
}

const linhaDosAtivos = (pagina: Page, texto: string) =>
  pagina
    .getByRole('grid', { name: 'Ativos', exact: true })
    .getByRole('row')
    .filter({ hasText: texto });

/** A escolha da visão da tabela, com o nome da visão aberta. */
const escolhaDaVisao = (pagina: Page) => pagina.getByRole('button', { name: /^Visão / });

/** O cabeçalho de uma coluna da tabela dos ativos, pelo rótulo. */
const colunaDosAtivos = (pagina: Page, rotulo: string) =>
  pagina
    .getByRole('grid', { name: 'Ativos', exact: true })
    .getByRole('columnheader', { name: new RegExp(`^${rotulo}`) });

/** Salva a tabela como uma visão nova, só da conta ou compartilhada com a organização. */
async function salvarComoNovaVisao(
  pagina: Page,
  nome: string,
  { compartilhada }: { compartilhada: boolean },
) {
  await escolhaDaVisao(pagina).click();
  await pagina.getByRole('menuitem', { name: 'Salvar como nova visão…' }).click();
  const dialogo = pagina.getByRole('dialog', { name: 'Salvar como nova visão' });
  await dialogo.getByRole('textbox', { name: 'Nome' }).fill(nome);
  if (compartilhada) await dialogo.getByText('Compartilhar com a organização').click();
  await dialogo.getByRole('button', { name: 'Salvar visão' }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(escolhaDaVisao(pagina)).toHaveAccessibleName(`Visão ${nome}`);
}

/** O botão do menu do usuário na barra, com o nome da pessoa da conta. */
const menuDoUsuario = (pagina: Page, nome: string) =>
  pagina.getByRole('banner').getByRole('button', { name: nome });

/** A imagem carregou de fato: o navegador a desenhou com largura. */
const carregada = (imagem: Locator) =>
  expect
    .poll(() => imagem.evaluate((elemento: HTMLImageElement) => elemento.naturalWidth))
    .toBeGreaterThan(0);

/** As ações da auditoria da organização, em ordem, lidas como a API lê: pelo papel da aplicação. */
async function acoesDaAuditoria(): Promise<string[]> {
  const pool = new pg.Pool({ connectionString: process.env.GRAFITE_PILHA_URL_DO_BANCO });
  try {
    const { rows } = await pool.query<{ id: string }>(
      'select app.organizacao_do_endereco($1) as id',
      [ENDERECO_DA_PILHA],
    );
    const organizacao = rows[0]?.id ?? '';
    const linhas = await naOrganizacao(criarBanco(pool), organizacao, (tx) =>
      tx.select({ acao: auditoria.acao }).from(auditoria).orderBy(auditoria.momento),
    );
    return linhas.map((linha) => linha.acao);
  } finally {
    await pool.end();
  }
}

test('a primeira conta entra com os dois passos e dá a uma conta nova só as pessoas de um local', async ({
  page,
  browser,
}) => {
  const senhaTemporaria = process.env.GRAFITE_PILHA_SENHA_TEMPORARIA ?? '';
  expect(senhaTemporaria).not.toBe('');

  // 1. A senha temporária leva à senha nova.
  await page.goto('/');
  await expect(titulo(page, 'Entrar')).toBeVisible();
  await expect(page.getByText('Empresa da pilha')).toBeVisible();
  await entrarCom(page, 'ana.souza', senhaTemporaria);
  await trocarASenha(page, SENHA_NOVA);

  // 2. O cadastro dos dois passos, com o código gerado da chave que a tela mostra.
  await expect(titulo(page, 'Cadastre a verificação em dois passos')).toBeVisible();
  const chave =
    (await entrada(page)
      .getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/)
      .textContent()) ?? '';
  const passoDoCadastro = passoAgora();
  await entrada(page).getByLabel('Código do app').fill(codigoDoApp(chave, passoDoCadastro));
  await entrada(page).getByRole('button', { name: 'Ativar' }).click();
  await expect(titulo(page, 'Guarde os códigos de recuperação')).toBeVisible();
  await expect(
    entrada(page).getByRole('list', { name: 'Códigos de recuperação' }).getByRole('listitem'),
  ).toHaveCount(10);
  await entrada(page).getByRole('button', { name: 'Continuar' }).click();

  // 3. A casca, com a conta, e "Esta sessão" na seção Conta.
  const usuario = page.getByRole('banner').getByRole('button', { name: 'Ana Souza' });
  await expect(usuario).toBeVisible();
  await usuario.click();
  await page.getByRole('menuitem', { name: 'Conta' }).click();
  await expect(titulo(page, 'Conta')).toBeVisible();
  const sessoes = page.getByRole('region', { name: 'Sessões' });
  await expect(sessoes.getByText('Esta sessão')).toBeVisible();

  // 4. Sai e entra de novo, agora com a senha nova e o código do app. O código do cadastro não
  // serve de novo: o passo seguinte está na janela que a API aceita.
  await usuario.click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(titulo(page, 'Entrar')).toBeVisible();
  await entrarCom(page, 'ana.souza', SENHA_NOVA);
  const codigo = entrada(page).getByLabel('Código do app');
  await expect(codigo).toBeVisible();
  const passoDaEntrada = Math.max(passoAgora(), passoDoCadastro + 1);
  // O último passo do app que a administradora usou: um código nunca vale duas vezes.
  let ultimoPassoDaAna = passoDaEntrada;
  await codigo.fill(codigoDoApp(chave, passoDaEntrada));
  await codigo.press('Enter');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Ana Souza' })).toBeVisible();

  // 5. A auditoria registrou o caminho. O comando no servidor grava a organização, o endereço, o
  // perfil Administrador, a pessoa, a conta, a atribuição do perfil e as regras de fábrica dos
  // alertas numa transação só, no mesmo instante; o resto vem na ordem do caminho.
  const acoes = await acoesDaAuditoria();
  const doComando = 6 + REGRAS_DE_FABRICA.length;
  expect(acoes.slice(0, doComando).sort()).toEqual([
    'atribuicao.criada',
    'conta.criada',
    'endereco.registrado',
    'organizacao.criada',
    'perfil.criado',
    'pessoa.criada',
    ...REGRAS_DE_FABRICA.map(() => 'regra-de-alerta.criada'),
  ]);
  const caminho = [
    'sessao.iniciada',
    'senha.trocada',
    'dois-passos.ativados',
    'sessao.encerrada',
    'sessao.iniciada',
    'entrada.concluida',
  ];
  let posicao = doComando - 1;
  for (const acao of caminho) {
    const achada = acoes.indexOf(acao, posicao + 1);
    expect(
      achada,
      `${acao} depois de ${acoes[posicao] ?? 'nada'} em ${acoes.join(', ')}`,
    ).toBeGreaterThan(posicao);
    posicao = achada;
  }

  // 5b. O aparelho confiável (change aparelho-confiavel), num navegador à parte, para o desta página
  // continuar pedindo o código: a entrada com o código marca o aparelho, a seguinte pede só a
  // senha, e o aparelho esquecido nos Ajustes faz a entrada pedir o código de novo.
  const confiavel = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    serviceWorkers: 'block',
    ...doEndereco(9),
  });
  try {
    const noAparelho = await confiavel.newPage();
    await noAparelho.goto('/');
    await entrarCom(noAparelho, 'ana.souza', SENHA_NOVA);
    const codigoNoAparelho = entrada(noAparelho).getByLabel('Código do app');
    await expect(codigoNoAparelho).toBeVisible();
    const caixa = entrada(noAparelho).getByRole('checkbox', {
      name: 'Confiar neste aparelho por 30 dias',
    });
    await expect(caixa).not.toBeChecked();
    await entrada(noAparelho).getByText('Confiar neste aparelho por 30 dias').click();
    await expect(caixa).toBeChecked();
    await expect.poll(passoAgora, { timeout: 40_000 }).toBeGreaterThanOrEqual(ultimoPassoDaAna);
    ultimoPassoDaAna = Math.max(passoAgora(), ultimoPassoDaAna + 1);
    await codigoNoAparelho.fill(codigoDoApp(chave, ultimoPassoDaAna));
    await codigoNoAparelho.press('Enter');
    const anaNoAparelho = noAparelho.getByRole('banner').getByRole('button', { name: 'Ana Souza' });
    await expect(anaNoAparelho).toBeVisible();

    // Sai e entra de novo só com a senha: a casca abre sem pedir o código.
    await anaNoAparelho.click();
    await noAparelho.getByRole('menuitem', { name: 'Sair' }).click();
    await expect(titulo(noAparelho, 'Entrar')).toBeVisible();
    await entrarCom(noAparelho, 'ana.souza', SENHA_NOVA);
    await expect(anaNoAparelho).toBeVisible();
    await expect(entrada(noAparelho)).toHaveCount(0);

    // Esquece este aparelho nos Ajustes: a entrada seguinte pede o código de novo.
    await anaNoAparelho.click();
    await noAparelho.getByRole('menuitem', { name: 'Conta' }).click();
    const aparelhos = noAparelho.getByRole('region', { name: 'Aparelhos confiáveis' });
    const este = aparelhos.getByRole('listitem').filter({ hasText: 'Este aparelho' });
    await expect(este).toHaveCount(1);
    await este.getByRole('button', { name: 'Esquecer' }).click();
    await expect(aparelhos.getByText('Aparelho esquecido.')).toBeVisible();
    await anaNoAparelho.click();
    await noAparelho.getByRole('menuitem', { name: 'Sair' }).click();
    await expect(titulo(noAparelho, 'Entrar')).toBeVisible();
    await entrarCom(noAparelho, 'ana.souza', SENHA_NOVA);
    await expect(entrada(noAparelho).getByLabel('Código do app')).toBeVisible();
  } finally {
    await confiavel.close();
  }

  // 6. A administradora cadastra o local, o perfil só com "Ver pessoas e contas" e a pessoa, cria a
  // conta dela e atribui o perfil no local.
  await dock(page).getByRole('button', { name: 'Administração' }).click();
  await expect(titulo(page, 'Pessoas')).toBeVisible();

  await secoes(page).getByRole('link', { name: 'Locais' }).click();
  await page.getByRole('button', { name: 'Novo local' }).click();
  const gaveta = page.getByRole('dialog', { name: 'Novo local na raiz' });
  await gaveta.getByRole('textbox', { name: 'Nome' }).fill('Jundiaí');
  await gaveta.getByRole('button', { name: /Tipo/ }).click();
  await page.getByRole('option', { name: 'Unidade' }).click();
  await gaveta.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Jundiaí' })).toBeVisible();

  await secoes(page).getByRole('link', { name: 'Perfis' }).click();
  await page.getByRole('button', { name: 'Novo perfil' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill('Consulta de pessoas');
  await page.getByText('Ver pessoas e contas', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Ver pessoas e contas' })).toBeChecked();
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Consulta de pessoas/ })).toBeVisible();
  const perfilDeConsulta = new URL(page.url()).pathname;

  await secoes(page).getByRole('link', { name: 'Pessoas' }).click();
  await page.getByRole('button', { name: 'Nova pessoa' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill('Bruno Costa');
  await escolherLocal(page, 'Local de trabalho', 'Jundiaí');
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Bruno Costa/ })).toBeVisible();
  const fichaDoBruno = new URL(page.url()).pathname;

  await page.getByRole('tab', { name: 'Acesso' }).click();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  const criar = page.getByRole('dialog', { name: 'Criar a conta de Bruno Costa' });
  await criar.getByRole('textbox', { name: 'Usuário' }).fill('bruno.costa');
  await criar.getByRole('button', { name: 'Criar conta' }).click();
  const criada = page.getByRole('dialog', { name: 'Conta criada' });
  const senhaDoBruno = (await criada.getByText(FORMATO_DA_SENHA_TEMPORARIA).textContent()) ?? '';
  await criada.getByRole('button', { name: 'Concluir' }).click();

  await page.getByRole('button', { name: 'Atribuir perfil' }).click();
  const atribuir = await preencherAtribuicao(
    page,
    'Atribuir um perfil a Bruno Costa',
    'Consulta de pessoas',
  );
  await escolherEscopoNumLocal(atribuir);
  await campoDeLocal(atribuir, 'Local').click();
  const locais = page.getByRole('dialog', { name: 'Local', exact: true });
  const sugerido = locais.getByRole('button', { name: /Jundiaí/ });
  await expect(sugerido).toContainText('Sugerido: local de trabalho de Bruno Costa');
  await sugerido.click();
  await expect(atribuir.getByRole('region', { name: 'Resultado' })).toContainText(
    'Bruno Costa passa a ter Consulta de pessoas em Jundiaí e no que está dentro.',
  );
  await atribuir.getByRole('button', { name: 'Atribuir perfil' }).click();
  await expect(page.getByRole('list', { name: 'Perfis da conta' })).toContainText(
    'Jundiaí · Atribuído direto à conta',
  );

  // 7. A conta nova entra noutro navegador, com a senha temporária, e a troca. O perfil não exige
  // os dois passos: a casca abre em seguida.
  const outroNavegador = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    serviceWorkers: 'block',
    ...doEndereco(2),
  });
  try {
    const doBruno = await outroNavegador.newPage();
    await doBruno.goto('/');
    await entrarCom(doBruno, 'bruno.costa', senhaDoBruno);
    await trocarASenha(doBruno, SENHA_DO_BRUNO);
    await expect(
      doBruno.getByRole('banner').getByRole('button', { name: 'Bruno Costa' }),
    ).toBeVisible();

    // 8. Ela vê só Pessoas, com as pessoas do local: a administradora, sem local, fica de fora.
    await dock(doBruno).getByRole('button', { name: 'Administração' }).click();
    await expect(titulo(doBruno, 'Pessoas')).toBeVisible();
    await expect(secoes(doBruno).getByRole('link')).toHaveText(['Pessoas']);
    const pessoas = doBruno.getByRole('grid', { name: 'Pessoas' });
    await expect(pessoas.getByRole('row', { name: /Bruno Costa/ })).toBeVisible();
    await expect(pessoas.getByRole('row', { name: /Ana Souza/ })).toHaveCount(0);
    await expect(doBruno.getByRole('button', { name: 'Nova pessoa' })).toHaveCount(0);

    // 9. A conta nova escolhe o destaque verde nos Ajustes dela, que vai para a conta, e volta à
    // lista de pessoas, ainda sem foto. Daqui em diante, a página dela não recarrega: uma recarga
    // apagaria a marca.
    await dock(doBruno).getByRole('button', { name: 'Ajustes' }).click();
    const gravada = doBruno.waitForResponse(
      (resposta) =>
        resposta.url().endsWith('/api/conta/preferencias') &&
        resposta.request().method() === 'PATCH',
    );
    await escolher(doBruno, 'Destaque', 'Verde');
    expect((await gravada).ok()).toBe(true);
    await dock(doBruno).getByRole('button', { name: 'Administração' }).click();
    const linhaDoBruno = pessoas.getByRole('row', { name: /Bruno Costa/ });
    await expect(linhaDoBruno).toBeVisible();
    await expect(linhaDoBruno.locator('img')).toHaveCount(0);
    await doBruno.evaluate(() => {
      window.__mesmaPagina = true;
    });

    // 10. A administradora troca a foto da conta nova, na ficha dela. A conta nova vê a foto na
    // lista aberta e no menu dela, sem recarregar.
    await page.getByRole('tab', { name: 'Dados' }).click();
    await enviarImagem(page, 'Foto de Bruno Costa', 'Trocar foto', RETRATO);
    // É a primeira imagem da API: ela carrega a biblioteca de imagens e grava as variantes em
    // WebP, o que, com o executor do CI carregado, passou dos 30 s (change integracao-sob-carga).
    await expect(page.getByText('Foto trocada.')).toBeVisible({ timeout: 120_000 });
    const fotoNaLista = linhaDoBruno.locator('img');
    await expect(fotoNaLista).toHaveAttribute(
      'srcset',
      /\/api\/pessoas\/[^/]+\/foto\/[^/]+\/64 64w/,
    );
    await carregada(fotoNaLista);
    const fotoNoMenu = menuDoUsuario(doBruno, 'Bruno Costa').locator('img');
    await expect(fotoNoMenu).toHaveAttribute('srcset', /\/api\/conta\/foto\/[^/]+\/64 64w/);
    await carregada(fotoNoMenu);

    // 11. A administradora muda o tema padrão para Névoa. A conta nova, que não escolheu um tema,
    // passa a ele sem recarregar, com o destaque que ela escolheu.
    await secoes(page).getByRole('link', { name: 'Padrões' }).click();
    await escolher(page, 'Tema', 'Névoa');
    await page.getByRole('button', { name: 'Salvar padrões' }).click();
    await expect(page.getByText('Padrões salvos.')).toBeVisible();
    const htmlDoBruno = doBruno.locator('html');
    await expect(htmlDoBruno).toHaveAttribute('data-theme', 'nevoa');
    await expect(htmlDoBruno).toHaveAttribute('data-accent', 'verde');
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 12. A administradora dá à conta nova um perfil com os modelos, na organização inteira. A
    // conta nova passa a ver o módulo Ativos sem recarregar e abre a tela de modelos, ainda vazia.
    await secoes(page).getByRole('link', { name: 'Perfis' }).click();
    await page.getByRole('button', { name: 'Novo perfil' }).click();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Modelos de equipamento');
    await page
      .getByText(
        'Cadastrar e editar os modelos de equipamento e a imagem deles, inativar e reativar',
        { exact: true },
      )
      .click();
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /Modelos de equipamento/ }),
    ).toBeVisible();
    const perfilDosModelos = new URL(page.url()).pathname;
    await page.goto(fichaDoBruno);
    await page.getByRole('tab', { name: 'Acesso' }).click();
    await page.getByRole('button', { name: 'Atribuir perfil' }).click();
    const dosModelos = await preencherAtribuicao(
      page,
      'Atribuir um perfil a Bruno Costa',
      'Modelos de equipamento',
    );
    await dosModelos.getByRole('button', { name: 'Atribuir perfil' }).click();
    await expect(page.getByRole('list', { name: 'Perfis da conta' })).toContainText(
      'Modelos de equipamento',
    );
    await dock(doBruno).getByRole('button', { name: 'Gestão de ativos' }).click();
    await secoesDoCatalogo(doBruno).getByRole('link', { name: 'Modelos' }).click();
    await expect(doBruno.getByText('Nenhum modelo encontrado.')).toBeVisible();

    // 13. A administradora cadastra o tipo Impressora e um modelo dele. A tela de modelos da conta
    // nova mostra o modelo, pelo evento do catálogo, sem recarregar.
    await page.goto('/gestao/catalogo/tipos');
    await page.getByRole('button', { name: 'Novo tipo' }).first().click();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Impressora');
    await escolher(page, 'Ícone', 'Impressora');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Impressora/ })).toBeVisible();
    await secoesDoCatalogo(page).getByRole('link', { name: 'Modelos' }).click();
    await page.getByRole('button', { name: 'Novo modelo' }).first().click();
    await page.getByRole('button', { name: /Tipo/ }).click();
    await page.getByRole('option', { name: 'Impressora' }).click();
    await page.getByRole('combobox', { name: 'Fabricante' }).fill('HP');
    await page.getByRole('textbox', { name: 'Modelo' }).fill('LaserJet M404');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /HP LaserJet M404/ })).toBeVisible();
    await expect(doBruno.getByRole('row', { name: /LaserJet M404/ })).toBeVisible();
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 14. A administradora dá ao perfil dos modelos a permissão de ver os ativos. A conta nova, com
    // o acesso validado de novo, abre pelo dock a lista dos ativos, ainda vazia.
    await page.goto(perfilDosModelos);
    await page.getByText('Ver os ativos', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Ver os ativos' })).toBeChecked();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Perfil salvo.')).toBeVisible();
    await expect(async () => {
      await dock(doBruno).getByRole('button', { name: 'Ativos', exact: true }).click();
      await expect(doBruno.getByText('Nenhum ativo encontrado.')).toBeVisible({ timeout: 1000 });
    }).toPass();

    // 15. A administradora começa o cadastro de uma impressora em Jundiaí, em etapas. O rascunho fica
    // na conta: outro navegador dela, numa entrada nova, retoma o cadastro na etapa em que ele parou
    // e o termina (change cadastro-em-etapas). A lista aberta da conta nova mostra o ativo, pelo
    // evento dos ativos, sem recarregar, e o Novo ativo seguinte da administradora começa vazio.
    await page.goto('/ativos/novo');
    await selecionar(page, 'Tipo do ativo', 'Impressora');
    await escolherModelo(page, 'laserjet', 'HP LaserJet M404');
    await abrirEtapa(page, 'Identificação');
    await page.getByRole('textbox', { name: 'Patrimônio' }).fill('PAT-00412');
    await abrirEtapa(page, 'Uso');
    await escolherLocal(page, 'Local', 'Jundiaí');
    await expect(page.getByText('Rascunho guardado agora')).toBeVisible();
    const outroDaAna = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      serviceWorkers: 'block',
      ...doEndereco(6),
    });
    try {
      const noOutro = await outroDaAna.newPage();
      await noOutro.goto('/ativos/novo');
      await entrarCom(noOutro, 'ana.souza', SENHA_NOVA);
      const codigoNoOutro = entrada(noOutro).getByLabel('Código do app');
      await expect(codigoNoOutro).toBeVisible();
      // O passo seguinte ao último usado só vale com o relógio nele: a API aceita um passo à frente.
      await expect.poll(passoAgora, { timeout: 40_000 }).toBeGreaterThanOrEqual(ultimoPassoDaAna);
      ultimoPassoDaAna = Math.max(passoAgora(), ultimoPassoDaAna + 1);
      await codigoNoOutro.fill(codigoDoApp(chave, ultimoPassoDaAna));
      await codigoNoOutro.press('Enter');
      await expect(etapaAberta(noOutro, 'Uso')).toBeVisible();
      await expect(campoDeLocal(noOutro, 'Local', 'Jundiaí')).toBeVisible();
      await expect(etapa(noOutro, 'Modelo')).toContainText('HP LaserJet M404');
      await abrirEtapa(noOutro, 'Identificação');
      await expect(noOutro.getByRole('textbox', { name: 'Patrimônio' })).toHaveValue('PAT-00412');
      await abrirEtapa(noOutro, 'Administrativo');
      await noOutro.getByRole('button', { name: 'Cadastrar', exact: true }).click();
      await expect(
        noOutro.getByRole('heading', { level: 1, name: /HP LaserJet M404/ }),
      ).toBeVisible();
    } finally {
      await outroDaAna.close();
    }
    const naListaDoBruno = doBruno
      .getByRole('grid', { name: 'Ativos', exact: true })
      .getByRole('row')
      .filter({ hasText: 'PAT-00412' });
    await expect(naListaDoBruno).toBeVisible();
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);
    // O cadastro feito apagou o rascunho: o Novo ativo da administradora começa vazio.
    await page.goto('/ativos/novo');
    await expect(etapa(page, 'Tipo')).toContainText('Falta escolher');

    // 16. A administradora desliga o Ativos na seção Módulos. Ele some do dock da conta nova, e a
    // lista aberta passa a dizer que o módulo está desligado. Ligado de novo, ele volta com o ativo.
    await page.goto('/administracao/modulos');
    await interruptorDoModulo(page, 'Ativos Ligado').click();
    await page
      .getByRole('alertdialog', { name: 'Desligar o módulo Ativos?' })
      .getByRole('button', { name: 'Desligar o módulo' })
      .click();
    await expect(page.getByText('Módulo desligado.')).toBeVisible();
    await expect(dock(doBruno).getByRole('button', { name: 'Ativos', exact: true })).toHaveCount(0);
    await expect(
      doBruno.getByText('O módulo Ativos está desligado nesta organização.'),
    ).toBeVisible();
    await interruptorDoModulo(page, 'Ativos Desligado').click();
    await expect(page.getByText('Módulo ligado.')).toBeVisible();
    await expect(dock(doBruno).getByRole('button', { name: 'Ativos', exact: true })).toBeVisible();
    await expect(naListaDoBruno).toBeVisible();
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 17. A administradora cadastra Campinas e um campo restrito na impressora, com o valor dele
    // numa impressora de cada unidade, e dá à conta nova os campos restritos só em Jundiaí.
    await page.goto('/administracao/locais');
    await page.getByRole('button', { name: 'Novo local' }).click();
    const campinas = page.getByRole('dialog', { name: 'Novo local na raiz' });
    await campinas.getByRole('textbox', { name: 'Nome' }).fill('Campinas');
    await campinas.getByRole('button', { name: /Tipo/ }).click();
    await page.getByRole('option', { name: 'Unidade' }).click();
    await campinas.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Campinas' })).toBeVisible();

    await page.goto('/gestao/catalogo/campos/novo');
    await page.getByRole('textbox', { name: 'Rótulo' }).fill('Senha do painel');
    await selecionar(page, 'Tipo do campo', 'Texto');
    await page.getByText('Restrito', { exact: true }).click();
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Senha do painel/ })).toBeVisible();
    await secoesDoCatalogo(page).getByRole('link', { name: 'Tipos' }).click();
    await page.getByRole('row', { name: /Impressora/ }).click();
    await page.getByRole('button', { name: 'Incluir Senha do painel' }).click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Tipo salvo.')).toBeVisible();

    await page.goto('/ativos');
    await linhaDosAtivos(page, 'PAT-00412').getByText('PAT-00412').click();
    await abrirCartao(page, 'Outros');
    await page.getByRole('textbox', { name: 'Senha do painel' }).fill('painel-jundiai');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Ativo salvo.')).toBeVisible();
    await page.goto('/ativos/novo');
    await selecionar(page, 'Tipo do ativo', 'Impressora');
    await escolherModelo(page, 'laserjet', 'HP LaserJet M404');
    await abrirEtapa(page, 'Identificação');
    await page.getByRole('textbox', { name: 'Patrimônio' }).fill('PAT-00500');
    await abrirEtapa(page, 'Uso');
    await escolherLocal(page, 'Local', 'Campinas');
    await abrirEtapa(page, 'Outros');
    await page.getByRole('textbox', { name: 'Senha do painel' }).fill('painel-campinas');
    await abrirEtapa(page, 'Administrativo');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByText('Ativo cadastrado.')).toBeVisible();

    await dock(page).getByRole('button', { name: 'Administração' }).click();
    await secoes(page).getByRole('link', { name: 'Perfis' }).click();
    await page.getByRole('button', { name: 'Novo perfil' }).click();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Campos restritos');
    await page
      .getByText('Ver os campos restritos dos ativos e, com a edição, editá-los', { exact: true })
      .click();
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Campos restritos/ })).toBeVisible();
    await page.goto(fichaDoBruno);
    await page.getByRole('tab', { name: 'Acesso' }).click();
    await page.getByRole('button', { name: 'Atribuir perfil' }).click();
    const dosRestritos = await preencherAtribuicao(
      page,
      'Atribuir um perfil a Bruno Costa',
      'Campos restritos',
      'Jundiaí',
    );
    await dosRestritos.getByRole('button', { name: 'Atribuir perfil' }).click();
    await expect(page.getByRole('list', { name: 'Perfis da conta' })).toContainText(
      'Campos restritos',
    );

    // 18. A administradora põe a coluna do campo restrito na tabela e a salva em duas visões: uma só
    // dela e outra compartilhada com a organização. O menu da conta nova, aberto, mostra a
    // compartilhada pelo evento, sem recarregar, e não a visão pessoal da administradora.
    await page.goto('/ativos');
    await page.getByRole('button', { name: 'Colunas' }).click();
    await page
      .getByRole('dialog', { name: 'Colunas' })
      .locator('label')
      .filter({ has: page.getByRole('checkbox', { name: 'Senha do painel', exact: true }) })
      .click();
    await page.keyboard.press('Escape');
    await salvarComoNovaVisao(page, 'Minhas impressoras', { compartilhada: false });
    await salvarComoNovaVisao(page, 'Impressoras com senha', { compartilhada: true });
    await escolhaDaVisao(doBruno).click();
    const menuDoBruno = doBruno.getByRole('menu', { name: /^Visão/ });
    await expect(
      menuDoBruno.getByRole('menuitemradio', { name: /Impressoras com senha/ }),
    ).toBeVisible();
    await expect(
      menuDoBruno.getByRole('menuitemradio', { name: /Minhas impressoras/ }),
    ).toHaveCount(0);
    await doBruno.keyboard.press('Escape');
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 19. A administradora usa a compartilhada como padrão da organização. A conta nova, que não
    // escolheu uma visão, abre a tabela pelo dock e cai nela, com a coluna do campo restrito.
    await escolhaDaVisao(page).click();
    await page.getByRole('menuitem', { name: 'Usar como padrão da organização' }).click();
    await expect(page.getByText('Padrão da organização definido.')).toBeVisible();
    await expect(async () => {
      await dock(doBruno).getByRole('button', { name: 'Ativos', exact: true }).click();
      await expect(escolhaDaVisao(doBruno)).toHaveAccessibleName('Visão Impressoras com senha', {
        timeout: 1000,
      });
    }).toPass();
    await expect(
      doBruno.getByRole('grid', { name: 'Ativos', exact: true }).getByRole('columnheader', {
        name: /^Senha do painel/,
      }),
    ).toBeVisible();

    // 20. A coluna do campo restrito mostra o valor só onde a conta vê os restritos: a conta nova vê
    // o de Jundiaí, e o de Campinas fica fora do acesso dela; a administradora vê os dois.
    await expect(linhaDosAtivos(doBruno, 'PAT-00412')).toContainText('painel-jundiai');
    await expect(linhaDosAtivos(doBruno, 'PAT-00500')).toContainText('Fora do seu acesso');
    await expect(linhaDosAtivos(doBruno, 'PAT-00500')).not.toContainText('painel-campinas');
    await expect(linhaDosAtivos(page, 'PAT-00412')).toContainText('painel-jundiai');
    await expect(linhaDosAtivos(page, 'PAT-00500')).toContainText('painel-campinas');
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 20b. A conta nova abre os ativos também num segundo navegador, como num notebook, e ordena a
    // tabela pelo patrimônio no primeiro: a visão da organização fica personalizada só para ela, e o
    // notebook passa à mesma tabela pelo evento, sem recarregar.
    const doNotebook = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      serviceWorkers: 'block',
      ...doEndereco(3),
    });
    try {
      const noNotebook = await doNotebook.newPage();
      await noNotebook.goto('/');
      await entrarCom(noNotebook, 'bruno.costa', SENHA_DO_BRUNO);
      await dock(noNotebook).getByRole('button', { name: 'Ativos', exact: true }).click();
      await expect(escolhaDaVisao(noNotebook)).toHaveAccessibleName('Visão Impressoras com senha');
      await colunaDosAtivos(doBruno, 'Patrimônio').getByText('Patrimônio', { exact: true }).click();
      await expect(escolhaDaVisao(doBruno)).toHaveAccessibleName(
        'Visão Impressoras com senha, personalizada',
      );
      await expect(escolhaDaVisao(noNotebook)).toHaveAccessibleName(
        'Visão Impressoras com senha, personalizada',
      );
      await expect(colunaDosAtivos(noNotebook, 'Patrimônio')).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
      // A administradora, que não mudou nada, continua com a visão como está salva.
      await expect(escolhaDaVisao(page)).toHaveAccessibleName('Visão Impressoras com senha');
    } finally {
      await doNotebook.close();
    }
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 21. A administradora envia a imagem própria da PAT-00412, na ficha dela. A tabela aberta da
    // conta nova mostra a imagem na linha, pelo evento dos ativos, sem recarregar.
    await linhaDosAtivos(page, 'PAT-00412').getByText('PAT-00412').click();
    await expect(page.getByRole('heading', { level: 1, name: /PAT-00412/ })).toBeVisible();
    const fichaDa412 = new URL(page.url()).pathname;
    await enviarImagem(page, 'Imagem de HP LaserJet M404', 'Enviar imagem', RETRATO);
    await expect(page.getByText('Imagem do ativo trocada.')).toBeVisible();
    const imagemNaLinha = linhaDosAtivos(doBruno, 'PAT-00412').locator('img');
    await expect(imagemNaLinha).toHaveAttribute('src', /\/api\/ativos\/[^/]+\/imagem\/[^/]+\/64$/);
    await carregada(imagemNaLinha);
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 22. A conta nova abre a ficha da PAT-00412 na aba Ligados, ainda sem ligados. A
    // administradora liga a PAT-00412 à PAT-00500, de Campinas, pela ligação livre: a ficha aberta
    // da conta nova mostra a ligação, pelo evento, sem recarregar.
    await linhaDosAtivos(doBruno, 'PAT-00412').getByText('PAT-00412').click();
    await doBruno.getByRole('tab', { name: /^Ligados/ }).click();
    await expect(doBruno.getByText('Nenhum ativo ligado.')).toBeVisible();
    await page.getByRole('tab', { name: /^Ligados/ }).click();
    await page.getByRole('button', { name: 'Ligar a outro ativo' }).click();
    await escolherSugestao(page, 'Ativo', 'PAT-00500', 'HP LaserJet M404 · PAT-00500');
    await page
      .getByRole('dialog', { name: 'Ligar a outro ativo' })
      .getByRole('button', { name: 'Ligar', exact: true })
      .click();
    await expect(page.getByText('Ativos ligados.')).toBeVisible();
    await expect(doBruno.getByRole('tab', { name: 'Ligados (1)' })).toBeVisible();
    await expect(doBruno.getByRole('region', { name: 'Ligado a' })).toContainText(
      'Impressora · PAT-00500 · Campinas',
    );
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 23. A administradora cadastra o campo de arquivo "PDF da nota fiscal", o inclui na impressora
    // e envia a nota da PAT-00412. A conta nova, na ficha aberta, baixa o PDF com o nome original.
    await page.goto('/gestao/catalogo/campos/novo');
    await page.getByRole('textbox', { name: 'Rótulo' }).fill('PDF da nota fiscal');
    await selecionar(page, 'Tipo do campo', 'Arquivo');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /PDF da nota fiscal/ })).toBeVisible();
    await secoesDoCatalogo(page).getByRole('link', { name: 'Tipos' }).click();
    await page.getByRole('row', { name: /Impressora/ }).click();
    await page.getByRole('button', { name: 'Incluir PDF da nota fiscal' }).click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Tipo salvo.')).toBeVisible();
    await page.goto(fichaDa412);
    await abrirCartao(page, 'Outros');
    const escolhaDoPdf = page.waitForEvent('filechooser');
    await page
      .getByRole('group', { name: 'PDF da nota fiscal' })
      .getByRole('button', { name: 'Enviar arquivo' })
      .click();
    await (await escolhaDoPdf).setFiles({
      name: 'nota-fiscal-1234.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await expect(page.getByText('Arquivo enviado.')).toBeVisible();
    await doBruno.getByRole('tab', { name: 'Dados' }).click();
    await abrirCartao(doBruno, 'Outros');
    const notaDoBruno = doBruno.getByRole('group', { name: 'PDF da nota fiscal' });
    await expect(notaDoBruno).toContainText('nota-fiscal-1234.pdf');
    const baixado = doBruno.waitForEvent('download');
    await notaDoBruno.getByRole('link', { name: 'Baixar' }).click();
    expect((await baixado).suggestedFilename()).toBe('nota-fiscal-1234.pdf');
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 24. A administradora muda, na PAT-00500, numa gravação só, a senha do painel, restrita, e o
    // hostname. O histórico dela mostra as duas mudanças; o da conta nova, sem os restritos em
    // Campinas, só o hostname.
    await page.getByRole('tab', { name: /^Ligados/ }).click();
    await page
      .getByRole('region', { name: 'Ligado a' })
      .getByRole('link', { name: 'HP LaserJet M404' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: /PAT-00500/ })).toBeVisible();
    await abrirCartao(page, 'Outros');
    await page.getByRole('textbox', { name: 'Senha do painel' }).fill('painel-campinas-2');
    await abrirCartao(page, 'Identificação');
    await page.getByRole('textbox', { name: 'Hostname' }).fill('IMP-CAMPINAS');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Ativo salvo.')).toBeVisible();
    await page.getByRole('tab', { name: 'Histórico' }).click();
    const historicoDaAna = page.getByRole('list', { name: 'Histórico do ativo' });
    await expect(historicoDaAna.getByRole('listitem').first()).toContainText(
      'Senha do painel: painel-campinas → painel-campinas-2',
    );
    await expect(historicoDaAna.getByRole('listitem').first()).toContainText(
      'Hostname: — → IMP-CAMPINAS',
    );
    await doBruno.getByRole('tab', { name: /^Ligados/ }).click();
    await doBruno
      .getByRole('region', { name: 'Ligado a' })
      .getByRole('link', { name: 'HP LaserJet M404' })
      .click();
    await doBruno.getByRole('tab', { name: 'Histórico' }).click();
    const historicoDoBruno = doBruno.getByRole('list', { name: 'Histórico do ativo' });
    await expect(historicoDoBruno.getByRole('listitem').first()).toContainText(
      'Hostname: — → IMP-CAMPINAS',
    );
    await expect(historicoDoBruno).not.toContainText('Senha do painel');
    await expect(historicoDoBruno).not.toContainText('painel-campinas');
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 25. A administradora importa um XLSX com uma impressora nova em Jundiaí e um CSV do Excel,
    // que leva a PAT-00412 para Campinas. A tabela aberta da conta nova mostra a impressora nova e o
    // local mudado, pelos eventos, sem recarregar; a ficha mostra a origem "Planilha", com a autora.
    await dock(doBruno).getByRole('button', { name: 'Ativos', exact: true }).click();
    await expect(linhaDosAtivos(doBruno, 'PAT-00412')).toBeVisible();
    await importarPlanilha(page, {
      name: 'impressoras.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsxDeTabela([
        ['Patrimônio', 'Modelo', 'Local'],
        ['PAT-00600', 'HP LaserJet M404', 'Jundiaí'],
      ]),
    });
    await expect(page.getByText('1 linha: 1 novo')).toBeVisible();
    await confirmarAImportacao(page, 'impressoras.xlsx');
    await expect(page.getByText('1 novo', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(linhaDosAtivos(doBruno, 'PAT-00600')).toBeVisible();

    await importarPlanilha(page, {
      name: 'mudancas.csv',
      mimeType: 'text/csv',
      buffer: csvDoExcel([
        ['Patrimônio', 'Localização'],
        ['PAT-00412', 'Campinas'],
      ]),
    });
    await expect(page.getByText('1 linha: 1 alterado')).toBeVisible();
    await confirmarAImportacao(page, 'mudancas.csv');
    await expect(page.getByText('1 alterado', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(linhaDosAtivos(doBruno, 'PAT-00412')).toContainText('Campinas');
    await linhaDosAtivos(doBruno, 'PAT-00600').getByText('PAT-00600').click();
    await abrirCartao(doBruno, 'Identificação');
    await expect(
      doBruno.getByText(/^Planilha · Ana Souza · \d\d\/\d\d\/\d{4} \d\d:\d\d$/).first(),
    ).toBeVisible();
    expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);

    // 26. A administradora abre a etiqueta da PAT-00412 pela ficha. O endereço do QR, aberto num
    // navegador sem sessão, pede a entrada e, depois dela, com o código do app, abre a ficha.
    await page.goto(fichaDa412);
    await page.getByRole('button', { name: 'Imprimir etiqueta' }).click();
    await expect(titulo(page, 'Etiquetas')).toBeVisible();
    await expect(page.getByText('1 etiqueta', { exact: true })).toBeVisible();
    const etiqueta = page
      .getByRole('region', { name: 'Prévia das etiquetas' })
      .locator('[data-etiqueta]');
    await expect(etiqueta).toContainText('PAT-00412');
    await expect(etiqueta).toContainText('Empresa da pilha');
    const enderecoDoQr = (await etiqueta.getAttribute('data-endereco')) ?? '';
    expect(enderecoDoQr).toBe(new URL(fichaDa412, page.url()).href);
    const semSessao = await browser.newContext({ serviceWorkers: 'block', ...doEndereco(4) });
    try {
      const leitor = await semSessao.newPage();
      await leitor.goto(enderecoDoQr);
      await expect(titulo(leitor, 'Entrar')).toBeVisible();
      await entrarCom(leitor, 'ana.souza', SENHA_NOVA);
      const codigoDoLeitor = entrada(leitor).getByLabel('Código do app');
      await expect(codigoDoLeitor).toBeVisible();
      await expect.poll(passoAgora, { timeout: 40_000 }).toBeGreaterThanOrEqual(ultimoPassoDaAna);
      ultimoPassoDaAna = Math.max(passoAgora(), ultimoPassoDaAna + 1);
      await codigoDoLeitor.fill(codigoDoApp(chave, ultimoPassoDaAna));
      await codigoDoLeitor.press('Enter');
      await expect(leitor.getByRole('heading', { level: 1, name: /PAT-00412/ })).toBeVisible();
      expect(new URL(leitor.url()).pathname).toBe(fichaDa412);
    } finally {
      await semSessao.close();
    }

    // 27. A administradora cadastra o campo IP, liga a disponibilidade e os suprimentos na
    // impressora pelo campo, com a comunidade public, e põe a PAT-00412 em 127.0.0.1 e a PAT-00600
    // em 192.0.2.1. A conta nova põe a coluna Disponibilidade na tabela aberta, que mostra as duas
    // ainda não verificadas.
    await page.goto('/gestao/catalogo/campos/novo');
    await page.getByRole('textbox', { name: 'Rótulo' }).fill('IP');
    await selecionar(page, 'Tipo do campo', 'IP');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /IP/ })).toBeVisible();
    await secoesDoCatalogo(page).getByRole('link', { name: 'Tipos' }).click();
    await page.getByRole('row', { name: /Impressora/ }).click();
    await page.getByRole('button', { name: 'Incluir IP' }).click();
    await page
      .locator('label')
      .filter({ has: page.getByRole('checkbox', { name: /^Disponibilidade na rede/ }) })
      .click();
    await expect(page.getByRole('button', { name: /Campo de IP do ping/ })).toContainText('IP');
    await page
      .locator('label')
      .filter({ has: page.getByRole('checkbox', { name: /^Suprimentos e contadores/ }) })
      .click();
    await expect(page.getByRole('button', { name: /Campo de IP do SNMP/ })).toContainText('IP');
    await expect(page.getByRole('button', { name: /Comunidade$/ })).toContainText(
      'public (padrão)',
    );
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Tipo salvo.')).toBeVisible();
    for (const [patrimonio, ip] of [
      ['PAT-00412', '127.0.0.1'],
      ['PAT-00600', '192.0.2.1'],
    ] as const) {
      await page.goto('/ativos');
      await linhaDosAtivos(page, patrimonio).getByText(patrimonio).click();
      await expect(
        page.getByRole('heading', { level: 1, name: new RegExp(patrimonio) }),
      ).toBeVisible();
      await abrirCartao(page, 'Outros');
      await page.getByRole('textbox', { name: 'IP', exact: true }).fill(ip);
      await page.getByRole('button', { name: 'Salvar alterações' }).click();
      await expect(page.getByText('Ativo salvo.')).toBeVisible();
    }
    await dock(doBruno).getByRole('button', { name: 'Ativos', exact: true }).click();
    await doBruno.getByRole('button', { name: 'Colunas' }).click();
    await doBruno
      .getByRole('dialog', { name: 'Colunas' })
      .locator('label')
      .filter({ has: doBruno.getByRole('checkbox', { name: 'Disponibilidade', exact: true }) })
      .click();
    await doBruno.keyboard.press('Escape');
    await expect(linhaDosAtivos(doBruno, 'PAT-00412')).toContainText('Não verificado');
    await expect(linhaDosAtivos(doBruno, 'PAT-00600')).toContainText('Não verificado');

    // 28. Antes da coleta, a administradora baixa a regra de fábrica do toner para 5%: o toner em
    // 8% só abre o alerta quando ela sobe o limite, no passo 29, com a tela da regra aberta, e não
    // na avaliação de um minuto qualquer no meio deste passo. Ela cadastra o coletor com as faixas,
    // e o token aparece uma vez. O processo do coletor, de verdade, com esse token, pinga as duas: a
    // tabela aberta da conta nova mostra a PAT-00412 Online e a PAT-00600 Offline, pelo evento, sem
    // recarregar. Ele lê também a PAT-00412 no simulador SNMP, numa porta alta, com a gravação da
    // laser de uma cor: a ficha dela mostra o toner, o total de páginas e o número de série gravado
    // pela coleta, com o coletor.
    await page.goto('/alertas/regras');
    await page.getByRole('row', { name: /Toner em 10% ou menos/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /Toner em 10% ou menos/ }),
    ).toBeVisible();
    await page.getByRole('textbox', { name: /^Nome/ }).fill('Toner em 5% ou menos');
    await page.getByRole('textbox', { name: /^Limite/ }).fill('5');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Regra salva.')).toBeVisible();

    await page.goto('/administracao/coletores');
    await page.getByRole('button', { name: 'Novo coletor' }).first().click();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Coletor da pilha');
    await page.getByRole('textbox', { name: 'Faixas de rede' }).fill('127.0.0.0/8\n192.0.2.0/24');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    const doToken = page.getByRole('dialog', { name: 'Token do Coletor da pilha' });
    const token = (
      (await doToken
        .getByRole('group', { name: 'Token' })
        .locator(':scope > div')
        .first()
        .textContent()) ?? ''
    ).trim();
    expect(token).toMatch(/^[\w-]{43}$/);
    await doToken.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('button', { name: 'Trocar o token' })).toBeVisible();

    const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const filaDoColetor = mkdtempSync(join(tmpdir(), 'grafite-pilha-coletor-'));
    const simuladorSnmp = await iniciarSimuladorSnmp({
      gravacao: {
        arquivo: join(raiz, 'apps', 'collector', 'test', 'gravacoes', 'laser-de-uma-cor.snmprec'),
      },
      comunidade: 'public',
    });
    const coletor = spawn(
      process.execPath,
      [join(raiz, 'apps', 'collector', 'src', 'servidor.ts')],
      {
        cwd: raiz,
        env: {
          ...process.env,
          GRAFITE_COLETOR_API_URL: `http://127.0.0.1:${PORTA_DA_PILHA}`,
          GRAFITE_COLETOR_ENDERECO: ENDERECO_DA_PILHA,
          GRAFITE_COLETOR_TOKEN: token,
          GRAFITE_COLETOR_PASTA: filaDoColetor,
          GRAFITE_COLETOR_PORTA: String(PORTA_DA_PILHA + 1),
          GRAFITE_COLETOR_PORTA_DO_SNMP: String(simuladorSnmp.porta),
        },
        stdio: 'ignore',
      },
    );
    try {
      await expect(linhaDosAtivos(doBruno, 'PAT-00412')).toContainText('Online', {
        timeout: 30_000,
      });
      await expect(linhaDosAtivos(doBruno, 'PAT-00600')).toContainText('Offline', {
        timeout: 30_000,
      });
      expect(await doBruno.evaluate(() => window.__mesmaPagina)).toBe(true);
      await page.goto('/administracao/coletores');
      await expect(page.getByRole('row', { name: /Coletor da pilha/ })).toContainText(/Agora|Há/);

      // O lote da leitura SNMP chega em até 10 s; a ficha é relida até ela aparecer.
      await page.goto(fichaDa412);
      await abrirCartao(page, 'Suprimentos e contadores');
      const suprimentos = page.getByRole('region', { name: 'Suprimentos' });
      await expect(async () => {
        await page.reload();
        await expect(suprimentos).toContainText('Respondeu', { timeout: 2_000 });
      }).toPass({ timeout: 40_000 });
      // Os cartuchos (change suprimentos-rostos-e-backups): o título traz o tipo e a descrição.
      const niveis = suprimentos.getByRole('list', { name: 'Níveis dos suprimentos' });
      await expect(niveis.getByTitle('Toner · Black Toner Cartridge')).toContainText('8%');
      await expect(niveis.getByTitle('Cilindro · Imaging Drum Unit')).toContainText('60%');
      await expect(suprimentos).toContainText('12.500');
      await abrirCartao(page, 'Identificação');
      await expect(page.getByRole('textbox', { name: 'Número de série' })).toHaveValue(
        'VNB3K12345',
      );
      await expect(page.getByText(/^Coleta · Coletor da pilha · /)).toBeVisible();
    } finally {
      coletor.kill();
      await simuladorSnmp.fechar();
      rmSync(filaDoColetor, { recursive: true, force: true });
    }

    // 29. Os alertas (change p3a-regras-e-alertas) e as notificações deles (change
    // p3b-notificacoes-no-servidor): o toner da PAT-00412 que a coleta gravou, em 8%, fica acima do
    // limite de 5% da regra do toner. A administradora sobe o limite para 15%, e a mudança pede a
    // avaliação na hora: o alerta do toner abre e a notifica. O aviso Crítico aparece na própria
    // tela da regra, pelo evento, sem recarregar, e o sino conta a não lida. Ela reconhece pelo
    // aviso, e a central mostra a notificação lida, com "Reconhecido por Ana Souza". O alerta
    // aparece em "O que resolver agora" e leva à ficha da impressora, que diz quem reconheceu. Antes,
    // nos Ajustes, ela vê o e-mail dela e inscreve este navegador no push (change
    // p3c-email-e-push), com a inscrição simulada que aponta para o serviço de push falso da pilha.
    const receptor = createECDH('prime256v1');
    receptor.generateKeys();
    const segredoDoAparelho = randomBytes(16);
    const caminhoDoAparelho = '/push/aparelho-da-ana';
    await page.addInitScript(
      ({ endpoint, p256dh, auth }) => {
        let permissao: NotificationPermission = 'default';
        let inscrita = false;
        Object.defineProperty(Notification, 'permission', { get: () => permissao });
        Notification.requestPermission = async () => {
          permissao = 'granted';
          return permissao;
        };
        const inscricao = () => ({
          endpoint,
          toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
          unsubscribe: async () => {
            inscrita = false;
            return true;
          },
        });
        const registro = {
          pushManager: {
            subscribe: async () => {
              inscrita = true;
              return inscricao();
            },
            getSubscription: async () => (inscrita ? inscricao() : null),
          },
        };
        navigator.serviceWorker.getRegistration = (async () =>
          registro) as unknown as ServiceWorkerContainer['getRegistration'];
      },
      {
        endpoint: `${process.env.GRAFITE_PILHA_SERVICO_DE_PUSH}${caminhoDoAparelho}`,
        p256dh: receptor.getPublicKey('base64url'),
        auth: segredoDoAparelho.toString('base64url'),
      },
    );
    await page.goto('/ajustes/notificacoes');
    await expect(page.getByRole('group', { name: 'Por e-mail', exact: true })).toContainText(
      'As notificações vão para ana.souza@empresa.com.br.',
    );
    await page
      .getByRole('group', { name: 'No celular', exact: true })
      .getByRole('button', { name: 'Receber neste aparelho' })
      .click();
    await expect(page.getByRole('list', { name: 'Aparelhos que recebem os avisos' })).toContainText(
      'Este aparelho',
    );

    await page.goto('/alertas/regras');
    const sino = page.getByRole('banner').getByRole('button', { name: /^Notificações/ });
    await expect(sino).toHaveAccessibleName('Notificações, nenhuma não lida');
    await page.getByRole('row', { name: /Toner em 5% ou menos/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /Toner em 5% ou menos/ }),
    ).toBeVisible();
    await page.getByRole('textbox', { name: /^Nome/ }).fill('Toner em 15% ou menos');
    await page.getByRole('textbox', { name: /^Limite/ }).fill('15');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Regra salva.')).toBeVisible();
    const avisoDoToner = page
      .getByRole('region', { name: /Avisos/ })
      .getByRole('alertdialog')
      .filter({ hasText: 'Black Toner Cartridge em 8%' });
    await expect(avisoDoToner).toContainText('Crítico', { timeout: 30_000 });
    await expect(avisoDoToner).toContainText('HP LaserJet M404 · PAT-00412');
    await expect(sino).toHaveAccessibleName('Notificações, 1 não lida');
    await avisoDoToner.getByRole('button', { name: 'Reconhecer' }).click();
    await expect(page.getByText('Alerta reconhecido.')).toBeVisible();
    await expect(avisoDoToner).toHaveCount(0);
    await expect(sino).toHaveAccessibleName('Notificações, nenhuma não lida');
    await sino.click();
    const notificacaoDoToner = page
      .getByRole('dialog', { name: 'Notificações' })
      .getByRole('listitem')
      .filter({ hasText: 'Black Toner Cartridge em 8%' });
    await expect(notificacaoDoToner).toContainText('Reconhecido por Ana Souza');
    await expect(notificacaoDoToner).not.toContainText('Não lida');
    await expect(notificacaoDoToner.getByRole('button', { name: 'Reconhecer' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await dock(page).getByRole('button', { name: 'Início' }).click();
    const abertas = page.getByRole('grid', { name: 'Ocorrências abertas' });
    const doToner = abertas.getByRole('row').filter({ hasText: 'Black Toner Cartridge em 8%' });
    await expect(doToner).toContainText('Crítico');
    await expect(doToner).toContainText('HP LaserJet M404');
    await doToner.getByText('Black Toner Cartridge em 8%').click();
    await expect(page.getByRole('heading', { level: 1, name: /PAT-00412/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(fichaDa412);
    // A impressora abre nos suprimentos, o primeiro cartão dela (change primeiro-cartao-da-ficha);
    // os alertas ficam na Visão geral, logo abaixo.
    await abrirCartao(page, 'Visão geral');
    const alertasDaFicha = page.getByRole('region', { name: 'Alertas', exact: true });
    const alertaDoToner = alertasDaFicha
      .getByRole('listitem')
      .filter({ hasText: 'Black Toner Cartridge em 8%' });
    await expect(alertaDoToner).toContainText('Reconhecido por Ana Souza');
    await expect(alertaDoToner.getByRole('button', { name: 'Reconhecer' })).toHaveCount(0);

    // O e-mail do crítico chega ao SMTP da pilha, e o push, ao serviço falso, decifrado com as
    // chaves da inscrição deste navegador.
    const caixa = process.env.GRAFITE_PILHA_CAIXA;
    type EmailDaCaixa = { assunto: string; para: string; texto: string };
    const emailsDoToner = async () =>
      ((await (await fetch(`${caixa}/emails`)).json()) as EmailDaCaixa[]).filter(
        ({ assunto }) => assunto === 'Crítico: Black Toner Cartridge em 8%',
      );
    await expect.poll(async () => (await emailsDoToner()).length, { timeout: 30_000 }).toBe(1);
    const [emailDoToner] = await emailsDoToner();
    expect(emailDoToner?.para).toBe('ana.souza@empresa.com.br');
    expect(emailDoToner?.texto).toContain(`Abrir: http://localhost:${PORTA_DA_PILHA}${fichaDa412}`);
    const pushesDoAparelho = async () =>
      ((await (await fetch(`${caixa}/push`)).json()) as { caminho: string; corpo: string }[])
        .filter(({ caminho }) => caminho === caminhoDoAparelho)
        .map(({ corpo }) =>
          JSON.parse(decifrarPush(Buffer.from(corpo, 'base64'), receptor, segredoDoAparelho)),
        );
    await expect
      .poll(async () => (await pushesDoAparelho()).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    expect(await pushesDoAparelho()).toContainEqual(
      expect.objectContaining({
        titulo: 'Crítico: Black Toner Cartridge em 8%',
        destino: fichaDa412,
        severidade: 'critico',
      }),
    );

    // Os indicadores: o Crítico do toner foi reconhecido logo, dentro da meta de fábrica de 30 min,
    // e nenhum toner foi trocado ainda (change p3d-indicadores).
    await page.goto('/alertas/indicadores');
    const doCritico = page.getByRole('region', { name: 'Tempo até reconhecer o Crítico' });
    await expect(doCritico.getByText('menos de 1 min')).toBeVisible();
    await expect(doCritico.getByText('Meta: 30 min')).toBeVisible();
    await expect(doCritico.getByText('Dentro da meta')).toBeVisible();
    const doTonerNosIndicadores = page.getByRole('region', {
      name: 'Tempo de atendimento do toner',
    });
    await expect(
      doTonerNosIndicadores.getByText('Nenhum toner trocado nos últimos 30 dias.'),
    ).toBeVisible();
    await expect(doTonerNosIndicadores.getByText('Sem dado', { exact: true })).toBeVisible();

    // 30. O cofre: a administradora cadastra a senha do switch, ligada à PAT-00412, libera o cofre
    // com o código do app, revela e copia. A auditoria mostra a revelação pelo nome do segredo, sem
    // o valor, e a ficha da PAT-00412 mostra o segredo, com o caminho até o Cofre.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/cofre');
    await expect(page.getByText('Nenhum segredo ainda.')).toBeVisible();
    await page.getByRole('button', { name: 'Novo segredo' }).first().click();
    await page.getByRole('textbox', { name: 'Nome' }).fill('Switch do CPD');
    await selecionar(page, 'Tipo', 'Conta administrativa');
    await selecionar(page, 'Classificação', 'Equipamento');
    await page.getByRole('textbox', { name: 'Identificador' }).fill('admin');
    const ativosLigados = page.getByRole('list', { name: 'Ativos ligados' });
    await expect(async () => {
      await page.getByRole('combobox', { name: 'Incluir um ativo' }).fill('PAT-00412');
      await page
        .getByRole('option', { name: 'PAT-00412 · HP LaserJet M404', exact: true })
        .click({ timeout: 2_000 });
      await expect(ativosLigados).toContainText('PAT-00412', { timeout: 1_000 });
    }).toPass();
    await page.getByLabel(/^Valor/).fill('S3nh@ do switch');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Switch do CPD/ })).toBeVisible();

    await page.getByRole('button', { name: 'Revelar' }).click();
    const pedidoDoCodigo = page.getByRole('dialog', { name: 'Confirme o código do app' });
    await expect(pedidoDoCodigo).toContainText(
      'Revelar e copiar ficam liberados por 5 minutos nesta sessão.',
    );
    // O código do cofre conta como usado, como o da entrada: vem um passo depois do último.
    await expect.poll(passoAgora, { timeout: 40_000 }).toBeGreaterThanOrEqual(ultimoPassoDaAna);
    ultimoPassoDaAna = Math.max(passoAgora(), ultimoPassoDaAna + 1);
    await pedidoDoCodigo
      .getByRole('textbox', { name: 'Código do app' })
      .fill(codigoDoApp(chave, ultimoPassoDaAna));
    await pedidoDoCodigo.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('S3nh@ do switch')).toBeVisible();
    await expect(page.getByText(/^Cofre liberado até \d\d:\d\d$/)).toBeVisible();
    await page.getByRole('button', { name: 'Ocultar' }).click();
    await page.getByRole('button', { name: 'Copiar' }).click();
    await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('S3nh@ do switch');

    await page.goto('/administracao/auditoria');
    await escolherSugestao(page, 'Ação', 'revel', 'Segredo revelado');
    const daRevelacao = page.getByRole('grid', { name: 'Registros da auditoria' });
    await expect(daRevelacao.getByRole('row')).toHaveCount(2);
    await expect(daRevelacao.getByRole('row').nth(1)).toContainText('Segredo: Switch do CPD');
    await expect(page.getByText('S3nh@ do switch')).toHaveCount(0);

    await page.goto(fichaDa412);
    await abrirCartao(page, 'Visão geral');
    const segredosDaFicha = page.getByRole('region', { name: 'Segredos' });
    await expect(segredosDaFicha).toContainText('Conta administrativa · admin');
    await expect(segredosDaFicha).not.toContainText('S3nh@');
    await segredosDaFicha.getByRole('link', { name: 'Switch do CPD' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Switch do CPD/ })).toBeVisible();

    // Ainda no cofre: a administradora liga a saúde do Control iD na impressora, com a porta do
    // simulador e o login "Switch do CPD", que também está ligado à PAT-00412. O coletor de verdade,
    // com o mesmo token, sonda a PAT-00412 no simulador, que só aceita esse usuário e essa senha.
    const simuladorDoControle = await iniciarSimuladorControlId({
      gravacao: {
        arquivo: join(
          raiz,
          'apps',
          'collector',
          'test',
          'gravacoes',
          'control-id',
          'idaccess-pro.json',
        ),
      },
      usuario: 'admin',
      senha: 'S3nh@ do switch',
    });
    const filaDaSondagem = mkdtempSync(join(tmpdir(), 'grafite-pilha-sondagem-'));
    let coletorDaSondagem: ReturnType<typeof spawn> | undefined;
    try {
      await page.goto('/gestao/catalogo/tipos');
      await page.getByRole('row', { name: /Impressora/ }).click();
      await page
        .locator('label')
        .filter({ has: page.getByRole('checkbox', { name: /^Saúde do Control iD/ }) })
        .click();
      await expect(page.getByRole('button', { name: /Campo de IP da sondagem/ })).toContainText(
        'IP',
      );
      await page.getByRole('textbox', { name: /^Porta/ }).fill(String(simuladorDoControle.porta));
      // O login do tipo começa em "Nenhum" (change login-de-cada-controle).
      await expect(
        page.getByRole('button', { name: /Login$/ }).and(page.locator('[aria-haspopup="listbox"]')),
      ).toContainText('Nenhum');
      await selecionar(page, 'Login', 'Switch do CPD');
      await page.getByRole('button', { name: 'Salvar alterações' }).click();
      await expect(page.getByText('Tipo salvo.')).toBeVisible();

      coletorDaSondagem = spawn(
        process.execPath,
        [join(raiz, 'apps', 'collector', 'src', 'servidor.ts')],
        {
          cwd: raiz,
          env: {
            ...process.env,
            GRAFITE_COLETOR_API_URL: `http://127.0.0.1:${PORTA_DA_PILHA}`,
            GRAFITE_COLETOR_ENDERECO: ENDERECO_DA_PILHA,
            GRAFITE_COLETOR_TOKEN: token,
            GRAFITE_COLETOR_PASTA: filaDaSondagem,
            GRAFITE_COLETOR_PORTA: String(PORTA_DA_PILHA + 2),
          },
          stdio: 'ignore',
        },
      );
      // O lote da sondagem chega em até 10 s; a ficha é relida até ela aparecer.
      await page.goto(fichaDa412);
      await abrirCartao(page, 'Saúde do Control iD');
      const saudeDoControle = page.getByRole('region', { name: 'Saúde do Control iD' });
      await expect(async () => {
        await page.reload();
        await expect(saudeDoControle).toContainText('Respondendo', { timeout: 2_000 });
      }).toPass({ timeout: 40_000 });
      await expect(saudeDoControle).toContainText('6.12.2 · iDAccess Pro');
      await expect(saudeDoControle).toContainText('Login próprio do controle');
      // O formulário guarda os valores de quando a ficha abriu; recarregada, ela mostra a série nova.
      await page.reload();
      await abrirCartao(page, 'Identificação');
      await expect(page.getByRole('textbox', { name: 'Número de série' })).toHaveValue(
        '0M0400/123456',
      );
      await expect(page.getByText(/^Coleta · Coletor da pilha · /)).toBeVisible();
      expect(simuladorDoControle.sessoesAbertas()).toBe(0);
    } finally {
      coletorDaSondagem?.kill();
      await simuladorDoControle.fechar();
      rmSync(filaDaSondagem, { recursive: true, force: true });
    }

    // 31. A administradora cadastra a HP Brasil, com o CNPJ, na seção Fornecedores, a escolhe como
    // fornecedor da PAT-00412 no cartão Administrativo e a vê na ficha do fornecedor, em "Ativos
    // deste fornecedor" (change p4a-fornecedores).
    await page.goto('/administracao/fornecedores');
    await expect(page.getByText('Nenhum fornecedor ainda.')).toBeVisible();
    await page.getByRole('button', { name: 'Novo fornecedor' }).first().click();
    await page.getByRole('textbox', { name: 'Nome' }).fill('HP Brasil');
    await page.getByRole('textbox', { name: 'CNPJ' }).fill('11.222.333/0001-81');
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(page.getByText('Fornecedor cadastrado.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /HP Brasil/ })).toBeVisible();
    const fichaDaHp = new URL(page.url()).pathname;
    await expect(page.getByText('Nenhum ativo deste fornecedor.')).toBeVisible();
    await page.goto(fichaDa412);
    await abrirCartao(page, 'Administrativo');
    const fornecedorDa412 = page.getByRole('combobox', { name: 'Fornecedor' });
    await fornecedorDa412.fill('11.222');
    await page.getByRole('option', { name: 'HP Brasil', exact: true }).click();
    await expect(fornecedorDa412).toHaveValue('HP Brasil');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Ativo salvo.')).toBeVisible();
    await page.goto(fichaDaHp);
    await expect(page.getByText('Ativos deste fornecedor: 1')).toBeVisible();

    await trocarDeEndereco(page, 7);
    // 32. A administradora liga os consumíveis compatíveis na impressora, cadastra o CF258A com a
    // HP Brasil e a HP LaserJet M404 no Operação e o vê no cartão "Consumíveis compatíveis" da
    // PAT-00412 (change p4b-consumiveis).
    await page.goto('/gestao/catalogo/tipos');
    await page.getByRole('row', { name: /Impressora/ }).click();
    await page
      .locator('label')
      .filter({ has: page.getByRole('checkbox', { name: /^Consumíveis compatíveis/ }) })
      .click();
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByText('Tipo salvo.')).toBeVisible();
    // O Operação abre no Início dele (change redesenho-da-interface); os consumíveis vêm das listas.
    await dock(page).getByRole('button', { name: 'Operação' }).click();
    await page
      .getByRole('navigation', { name: 'Listas do Operação' })
      .getByRole('link', { name: /^Consumíveis/ })
      .click();
    await expect(page.getByText('Nenhum consumível ainda.')).toBeVisible();
    await page.getByRole('button', { name: 'Novo consumível' }).first().click();
    await page.getByRole('textbox', { name: 'Código' }).fill('CF258A');
    await selecionar(page, 'Tipo', 'Toner');
    await selecionar(page, 'Cor', 'Preto');
    await page.getByRole('textbox', { name: 'Rendimento' }).fill('3.000');
    await page.getByRole('combobox', { name: 'Incluir um fornecedor' }).fill('hp');
    await page.getByRole('option', { name: 'HP Brasil', exact: true }).click();
    await page.getByRole('combobox', { name: 'Incluir um modelo' }).fill('m404');
    await page.getByRole('option', { name: 'HP LaserJet M404 · Impressora' }).click();
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByText('Consumível cadastrado.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /CF258A/ })).toBeVisible();
    await page.goto(fichaDa412);
    await expect(
      page
        .getByRole('navigation', { name: 'Grupos da ficha' })
        .getByRole('button', { name: 'Consumíveis compatíveis' }),
    ).toContainText('CF258A');
    await abrirCartao(page, 'Consumíveis compatíveis');
    await expect(page.getByRole('list', { name: 'Consumíveis compatíveis' })).toContainText(
      '3.000 páginas',
    );

    // 32b. O estoque (change p4c-estoque): a administradora cadastra o Almoxarifado em Jundiaí,
    // lança nele a entrada de 10 CF258A, da HP Brasil, define o mínimo 5, lança a saída de 6 para
    // a PAT-00412, que deixa o CF258A abaixo do mínimo, e vê a ocorrência no Início.
    await page.goto('/administracao/locais');
    await page
      .getByRole('row', { name: /^Jundiaí/ })
      .getByText('Jundiaí', { exact: true })
      .click();
    await page.getByRole('button', { name: 'Novo local dentro' }).click();
    const almoxarifado = page.getByRole('dialog', { name: 'Novo local em Jundiaí' });
    await almoxarifado.getByRole('textbox', { name: 'Nome' }).fill('Almoxarifado');
    await almoxarifado.getByRole('button', { name: /Tipo/ }).click();
    await page.getByRole('option', { name: 'Sala' }).click();
    await almoxarifado.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Almoxarifado' })).toBeVisible();

    await page.goto('/operacao/estoque');
    await expect(page.getByText('Nenhum consumível no estoque ainda.')).toBeVisible();
    await page.getByRole('button', { name: 'Entrada' }).first().click();
    const entradaDoToner = page.getByRole('dialog', { name: 'Nova entrada' });
    await entradaDoToner.getByRole('combobox', { name: 'Consumível' }).fill('cf258');
    await page.getByRole('option', { name: 'CF258A', exact: true }).click();
    await entradaDoToner.getByRole('textbox', { name: 'Quantidade' }).fill('10');
    await escolherLocal(page, 'Destino', 'Jundiaí › Almoxarifado', entradaDoToner);
    await entradaDoToner.getByRole('combobox', { name: 'Fornecedor' }).fill('hp');
    await page.getByRole('option', { name: 'HP Brasil', exact: true }).click();
    await entradaDoToner.getByRole('textbox', { name: 'Nota fiscal' }).fill('12345');
    await entradaDoToner.getByRole('button', { name: 'Lançar' }).click();
    await expect(page.getByText('Entrada lançada.')).toBeVisible();
    const doAlmoxarifado = page
      .getByRole('grid', { name: 'Estoque' })
      .getByRole('row')
      .filter({ hasText: 'Jundiaí › Almoxarifado' });
    await expect(doAlmoxarifado).toContainText('10');

    await page
      .getByRole('button', { name: 'Definir mínimo do CF258A em Jundiaí › Almoxarifado' })
      .click();
    const minimoDoToner = page.getByRole('dialog', { name: 'Definir mínimo' });
    await minimoDoToner.getByRole('textbox', { name: 'Mínimo' }).fill('5');
    await minimoDoToner.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Mínimo salvo.')).toBeVisible();

    await page.getByRole('button', { name: 'Lançar CF258A em Jundiaí › Almoxarifado' }).click();
    await page.getByRole('menuitem', { name: 'Saída' }).click();
    const saidaDoToner = page.getByRole('dialog', { name: 'Nova saída' });
    await expect(saidaDoToner).toContainText('Saldo em Jundiaí › Almoxarifado: 10');
    await saidaDoToner.getByRole('textbox', { name: 'Quantidade' }).fill('6');
    await saidaDoToner.getByRole('combobox', { name: 'Ativo' }).fill('PAT-00412');
    await page.getByRole('option', { name: /PAT-00412/ }).click();
    await saidaDoToner.getByRole('button', { name: 'Lançar' }).click();
    await expect(page.getByText('Saída lançada.')).toBeVisible();
    await expect(doAlmoxarifado).toContainText('Abaixo do mínimo');

    await page.goto('/');
    await expect(
      page
        .getByRole('grid', { name: 'Ocorrências abertas' })
        .getByText('CF258A abaixo do mínimo em Jundiaí › Almoxarifado: 4 de 5'),
    ).toBeVisible();

    // 32c. As solicitações (change p4d-solicitacoes): a administradora registra um Toner de 1 preto
    // da PAT-00412 pedido por Bruno Costa, com o CF258A sugerido, entrega o preto do Almoxarifado,
    // que tem 4, e vê a solicitação concluída e a saída nas movimentações, com "Solicitação 1".
    await page.goto('/operacao/solicitacoes');
    await expect(page.getByText('Nenhuma solicitação ainda.')).toBeVisible();
    await page.getByRole('button', { name: 'Nova solicitação' }).first().click();
    const novaSolicitacao = page.getByRole('dialog', { name: 'Nova solicitação' });
    await novaSolicitacao.getByRole('combobox', { name: 'Pedida por' }).fill('bruno');
    await page.getByRole('option', { name: 'Bruno Costa' }).click();
    await novaSolicitacao.getByRole('combobox', { name: 'Adicionar impressora' }).fill('00412');
    await page.getByRole('option', { name: /PAT-00412/ }).click();
    const daPat412 = novaSolicitacao.getByRole('group', { name: /PAT-00412/ });
    await daPat412.getByRole('textbox', { name: 'Preto' }).fill('1');
    await expect(daPat412.getByText('Sugerido: CF258A')).toBeVisible();
    await novaSolicitacao.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Solicitação 1 registrada.')).toBeVisible();

    await page.getByRole('button', { name: 'Ações da solicitação 1' }).click();
    await page.getByRole('menuitem', { name: 'Entregar' }).click();
    const entregaDoToner = page.getByRole('dialog', { name: 'Entrega' });
    const doPreto = entregaDoToner.getByRole('group', { name: 'PAT-00412: 1 Preto' });
    await expect(doPreto.getByRole('radio', { name: 'Do estoque' })).toBeChecked();
    await expect(doPreto.getByRole('button', { name: /Local de origem/ })).toContainText(
      'Jundiaí › Almoxarifado · saldo 4',
    );
    await entregaDoToner.getByRole('button', { name: 'Lançar a entrega' }).click();
    await expect(page.getByText('Entrega lançada.')).toBeVisible();
    await expect(page.getByText('Nenhuma solicitação pendente.')).toBeVisible();
    await page.getByRole('button', { name: 'Ver todas' }).click();
    await expect(
      page.getByRole('grid', { name: 'Solicitações' }).getByRole('row').nth(1),
    ).toContainText('Concluída');

    await page.goto('/operacao/movimentacoes');
    const saidaDaSolicitacao = page
      .getByRole('grid', { name: 'Movimentações' })
      .getByRole('row')
      .nth(1);
    await expect(saidaDaSolicitacao).toContainText('Saída');
    await expect(saidaDaSolicitacao).toContainText('PAT-00412');
    await expect(saidaDaSolicitacao).toContainText('Solicitação 1');

    // 32d. As ordens de serviço (change p4e-ordens-de-servico): a administradora cadastra a Peça
    // RL1-2412 e lança a entrada de 2 no Almoxarifado; registra um conserto da PAT-00412, abre a OS
    // dele, lança nela 1 RL1-2412 do Almoxarifado e a resolve. A solicitação fica concluída, com o
    // que foi feito, e a saída aparece nas movimentações com "OS 1".
    await page.goto('/operacao/consumiveis/novo');
    await page.getByRole('textbox', { name: 'Código' }).fill('RL1-2412');
    await page.getByRole('textbox', { name: 'Nome' }).fill('Rolete de alimentação');
    await selecionar(page, 'Tipo', 'Peça');
    await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
    await expect(page.getByText('Consumível cadastrado.')).toBeVisible();

    await page.goto('/operacao/estoque');
    await page.getByRole('button', { name: 'Entrada' }).first().click();
    const entradaDaPeca = page.getByRole('dialog', { name: 'Nova entrada' });
    await entradaDaPeca.getByRole('combobox', { name: 'Consumível' }).fill('rl1');
    await page.getByRole('option', { name: /RL1-2412/ }).click();
    await entradaDaPeca.getByRole('textbox', { name: 'Quantidade' }).fill('2');
    await escolherLocal(page, 'Destino', 'Jundiaí › Almoxarifado', entradaDaPeca);
    await entradaDaPeca.getByRole('combobox', { name: 'Fornecedor' }).fill('hp');
    await page.getByRole('option', { name: 'HP Brasil', exact: true }).click();
    await entradaDaPeca.getByRole('textbox', { name: 'Nota fiscal' }).fill('12346');
    await entradaDaPeca.getByRole('button', { name: 'Lançar' }).click();
    await expect(page.getByText('Entrada lançada.')).toBeVisible();

    await page.goto('/operacao/solicitacoes');
    await page.getByRole('button', { name: 'Nova solicitação' }).first().click();
    const novoConserto = page.getByRole('dialog', { name: 'Nova solicitação' });
    await novoConserto.getByText('Conserto', { exact: true }).click();
    await novoConserto.getByRole('combobox', { name: 'Pedida por' }).fill('bruno');
    await page.getByRole('option', { name: 'Bruno Costa' }).click();
    await novoConserto.getByRole('combobox', { name: 'Ativo' }).fill('00412');
    await page.getByRole('option', { name: /PAT-00412/ }).click();
    await novoConserto.getByRole('textbox', { name: 'Defeito' }).fill('Atolando papel');
    await novoConserto.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Solicitação 2 registrada.')).toBeVisible();

    await page.getByRole('button', { name: 'Ações da solicitação 2' }).click();
    await page.getByRole('menuitem', { name: 'Abrir OS' }).click();
    await expect(page.getByText('OS 1 aberta.')).toBeVisible();
    await expect(page).toHaveURL(/\/operacao\/ordens\/1$/);

    await page.getByRole('button', { name: 'Lançar peça' }).click();
    const pecaDaOs = page.getByRole('dialog', { name: 'Lançar peça na OS 1' });
    await pecaDaOs.getByRole('combobox', { name: 'Consumível' }).fill('rl1');
    await page.getByRole('option', { name: 'RL1-2412 · Rolete de alimentação' }).click();
    await expect(pecaDaOs.getByRole('button', { name: /Local de origem/ })).toContainText(
      'Jundiaí › Almoxarifado · saldo 2',
    );
    await pecaDaOs.getByRole('textbox', { name: 'Quantidade' }).fill('1');
    await pecaDaOs.getByRole('button', { name: 'Lançar' }).click();
    await expect(page.getByText('Peça lançada.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Peças' })).toContainText(
      '1 RL1-2412 · Rolete de alimentação',
    );

    await page.getByRole('button', { name: 'Resolver', exact: true }).click();
    const resolucao = page.getByRole('dialog', { name: 'Resolver a OS 1' });
    await resolucao.getByRole('textbox', { name: 'O que foi feito' }).fill('Rolete trocado');
    await resolucao.getByRole('button', { name: 'Resolver', exact: true }).click();
    await expect(page.getByText('OS resolvida.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Resolvida');

    await page.goto('/operacao/solicitacoes/2');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Concluída');
    await expect(page.getByText('Rolete trocado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'OS 1 · Resolvida' })).toBeVisible();

    await page.goto('/operacao/movimentacoes');
    const saidaDaOs = page.getByRole('grid', { name: 'Movimentações' }).getByRole('row').nth(1);
    await expect(saidaDaOs).toContainText('Saída');
    await expect(saidaDaOs).toContainText('RL1-2412');
    await expect(saidaDaOs).toContainText('PAT-00412');
    await expect(saidaDaOs).toContainText('OS 1');

    // 32e. Os indicadores da operação (change p4f-indicadores-da-operacao): o tempo de resolução
    // conta a OS 1, dentro da meta, e nenhum ativo tem 2 OS. A administradora muda a meta das OS
    // repetidas para 3 OS, e a auditoria registra o antes e o depois.
    await page.goto('/operacao/indicadores');
    const resolucaoDasOs = page.getByRole('region', { name: 'Tempo de resolução das OS' });
    await expect(resolucaoDasOs.getByText('Mediana de 1 OS resolvida')).toBeVisible();
    await expect(resolucaoDasOs.getByText('Dentro da meta')).toBeVisible();
    const osRepetidas = page.getByRole('region', { name: 'OS repetidas' });
    await expect(osRepetidas.getByText('Nenhum ativo com 2 OS nos últimos 30 dias.')).toBeVisible();
    await osRepetidas.getByRole('button', { name: 'Mudar a meta' }).click();
    const metaDasRepetidas = page.getByRole('dialog', { name: 'Meta das OS repetidas' });
    await metaDasRepetidas.getByRole('textbox', { name: /^Meta/ }).fill('3');
    await metaDasRepetidas.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Meta salva.')).toBeVisible();
    await expect(osRepetidas.getByText('Meta: 3 OS')).toBeVisible();
    await expect(osRepetidas.getByText('Nenhum ativo com 3 OS nos últimos 30 dias.')).toBeVisible();

    await page.goto('/administracao/auditoria');
    await escolherSugestao(page, 'Ação', 'meta', 'Meta de indicador alterada');
    const daMeta = page.getByRole('grid', { name: 'Registros da auditoria' });
    await expect(daMeta.getByRole('row')).toHaveCount(2);
    await daMeta.getByRole('row').nth(1).getByText('Meta de indicador alterada').click();
    const previaDaMeta = page.getByRole('dialog', { name: /Meta de indicador alterada/ });
    await expect(previaDaMeta).toContainText('2 OS → 3 OS');
    await expect(previaDaMeta).toContainText('OS repetidas');

    // 33. A administradora encerra as sessões da conta nova, que vai para a tela de entrada.
    await page.goto(fichaDoBruno);
    await page.getByRole('tab', { name: 'Acesso' }).click();
    await page.getByRole('button', { name: 'Encerrar todas as sessões' }).click();
    await page
      .getByRole('alertdialog', { name: 'Encerrar todas as sessões de Bruno Costa?' })
      .getByRole('button', { name: 'Encerrar as sessões' })
      .click();
    await expect(titulo(doBruno, 'Entrar')).toBeVisible();
    await expect(
      entrada(doBruno).getByText('Sua sessão terminou. Entre de novo para continuar.'),
    ).toBeVisible();

    // 34. A conta nova entra num navegador novo, sem nada guardado dela: o destaque vem da conta,
    // o tema, dos padrões, e a foto, da pessoa.
    const navegadorNovo = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      serviceWorkers: 'block',
      ...doEndereco(5),
    });
    try {
      const deNovo = await navegadorNovo.newPage();
      await deNovo.goto('/');
      await entrarCom(deNovo, 'bruno.costa', SENHA_DO_BRUNO);
      await expect(menuDoUsuario(deNovo, 'Bruno Costa')).toBeVisible();
      await expect(deNovo.locator('html')).toHaveAttribute('data-accent', 'verde');
      await expect(deNovo.locator('html')).toHaveAttribute('data-theme', 'nevoa');
      await carregada(menuDoUsuario(deNovo, 'Bruno Costa').locator('img'));
      // A tabela dos ativos volta como a conta a deixou, personalizada, guardada na conta.
      await dock(deNovo).getByRole('button', { name: 'Ativos', exact: true }).click();
      await expect(escolhaDaVisao(deNovo)).toHaveAccessibleName(
        'Visão Impressoras com senha, personalizada',
      );
      await expect(colunaDosAtivos(deNovo, 'Patrimônio')).toHaveAttribute('aria-sort', 'ascending');
    } finally {
      await navegadorNovo.close();
    }
  } finally {
    await outroNavegador.close();
  }

  // 35. A auditoria da administradora mostra as atribuições, a mais recente primeiro.
  await secoes(page).getByRole('link', { name: 'Auditoria' }).click();
  await escolherSugestao(page, 'Ação', 'atribu', 'Perfil atribuído');
  const registros = page.getByRole('grid', { name: 'Registros da auditoria' });
  // A primeira linha é a do cabeçalho; depois, as três atribuições a Bruno e a do comando a Ana.
  await expect(registros.getByRole('row')).toHaveCount(5);
  await expect(registros.getByRole('row').nth(1)).toContainText('Conta: Bruno Costa (bruno.costa)');

  // 36. As contagens de um local no escopo de quem vê (change relacoes-vivas): a administradora
  // cadastra uma pessoa em Campinas e dá ao perfil de consulta, que a conta nova tem só em Jundiaí,
  // os locais. A conta nova abre a tela de locais, e Campinas diz quantos ativos ela vê lá, que são
  // todos, e quantas pessoas, nenhuma, com o recorte dito.
  await secoes(page).getByRole('link', { name: 'Pessoas' }).click();
  await page.getByRole('button', { name: 'Nova pessoa' }).click();
  await page.getByRole('textbox', { name: 'Nome' }).fill('Carla Dias');
  await escolherLocal(page, 'Local de trabalho', 'Campinas');
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Carla Dias/ })).toBeVisible();
  await page.goto(perfilDeConsulta);
  await page
    .getByText('Cadastrar, renomear, mover, inativar e reativar locais', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Perfil salvo.')).toBeVisible();

  const dasContagens = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    serviceWorkers: 'block',
    ...doEndereco(6),
  });
  try {
    const doBrunoDeNovo = await dasContagens.newPage();
    await doBrunoDeNovo.goto('/');
    await entrarCom(doBrunoDeNovo, 'bruno.costa', SENHA_DO_BRUNO);
    await expect(menuDoUsuario(doBrunoDeNovo, 'Bruno Costa')).toBeVisible();
    await doBrunoDeNovo.goto('/administracao/locais');
    const campinas = doBrunoDeNovo.getByRole('row', { name: /^Campinas/ });
    await expect(campinas).toBeVisible();
    await campinas.getByText('Campinas', { exact: true }).click();
    await expect(doBrunoDeNovo.getByRole('heading', { level: 2, name: 'Campinas' })).toBeVisible();
    // Os ativos de Campinas são todos à vista dela: a contagem não diz recorte.
    await expect(
      doBrunoDeNovo.getByText(/^Ativos: \d+ aqui · \d+ com os de dentro$/),
    ).toBeVisible();
    await expect(doBrunoDeNovo.getByText('Pessoas que você vê: 0')).toBeVisible();
  } finally {
    await dasContagens.close();
  }

  await trocarDeEndereco(page, 8);
  // 37. A distribuição de software pelo agente do GLPI (changes inventario-pelo-agente-glpi e
  // distribuicao-de-software): a administradora gera o endereço dos agentes, e o teste, no papel do
  // agente de um computador, manda o CONTACT, que anuncia o Deploy. Ela liga o agente à PAT-00412,
  // cadastra o pacote com um arquivo de 9 MB, que vai em duas partes, e o distribui à máquina. O
  // agente faz o Deploy como o do GLPI: o getConfig, o getJobs, as partes do espelho conferidas pelo
  // SHA-512 e juntas pelo gunzip e os passos; a ficha da distribuição, que se relê sozinha, mostra a
  // máquina concluída, com o log na ordem.
  await page.goto('/administracao/agentes');
  await page.getByRole('button', { name: 'Gerar o endereço' }).click();
  const dialogoDoEndereco = page.getByRole('dialog', { name: 'Endereço dos agentes' });
  const enderecoDosAgentes =
    (await dialogoDoEndereco.innerText()).match(
      /https?:\/\/\S+\/api\/agentes\/glpi\/[\w-]+/,
    )?.[0] ?? '';
  expect(enderecoDosAgentes).toContain(`localhost:${PORTA_DA_PILHA}/api/agentes/glpi/`);
  await dialogoDoEndereco.getByRole('button', { name: 'Fechar' }).click();

  const deviceid = 'RECEPCAO-01-2026-10-28-09-00-00';
  const contato = await fetch(enderecoDosAgentes, {
    method: 'POST',
    headers: { 'content-type': 'application/x-compress-zlib' },
    body: deflateSync(
      Buffer.from(
        JSON.stringify({
          action: 'contact',
          deviceid,
          name: 'GLPI-Agent',
          version: '1.7.3',
          'installed-tasks': ['inventory', 'deploy'],
        }),
      ),
    ),
  });
  expect(await contato.json()).toMatchObject({
    status: 'ok',
    tasks: { inventory: { server: 'glpi' }, deploy: { server: 'glpi' } },
  });

  await page.reload();
  await page.getByRole('button', { name: 'Ligar RECEPCAO-01 a um ativo' }).click();
  const ligacao = page.getByRole('dialog', { name: 'Ligar RECEPCAO-01 a um ativo' });
  await ligacao.getByRole('textbox', { name: /^Buscar o ativo/ }).fill('00412');
  await ligacao.getByRole('button', { name: 'Buscar ativos' }).click();
  await ligacao
    .getByRole('button', { name: /Ativo$/ })
    .and(page.locator('[aria-haspopup="listbox"]'))
    .click();
  await page.getByRole('option', { name: /PAT-00412/ }).click();
  await ligacao.getByRole('button', { name: 'Ligar', exact: true }).click();
  await expect(
    page.getByText('RECEPCAO-01 ligado. O inventário entra no ativo no próximo envio do agente.'),
  ).toBeVisible();

  const instalador = randomBytes(9 * 1024 * 1024);
  await page.goto('/gestao/software');
  await page.getByRole('button', { name: 'Novo pacote' }).first().click();
  const novoPacote = page.getByRole('dialog', { name: 'Novo pacote' });
  await novoPacote.getByRole('textbox', { name: /^Nome/ }).fill('7-Zip 23.01');
  await novoPacote.getByRole('textbox', { name: /^Versão/ }).fill('23.01');
  await novoPacote
    .getByRole('textbox', { name: /^Comando/ })
    .fill('msiexec /i "7z2301-x64.msi" /qn /norestart');
  await novoPacote
    .getByRole('group', { name: 'Arquivo' })
    .locator('input[type="file"]')
    .setInputFiles({
      name: '7z2301-x64.msi',
      mimeType: 'application/octet-stream',
      buffer: instalador,
    });
  await novoPacote.getByRole('button', { name: 'Cadastrar pacote' }).click();
  await expect(page.getByText('Pacote cadastrado.')).toBeVisible();
  const base = page.getByRole('grid', { name: 'Base de software' });
  await expect(base).toContainText('7z2301-x64.msi · 9 MB');

  await base.getByRole('button', { name: 'Distribuir' }).click();
  const distribuir = page.getByRole('dialog', { name: 'Distribuir 7-Zip 23.01' });
  await distribuir
    .getByRole('list', { name: 'Máquinas achadas' })
    .getByText(/PAT-00412/)
    .click();
  await expect(distribuir.getByText('1 máquina escolhida')).toBeVisible();
  await distribuir.getByRole('button', { name: 'Distribuir para 1 máquina' }).click();
  await expect(page.getByText('Distribuição criada para 1 máquina.')).toBeVisible();
  await expect(page).toHaveURL(/\/gestao\/software\/distribuicoes\/[\w-]+$/);
  const maquinas = page.getByRole('grid', { name: 'Máquinas da distribuição' });
  await expect(maquinas).toContainText('Aguardando o agente');

  /** O GET do cliente "Fusion" do agente: o hash vira `chave[campo]`, e a lista, `chave[]`. */
  const comoOAgente = async (
    url: string,
    args: Record<string, string | string[] | Record<string, string>>,
  ) => {
    const partes = Object.entries(args).flatMap(([chave, valor]) =>
      Array.isArray(valor)
        ? valor.map((item) => `${chave}[]=${encodeURIComponent(item)}`)
        : typeof valor === 'object'
          ? Object.entries(valor).map(
              ([campo, item]) => `${chave}[${campo}]=${encodeURIComponent(item)}`,
            )
          : [`${chave}=${encodeURIComponent(valor)}`],
    );
    const resposta = await fetch(`${url}?${partes.join('&')}`);
    expect(resposta.status).toBe(200);
    return resposta.json();
  };
  const sha512 = (conteudo: Buffer) => createHash('sha512').update(conteudo).digest('hex');
  const configuracao = await comoOAgente(enderecoDosAgentes, {
    action: 'getConfig',
    machineid: deviceid,
    task: { Deploy: '3.0' },
  });
  const remote: string = configuracao.schedule[0].remote;
  expect(remote).toBe(enderecoDosAgentes);
  const tarefas = await comoOAgente(remote, {
    action: 'getJobs',
    machineid: deviceid,
    version: '3.0',
  });
  expect(tarefas.jobs).toHaveLength(1);
  const [job] = tarefas.jobs;
  expect(job.actions[0].cmd).toMatchObject({
    exec: 'msiexec /i "7z2301-x64.msi" /qn /norestart',
    retChecks: [{ type: 'okCode', values: [0, 3010] }],
  });
  const doArquivo = tarefas.associatedFiles[job.associatedFiles[0]];
  expect(doArquivo.name).toBe('7z2301-x64.msi');
  expect(doArquivo.multiparts).toHaveLength(2);
  const juntas: Buffer[] = [];
  for (const parte of doArquivo.multiparts as string[]) {
    const baixada = await fetch(`${doArquivo.mirrors[0]}${parte[0]}/${parte.slice(0, 2)}/${parte}`);
    expect(baixada.status).toBe(200);
    const conteudo = Buffer.from(await baixada.arrayBuffer());
    expect(sha512(conteudo)).toBe(parte);
    juntas.push(gunzipSync(conteudo));
  }
  expect(sha512(Buffer.concat(juntas))).toBe(job.associatedFiles[0]);
  expect(Buffer.concat(juntas).equals(instalador)).toBe(true);
  // A ficha relê a distribuição a cada 5 s (RELEITURA_DA_FICHA), sem evento do servidor: o pedido
  // do agente logo depois de uma releitura só aparece na seguinte, no limite dos 5 s do padrão.
  await expect(maquinas).toContainText('Em andamento', { timeout: 15_000 });

  const passo = (args: Record<string, string | string[]>) =>
    comoOAgente(remote, {
      action: 'setStatus',
      machineid: deviceid,
      part: 'job',
      uuid: job.uuid,
      ...args,
    });
  await passo({ msg: 'job received' });
  await passo({ currentStep: 'checking', status: 'ok', msg: 'all checks are ok' });
  await passo({ currentStep: 'downloading', status: 'ok', msg: 'success' });
  await passo({ currentStep: 'prepare', status: 'ok', msg: 'success' });
  await passo({ actionnum: '0', msg: ["exit status: `0'", 'ok, got expected exit status: 0'] });
  await passo({ currentStep: 'processing', status: 'ok', msg: 'action #1 processing success' });
  await passo({ status: 'ok', msg: 'job successfully completed' });

  // A ficha se relê a cada 5 s enquanto a máquina instala.
  await expect(maquinas).toContainText('Concluída', { timeout: 15_000 });
  await expect(page.getByText(/^1 de 1 concluída/)).toBeVisible();
  await maquinas.getByRole('button', { name: /^Ver o log de .*PAT-00412/ }).click();
  const log = page.getByRole('list', { name: 'Passos do agente' });
  await expect(log.getByRole('listitem')).toHaveText([
    'Agente: job received',
    'Conferindo: ok, all checks are ok',
    'Baixando: ok, success',
    'Preparando: ok, success',
    "Executando: exit status: `0'",
    'Executando: ok, got expected exit status: 0',
    'Executando: ok, action #1 processing success',
    'Fim: ok, job successfully completed',
  ]);
});
