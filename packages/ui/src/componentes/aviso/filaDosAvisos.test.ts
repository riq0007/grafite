import { describe, expect, it } from 'vitest';
import { type AvisoDaFila, chegar, type EstadoDaFila, FILA_VAZIA, sair } from './filaDosAvisos.ts';

const temporario = (chave: string): AvisoDaFila => ({ chave, persistente: false });
const critico = (chave: string): AvisoDaFila => ({ chave, persistente: true });

/** Chaves na tela (a mais nova primeiro) e na espera, para comparar com valores escritos à mão. */
const chaves = (estado: EstadoDaFila) => ({
  naTela: estado.naTela.map((aviso) => aviso.chave),
  esperando: estado.esperando.map((aviso) => aviso.chave),
});

/** Chegada de vários avisos, em ordem, a partir da fila vazia. */
const depoisDe = (...avisos: AvisoDaFila[]) =>
  avisos.reduce((estado, aviso) => chegar(estado, aviso).estado, FILA_VAZIA);

describe('chegar', () => {
  it('com vaga, o aviso entra na tela, em cima dos outros', () => {
    const mudanca = chegar(depoisDe(temporario('t1')), temporario('t2'));
    expect(chaves(mudanca.estado)).toEqual({ naTela: ['t2', 't1'], esperando: [] });
    expect(mudanca.entram.map((aviso) => aviso.chave)).toEqual(['t2']);
    expect(mudanca.saem).toEqual([]);
  });

  it('com três temporários na tela, o quarto entra e o mais antigo sai', () => {
    const mudanca = chegar(
      depoisDe(temporario('t1'), temporario('t2'), temporario('t3')),
      temporario('t4'),
    );
    expect(chaves(mudanca.estado)).toEqual({ naTela: ['t4', 't3', 't2'], esperando: [] });
    expect(mudanca.saem).toEqual(['t1']);
    expect(mudanca.entram.map((aviso) => aviso.chave)).toEqual(['t4']);
  });

  it('um crítico não sai da tela por causa de outro aviso: saem os temporários mais antigos', () => {
    const inicio = depoisDe(critico('c1'), temporario('t1'), temporario('t2'));
    const primeira = chegar(inicio, temporario('n1'));
    expect(primeira.saem).toEqual(['t1']);
    const segunda = chegar(primeira.estado, temporario('n2'));
    expect(segunda.saem).toEqual(['t2']);
    expect(chaves(segunda.estado)).toEqual({ naTela: ['n2', 'n1', 'c1'], esperando: [] });
  });

  it('com três críticos na tela, o aviso que chega espera, e nada muda na tela', () => {
    const tresCriticos = depoisDe(critico('c1'), critico('c2'), critico('c3'));
    const deAtencao = chegar(tresCriticos, temporario('a1'));
    expect(chaves(deAtencao.estado)).toEqual({ naTela: ['c3', 'c2', 'c1'], esperando: ['a1'] });
    expect(deAtencao.entram).toEqual([]);
    expect(deAtencao.saem).toEqual([]);
    const outroCritico = chegar(deAtencao.estado, critico('c4'));
    expect(chaves(outroCritico.estado).esperando).toEqual(['a1', 'c4']);
  });
});

describe('sair', () => {
  it('quando um aviso sai da tela, o primeiro da espera entra, em cima', () => {
    const cheia = depoisDe(
      critico('c1'),
      critico('c2'),
      critico('c3'),
      temporario('a1'),
      critico('c4'),
    );
    const mudanca = sair(cheia, 'c2');
    expect(chaves(mudanca.estado)).toEqual({ naTela: ['a1', 'c3', 'c1'], esperando: ['c4'] });
    expect(mudanca.entram.map((aviso) => aviso.chave)).toEqual(['a1']);
    expect(mudanca.saem).toEqual(['c2']);
  });

  it('um aviso que sai da espera não chega a entrar na tela', () => {
    const cheia = depoisDe(critico('c1'), critico('c2'), critico('c3'), temporario('a1'));
    const mudanca = sair(cheia, 'a1');
    expect(chaves(mudanca.estado)).toEqual({ naTela: ['c3', 'c2', 'c1'], esperando: [] });
    expect(mudanca.entram).toEqual([]);
    expect(mudanca.saem).toEqual([]);
  });

  it('uma chave que não está na fila não muda nada', () => {
    const estado = depoisDe(temporario('t1'));
    expect(sair(estado, 'outra').estado).toEqual(estado);
  });
});
