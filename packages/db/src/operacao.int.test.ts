// Os registros da operação do servidor (spec isolamento-organizacoes, "Infraestrutura fora das
// organizações"; design do F2d, decisão 14): o esquema `operacao`, fora das organizações e sem
// RLS, que o papel da aplicação lê e grava sem poder mudar a estrutura.
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

let app: pg.Pool;
let dono: pg.Pool;

beforeAll(() => {
  app = new pg.Pool({ connectionString: inject('urlApp') });
  dono = new pg.Pool({ connectionString: inject('urlDono') });
});

afterEach(async () => {
  await dono.query('delete from operacao.testes_de_restauracao');
  await dono.query('delete from operacao.backups');
  await dono.query("update operacao.agenda set horario = '02:00', dia_do_teste = 0");
});

afterAll(async () => {
  await app?.end();
  await dono?.end();
});

const MANIFESTO = { versao: '0.4.0', migrations: 17, linhas: { pessoas: 3 } };
const DESTINOS = [{ destino: 'D:\\Backups\\Grafite', situacao: 'gravado' }];

async function backupEmAndamento(pedidoPor = 'agenda'): Promise<string> {
  const { rows } = await app.query<{ id: string }>(
    'insert into operacao.backups (pedido_por) values ($1) returning id',
    [pedidoPor],
  );
  return rows[0]?.id ?? '';
}

