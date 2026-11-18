// Os anexos do formulário que se preenche (spec modulo-chamados, "Formulário que se preenche";
// change chamados-da-ti, design, decisão 21): o endereço de cada arquivo, pelo lugar onde ele
// está, o limite de 5 e as recusas, com o nome do arquivo.
import { describe, expect, it } from 'vitest';
import { enderecoDoAnexo, recusaDoArquivo, recusaDoLimite, separarPeloLimite } from './anexos.ts';

describe('enderecoDoAnexo', () => {
  it('o enviado agora, ainda sem dono, baixa pela rota do sem dono, também no chamado aberto', () => {
    const anexo = { nome: 'erro-vpn.png', bytes: 48_213, onde: 'sem-dono' } as const;
    expect(enderecoDoAnexo('f-1', anexo)).toBe('/api/chamados/anexos/f-1');
    expect(enderecoDoAnexo('f-1', anexo, 1042)).toBe('/api/chamados/anexos/f-1');
  });

  it('o do chamado baixa pelo número dele', () => {
    const anexo = { nome: 'erro-vpn.png', bytes: 48_213, onde: 'no-chamado' } as const;
    expect(enderecoDoAnexo('f-1', anexo, 1042)).toBe('/api/chamados/1042/anexos/f-1');
    expect(enderecoDoAnexo('f-1', anexo)).toBeNull();
  });

  it('o da prévia, que só está no navegador, e o desconhecido não baixam', () => {
    const anexo = { nome: 'erro-vpn.png', bytes: 48_213, onde: 'no-navegador' } as const;
    expect(enderecoDoAnexo('f-1', anexo, 1042)).toBeNull();
    expect(enderecoDoAnexo('f-1', undefined, 1042)).toBeNull();
  });

  it('o id vai codificado no endereço', () => {
    const anexo = { nome: 'a.png', bytes: 1, onde: 'sem-dono' } as const;
    expect(enderecoDoAnexo('a/b', anexo)).toBe('/api/chamados/anexos/a%2Fb');
  });
});

describe('o limite dos anexos', () => {
  it('vão os escolhidos que cabem até 5, na ordem da escolha', () => {
    expect(separarPeloLimite(0, ['a', 'b'])).toEqual({ vao: ['a', 'b'], ficam: [] });
    expect(separarPeloLimite(3, ['a', 'b', 'c'])).toEqual({ vao: ['a', 'b'], ficam: ['c'] });
    expect(separarPeloLimite(5, ['a'])).toEqual({ vao: [], ficam: ['a'] });
    expect(separarPeloLimite(7, ['a'])).toEqual({ vao: [], ficam: ['a'] });
    expect(separarPeloLimite(6, ['a', 'b', 'c'])).toEqual({ vao: [], ficam: ['a', 'b', 'c'] });
  });

  it('a recusa do limite diz quais ficaram de fora', () => {
    expect(recusaDoLimite(['b.png'])).toBe('Anexe até 5 arquivos. Ficou de fora: b.png.');
    expect(recusaDoLimite(['b.png', 'c.png', 'd.png'])).toBe(
      'Anexe até 5 arquivos. Ficaram de fora: b.png, c.png e d.png.',
    );
  });

  it('a recusa de um arquivo começa pelo nome dele', () => {
    expect(recusaDoArquivo('vazio.txt', 'O arquivo está vazio.')).toBe(
      'vazio.txt: O arquivo está vazio.',
    );
  });
});
