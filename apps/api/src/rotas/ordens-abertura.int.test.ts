// A abertura e a correção das OS pela API (spec ordens-de-servico, "Ordem de serviço" e "Quem vê e
// quem atende as OS"; auditoria, "Eventos das ordens de serviço registrados"; eventos-em-tempo-real,
// "Evento de saída gravado com a mudança"; change p4e-ordens-de-servico, design, decisões 2, 3 e 7).
import { eventos, naOrganizacao, ordensDeServico } from '@grafite/db';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';
import { montarOrdens, type OrdensDeTeste } from '../../test/ordens.ts';
import type { UsuarioDasSolicitacoes } from '../../test/solicitacoes.ts';

const host = 'grafite.ordens-abertura.local';

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

const abrir = (pedido: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('POST', '/ordens', s.entradas[usuario], pedido);

const corrigir = (numero: number, pedido: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('PATCH', `/ordens/${numero}`, s.entradas[usuario], pedido);

const noNotebook = (problema: string | null = 'Teclado falhando') => ({
  ativo: s.ativos.nb0031,
  problema,
});

const quantas = async () => {
  const [linha] = await naOrganizacao(api.banco, s.org, (tx) =>
    tx.select({ total: count() }).from(ordensDeServico),
  );
  return linha?.total ?? 0;
};

const eventosGravados = () =>
  naOrganizacao(api.banco, s.org, (tx) =>
    tx
      .select({ tipo: eventos.tipo, permissao: eventos.permissao, locais: eventos.locais })
      .from(eventos),
  );

describe('abertura das OS', () => {
  it('Manutenção achada pela TI: nasce Aberta, com o número seguinte, o ativo, o local e quem abriu', async () => {
    const r = await abrir(noNotebook());
    expect(r.statusCode).toBe(201);
    const agora = api.relogio.agora().toISOString();
    expect(r.json()).toMatchObject({
      situacao: 'aberta',
      ativo: {
        id: s.ativos.nb0031,
        rotulo: 'Dell Latitude 5440',
        patrimonio: 'NB-0031',
        abrir: true,
      },
      local: { id: s.locais.expedicao, caminho: 'Jundiaí › Expedição' },
      solicitacao: null,
      problema: 'Teclado falhando',
      fornecedor: null,
      abertaPor: { id: s.contas.carla, nome: 'Carla Dias' },
      abertaEm: agora,
      resolvidaEm: null,
      encerradaEm: null,
      historico: [
        {
          situacao: 'aberta',
          texto: null,
          fornecedor: null,
          mudadaPor: { id: s.contas.carla, nome: 'Carla Dias' },
          mudadaEm: agora,
        },
      ],
      pecas: [],
      permite: { atender: true },
    });
    const seguinte = await abrir(noNotebook('Tela piscando'));
    expect(seguinte.json().numero).toBe(r.json().numero + 1);
  });

  it('com duas aberturas ao mesmo tempo, os números não se repetem', async () => {
    const [uma, outra] = await Promise.all([abrir(noNotebook()), abrir(noNotebook())]);
    expect([uma.statusCode, outra.statusCode]).toEqual([201, 201]);
    const numeros = [uma.json().numero, outra.json().numero].sort((a, b) => a - b);
    expect(numeros[1] - numeros[0]).toBe(1);
  });

  it('OS sem o problema, o ativo inativo e o que a conta não vê: recusados no campo, sem abrir nada', async () => {
    const antes = await quantas();
    const semProblema = await abrir(noNotebook('   '));
    expect(semProblema.statusCode).toBe(400);
    expect(semProblema.json().campos).toEqual({ problema: 'Descreva o problema.' });
    const semAtivo = await abrir({ problema: 'Não liga' });
    expect(semAtivo.json().campos).toEqual({ ativo: 'Escolha o ativo.' });
    const inativo = await abrir({ ativo: s.ativos.inativa, problema: 'Não liga' });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({ ativo: 'O ativo escolhido está inativo.' });
    const deCampinas = await abrir({ ativo: s.ativos.deCampinas, problema: 'Não liga' });
    expect(deCampinas.statusCode).toBe(400);
    expect(deCampinas.json().campos).toEqual({ ativo: 'Ativo não encontrado.' });
    expect(await quantas()).toBe(antes);
  });

  it('o ativo sem local fica na OS sem local, que só a organização inteira alcança', async () => {
    const ana = await abrir({ ativo: s.ativos.semLocal, problema: 'Não liga' }, 'ana');
    expect(ana.statusCode).toBe(201);
    expect(ana.json()).toMatchObject({ local: null, permite: { atender: true } });
    const carla = await abrir({ ativo: s.ativos.semLocal, problema: 'Não liga' });
    expect(carla.statusCode).toBe(400);
  });

  it('Quem só vê: a API recusa a abertura de uma OS com 403', async () => {
    expect((await abrir(noNotebook(), 'bruno')).statusCode).toBe(403);
    expect((await abrir(noNotebook(), 'eva')).statusCode).toBe(403);
  });

  it('OS aberta: a auditoria guarda o número, o ativo, o local e o problema', async () => {
    const r = await abrir(noNotebook('Não liga'), 'ana');
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'ordem.aberta',
        alvoTipo: 'ordem',
        alvoId: r.json().id,
        depois: {
          numero: r.json().numero,
          ativo: 'Dell Latitude 5440 · NB-0031',
          local: 'Jundiaí › Expedição',
          problema: 'Não liga',
        },
      },
    ]);
  });

  it('OS aberta com a lista aberta: o evento vai para quem vê as OS do local, sem o problema', async () => {
    await abrir(noNotebook());
    expect(await eventosGravados()).toEqual([
      { tipo: 'ordens.mudaram', permissao: 'ordens.ver', locais: [s.locais.expedicao] },
    ]);
  });
});

