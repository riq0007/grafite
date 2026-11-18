import { describe, expect, it } from 'vitest';
import type { FichaDoChamado } from '../consultas.ts';
import { acoesDoAtivo, contatosDaPessoa, linhasDoEstoque, textoDasOrdens } from './lado.ts';

type Ativo = NonNullable<FichaDoChamado['ativo']>;
type Compativel = NonNullable<NonNullable<Ativo['resumo']>['compativeis']>[number];

const IMPRESSORA: Ativo = {
  id: '0190a000-0000-7000-8000-000000000139',
  rotulo: 'HP LaserJet M404',
  patrimonio: 'PAT-00139',
  local: 'Jundiaí › Recepção',
  abrir: true,
  tipo: { nome: 'Impressora', icone: 'impressora' },
  usaConsumiveis: true,
  resumo: null,
};

const FICHA = {
  situacao: 'em-atendimento',
  permite: { atender: true },
  ativo: IMPRESSORA,
  os: null,
  solicitacao: null,
} satisfies Parameters<typeof acoesDoAtivo>[0];

const TUDO = { operacaoLigada: true, pode: () => true };

describe('as ações do ativo (spec modulo-chamados, "Chamado aberto")', () => {
  it('quem atende o chamado da impressora vira OS, pede toner e troca o ativo', () => {
    expect(acoesDoAtivo(FICHA, TUDO)).toEqual({
      virarOs: true,
      pedirToner: true,
      trocar: 'trocar',
    });
  });

  it('sem o ativo, só liga um', () => {
    expect(acoesDoAtivo({ ...FICHA, ativo: null }, TUDO)).toEqual({
      virarOs: false,
      pedirToner: false,
      trocar: 'ligar',
    });
  });

  it('quem não vê os ativos não liga um, mas ainda tira o ligado', () => {
    const semAtivos = { ...TUDO, pode: (chave: string) => chave !== 'ativos.ver' };
    expect(acoesDoAtivo({ ...FICHA, ativo: null }, semAtivos).trocar).toBeNull();
    expect(acoesDoAtivo(FICHA, semAtivos).trocar).toBe('trocar');
  });

  it('quem só vê o chamado e o chamado resolvido não têm nenhuma', () => {
    const nenhuma = { virarOs: false, pedirToner: false, trocar: null };
    expect(acoesDoAtivo({ ...FICHA, permite: { atender: false } }, TUDO)).toEqual(nenhuma);
    expect(acoesDoAtivo({ ...FICHA, situacao: 'resolvido' }, TUDO)).toEqual(nenhuma);
  });

  it('o aguardando e a triagem ainda têm as ações', () => {
    expect(acoesDoAtivo({ ...FICHA, situacao: 'aguardando' }, TUDO).pedirToner).toBe(true);
    expect(acoesDoAtivo({ ...FICHA, situacao: 'triagem' }, TUDO).virarOs).toBe(true);
  });

  it('com o Operação desligado, só troca o ativo', () => {
    expect(acoesDoAtivo(FICHA, { ...TUDO, operacaoLigada: false })).toEqual({
      virarOs: false,
      pedirToner: false,
      trocar: 'trocar',
    });
  });

  it('a OS que o chamado tem tira o virar OS, e a solicitação, o pedir toner', () => {
    const os = {
      id: '0190a000-0000-7000-8000-000000000013',
      numero: 13,
      situacao: 'aberta',
    } as const;
    const solicitacao = {
      id: '0190a000-0000-7000-8000-000000000004',
      numero: 4,
      situacao: 'aberta',
    } as const;
    expect(acoesDoAtivo({ ...FICHA, os }, TUDO)).toMatchObject({
      virarOs: false,
      pedirToner: true,
    });
    expect(acoesDoAtivo({ ...FICHA, solicitacao }, TUDO)).toMatchObject({
      virarOs: true,
      pedirToner: false,
    });
  });

  it('pedir toner pede a impressora que usa consumíveis, a ficha dela e as solicitações', () => {
    const semConsumiveis = { ...IMPRESSORA, usaConsumiveis: false };
    expect(acoesDoAtivo({ ...FICHA, ativo: semConsumiveis }, TUDO).pedirToner).toBe(false);
    // Quem não vê o ativo no local dele não registra a solicitação: a impressora é recusada.
    const semAFicha = { ...IMPRESSORA, abrir: false };
    expect(acoesDoAtivo({ ...FICHA, ativo: semAFicha }, TUDO).pedirToner).toBe(false);
    const semSolicitacoes = { ...TUDO, pode: (chave: string) => chave !== 'solicitacoes.atender' };
    expect(acoesDoAtivo(FICHA, semSolicitacoes)).toEqual({
      virarOs: true,
      pedirToner: false,
      trocar: 'trocar',
    });
  });
});

