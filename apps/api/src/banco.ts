import pg from 'pg';

/**
 * Pool do banco que sobrevive à queda do PostgreSQL: o erro de uma conexão ociosa
 * (banco reiniciado ou parado) é só registrado. A próxima consulta falha e o
 * /health passa a responder 503, sem derrubar o processo.
 */
export function criarPoolDoBanco(url: string, aoPerderConexao: (erro: Error) => void): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 2000 });
  pool.on('error', aoPerderConexao);
  return pool;
}

/**
 * O erro de unicidade do PostgreSQL, direto ou embrulhado pelo Drizzle; com a restrição dada, só o
 * dela.
 */
export function violouUnicidade(erro: unknown, restricao?: string): boolean {
  const original = erroDoBanco(erro);
  return (
    original?.code === '23505' && (restricao === undefined || original.constraint === restricao)
  );
}

/** O erro de uma restrição `check` do PostgreSQL, direto ou embrulhado pelo Drizzle, pelo nome. */
export function violouVerificacao(erro: unknown, restricao: string): boolean {
  const original = erroDoBanco(erro);
  return original?.code === '23514' && original.constraint === restricao;
}

function erroDoBanco(erro: unknown) {
  const doBanco = (e: unknown) => e as { code?: string; constraint?: string } | null;
  return doBanco(erro)?.code ? doBanco(erro) : doBanco((erro as { cause?: unknown } | null)?.cause);
}
