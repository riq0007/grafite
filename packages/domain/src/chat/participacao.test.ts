import { describe, expect, it } from 'vitest';
import { type Acesso, type AtribuicaoParaAcesso, resolverAcesso } from '../acesso/acesso.ts';
import type { Permissao } from '../acesso/permissoes.ts';
import {
  type ContaDaDireta,
  type ContaNoChat,
  type ConversaParaParticipar,
  daTi,
  mensagemDaRecusaDaEscrita,
  nomeDaConversa,
  nomeNoChat,
  participacao,
  participaDoChamado,
  TIPOS_DE_CONVERSA,
  usaOChat,
} from './participacao.ts';

/** O acesso com cada permissão na organização inteira (`true`) ou nos ramos dados. */
function acessoCom(permissoes: Partial<Record<Permissao, true | string[]>>): Acesso {
  return {
    permissoes: new Map(
      Object.entries(permissoes).map(([chave, alcance]) => [
        chave as Permissao,
        alcance === true
          ? { organizacao: true, locais: new Set<string>() }
          : { organizacao: false, locais: new Set(alcance) },
      ]),
    ),
    exigeDoisPassos: false,
    perfisQueExigem: [],
    origens: new Map(),
    prazosDosPerfis: [],
  };
}

const COLABORADOR = acessoCom({ 'chat.usar': true, 'chamados.pedir': true });

const conta = (id: string, extra: Partial<ContaNoChat> = {}): ContaNoChat => ({
  id,
  pessoaId: `pessoa-${id}`,
  usaOChat: true,
  grupos: [],
  ...extra,
});

const fernanda = conta('fernanda');
const paulo = conta('paulo', { grupos: ['financeiro'] });
const ana = conta('ana', { grupos: ['ti'] });

const naDireta = (de: ContaNoChat, nome: string, extra: Partial<ContaDaDireta> = {}) => ({
  id: de.id,
  nome,
  usaOChat: de.usaOChat,
  daTi: false,
  ...extra,
});

const direta = (
  a: ContaDaDireta,
  b: ContaDaDireta,
): Extract<ConversaParaParticipar, { tipo: 'direta' }> => ({ tipo: 'direta', contas: [a, b] });

const FINANCEIRO = { id: 'financeiro', nome: 'Financeiro', ativo: true };
const TI = { id: 'ti', nome: 'TI', ativo: true };

const equipeFinanceiro = (
  extra: Partial<Extract<ConversaParaParticipar, { tipo: 'equipe' }>> = {},
): ConversaParaParticipar => ({
  tipo: 'equipe',
  nome: 'Equipe Financeiro',
  grupo: FINANCEIRO,
  escreve: null,
  arquivada: false,
  ...extra,
});

const avisosDaTi = (
  extra: Partial<Extract<ConversaParaParticipar, { tipo: 'canal' }>> = {},
): ConversaParaParticipar => ({
  tipo: 'canal',
  nome: 'Avisos da TI',
  escreve: TI,
  arquivada: false,
  ...extra,
});

describe('quem usa o chat', () => {
  const ativa = { situacao: 'ativa' as const, acesso: COLABORADOR, chatLigado: true };

  it('usa o chat a conta ativa com chat.usar, com o módulo Chat ligado', () => {
    expect(usaOChat(ativa)).toBe(true);
  });

  it('não usa o chat sem chat.usar, com o módulo desligado ou com a conta inativa ou anonimizada', () => {
    expect(usaOChat({ ...ativa, acesso: acessoCom({ 'chamados.pedir': true }) })).toBe(false);
    expect(usaOChat({ ...ativa, chatLigado: false })).toBe(false);
    expect(usaOChat({ ...ativa, situacao: 'inativa' })).toBe(false);
    expect(usaOChat({ ...ativa, situacao: 'anonimizada' })).toBe(false);
  });

  it('o perfil com chat.usar atribuído num local não dá o chat, porque a permissão é da organização', () => {
    const perfil = {
      id: 'colaborador',
      nome: 'Colaborador',
      situacao: 'ativo' as const,
      permissoes: ['chat.usar'],
      todasAsPermissoes: false,
      exigeDoisPassos: false,
    };
    const atribuicao = (localId: string | null): AtribuicaoParaAcesso => ({
      id: `atribuicao-${localId ?? 'organizacao'}`,
      perfil,
      localId,
      encerrada: false,
      origem: { tipo: 'conta' },
    });
    const noLocal = resolverAcesso([atribuicao('jundiai')]);
    const naOrganizacao = resolverAcesso([atribuicao(null)]);
    expect(usaOChat({ ...ativa, acesso: noLocal })).toBe(false);
    expect(usaOChat({ ...ativa, acesso: naOrganizacao })).toBe(true);
  });

  it('os tipos de conversa, com os textos do banco', () => {
    expect(TIPOS_DE_CONVERSA).toEqual(['direta', 'equipe', 'canal']);
  });
});

