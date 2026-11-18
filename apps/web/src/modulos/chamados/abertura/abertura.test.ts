// O que a gaveta da abertura decide sem a tela (spec modulo-chamados, "Abrir um chamado"; spec
// chamados, "Abrir um chamado pela TI"; change chamados-da-ti, design, "A gaveta da abertura
// (tarefa 5.18)"): o pedido, o título montado que se troca, as recusas na chave da tela, o
// endereço que abre a gaveta e o retorno.
import { RECUSA_DO_FORMULARIO, TIPOS_DE_CHAMADO_DE_FABRICA } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import { ESTADO_VAZIO, type EstadoDoFormulario } from '../formulario/estado.ts';
import {
  ABERTURA_VAZIA,
  errosDaAbertura,
  errosQueValem,
  pedidoDaAbertura,
  retornoDaAbertura,
  tituloNaGaveta,
  validarAbertura,
} from './abertura.ts';

function tipoDe(nome: string) {
  const tipo = TIPOS_DE_CHAMADO_DE_FABRICA.find((deFabrica) => deFabrica.nome === nome);
  if (!tipo) throw new Error(`Sem o tipo de fábrica ${nome}.`);
  return { nome: tipo.nome, formulario: tipo.formulario };
}

const comRespostas = (respostas: EstadoDoFormulario['respostas']): EstadoDoFormulario => ({
  ...ESTADO_VAZIO,
  respostas,
});

describe('o pedido da abertura', () => {
  it('a gaveta começa sem pessoa, sem tipo, com o título montado e o "Fica comigo" ligado', () => {
    expect(pedidoDaAbertura(ABERTURA_VAZIA)).toEqual({
      pessoa: null,
      tipo: null,
      titulo: null,
      respostas: {},
      ficaComigo: true,
    });
  });

  it('o título que quem abre não tocou vai nulo, para a API montar o mesmo com os nomes de agora', () => {
    const pedido = pedidoDaAbertura({
      ...ABERTURA_VAZIA,
      pessoa: 'p-marina',
      tipo: 't-outro',
      estado: comRespostas({ relato: 'Monitor piscando' }),
      ficaComigo: false,
    });
    expect(pedido).toEqual({
      pessoa: 'p-marina',
      tipo: 't-outro',
      titulo: null,
      respostas: { relato: 'Monitor piscando' },
      ficaComigo: false,
    });
  });

  it('o título escrito vai como está, também vazio, para a API recusar no campo', () => {
    const escrito = { ...ABERTURA_VAZIA, tituloEscrito: 'Notebook da recepção não liga' };
    expect(pedidoDaAbertura(escrito).titulo).toBe('Notebook da recepção não liga');
    expect(pedidoDaAbertura({ ...ABERTURA_VAZIA, tituloEscrito: '' }).titulo).toBe('');
  });
});

describe('o título na gaveta', () => {
  it('acompanha as respostas: o campo do título, o primeiro texto ou o nome do tipo', () => {
    const impressora = tipoDe('Impressora');
    expect(tituloNaGaveta(impressora, ABERTURA_VAZIA)).toEqual({
      valor: 'Impressora',
      montado: 'Impressora',
      trocado: false,
    });
    const manchando = { ...ABERTURA_VAZIA, estado: comRespostas({ problema: 'manchando' }) };
    expect(tituloNaGaveta(impressora, manchando).valor).toBe('Impressora manchando');

    const outro = { ...ABERTURA_VAZIA, estado: comRespostas({ relato: 'Monitor piscando' }) };
    expect(tituloNaGaveta(tipoDe('Outro'), outro).valor).toBe('Monitor piscando');
  });

  it('o escrito fica no lugar do montado, e "trocado" diz se há o montado para voltar', () => {
    const computador = tipoDe('Computador');
    const naoLiga = comRespostas({ problema: 'nao-liga' });
    const escrito = {
      ...ABERTURA_VAZIA,
      estado: naoLiga,
      tituloEscrito: 'Notebook da recepção não liga',
    };
    expect(tituloNaGaveta(computador, escrito)).toEqual({
      valor: 'Notebook da recepção não liga',
      montado: 'Computador não liga',
      trocado: true,
    });
    // Escrito igual ao montado: nada para voltar, e o escrito segue valendo.
    const igual = { ...escrito, tituloEscrito: 'Computador não liga' };
    expect(tituloNaGaveta(computador, igual)).toMatchObject({
      valor: 'Computador não liga',
      trocado: false,
    });
    const lento = { ...igual, estado: comRespostas({ problema: 'lento' }) };
    expect(tituloNaGaveta(computador, lento)).toEqual({
      valor: 'Computador não liga',
      montado: 'Computador está lento',
      trocado: true,
    });
  });
});

