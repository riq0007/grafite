// O resumo dos backups por controle (spec backup-do-control-id, "Resumo dos backups por controle";
// change suprimentos-rostos-e-backups, design, decisão 6).
import { ativos, backupsDoControlId, campos, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CofreDeTeste, montarCofre } from '../../test/cofre.ts';
import { type ApiDeTeste, abrirApi, atribuir, criarPerfil } from '../../test/integracao.ts';

const host = 'grafite.resumo-dos-backups.local';

let api: ApiDeTeste;
let cofre: CofreDeTeste;
let org = '';
const ids: Record<string, string> = {};
const id = (nome: string) => ids[nome] ?? '';
const DIA = 24 * 60 * 60_000;

async function controle(patrimonio: string) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId: id('tipo'),
        busca: '',
        patrimonio,
        localId: cofre.jundiai,
        valores: { [id('ip')]: '10.0.7.78' },
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    return linha?.id ?? '';
  });
}

const categorias = (usuarios: number, rostos: number | 'erro') => [
  { categoria: 'users', situacao: 'ok' as const, quantidade: usuarios },
  rostos === 'erro'
    ? { categoria: 'face_images', situacao: 'erro' as const, quantidade: 0, erro: 'tempo esgotado' }
    : { categoria: 'face_images', situacao: 'ok' as const, quantidade: rostos },
];

beforeAll(async () => {
  api = await abrirApi();
  cofre = await montarCofre(api, host);
  org = cofre.org;
  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip' })
      .returning({ id: campos.id });
    ids.ip = ip?.id ?? '';
  });
  const r = await cofre.cliente.enviar('POST', '/cofre/segredos', cofre.como('ana'), {
    nome: 'Admin dos controles',
    tipo: 'conta-administrativa',
    classificacao: 'equipamento',
    identificador: 'admin',
    ativoIds: [],
    valor: 's3nha-dos-controles',
  });
  expect(r.statusCode, r.body).toBe(201);
  ids.tipo = await naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Controle de acesso',
        nomeNormalizado: normalizarTexto('Controle de acesso'),
        icone: 'generico',
        capacidades: ['controlid.saude', 'controlid.backup'],
        configuracaoDasCapacidades: {
          'controlid.saude': { campoDoIp: id('ip'), porta: 80, segredoId: r.json().id },
          'controlid.backup': { horario: '02:00' },
        },
      })
      .returning({ id: tiposDeAtivo.id });
    return linha?.id ?? '';
  });
  ids.portaria = await controle('PAT-00778');
  ids.almoxarifado = await controle('PAT-00779');
  ids.recepcao = await controle('PAT-00780');
  const agora = api.relogio.agora();
  const antes = (dias: number, horas = 0) =>
    new Date(agora.getTime() - dias * DIA - horas * 3_600_000);
  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(backupsDoControlId).values([
      // A portaria: uma falha e um sucesso no mesmo dia, há 10 dias, e os dois últimos bons.
      {
        orgId: org,
        ativoId: id('portaria'),
        origem: 'agendado',
        situacao: 'falha',
        pedidoEm: antes(10, 1),
        concluidoEm: antes(10, 1),
      },
      {
        orgId: org,
        ativoId: id('portaria'),
        origem: 'manual',
        situacao: 'sucesso',
        pedidoEm: antes(10),
        concluidoEm: antes(10),
        categorias: categorias(101, 380),
      },
      {
        orgId: org,
        ativoId: id('portaria'),
        origem: 'agendado',
        situacao: 'parcial',
        pedidoEm: antes(2),
        concluidoEm: antes(2),
        categorias: categorias(100, 409),
      },
      {
        orgId: org,
        ativoId: id('portaria'),
        origem: 'agendado',
        situacao: 'sucesso',
        pedidoEm: antes(1),
        concluidoEm: antes(1),
        categorias: categorias(98, 412),
      },
      // A recepção: o último bom leu os usuários, mas as fotos deram erro.
      {
        orgId: org,
        ativoId: id('recepcao'),
        origem: 'agendado',
        situacao: 'parcial',
        pedidoEm: antes(1),
        concluidoEm: antes(1),
        categorias: categorias(40, 'erro'),
      },
    ]),
  );
  const ve = await criarPerfil(api, org, { nome: 'Vê backups', permissoes: ['controlid.ver'] });
  await atribuir(api, org, { perfilId: ve, contaId: cofre.contas.carla.id });
});

afterAll(async () => {
  await api?.fechar();
});

interface Resumo {
  controles: {
    controle: { id: string; patrimonio: string | null };
    dias: { data: string; situacao: string }[];
    ultimo: { situacao: string; usuarios: number | null; rostos: number | null } | null;
    anterior: { usuarios: number | null; rostos: number | null } | null;
    rostos: { momento: string; valor: number }[];
  }[];
}

const resumo = (consulta = '', quem: 'carla' | 'bruno' = 'carla') =>
  cofre.cliente.consultar(`/controlid/backups/resumo${consulta}`, cofre.como(quem));

describe('o resumo dos backups por controle', () => {
  it('os 30 dias, o último e o anterior, e a série dos rostos', async () => {
    const r = await resumo();
    expect(r.statusCode, r.body).toBe(200);
    const { controles } = r.json() as Resumo;
    expect(controles.map((c) => c.controle.patrimonio).sort()).toEqual([
      'PAT-00778',
      'PAT-00779',
      'PAT-00780',
    ]);
    const portaria = controles.find((c) => c.controle.id === id('portaria'));
    expect(portaria?.dias).toHaveLength(30);
    expect(portaria?.dias.filter((dia) => dia.situacao === 'ok')).toHaveLength(2);
    expect(portaria?.dias.filter((dia) => dia.situacao === 'parcial')).toHaveLength(1);
    expect(portaria?.dias.some((dia) => dia.situacao === 'falha')).toBe(false);
    expect(portaria?.ultimo).toMatchObject({ situacao: 'sucesso', usuarios: 98, rostos: 412 });
    expect(portaria?.anterior).toEqual({ usuarios: 100, rostos: 409 });
    expect(portaria?.rostos.map((ponto) => ponto.valor)).toEqual([380, 409, 412]);
    const almoxarifado = controles.find((c) => c.controle.id === id('almoxarifado'));
    expect(almoxarifado?.dias.every((dia) => dia.situacao === 'nada')).toBe(true);
    expect(almoxarifado?.ultimo).toBeNull();
    expect(almoxarifado?.rostos).toEqual([]);
  });

  it('fotos com erro: os usuários aparecem, e os rostos ficam sem dado', async () => {
    const { controles } = (await resumo(`?ativo=${id('recepcao')}`)).json() as Resumo;
    expect(controles).toHaveLength(1);
    expect(controles[0]?.ultimo).toMatchObject({ situacao: 'parcial', usuarios: 40, rostos: null });
    expect(controles[0]?.rostos).toEqual([]);
  });

  it('os dias pedidos, de 7 a 90', async () => {
    const r = await resumo(`?dias=7&ativo=${id('portaria')}`);
    expect((r.json() as Resumo).controles[0]?.dias).toHaveLength(7);
    expect((await resumo('?dias=5')).statusCode).toBe(400);
  });

  it('pede controlid.ver', async () => {
    expect((await resumo('', 'bruno')).statusCode).toBe(403);
  });
});
