import { describe, expect, it } from 'vitest';
import { type CorDoTonerPedida, corDoToner } from './cor-do-toner.ts';
import type { CampoDoFormulario } from './formulario.ts';

/** Um campo do formulário, com o resto como no de fábrica. */
const campo = (
  id: string,
  tipo: CampoDoFormulario['tipo'],
  opcoes: { id: string; texto: string }[] = [],
): CampoDoFormulario => ({
  id,
  tipo,
  rotulo: id,
  nomeNoResumo: null,
  obrigatorio: false,
  soDaTi: false,
  apagarSeSumir: false,
  opcoes,
  tiposDeAtivo: [],
  condicao: [],
});

/** O "Qual cor acabou?" do Toner de fábrica. */
const QUAL_COR = campo('cor', 'escolha-unica', [
  { id: 'preto', texto: 'Preto' },
  { id: 'ciano', texto: 'Ciano' },
  { id: 'magenta', texto: 'Magenta' },
  { id: 'amarelo', texto: 'Amarelo' },
]);

const QUATRO_CORES = ['preto', 'ciano', 'magenta', 'amarelo'] as const;

/** A PAT-00139, de quatro cores, com o preto a 8% e o ciano a 40%, sem resposta. */
const PAT_00139: CorDoTonerPedida = {
  campos: [campo('impressora', 'ativo'), QUAL_COR],
  respostas: {},
  cores: QUATRO_CORES,
  leituras: [
    { tinta: 'preto', percentual: 8 },
    { tinta: 'ciano', percentual: 40 },
  ],
};

