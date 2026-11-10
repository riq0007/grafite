import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  type AjustesDasPreferencias,
  type AlvoDoEvento,
  aplicarMudanca,
  MODULOS_OPCIONAIS,
  PERMISSOES,
  type Permissao,
  type TipoDeEvento,
} from '@grafite/domain';
import { test as base, expect, type Page } from '@playwright/test';

/** Resposta do /api/health de um servidor no ar. */
export const SAUDE = { status: 'ok', versao: '0.0.0', banco: 'ok' };

/** Uma permissão da sessão, como a API a dá: na organização inteira ou nos ramos dos locais. */
export interface PermissaoDaSessao {
  chave: Permissao;
  organizacao: boolean;
  locais: string[];
}

/** O acesso de quem tem o perfil Administrador: o catálogo inteiro, na organização inteira. */
export const DA_ADMINISTRADORA: PermissaoDaSessao[] = PERMISSOES.map(({ chave }) => ({
  chave,
  organizacao: true,
  locais: [],
}));

/** A foto da pessoa de "Ana Souza", que a fixture serve em todos os tamanhos. */
export const FOTO_DA_CONTA = { id: '0199a6e0-0000-7000-8000-0000000000f1' };

/** Um retrato em SVG, no lugar das miniaturas que a API gera. */
const RETRATO = readFileSync(new URL('./exemplos/retrato.svg', import.meta.url), 'utf-8');

/**
 * Resposta do GET /api/sessao: a sessão da conta, valendo, com as permissões dadas, numa
 * organização sem padrões e com a conta sem preferências mudadas, com a foto dada ou sem foto.
 */
export const sessaoDe = (
  conta: { usuario: string; nome: string },
  permissoes: PermissaoDaSessao[],
  foto: { id: string } | null = null,
) => ({
  organizacao: { nome: 'Empresa de exemplo', preferencias: {} as AjustesDasPreferencias },
  sessao: {
    conta: {
      id: '0199a6e0-0000-7000-8000-0000000000c1',
      ...conta,
      pessoaId: '0199a6e0-0000-7000-8000-0000000000a1',
      foto,
      preferencias: {} as AjustesDasPreferencias,
    },
    pendencia: null,
    csrf: 'csrf-de-teste',
    expiraEm: '2099-01-01T00:00:00.000Z',
    acesso: { permissoes },
  },
});

/** Resposta do GET /api/sessao: a sessão de "Ana Souza", administradora, valendo. */
export const SESSAO = sessaoDe(
  { usuario: 'ana.souza', nome: 'Ana Souza' },
  DA_ADMINISTRADORA,
  FOTO_DA_CONTA,
);

/** A sessão de "Bruno Costa", valendo, numa conta sem permissões. */
export const SESSAO_SEM_PERMISSOES = sessaoDe({ usuario: 'bruno.costa', nome: 'Bruno Costa' }, []);

/** Resposta do GET /api/sessao sem sessão, no mesmo endereço. */
export const SEM_SESSAO = { organizacao: SESSAO.organizacao, sessao: null };

/**
 * A chegada terminou: a primeira tela está à vista e recebe o teclado e o toque. Com a sessão
 * valendo, é a casca; sem sessão, a chegada fica na tela de entrada até a pessoa entrar.
 *
 * A primeira tela já está no lugar enquanto o carregamento sai por cima dela, e até sair ele fica
 * com o toque. Um clique nessa hora é repetido pelo Playwright, que a cada repetição rola o alvo
 * para outro canto da área (o fim, o centro e o início) e deixa a página rolada. Por isso a espera
 * vai até o carregamento sair: tirado do documento ou fora de vista.
 */
export async function esperarAChegada(pagina: Page) {
  await pagina
    .locator('html:is([data-chegada="pronta"], [data-chegada="entrada"])')
    .waitFor({ state: 'attached' });
  await pagina.locator('#chegada').waitFor({ state: 'hidden' });
}

/** A página não rola na horizontal. */
export async function semRolagemHorizontal(pagina: Page) {
  const { rolagem, largura } = await pagina.evaluate(() => ({
    rolagem: document.documentElement.scrollWidth,
    largura: document.documentElement.clientWidth,
  }));
  expect(rolagem).toBeLessThanOrEqual(largura);
}

