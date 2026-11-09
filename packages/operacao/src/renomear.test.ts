import { describe, expect, it, vi } from 'vitest';
import { renomearComPaciencia } from './renomear.ts';

/** Um erro do sistema de arquivos com o código dele, como o Node o dá. */
const erroDoSistema = (code: string) =>
  Object.assign(new Error(`${code}: operation failed, rename 'a' -> 'b'`), { code });

/** Uma renomeação que falha com os códigos dados, na ordem, e depois dá certo. */
function renomeacaoQueFalha(...codigos: string[]) {
  const falhas = [...codigos];
  return vi.fn(async (_origem: string, _destino: string) => {
    const codigo = falhas.shift();
    if (codigo) throw erroDoSistema(codigo);
  });
}

const semEsperar = () => vi.fn(async (_ms: number) => {});

describe('renomearComPaciencia', () => {
  it('insiste enquanto o Windows segura a pasta (EPERM, EACCES, EBUSY) e renomeia quando ele solta', async () => {
    const renomear = renomeacaoQueFalha('EPERM', 'EACCES', 'EBUSY');
    const esperar = semEsperar();
    await renomearComPaciencia('a.parcial', 'a', { renomear, esperar });
    expect(renomear).toHaveBeenCalledTimes(4);
    expect(renomear).toHaveBeenLastCalledWith('a.parcial', 'a');
    // Esperas crescentes entre as tentativas.
    expect(esperar.mock.calls.map(([ms]) => ms)).toEqual([100, 200, 400]);
  });

  it('o erro que não é passageiro sobe na hora, sem esperar', async () => {
    const renomear = renomeacaoQueFalha('ENOENT');
    const esperar = semEsperar();
    await expect(renomearComPaciencia('a.parcial', 'a', { renomear, esperar })).rejects.toThrow(
      'ENOENT',
    );
    expect(renomear).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('o passageiro que dura mais que o limite sobe com o erro do sistema', async () => {
    const renomear = vi.fn(async () => {
      throw erroDoSistema('EPERM');
    });
    const esperar = semEsperar();
    await expect(
      renomearComPaciencia('a.parcial', 'a', { renomear, esperar, limite: 3000 }),
    ).rejects.toMatchObject({ code: 'EPERM' });
    const esperado = esperar.mock.calls.reduce((total, [ms]) => total + ms, 0);
    expect(esperado).toBeLessThanOrEqual(3000);
    expect(renomear.mock.calls.length).toBe(esperar.mock.calls.length + 1);
  });
});
