import { describe, expect, it } from 'vitest';
import {
  type ChamadoParaAcao,
  type ContaQueRecebe,
  decidirAcao,
  decidirDesfazer,
  mensagemDaRecusaDaAcao,
  type QuemAge,
  type RecusaDaAcao,
} from './acoes.ts';

const JUNDIAI = { id: 'local-jundiai', nome: 'Jundiaí' };
const SALA_ATLANTICO = { id: 'local-sala-atlantico', nome: 'Sala Atlântico' };
const CAMPINAS = { id: 'local-campinas', nome: 'Campinas' };

/** O alcance de `chamados.atender` em Jundiaí: o ramo inteiro, com a Sala Atlântico. */
const RAMO_DE_JUNDIAI = new Set([JUNDIAI.id, SALA_ATLANTICO.id]);
const RAMO_DE_CAMPINAS = new Set([CAMPINAS.id]);

/** Ana atende a organização inteira; é quem age nos testes. */
const ANA: QuemAge = { id: 'conta-ana', alcance: 'organizacao' };

const DIEGO: ContaQueRecebe = {
  id: 'conta-diego',
  nome: 'Diego Ramos',
  ativa: true,
  alcance: RAMO_DE_JUNDIAI,
};
const RENATO: ContaQueRecebe = {
  id: 'conta-renato',
  nome: 'Renato Alves',
  ativa: true,
  alcance: RAMO_DE_JUNDIAI,
};
const BRUNO: ContaQueRecebe = {
  id: 'conta-bruno',
  nome: 'Bruno Costa',
  ativa: true,
  alcance: RAMO_DE_CAMPINAS,
};

/** O #1042, de Marina Lopes, em Jundiaí, na triagem. */
const NA_TRIAGEM: ChamadoParaAcao = {
  numero: 1042,
  situacao: 'triagem',
  responsavel: null,
  pessoa: 'Marina Lopes',
  locais: [JUNDIAI],
  semLocal: false,
  versao: 1,
};
/** O #1033, estourado, em atendimento com Renato. */
const COM_RENATO: ChamadoParaAcao = {
  ...NA_TRIAGEM,
  numero: 1033,
  situacao: 'em-atendimento',
  responsavel: RENATO.id,
  pessoa: 'Sérgio Lima',
  versao: 4,
};
/** O #1041, aguardando Fernanda desde 09:21, com Diego. */
const AGUARDANDO: ChamadoParaAcao = {
  ...NA_TRIAGEM,
  numero: 1041,
  situacao: 'aguardando',
  responsavel: DIEGO.id,
  pessoa: 'Fernanda Rocha',
  versao: 3,
};
/** O #1035, resolvido por Ana. */
const RESOLVIDO: ChamadoParaAcao = {
  ...NA_TRIAGEM,
  numero: 1035,
  situacao: 'resolvido',
  responsavel: ANA.id,
  versao: 6,
};
/** O #1038, o Wi-Fi da Sala Atlântico, com Diego: o local de Jundiaí da pessoa e o do ativo. */
const WIFI: ChamadoParaAcao = {
  ...NA_TRIAGEM,
  numero: 1038,
  situacao: 'em-atendimento',
  responsavel: DIEGO.id,
  pessoa: 'Paulo Nunes',
  locais: [JUNDIAI, SALA_ATLANTICO],
  versao: 2,
};

const recusa = (motivo: RecusaDaAcao) => ({ aceita: false, recusa: motivo });

describe('assumir', () => {
  it('na triagem, passa a Em atendimento com quem assumiu, e o relógio segue contando', () => {
    expect(decidirAcao(NA_TRIAGEM, ANA, { acao: 'assumir' })).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: ANA.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'assumiu', dados: { de: null } }],
    });
  });

  it('em atendimento com outra conta, mesmo a que não atende mais, passa a quem assumiu', () => {
    expect(decidirAcao(COM_RENATO, ANA, { acao: 'assumir' })).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: ANA.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'assumiu', dados: { de: RENATO.id } }],
    });
  });

  it('aguardando, segue aguardando com quem assumiu, e o relógio segue parado', () => {
    expect(decidirAcao(AGUARDANDO, ANA, { acao: 'assumir' })).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: ANA.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'assumiu', dados: { de: DIEGO.id } }],
    });
  });

  it('resolvido, é recusado', () => {
    expect(decidirAcao(RESOLVIDO, ANA, { acao: 'assumir' })).toEqual(
      recusa({ motivo: 'resolvido' }),
    );
  });

  it('o chamado que já está com quem assume é recusado', () => {
    const comAna = { ...COM_RENATO, responsavel: ANA.id };
    expect(decidirAcao(comAna, ANA, { acao: 'assumir' })).toEqual(
      recusa({ motivo: 'ja-esta-com-voce' }),
    );
    expect(decidirAcao({ ...AGUARDANDO, responsavel: ANA.id }, ANA, { acao: 'assumir' })).toEqual(
      recusa({ motivo: 'ja-esta-com-voce' }),
    );
  });
});

