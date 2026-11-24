import { describe, expect, it } from 'vitest';
import type { ChamadoParaAcao } from '../chamados/acoes.ts';
import {
  type AcaoDoAndamento,
  acoesDoAndamento,
  atendePeloChat,
  type ChamadoParaAtenderPeloChat,
  type ContaQueAtendePeloChat,
  esperaAConta,
  participaPelaTi,
} from './andamento.ts';

const JUNDIAI = 'local-jundiai';
const CAMPINAS = 'local-campinas';

/** O #1050, de Paulo Nunes, aberto pelo chat por Ana Souza, em Jundiaí. */
const chamado = (extra: Partial<ChamadoParaAtenderPeloChat> = {}): ChamadoParaAtenderPeloChat => ({
  pessoaId: 'pessoa-paulo',
  origem: 'chat',
  abertoPor: 'conta-ana',
  locais: [JUNDIAI],
  semLocal: false,
  ...extra,
});

const conta = (extra: Partial<ContaQueAtendePeloChat> = {}): ContaQueAtendePeloChat => ({
  id: 'conta-ana',
  pessoaId: 'pessoa-ana',
  usaOChat: true,
  alcance: new Set([JUNDIAI]),
  ...extra,
});

const PAULO = conta({ id: 'conta-paulo', pessoaId: 'pessoa-paulo', alcance: null });

describe('Quem atende pelo chat', () => {
  it('quem abriu pelo chat no nome de outra pessoa e atende os locais participa pela TI', () => {
    expect(atendePeloChat(conta(), chamado())).toBe(true);
    expect(participaPelaTi(conta(), chamado())).toBe(true);
  });

  it('a pessoa do chamado que atende os locais atende pelo chat como quem pediu', () => {
    const anaComoPessoa = chamado({ pessoaId: 'pessoa-ana' });
    expect(atendePeloChat(conta(), anaComoPessoa)).toBe(true);
    expect(participaPelaTi(conta(), anaComoPessoa)).toBe(false);
    // Também no chamado que a TI abriu para ela.
    const pelaTiParaAna = chamado({
      pessoaId: 'pessoa-ana',
      origem: 'ti',
      abertoPor: 'conta-bruno',
    });
    expect(atendePeloChat(conta(), pelaTiParaAna)).toBe(true);
    expect(participaPelaTi(conta(), pelaTiParaAna)).toBe(false);
  });

  it('quem só pediu não atende pelo chat', () => {
    expect(atendePeloChat(PAULO, chamado())).toBe(false);
    expect(participaPelaTi(PAULO, chamado())).toBe(false);
  });

  it('quem participa e não atende todos os locais não atende pelo chat', () => {
    const doisLocais = chamado({ locais: [JUNDIAI, CAMPINAS] });
    expect(atendePeloChat(conta(), doisLocais)).toBe(false);
    expect(participaPelaTi(conta(), doisLocais)).toBe(false);
    expect(atendePeloChat(conta({ alcance: new Set([CAMPINAS]) }), chamado())).toBe(false);
    expect(atendePeloChat(conta({ alcance: 'organizacao' }), doisLocais)).toBe(true);
  });

  it('o chamado sem local, só quem atende a organização inteira', () => {
    const semLocal = chamado({ locais: [], semLocal: true });
    expect(participaPelaTi(conta(), semLocal)).toBe(false);
    expect(participaPelaTi(conta({ alcance: 'organizacao' }), semLocal)).toBe(true);
  });

  it('quem atende sem participar segue pelo Chamados', () => {
    const bruno = conta({ id: 'conta-bruno', pessoaId: 'pessoa-bruno', alcance: 'organizacao' });
    expect(atendePeloChat(bruno, chamado())).toBe(false);
    expect(participaPelaTi(bruno, chamado())).toBe(false);
  });

  it('quem abriu o chamado pela TI não participa dele por isso', () => {
    const pelaTi = chamado({ origem: 'ti' });
    expect(atendePeloChat(conta(), pelaTi)).toBe(false);
    expect(participaPelaTi(conta(), pelaTi)).toBe(false);
  });

  it('quem não usa o chat não atende pelo chat', () => {
    expect(atendePeloChat(conta({ usaOChat: false }), chamado())).toBe(false);
    expect(participaPelaTi(conta({ usaOChat: false }), chamado())).toBe(false);
  });
});