describe('esquema da operação', () => {
  it('o papel da aplicação registra um backup do começo ao fim', async () => {
    const id = await backupEmAndamento('tela');
    await app.query(
      `update operacao.backups
          set situacao = 'feito', terminado_em = now(), tamanho = 52428800,
              destinos = $2, pasta = '2026-10-07T0500Z', manifesto = $3
        where id = $1`,
      [id, JSON.stringify(DESTINOS), JSON.stringify(MANIFESTO)],
    );
    const { rows } = await app.query(
      `select situacao, pedido_por, tamanho, destinos, pasta, manifesto, erro, removido_em,
              iniciado_em <= terminado_em as em_ordem
         from operacao.backups where id = $1`,
      [id],
    );
    expect(rows).toEqual([
      {
        situacao: 'feito',
        pedido_por: 'tela',
        tamanho: '52428800',
        destinos: DESTINOS,
        pasta: '2026-10-07T0500Z',
        manifesto: MANIFESTO,
        erro: null,
        removido_em: null,
        em_ordem: true,
      },
    ]);
  });

  it('o backup que falhou guarda o erro, e só ele', async () => {
    const id = await backupEmAndamento();
    await expect(
      app.query(
        "update operacao.backups set situacao = 'feito', terminado_em = now(), erro = 'x' where id = $1",
        [id],
      ),
    ).rejects.toThrow(/backups_erro_so_na_falha/);
    const erro = 'O destino \\\\nas\\backups não respondeu.';
    await app.query(
      "update operacao.backups set situacao = 'falhou', terminado_em = now(), erro = $2 where id = $1",
      [id, erro],
    );
    const { rows } = await app.query('select situacao, erro from operacao.backups');
    expect(rows).toEqual([{ situacao: 'falhou', erro }]);
  });

  it('um backup em andamento de cada vez', async () => {
    await backupEmAndamento();
    await expect(backupEmAndamento('tela')).rejects.toThrow(/backups_um_em_andamento/);
  });

  it('o terminado tem o momento do fim, e o em andamento não', async () => {
    const id = await backupEmAndamento();
    await expect(
      app.query("update operacao.backups set situacao = 'feito' where id = $1", [id]),
    ).rejects.toThrow(/backups_fim_com_a_situacao/);
  });

  it.each([
    [
      'situação desconhecida',
      "insert into operacao.backups (pedido_por, situacao, terminado_em) values ('agenda', 'pronto', now())",
      /backups_situacao_valida/,
    ],
    [
      'pedido por quem não existe',
      "insert into operacao.backups (pedido_por) values ('cron')",
      /backups_pedido_por_valido/,
    ],
    [
      'destinos fora de uma lista',
      "insert into operacao.backups (pedido_por, destinos) values ('agenda', '{}')",
      /backups_destinos_validos/,
    ],
    [
      'tamanho negativo',
      "insert into operacao.backups (pedido_por, tamanho) values ('agenda', -1)",
      /backups_tamanho_valido/,
    ],
    [
      'teste com situação desconhecida',
      "insert into operacao.testes_de_restauracao (situacao, terminado_em) values ('pronto', now())",
      /testes_de_restauracao_situacao_valida/,
    ],
    [
      'teste com detalhes fora de um objeto',
      "insert into operacao.testes_de_restauracao (detalhes) values ('[]')",
      /testes_de_restauracao_detalhes_validos/,
    ],
  ])('o banco recusa %s', async (_caso, comando, restricao) => {
    await expect(app.query(comando)).rejects.toThrow(restricao);
  });

  it('o teste de restauração aponta o backup testado e guarda os detalhes', async () => {
    const backupId = await backupEmAndamento();
    await app.query(
      "update operacao.backups set situacao = 'feito', terminado_em = now() where id = $1",
      [backupId],
    );
    const { rows: criados } = await app.query<{ id: string }>(
      'insert into operacao.testes_de_restauracao (backup_id) values ($1) returning id',
      [backupId],
    );
    await app.query(
      `update operacao.testes_de_restauracao
          set situacao = 'feito', terminado_em = now(), detalhes = $2 where id = $1`,
      [criados[0]?.id, JSON.stringify({ tabelas: 18, linhas: 1204 })],
    );
    const { rows } = await app.query(
      'select backup_id, situacao, erro, detalhes from operacao.testes_de_restauracao',
    );
    expect(rows).toEqual([
      {
        backup_id: backupId,
        situacao: 'feito',
        erro: null,
        detalhes: { tabelas: 18, linhas: 1204 },
      },
    ]);
  });

  it('um teste de restauração em andamento de cada vez', async () => {
    await app.query('insert into operacao.testes_de_restauracao default values');
    await expect(
      app.query('insert into operacao.testes_de_restauracao default values'),
    ).rejects.toThrow(/testes_de_restauracao_um_em_andamento/);
  });

  it('o teste de restauração sem backup pronto falha com o motivo', async () => {
    await app.query(
      `insert into operacao.testes_de_restauracao (situacao, terminado_em, erro)
       values ('falhou', now(), 'Nenhum backup pronto para testar.')`,
    );
    const { rows } = await app.query(
      'select backup_id, situacao, erro from operacao.testes_de_restauracao',
    );
    expect(rows).toEqual([
      { backup_id: null, situacao: 'falhou', erro: 'Nenhum backup pronto para testar.' },
    ]);
  });

  it('a agenda tem uma linha só, com 02:00 e o domingo de partida', async () => {
    const { rows } = await app.query('select horario, dia_do_teste from operacao.agenda');
    expect(rows).toEqual([{ horario: '02:00', dia_do_teste: 0 }]);
    await expect(
      dono.query("insert into operacao.agenda (horario) values ('03:00')"),
    ).rejects.toThrow(/agenda_pkey|agenda_uma_linha/);
  });

  it('o papel da aplicação muda a agenda dentro do formato', async () => {
    await app.query(
      "update operacao.agenda set horario = '03:30', dia_do_teste = 6, atualizada_em = now()",
    );
    const { rows } = await app.query('select horario, dia_do_teste from operacao.agenda');
    expect(rows).toEqual([{ horario: '03:30', dia_do_teste: 6 }]);
    await expect(app.query("update operacao.agenda set horario = '24:00'")).rejects.toThrow(
      /agenda_horario_valido/,
    );
    await expect(app.query("update operacao.agenda set horario = '3:30'")).rejects.toThrow(
      /agenda_horario_valido/,
    );
    await expect(app.query('update operacao.agenda set dia_do_teste = 7')).rejects.toThrow(
      /agenda_dia_do_teste_valido/,
    );
  });

  it('o papel da aplicação não apaga a agenda nem muda a estrutura do esquema', async () => {
    await expect(app.query('delete from operacao.agenda')).rejects.toThrow(/permission denied/);
    await expect(app.query('create table operacao.intrusa (x int)')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.query('alter table operacao.backups add column intrusa int')).rejects.toThrow(
      /must be owner/,
    );
  });
});
