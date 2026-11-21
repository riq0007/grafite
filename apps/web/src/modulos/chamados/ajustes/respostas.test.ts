// O que a tela das respostas prontas decide sem a API (change chamados-da-ti, design, "As respostas
// prontas (tarefa 5.25)"): a linha da tabela, a contagem e o limite, a gaveta da resposta, o que
// mudou nela, os tipos que ela oferece e as recusas que valem.
import { describe, expect, it } from 'vitest';
import {
  contagemDasRespostas,
  edicaoDaResposta,
  errosDaResposta,
  limiteDasRespostas,
  mudouAResposta,
  opcoesNaLista,
  RESPOSTA_NOVA,
  type RespostaPronta,
  recusasQueValem,
  textoNumaLinha,
  tiposNaLista,
  tiposParaEscolher,
} from './respostas.ts';

const ACESSO = { id: '0190a000-0000-7000-8000-0000000000a1', nome: 'Acesso e senha' };
const IMPRESSORA = { id: '0190a000-0000-7000-8000-0000000000a2', nome: 'Impressora' };
const REDE = { id: '0190a000-0000-7000-8000-0000000000a3', nome: 'Rede e internet' };
const TONER = { id: '0190a000-0000-7000-8000-0000000000a4', nome: 'Toner' };

function resposta(mudar: Partial<RespostaPronta> = {}): RespostaPronta {
  return {
    id: '0190a000-0000-7000-8000-0000000000f1',
    rotulo: 'Pedir o print do erro',
    texto: 'Oi, {nome}! Pode mandar um print da tela com o erro?',
    esperaAResposta: true,
    opcoes: [],
    tipos: [ACESSO, IMPRESSORA],
    ...mudar,
  };
}

describe('textoNumaLinha', () => {
  it('junta as quebras e os espaços repetidos, para o começo do texto caber numa linha', () => {
    expect(textoNumaLinha('Oi, {nome}!\n\nPode mandar  o print?\n')).toBe(
      'Oi, {nome}! Pode mandar o print?',
    );
  });
});

describe('tiposNaLista', () => {
  it('sem tipos, a resposta aparece em todos', () => {
    expect(tiposNaLista([])).toBe('Todos os tipos');
  });

  it('com um ou dois tipos, os nomes, separados por vírgula, porque os nomes têm o "e"', () => {
    expect(tiposNaLista([ACESSO])).toBe('Acesso e senha');
    expect(tiposNaLista([ACESSO, REDE])).toBe('Acesso e senha, Rede e internet');
  });

  it('com mais de dois, os dois primeiros e quantos faltam', () => {
    expect(tiposNaLista([ACESSO, IMPRESSORA, REDE])).toBe('Acesso e senha, Impressora e mais 1');
    expect(tiposNaLista([ACESSO, IMPRESSORA, REDE, TONER])).toBe(
      'Acesso e senha, Impressora e mais 2',
    );
  });
});

describe('contagemDasRespostas', () => {
  it('no singular e no plural', () => {
    expect(contagemDasRespostas(1)).toBe('1 resposta');
    expect(contagemDasRespostas(6)).toBe('6 respostas');
  });
});

describe('limiteDasRespostas', () => {
  it('com 100 respostas, a recusa da spec, antes de a resposta nova ser escrita', () => {
    expect(limiteDasRespostas(99)).toBeNull();
    expect(limiteDasRespostas(100)).toBe('A organização já tem 100 respostas prontas.');
  });
});

describe('edicaoDaResposta', () => {
  it('a nova começa vazia, sem esperar a resposta, sem pergunta e em todos os tipos', () => {
    expect(edicaoDaResposta(null)).toEqual({
      rotulo: '',
      texto: '',
      esperaAResposta: false,
      opcoes: [],
      tipos: [],
    });
    expect(edicaoDaResposta(null)).toEqual(RESPOSTA_NOVA);
  });

  it('a gravada, com as opções e os tipos pelo id, como a gravação os pede', () => {
    expect(edicaoDaResposta(resposta({ opcoes: ['Sim', 'Não'] }))).toEqual({
      rotulo: 'Pedir o print do erro',
      texto: 'Oi, {nome}! Pode mandar um print da tela com o erro?',
      esperaAResposta: true,
      opcoes: ['Sim', 'Não'],
      tipos: [ACESSO.id, IMPRESSORA.id],
    });
  });
});