describe('passar', () => {
  it('na triagem, passa a Em atendimento com a conta escolhida, e o relógio segue contando', () => {
    expect(decidirAcao(NA_TRIAGEM, ANA, { acao: 'passar', para: DIEGO })).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: DIEGO.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'passou', dados: { de: null, para: DIEGO.id } }],
    });
  });

  it('em atendimento, passa à conta escolhida', () => {
    // Ana passa o #1038, de Diego, a Renato.
    expect(decidirAcao(WIFI, ANA, { acao: 'passar', para: RENATO })).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: RENATO.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'passou', dados: { de: DIEGO.id, para: RENATO.id } }],
    });
  });

  it('aguardando, segue aguardando com a conta escolhida, e o relógio segue parado', () => {
    // Ana passa a Renato o #1041, que aguarda Fernanda com Diego.
    expect(decidirAcao(AGUARDANDO, ANA, { acao: 'passar', para: RENATO })).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: RENATO.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'passou', dados: { de: DIEGO.id, para: RENATO.id } }],
    });
  });

  it('resolvido, é recusado', () => {
    expect(decidirAcao(RESOLVIDO, ANA, { acao: 'passar', para: DIEGO })).toEqual(
      recusa({ motivo: 'resolvido' }),
    );
  });

  it('a quem já atende o chamado é recusado, e a quem passa o próprio chamado, "já está com você"', () => {
    expect(decidirAcao(WIFI, ANA, { acao: 'passar', para: DIEGO })).toEqual(
      recusa({ motivo: 'ja-esta-com', nome: 'Diego Ramos' }),
    );
    const doDiego: QuemAge = { id: DIEGO.id, alcance: DIEGO.alcance };
    expect(decidirAcao(WIFI, doDiego, { acao: 'passar', para: DIEGO })).toEqual(
      recusa({ motivo: 'ja-esta-com-voce' }),
    );
  });

  it('a quem não atende os locais é recusado, pelo primeiro local de fora', () => {
    // Bruno atende só Campinas, e o #1038 é de Jundiaí e da Sala Atlântico.
    expect(decidirAcao(WIFI, ANA, { acao: 'passar', para: BRUNO })).toEqual(
      recusa({ motivo: 'nao-atende', nome: 'Bruno Costa', local: 'Jundiaí' }),
    );
    // Com o ramo de Jundiaí sem a Sala Atlântico, ela é o local de fora.
    const soJundiai = { ...BRUNO, alcance: new Set([JUNDIAI.id]) };
    expect(decidirAcao(WIFI, ANA, { acao: 'passar', para: soJundiai })).toEqual(
      recusa({ motivo: 'nao-atende', nome: 'Bruno Costa', local: 'Sala Atlântico' }),
    );
  });

  it('a uma conta inativa ou sem `chamados.atender` é recusado', () => {
    const inativo = { ...RENATO, ativa: false };
    expect(decidirAcao(NA_TRIAGEM, ANA, { acao: 'passar', para: inativo })).toEqual(
      recusa({ motivo: 'nao-atende', nome: 'Renato Alves', local: 'Jundiaí' }),
    );
    const semPermissao = { ...RENATO, alcance: null };
    expect(decidirAcao(NA_TRIAGEM, ANA, { acao: 'passar', para: semPermissao })).toEqual(
      recusa({ motivo: 'nao-atende', nome: 'Renato Alves', local: 'Jundiaí' }),
    );
  });

  it('o chamado da organização inteira só vai a quem atende a organização inteira', () => {
    // A pessoa é de Jundiaí, e o ativo ligado não tem local.
    const daOrganizacao = { ...NA_TRIAGEM, semLocal: true };
    expect(decidirAcao(daOrganizacao, ANA, { acao: 'passar', para: DIEGO })).toEqual(
      recusa({ motivo: 'nao-atende', nome: 'Diego Ramos', local: null }),
    );
    const daAdministracao = { ...DIEGO, alcance: 'organizacao' as const };
    expect(decidirAcao(daOrganizacao, ANA, { acao: 'passar', para: daAdministracao })).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: DIEGO.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'passou', dados: { de: null, para: DIEGO.id } }],
    });
  });
});