describe('corDoToner', () => {
  it('Toner com a cor respondida: o Ciano respondido vale, e não o preto, que está mais baixo', () => {
    expect(corDoToner({ ...PAT_00139, respostas: { cor: 'ciano' } })).toBe('ciano');
  });

  it('Toner pelo chamado sem pendente: sem a resposta, vale a cor mais baixa da leitura', () => {
    expect(corDoToner(PAT_00139)).toBe('preto');
    const cianoBaixo: CorDoTonerPedida = {
      ...PAT_00139,
      leituras: [
        { tinta: 'preto', percentual: 30 },
        { tinta: 'ciano', percentual: 5 },
      ],
    };
    expect(corDoToner(cianoBaixo)).toBe('ciano');
  });

  it('o texto da opção vale, sem maiúsculas nem acentos, também com os ids aleatórios da TI', () => {
    const daTi = campo('x7Kq', 'escolha-unica', [
      { id: 'a1', texto: 'Sem toner' },
      { id: 'b2', texto: '  MAGENTA ' },
      { id: 'c3', texto: 'Amárelo' },
    ]);
    const pedida = { ...PAT_00139, campos: [daTi] };
    expect(corDoToner({ ...pedida, respostas: { x7Kq: 'b2' } })).toBe('magenta');
    expect(corDoToner({ ...pedida, respostas: { x7Kq: 'c3' } })).toBe('amarelo');
    // A opção que não é uma cor não decide: vale a leitura.
    expect(corDoToner({ ...pedida, respostas: { x7Kq: 'a1' } })).toBe('preto');
  });

  it('vale a primeira escolha única, na ordem dos campos, com a cor que a impressora usa', () => {
    const papel = campo('papel', 'escolha-unica', [{ id: 'amarelo', texto: 'Amarelo' }]);
    const pedida: CorDoTonerPedida = {
      ...PAT_00139,
      campos: [papel, QUAL_COR],
      respostas: { papel: 'amarelo', cor: 'ciano' },
    };
    expect(corDoToner(pedida)).toBe('amarelo');
    // Na impressora preto e branco, o Amarelo do primeiro campo é pulado, e vale o segundo.
    const mono = {
      ...pedida,
      cores: ['preto'] as const,
      respostas: { papel: 'amarelo', cor: 'preto' },
    };
    expect(corDoToner(mono)).toBe('preto');
  });

  it('a cor respondida que a impressora não usa é pulada, e vale a leitura', () => {
    const mono: CorDoTonerPedida = {
      ...PAT_00139,
      cores: ['preto'],
      respostas: { cor: 'ciano' },
      leituras: [{ tinta: 'preto', percentual: 30 }],
    };
    expect(corDoToner(mono)).toBe('preto');
  });

  it('só a escolha única decide: as várias opções, o texto e a opção que não existe ficam de fora', () => {
    const varias = campo('cores', 'varias-opcoes', [{ id: 'ciano', texto: 'Ciano' }]);
    const texto = campo('obs', 'texto-curto');
    const pedida: CorDoTonerPedida = {
      ...PAT_00139,
      campos: [varias, texto, QUAL_COR],
      // A resposta das Várias opções lida como uma opção só também fica de fora.
      respostas: { cores: 'ciano', obs: 'Magenta', cor: 'sumiu' },
    };
    expect(corDoToner(pedida)).toBe('preto');
    expect(corDoToner({ ...pedida, respostas: { cor: 42 } })).toBe('preto');
  });

  it('Toner pelo chamado na impressora que só usa o colorido: o ciano da leitura vira o colorido', () => {
    const colorida: CorDoTonerPedida = {
      ...PAT_00139,
      cores: ['preto', 'colorido'],
      leituras: [
        { tinta: 'ciano', percentual: 5 },
        { tinta: 'preto', percentual: 30 },
      ],
    };
    expect(corDoToner(colorida)).toBe('colorido');
    // O Ciano respondido não é uma cor que ela usa; o Colorido respondido é.
    expect(corDoToner({ ...colorida, respostas: { cor: 'ciano' } })).toBe('colorido');
    const comColorido = campo('cor', 'escolha-unica', [{ id: 'c', texto: 'Colorido' }]);
    expect(
      corDoToner({ ...colorida, campos: [comColorido], respostas: { cor: 'c' }, leituras: [] }),
    ).toBe('colorido');
  });

  it('a tinta que a impressora não usa, sem o colorido, fica de fora da leitura', () => {
    const mono: CorDoTonerPedida = {
      ...PAT_00139,
      cores: ['preto'],
      leituras: [
        { tinta: 'ciano', percentual: 2 },
        { tinta: 'preto', percentual: 50 },
      ],
    };
    expect(corDoToner(mono)).toBe('preto');
    expect(corDoToner({ ...mono, cores: ['ciano', 'magenta'], leituras: mono.leituras })).toBe(
      'ciano',
    );
  });

  it('sem nenhum compatível cadastrado, a impressora é tratada como se usasse todas as cores', () => {
    const semCadastro: CorDoTonerPedida = {
      ...PAT_00139,
      cores: [],
      leituras: [
        { tinta: 'amarelo', percentual: 3 },
        { tinta: 'preto', percentual: 10 },
      ],
    };
    expect(corDoToner({ ...semCadastro, respostas: { cor: 'magenta' } })).toBe('magenta');
    expect(corDoToner(semCadastro)).toBe('amarelo');
  });

  it('o suprimento sem tinta, como o cilindro, fica de fora da leitura', () => {
    const comCilindro: CorDoTonerPedida = {
      ...PAT_00139,
      leituras: [
        { tinta: null, percentual: 1 },
        { tinta: 'magenta', percentual: 15 },
        { tinta: 'preto', percentual: 20 },
      ],
    };
    expect(corDoToner(comCilindro)).toBe('magenta');
  });

  it('no empate, vale a ordem das cores, com o preto primeiro', () => {
    const empate = (leituras: CorDoTonerPedida['leituras']) =>
      corDoToner({ ...PAT_00139, leituras });
    expect(
      empate([
        { tinta: 'ciano', percentual: 10 },
        { tinta: 'preto', percentual: 10 },
      ]),
    ).toBe('preto');
    expect(
      empate([
        { tinta: 'amarelo', percentual: 10 },
        { tinta: 'ciano', percentual: 10 },
      ]),
    ).toBe('ciano');
  });

  it('sem a resposta e sem a leitura, o preto', () => {
    expect(corDoToner({ ...PAT_00139, leituras: [] })).toBe('preto');
    expect(corDoToner({ ...PAT_00139, cores: ['colorido'], leituras: [] })).toBe('preto');
  });
});
