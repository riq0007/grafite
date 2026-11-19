import { describe, expect, it } from 'vitest';
import { MENSAGEM_DO_LOCAL_INATIVO } from '../estoque/estoque.ts';
import { MENSAGEM_DO_TIPO_INATIVO } from '../solicitacoes/solicitacoes.ts';
import type { QuemAge } from './acoes.ts';
import {
  type ChamadoParaPedirToner,
  type ChamadoParaVirarOs,
  fraseDaSolicitacaoNaoGerada,
  mensagemDaRecusaDoPedirToner,
  mensagemDaRecusaDoVirarOs,
  motivoDaSolicitacaoNaoGerada,
  motivoDoEquipamento,
  motivoDoEventoNaoGerado,
  recusaDoPedirToner,
  recusaDoVirarOs,
} from './os-e-solicitacao.ts';

const JUNDIAI = { id: 'local-jundiai', nome: 'Jundiaí' };
const CAMPINAS = { id: 'local-campinas', nome: 'Campinas' };

/** Ana atende a organização inteira; Diego, só Jundiaí. */
const ANA: QuemAge = { id: 'conta-ana', alcance: 'organizacao' };
const DIEGO: QuemAge = { id: 'conta-diego', alcance: new Set([JUNDIAI.id]) };

/** O #1042, de Impressora, com a PAT-00139 ligada, em atendimento, sem OS. */
const IMPRESSORA: ChamadoParaVirarOs = {
  numero: 1042,
  situacao: 'em-atendimento',
  locais: [JUNDIAI],
  semLocal: false,
  os: null,
  tipo: { nome: 'Impressora', podeVirarOs: true },
  ativo: 'ativo-pat-00139',
};

describe('recusaDoVirarOs', () => {
  it('Impressora vira OS: o chamado em aberto, com o ativo, de um tipo que vira OS, não tem recusa', () => {
    expect(recusaDoVirarOs(IMPRESSORA, ANA)).toBeNull();
    expect(recusaDoVirarOs({ ...IMPRESSORA, situacao: 'triagem' }, DIEGO)).toBeNull();
    expect(recusaDoVirarOs({ ...IMPRESSORA, situacao: 'aguardando' }, DIEGO)).toBeNull();
  });

  it('quem não atende os locais vem antes de tudo, e o resolvido, depois dele', () => {
    const tudoErrado: ChamadoParaVirarOs = {
      ...IMPRESSORA,
      locais: [CAMPINAS],
      situacao: 'resolvido',
      os: 12,
      tipo: { nome: 'Acesso e senha', podeVirarOs: false },
      ativo: null,
    };
    expect(recusaDoVirarOs(tudoErrado, DIEGO)).toEqual({
      motivo: 'voce-nao-atende',
      local: 'Campinas',
    });
    expect(recusaDoVirarOs(tudoErrado, ANA)).toEqual({ motivo: 'resolvido' });
  });

  it('Segunda OS do chamado: a OS que ele já tem vem antes do tipo e do ativo', () => {
    const comOs: ChamadoParaVirarOs = {
      ...IMPRESSORA,
      os: 13,
      tipo: { nome: 'Acesso e senha', podeVirarOs: false },
      ativo: null,
    };
    expect(recusaDoVirarOs(comOs, ANA)).toEqual({ motivo: 'ja-tem-os', os: 13 });
  });

  it('o tipo que não vira OS vem antes do ativo, pelo tipo como está agora', () => {
    const acesso: ChamadoParaVirarOs = {
      ...IMPRESSORA,
      tipo: { nome: 'Acesso e senha', podeVirarOs: false },
      ativo: null,
    };
    expect(recusaDoVirarOs(acesso, ANA)).toEqual({
      motivo: 'tipo-nao-vira-os',
      tipo: 'Acesso e senha',
    });
  });

  it('o chamado sem o ativo ligado é a última recusa', () => {
    expect(recusaDoVirarOs({ ...IMPRESSORA, ativo: null }, ANA)).toEqual({ motivo: 'sem-ativo' });
  });

  it('o chamado sem local é recusado a quem atende só um ramo', () => {
    expect(recusaDoVirarOs({ ...IMPRESSORA, locais: [], semLocal: true }, DIEGO)).toEqual({
      motivo: 'voce-nao-atende',
      local: null,
    });
  });
});

