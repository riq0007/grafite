// As máquinas no assistente da distribuição (spec distribuicao-de-software, "Assistente da
// distribuição"; spec inventario-pelo-agente, "Agente sem contato"; change software-por-pacote,
// design, decisões 9 e 10).
import { describe, expect, it } from 'vitest';
import {
  classeNoAssistente,
  contaDoAssistente,
  paraQuem,
  semContato,
  textoDoSemContato,
} from './maquinas.ts';

const DIA = 86_400_000;
const momento = new Date('2026-11-14T10:00:00-03:00');
const ha = (dias: number) => new Date(momento.getTime() - dias * DIA);

describe('semContato', () => {
  it('Prazo de fábrica: o agente sem falar há 3 dias está sem contato, há 3 dias', () => {
    expect(semContato(ha(3), momento, 2)).toEqual({ semContato: true, dias: 3 });
  });

  it('Prazo maior: com 4 dias, os 3 dias sem falar ainda são contato', () => {
    expect(semContato(ha(3), momento, 4)).toEqual({ semContato: false, dias: 3 });
  });

  it('o prazo vale quando passa, e os dias contam inteiros', () => {
    expect(semContato(ha(2), momento, 2).semContato).toBe(false);
    expect(semContato(ha(2.1), momento, 2)).toEqual({ semContato: true, dias: 2 });
    expect(semContato(ha(0.5), momento, 1)).toEqual({ semContato: false, dias: 0 });
  });

  it('diz há quanto tempo, no singular e no plural', () => {
    expect(textoDoSemContato(1)).toBe('Sem contato · há 1 dia');
    expect(textoDoSemContato(3)).toBe('Sem contato · há 3 dias');
  });
});

describe('classeNoAssistente', () => {
  it('pulada vem antes de na fila: a máquina sem contato já na versão-alvo é pulada', () => {
    expect(classeNoAssistente({ situacao: 'na-versao', semContato: true })).toBe('pulada');
    expect(classeNoAssistente({ situacao: 'na-versao', semContato: false })).toBe('pulada');
  });

  it('a sem contato fora da versão-alvo fica na fila, e a em contato vai instalar', () => {
    expect(classeNoAssistente({ situacao: 'desatualizada', semContato: true })).toBe('na-fila');
    expect(classeNoAssistente({ situacao: 'sem-o-programa', semContato: true })).toBe('na-fila');
    expect(classeNoAssistente({ situacao: 'desatualizada', semContato: false })).toBe(
      'vai-instalar',
    );
    expect(classeNoAssistente({ situacao: 'sem-o-programa', semContato: false })).toBe(
      'vai-instalar',
    );
  });

  it('o pacote sem versão-alvo não pula ninguém', () => {
    expect(classeNoAssistente({ situacao: 'instalado-sem-alvo', semContato: false })).toBe(
      'vai-instalar',
    );
    expect(classeNoAssistente({ situacao: 'instalado-sem-alvo', semContato: true })).toBe(
      'na-fila',
    );
  });
});

describe('contaDoAssistente', () => {
  it('conta as classes e agrupa as que vão instalar pela versão de hoje e pela primeira vez', () => {
    const maquinas = [
      ...Array.from({ length: 5 }, () => ({ versao: '7.3.0.25', semContato: false })),
      ...Array.from({ length: 4 }, () => ({ versao: '7.2.0.1830', semContato: false })),
      { versao: '7.2.1', semContato: false },
      { versao: '7.1', semContato: false },
      ...Array.from({ length: 7 }, () => ({ versao: null, semContato: false })),
      { versao: null, semContato: true },
    ].map(({ versao, semContato: sem }) => ({
      situacao:
        versao === null
          ? ('sem-o-programa' as const)
          : versao.startsWith('7.3')
            ? ('na-versao' as const)
            : ('desatualizada' as const),
      versao,
      semContato: sem,
    }));
    const conta = contaDoAssistente(maquinas, '7.3');
    expect(conta).toMatchObject({
      vaoInstalar: 13,
      puladas: 5,
      naFila: 1,
      primeiraVez: 7,
      porVersao: [
        { versao: '7.2', quantas: 5 },
        { versao: '7.1', quantas: 1 },
      ],
    });
    expect(conta.classes).toHaveLength(maquinas.length);
    expect(conta.classes.at(-1)).toBe('na-fila');
  });

  it('a programa sem a versão no inventário vai num grupo sem versão, no fim', () => {
    const conta = contaDoAssistente(
      [
        { situacao: 'desatualizada', versao: null, semContato: false },
        { situacao: 'desatualizada', versao: '130.0.1', semContato: false },
      ],
      '131',
    );
    expect(conta.porVersao).toEqual([
      { versao: '130', quantas: 1 },
      { versao: null, quantas: 1 },
    ]);
    expect(conta.primeiraVez).toBe(0);
  });
});

describe('paraQuem', () => {
  const matriz = { id: 'matriz', nome: 'Matriz' };
  const financeiro = { id: 'financeiro', nome: 'Financeiro' };
  const diretoria = { id: 'diretoria', nome: 'Diretoria' };
  const filial = { id: 'filial', nome: 'Filial' };
  const recepcao = { id: 'recepcao', nome: 'Recepção' };

  it('o nome da máquina, quando é uma só', () => {
    expect(paraQuem([{ nome: 'Computador 1', locais: [matriz, financeiro] }])).toBe('Computador 1');
  });

  it('o local mais fundo que contém todas', () => {
    expect(
      paraQuem([
        { nome: 'Computador 1', locais: [matriz, financeiro] },
        { nome: 'Computador 2', locais: [matriz, financeiro] },
      ]),
    ).toBe('Financeiro');
    expect(
      paraQuem([
        { nome: 'Computador 1', locais: [matriz, financeiro] },
        { nome: 'Computador 2', locais: [matriz, diretoria] },
        { nome: 'Computador 3', locais: [matriz] },
      ]),
    ).toBe('Matriz');
  });

  it('"N locais" quando não há esse local, e "N máquinas" quando elas não têm local', () => {
    expect(
      paraQuem([
        { nome: 'Computador 1', locais: [matriz, financeiro] },
        { nome: 'Computador 2', locais: [matriz, diretoria] },
        { nome: 'Computador 3', locais: [filial, recepcao] },
      ]),
    ).toBe('3 locais');
    expect(
      paraQuem([
        { nome: 'Computador 1', locais: [matriz, financeiro] },
        { nome: 'Computador 2', locais: [] },
      ]),
    ).toBe('2 máquinas');
  });
});
