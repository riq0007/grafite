import { describe, expect, it } from 'vitest';
import {
  ACOES_DO_CHAMADO,
  type ChamadoParaAcao,
  type ContaQueRecebe,
  decidirAcao,
  decidirDesfazer,
  LIMITES_DA_CONVERSA,
  MATRIZ_DAS_ACOES,
  mensagemDaRecusaDaAcao,
  type PedidoDeAcao,
  type QuemAge,
  type QuemFica,
  type RecusaDaAcao,
  recusaDeQuemAbre,
  relogioDepois,
  SITUACOES_DO_CHAMADO,
  type SituacaoDoChamado,
} from './acoes.ts';
import { conferirFormulario, type Formulario } from './formulario.ts';
import { HORARIO_DA_TI_PADRAO, type PrazoDoChamado } from './prazo.ts';

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

/** A primeira resposta da TI, ontem às 17:22. */
const RESPONDIDO = new Date('2026-11-16T17:22:00-03:00');

/** O #1042, de Marina Lopes, em Jundiaí, na triagem, ainda sem a primeira resposta da TI. */
const NA_TRIAGEM: ChamadoParaAcao = {
  numero: 1042,
  situacao: 'triagem',
  responsavel: null,
  pessoa: 'Marina Lopes',
  locais: [JUNDIAI],
  semLocal: false,
  versao: 1,
  primeiraRespostaEm: null,
};
/** O #1033, estourado, em atendimento com Renato. */
const COM_RENATO: ChamadoParaAcao = {
  ...NA_TRIAGEM,
  numero: 1033,
  situacao: 'em-atendimento',
  responsavel: RENATO.id,
  pessoa: 'Sérgio Lima',
  versao: 4,
  primeiraRespostaEm: RESPONDIDO,
};
/** O #1041, aguardando Fernanda desde 09:21, com Diego. */
const AGUARDANDO: ChamadoParaAcao = {
  ...NA_TRIAGEM,
  numero: 1041,
  situacao: 'aguardando',
  responsavel: DIEGO.id,
  pessoa: 'Fernanda Rocha',
  versao: 3,
  primeiraRespostaEm: RESPONDIDO,
};
/** O #1035, resolvido por Ana. */
const RESOLVIDO: ChamadoParaAcao = {
  ...NA_TRIAGEM,
  numero: 1035,
  situacao: 'resolvido',
  responsavel: ANA.id,
  versao: 6,
  primeiraRespostaEm: RESPONDIDO,
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
  primeiraRespostaEm: RESPONDIDO,
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'assumiu', dados: { de: null } }],
    });
  });

  it('em atendimento com outra conta, mesmo a que não atende mais, passa a quem assumiu', () => {
    expect(decidirAcao(COM_RENATO, ANA, { acao: 'assumir' })).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: ANA.id,
      relogio: 'segue',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'assumiu', dados: { de: RENATO.id } }],
    });
  });

  it('aguardando, segue aguardando com quem assumiu, e o relógio segue parado', () => {
    expect(decidirAcao(AGUARDANDO, ANA, { acao: 'assumir' })).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: ANA.id,
      relogio: 'segue',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'assumiu', dados: { de: DIEGO.id } }],
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'passou', dados: { de: null, para: DIEGO.id } }],
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'passou', dados: { de: DIEGO.id, para: RENATO.id } }],
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'passou', dados: { de: DIEGO.id, para: RENATO.id } }],
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'passou', dados: { de: null, para: DIEGO.id } }],
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'devolveu', dados: { de: RENATO.id } }],
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
    // Também na conversa: a nota de quem não atende os locais é recusada.
    expect(
      decidirAcao(NA_TRIAGEM, doBruno, { acao: 'nota', texto: 'Vou olhar.', anexos: 0 }),
    ).toEqual(recusa({ motivo: 'voce-nao-atende', local: 'Jundiaí' }));
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'desfez', dados: { para: null } }],
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'desfez', dados: { para: RENATO.id } }],
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
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'desfez', dados: { para: DIEGO.id } }],
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

const MENSAGEM =
  'Não achei uma pasta com esse nome na sua conta. Confirme o nome exato, por favor.';
const NOTA = 'Sem resposta até as 14h, ligar para o ramal 2231.';
const FEITO = 'Troquei o cilindro e imprimi a página de teste.';

