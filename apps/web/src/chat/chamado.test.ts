// O chamado no chat de quem participa (spec modulo-chat, "Chamado no chat"; spec chamados, "Leitura
// do chamado pela pessoa", "Resposta nova" e "Avaliação do atendimento"): a ordem do que a conversa
// mostra, com os dias, a abertura, o separador "Resposta nova" e o quadro da avaliação, a hora das
// etapas e o dia do "Reabrir até".
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import {
  anexosDoChamado,
  type ConversaDoChamado,
  diaDoReabrir,
  type EventoDoChamado,
  horaNaConversa,
  horaNaLista,
  type ItemDoChamadoNaTela,
  itensDoChamado,
  type MensagemDoChamado,
  momentoDaEtapa,
  quandoAs,
  quemEscreveuNaLista,
} from './chamado.ts';

const dataHora = criarDataHora('America/Sao_Paulo');

/** Quarta, 11/11/2026, 11:25 em Brasília. */
const AGORA = new Date('2026-11-11T14:25:00Z');

const id = (n: number) => `0199a6e0-0000-7000-8000-${String(n).padStart(12, '0')}`;

const BRUNO = { nome: 'Bruno Lima', daTi: true, minha: false };
const FERNANDA = { nome: 'Fernanda Rocha', daTi: false, minha: true };

function mensagem(n: number, em: string, autor = BRUNO): MensagemDoChamado {
  return {
    especie: 'mensagem',
    id: id(n),
    em,
    autor,
    texto: `Mensagem ${n}`,
    anexos: [],
    opcoes: null,
    escolhida: null,
    cartao: null,
  };
}

function evento(n: number, em: string, codigo: string, frase = codigo): EventoDoChamado {
  return { especie: 'evento', id: id(n), em, evento: codigo, frase, resumo: null };
}

type Chamado = Pick<
  ConversaDoChamado,
  'conversa' | 'respostaNova' | 'situacao' | 'fechado' | 'pelaTi'
>;

const chamado = (conversa: Chamado['conversa'], resto: Partial<Chamado> = {}): Chamado => ({
  conversa,
  respostaNova: { quantas: 0, desde: null },
  situacao: 'em-atendimento',
  fechado: false,
  pelaTi: false,
  ...resto,
});

/** O que a tela mostra, numa linha por item, para comparar a ordem. */
const emTexto = (itens: ItemDoChamadoNaTela[]) =>
  itens.map((item) => {
    if (item.tipo === 'dia') return `dia ${item.rotulo}`;
    if (item.tipo === 'nova') return 'Resposta nova';
    if (item.tipo === 'abertura') return `abertura ${item.evento?.frase ?? '(sem o evento)'}`;
    if (item.tipo === 'mensagem') return item.mensagem.texto;
    if (item.tipo === 'evento') return `evento ${item.evento.frase}`;
    return 'avaliação';
  });

const naTela = (dados: Chamado) => emTexto(itensDoChamado(dados, { agora: AGORA, dataHora }));

