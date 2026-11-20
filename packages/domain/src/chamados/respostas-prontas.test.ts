import { describe, expect, it } from 'vitest';
import {
  conferirRespostaPronta,
  MAXIMO_DE_RESPOSTAS_PRONTAS,
  MENSAGENS_DA_RESPOSTA_PRONTA,
  type PedidoDaRespostaPronta,
  textoDaRespostaPronta,
} from './respostas-prontas.ts';

const ACESSO = '0193a1b2-0000-7000-8000-000000000001';
const IMPRESSORA = '0193a1b2-0000-7000-8000-000000000002';
const INATIVO = '0193a1b2-0000-7000-8000-000000000003';
const RASCUNHO = '0193a1b2-0000-7000-8000-000000000004';

/** Os Em uso e os Inativos da organização, como a API os lê. */
const contexto = { tiposDaLista: new Set([ACESSO, IMPRESSORA, INATIVO]) };

const PRINT: PedidoDaRespostaPronta = {
  rotulo: 'Pedir o print do erro',
  texto: 'Oi, {nome}! Pode mandar um print do erro?',
  esperaAResposta: true,
  tipos: [],
};

const conferir = (mudanca: Partial<PedidoDaRespostaPronta>) =>
  conferirRespostaPronta({ ...PRINT, ...mudanca }, contexto);

const errosDe = (mudanca: Partial<PedidoDaRespostaPronta>) => {
  const conferida = conferir(mudanca);
  return conferida.ok ? {} : conferida.erros;
};

describe('conferirRespostaPronta', () => {
  it('aceita a resposta, com o rótulo numa linha e o normalizado para o rótulo único', () => {
    expect(
      conferir({
        rotulo: '  Pedir   o   Print  do Érro ',
        texto: '\n Oi, {nome}!\n\nPode mandar?  ',
      }),
    ).toEqual({
      ok: true,
      resposta: {
        rotulo: 'Pedir o Print do Érro',
        rotuloNormalizado: 'pedir o print do erro',
        texto: 'Oi, {nome}!\n\nPode mandar?',
        esperaAResposta: true,
        opcoes: [],
        tipos: [],
      },
    });
  });

  it('guarda as opções sem os espaços das pontas, e as recusa pela pergunta, no campo delas', () => {
    expect(conferir({ opcoes: [' Pode ser ', 'Daqui a meia hora'] })).toMatchObject({
      ok: true,
      resposta: { opcoes: ['Pode ser', 'Daqui a meia hora'] },
    });
    expect(errosDe({ opcoes: ['Sim'] })).toEqual({ opcoes: 'Use de 2 a 3 opções.' });
    expect(errosDe({ opcoes: ['Sim', 'SIM'], rotulo: '' })).toEqual({
      rotulo: 'Escreva o rótulo.',
      opcoes: 'As opções precisam ser diferentes.',
    });
  });

  it('sem tipos, a resposta aparece em todos; os escolhidos ficam sem repetir e em ordem', () => {
    const conferida = conferir({ tipos: [INATIVO, ACESSO.toUpperCase(), INATIVO] });
    expect(conferida).toMatchObject({ ok: true, resposta: { tipos: [ACESSO, INATIVO] } });
  });

  it('recusa o tipo fora da lista, como o Rascunho, com "Escolha os tipos da lista."', () => {
    expect(errosDe({ tipos: [ACESSO, RASCUNHO] })).toEqual({ tipos: 'Escolha os tipos da lista.' });
  });

  it('o rótulo: vazio, só com espaços e com mais de 60 caracteres', () => {
    expect(errosDe({ rotulo: '' })).toEqual({ rotulo: 'Escreva o rótulo.' });
    expect(errosDe({ rotulo: ' \n ' })).toEqual({ rotulo: 'Escreva o rótulo.' });
    expect(errosDe({ rotulo: 'a'.repeat(61) })).toEqual({ rotulo: 'Use até 60 caracteres.' });
  });

  it('conta os caracteres, e não as unidades do UTF-16, nos dois limites', () => {
    // O "📎" ocupa duas unidades do UTF-16 e é um caractere só, como no `length` do banco.
    expect(conferir({ rotulo: '📎'.repeat(60) }).ok).toBe(true);
    expect(conferir({ texto: '📎'.repeat(2000) }).ok).toBe(true);
    expect(errosDe({ texto: `${'a'.repeat(1999)}📎📎` })).toEqual({
      texto: 'Use até 2.000 caracteres.',
    });
  });

  it('o texto: vazio, só com espaços e quebras e com mais de 2.000 caracteres', () => {
    expect(errosDe({ texto: '' })).toEqual({ texto: 'Escreva o texto.' });
    expect(errosDe({ texto: ' \n\n ' })).toEqual({ texto: 'Escreva o texto.' });
    expect(errosDe({ texto: 'a'.repeat(2001) })).toEqual({ texto: 'Use até 2.000 caracteres.' });
  });

  it('dá todas as recusas de uma vez, por campo', () => {
    expect(errosDe({ rotulo: '', texto: '', tipos: [RASCUNHO] })).toEqual({
      rotulo: 'Escreva o rótulo.',
      texto: 'Escreva o texto.',
      tipos: 'Escolha os tipos da lista.',
    });
  });

  it('as frases e o limite da spec', () => {
    expect(MAXIMO_DE_RESPOSTAS_PRONTAS).toBe(100);
    expect(MENSAGENS_DA_RESPOSTA_PRONTA).toMatchObject({
      rotuloRepetido: 'Já existe uma resposta pronta com esse rótulo.',
      limite: 'A organização já tem 100 respostas prontas.',
      naoEncontrada: 'Resposta pronta não encontrada.',
    });
  });
});

describe('textoDaRespostaPronta', () => {
  it('o {nome} vira o primeiro nome da pessoa, em cada vez que aparece', () => {
    expect(textoDaRespostaPronta('Oi, {nome}! Pode mandar um print do erro?', 'Marina Rocha')).toBe(
      'Oi, Marina! Pode mandar um print do erro?',
    );
    expect(
      textoDaRespostaPronta('{nome}, o toner foi trocado. {nome}, confira.', ' Rita  Moraes '),
    ).toBe('Rita, o toner foi trocado. Rita, confira.');
  });

  it('a pessoa anonimizada fica com o nome inteiro, que tem o código', () => {
    expect(textoDaRespostaPronta('Oi, {nome}!', 'Pessoa anonimizada 7KQ2')).toBe(
      'Oi, Pessoa anonimizada 7KQ2!',
    );
  });

  it('só o {nome} exato muda, e o nome entra como foi escrito', () => {
    expect(textoDaRespostaPronta('Oi! {Nome}, { nome } e {nomes}.', 'Marina Rocha')).toBe(
      'Oi! {Nome}, { nome } e {nomes}.',
    );
    // O nome não é um padrão da troca: o "$&" fica como está.
    expect(textoDaRespostaPronta('Oi, {nome}!', 'Jo$&o Silva')).toBe('Oi, Jo$&o!');
  });
});