describe('quem participa', () => {
  describe('da conversa direta', () => {
    const fernandaEPaulo = direta(
      naDireta(fernanda, 'Fernanda Rocha'),
      naDireta(paulo, 'Paulo Nunes'),
    );

    it('participam as duas contas, que leem e escrevem', () => {
      expect(participacao(fernanda, fernandaEPaulo)).toEqual({ participa: true, escreve: true });
      expect(participacao(paulo, fernandaEPaulo)).toEqual({ participa: true, escreve: true });
    });

    it('a conversa de outros não é de quem pede', () => {
      expect(participacao(ana, fernandaEPaulo)).toEqual({ participa: false });
    });

    it('a conta do par que não usa mais o chat sai da conversa', () => {
      expect(participacao({ ...paulo, usaOChat: false }, fernandaEPaulo)).toEqual({
        participa: false,
      });
    });

    it('quando a outra não usa mais o chat, a conversa fica só para ler, com o nome dela', () => {
      const semPaulo = direta(
        naDireta(fernanda, 'Fernanda Rocha'),
        naDireta(paulo, 'Paulo Nunes', { usaOChat: false }),
      );
      const fica = participacao(fernanda, semPaulo);
      expect(fica).toEqual({
        participa: true,
        escreve: false,
        recusa: { motivo: 'nao-usa-mais', nome: 'Paulo Nunes' },
      });
      expect(fica.participa && !fica.escreve && mensagemDaRecusaDaEscrita(fica.recusa)).toBe(
        'Paulo Nunes não usa mais o chat.',
      );
    });

    it('a frase leva o nome sem o "(TI)" de quem atendia', () => {
      const semAna = direta(
        naDireta(fernanda, 'Fernanda Rocha'),
        naDireta(ana, 'Ana Souza', { usaOChat: false, daTi: true }),
      );
      const fica = participacao(fernanda, semAna);
      expect(fica.participa && !fica.escreve && mensagemDaRecusaDaEscrita(fica.recusa)).toBe(
        'Ana Souza não usa mais o chat.',
      );
    });
  });

  describe('da equipe', () => {
    it('participa quem é do grupo dela agora e usa o chat', () => {
      expect(participacao(paulo, equipeFinanceiro())).toEqual({ participa: true, escreve: true });
      expect(participacao(fernanda, equipeFinanceiro())).toEqual({ participa: false });
    });

    it('Entra no grupo: quem entra passa a participar, e quem sai deixa de participar', () => {
      const tatiana = conta('tatiana');
      expect(participacao(tatiana, equipeFinanceiro())).toEqual({ participa: false });
      expect(participacao({ ...tatiana, grupos: ['financeiro'] }, equipeFinanceiro())).toEqual({
        participa: true,
        escreve: true,
      });
      expect(participacao({ ...paulo, grupos: [] }, equipeFinanceiro())).toEqual({
        participa: false,
      });
    });

    it('quem é do grupo e não usa o chat não participa', () => {
      expect(participacao({ ...paulo, usaOChat: false }, equipeFinanceiro())).toEqual({
        participa: false,
      });
    });

    it('com o grupo inativo, a equipe fica sem ninguém', () => {
      const inativo = equipeFinanceiro({ grupo: { ...FINANCEIRO, ativo: false } });
      expect(participacao(paulo, inativo)).toEqual({ participa: false });
    });
  });

  describe('do canal', () => {
    it('participam todas as contas que usam o chat', () => {
      const geral = avisosDaTi({ nome: 'Geral', escreve: null });
      expect(participacao(fernanda, geral)).toEqual({ participa: true, escreve: true });
      expect(participacao(paulo, geral)).toEqual({ participa: true, escreve: true });
      expect(participacao({ ...fernanda, usaOChat: false }, geral)).toEqual({ participa: false });
    });
  });

  describe('a arquivada, só para ler', () => {
    it('Equipe arquivada: quem participaria lê, e a mensagem é recusada', () => {
      const arquivada = participacao(paulo, equipeFinanceiro({ arquivada: true }));
      expect(arquivada).toEqual({
        participa: true,
        escreve: false,
        recusa: { motivo: 'arquivada', tipo: 'equipe', nome: 'Equipe Financeiro' },
      });
      expect(
        arquivada.participa && !arquivada.escreve && mensagemDaRecusaDaEscrita(arquivada.recusa),
      ).toBe('A equipe Equipe Financeiro está arquivada.');
      expect(participacao(fernanda, equipeFinanceiro({ arquivada: true }))).toEqual({
        participa: false,
      });
    });

    it('o canal arquivado fica só para ler, e o arquivado vem antes de quem escreve', () => {
      const arquivado = participacao(fernanda, avisosDaTi({ nome: 'Avisos', arquivada: true }));
      expect(
        arquivado.participa && !arquivado.escreve && mensagemDaRecusaDaEscrita(arquivado.recusa),
      ).toBe('O canal Avisos está arquivado.');
    });
  });

  describe('quem escreve', () => {
    it('Quem não escreve no canal: só as contas do grupo que escreve, com "Só TI escreve neste canal."', () => {
      expect(participacao(ana, avisosDaTi())).toEqual({ participa: true, escreve: true });
      const fica = participacao(fernanda, avisosDaTi());
      expect(fica).toEqual({
        participa: true,
        escreve: false,
        recusa: { motivo: 'so-o-grupo', tipo: 'canal', grupo: 'TI' },
      });
      expect(fica.participa && !fica.escreve && mensagemDaRecusaDaEscrita(fica.recusa)).toBe(
        'Só TI escreve neste canal.',
      );
    });

    it('na equipe, a frase diz "nesta equipe"', () => {
      const gestores = { id: 'gestores', nome: 'Gestores', ativo: true };
      const fica = participacao(paulo, equipeFinanceiro({ escreve: gestores }));
      expect(fica.participa && !fica.escreve && mensagemDaRecusaDaEscrita(fica.recusa)).toBe(
        'Só Gestores escreve nesta equipe.',
      );
      expect(
        participacao(
          { ...paulo, grupos: ['financeiro', 'gestores'] },
          equipeFinanceiro({ escreve: gestores }),
        ),
      ).toEqual({ participa: true, escreve: true });
    });

    it('com o grupo que escreve inativo, ninguém escreve', () => {
      const fica = participacao(ana, avisosDaTi({ escreve: { ...TI, ativo: false } }));
      expect(fica.participa && !fica.escreve && mensagemDaRecusaDaEscrita(fica.recusa)).toBe(
        'Só TI escreve neste canal.',
      );
    });
  });
});