describe('mensagemDaRecusaDoVirarOs', () => {
  it('escreve as frases da spec', () => {
    expect(mensagemDaRecusaDoVirarOs(1042, { motivo: 'ja-tem-os', os: 12 })).toBe(
      'O chamado #1042 já tem a OS 12.',
    );
    expect(mensagemDaRecusaDoVirarOs(1042, { motivo: 'sem-ativo' })).toBe(
      'O chamado #1042 não tem um ativo ligado.',
    );
    expect(
      mensagemDaRecusaDoVirarOs(1042, { motivo: 'tipo-nao-vira-os', tipo: 'Acesso e senha' }),
    ).toBe('O tipo Acesso e senha não vira OS.');
    expect(mensagemDaRecusaDoVirarOs(1042, { motivo: 'resolvido' })).toBe(
      'O chamado #1042 está resolvido.',
    );
    expect(mensagemDaRecusaDoVirarOs(1042, { motivo: 'voce-nao-atende', local: 'Campinas' })).toBe(
      'Você não atende os chamados de Campinas.',
    );
  });
});

/** O #1042 com a PAT-00139 ligada, em atendimento, sem solicitação. */
const PARA_O_TONER: ChamadoParaPedirToner = {
  numero: 1042,
  situacao: 'em-atendimento',
  locais: [JUNDIAI],
  semLocal: false,
  solicitacao: null,
  ativo: 'ativo-pat-00139',
};

describe('recusaDoPedirToner', () => {
  it('o chamado em aberto, com o ativo e sem solicitação, de qualquer tipo, não tem recusa', () => {
    expect(recusaDoPedirToner(PARA_O_TONER, ANA)).toBeNull();
    expect(recusaDoPedirToner({ ...PARA_O_TONER, situacao: 'triagem' }, DIEGO)).toBeNull();
    expect(recusaDoPedirToner({ ...PARA_O_TONER, situacao: 'aguardando' }, DIEGO)).toBeNull();
  });

  it('quem não atende os locais vem antes de tudo, e o resolvido, depois dele', () => {
    const tudoErrado: ChamadoParaPedirToner = {
      ...PARA_O_TONER,
      locais: [CAMPINAS],
      situacao: 'resolvido',
      solicitacao: 4,
      ativo: null,
    };
    expect(recusaDoPedirToner(tudoErrado, DIEGO)).toEqual({
      motivo: 'voce-nao-atende',
      local: 'Campinas',
    });
    expect(recusaDoPedirToner(tudoErrado, ANA)).toEqual({ motivo: 'resolvido' });
  });

  it('Segunda solicitação do chamado: a que ele já tem vem antes do ativo', () => {
    expect(recusaDoPedirToner({ ...PARA_O_TONER, solicitacao: 4, ativo: null }, ANA)).toEqual({
      motivo: 'ja-tem-solicitacao',
      solicitacao: 4,
    });
  });

  it('o chamado sem o ativo ligado é a última recusa', () => {
    expect(recusaDoPedirToner({ ...PARA_O_TONER, ativo: null }, ANA)).toEqual({
      motivo: 'sem-ativo',
    });
  });
});

describe('mensagemDaRecusaDoPedirToner', () => {
  it('escreve as frases da spec', () => {
    expect(
      mensagemDaRecusaDoPedirToner(1042, { motivo: 'ja-tem-solicitacao', solicitacao: 4 }),
    ).toBe('O chamado #1042 já está na solicitação 4.');
    expect(mensagemDaRecusaDoPedirToner(1042, { motivo: 'sem-ativo' })).toBe(
      'O chamado #1042 não tem um ativo ligado.',
    );
    expect(mensagemDaRecusaDoPedirToner(1042, { motivo: 'resolvido' })).toBe(
      'O chamado #1042 está resolvido.',
    );
    expect(
      mensagemDaRecusaDoPedirToner(1042, { motivo: 'voce-nao-atende', local: 'Campinas' }),
    ).toBe('Você não atende os chamados de Campinas.');
  });
});

