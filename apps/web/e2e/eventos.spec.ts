import { randomUUID } from 'node:crypto';
import { IDS, simularAdministracao } from './api-da-administracao.ts';
import { expect, test } from './fixtures.ts';

// Spec eventos-em-tempo-real: a tela aberta se atualiza com os eventos do servidor, sem recarregar,
// com a web compilada, a API simulada e a conexão de eventos da fixture.

declare global {
  interface Window {
    __mesmaPagina?: boolean;
  }
}

test('a lista de pessoas aberta mostra quem foi cadastrado em outro lugar, pelo evento', async ({
  page,
  servidor,
}) => {
  const api = await simularAdministracao(page);
  await page.goto('/administracao/pessoas');
  await expect(page.getByRole('row', { name: /Carla Dias/ })).toBeVisible();
  const lidas = api.consultasA('/api/pessoas').length;
  // Uma recarga apagaria a marca.
  await page.evaluate(() => {
    window.__mesmaPagina = true;
  });

  // Outra pessoa da administração cadastra Eduarda Lima, e a API avisa as telas abertas.
  const eduarda = randomUUID();
  api.estado.pessoas.push({
    id: eduarda,
    nome: 'Eduarda Lima',
    email: null,
    matricula: '004515',
    telefone: null,
    situacao: 'ativa',
    localId: IDS.expedicao,
    foto: null,
  });
  servidor.eventos.push({ tipo: 'pessoas.mudaram', alvo: { tipo: 'pessoa', id: eduarda } });

  await expect(page.getByRole('row', { name: /Eduarda Lima/ })).toContainText(
    'Jundiaí › Expedição',
  );
  expect(api.consultasA('/api/pessoas').length).toBeGreaterThan(lidas);
  expect(await page.evaluate(() => window.__mesmaPagina)).toBe(true);
});