describe('enviar a mensagem', () => {
  const enviar: PedidoDeAcao = { acao: 'mensagem', texto: MENSAGEM, anexos: 1 };

  it('na triagem, fica na triagem, cumpre a primeira resposta, e a versão não sobe', () => {
    expect(decidirAcao(NA_TRIAGEM, ANA, enviar)).toEqual({
      aceita: true,
      situacao: 'triagem',
      responsavel: null,
      relogio: 'segue',
      sobeAVersao: false,
      cumpreAPrimeiraResposta: true,
      conversa: [{ especie: 'mensagem', texto: MENSAGEM }],
    });
  });

  it('em atendimento, fica com quem atende, e o relógio segue contando', () => {
    // Ana escreve no #1033, que está com Renato e já teve a primeira resposta.
    expect(decidirAcao(COM_RENATO, ANA, enviar)).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: RENATO.id,
      relogio: 'segue',
      sobeAVersao: false,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'mensagem', texto: MENSAGEM }],
    });
  });

  it('aguardando, segue aguardando, e o relógio segue parado', () => {
    expect(decidirAcao(AGUARDANDO, ANA, enviar)).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: DIEGO.id,
      relogio: 'segue',
      sobeAVersao: false,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'mensagem', texto: MENSAGEM }],
    });
  });

  it('resolvido, é recusada', () => {
    expect(decidirAcao(RESOLVIDO, ANA, enviar)).toEqual(recusa({ motivo: 'resolvido' }));
  });
});

describe('enviar e esperar a resposta', () => {
  const esperar: PedidoDeAcao = { acao: 'esperar', texto: MENSAGEM, anexos: 0 };

  it('na triagem, passa a Aguardando com quem enviou, com o assumir, a mensagem e a espera, e o relógio para', () => {
    expect(decidirAcao(NA_TRIAGEM, ANA, esperar)).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: ANA.id,
      relogio: 'para',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: true,
      conversa: [
        { especie: 'evento', evento: 'assumiu', dados: { de: null } },
        { especie: 'mensagem', texto: MENSAGEM },
        { especie: 'evento', evento: 'aguardando', dados: {} },
      ],
    });
  });

  it('em atendimento, passa a Aguardando com quem atendia, e o relógio para', () => {
    // Ana escreve no #1033, de Renato, e o chamado continua com ele.
    expect(decidirAcao(COM_RENATO, ANA, esperar)).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: RENATO.id,
      relogio: 'para',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: false,
      conversa: [
        { especie: 'mensagem', texto: MENSAGEM },
        { especie: 'evento', evento: 'aguardando', dados: {} },
      ],
    });
  });

  it('aguardando, vale como a mensagem: sem evento, sem subir a versão, e o relógio segue parado', () => {
    expect(decidirAcao(AGUARDANDO, ANA, esperar)).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: DIEGO.id,
      relogio: 'segue',
      sobeAVersao: false,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'mensagem', texto: MENSAGEM }],
    });
  });

  it('resolvido, é recusado', () => {
    expect(decidirAcao(RESOLVIDO, ANA, esperar)).toEqual(recusa({ motivo: 'resolvido' }));
  });
});

describe('nota interna', () => {
  const nota: PedidoDeAcao = { acao: 'nota', texto: NOTA, anexos: 0 };

  it('na triagem, fica na triagem, sem cumprir a primeira resposta e sem subir a versão', () => {
    expect(decidirAcao(NA_TRIAGEM, ANA, nota)).toEqual({
      aceita: true,
      situacao: 'triagem',
      responsavel: null,
      relogio: 'segue',
      sobeAVersao: false,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'nota', texto: NOTA }],
    });
  });

  it('em atendimento, fica com quem atende', () => {
    expect(decidirAcao(COM_RENATO, ANA, nota)).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: RENATO.id,
      relogio: 'segue',
      sobeAVersao: false,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'nota', texto: NOTA }],
    });
  });

  it('aguardando, segue aguardando', () => {
    expect(decidirAcao(AGUARDANDO, ANA, nota)).toEqual({
      aceita: true,
      situacao: 'aguardando',
      responsavel: DIEGO.id,
      relogio: 'segue',
      sobeAVersao: false,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'nota', texto: NOTA }],
    });
  });

  it('resolvido, é recusada', () => {
    expect(decidirAcao(RESOLVIDO, ANA, nota)).toEqual(recusa({ motivo: 'resolvido' }));
  });
});