describe('A espera do chamado é da conta', () => {
  it('de quem participa e não pela TI', () => {
    // A pessoa do chamado.
    expect(esperaAConta(PAULO, chamado())).toBe(true);
    // Quem o abriu pelo chat e atende: a espera é da pessoa.
    expect(esperaAConta(conta(), chamado())).toBe(false);
    // Quem o abriu pelo chat e não atende os locais participa como quem pediu.
    expect(esperaAConta(conta({ alcance: new Set([CAMPINAS]) }), chamado())).toBe(true);
    // Quem não participa.
    const bruno = conta({ id: 'conta-bruno', pessoaId: 'pessoa-bruno', alcance: 'organizacao' });
    expect(esperaAConta(bruno, chamado())).toBe(false);
  });
});

/** O chamado como o menu o lê: a situação, quem atende e se ele fechou. */
const noMenu = (
  situacao: ChamadoParaAcao['situacao'],
  responsavel: string | null = null,
  fechado = false,
): Pick<ChamadoParaAcao, 'situacao' | 'responsavel' | 'fechado'> => ({
  situacao,
  responsavel,
  fechado,
});

const ANA_PELA_TI = { id: 'conta-ana', pelaTi: true };
const ANA_COMO_PESSOA = { id: 'conta-ana', pelaTi: false };

describe('Ações do andamento', () => {
  it('na triagem: assumir, passar, aguardar e resolver, na ordem do menu', () => {
    expect(acoesDoAndamento(noMenu('triagem'), ANA_PELA_TI)).toEqual<AcaoDoAndamento[]>([
      'assumir',
      'passar',
      'esperar',
      'resolver',
    ]);
  });

  it('em atendimento com outra conta: também devolver à triagem', () => {
    expect(acoesDoAndamento(noMenu('em-atendimento', 'conta-diego'), ANA_PELA_TI)).toEqual<
      AcaoDoAndamento[]
    >(['assumir', 'passar', 'devolver', 'esperar', 'resolver']);
  });

  it('o chamado que já está com a conta não tem o assumir', () => {
    expect(acoesDoAndamento(noMenu('em-atendimento', 'conta-ana'), ANA_PELA_TI)).toEqual<
      AcaoDoAndamento[]
    >(['passar', 'devolver', 'esperar', 'resolver']);
    expect(acoesDoAndamento(noMenu('aguardando', 'conta-ana'), ANA_PELA_TI)).toEqual<
      AcaoDoAndamento[]
    >(['passar', 'retomar', 'resolver']);
  });

  it('no aguardando: retomar, sem aguardar de novo e sem devolver', () => {
    expect(acoesDoAndamento(noMenu('aguardando', 'conta-diego'), ANA_PELA_TI)).toEqual<
      AcaoDoAndamento[]
    >(['assumir', 'passar', 'retomar', 'resolver']);
  });

  it('no resolvido: só reabrir, a quem participa pela TI', () => {
    expect(acoesDoAndamento(noMenu('resolvido', 'conta-diego'), ANA_PELA_TI)).toEqual<
      AcaoDoAndamento[]
    >(['reabrir']);
    expect(acoesDoAndamento(noMenu('resolvido', 'conta-diego'), ANA_COMO_PESSOA)).toEqual([]);
  });

  it('a pessoa do chamado que atende não aguarda a si mesma', () => {
    expect(acoesDoAndamento(noMenu('triagem'), ANA_COMO_PESSOA)).toEqual<AcaoDoAndamento[]>([
      'assumir',
      'passar',
      'resolver',
    ]);
    expect(acoesDoAndamento(noMenu('em-atendimento', 'conta-diego'), ANA_COMO_PESSOA)).toEqual<
      AcaoDoAndamento[]
    >(['assumir', 'passar', 'devolver', 'resolver']);
  });

  it('o fechado não tem nenhuma', () => {
    expect(acoesDoAndamento(noMenu('resolvido', 'conta-diego', true), ANA_PELA_TI)).toEqual([]);
    expect(acoesDoAndamento(noMenu('resolvido', 'conta-diego', true), ANA_COMO_PESSOA)).toEqual([]);
  });
});
