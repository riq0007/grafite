import { describe, expect, it } from 'vitest';
import type { ContaQueRecebe, QuemAge } from './acoes.ts';
import {
  type ChamadoParaTrocaDoAtivo,
  decidirTrocaDoAtivo,
  mensagemDaRecusaDaTrocaDoAtivo,
  recusaDaEdicao,
} from './edicao.ts';

const JUNDIAI = { id: 'local-jundiai', nome: 'Jundiaí' };
const SALA_ATLANTICO = { id: 'local-sala-atlantico', nome: 'Jundiaí › Sala Atlântico' };
const CAMPINAS = { id: 'local-campinas', nome: 'Campinas' };

const RAMO_DE_JUNDIAI = new Set([JUNDIAI.id, SALA_ATLANTICO.id]);

/** Ana atende a organização inteira; Diego, o ramo de Jundiaí. */
const ANA: QuemAge = { id: 'conta-ana', alcance: 'organizacao' };
const DIEGO: QuemAge = { id: 'conta-diego', alcance: RAMO_DE_JUNDIAI };

const ANA_QUE_ATENDE: ContaQueRecebe = {
  id: ANA.id,
  nome: 'Ana Souza',
  ativa: true,
  alcance: 'organizacao',
};
const RENATO: ContaQueRecebe = {
  id: 'conta-renato',
  nome: 'Renato Alves',
  ativa: true,
  alcance: RAMO_DE_JUNDIAI,
};

const IMPRESSORA_DE_CAMPINAS = { id: 'ativo-pat-00139', local: CAMPINAS };
const IMPRESSORA_DA_SALA = { id: 'ativo-pat-00140', local: SALA_ATLANTICO };
const NOTEBOOK_SEM_LOCAL = { id: 'ativo-nb-0231', local: null };

/** O #1040, de uma pessoa de Jundiaí, sem ativo, em atendimento com Ana. */
const SEM_ATIVO: ChamadoParaTrocaDoAtivo = {
  numero: 1040,
  situacao: 'em-atendimento',
  locais: [JUNDIAI],
  semLocal: false,
  versao: 2,
  ativo: null,
  localDaPessoa: JUNDIAI,
};
/** O #1038, com a impressora da Sala Atlântico, em atendimento com Renato. */
const COM_RENATO: ChamadoParaTrocaDoAtivo = {
  ...SEM_ATIVO,
  numero: 1038,
  locais: [JUNDIAI, SALA_ATLANTICO],
  ativo: IMPRESSORA_DA_SALA.id,
};
/** O #1043, com a impressora de Campinas, já ligada. */
const COM_A_DE_CAMPINAS: ChamadoParaTrocaDoAtivo = {
  ...SEM_ATIVO,
  numero: 1043,
  locais: [JUNDIAI, CAMPINAS],
  ativo: IMPRESSORA_DE_CAMPINAS.id,
};

describe('recusaDaEdicao', () => {
  it('quem atende os locais muda o chamado aberto', () => {
    expect(recusaDaEdicao(SEM_ATIVO, DIEGO)).toBeNull();
    expect(recusaDaEdicao({ ...SEM_ATIVO, situacao: 'triagem' }, DIEGO)).toBeNull();
    expect(recusaDaEdicao({ ...SEM_ATIVO, situacao: 'aguardando' }, ANA)).toBeNull();
  });

  it('quem não atende os locais é recusado antes do resolvido, pelo primeiro local fora do alcance', () => {
    expect(recusaDaEdicao(COM_A_DE_CAMPINAS, DIEGO)).toEqual({
      motivo: 'voce-nao-atende',
      local: 'Campinas',
    });
    expect(recusaDaEdicao({ ...COM_A_DE_CAMPINAS, situacao: 'resolvido' }, DIEGO)).toEqual({
      motivo: 'voce-nao-atende',
      local: 'Campinas',
    });
    expect(recusaDaEdicao({ ...SEM_ATIVO, semLocal: true }, DIEGO)).toEqual({
      motivo: 'voce-nao-atende',
      local: null,
    });
  });

  it('o chamado resolvido não muda', () => {
    expect(recusaDaEdicao({ ...SEM_ATIVO, situacao: 'resolvido' }, ANA)).toEqual({
      motivo: 'resolvido',
    });
  });
});

