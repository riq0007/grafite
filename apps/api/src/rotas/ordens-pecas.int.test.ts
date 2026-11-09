// As peças das OS pela API (spec ordens-de-servico, "Peças da OS"; estoque, a saída; auditoria,
// "Eventos das ordens de serviço registrados"; change p4e-ordens-de-servico, design, decisão 5): a
// saída do estoque lançada pelo lançamento da P4c, na transação da OS, para o ativo dela e com "OS
// <número>", e a peça na OS, com a recusa da saída no campo da peça.
import { eventos, naOrganizacao, pecasDasOrdens } from '@grafite/db';
import { count } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { definirSaldo, movimentosDa, saldosDa } from '../../test/estoque.ts';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';
import { montarOrdens, type OrdensDeTeste } from '../../test/ordens.ts';

const host = 'grafite.ordens-pecas.local';

let api: ApiDeTeste;
let s: OrdensDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  s = await montarOrdens(api, host);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
});

const enviar = (caminho: string, corpo: object) =>
  s.cliente.enviar('POST', caminho, s.entradas.carla, corpo);

async function abrir(): Promise<number> {
  const r = await enviar('/ordens', { ativo: s.ativos.nb0031, problema: 'Não liga' });
  return r.json().numero;
}

const lancarPeca = (numero: number, corpo: object) => enviar(`/ordens/${numero}/pecas`, corpo);

const fonte = (quantidade = 1) => ({
  consumivel: s.consumiveis.fnt65w,
  local: s.locais.almoxarifado,
  quantidade,
});

const saldoDaFonte = async () =>
  (await saldosDa(api, s.org)).find(
    ({ consumivelId, localId }) =>
      consumivelId === s.consumiveis.fnt65w && localId === s.locais.almoxarifado,
  )?.saldo ?? 0;

const quantasPecas = async () => {
  const [linha] = await naOrganizacao(api.banco, s.org, (tx) =>
    tx.select({ total: count() }).from(pecasDasOrdens),
  );
  return linha?.total ?? 0;
};

describe('peças das OS', () => {
  it('Fonte trocada: a saída do estoque vai para o ativo da OS, com "OS <número>", e a OS lista a peça', async () => {
    await definirSaldo(api, s.org, {
      consumivelId: s.consumiveis.fnt65w,
      localId: s.locais.almoxarifado,
      saldo: 3,
    });
    const numero = await abrir();
    await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
    const r = await lancarPeca(numero, fonte());
    expect(r.statusCode).toBe(200);
    const saida = (await movimentosDa(api, s.org)).at(-1);
    expect(saida).toMatchObject({
      tipo: 'saida',
      consumivelId: s.consumiveis.fnt65w,
      quantidade: 1,
      origemId: s.locais.almoxarifado,
      ativoId: s.ativos.nb0031,
      observacao: `OS ${numero}`,
    });
    expect(r.json().pecas).toEqual([
      {
        id: expect.any(String),
        consumivel: {
          id: s.consumiveis.fnt65w,
          codigo: 'FNT-65W',
          nome: 'Fonte 65W',
          abrir: false,
        },
        quantidade: 1,
        local: { id: s.locais.almoxarifado, caminho: 'Jundiaí › Almoxarifado' },
        movimento: saida?.id,
        lancadaPor: { id: s.contas.carla, nome: 'Carla Dias' },
        lancadaEm: api.relogio.agora().toISOString(),
      },
    ]);
    expect(await saldoDaFonte()).toBe(2);
    expect(await auditoriaDaRequisicao(api, s.org, r)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ acao: 'estoque.saida' }),
        expect.objectContaining({
          acao: 'ordem.peca',
          alvoTipo: 'ordem',
          depois: { consumivel: 'FNT-65W', quantidade: 1, local: 'Jundiaí › Almoxarifado' },
        }),
      ]),
    );
    const gravados = await naOrganizacao(api.banco, s.org, (tx) =>
      tx.select({ tipo: eventos.tipo }).from(eventos),
    );
    expect(gravados.map(({ tipo }) => tipo).sort()).toEqual(['estoque.mudou', 'ordens.mudaram']);
  });

  it('Peça sem saldo: recusada na quantidade, com a mensagem da saída, sem lançar nada', async () => {
    await definirSaldo(api, s.org, {
      consumivelId: s.consumiveis.fnt65w,
      localId: s.locais.almoxarifado,
      saldo: 0,
    });
    const numero = await abrir();
    const antes = {
      pecas: await quantasPecas(),
      movimentos: (await movimentosDa(api, s.org)).length,
    };
    const r = await lancarPeca(numero, fonte());
    expect(r.statusCode).toBe(409);
    expect(r.json().campos).toEqual({
      quantidade: 'O saldo do FNT-65W em Jundiaí › Almoxarifado é 0.',
    });
    expect({
      pecas: await quantasPecas(),
      movimentos: (await movimentosDa(api, s.org)).length,
    }).toEqual(antes);
  });

  it('Peça na OS resolvida: recusada, porque a OS não está em aberto', async () => {
    const numero = await abrir();
    await enviar(`/ordens/${numero}/resolucao`, { solucao: 'Fonte trocada' });
    const r = await lancarPeca(numero, fonte());
    expect(r.statusCode).toBe(409);
    expect(r.json().detail).toBe(`A OS ${numero} não está em aberto.`);
  });

  it('recusa os campos vazios, e o local em que a conta não movimenta o estoque', async () => {
    const numero = await abrir();
    const vazia = await lancarPeca(numero, {});
    expect(vazia.statusCode).toBe(400);
    expect(vazia.json().campos).toEqual({
      consumivel: 'Escolha o consumível.',
      local: 'Escolha o local.',
      quantidade: 'Use um número inteiro de 1 a 100.000.',
    });
    const deCampinas = await lancarPeca(numero, {
      ...fonte(),
      local: s.locais.almoxarifadoDeCampinas,
    });
    expect(deCampinas.statusCode).toBe(403);
  });
});