describe('retomar', () => {
  const retomar: PedidoDeAcao = { acao: 'retomar' };

  it('na triagem, é recusado', () => {
    expect(decidirAcao(NA_TRIAGEM, ANA, retomar)).toEqual(recusa({ motivo: 'nao-aguardando' }));
  });

  it('em atendimento, é recusado', () => {
    expect(decidirAcao(COM_RENATO, ANA, retomar)).toEqual(recusa({ motivo: 'nao-aguardando' }));
  });

  it('aguardando, volta a Em atendimento com quem atendia, e o relógio volta a contar', () => {
    expect(decidirAcao(AGUARDANDO, ANA, retomar)).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: DIEGO.id,
      relogio: 'volta',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'retomou', dados: {} }],
    });
  });

  it('resolvido, é recusado', () => {
    expect(decidirAcao(RESOLVIDO, ANA, retomar)).toEqual(recusa({ motivo: 'resolvido' }));
  });
});

describe('resolver', () => {
  /** Confere o pedido pelo `conferirFormulario`, para o formulário ficar como a API o grava. */
  function formularioCom(campos: Record<string, unknown>[]): Formulario {
    const conferencia = conferirFormulario(
      { titulo: { comecaPeloTipo: true, campoId: null }, campos },
      { pedeOAtivo: false },
    );
    if (!conferencia.ok) throw new Error(JSON.stringify(conferencia.erros));
    return conferencia.formulario;
  }

  const PROBLEMA = {
    id: 'problema',
    tipo: 'escolha-unica',
    rotulo: 'O que está acontecendo?',
    obrigatorio: true,
    opcoes: [
      { id: 'manchando', texto: 'Manchando' },
      { id: 'nao-imprime', texto: 'Não imprime' },
    ],
  };
  const CONTADOR = {
    id: 'contador',
    tipo: 'numero',
    rotulo: 'Contador de páginas',
    obrigatorio: true,
    soDaTi: true,
  };
  /** Só aparece com as manchas. */
  const CILINDRO = {
    id: 'cilindro',
    tipo: 'sim-ou-nao',
    rotulo: 'Trocou o cilindro?',
    obrigatorio: true,
    soDaTi: true,
    condicao: [{ campoId: 'problema', opcaoId: 'manchando' }],
  };
  const OBSERVACAO = {
    id: 'observacao',
    tipo: 'texto-curto',
    rotulo: 'Observação da TI',
    soDaTi: true,
  };

  /** A Impressora, com os campos só da TI obrigatórios: o Contador de páginas e o cilindro. */
  const IMPRESSORA = formularioCom([PROBLEMA, CONTADOR, CILINDRO, OBSERVACAO]);

  const resolver = (
    respostas: Record<string, unknown> = { problema: 'nao-imprime', contador: 48210 },
    feito = FEITO,
    formulario = IMPRESSORA,
  ): PedidoDeAcao => ({ acao: 'resolver', feito, formulario, respostas });

  it('na triagem, passa a Resolvido sem ninguém, com o "O que foi feito" e a resolução, e o relógio para', () => {
    // O "O que foi feito" escreve a Marina, e cumpre a primeira resposta que faltava.
    expect(decidirAcao(NA_TRIAGEM, ANA, resolver())).toEqual({
      aceita: true,
      situacao: 'resolvido',
      responsavel: null,
      relogio: 'para',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: true,
      conversa: [
        { especie: 'mensagem', texto: FEITO },
        { especie: 'evento', evento: 'resolveu', dados: {} },
      ],
    });
  });

  it('em atendimento, passa a Resolvido com quem atendia, e o relógio para', () => {
    expect(decidirAcao(COM_RENATO, ANA, resolver())).toEqual({
      aceita: true,
      situacao: 'resolvido',
      responsavel: RENATO.id,
      relogio: 'para',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: false,
      conversa: [
        { especie: 'mensagem', texto: FEITO },
        { especie: 'evento', evento: 'resolveu', dados: {} },
      ],
    });
  });

  it('aguardando, passa a Resolvido com quem atendia, e o relógio segue parado', () => {
    expect(decidirAcao(AGUARDANDO, ANA, resolver())).toEqual({
      aceita: true,
      situacao: 'resolvido',
      responsavel: DIEGO.id,
      relogio: 'segue',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: false,
      conversa: [
        { especie: 'mensagem', texto: FEITO },
        { especie: 'evento', evento: 'resolveu', dados: {} },
      ],
    });
  });

  it('resolvido, é recusado', () => {
    expect(decidirAcao(RESOLVIDO, ANA, resolver())).toEqual(recusa({ motivo: 'resolvido' }));
  });

  it('com o campo só da TI obrigatório vazio, é recusado pelo nome dele', () => {
    expect(decidirAcao(COM_RENATO, ANA, resolver({ problema: 'nao-imprime' }))).toEqual(
      recusa({ motivo: 'campo-da-ti', campo: 'Contador de páginas' }),
    );
  });

  it('o campo que a condição esconde não impede, e o "Não" é uma resposta', () => {
    const resolvido = { aceita: true, situacao: 'resolvido' };
    expect(
      decidirAcao(COM_RENATO, ANA, resolver({ problema: 'manchando', contador: 48210 })),
    ).toEqual(recusa({ motivo: 'campo-da-ti', campo: 'Trocou o cilindro' }));
    expect(
      decidirAcao(
        COM_RENATO,
        ANA,
        resolver({ problema: 'manchando', contador: 48210, cilindro: false }),
      ),
    ).toMatchObject(resolvido);
    // Sem as manchas, o cilindro não aparece, e a resposta guardada dele não conta.
    expect(
      decidirAcao(COM_RENATO, ANA, resolver({ problema: 'nao-imprime', contador: 48210 })),
    ).toMatchObject(resolvido);
  });

  it('recusa o primeiro campo na ordem do formulário, pelo nome no resumo, e só os da TI', () => {
    // Os dois campos da TI estão vazios: o Contador vem antes.
    expect(decidirAcao(COM_RENATO, ANA, resolver({ problema: 'manchando' }))).toEqual(
      recusa({ motivo: 'campo-da-ti', campo: 'Contador de páginas' }),
    );
    // O campo da pessoa sem resposta não impede: a abertura já o conferiu.
    expect(decidirAcao(COM_RENATO, ANA, resolver({ contador: 48210 }))).toMatchObject({
      aceita: true,
    });
    const comNome = formularioCom([
      PROBLEMA,
      CONTADOR,
      { ...CILINDRO, nomeNoResumo: 'Cilindro' },
      OBSERVACAO,
    ]);
    expect(
      decidirAcao(
        COM_RENATO,
        ANA,
        resolver({ problema: 'manchando', contador: 48210 }, FEITO, comNome),
      ),
    ).toEqual(recusa({ motivo: 'campo-da-ti', campo: 'Cilindro' }));
  });

  it('pede o "O que foi feito", de 1 a 2.000 caracteres, depois dos campos', () => {
    expect(decidirAcao(COM_RENATO, ANA, resolver(undefined, ' \n '))).toEqual(
      recusa({ motivo: 'sem-texto', texto: 'feito' }),
    );
    expect(decidirAcao(COM_RENATO, ANA, resolver(undefined, 'a'.repeat(2001)))).toEqual(
      recusa({ motivo: 'texto-longo', texto: 'feito' }),
    );
    expect(decidirAcao(COM_RENATO, ANA, resolver(undefined, 'a'.repeat(2000)))).toMatchObject({
      aceita: true,
    });
    expect(decidirAcao(COM_RENATO, ANA, resolver({ problema: 'nao-imprime' }, ''))).toEqual(
      recusa({ motivo: 'campo-da-ti', campo: 'Contador de páginas' }),
    );
  });
});