describe('motivoDaSolicitacaoNaoGerada', () => {
  const NOMES = { tipoDeAtivo: 'Notebook', local: 'Financeiro' };

  it('escreve os casos da abertura, que não chegam ao registro', () => {
    expect(motivoDaSolicitacaoNaoGerada({ motivo: 'modulo-desligado' })).toBe(
      'o módulo Operação está desligado.',
    );
    expect(motivoDaSolicitacaoNaoGerada({ motivo: 'sem-ativo' })).toBe(
      'o chamado não tem um ativo ligado.',
    );
    expect(motivoDaSolicitacaoNaoGerada({ motivo: 'sem-local', pessoa: 'Marina Lopes' })).toBe(
      'Marina Lopes não tem local de trabalho.',
    );
  });

  it('o tipo de ativo e o local inativos, pelo nome; os dois juntos, o tipo de ativo', () => {
    const recusa = (campos: Record<string, string>) =>
      motivoDaSolicitacaoNaoGerada({
        motivo: 'recusa',
        frase: 'Confira os campos indicados.',
        campos,
        nomes: NOMES,
      });
    expect(recusa({ tipoDeAtivo: MENSAGEM_DO_TIPO_INATIVO })).toBe(
      'o tipo de ativo Notebook está inativo.',
    );
    expect(recusa({ local: MENSAGEM_DO_LOCAL_INATIVO })).toBe('o local Financeiro está inativo.');
    expect(
      recusa({ local: MENSAGEM_DO_LOCAL_INATIVO, tipoDeAtivo: MENSAGEM_DO_TIPO_INATIVO }),
    ).toBe('o tipo de ativo Notebook está inativo.');
  });

  it('as outras recusas: a frase do primeiro campo ou, sem campo, a da recusa', () => {
    expect(
      motivoDaSolicitacaoNaoGerada({
        motivo: 'recusa',
        frase: 'Confira os campos indicados.',
        campos: { tipoDeAtivo: 'Tipo de ativo não encontrado.', local: 'Local não encontrado.' },
        nomes: NOMES,
      }),
    ).toBe('Tipo de ativo não encontrado.');
    expect(
      motivoDaSolicitacaoNaoGerada({
        motivo: 'recusa',
        frase: 'PAT-00139 não usa consumíveis.',
        nomes: { tipoDeAtivo: null, local: null },
      }),
    ).toBe('PAT-00139 não usa consumíveis.');
    // O inativo sem o nome lido fica com a frase do campo.
    expect(
      motivoDaSolicitacaoNaoGerada({
        motivo: 'recusa',
        frase: MENSAGEM_DO_LOCAL_INATIVO,
        campos: { local: MENSAGEM_DO_LOCAL_INATIVO },
        nomes: { tipoDeAtivo: null, local: null },
      }),
    ).toBe(MENSAGEM_DO_LOCAL_INATIVO);
  });

  it('a frase da conversa junta o começo ao motivo', () => {
    expect(fraseDaSolicitacaoNaoGerada('o tipo de ativo Notebook está inativo.')).toBe(
      'A solicitação não foi gerada: o tipo de ativo Notebook está inativo.',
    );
  });
});

describe('motivoDoEventoNaoGerado', () => {
  it('o sem local vem com o nome de agora da pessoa, também o anonimizado', () => {
    expect(motivoDoEventoNaoGerado({ semLocal: true }, 'Rita Moraes')).toBe(
      'Rita Moraes não tem local de trabalho.',
    );
    expect(motivoDoEventoNaoGerado({ semLocal: true }, 'Pessoa anonimizada 7K2M')).toBe(
      'Pessoa anonimizada 7K2M não tem local de trabalho.',
    );
  });

  it('o outro motivo vem como foi escrito, e o ilegível vem nulo', () => {
    expect(
      motivoDoEventoNaoGerado({ motivo: 'PAT-00139 não usa consumíveis.' }, 'Rita Moraes'),
    ).toBe('PAT-00139 não usa consumíveis.');
    expect(motivoDoEventoNaoGerado(null, 'Rita Moraes')).toBeNull();
    expect(motivoDoEventoNaoGerado({ motivo: 7 }, 'Rita Moraes')).toBeNull();
    expect(motivoDoEventoNaoGerado({ semLocal: 'sim' }, 'Rita Moraes')).toBeNull();
  });
});

describe('motivoDoEquipamento', () => {
  it('é o número e o título do chamado', () => {
    expect(motivoDoEquipamento(1043, 'Equipamento novo para Marina')).toBe(
      'Chamado #1043: Equipamento novo para Marina',
    );
  });
});
