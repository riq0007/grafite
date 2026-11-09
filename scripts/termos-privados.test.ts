import { describe, expect, it } from 'vitest';
import { conferir, lerTermos, normalizar, procurar } from './termos-privados.ts';

// Os termos de ensaio: inventados, para o próprio teste poder ser público.
const TERMOS = ['Termo-De-Ensaio', 'Ação Exemplar'];
const arquivo = (caminho: string, conteudo: string | Buffer) => ({
  caminho,
  conteudo: typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo,
});

describe('normalizar e lerTermos', () => {
  it('tira a caixa e o acento, e a lista ignora as linhas vazias e o CR', () => {
    expect(normalizar('Ação Exemplar')).toBe('acao exemplar');
    expect(lerTermos('Termo-De-Ensaio\r\n\r\n  Ação Exemplar  \n')).toEqual(TERMOS);
  });
});

describe('procurar', () => {
  it('acha o termo sem diferença de caixa nem de acento, num texto', () => {
    expect(
      procurar(
        [arquivo('docs/a.md', 'Na ACAO EXEMPLAR de hoje'), arquivo('docs/b.md', 'nada aqui')],
        TERMOS,
      ),
    ).toEqual([{ arquivo: 'docs/a.md', termo: 2 }]);
  });

  it('acha o termo dentro de um binário', () => {
    const binario = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x00, 0x01]),
      Buffer.from('xxtermo-de-ensaioxx'),
      Buffer.from([0x00]),
    ]);
    expect(procurar([arquivo('imagem.png', binario)], TERMOS)).toEqual([
      { arquivo: 'imagem.png', termo: 1 },
    ]);
  });
});

describe('conferir', () => {
  it('diz só o arquivo e o número do termo, nunca o termo nem a linha', () => {
    const resultado = conferir({
      termos: TERMOS,
      arquivos: [arquivo('apps/x.test.ts', "const nome = 'Ação Exemplar';")],
      listaObrigatoria: false,
    });
    expect(resultado.codigo).toBe(1);
    const saida = resultado.mensagens.join('\n');
    expect(saida).toContain('apps/x.test.ts');
    expect(saida).toContain('termo 2');
    expect(normalizar(saida)).not.toContain('acao exemplar');
    expect(saida).not.toContain('const nome');
  });

  it('sem termo na árvore, passa e diz quantos arquivos conferiu', () => {
    const resultado = conferir({
      termos: TERMOS,
      arquivos: [arquivo('docs/a.md', 'nada aqui'), arquivo('docs/b.md', 'nem aqui')],
      listaObrigatoria: true,
    });
    expect(resultado).toEqual({
      codigo: 0,
      mensagens: ['Nenhum termo privado nos 2 arquivos conferidos.'],
    });
  });

  it('com um arquivo só, a mensagem fica no singular', () => {
    const resultado = conferir({
      termos: TERMOS,
      arquivos: [arquivo('docs/a.md', 'nada aqui')],
      listaObrigatoria: false,
    });
    expect(resultado.mensagens).toEqual(['Nenhum termo privado no arquivo conferido.']);
  });

  it('sem a lista, diz que não conferiu e não reprova', () => {
    const resultado = conferir({
      termos: [],
      arquivos: [arquivo('docs/a.md', 'x')],
      listaObrigatoria: false,
    });
    expect(resultado.codigo).toBe(0);
    expect(resultado.mensagens.join('\n')).toMatch(/não conferiu/);
  });

  it('sem a lista no push da branch principal, reprova', () => {
    const resultado = conferir({
      termos: [],
      arquivos: [arquivo('docs/a.md', 'x')],
      listaObrigatoria: true,
    });
    expect(resultado.codigo).toBe(1);
    expect(resultado.mensagens.join('\n')).toMatch(/GRAFITE_TERMOS_PRIVADOS/);
  });
});
