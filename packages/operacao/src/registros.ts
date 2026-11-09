// Os registros da operação (spec backup; design do F2d, decisões 11, 13 e 14). O backup e o teste de
// restauração gravam a linha em andamento e depois o resultado em `operacao.*`, com o evento
// `operacao.mudou` na organização que opera o servidor, na mesma transação do resultado. Uma trava
// consultiva do PostgreSQL, presa à conexão de quem roda, garante um de cada vez entre a API e o
// comando; a linha em andamento que sobrou de uma queda vira falha na execução seguinte.
import { publicoDerivado } from '@grafite/domain';
import type pg from 'pg';
import {
  type BackupFeito,
  type DependenciasDoBackup,
  FalhaNoBackup,
  fazerBackup,
} from './backup.ts';
import { backupsProntosNoDestino, type ResultadoNoDestino } from './distribuicao.ts';
import {
  type DependenciasDoTesteDeRestauracao,
  type ResultadoDoTesteDeRestauracao,
  testarRestauracao,
} from './restauracao.ts';

/** A trava consultiva do backup e do teste de restauração, que nunca rodam juntos. */
export const TRAVA_DA_OPERACAO = 7_402_118_001;

export type PedidoDeBackup = 'agenda' | 'tela' | 'comando';

export interface DependenciasDosRegistros {
  /** O pool do papel da aplicação (grafite_app). */
  pool: pg.Pool;
  /** A organização que opera o servidor, que recebe o evento; sem ela, nenhum evento. */
  orgOperadoraId: string | null;
}

const LIMITE_DO_ERRO = 2000;

export async function executarBackup(
  dep: DependenciasDoBackup & DependenciasDosRegistros & { pedidoPor: PedidoDeBackup },
): Promise<BackupFeito & { id: string }> {
  return comATrava(dep.pool, async () => {
    const { rows } = await dep.pool.query<{ id: string }>(
      'insert into operacao.backups (pedido_por) values ($1) returning id',
      [dep.pedidoPor],
    );
    const id = rows[0]?.id ?? '';
    let feito: BackupFeito;
    try {
      feito = await fazerBackup(dep);
    } catch (erro) {
      const destinos: ResultadoNoDestino[] = erro instanceof FalhaNoBackup ? erro.destinos : [];
      await registrarResultado(dep, { tipo: 'backup', id }, (c) =>
        c.query(
          `update operacao.backups
              set situacao = 'falhou', terminado_em = now(), erro = $2, destinos = $3
            where id = $1`,
          [id, limitar(mensagemDe(erro)), JSON.stringify(destinos)],
        ),
      );
      throw erro;
    }
    await registrarResultado(dep, { tipo: 'backup', id }, async (c) => {
      await c.query(
        `update operacao.backups
            set situacao = 'feito', terminado_em = now(), tamanho = $2, destinos = $3,
                pasta = $4, manifesto = $5
          where id = $1`,
        [
          id,
          feito.tamanho,
          JSON.stringify(feito.destinos),
          feito.pasta,
          JSON.stringify(feito.manifesto),
        ],
      );
      if (feito.removidos.length > 0) {
        await c.query(
          `update operacao.backups set removido_em = now()
            where situacao = 'feito' and removido_em is null and pasta = any($1::text[])`,
          [feito.removidos],
        );
      }
    });
    return { id, ...feito };
  });
}

export async function executarTesteDeRestauracao(
  dep: Omit<DependenciasDoTesteDeRestauracao, 'backup'> & DependenciasDosRegistros,
): Promise<ResultadoDoTesteDeRestauracao & { id: string }> {
  return comATrava(dep.pool, async () => {
    const [primeiro] = dep.destinos;
    const backup =
      primeiro === undefined ? undefined : (await backupsProntosNoDestino(primeiro)).at(-1);
    const { rows: testado } = await dep.pool.query<{ id: string }>(
      `select id from operacao.backups
        where situacao = 'feito' and pasta = $1 order by iniciado_em desc limit 1`,
      [backup ?? ''],
    );
    const backupId = testado[0]?.id ?? null;
    const { rows } = await dep.pool.query<{ id: string }>(
      'insert into operacao.testes_de_restauracao (backup_id) values ($1) returning id',
      [backupId],
    );
    const id = rows[0]?.id ?? '';
    const alvo = { tipo: 'teste-de-restauracao', id };
    let resultado: ResultadoDoTesteDeRestauracao;
    try {
      resultado = await testarRestauracao({ ...dep, backup });
    } catch (erro) {
      await registrarResultado(dep, alvo, (c) =>
        c.query(
          `update operacao.testes_de_restauracao
              set situacao = 'falhou', terminado_em = now(), erro = $2 where id = $1`,
          [id, limitar(mensagemDe(erro))],
        ),
      );
      throw erro;
    }
    await registrarResultado(dep, alvo, (c) =>
      c.query(
        `update operacao.testes_de_restauracao
            set situacao = 'feito', terminado_em = now(), detalhes = $2 where id = $1`,
        [id, JSON.stringify(resultado.detalhes)],
      ),
    );
    return { id, ...resultado };
  });
}

/**
 * Roda `fn` com a trava da operação presa a uma conexão própria. Sem a trava, outro processo roda o
 * backup ou o teste agora; com ela, uma linha em andamento é a sobra de uma queda e vira falha.
 */
async function comATrava<T>(pool: pg.Pool, fn: () => Promise<T>): Promise<T> {
  const trava = await pool.connect();
  let quebrada = false;
  try {
    const { rows } = await trava.query<{ travou: boolean }>(
      'select pg_try_advisory_lock($1) as travou',
      [TRAVA_DA_OPERACAO],
    );
    if (!rows[0]?.travou) {
      throw new Error('Já há um backup ou um teste de restauração em andamento.');
    }
    try {
      await pool.query(
        `update operacao.backups set situacao = 'falhou', terminado_em = now(),
                erro = 'O backup foi interrompido antes de terminar.'
          where situacao = 'em-andamento'`,
      );
      await pool.query(
        `update operacao.testes_de_restauracao set situacao = 'falhou', terminado_em = now(),
                erro = 'O teste de restauração foi interrompido antes de terminar.'
          where situacao = 'em-andamento'`,
      );
      return await fn();
    } finally {
      await trava.query('select pg_advisory_unlock($1)', [TRAVA_DA_OPERACAO]).catch(() => {
        quebrada = true;
      });
    }
  } finally {
    trava.release(quebrada);
  }
}

/** Grava o resultado e, com a organização operadora, o evento dele, na mesma transação. */
async function registrarResultado(
  { pool, orgOperadoraId }: DependenciasDosRegistros,
  alvo: { tipo: string; id: string },
  gravar: (cliente: pg.PoolClient) => Promise<unknown>,
): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    await gravar(cliente);
    if (orgOperadoraId !== null) {
      await cliente.query("select set_config('app.org_id', $1, true)", [orgOperadoraId]);
      const publico = publicoDerivado('operacao.mudou', alvo);
      await cliente.query(
        `insert into eventos (org_id, tipo, alvo_tipo, alvo_id, permissao)
         values (app.current_org(), 'operacao.mudou', $1, $2, $3)`,
        [alvo.tipo, alvo.id, publico?.permissao ?? null],
      );
    }
    await cliente.query('commit');
  } catch (erro) {
    await cliente.query('rollback').catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function limitar(texto: string): string {
  const limpo = texto.trim() || 'Falha sem mensagem.';
  return limpo.length <= LIMITE_DO_ERRO ? limpo : `${limpo.slice(0, LIMITE_DO_ERRO - 1)}…`;
}
