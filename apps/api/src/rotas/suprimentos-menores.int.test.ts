// As impressoras de menor nível (spec tela-inicial, "Suprimentos que acabam primeiro"; change
// opcoes-dos-blocos-do-inicio, design, decisão 5): o suprimento de menor nível de cada impressora
// entre os tipos pedidos, nos locais pedidos e nos de dentro, até o nível pedido, com o escopo de
// quem pede.
import { ativos, campos, estadoDosAtivos, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CofreDeTeste, montarCofre, type UsuarioDoCofre } from '../../test/cofre.ts';
import { type ApiDeTeste, abrirApi, criarLocal } from '../../test/integracao.ts';
import { criarColetor } from '../coleta/coletores.ts';

const host = 'grafite.suprimentos-menores.local';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';
const ids: Record<string, string> = {};
const id = (nome: string) => ids[nome] ?? '';

async function tipo(nome: string, capacidades: string[], configuracao: Record<string, unknown>) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        icone: 'impressora',
        capacidades,
        configuracaoDasCapacidades: configuracao,
      })
      .returning({ id: tiposDeAtivo.id });
    return linha?.id ?? '';
  });
}

async function ativo(
  nome: string,
  tipoId: string,
  {
    localId = null,
    situacao = 'ativo',
  }: { localId?: string | null; situacao?: 'ativo' | 'inativo' } = {},
) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId,
        nome,
        localId,
        situacao,
        busca: normalizarTexto(nome),
        valores: {},
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return linha?.id ?? '';
  });
}

/** Os suprimentos de um ativo no estado atual: a descrição e o nível, ou `null` para o que não mede. */
async function suprimentos(
  ativoId: string,
  itens: Array<[descricao: string, nivel: number | null, situacao?: 'valida' | 'inconsistente']>,
) {
  const momento = api.relogio.agora();
  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(estadoDosAtivos).values(
      itens.map(
        ([descricao, nivel, situacao = 'valida'], indice) =>
          ({
            orgId: org,
            ativoId,
            metrica: 'impressora.suprimento',
            item: String(indice + 1),
            momento,
            valorNumero: nivel,
            situacao,
            detalhes: { descricao },
            desde: momento,
            coletorId: id('coletor'),
          }) as typeof estadoDosAtivos.$inferInsert,
      ),
    ),
  );
}

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
  ids.rh = await criarLocal(api, org, { nome: 'RH', paiId: cofre.jundiai });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({
        orgId: org,
        rotulo: 'IP',
        rotuloNormalizado: 'ip',
        tipo: 'ip',
        configuracao: {},
      } as typeof campos.$inferInsert)
      .returning({ id: campos.id });
    ids.ip = ip?.id ?? '';
    const coletor = await criarColetor(tx, {
      nome: 'Coletor da matriz',
      faixas: ['10.0.5.0/24'],
      token: `token-do-coletor-da-matriz-${'x'.repeat(40)}`,
      ator: { tipo: 'sistema', descricao: 'Teste' },
      momento: api.relogio.agora(),
    });
    ids.coletor = coletor.id;
  });
  ids.impressora = await tipo('Impressora', ['snmp.suprimentos'], {
    'snmp.suprimentos': { campoDoIp: id('ip'), versao: '2c', segredoId: null },
  });
  ids.monitor = await tipo('Monitor', [], {});

  // A do RH, dentro de Jundiaí: o fusor quase no fim, o toner na metade e o cilindro sem medida.
  ids.doRh = await ativo('Impressora do RH', id('impressora'), { localId: id('rh') });
  await suprimentos(id('doRh'), [
    ['Fuser Kit', 3],
    ['Black Toner Cartridge', 60],
    ['Imaging Drum', null],
  ]);
  // A do Financeiro, em Campinas: o ciano em 40% e o cilindro em 20%.
  ids.doFinanceiro = await ativo('Impressora do Financeiro', id('impressora'), {
    localId: id('campinas'),
  });
  await suprimentos(id('doFinanceiro'), [
    ['Cyan Toner Cartridge', 40],
    ['Imaging Drum Unit', 20],
  ]);
  // A da Recepção, sem local: o toner em 8%, e uma leitura fora da faixa, que não conta.
  ids.daRecepcao = await ativo('Impressora da Recepção', id('impressora'));
  await suprimentos(id('daRecepcao'), [
    ['Black Toner Cartridge', 8],
    ['Yellow Toner Cartridge', 140, 'inconsistente'],
  ]);
  // Ficam de fora: a inativa, e o monitor, de tipo sem a capacidade.
  ids.inativa = await ativo('Impressora antiga', id('impressora'), { situacao: 'inativo' });
  await suprimentos(id('inativa'), [['Black Toner Cartridge', 1]]);
  ids.oMonitor = await ativo('Monitor da sala', id('monitor'));
  await suprimentos(id('oMonitor'), [['Black Toner Cartridge', 2]]);
});

