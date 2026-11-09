import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codificarCursor, decodificarCursor, Limite, pagina } from './paginacao.ts';
import { ProblemaDaApi } from './problemas.ts';

const ChaveDaPessoa = z.tuple([z.string(), z.uuid()]);
const ID = '0199a000-0000-7000-8000-000000000001';

describe('cursor', () => {
  it('volta à chave da ordem que o gerou', () => {
    const cursor = codificarCursor(['João da Silva', ID]);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodificarCursor(cursor, ChaveDaPessoa)).toEqual(['João da Silva', ID]);
  });

  it.each([
    ['um texto qualquer', 'abc'],
    ['um JSON de outra forma', codificarCursor(['João da Silva'])],
    ['um id que não é uuid', codificarCursor(['João da Silva', '1'])],
    ['base64 que não é JSON', Buffer.from('{').toString('base64url')],
  ])('recusa %s com dados-invalidos no campo do cursor', (_caso, cursor) => {
    let recusa: unknown;
    try {
      decodificarCursor(cursor, ChaveDaPessoa);
    } catch (erro) {
      recusa = erro;
    }
    expect(recusa).toBeInstanceOf(ProblemaDaApi);
    expect((recusa as ProblemaDaApi).dados).toMatchObject({
      codigo: 'dados-invalidos',
      status: 400,
      campos: { cursor: 'A lista mudou. Recarregue a lista.' },
    });
  });
});

describe('Limite', () => {
  it('vale 50 sem pedido e aceita de 1 a 100', () => {
    expect(Limite.parse(undefined)).toBe(50);
    expect(Limite.parse('1')).toBe(1);
    expect(Limite.parse('100')).toBe(100);
  });

  it.each([
    ['500', 'Use até 100 itens por página.'],
    ['0', 'Use pelo menos 1 item por página.'],
    ['2.5', 'Informe um número inteiro de itens por página.'],
    ['muitos', 'Informe um número inteiro de itens por página.'],
  ])('recusa %s com "%s"', (pedido, mensagem) => {
    const lido = Limite.safeParse(pedido);
    expect(lido.success).toBe(false);
    expect(lido.error?.issues[0]?.message).toBe(mensagem);
  });
});

describe('pagina', () => {
  const linhas = ['a', 'b', 'c', 'd'].map((nome, i) => ({ nome, id: `${i}` }));
  const chave = (linha: { nome: string; id: string }) => [linha.nome, linha.id] as const;

  it('fica com o limite e dá o cursor do último item quando há mais', () => {
    const { linhas: daPagina, proximo } = pagina(linhas, 3, chave);
    expect(daPagina.map((linha) => linha.nome)).toEqual(['a', 'b', 'c']);
    expect(proximo).not.toBeNull();
    expect(JSON.parse(Buffer.from(proximo ?? '', 'base64url').toString())).toEqual(['c', '2']);
  });

  it('não dá cursor na última página', () => {
    expect(pagina(linhas, 4, chave)).toEqual({ linhas, proximo: null });
    expect(pagina([], 50, chave)).toEqual({ linhas: [], proximo: null });
  });
});