describe('mudouAResposta', () => {
  it('sem nada escrito, nada mudou, na nova e na gravada', () => {
    expect(mudouAResposta(edicaoDaResposta(null), null)).toBe(false);
    expect(mudouAResposta(edicaoDaResposta(resposta()), resposta())).toBe(false);
  });

  it('o rótulo, o texto, a espera, as opções ou os tipos mudados mudam a resposta', () => {
    const gravada = resposta({ opcoes: ['Sim', 'Não'] });
    const edicao = edicaoDaResposta(gravada);
    expect(mudouAResposta({ ...edicao, rotulo: 'Pedir o print' }, gravada)).toBe(true);
    expect(mudouAResposta({ ...edicao, texto: 'Pode mandar o print?' }, gravada)).toBe(true);
    expect(mudouAResposta({ ...edicao, esperaAResposta: false }, gravada)).toBe(true);
    expect(mudouAResposta({ ...edicao, opcoes: ['Não', 'Sim'] }, gravada)).toBe(true);
    expect(mudouAResposta({ ...edicao, opcoes: ['Sim', 'Não', 'Talvez'] }, gravada)).toBe(true);
    expect(mudouAResposta({ ...edicao, tipos: [ACESSO.id] }, gravada)).toBe(true);
    expect(mudouAResposta({ ...RESPOSTA_NOVA, rotulo: 'P' }, null)).toBe(true);
  });

  it('os mesmos tipos, marcados em outra ordem, não mudam a resposta', () => {
    const gravada = resposta();
    const edicao = { ...edicaoDaResposta(gravada), tipos: [IMPRESSORA.id, ACESSO.id] };
    expect(mudouAResposta(edicao, gravada)).toBe(false);
  });
});

describe('tiposParaEscolher', () => {
  it('os Em uso e os Inativos, na ordem dos tipos, sem os Rascunhos, com o inativo marcado', () => {
    const tipos = [
      { ...ACESSO, situacao: 'em-uso' as const },
      {
        id: '0190a000-0000-7000-8000-0000000000a5',
        nome: 'Novo tipo',
        situacao: 'rascunho' as const,
      },
      { ...TONER, situacao: 'inativo' as const },
      { ...IMPRESSORA, situacao: 'em-uso' as const },
    ];
    expect(tiposParaEscolher(tipos)).toEqual([
      { id: ACESSO.id, nome: 'Acesso e senha', inativo: false },
      { id: TONER.id, nome: 'Toner', inativo: true },
      { id: IMPRESSORA.id, nome: 'Impressora', inativo: false },
    ]);
  });
});

describe('errosDaResposta', () => {
  it('as recusas da API nos campos da gaveta; uma chave que a gaveta não tem fica de fora', () => {
    expect(
      errosDaResposta({
        rotulo: 'Já existe uma resposta pronta com esse rótulo.',
        tipos: 'Escolha os tipos da lista.',
        opcoes: 'As opções precisam ser diferentes.',
        ids: 'A ordem precisa ter todas as respostas prontas, uma vez cada.',
      }),
    ).toEqual({
      rotulo: 'Já existe uma resposta pronta com esse rótulo.',
      tipos: 'Escolha os tipos da lista.',
      opcoes: 'As opções precisam ser diferentes.',
    });
  });
});

describe('recusasQueValem', () => {
  const naRecusa = { ...RESPOSTA_NOVA, rotulo: 'Pedir o print' };
  const erros = {
    rotulo: 'Já existe uma resposta pronta com esse rótulo.',
    texto: 'Escreva o texto.',
  };

  it('cada recusa vale enquanto o campo dela não muda', () => {
    expect(recusasQueValem(erros, naRecusa, naRecusa)).toEqual(erros);
    expect(recusasQueValem(erros, naRecusa, { ...naRecusa, texto: 'Oi' })).toEqual({
      rotulo: erros.rotulo,
    });
    expect(
      recusasQueValem(erros, naRecusa, { ...naRecusa, rotulo: 'Pedir o print do erro' }),
    ).toEqual({ texto: erros.texto });
    expect(recusasQueValem(erros, naRecusa, { ...naRecusa, esperaAResposta: true })).toEqual(erros);
  });

  it('a dos tipos vale enquanto os mesmos estão marcados, em qualquer ordem', () => {
    const comTipos = { ...RESPOSTA_NOVA, tipos: [ACESSO.id, IMPRESSORA.id] };
    const dosTipos = { tipos: 'Escolha os tipos da lista.' };
    expect(
      recusasQueValem(dosTipos, comTipos, { ...comTipos, tipos: [IMPRESSORA.id, ACESSO.id] }),
    ).toEqual(dosTipos);
    expect(recusasQueValem(dosTipos, comTipos, { ...comTipos, tipos: [ACESSO.id] })).toEqual({});
  });
});

describe('recusasQueValem: as opções', () => {
  it('a recusa das opções vale enquanto elas não mudam', () => {
    const comOpcoes = { ...RESPOSTA_NOVA, opcoes: ['Sim', 'Sim'] };
    const dasOpcoes = { opcoes: 'As opções precisam ser diferentes.' };
    expect(recusasQueValem(dasOpcoes, comOpcoes, { ...comOpcoes })).toEqual(dasOpcoes);
    expect(recusasQueValem(dasOpcoes, comOpcoes, { ...comOpcoes, opcoes: ['Sim', 'Não'] })).toEqual(
      {},
    );
    expect(recusasQueValem(dasOpcoes, comOpcoes, { ...comOpcoes, opcoes: ['Sim'] })).toEqual({});
  });
});

describe('opcoesNaLista', () => {
  it('as opções contadas na linha da resposta, e nada na resposta sem pergunta', () => {
    expect(opcoesNaLista([])).toBeNull();
    expect(opcoesNaLista(['Sim', 'Não'])).toBe('2 opções');
    expect(opcoesNaLista(['Pode ser', 'Daqui a meia hora, por favor', 'Estou em reunião'])).toBe(
      '3 opções',
    );
  });
});
