// Os alvos dos chamados na consulta da auditoria (spec chamados, "Permissões, auditoria e eventos
// dos chamados"; change chamados-da-ti, design, decisão 18, "Os alvos na consulta da auditoria
// (tarefa 4.21)"): o chamado pelo número e pelo título de agora, o tipo pelo nome e a resposta
// pronta pelo rótulo, também misturados na mesma página; o Rascunho descartado e a resposta removida
// sem o nome, que fica no antes; e os nomes também com o módulo desligado.
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import {
  type ChamadosDeTeste,
  montarChamados,
  pedidoDoTipo,
  type TipoParaGravar,
} from '../../test/chamados.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';

const host = 'grafite.chamados-auditoria.local';

let api: ApiDeTeste;
let c: ChamadosDeTeste;

interface Registro {
  acao: string;
  alvo: { tipo: string; id: string | null; nome: string | null; usuario: string | null };
  antes: Record<string, unknown> | null;
}

/**
 * Os registros dos alvos dados como `tipo:id`, pela ação e pelo nome do alvo, como Lívia, que
 * administra a organização.
 */
async function registrosDe(...alvos: string[]): Promise<Registro[]> {
  const filtro = alvos.map((alvo) => `alvo=${alvo}`).join('&');
  const r = await c.cliente.consultar(`/auditoria?${filtro}`, c.como('livia'));
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { itens: Registro[] }).itens.sort(
    (a, b) => a.acao.localeCompare(b.acao) || (a.alvo.nome ?? '').localeCompare(b.alvo.nome ?? ''),
  );
}

/** A ação e o nome do alvo de cada registro, pela ação e pelo nome. */
const nomesDe = async (...alvos: string[]) =>
  (await registrosDe(...alvos)).map(({ acao, alvo }) => [acao, alvo.nome]);

/** O alvo do chamado pelo número. */
const doChamado = (numero: number) => `chamado:${c.chamadoId(numero)}`;

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')) });
  c = await montarChamados(api, host);
  await c.entrar();
});

describe('os alvos dos chamados na auditoria', () => {
  it('o chamado, pelo número e pelo título de agora', async () => {
    const numero = await c.abrir({
      ...c.relato('marina'),
      titulo: 'Impressora manchando na borda',
    });
    expect(numero).toBe(1042);
    const trocado = await c.cliente.enviar('PUT', `/chamados/${numero}/titulo`, c.como('ana'), {
      titulo: 'Impressora manchando',
    });
    expect(trocado.statusCode, trocado.body).toBe(200);

    const alvo = {
      tipo: 'chamado',
      id: c.chamadoId(numero),
      nome: '#1042 · Impressora manchando',
      usuario: null,
    };
    expect(
      (await registrosDe(doChamado(numero))).map(({ acao, alvo }) => ({ acao, alvo })),
    ).toEqual([
      { acao: 'chamado.aberto', alvo },
      { acao: 'chamado.titulo-trocado', alvo },
    ]);
  });

  it('o tipo, pelo nome de agora, com o chamado na mesma página; o Rascunho descartado, sem o nome, que fica no antes', async () => {
    const numero = await c.abrir({ ...c.relato('otavio'), titulo: 'Scanner sem o driver' });
    const criado = await c.cliente.enviar('POST', '/chamados/tipos', c.como('livia'));
    expect(criado.statusCode, criado.body).toBe(201);
    const tipo = criado.json() as TipoParaGravar & { id: string };
    const salvo = await c.cliente.enviar('PUT', `/chamados/tipos/${tipo.id}`, c.como('livia'), {
      ...pedidoDoTipo(tipo),
      nome: 'Scanner',
    });
    expect(salvo.statusCode, salvo.body).toBe(200);
    // Dois tipos lidos à parte na mesma página, como na tela sem filtro.
    expect(await nomesDe(doChamado(numero), `tipo-de-chamado:${tipo.id}`)).toEqual([
      ['chamado.aberto', `#${numero} · Scanner sem o driver`],
      ['tipo-de-chamado.alterado', 'Scanner'],
      ['tipo-de-chamado.criado', 'Scanner'],
    ]);

    const descartado = await c.cliente.enviar(
      'DELETE',
      `/chamados/tipos/${tipo.id}`,
      c.como('livia'),
    );
    expect(descartado.statusCode, descartado.body).toBe(204);
    const registros = await registrosDe(`tipo-de-chamado:${tipo.id}`);
    expect(registros.map(({ acao, alvo }) => [acao, alvo.nome])).toEqual([
      ['tipo-de-chamado.alterado', null],
      ['tipo-de-chamado.criado', null],
      ['tipo-de-chamado.descartado', null],
    ]);
    expect(registros[2]?.antes).toMatchObject({ nome: 'Scanner' });
  });

  it('a resposta pronta, pelo rótulo de agora; a removida, sem o nome, que fica no antes', async () => {
    const criada = await c.cliente.enviar('POST', '/chamados/respostas-prontas', c.como('livia'), {
      rotulo: 'Pedir o print',
      texto: 'Oi, {nome}! Pode mandar o print?',
      esperaAResposta: true,
      tipos: [],
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const { id } = criada.json() as { id: string };
    const gravada = await c.cliente.enviar(
      'PUT',
      `/chamados/respostas-prontas/${id}`,
      c.como('livia'),
      {
        rotulo: 'Pedir o print do erro',
        texto: 'Oi, {nome}! Pode mandar o print do erro?',
        esperaAResposta: true,
        tipos: [],
      },
    );
    expect(gravada.statusCode, gravada.body).toBe(200);
    expect(await nomesDe(`resposta-pronta:${id}`)).toEqual([
      ['resposta-pronta.alterada', 'Pedir o print do erro'],
      ['resposta-pronta.criada', 'Pedir o print do erro'],
    ]);

    const removida = await c.cliente.enviar(
      'DELETE',
      `/chamados/respostas-prontas/${id}`,
      c.como('livia'),
    );
    expect(removida.statusCode, removida.body).toBe(204);
    const registros = await registrosDe(`resposta-pronta:${id}`);
    expect(registros.map(({ acao, alvo }) => [acao, alvo.nome])).toEqual([
      ['resposta-pronta.alterada', null],
      ['resposta-pronta.criada', null],
      ['resposta-pronta.removida', null],
    ]);
    expect(registros[2]?.antes).toMatchObject({ rotulo: 'Pedir o print do erro' });
  });

  it('com o módulo desligado, a consulta segue com os nomes, dois chamados na mesma página', async () => {
    const teclado = await c.abrir({ ...c.relato('fernanda'), titulo: 'Teclado sem a tecla Enter' });
    const mouse = await c.abrir({ ...c.relato('paulo'), titulo: 'Mouse falhando' });
    await desligarModulos(api, c.org, ['chamados']);
    try {
      expect(await nomesDe(doChamado(teclado), doChamado(mouse))).toEqual([
        ['chamado.aberto', `#${teclado} · Teclado sem a tecla Enter`],
        ['chamado.aberto', `#${mouse} · Mouse falhando`],
      ]);
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });
});