afterAll(async () => {
  await api?.fechar();
});

interface Item {
  ativo: { id: string; rotulo: string };
  suprimento: { item: string; descricao: string; tipo: string; nivel: number; momento: string };
}

const menores = (consulta = '', usuario: UsuarioDoCofre = 'ana') =>
  cofre.cliente.consultar(`/ativos/suprimentos/menores${consulta}`, cofre.como(usuario));

/** A resposta resumida: a impressora, o nível e o tipo, na ordem em que vieram. */
async function resumo(consulta = '', usuario: UsuarioDoCofre = 'ana') {
  const r = await menores(consulta, usuario);
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { itens: Item[] }).itens.map(
    ({ ativo: doAtivo, suprimento }) =>
      `${doAtivo.rotulo}: ${suprimento.nivel}% ${suprimento.tipo}`,
  );
}

describe('as impressoras de menor nível', () => {
  it('de fábrica: o suprimento de menor nível de cada impressora, da menor para a maior', async () => {
    const r = await menores();
    expect(r.statusCode, r.body).toBe(200);
    const { itens } = r.json() as { itens: Item[] };
    expect(itens.map((item) => item.ativo.id)).toEqual([
      id('doRh'),
      id('daRecepcao'),
      id('doFinanceiro'),
    ]);
    expect(itens[0]).toEqual({
      ativo: { id: id('doRh'), rotulo: 'Impressora do RH' },
      suprimento: {
        item: '1',
        descricao: 'Fuser Kit',
        tipo: 'fusor',
        nivel: 3,
        momento: api.relogio.agora().toISOString(),
      },
    });
    expect(await resumo()).toEqual([
      'Impressora do RH: 3% fusor',
      'Impressora da Recepção: 8% toner',
      'Impressora do Financeiro: 20% cilindro',
    ]);
  });

  it('Só o toner: o menor nível é o do toner, e o fusor não aparece', async () => {
    expect(await resumo('?tipos=toner')).toEqual([
      'Impressora da Recepção: 8% toner',
      'Impressora do Financeiro: 40% toner',
      'Impressora do RH: 60% toner',
    ]);
  });

  it('Só o fusor: só a impressora que informa o nível do fusor', async () => {
    expect(await resumo('?tipos=fusor')).toEqual(['Impressora do RH: 3% fusor']);
  });

  it('vários tipos: o menor entre eles, e o que não mede fica de fora', async () => {
    expect(await resumo('?tipos=toner,cilindro')).toEqual([
      'Impressora da Recepção: 8% toner',
      'Impressora do Financeiro: 20% cilindro',
      'Impressora do RH: 60% toner',
    ]);
  });

  it('Até 30%: só os suprimentos até o nível pedido, e nenhuma impressora quando nenhum chega lá', async () => {
    expect(await resumo('?tipos=toner&nivel=30')).toEqual(['Impressora da Recepção: 8% toner']);
    expect(await resumo('?tipos=toner&nivel=5')).toEqual([]);
    expect(await resumo('?nivel=8')).toEqual([
      'Impressora do RH: 3% fusor',
      'Impressora da Recepção: 8% toner',
    ]);
  });

  it('quantas impressoras: as primeiras do limite pedido', async () => {
    const doze = await menores('?limite=12');
    expect((doze.json() as { itens: Item[] }).itens).toHaveLength(3);
    const tres = await menores('?limite=3&tipos=toner');
    expect((tres.json() as { itens: Item[] }).itens).toHaveLength(3);
  });

  it('os locais pedidos, com os de dentro', async () => {
    expect(await resumo(`?locais=${cofre.jundiai}`)).toEqual(['Impressora do RH: 3% fusor']);
    expect(await resumo(`?locais=${id('campinas')}`)).toEqual([
      'Impressora do Financeiro: 20% cilindro',
    ]);
    expect(await resumo(`?locais=${id('rh')},${id('campinas')}`)).toEqual([
      'Impressora do RH: 3% fusor',
      'Impressora do Financeiro: 20% cilindro',
    ]);
  });

  it('o escopo pelo local de quem pede: só as impressoras dos locais dela', async () => {
    // A Carla vê os ativos só em Jundiaí: nem a sem local, nem a de Campinas.
    expect(await resumo('', 'carla')).toEqual(['Impressora do RH: 3% fusor']);
    expect(await resumo(`?locais=${id('campinas')}`, 'carla')).toEqual([]);
  });

  it('pede ativos.ver', async () => {
    expect((await menores('', 'bruno')).statusCode).toBe(403);
  });

  it('o tipo desconhecido, o nível e o limite fora do intervalo e o local que não é um id recusam', async () => {
    for (const consulta of [
      '?tipos=tinta',
      '?tipos=',
      '?nivel=4',
      '?nivel=101',
      '?limite=2',
      '?limite=13',
      '?locais=jundiai',
    ]) {
      expect((await menores(consulta)).statusCode, consulta).toBe(400);
    }
  });
});