describe('correção do problema', () => {
  it('Problema corrigido: a auditoria guarda o antes e o depois, e o pedido igual não grava nada', async () => {
    const numero = (await abrir(noNotebook())).json().numero;
    const r = await corrigir(numero, { problema: 'Teclado e touchpad falhando' });
    expect(r.statusCode).toBe(200);
    expect(r.json().problema).toBe('Teclado e touchpad falhando');
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'ordem.corrigida',
        antes: { problema: 'Teclado falhando' },
        depois: { problema: 'Teclado e touchpad falhando' },
      },
    ]);
    const igual = await corrigir(numero, { problema: ' Teclado e touchpad falhando ' });
    expect(igual.statusCode).toBe(200);
    expect(await auditoriaDaRequisicao(api, s.org, igual)).toEqual([]);
  });

  it('recusa o problema vazio, a OS que não existe e a que a conta não vê', async () => {
    const numero = (await abrir(noNotebook())).json().numero;
    const vazio = await corrigir(numero, { problema: '' });
    expect(vazio.statusCode).toBe(400);
    expect(vazio.json().campos).toEqual({ problema: 'Descreva o problema.' });
    expect((await corrigir(999_999, { problema: 'Não liga' })).statusCode).toBe(404);
    const semLocal = (await abrir({ ativo: s.ativos.semLocal, problema: 'Não liga' }, 'ana')).json()
      .numero;
    const naoVe = await corrigir(semLocal, { problema: 'Não liga de jeito nenhum' });
    expect(naoVe.statusCode).toBe(404);
    expect(naoVe.json().detail).toBe('Ordem de serviço não encontrada.');
  });

  it('recusa a correção da OS que não está em aberto e o fornecedor da OS sem fornecedor', async () => {
    const aberta = (await abrir(noNotebook())).json();
    const comFornecedor = await corrigir(aberta.numero, {
      problema: 'Não liga',
      fornecedor: s.fornecedores.dell,
    });
    expect(comFornecedor.statusCode).toBe(400);
    await naOrganizacao(api.banco, s.org, (tx) =>
      tx
        .update(ordensDeServico)
        .set({
          situacao: 'resolvida',
          solucao: 'Teclado trocado',
          resolvidaPor: s.contas.carla,
          resolvidaEm: api.relogio.agora(),
        })
        .where(eq(ordensDeServico.id, aberta.id)),
    );
    const resolvida = await corrigir(aberta.numero, { problema: 'Não liga' });
    expect(resolvida.statusCode).toBe(409);
    expect(resolvida.json().detail).toBe(`A OS ${aberta.numero} não está em aberto.`);
  });
});