describe('itensDoChamado', () => {
  it('põe o dia antes do primeiro item de cada dia, e a abertura no lugar do evento dela', () => {
    const itens = naTela(
      chamado([
        evento(1, '2026-11-10T20:05:00Z', 'abertura', 'Recebemos o seu chamado'),
        evento(2, '2026-11-10T20:20:00Z', 'assumiu', 'Ana Souza está atendendo o chamado'),
        mensagem(3, '2026-11-10T20:30:00Z', FERNANDA),
        mensagem(4, '2026-11-11T12:21:00Z'),
      ]),
    );
    expect(itens).toEqual([
      'dia Ontem',
      'abertura Recebemos o seu chamado',
      'evento Ana Souza está atendendo o chamado',
      'Mensagem 3',
      'dia Hoje',
      'Mensagem 4',
    ]);
  });

  it('sem o evento da abertura, a abertura fica no começo', () => {
    expect(naTela(chamado([mensagem(4, '2026-11-11T12:21:00Z')]))).toEqual([
      'abertura (sem o evento)',
      'dia Hoje',
      'Mensagem 4',
    ]);
  });

  it('põe "Resposta nova" antes da primeira mensagem dela, depois do dia', () => {
    const conversa = [
      evento(1, '2026-11-10T20:05:00Z', 'abertura', 'Recebemos o seu chamado'),
      mensagem(3, '2026-11-10T20:30:00Z', FERNANDA),
      mensagem(4, '2026-11-11T12:21:00Z'),
      evento(5, '2026-11-11T12:21:30Z', 'aguardando', 'Aguardando você'),
      mensagem(6, '2026-11-11T12:40:00Z'),
    ];
    expect(naTela(chamado(conversa, { respostaNova: { quantas: 2, desde: id(4) } }))).toEqual([
      'dia Ontem',
      'abertura Recebemos o seu chamado',
      'Mensagem 3',
      'dia Hoje',
      'Resposta nova',
      'Mensagem 4',
      'evento Aguardando você',
      'Mensagem 6',
    ]);
    // Sem resposta nova, o separador não aparece, mesmo com o `desde` de antes.
    expect(naTela(chamado(conversa, { respostaNova: { quantas: 0, desde: id(4) } }))).not.toContain(
      'Resposta nova',
    );
  });

  it('a quem participa pela TI, nem a resposta nova nem a avaliação, que a API ainda manda', () => {
    const conversa = [
      evento(1, '2026-11-11T13:32:00Z', 'abertura', 'Você abriu este chamado para Fernanda'),
      mensagem(2, '2026-11-11T13:35:00Z', FERNANDA),
      evento(3, '2026-11-11T13:40:00Z', 'resolveu', 'Você resolveu o chamado'),
    ];
    expect(
      naTela(
        chamado(conversa, {
          situacao: 'resolvido',
          pelaTi: true,
          respostaNova: { quantas: 1, desde: id(2) },
        }),
      ),
    ).toEqual([
      'dia Hoje',
      'abertura Você abriu este chamado para Fernanda',
      'Mensagem 2',
      'evento Você resolveu o chamado',
    ]);
  });

  it('no resolvido, a avaliação vem logo depois do último resolvido, e o evento dela sai', () => {
    const conversa = [
      evento(1, '2026-11-11T13:32:00Z', 'abertura', 'Recebemos o seu chamado'),
      evento(2, '2026-11-11T13:40:00Z', 'resolveu', 'Bruno Lima resolveu o chamado'),
      evento(3, '2026-11-11T13:42:00Z', 'avaliou', 'Você avaliou: Bom · Resolveu'),
      evento(4, '2026-11-11T13:50:00Z', 'reabriu', 'Você reabriu o chamado'),
      mensagem(5, '2026-11-11T14:10:00Z'),
      evento(6, '2026-11-11T14:20:00Z', 'resolveu', 'Bruno Lima resolveu o chamado'),
      evento(7, '2026-11-11T14:22:00Z', 'avaliou', 'Você avaliou: Ótimo · Resolveu muito bem'),
    ];
    expect(naTela(chamado(conversa, { situacao: 'resolvido' }))).toEqual([
      'dia Hoje',
      'abertura Recebemos o seu chamado',
      'evento Bruno Lima resolveu o chamado',
      'evento Você avaliou: Bom · Resolveu',
      'evento Você reabriu o chamado',
      'Mensagem 5',
      'evento Bruno Lima resolveu o chamado',
      'avaliação',
    ]);
  });

  it('no fechado, não há avaliação, e o evento dela fica na conversa', () => {
    const conversa = [
      evento(1, '2026-11-11T13:32:00Z', 'abertura', 'Recebemos o seu chamado'),
      evento(2, '2026-11-11T13:40:00Z', 'resolveu', 'Bruno Lima resolveu o chamado'),
      evento(3, '2026-11-11T13:42:00Z', 'avaliou', 'Você avaliou: Ótimo · Resolveu muito bem'),
    ];
    expect(naTela(chamado(conversa, { situacao: 'resolvido', fechado: true }))).toEqual([
      'dia Hoje',
      'abertura Recebemos o seu chamado',
      'evento Bruno Lima resolveu o chamado',
      'evento Você avaliou: Ótimo · Resolveu muito bem',
    ]);
  });

  it('aberto, não há avaliação', () => {
    const conversa = [
      evento(1, '2026-11-11T13:32:00Z', 'abertura', 'Recebemos o seu chamado'),
      evento(2, '2026-11-11T13:40:00Z', 'resolveu', 'Bruno Lima resolveu o chamado'),
      evento(3, '2026-11-11T13:50:00Z', 'reabriu', 'Você reabriu o chamado'),
    ];
    expect(naTela(chamado(conversa))).not.toContain('avaliação');
  });
});