describe('reabrir', () => {
  /** Ana, que resolveu o #1035, como a conta está agora. */
  const ANA_QUE_RESOLVEU: ContaQueRecebe = {
    id: ANA.id,
    nome: 'Ana Souza',
    ativa: true,
    alcance: 'organizacao',
  };
  const reabrir = (quemResolveu: ContaQueRecebe = ANA_QUE_RESOLVEU): PedidoDeAcao => ({
    acao: 'reabrir',
    quemResolveu,
  });

  it('na triagem, é recusado', () => {
    expect(decidirAcao(NA_TRIAGEM, ANA, reabrir())).toEqual(recusa({ motivo: 'nao-resolvido' }));
  });

  it('em atendimento, é recusado', () => {
    expect(decidirAcao(COM_RENATO, ANA, reabrir())).toEqual(recusa({ motivo: 'nao-resolvido' }));
  });

  it('aguardando, é recusado', () => {
    expect(decidirAcao(AGUARDANDO, ANA, reabrir())).toEqual(recusa({ motivo: 'nao-resolvido' }));
  });

  it('resolvido, volta a Em atendimento com quem resolveu, e o relógio volta a contar', () => {
    expect(decidirAcao(RESOLVIDO, ANA, reabrir())).toEqual({
      aceita: true,
      situacao: 'em-atendimento',
      responsavel: ANA.id,
      relogio: 'volta',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'reabriu', dados: { para: ANA.id } }],
    });
    // Quem reabre não importa: Diego reabre o que Ana resolveu, e o chamado volta a ela.
    const doDiego: QuemAge = { id: DIEGO.id, alcance: DIEGO.alcance };
    expect(decidirAcao(RESOLVIDO, doDiego, reabrir())).toMatchObject({
      situacao: 'em-atendimento',
      responsavel: ANA.id,
    });
  });

  it('resolvido por quem não atende mais os locais, volta Na triagem, e o relógio volta a contar', () => {
    const naTriagem = {
      aceita: true,
      situacao: 'triagem',
      responsavel: null,
      relogio: 'volta',
      sobeAVersao: true,
      cumpreAPrimeiraResposta: false,
      conversa: [{ especie: 'evento', evento: 'reabriu', dados: { para: null } }],
    };
    expect(decidirAcao(RESOLVIDO, ANA, reabrir({ ...RENATO, ativa: false }))).toEqual(naTriagem);
    expect(decidirAcao(RESOLVIDO, ANA, reabrir({ ...RENATO, alcance: RAMO_DE_CAMPINAS }))).toEqual(
      naTriagem,
    );
  });
});

