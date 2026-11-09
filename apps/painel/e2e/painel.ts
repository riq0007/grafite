// O painel das pontas a ponta: cada teste abre o seu servidor simulado, com a página compilada, numa
// porta livre do 127.0.0.1, e a página entra pelo endereço com o código, como o comando a abre. Um
// erro no console da página, como uma recusa da política de segurança, reprova o teste.
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page } from '@playwright/test';
import { lerPagina } from '../../operacao/src/painel/servidor.ts';
import type { CenarioSimulado } from '../simulado/dominio.ts';
import { abrirServidorSimulado } from '../simulado/servidor.ts';

const PAGINA = fileURLToPath(new URL('../dist', import.meta.url));

interface Painel {
  endereco: string;
  codigo: string;
  /** Abre o endereço com o código, como o comando o abre no navegador. */
  abrir(pagina?: Page): Promise<void>;
}

export const test = base.extend<{ cenario: CenarioSimulado; painel: Painel }>({
  cenario: [{ esperaMs: 150 }, { option: true }],
  painel: async ({ cenario, page }, usar) => {
    const servidor = await abrirServidorSimulado({ pagina: await lerPagina(PAGINA), cenario });
    const erros: string[] = [];
    page.on('console', (mensagem) => {
      if (mensagem.type() === 'error') erros.push(mensagem.text());
    });
    page.on('pageerror', (erro) => erros.push(erro.message));
    try {
      await usar({
        endereco: servidor.endereco,
        codigo: servidor.codigo,
        abrir: async (pagina = page) => {
          await pagina.goto(`${servidor.endereco}/#${servidor.codigo}`);
        },
      });
      expect(erros, 'erros no console da página').toEqual([]);
    } finally {
      await servidor.fechar();
    }
  },
});

export { expect };

/** A linha de um serviço na tabela da tela principal, pelo nome dele. */
export const linhaDoServico = (page: Page, nome: string) =>
  page
    .getByRole('table', { name: 'Serviços' })
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: nome, exact: true }) });

export const andamento = (page: Page) => page.getByRole('region', { name: 'Andamento da tarefa' });

/** Escolhe uma opção de um grupo de rádios clicando no rótulo, como quem opera. */
export const escolher = (page: Page, grupo: string, nome: string | RegExp) =>
  page
    .getByRole('radiogroup', { name: grupo })
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: nome, exact: typeof nome === 'string' }) })
    .click();