describe('a hora das etapas e do painel', () => {
  it('escreve a etapa como a spec, sem a vírgula: "ontem 17:05" e "hoje 09:21"', () => {
    expect(momentoDaEtapa(new Date('2026-11-10T20:05:00Z'), AGORA, dataHora)).toBe('ontem 17:05');
    expect(momentoDaEtapa(new Date('2026-11-11T12:21:00Z'), AGORA, dataHora)).toBe('hoje 09:21');
    expect(momentoDaEtapa(new Date('2026-11-02T13:00:00Z'), AGORA, dataHora)).toBe('02/11 10:00');
    expect(momentoDaEtapa(new Date('2025-12-30T13:00:00Z'), AGORA, dataHora)).toBe(
      '30/12/2025 10:00',
    );
  });

  it('diz quando com o "às": "às 10:48" hoje e "ontem às 17:20"', () => {
    expect(quandoAs(new Date('2026-11-11T13:48:00Z'), AGORA, dataHora)).toBe('às 10:48');
    expect(quandoAs(new Date('2026-11-10T20:20:00Z'), AGORA, dataHora)).toBe('ontem às 17:20');
    expect(quandoAs(new Date('2026-11-02T13:00:00Z'), AGORA, dataHora)).toBe('02/11 às 10:00');
  });

  it('dá o dia do "Reabrir até" em dia e mês, e com o ano quando é outro', () => {
    expect(diaDoReabrir('2026-11-18', AGORA, dataHora)).toBe('18/11');
    expect(diaDoReabrir('2027-01-04', AGORA, dataHora)).toBe('04/01/2027');
  });

  it('dá a hora na conversa só com a hora hoje, e com o dia nos outros', () => {
    expect(horaNaConversa(new Date('2026-11-11T13:53:00Z'), AGORA, dataHora)).toBe('10:53');
    expect(horaNaConversa(new Date('2026-11-10T20:05:00Z'), AGORA, dataHora)).toBe('ontem 17:05');
  });

  it('dá a hora na vista Chamados só com a hora hoje e, nos outros dias, só com o dia', () => {
    expect(horaNaLista(new Date('2026-11-11T12:21:00Z'), AGORA, dataHora)).toBe('09:21');
    expect(horaNaLista(new Date('2026-11-10T20:05:00Z'), AGORA, dataHora)).toBe('ontem');
    expect(horaNaLista(new Date('2026-11-02T13:00:00Z'), AGORA, dataHora)).toBe('02/11');
    expect(horaNaLista(new Date('2025-12-30T13:00:00Z'), AGORA, dataHora)).toBe('30/12/2025');
  });
});

describe('quem escreveu a última mensagem na vista Chamados', () => {
  it('diz o primeiro nome, ou "Você" na mensagem da conta', () => {
    expect(quemEscreveuNaLista({ autor: 'Bruno Lima', minha: false })).toBe('Bruno');
    expect(quemEscreveuNaLista({ autor: 'Fernanda Rocha', minha: true })).toBe('Você');
  });

  it('sem o nome, não diz ninguém', () => {
    expect(quemEscreveuNaLista({ autor: '  ', minha: false })).toBeNull();
  });
});

describe('anexosDoChamado', () => {
  it('junta os anexos da abertura, dos campos e das mensagens, nessa ordem, com quem e quando', () => {
    const anexo = (n: number) => ({
      id: id(100 + n),
      nome: `arquivo-${n}.png`,
      tipo: 'image/png',
      bytes: 1000,
      miniatura: null,
    });
    const comAnexo = (n: number, em: string, autor = BRUNO): MensagemDoChamado => ({
      ...mensagem(n, em, autor),
      anexos: [anexo(n)],
    });
    const anexos = anexosDoChamado(
      {
        origens: [
          {
            autor: 'Paulo Nunes',
            texto: 'A impressora está manchando.',
            em: '2026-11-10T20:01:00Z',
            anexos: [anexo(1)],
          },
          {
            autor: 'Tatiana Lopes',
            texto: null,
            em: '2026-11-10T20:03:00Z',
            anexos: [anexo(7)],
          },
        ],
        anexosDosCampos: [{ ...anexo(2), campo: 'Print do erro' }],
        conversa: [
          mensagem(3, '2026-11-11T13:00:00Z'),
          comAnexo(4, '2026-11-11T13:32:00Z', FERNANDA),
          evento(5, '2026-11-11T13:40:00Z', 'assumiu'),
          comAnexo(6, '2026-11-11T13:50:00Z'),
        ],
      },
      { agora: AGORA, dataHora },
    );
    expect(anexos.map(({ nome, sobre }) => `${nome} · ${sobre}`)).toEqual([
      'arquivo-1.png · Paulo Nunes · ontem 17:01',
      'arquivo-7.png · Tatiana Lopes · ontem 17:03',
      'arquivo-2.png · Print do erro',
      'arquivo-4.png · você · 10:32',
      'arquivo-6.png · Bruno Lima (TI) · 10:50',
    ]);
  });
});