describe('decidirTrocaDoAtivo', () => {
  it('Ativo de outro local: os locais passam a ser o da pessoa na abertura e o do ativo', () => {
    expect(
      decidirTrocaDoAtivo(SEM_ATIVO, ANA, ANA_QUE_ATENDE, { ativo: IMPRESSORA_DE_CAMPINAS }),
    ).toEqual({
      aceita: true,
      muda: true,
      locais: [JUNDIAI, CAMPINAS],
      semLocal: false,
      evento: { evento: 'ativo', dados: { antes: null, depois: IMPRESSORA_DE_CAMPINAS.id } },
    });
  });

  it('trocar refaz os locais pelo da pessoa, e o local do ativo de antes sai', () => {
    expect(
      decidirTrocaDoAtivo(COM_A_DE_CAMPINAS, ANA, ANA_QUE_ATENDE, {
        ativo: IMPRESSORA_DA_SALA,
        versao: 2,
      }),
    ).toEqual({
      aceita: true,
      muda: true,
      locais: [JUNDIAI, SALA_ATLANTICO],
      semLocal: false,
      evento: {
        evento: 'ativo',
        dados: { antes: IMPRESSORA_DE_CAMPINAS.id, depois: IMPRESSORA_DA_SALA.id },
      },
    });
  });

  it('tirar deixa só o local da pessoa na abertura, que não se repete com o do ativo', () => {
    expect(decidirTrocaDoAtivo(COM_A_DE_CAMPINAS, ANA, ANA_QUE_ATENDE, { ativo: null })).toEqual({
      aceita: true,
      muda: true,
      locais: [JUNDIAI],
      semLocal: false,
      evento: { evento: 'ativo', dados: { antes: IMPRESSORA_DE_CAMPINAS.id, depois: null } },
    });
    // O ativo do mesmo local da pessoa não repete o local.
    const doMesmoLocal = { id: 'ativo-pat-00141', local: JUNDIAI };
    expect(
      decidirTrocaDoAtivo(SEM_ATIVO, ANA, ANA_QUE_ATENDE, { ativo: doMesmoLocal }),
    ).toMatchObject({ locais: [JUNDIAI], semLocal: false });
  });

  it('o ativo sem local e a pessoa sem local deixam o chamado sem local', () => {
    expect(
      decidirTrocaDoAtivo(SEM_ATIVO, ANA, ANA_QUE_ATENDE, { ativo: NOTEBOOK_SEM_LOCAL }),
    ).toMatchObject({ aceita: true, muda: true, locais: [JUNDIAI], semLocal: true });
    const daPessoaSemLocal = { ...COM_A_DE_CAMPINAS, localDaPessoa: null, semLocal: true };
    expect(
      decidirTrocaDoAtivo(daPessoaSemLocal, ANA, ANA_QUE_ATENDE, { ativo: null }),
    ).toMatchObject({ aceita: true, muda: true, locais: [], semLocal: true });
    expect(
      decidirTrocaDoAtivo(daPessoaSemLocal, ANA, ANA_QUE_ATENDE, { ativo: IMPRESSORA_DA_SALA }),
    ).toMatchObject({ locais: [SALA_ATLANTICO], semLocal: true });
  });

  it('o mesmo ativo, e tirar o que não há, não mudam nada', () => {
    expect(
      decidirTrocaDoAtivo(COM_A_DE_CAMPINAS, ANA, ANA_QUE_ATENDE, {
        ativo: IMPRESSORA_DE_CAMPINAS,
      }),
    ).toEqual({ aceita: true, muda: false });
    expect(decidirTrocaDoAtivo(SEM_ATIVO, ANA, ANA_QUE_ATENDE, { ativo: null })).toEqual({
      aceita: true,
      muda: false,
    });
  });

  it('Ativo que tira o chamado de quem atende: Renato não atende o local novo', () => {
    const decisao = decidirTrocaDoAtivo(COM_RENATO, ANA, RENATO, {
      ativo: IMPRESSORA_DE_CAMPINAS,
    });
    expect(decisao).toEqual({
      aceita: false,
      recusa: { motivo: 'nao-atende', nome: 'Renato Alves', local: 'Campinas' },
    });
    if (decisao.aceita) return;
    expect(mensagemDaRecusaDaTrocaDoAtivo(1038, decisao.recusa)).toBe(
      'Renato não atende os chamados de Campinas. Passe o chamado antes de trocar o ativo.',
    );
    // O ativo do ramo dele é aceito.
    expect(
      decidirTrocaDoAtivo(COM_RENATO, ANA, RENATO, { ativo: { id: 'pat-2', local: JUNDIAI } }),
    ).toMatchObject({ aceita: true, muda: true, locais: [JUNDIAI] });
  });

  it('quem atende inativo também é recusado, pelo primeiro local do chamado', () => {
    expect(
      decidirTrocaDoAtivo(
        COM_RENATO,
        ANA,
        { ...RENATO, ativa: false, alcance: null },
        {
          ativo: null,
        },
      ),
    ).toEqual({
      aceita: false,
      recusa: { motivo: 'nao-atende', nome: 'Renato Alves', local: 'Jundiaí' },
    });
  });

  it('o chamado sem local fica fora de quem atende um ramo: a organização inteira', () => {
    expect(decidirTrocaDoAtivo(COM_RENATO, ANA, RENATO, { ativo: NOTEBOOK_SEM_LOCAL })).toEqual({
      aceita: false,
      recusa: { motivo: 'nao-atende', nome: 'Renato Alves', local: null },
    });
  });

  it('na triagem, sem ninguém, só quem age confere os locais novos', () => {
    expect(
      decidirTrocaDoAtivo({ ...SEM_ATIVO, situacao: 'triagem' }, ANA, null, {
        ativo: IMPRESSORA_DE_CAMPINAS,
      }),
    ).toMatchObject({ aceita: true, muda: true, locais: [JUNDIAI, CAMPINAS] });
  });

  it('quem age precisa atender os locais de agora e os novos', () => {
    // Diego atende Jundiaí, mas não Campinas, do ativo de agora.
    expect(
      decidirTrocaDoAtivo(COM_A_DE_CAMPINAS, DIEGO, RENATO, { ativo: IMPRESSORA_DA_SALA }),
    ).toEqual({ aceita: false, recusa: { motivo: 'voce-nao-atende', local: 'Campinas' } });
    // Nem Campinas, do ativo novo: a recusa vem antes da de quem atende.
    expect(
      decidirTrocaDoAtivo(COM_RENATO, DIEGO, RENATO, { ativo: IMPRESSORA_DE_CAMPINAS }),
    ).toEqual({ aceita: false, recusa: { motivo: 'voce-nao-atende', local: 'Campinas' } });
  });

  it('o resolvido é recusado depois de quem age, e o mesmo ativo também, porque a recusa vem antes', () => {
    const resolvido = { ...COM_A_DE_CAMPINAS, situacao: 'resolvido' as const };
    expect(
      decidirTrocaDoAtivo(resolvido, ANA, ANA_QUE_ATENDE, { ativo: IMPRESSORA_DE_CAMPINAS }),
    ).toEqual({ aceita: false, recusa: { motivo: 'resolvido' } });
    expect(decidirTrocaDoAtivo(resolvido, DIEGO, null, { ativo: null })).toEqual({
      aceita: false,
      recusa: { motivo: 'voce-nao-atende', local: 'Campinas' },
    });
  });

  it('a versão que a tela mandou e o chamado não tem mais é recusada antes de tudo', () => {
    expect(
      decidirTrocaDoAtivo({ ...COM_A_DE_CAMPINAS, situacao: 'resolvido' }, DIEGO, null, {
        ativo: null,
        versao: 1,
      }),
    ).toEqual({ aceita: false, recusa: { motivo: 'versao' } });
    expect(
      decidirTrocaDoAtivo(SEM_ATIVO, ANA, ANA_QUE_ATENDE, {
        ativo: IMPRESSORA_DE_CAMPINAS,
        versao: 2,
      }),
    ).toMatchObject({ aceita: true, muda: true });
  });
});

describe('mensagemDaRecusaDaTrocaDoAtivo', () => {
  it('escreve as frases da spec, com o primeiro nome', () => {
    expect(mensagemDaRecusaDaTrocaDoAtivo(1042, { motivo: 'versao' })).toBe(
      'O chamado #1042 mudou. Confira antes de trocar o ativo.',
    );
    expect(mensagemDaRecusaDaTrocaDoAtivo(1042, { motivo: 'resolvido' })).toBe(
      'O chamado #1042 está resolvido.',
    );
    expect(
      mensagemDaRecusaDaTrocaDoAtivo(1042, { motivo: 'voce-nao-atende', local: 'Campinas' }),
    ).toBe('Você não atende os chamados de Campinas.');
    expect(
      mensagemDaRecusaDaTrocaDoAtivo(1042, {
        motivo: 'nao-atende',
        nome: 'Renato Alves',
        local: null,
      }),
    ).toBe(
      'Renato não atende os chamados da organização inteira. Passe o chamado antes de trocar o ativo.',
    );
  });
});
