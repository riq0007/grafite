import { describe, expect, it } from 'vitest';
import type { QuemAge } from './acoes.ts';
import {
  type ChamadoParaPedirToner,
  type ChamadoParaVirarOs,
  mensagemDaRecusaDoPedirToner,
  mensagemDaRecusaDoVirarOs,
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
