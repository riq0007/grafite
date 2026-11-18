// A regra do campo de escrever (spec modulo-chamados, "Campo de escrever" e "Chamado aberto"; change
// chamados-da-ti, design, "O campo de escrever (tarefa 5.12)"): quem o vê, a rota e o rótulo de cada
// envio, e a resposta pronta que entra onde está o cursor.
import { describe, expect, it } from 'vitest';
import { envioDoCampo, formaDoCampo, inserirNoTexto } from './escrever.ts';

describe('formaDoCampo: quem vê o campo de escrever', () => {
  it('quem atende os locais escreve no chamado aberto, em qualquer situação fora a resolvida', () => {
    for (const situacao of ['triagem', 'em-atendimento', 'aguardando'] as const) {
      expect(formaDoCampo({ situacao, permite: { atender: true } }), situacao).toBe('escrever');
    }
  });

  it('no resolvido, quem atende vê o "Reabra o chamado para escrever."', () => {
    expect(formaDoCampo({ situacao: 'resolvido', permite: { atender: true } })).toBe('reabrir');
  });

  it('quem só vê os chamados fica sem o campo, também no resolvido', () => {
    for (const situacao of ['triagem', 'em-atendimento', 'aguardando', 'resolvido'] as const) {
      expect(formaDoCampo({ situacao, permite: { atender: false } }), situacao).toBeNull();
    }
  });
});

describe('envioDoCampo: a rota e o rótulo pela chave e pelo "Esperar a resposta"', () => {
  it('a mensagem vai pelo /mensagem, com "Enviar"', () => {
    expect(envioDoCampo('mensagem', false)).toEqual({
      rota: '/chamados/{numero}/mensagem',
      rotulo: 'Enviar',
      carregando: 'Enviando',
      noErro: 'enviar a mensagem',
    });
  });

  it('com "Esperar a resposta", vai pelo /esperar, com "Enviar e esperar a resposta"', () => {
    expect(envioDoCampo('mensagem', true)).toEqual({
      rota: '/chamados/{numero}/esperar',
      rotulo: 'Enviar e esperar a resposta',
      carregando: 'Enviando',
      noErro: 'enviar a mensagem',
    });
  });

  it('a nota vai pelo /nota, com "Salvar a nota", e ignora o "Esperar a resposta"', () => {
    const nota = {
      rota: '/chamados/{numero}/nota',
      rotulo: 'Salvar a nota',
      carregando: 'Salvando a nota',
      noErro: 'salvar a nota',
    };
    expect(envioDoCampo('nota', false)).toEqual(nota);
    expect(envioDoCampo('nota', true)).toEqual(nota);
  });
});

describe('inserirNoTexto: a resposta pronta entra onde está o cursor', () => {
  it('no campo vazio, o texto é a resposta, com o cursor no fim', () => {
    expect(inserirNoTexto('', 0, 0, 'Pode mandar o print?')).toEqual({
      texto: 'Pode mandar o print?',
      cursor: 20,
    });
  });

  it('entre espaços, entra no cursor, e o cursor fica depois dela', () => {
    expect(inserirNoTexto('Bom dia! \nAbraço.', 9, 9, 'Pode mandar o print?')).toEqual({
      texto: 'Bom dia! Pode mandar o print?\nAbraço.',
      cursor: 29,
    });
  });

  it('com uma seleção, troca o selecionado', () => {
    expect(inserirNoTexto('Bom dia! XXX\nAbraço.', 9, 12, 'Pode mandar o print?')).toEqual({
      texto: 'Bom dia! Pode mandar o print?\nAbraço.',
      cursor: 29,
    });
  });

  it('o cursor fora do texto vai para o fim, e o início depois do fim é o fim', () => {
    expect(inserirNoTexto('Oi. ', 99, 99, 'Tudo bem?')).toEqual({
      texto: 'Oi. Tudo bem?',
      cursor: 13,
    });
    expect(inserirNoTexto('ab  c', 3, 1, 'X')).toEqual({ texto: 'ab X c', cursor: 4 });
  });

  it('colada no texto de antes, entra na linha de baixo', () => {
    expect(inserirNoTexto('Abraço.', 7, 7, 'Fernanda, liberei o acesso.')).toEqual({
      texto: 'Abraço.\nFernanda, liberei o acesso.',
      cursor: 35,
    });
  });

  it('duas seguidas ficam cada uma na sua linha', () => {
    const primeira = inserirNoTexto('', 0, 0, 'Pode mandar o print?');
    expect(
      inserirNoTexto(primeira.texto, primeira.cursor, primeira.cursor, 'Qual é o caminho?'),
    ).toEqual({ texto: 'Pode mandar o print?\nQual é o caminho?', cursor: 38 });
  });

  it('colada no texto de depois, o texto segue na linha de baixo, com o cursor no fim dela', () => {
    expect(inserirNoTexto('Abraço.', 0, 0, 'Pode mandar o print?')).toEqual({
      texto: 'Pode mandar o print?\nAbraço.',
      cursor: 20,
    });
    // No meio de uma palavra, as duas pontas.
    expect(inserirNoTexto('Obrigada', 4, 4, 'Tudo bem?')).toEqual({
      texto: 'Obri\nTudo bem?\ngada',
      cursor: 14,
    });
  });
});
