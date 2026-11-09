// Os indicadores criados pela API (spec indicadores, "Indicadores da organização" e "Backups do
// Control iD em dia"; change regras-indicadores-e-tarefas, design, decisão 3): quem administra os
// alertas cria, edita e apaga; o cálculo é o da medida, só com os ativos do recorte; quem só vê os
// alertas lê, sem criar.
import { backupsDoControlId, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AlertasDeTeste,
  criarAlerta,
  criarAtivoDoTipo,
  criarRegra,
  criarTipo,
  montarAlertas,
} from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';

const host = 'grafite.indicadores-criados.local';
const ORGANIZACAO = { tipo: 'organizacao', id: null } as const;
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

let api: ApiDeTeste;
let alertas: AlertasDeTeste;
const ids: Record<string, string> = {};

const antes = (ms: number) => new Date(api.relogio.agora().getTime() - ms);

beforeAll(async () => {
  api = await abrirApi();
  alertas = await montarAlertas(api, host);
  const { org } = alertas;
  ids.impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['rede.disponibilidade', 'snmp.suprimentos'],
  });
  ids.controle = await criarTipo(api, org, {
    nome: 'Controle de acesso',
    capacidades: ['controlid.saude', 'controlid.backup'],
  });
  ids.deJundiai = await criarAtivoDoTipo(api, org, {
    tipoId: ids.impressora,
    nome: 'Impressora de Jundiaí',
    localId: alertas.jundiai,
  });
  ids.deCampinas = await criarAtivoDoTipo(api, org, {
    tipoId: ids.impressora,
    nome: 'Impressora de Campinas',
    localId: alertas.campinas,
  });
  ids.portaria = await criarAtivoDoTipo(api, org, {
    tipoId: ids.controle,
    nome: 'Portaria',
    localId: alertas.jundiai,
  });
  ids.garagem = await criarAtivoDoTipo(api, org, {
    tipoId: ids.controle,
    nome: 'Garagem',
    localId: alertas.jundiai,
  });
  ids.offline = await criarRegra(api, org, {
    nome: 'Ativo offline',
    condicao: 'rede.offline',
    parametros: {},
    duracao: 5,
    severidade: 'atencao',
    escopo: ORGANIZACAO,
  });
  // As duas impressoras ficaram 2 dias sem responder: abaixo de 98% nos 30 dias.
  for (const ativoId of [ids.deJundiai, ids.deCampinas]) {
    await criarAlerta(api, org, {
      regraId: ids.offline,
      ativoId,
      texto: 'Sem resposta ao ping',
      severidade: 'atencao',
      abertoHa: (10 * DIA) / MINUTO,
      situacao: 'resolvido',
      resolvidoEm: antes(8 * DIA),
      comoTerminou: 'voltou-ao-normal',
    });
  }
  // A portaria tem o backup bom de hoje; a garagem, só um de 3 dias atrás.
  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(backupsDoControlId).values([
      {
        orgId: org,
        ativoId: ids.portaria as string,
        origem: 'agendado',
        situacao: 'sucesso',
        pedidoEm: antes(2 * HORA),
        concluidoEm: antes(HORA),
      },
      {
        orgId: org,
        ativoId: ids.garagem as string,
        origem: 'agendado',
        situacao: 'sucesso',
        pedidoEm: antes(3 * DIA),
        concluidoEm: antes(3 * DIA),
      },
    ]),
  );
});

afterAll(async () => {
  await api?.fechar();
});

const criar = (pedido: object, usuario: 'ana' | 'davi' = 'ana') =>
  alertas.cliente.enviar('POST', '/alertas/indicadores/criados', alertas.como(usuario), pedido);
const listar = (usuario: 'ana' | 'davi' = 'ana') =>
  alertas.cliente.consultar('/alertas/indicadores/criados', alertas.como(usuario));

describe('indicadores criados pela API', () => {
  it('Disponibilidade das impressoras de Jundiaí: só os ativos do recorte, com a meta dele', async () => {
    const r = await criar({
      nome: 'Impressoras de Jundiaí',
      medida: 'disponibilidade',
      recorte: { tipoId: ids.impressora, localId: alertas.jundiai },
      meta: 980,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      nome: 'Impressoras de Jundiaí',
      medida: 'disponibilidade',
      recorte: {
        tipo: { id: ids.impressora, nome: 'Impressora' },
        modelo: null,
        local: { id: alertas.jundiai, nome: 'Jundiaí' },
      },
      meta: 980,
      metaDeFabrica: 990,
      valor: 1,
      situacao: 'fora',
    });
    expect(r.json().itens.map((item: { alvo: { id: string } }) => item.alvo.id)).toEqual([
      ids.deJundiai,
    ]);
  });

  it('Nome repetido: recusa o nome de outro indicador e a meta fora dos limites', async () => {
    const repetido = await criar({
      nome: 'IMPRESSORAS DE JUNDIAÍ',
      medida: 'disponibilidade',
      meta: 980,
    });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ nome: 'Já existe um indicador com esse nome.' });
    const fora = await criar({ nome: 'Disponibilidade', medida: 'disponibilidade', meta: 1000 });
    expect(fora.statusCode).toBe(400);
    expect(fora.json().campos).toEqual({ meta: 'A meta deve ficar entre 90% e 99,9%.' });
  });

  it('Um controle sem backup: a medida dos backups em dia', async () => {
    const r = await criar({ nome: 'Backups', medida: 'backups-do-control-id', meta: 1000 });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ valor: 500, base: 2, situacao: 'fora' });
    expect(r.json().itens).toEqual([
      {
        alvo: { tipo: 'ativo', id: ids.garagem, nome: 'Garagem', local: 'Jundiaí' },
        detalhe: 'Último backup bom',
        momento: antes(3 * DIA).toISOString(),
      },
    ]);
  });

  it('Quem só vê os alertas: lê os criados, sem criar', async () => {
    const lista = await listar('davi');
    expect(lista.statusCode).toBe(200);
    expect(lista.json().permite).toEqual({ criar: false });
    expect(lista.json().indicadores.map((um: { nome: string }) => um.nome)).toEqual([
      'Backups',
      'Impressoras de Jundiaí',
    ]);
    expect((await criar({ nome: 'Outro', medida: 'critico', meta: 30 }, 'davi')).statusCode).toBe(
      403,
    );
  });

  it('edita e apaga, com a auditoria', async () => {
    const [primeiro] = (await listar()).json().indicadores as { id: string }[];
    const editado = await alertas.cliente.enviar(
      'PATCH',
      `/alertas/indicadores/criados/${primeiro?.id}`,
      alertas.como('ana'),
      { nome: 'Backups dos controles', medida: 'backups-do-control-id', meta: 900 },
    );
    expect(editado.statusCode).toBe(200);
    expect(editado.json()).toMatchObject({ nome: 'Backups dos controles', meta: 900 });
    const apagado = await alertas.cliente.enviar(
      'DELETE',
      `/alertas/indicadores/criados/${primeiro?.id}`,
      alertas.como('ana'),
    );
    expect(apagado.statusCode).toBe(204);
    expect((await listar()).json().indicadores).toHaveLength(1);
  });
});