describe('os textos da conversa', () => {
  it('perdem os espaços das pontas e são contados em caracteres, e não em unidades do UTF-16', () => {
    expect(
      decidirAcao(COM_RENATO, ANA, { acao: 'nota', texto: `  ${NOTA}\n`, anexos: 0 }),
    ).toMatchObject({ conversa: [{ especie: 'nota', texto: NOTA }] });
    // O emoji conta um caractere, com duas unidades do UTF-16.
    const cheio = '👍'.repeat(LIMITES_DA_CONVERSA.mensagem);
    expect(
      decidirAcao(COM_RENATO, ANA, { acao: 'mensagem', texto: cheio, anexos: 0 }),
    ).toMatchObject({ aceita: true });
    expect(
      decidirAcao(COM_RENATO, ANA, { acao: 'mensagem', texto: `${cheio}!`, anexos: 0 }),
    ).toEqual(recusa({ motivo: 'texto-longo', texto: 'mensagem' }));
  });

  it('pedem o texto na mensagem, na espera e na nota, de até 4.000 caracteres', () => {
    expect(decidirAcao(COM_RENATO, ANA, { acao: 'mensagem', texto: ' \n ', anexos: 0 })).toEqual(
      recusa({ motivo: 'sem-texto', texto: 'mensagem' }),
    );
    expect(decidirAcao(COM_RENATO, ANA, { acao: 'esperar', texto: '', anexos: 2 })).toEqual(
      recusa({ motivo: 'sem-texto', texto: 'mensagem' }),
    );
    expect(decidirAcao(COM_RENATO, ANA, { acao: 'nota', texto: '', anexos: 0 })).toEqual(
      recusa({ motivo: 'sem-texto', texto: 'nota' }),
    );
    expect(
      decidirAcao(COM_RENATO, ANA, { acao: 'nota', texto: 'a'.repeat(4001), anexos: 0 }),
    ).toEqual(recusa({ motivo: 'texto-longo', texto: 'nota' }));
  });

  it('aceitam até 5 anexos', () => {
    expect(
      decidirAcao(COM_RENATO, ANA, { acao: 'mensagem', texto: MENSAGEM, anexos: 5 }),
    ).toMatchObject({ aceita: true });
    expect(decidirAcao(COM_RENATO, ANA, { acao: 'esperar', texto: MENSAGEM, anexos: 6 })).toEqual(
      recusa({ motivo: 'anexos-demais' }),
    );
    expect(decidirAcao(COM_RENATO, ANA, { acao: 'nota', texto: NOTA, anexos: 6 })).toEqual(
      recusa({ motivo: 'anexos-demais' }),
    );
  });
});

