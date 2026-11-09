import { describe, expect, it } from 'vitest';
import { etiquetaDaMigracao, lerDiarioDasMigracoes } from './diario.ts';

describe('diário das migrations', () => {
  it('lista as migrations na ordem, com a etiqueta e o momento que o migrador grava', async () => {
    const diario = await lerDiarioDasMigracoes();
    expect(diario[0]).toEqual({ etiqueta: '0000_fundacao', quando: 1790307060711 });
    expect(diario.map((m) => m.etiqueta)).toContain('0017_papel_do_backup');
    const momentos = diario.map((m) => m.quando);
    expect(momentos).toEqual([...momentos].sort((a, b) => a - b));
  });

  it('dá a etiqueta pelo momento gravado, ou diz que a migration não é desta versão', async () => {
    const diario = await lerDiarioDasMigracoes();
    expect(etiquetaDaMigracao(diario, 1790307060711)).toBe('0000_fundacao');
    expect(etiquetaDaMigracao(diario, 4102444800000)).toBe('desconhecida-4102444800000');
  });
});
