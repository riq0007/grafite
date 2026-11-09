// As exceções da regra (spec alertas, "Exceções da regra"; change regras-indicadores-e-tarefas,
// design, decisões 1 e 2): a conferência da lista e a escolha da exceção mais específica.
import { describe, expect, it } from 'vitest';
import {
  conferirExcecoes,
  type ExcecaoDaRegra,
  excecaoDoAtivo,
  parametrosNoAtivo,
} from './excecoes.ts';
import { conferirRegra } from './regras.ts';

const A = '0193a0b2-0000-7000-8000-00000000000a';
const B = '0193a0b2-0000-7000-8000-00000000000b';
const C = '0193a0b2-0000-7000-8000-00000000000c';
const D = '0193a0b2-0000-7000-8000-00000000000d';

const naoAlertar = (tipo: string, id: string) => ({ lugar: { tipo, id }, efeito: 'nao-alertar' });
const outroLimite = (tipo: string, id: string, limite: number, folga = 5) => ({
  lugar: { tipo, id },
  efeito: 'outro-limite',
  limite,
  folga,
});

describe('conferirExcecoes', () => {
  it('aceita "Não alertar" e "Outro limite" na regra do toner', () => {
    expect(
      conferirExcecoes('toner.nivel', [naoAlertar('local', A), outroLimite('modelo', B, 20)]),
    ).toEqual({
      ok: true,
      excecoes: [
        { lugar: { tipo: 'local', id: A }, efeito: 'nao-alertar' },
        { lugar: { tipo: 'modelo', id: B }, efeito: 'outro-limite', limite: 20, folga: 5 },
      ],
    });
  });

  it('sem nada, a lista vazia', () => {
    expect(conferirExcecoes('rede.offline', undefined)).toEqual({ ok: true, excecoes: [] });
  });

  it('recusa cada exceção com a mensagem dela', () => {
    expect(
      conferirExcecoes('rede.offline', [
        { lugar: { tipo: 'modelo' }, efeito: 'nao-alertar' },
        { efeito: 'nao-alertar' },
        outroLimite('tipo', C, 20),
        naoAlertar('ativo', D),
        naoAlertar('ativo', D),
      ]),
    ).toEqual({
      ok: false,
      erros: {
        'excecoes.0': 'Escolha um modelo ativo.',
        'excecoes.1': 'Escolha onde vale a exceção.',
        'excecoes.2': 'Outro limite só vale na regra do toner.',
        'excecoes.4': 'Já existe uma exceção nesse lugar.',
      },
    });
  });

  it('confere o limite e a folga do toner', () => {
    expect(conferirExcecoes('toner.nivel', [outroLimite('modelo', B, 120)])).toEqual({
      ok: false,
      erros: { 'excecoes.0': 'Informe um limite de 1 a 99%.' },
    });
    expect(conferirExcecoes('toner.nivel', [outroLimite('modelo', B, 90, 20)])).toEqual({
      ok: false,
      erros: { 'excecoes.0': 'O limite mais a folga precisa ficar abaixo de 100%.' },
    });
  });

  it('até 50, e nenhuma na regra do coletor', () => {
    const muitas = Array.from({ length: 51 }, (_, i) =>
      naoAlertar('ativo', `0193a0b2-0000-7000-8000-${String(i).padStart(12, '0')}`),
    );
    expect(conferirExcecoes('rede.offline', muitas)).toEqual({
      ok: false,
      erros: { excecoes: 'Use até 50 exceções na regra.' },
    });
    expect(conferirExcecoes('coletor.sem-contato', [naoAlertar('local', A)])).toEqual({
      ok: false,
      erros: { excecoes: 'A regra do coletor não tem exceções.' },
    });
  });

  it('a regra conferida leva as exceções, e os erros delas vão com os da regra', () => {
    const regra = {
      nome: 'Toner em 10% ou menos',
      condicao: 'toner.nivel',
      parametros: { limite: 10, folga: 5 },
      duracao: 0,
      severidade: 'critico',
      escopo: { tipo: 'organizacao', id: null },
    };
    const conferida = conferirRegra({ ...regra, excecoes: [outroLimite('modelo', B, 20)] });
    expect(conferida.ok && conferida.dados.excecoes).toEqual([
      { lugar: { tipo: 'modelo', id: B }, efeito: 'outro-limite', limite: 20, folga: 5 },
    ]);
    const semExcecoes = conferirRegra(regra);
    expect(semExcecoes.ok && semExcecoes.dados.excecoes).toEqual([]);
    const recusada = conferirRegra({ ...regra, nome: '', excecoes: [{ efeito: 'nao-alertar' }] });
    expect(recusada.ok ? {} : recusada.erros).toEqual({
      nome: 'Informe o nome da regra.',
      'excecoes.0': 'Escolha onde vale a exceção.',
    });
  });
});

describe('excecaoDoAtivo', () => {
  const ativo = { id: D, tipoId: C, modeloId: B, localId: A };
  /** O Laboratório (A) dentro de Jundiaí (J). */
  const J = '0193a0b2-0000-7000-8000-0000000000ff';
  const ramos: Record<string, ReadonlySet<string>> = { [A]: new Set([A]), [J]: new Set([J, A]) };
  const ramoDe = (id: string) => ramos[id] ?? new Set([id]);
  const lista = (...excecoes: Record<string, unknown>[]) => {
    const conferida = conferirExcecoes('toner.nivel', excecoes);
    if (!conferida.ok) throw new Error('lista inválida');
    return conferida.excecoes;
  };

  it('sem exceção que o alcance, nenhuma', () => {
    expect(excecaoDoAtivo(lista(naoAlertar('modelo', C)), ativo, ramoDe)).toBeNull();
  });

  it('Ativo vence o local: o ativo, depois o modelo, o tipo e o local', () => {
    const todas = lista(
      naoAlertar('local', A),
      outroLimite('tipo', C, 15),
      outroLimite('modelo', B, 20),
      outroLimite('ativo', D, 30),
    );
    expect(excecaoDoAtivo(todas, ativo, ramoDe)).toMatchObject({ lugar: { tipo: 'ativo' } });
    expect(excecaoDoAtivo(todas.slice(0, 3), ativo, ramoDe)).toMatchObject({
      lugar: { tipo: 'modelo' },
    });
    expect(excecaoDoAtivo(todas.slice(0, 2), ativo, ramoDe)).toMatchObject({
      lugar: { tipo: 'tipo' },
    });
    expect(excecaoDoAtivo(todas.slice(0, 1), ativo, ramoDe)).toMatchObject({
      lugar: { tipo: 'local' },
    });
  });

  it('entre os locais, vence o mais fundo', () => {
    const dosLocais: ExcecaoDaRegra[] = lista(outroLimite('local', J, 25), naoAlertar('local', A));
    expect(excecaoDoAtivo(dosLocais, ativo, ramoDe)).toMatchObject({ lugar: { id: A } });
    expect(excecaoDoAtivo(dosLocais, { ...ativo, localId: null }, ramoDe)).toBeNull();
  });

  it('Modelo que acaba antes: os parâmetros do ativo são os da exceção', () => {
    const doModelo = lista(outroLimite('modelo', B, 20, 5));
    expect(
      parametrosNoAtivo({ limite: 10, folga: 5 }, excecaoDoAtivo(doModelo, ativo, ramoDe)),
    ).toEqual({ limite: 20, folga: 5 });
    expect(parametrosNoAtivo({ limite: 10, folga: 5 }, null)).toEqual({ limite: 10, folga: 5 });
  });
});