describe('a matriz', () => {
  const contando = (situacao: SituacaoDoChamado) =>
    situacao === 'triagem' || situacao === 'em-atendimento';
  const celulas = ACOES_DO_CHAMADO.flatMap((acao) =>
    SITUACOES_DO_CHAMADO.map((partida) => ({
      acao,
      partida,
      celula: MATRIZ_DAS_ACOES[acao][partida],
    })),
  );

  it('deixa o relógio como o banco pede: contando na triagem e no atendimento, parado depois', () => {
    for (const { acao, partida, celula } of celulas) {
      if ('recusa' in celula) continue;
      const antes = contando(partida);
      // Só para o relógio que conta, e só volta o parado.
      if (celula.relogio === 'para') expect(antes, `${acao} em ${partida}`).toBe(true);
      if (celula.relogio === 'volta') expect(antes, `${acao} em ${partida}`).toBe(false);
      const depois = celula.relogio === 'segue' ? antes : celula.relogio === 'volta';
      // O reabrir que cai na triagem também conta, como o atendimento.
      expect(depois, `${acao} em ${partida}`).toBe(contando(celula.chega));
    }
  });

  it('deixa ninguém na triagem e alguém no atendimento e no aguardando', () => {
    const temAlguem = (partida: SituacaoDoChamado, fica: QuemFica) => {
      if (fica === 'ninguem') return false;
      if (fica === 'mesma') return partida === 'em-atendimento' || partida === 'aguardando';
      return true;
    };
    for (const { acao, partida, celula } of celulas) {
      if ('recusa' in celula || celula.chega === 'resolvido') continue;
      expect(temAlguem(partida, celula.fica), `${acao} em ${partida}`).toBe(
        celula.chega !== 'triagem',
      );
    }
  });
});