/** Um evento que a API simulada manda à tela, como a API de verdade: o tipo e o alvo. */
export interface EventoSimulado {
  tipo: TipoDeEvento;
  alvo?: AlvoDoEvento | null;
}

/**
 * O que a API simulada guarda num teste: as preferências que a tela gravou na conta, os padrões e
 * os módulos desligados da organização e os eventos empurrados que a tela ainda não recebeu.
 */
export interface ServidorSimulado {
  preferenciasDaConta: AjustesDasPreferencias;
  padroesDaOrganizacao: AjustesDasPreferencias;
  /** Os módulos opcionais que a organização desligou, que a seção Módulos liga e desliga. */
  modulosDesligados: string[];
  /**
   * Um evento posto aqui chega à tela na próxima vez que ela se ligar à conexão de eventos, o que
   * ela faz sozinha a cada `RECONEXAO_DOS_EVENTOS` ms, sem recarregar.
   */
  eventos: EventoSimulado[];
}

/**
 * De quanto em quanto tempo a tela se liga de novo à conexão de eventos simulada. A rota não segura
 * a resposta aberta: cada ligação entrega os eventos empurrados e termina, e o navegador se liga de
 * novo depois do `retry`.
 */
export const RECONEXAO_DOS_EVENTOS = 1000;

/**
 * Os caminhos da API, depois do /api, que a fixture responde. Uma API simulada na página, como a
 * da Administração, deixa estes passarem à fixture.
 */
export const DA_FIXTURE =
  /^\/(health|sessao|eventos|conta\/preferencias|conta\/foto\/.+|pessoas\/[^/]+\/foto\/.+|organizacao\/padroes|organizacao\/modulos(\/[^/]+)?)$/;

