import { describe, expect, it } from 'vitest';
import { criarPoolDoBanco } from './banco.ts';

describe('criarPoolDoBanco', () => {
  it('um erro numa conexão ociosa (banco reiniciado) não derruba o processo', async () => {
    const avisos: unknown[] = [];
    const pool = criarPoolDoBanco('postgres://x:y@127.0.0.1:1/z', (erro) => avisos.push(erro));
    const queda = new Error('terminating connection due to administrator command');
    expect(() => pool.emit('error', queda)).not.toThrow();
    expect(avisos).toEqual([queda]);
    await pool.end();
  });
});