describe('o "(TI)"', () => {
  it('é da TI quem tem chamados.atender em algum local ou na organização', () => {
    expect(daTi(acessoCom({ 'chamados.atender': ['jundiai'] }))).toBe(true);
    expect(daTi(acessoCom({ 'chamados.atender': true }))).toBe(true);
    expect(daTi(acessoCom({ 'chamados.ver': true, 'chamados.configurar': true }))).toBe(false);
    expect(daTi(COLABORADOR)).toBe(false);
  });

  it('vai depois do nome de quem é da TI', () => {
    expect(nomeNoChat('Ana Souza', true)).toBe('Ana Souza (TI)');
    expect(nomeNoChat('Fernanda Rocha', false)).toBe('Fernanda Rocha');
  });

  it('Conta da TI no chat: a direta se chama pelo nome da outra, com o "(TI)"', () => {
    const fernandaEAna = direta(
      naDireta(fernanda, 'Fernanda Rocha'),
      naDireta(ana, 'Ana Souza', { daTi: true }),
    );
    expect(nomeDaConversa(fernanda.id, fernandaEAna)).toBe('Ana Souza (TI)');
    expect(nomeDaConversa(ana.id, fernandaEAna)).toBe('Fernanda Rocha');
  });

  it('a equipe e o canal se chamam pelo nome deles', () => {
    expect(nomeDaConversa(paulo.id, equipeFinanceiro())).toBe('Equipe Financeiro');
    expect(nomeDaConversa(ana.id, avisosDaTi())).toBe('Avisos da TI');
  });
});

describe('quem participa do chamado', () => {
  const doChamado = (extra: Partial<Parameters<typeof participaDoChamado>[1]> = {}) => ({
    pessoaId: fernanda.pessoaId,
    origem: 'chat' as const,
    abertoPor: fernanda.id,
    ...extra,
  });

  it('participa a conta da pessoa do chamado, aberto pela TI ou pelo chat', () => {
    expect(participaDoChamado(fernanda, doChamado())).toBe(true);
    expect(participaDoChamado(fernanda, doChamado({ origem: 'ti', abertoPor: ana.id }))).toBe(true);
  });

  it('na origem chat, participa também quem abriu para outra pessoa', () => {
    const paraPaulo = doChamado({ pessoaId: paulo.pessoaId });
    expect(participaDoChamado(fernanda, paraPaulo)).toBe(true);
    expect(participaDoChamado(paulo, paraPaulo)).toBe(true);
  });

  it('quem abriu pela TI não participa por ter aberto: a TI vê pelas permissões', () => {
    expect(participaDoChamado(ana, doChamado({ origem: 'ti', abertoPor: ana.id }))).toBe(false);
  });

  it('a conta de outra pessoa não participa', () => {
    expect(participaDoChamado(paulo, doChamado())).toBe(false);
  });

  it('quem não usa o chat não participa, nem a pessoa, nem quem abriu', () => {
    const semChat = { ...fernanda, usaOChat: false };
    expect(participaDoChamado(semChat, doChamado())).toBe(false);
    expect(participaDoChamado(semChat, doChamado({ pessoaId: paulo.pessoaId }))).toBe(false);
  });
});
