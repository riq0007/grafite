import { describe, expect, it } from 'vitest';
import { comOChat, fraseDa, trilhaDa } from './destino.ts';

describe('a tela maior', () => {
  it('a trilha diz de onde veio', () => {
    expect(trilhaDa({ destino: 'abrir-chamado' })).toEqual(['Aba', 'Abrir chamado']);
    expect(trilhaDa({ destino: 'abrir-chat' })).toEqual(['Aba', 'Abrir chat']);
    expect(trilhaDa({ destino: 'visualizar-chamados' })).toEqual(['Aba', 'Visualizar chamados']);
    expect(trilhaDa({ destino: 'chamado', numero: 1041 })).toEqual(['Aba', 'Abrir chat', '#1041']);
  });

  it('o chat fica no corpo só no chat e no chamado da resposta', () => {
    expect(comOChat({ destino: 'abrir-chat' })).toBe(true);
    expect(comOChat({ destino: 'chamado', numero: 1041 })).toBe(true);
    expect(comOChat({ destino: 'abrir-chamado' })).toBe(false);
  });

  it('as duas opções sem conteúdo dizem que chegam numa versão seguinte', () => {
    expect(fraseDa({ destino: 'abrir-chamado' })?.titulo).toMatch(/versão seguinte/);
    expect(fraseDa({ destino: 'visualizar-chamados' })?.titulo).toMatch(/versão seguinte/);
    expect(fraseDa({ destino: 'abrir-chat' })).toBeNull();
  });
});