describe('devolver à triagem', () => {
  it('na triagem, é recusado', () => {
    expect(decidirAcao(NA_TRIAGEM, ANA, { acao: 'devolver' })).toEqual(
      recusa({ motivo: 'ja-na-triagem' }),
    );
  });

  it('em atendimento, volta à triagem sem ninguém, e o relógio segue contando', () => {
    expect(decidirAcao(COM_RENATO, ANA, { acao: 'devolver' })).toEqual({
      aceita: true,
      situacao: 'triagem',
      responsavel: null,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'devolveu', dados: { de: RENATO.id } }],
    });
  });

  it('aguardando, é recusado com a pessoa que ele aguarda', () => {
    expect(decidirAcao(AGUARDANDO, ANA, { acao: 'devolver' })).toEqual(
      recusa({ motivo: 'aguardando', pessoa: 'Fernanda Rocha' }),
    );
  });

  it('resolvido, é recusado', () => {
    expect(decidirAcao(RESOLVIDO, ANA, { acao: 'devolver' })).toEqual(
      recusa({ motivo: 'resolvido' }),
    );
  });
});

describe('quem age', () => {
  it('quem não atende os locais do chamado não age nele, nem no que está com ela', () => {
    // Renato perdeu o `chamados.atender` com o #1033 ainda com ele.
    const renatoSemPermissao: QuemAge = { id: RENATO.id, alcance: null };
    expect(decidirAcao(COM_RENATO, renatoSemPermissao, { acao: 'devolver' })).toEqual(
      recusa({ motivo: 'voce-nao-atende', local: 'Jundiaí' }),
    );
    const doBruno: QuemAge = { id: BRUNO.id, alcance: BRUNO.alcance };
    expect(decidirAcao(NA_TRIAGEM, doBruno, { acao: 'assumir' })).toEqual(
      recusa({ motivo: 'voce-nao-atende', local: 'Jundiaí' }),
    );
    // A recusa pelos locais vem antes da recusa da célula.
    expect(decidirAcao(RESOLVIDO, doBruno, { acao: 'assumir' })).toEqual(
      recusa({ motivo: 'voce-nao-atende', local: 'Jundiaí' }),
    );
    const assumidoPorDiego = { ...NA_TRIAGEM, situacao: 'em-atendimento' as const, versao: 2 };
    expect(
      decidirDesfazer({ ...assumidoPorDiego, responsavel: DIEGO.id }, renatoSemPermissao, {
        versao: 2,
        antes: { situacao: 'triagem', responsavel: null },
      }),
    ).toEqual(recusa({ motivo: 'voce-nao-atende', local: 'Jundiaí' }));
  });
});

describe('desfazer o assumir', () => {
  /** O #1042 logo depois de Ana assumi-lo da triagem: a versão subiu de 1 para 2. */
  const ASSUMIDO: ChamadoParaAcao = {
    ...NA_TRIAGEM,
    situacao: 'em-atendimento',
    responsavel: ANA.id,
    versao: 2,
  };

  it('logo depois, volta o chamado à triagem, sem ninguém', () => {
    // A nota escrita entre o assumir e o desfazer não sobe a versão e não o impede.
    expect(
      decidirDesfazer(ASSUMIDO, ANA, {
        versao: 2,
        antes: { situacao: 'triagem', responsavel: null },
      }),
    ).toEqual({
      aceita: true,
      situacao: 'triagem',
      responsavel: null,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'desfez', dados: { para: null } }],
    });
  });

  it('volta o chamado a quem estava com ele, no atendimento e no aguardando', () => {
    // Ana assume o #1033, de Renato, e desfaz.
    const assumidoDeRenato = { ...COM_RENATO, responsavel: ANA.id, versao: 5 };
    expect(
      decidirDesfazer(assumidoDeRenato, ANA, {
        versao: 5,
        antes: { situacao: 'em-atendimento', responsavel: RENATO },
      }),
    ).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: RENATO.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'desfez', dados: { para: RENATO.id } }],
    });
    const assumidoDoAguardando = { ...AGUARDANDO, responsavel: ANA.id, versao: 4 };
    expect(
      decidirDesfazer(assumidoDoAguardando, ANA, {
        versao: 4,
        antes: { situacao: 'aguardando', responsavel: DIEGO },
      }),
    ).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: DIEGO.id,
      relogio: 'segue',
      sobeAVersao: true,
      eventos: [{ evento: 'desfez', dados: { para: DIEGO.id } }],
    });
  });

  it('depois de outra ação que sobe a versão, é recusado', () => {
    // Diego passou o #1042 de volta a Ana: a versão subiu para 3, e ele segue com Ana.
    expect(
      decidirDesfazer({ ...ASSUMIDO, versao: 3 }, ANA, {
        versao: 2,
        antes: { situacao: 'triagem', responsavel: null },
      }),
    ).toEqual(recusa({ motivo: 'mudou' }));
  });

  it('para quem deixou de atender os locais, é recusado', () => {
    const assumidoDeRenato = { ...COM_RENATO, responsavel: ANA.id, versao: 5 };
    expect(
      decidirDesfazer(assumidoDeRenato, ANA, {
        versao: 5,
        antes: { situacao: 'em-atendimento', responsavel: { ...RENATO, ativa: false } },
      }),
    ).toEqual(recusa({ motivo: 'nao-atende', nome: 'Renato Alves', local: 'Jundiaí' }));
  });

  it('o estado de antes que o assumir não deixa é recusado', () => {
    const desfazer = (
      chamado: ChamadoParaAcao,
      antes: Parameters<typeof decidirDesfazer>[2]['antes'],
    ) => decidirDesfazer(chamado, ANA, { versao: chamado.versao, antes });
    const mudou = recusa({ motivo: 'mudou' });
    // A triagem não tem ninguém, e o atendimento e o aguardando têm alguém.
    expect(desfazer(ASSUMIDO, { situacao: 'triagem', responsavel: RENATO })).toEqual(mudou);
    expect(desfazer(ASSUMIDO, { situacao: 'em-atendimento', responsavel: null })).toEqual(mudou);
    // O assumir não tira do aguardando nem chega a ele de outra situação.
    expect(desfazer(ASSUMIDO, { situacao: 'aguardando', responsavel: DIEGO })).toEqual(mudou);
    const noAguardando = { ...AGUARDANDO, responsavel: ANA.id };
    expect(desfazer(noAguardando, { situacao: 'triagem', responsavel: null })).toEqual(mudou);
    // O resolvido não se assume, e o chamado de antes não estava com quem assumiu.
    expect(desfazer(ASSUMIDO, { situacao: 'resolvido', responsavel: RENATO })).toEqual(mudou);
    const deAna = { ...RENATO, id: ANA.id, nome: 'Ana Souza' };
    expect(desfazer(ASSUMIDO, { situacao: 'em-atendimento', responsavel: deAna })).toEqual(mudou);
    // O chamado já não está com quem desfaz.
    expect(
      desfazer({ ...ASSUMIDO, responsavel: DIEGO.id }, { situacao: 'triagem', responsavel: null }),
    ).toEqual(mudou);
  });
});