/** Um evento no formato text/event-stream, como a API o manda. */
function noFluxo({ tipo, alvo = null }: EventoSimulado): string {
  const id = randomUUID();
  const dados = { id, tipo, momento: new Date().toISOString(), alvo };
  return `id: ${id}\nevent: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;
}

/**
 * A web compilada roda aqui sem a API. Cada contexto já nasce com o /api/health respondendo como
 * um servidor no ar e com a sessão de "Ana Souza", administradora, valendo. As preferências que a
 * tela grava na conta (PATCH /api/conta/preferencias), os padrões que ela grava na organização
 * (PATCH /api/organizacao/padroes) e os módulos que ela liga e desliga (PUT
 * /api/organizacao/modulos/<id>) ficam no servidor simulado, como a API os guarda, e voltam no
 * estado da sessão. A conexão de eventos entrega os eventos que o teste põe em `servidor.eventos`.
 * As visões e os tipos que o menu do Ativos no dock lê em qualquer tela vêm vazios, e a API simulada
 * dos ativos e a do catálogo os respondem por cima.
 * As pontas a ponta da entrada começam sem sessão, com `test.use({ semSessao: true })`, e as da conta que não pode
 * nada, com `test.use({ semPermissoes: true })`. Um teste que precisa de outra resposta registra a
 * sua rota na página, e ela vale por cima desta.
 *
 * Enquanto a chegada carrega, a casca fica escondida, e as buscas por papel não a encontram. Como
 * uma pessoa, que só age depois de o app aparecer, cada abertura e recarga da página espera a
 * chegada terminar. E as boas-vindas do primeiro acesso já nascem vistas (design do F1c, decisão
 * 10). As pontas a ponta da própria chegada desligam isso com
 * `test.use({ esperarAChegada: false, boasVindasVistas: false })`.
 */
export const test = base.extend<{
  esperarAChegada: boolean;
  boasVindasVistas: boolean;
  semSessao: boolean;
  semPermissoes: boolean;
  /** O ambiente que o servidor diz no estado da sessão (padrão: produção). */
  ambiente: 'desenvolvimento' | 'teste' | 'producao';
  /** A organização do endereço opera o servidor (padrão: não). */
  operaOServidor: boolean;
  servidor: ServidorSimulado;
}>({
  esperarAChegada: [true, { option: true }],
  boasVindasVistas: [true, { option: true }],
  semSessao: [false, { option: true }],
  semPermissoes: [false, { option: true }],
  ambiente: ['producao', { option: true }],
  operaOServidor: [false, { option: true }],
  // biome-ignore lint/correctness/noEmptyPattern: o Playwright pede o objeto das dependências.
  servidor: async ({}, use) => {
    await use({
      preferenciasDaConta: {},
      padroesDaOrganizacao: {},
      modulosDesligados: [],
      eventos: [],
    });
  },
  context: async (
    { context, boasVindasVistas, semSessao, semPermissoes, ambiente, operaOServidor, servidor },
    use,
  ) => {
    const estado = semSessao ? SEM_SESSAO : semPermissoes ? SESSAO_SEM_PERMISSOES : SESSAO;
    // Nenhum pedido à API sai para a rede: o preview o mandaria a uma API que estivesse no ar na
    // máquina. O que nem a fixture nem a API simulada do teste respondem falha com o caminho.
    await context.route('**/api/**', (rota) => {
      const { pathname } = new URL(rota.request().url());
      const detalhe = `A API simulada não responde ${rota.request().method()} ${pathname}.`;
      return rota.fulfill({
        status: 501,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'urn:grafite:problema:nao-simulado',
          title: 'Não simulado',
          status: 501,
          detail: detalhe,
          codigoDeRastreio: 'T5EX-2E2E',
        }),
      });
    });
    await context.route('**/api/health', (rota) => rota.fulfill({ json: SAUDE }));
    await context.route('**/api/sessao', (rota) =>
      rota.request().method() === 'GET'
        ? rota.fulfill({
            json: {
              ambiente,
              organizacao: {
                ...estado.organizacao,
                preferencias: servidor.padroesDaOrganizacao,
                operaOServidor,
                modulosDesligados: servidor.modulosDesligados,
              },
              sessao: estado.sessao && {
                ...estado.sessao,
                conta: { ...estado.sessao.conta, preferencias: servidor.preferenciasDaConta },
              },
            },
          })
        : rota.fallback(),
    );
    // A foto da própria conta e a das pessoas, em qualquer tamanho.
    for (const fotos of ['**/api/conta/foto/**', '**/api/pessoas/*/foto/**']) {
      await context.route(fotos, (rota) =>
        rota.fulfill({ headers: { 'content-type': 'image/svg+xml' }, body: RETRATO }),
      );
    }
    // A conexão de eventos: entrega os eventos empurrados e termina, e o navegador se liga de novo.
    await context.route('**/api/eventos*', (rota) =>
      rota.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
        body: `retry: ${RECONEXAO_DOS_EVENTOS}\n\n${servidor.eventos.splice(0).map(noFluxo).join('')}`,
      }),
    );
    await context.route('**/api/conta/preferencias', (rota) => {
      if (rota.request().method() !== 'PATCH') return rota.fallback();
      servidor.preferenciasDaConta = aplicarMudanca(
        servidor.preferenciasDaConta,
        rota.request().postDataJSON().mudancas,
      );
      return rota.fulfill({ json: servidor.preferenciasDaConta });
    });
    await context.route('**/api/organizacao/padroes', (rota) => {
      if (rota.request().method() !== 'PATCH') return rota.fallback();
      servidor.padroesDaOrganizacao = aplicarMudanca(
        servidor.padroesDaOrganizacao,
        rota.request().postDataJSON().mudancas,
      );
      return rota.fulfill({ json: servidor.padroesDaOrganizacao });
    });
    // O menu do Ativos no dock lê as visões e os tipos em qualquer tela (change visoes-no-dock).
    await context.route('**/api/visoes*', (rota) =>
      rota.request().method() === 'GET' && new URL(rota.request().url()).pathname === '/api/visoes'
        ? rota.fulfill({ json: { visoes: [], mudancas: [], permite: { compartilhar: false } } })
        : rota.fallback(),
    );
    // A tela inicial lê os alertas para resolver (change p3a-regras-e-alertas): sem nenhum, de
    // fábrica; o teste dos alertas responde os dele.
    await context.route('**/api/alertas*', (rota) =>
      rota.request().method() === 'GET' && new URL(rota.request().url()).pathname === '/api/alertas'
        ? rota.fulfill({ json: { itens: [], total: 0, proximo: null } })
        : rota.fallback(),
    );
    // A tela inicial lê os consumíveis abaixo do mínimo (change p4c-estoque): sem nenhum, de
    // fábrica; o teste do estoque responde os dele.
    await context.route('**/api/estoque/abaixo-do-minimo', (rota) =>
      rota.request().method() === 'GET' ? rota.fulfill({ json: { itens: [] } }) : rota.fallback(),
    );
    // Os blocos do Início (changes inicio-ajustavel e opcoes-dos-blocos-do-inicio): sem impressora
    // com o nível lido e sem controles com o backup ligado, de fábrica; os testes dos ativos e do
    // Control iD respondem os deles.
    await context.route('**/api/ativos/suprimentos/menores*', (rota) =>
      rota.request().method() === 'GET' ? rota.fulfill({ json: { itens: [] } }) : rota.fallback(),
    );
    await context.route('**/api/controlid/backups/resumo*', (rota) =>
      rota.request().method() === 'GET'
        ? rota.fulfill({ json: { controles: [] } })
        : rota.fallback(),
    );
    // O sino e a central leem as notificações da conta (change p3b-notificacoes-no-servidor): sem
    // nenhuma, de fábrica; o teste das notificações responde as dele.
    await context.route('**/api/notificacoes*', (rota) =>
      rota.request().method() === 'GET' &&
      new URL(rota.request().url()).pathname === '/api/notificacoes'
        ? rota.fulfill({ json: { itens: [], naoLidas: 0, proximo: null } })
        : rota.fallback(),
    );
    // Os canais de fora da conta (change p3c-email-e-push): o servidor sem o e-mail e sem o push,
    // de fábrica; o teste dos canais responde os dele.
    await context.route('**/api/conta/canais', (rota) =>
      rota.request().method() === 'GET'
        ? rota.fulfill({
            json: {
              email: { situacao: 'sem-configuracao', endereco: null },
              push: { situacao: 'sem-configuracao', chavePublica: null, aparelhos: [] },
            },
          })
        : rota.fallback(),
    );
    await context.route('**/api/tipos-de-ativo', (rota) =>
      rota.request().method() === 'GET'
        ? rota.fulfill({ json: { tipos: [], permite: { cadastrar: false } } })
        : rota.fallback(),
    );
    // Os módulos opcionais, ligados ou desligados, como a API os lista e os grava.
    const modulosDaOrganizacao = () => ({
      modulos: MODULOS_OPCIONAIS.map((modulo) => ({
        ...modulo,
        ligado: !servidor.modulosDesligados.includes(modulo.id),
      })),
    });
    await context.route('**/api/organizacao/modulos', (rota) =>
      rota.request().method() === 'GET'
        ? rota.fulfill({ json: modulosDaOrganizacao() })
        : rota.fallback(),
    );
    await context.route('**/api/organizacao/modulos/*', (rota) => {
      if (rota.request().method() !== 'PUT') return rota.fallback();
      const modulo = new URL(rota.request().url()).pathname.split('/').at(-1) ?? '';
      const { ligado } = rota.request().postDataJSON() as { ligado: boolean };
      servidor.modulosDesligados = ligado
        ? servidor.modulosDesligados.filter((desligado) => desligado !== modulo)
        : [...new Set([...servidor.modulosDesligados, modulo])];
      return rota.fulfill({ json: modulosDaOrganizacao() });
    });
    if (boasVindasVistas) {
      await context.addInitScript(() => {
        try {
          localStorage.setItem('grafite.chegada.boasVindas', 'vistas');
        } catch {
          // Um teste com o armazenamento bloqueado também não vê as boas-vindas.
        }
      });
    }
    await use(context);
  },
  page: async ({ page, esperarAChegada: esperar }, use) => {
    if (esperar) {
      const { goto, reload } = page;
      page.goto = async (...argumentos: Parameters<Page['goto']>) => {
        const resposta = await goto.apply(page, argumentos);
        await esperarAChegada(page);
        return resposta;
      };
      page.reload = async (...argumentos: Parameters<Page['reload']>) => {
        const resposta = await reload.apply(page, argumentos);
        await esperarAChegada(page);
        return resposta;
      };
    }
    await use(page);
  },
});

export { expect };