describe('os contatos da pessoa', () => {
  it('a quem não vê a pessoa, e na anonimizada, a ficha não traz os contatos', () => {
    expect(contatosDaPessoa({ contatos: null })).toBeNull();
  });

  it('o e-mail e o telefone, em links', () => {
    expect(
      contatosDaPessoa({
        contatos: { email: 'marina.rocha@empresa.com.br', telefone: '(11) 4521-0139' },
      }),
    ).toEqual([
      {
        rotulo: 'E-mail',
        texto: 'marina.rocha@empresa.com.br',
        endereco: 'mailto:marina.rocha@empresa.com.br',
      },
      { rotulo: 'Telefone', texto: '(11) 4521-0139', endereco: 'tel:1145210139' },
    ]);
  });

  it('o telefone com o código do país fica com o "+", e o que falta não aparece', () => {
    expect(contatosDaPessoa({ contatos: { email: null, telefone: '+55 11 4521-0139' } })).toEqual([
      { rotulo: 'Telefone', texto: '+55 11 4521-0139', endereco: 'tel:+551145210139' },
    ]);
    expect(contatosDaPessoa({ contatos: { email: null, telefone: null } })).toEqual([]);
  });
});

describe('as OS do ativo no ano', () => {
  it('as concluídas e as abertas, como no m04', () => {
    expect(textoDasOrdens({ abertas: 0, concluidas: 2 })).toBe('2 concluídas, nenhuma aberta');
    expect(textoDasOrdens({ abertas: 1, concluidas: 1 })).toBe('1 concluída, 1 aberta');
    expect(textoDasOrdens({ abertas: 3, concluidas: 0 })).toBe('nenhuma concluída, 3 abertas');
  });
});

const compativel = (mudanca: Partial<Compativel>): Compativel => ({
  id: '0190a000-0000-7000-8000-000000000258',
  codigo: 'CF258A',
  nome: 'Toner preto',
  tipo: 'toner',
  cor: 'preto',
  rendimento: 3000,
  saldo: 3,
  minimo: 6,
  abaixo: true,
  ...mudanca,
});

describe('o estoque e a solicitação pendente', () => {
  const COM_O_BOTAO = { pedirToner: true, solicitacaoDoChamado: null };

  it('a quem não vê o estoque nem as solicitações, nada', () => {
    expect(linhasDoEstoque({ compativeis: null, solicitacao: null }, COM_O_BOTAO)).toBeNull();
    expect(linhasDoEstoque({ compativeis: [], solicitacao: null }, COM_O_BOTAO)).toBeNull();
  });

  it('o saldo e o mínimo de cada compatível com cor, com a atenção no abaixo, como no m04', () => {
    expect(
      linhasDoEstoque({ compativeis: [compativel({})], solicitacao: null }, COM_O_BOTAO),
    ).toEqual({
      linhas: ['CF258A: 3 de 6, abaixo do mínimo.'],
      atencao: true,
    });
    expect(
      linhasDoEstoque(
        { compativeis: [compativel({ saldo: 1200, minimo: 6, abaixo: false })], solicitacao: null },
        COM_O_BOTAO,
      ),
    ).toEqual({ linhas: ['CF258A: 1.200 de 6.'], atencao: false });
  });

  it('a soma acima do mínimo com um local abaixo, o mínimo zero e o compatível sem cor', () => {
    expect(
      linhasDoEstoque(
        {
          compativeis: [
            compativel({ saldo: 12, minimo: 4, abaixo: true }),
            compativel({ codigo: 'CF259A', saldo: 2, minimo: 0, abaixo: false }),
            compativel({ codigo: 'CF232A', tipo: 'cilindro', cor: null, saldo: 0, minimo: 2 }),
          ],
          solicitacao: null,
        },
        COM_O_BOTAO,
      ),
    ).toEqual({
      linhas: ['CF258A: 12 de 4, abaixo do mínimo num dos locais.', 'CF259A: 2 no estoque.'],
      atencao: true,
    });
  });

  const solicitacao = {
    id: '0190a000-0000-7000-8000-000000000004',
    numero: 4,
    situacao: 'aberta',
  } as const;

  it('a solicitação pendente, com o “Pedir toner” só quando o botão aparece', () => {
    expect(linhasDoEstoque({ compativeis: [compativel({})], solicitacao }, COM_O_BOTAO)).toEqual({
      linhas: [
        'CF258A: 3 de 6, abaixo do mínimo.',
        'A solicitação 4 está aberta; “Pedir toner” se junta a ela.',
      ],
      atencao: true,
    });
    expect(
      linhasDoEstoque(
        { compativeis: null, solicitacao: { ...solicitacao, situacao: 'em-atendimento' } },
        { pedirToner: false, solicitacaoDoChamado: null },
      ),
    ).toEqual({ linhas: ['A solicitação 4 está em atendimento.'], atencao: false });
  });

  it('a pendente que já é a do chamado fica só na lista do chamado', () => {
    const doChamado = { pedirToner: false, solicitacaoDoChamado: solicitacao.id };
    expect(linhasDoEstoque({ compativeis: [compativel({})], solicitacao }, doChamado)).toEqual({
      linhas: ['CF258A: 3 de 6, abaixo do mínimo.'],
      atencao: true,
    });
    expect(linhasDoEstoque({ compativeis: null, solicitacao }, doChamado)).toBeNull();
    // A pendente de outro chamado da impressora continua, sem o "se junta".
    const outra = {
      pedirToner: false,
      solicitacaoDoChamado: '0190a000-0000-7000-8000-000000000003',
    };
    expect(linhasDoEstoque({ compativeis: null, solicitacao }, outra)).toEqual({
      linhas: ['A solicitação 4 está aberta.'],
      atencao: false,
    });
  });
});