describe('mensagemDaRecusaDaAcao', () => {
  it('escreve as frases da spec, com o primeiro nome', () => {
    const frase = (numero: number, motivo: RecusaDaAcao) => mensagemDaRecusaDaAcao(numero, motivo);
    expect(frase(1042, { motivo: 'resolvido' })).toBe('O chamado #1042 está resolvido.');
    expect(frase(1042, { motivo: 'ja-esta-com-voce' })).toBe('O chamado #1042 já está com você.');
    expect(frase(1038, { motivo: 'ja-esta-com', nome: 'Diego Ramos' })).toBe(
      'O chamado #1038 já está com Diego.',
    );
    expect(frase(1038, { motivo: 'nao-atende', nome: 'Bruno Costa', local: 'Jundiaí' })).toBe(
      'Bruno não atende os chamados de Jundiaí.',
    );
    expect(frase(1042, { motivo: 'voce-nao-atende', local: 'Jundiaí' })).toBe(
      'Você não atende os chamados de Jundiaí.',
    );
    expect(frase(1042, { motivo: 'ja-na-triagem' })).toBe('O chamado #1042 já está na triagem.');
    expect(frase(1041, { motivo: 'aguardando', pessoa: 'Fernanda Rocha' })).toBe(
      'O chamado #1041 está aguardando Fernanda. Passe a outra pessoa ou retome antes de devolver.',
    );
    expect(frase(1042, { motivo: 'mudou' })).toBe(
      'O chamado mudou depois. Confira antes de desfazer.',
    );
  });

  it('no chamado da organização inteira, diz "os chamados da organização inteira"', () => {
    expect(
      mensagemDaRecusaDaAcao(1042, { motivo: 'nao-atende', nome: 'Diego Ramos', local: null }),
    ).toBe('Diego não atende os chamados da organização inteira.');
    expect(mensagemDaRecusaDaAcao(1042, { motivo: 'voce-nao-atende', local: null })).toBe(
      'Você não atende os chamados da organização inteira.',
    );
  });

  it('a pessoa anonimizada aparece pelo nome inteiro, com o código', () => {
    expect(
      mensagemDaRecusaDaAcao(1041, { motivo: 'aguardando', pessoa: 'Pessoa anonimizada 7KQ2' }),
    ).toBe(
      'O chamado #1041 está aguardando Pessoa anonimizada 7KQ2. Passe a outra pessoa ou retome antes de devolver.',
    );
  });
});