describe('as recusas da abertura', () => {
  it('a pessoa, o tipo, o título e os campos ficam nas chaves deles', () => {
    const campos = {
      pessoa: 'Escolha quem pediu.',
      tipo: 'Escolha o tipo.',
      titulo: 'Use até 120 caracteres.',
      'campos.relato': 'Responda esta pergunta.',
    };
    expect(errosDaAbertura(campos)).toEqual(campos);
  });

  it('as respostas e o formulário, também as chaves de dentro, são a recusa geral do formulário', () => {
    expect(errosDaAbertura({ respostas: RECUSA_DO_FORMULARIO })).toEqual({
      formulario: RECUSA_DO_FORMULARIO,
    });
    expect(
      errosDaAbertura({ formulario: RECUSA_DO_FORMULARIO, 'respostas.relato': 'Outra' }),
    ).toEqual({ formulario: RECUSA_DO_FORMULARIO });
    // A chave que a gaveta não mostra também vai ao alto, para a recusa não sumir.
    expect(errosDaAbertura({ ficaComigo: 'Valor inválido.' })).toEqual({
      formulario: 'Valor inválido.',
    });
  });

  it('a chave de dentro de um campo fica no campo', () => {
    expect(errosDaAbertura({ 'campos.foto.0': 'O anexo não foi encontrado.' })).toEqual({
      'campos.foto': 'O anexo não foi encontrado.',
    });
  });
});

describe('as recusas que valem', () => {
  const recusas = {
    pessoa: 'Escolha quem pediu.',
    titulo: 'Escreva o título.',
    'campos.relato': 'Responda esta pergunta.',
    formulario: RECUSA_DO_FORMULARIO,
  };
  const naRecusa = {
    ...ABERTURA_VAZIA,
    tipo: 't-outro',
    estado: comRespostas({}),
    tituloEscrito: '',
  };

  it('cada recusa vale enquanto o que ela recusou não muda', () => {
    expect(errosQueValem(recusas, naRecusa, naRecusa)).toEqual(recusas);
    const { pessoa: _p, ...semAPessoa } = recusas;
    expect(errosQueValem(recusas, naRecusa, { ...naRecusa, pessoa: 'p-marina' })).toEqual(
      semAPessoa,
    );
    const { titulo: _t, ...semOTitulo } = recusas;
    expect(errosQueValem(recusas, naRecusa, { ...naRecusa, tituloEscrito: 'Monitor' })).toEqual(
      semOTitulo,
    );
    expect(errosQueValem(recusas, naRecusa, { ...naRecusa, tituloEscrito: null })).toEqual(
      semOTitulo,
    );
    const { 'campos.relato': _r, ...semORelato } = recusas;
    const respondido = { ...naRecusa, estado: comRespostas({ relato: 'Monitor piscando' }) };
    expect(errosQueValem(recusas, naRecusa, respondido)).toEqual(semORelato);
  });

  it('com outro tipo, saem as recusas do tipo, dos campos e do formulário', () => {
    const doTipo = { ...recusas, tipo: 'O tipo escolhido não está em uso.' };
    const outroTipo = { ...naRecusa, tipo: 't-telefone' };
    expect(errosQueValem(doTipo, naRecusa, outroTipo)).toEqual({
      pessoa: 'Escolha quem pediu.',
      titulo: 'Escreva o título.',
    });
  });
});

describe('o endereço da gaveta', () => {
  it('o "abrir" do endereço abre a gaveta; qualquer outro valor não', () => {
    expect(validarAbertura({ abrir: 1 })).toEqual({ abrir: 1 });
    expect(validarAbertura({ abrir: '1' })).toEqual({ abrir: 1 });
    expect(validarAbertura({ abrir: true })).toEqual({ abrir: 1 });
    for (const abrir of [undefined, 0, '', 'sim', null]) {
      expect(validarAbertura({ abrir }), String(abrir)).toEqual({});
    }
  });
});

it('o retorno da abertura diz o número do chamado', () => {
  expect(retornoDaAbertura(1043)).toBe('Chamado #1043 aberto.');
});