describe('relogioDepois', () => {
  /** O instante no relógio de São Paulo; terça, 17/11/2026, é o dia dos mockups. */
  const sp = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
  const NO_HORARIO: PrazoDoChamado = {
    modo: 'horario',
    respostaMin: 30,
    resolucaoMin: 480,
    resposta: { valor: 30, unidade: 'min' },
    resolucao: { valor: 8, unidade: 'h' },
  };
  const CORRIDAS: PrazoDoChamado = { ...NO_HORARIO, modo: 'corridas' };

  it('parar soma o tempo do relógio desde que ele voltou a contar e o deixa parado', () => {
    // O #1042, aberto às 07:40, para às 09:40: conta 1 h 40 min, das 08:00.
    expect(
      relogioDepois(
        { prazo: NO_HORARIO, contadoS: 0, relogioDesde: sp('2026-11-17T07:40') },
        'para',
        sp('2026-11-17T09:40'),
        HORARIO_DA_TI_PADRAO,
      ),
    ).toEqual({ contadoS: 6000, relogioDesde: null });
    // Em horas corridas, todo o tempo conta: 8 h 20 min desde 01:20.
    expect(
      relogioDepois(
        { prazo: CORRIDAS, contadoS: 600, relogioDesde: sp('2026-11-17T01:20') },
        'para',
        sp('2026-11-17T09:40'),
        HORARIO_DA_TI_PADRAO,
      ),
    ).toEqual({ contadoS: 600 + 30000, relogioDesde: null });
  });

  it('voltar recomeça agora, do que já estava contado', () => {
    // O #1035, reaberto às 10:00 com 3 h contadas.
    expect(
      relogioDepois(
        { prazo: NO_HORARIO, contadoS: 10800, relogioDesde: null },
        'volta',
        sp('2026-11-17T10:00'),
        HORARIO_DA_TI_PADRAO,
      ),
    ).toEqual({ contadoS: 10800, relogioDesde: sp('2026-11-17T10:00') });
  });

  it('seguir não muda nada, contando ou parado', () => {
    const agora = sp('2026-11-17T09:40');
    const contando = { prazo: NO_HORARIO, contadoS: 120, relogioDesde: sp('2026-11-17T09:00') };
    expect(relogioDepois(contando, 'segue', agora, HORARIO_DA_TI_PADRAO)).toEqual({
      contadoS: 120,
      relogioDesde: sp('2026-11-17T09:00'),
    });
    const parado = { prazo: NO_HORARIO, contadoS: 8160, relogioDesde: null };
    expect(relogioDepois(parado, 'segue', agora, HORARIO_DA_TI_PADRAO)).toEqual({
      contadoS: 8160,
      relogioDesde: null,
    });
  });

  it('parar o relógio parado e voltar o que conta são erros do programa', () => {
    const agora = sp('2026-11-17T09:40');
    expect(() =>
      relogioDepois(
        { prazo: NO_HORARIO, contadoS: 0, relogioDesde: null },
        'para',
        agora,
        HORARIO_DA_TI_PADRAO,
      ),
    ).toThrow('O relógio já está parado.');
    expect(() =>
      relogioDepois(
        { prazo: NO_HORARIO, contadoS: 0, relogioDesde: sp('2026-11-17T09:00') },
        'volta',
        agora,
        HORARIO_DA_TI_PADRAO,
      ),
    ).toThrow('O relógio já está contando.');
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

  it('escreve as recusas da conversa e do fim', () => {
    const frase = (numero: number, motivo: RecusaDaAcao) => mensagemDaRecusaDaAcao(numero, motivo);
    expect(frase(1042, { motivo: 'nao-aguardando' })).toBe('O chamado #1042 não está aguardando.');
    expect(frase(1042, { motivo: 'nao-resolvido' })).toBe('O chamado #1042 não está resolvido.');
    expect(frase(1042, { motivo: 'campo-da-ti', campo: 'Contador de páginas' })).toBe(
      'Preencha Contador de páginas antes de resolver.',
    );
    expect(frase(1042, { motivo: 'sem-texto', texto: 'mensagem' })).toBe('Escreva a mensagem.');
    expect(frase(1042, { motivo: 'sem-texto', texto: 'nota' })).toBe('Escreva a nota.');
    expect(frase(1042, { motivo: 'sem-texto', texto: 'feito' })).toBe('Escreva o que foi feito.');
    expect(frase(1042, { motivo: 'texto-longo', texto: 'mensagem' })).toBe(
      'Use até 4.000 caracteres.',
    );
    expect(frase(1042, { motivo: 'texto-longo', texto: 'nota' })).toBe('Use até 4.000 caracteres.');
    expect(frase(1042, { motivo: 'texto-longo', texto: 'feito' })).toBe(
      'Use até 2.000 caracteres.',
    );
    expect(frase(1042, { motivo: 'anexos-demais' })).toBe('Anexe até 5 arquivos.');
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

describe('quem abre o chamado', () => {
  const nos = (locais: { id: string; nome: string }[], semLocal = false) => ({ locais, semLocal });

  it('quem atende todos os locais abre', () => {
    expect(recusaDeQuemAbre('organizacao', nos([JUNDIAI, CAMPINAS]))).toBeNull();
    expect(recusaDeQuemAbre('organizacao', nos([], true))).toBeNull();
    expect(recusaDeQuemAbre(RAMO_DE_JUNDIAI, nos([JUNDIAI, SALA_ATLANTICO]))).toBeNull();
  });

  it('quem não atende um dos locais recebe a frase com o primeiro fora do alcance', () => {
    expect(recusaDeQuemAbre(RAMO_DE_CAMPINAS, nos([JUNDIAI]))).toBe(
      'Você não atende os chamados de Jundiaí.',
    );
    expect(recusaDeQuemAbre(RAMO_DE_JUNDIAI, nos([JUNDIAI, CAMPINAS]))).toBe(
      'Você não atende os chamados de Campinas.',
    );
  });

  it('o chamado da organização inteira pede a organização', () => {
    expect(recusaDeQuemAbre(RAMO_DE_JUNDIAI, nos([JUNDIAI], true))).toBe(
      'Você não atende os chamados da organização inteira.',
    );
  });

  it('sem alcance, a frase cita o primeiro local, ou a organização', () => {
    expect(recusaDeQuemAbre(null, nos([CAMPINAS, JUNDIAI]))).toBe(
      'Você não atende os chamados de Campinas.',
    );
    expect(recusaDeQuemAbre(null, nos([], true))).toBe(
      'Você não atende os chamados da organização inteira.',
    );
  });
});
