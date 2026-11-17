import { describe, expect, it } from 'vitest';
import type { ChamadoParaAcao, MudancaDoChamado } from './acoes.ts';
import {
  antesDoAssumir,
  desdeDeQuemAtende,
  desdeNaTriagem,
  EVENTOS_QUE_NAO_SOBEM_A_VERSAO,
  EVENTOS_QUE_SOBEM_A_VERSAO,
  type EventoNaConversa,
} from './desde.ts';

const ANA = 'conta-ana';
const DIEGO = 'conta-diego';
const RENATO = 'conta-renato';

/** O momento de hoje, 17/11, na hora de São Paulo. */
const as = (hora: string) => new Date(`2026-11-17T${hora}:00-03:00`);

/** O #1042 foi aberto às 07:40 e caiu na triagem. */
const ABERTO = as('07:40');

const evento = (
  codigo: string,
  autor: string | null,
  hora: string,
  dados: unknown = {},
): EventoNaConversa => ({ evento: codigo, dados, autor, em: as(hora) });
/** A mensagem e a nota não são eventos. */
const mensagem = (autor: string, hora: string): EventoNaConversa => ({
  evento: null,
  dados: null,
  autor,
  em: as(hora),
});

describe('desdeNaTriagem', () => {
  it('sem volta à triagem, conta da abertura', () => {
    expect(desdeNaTriagem(ABERTO, [])).toEqual(ABERTO);
    expect(
      desdeNaTriagem(ABERTO, [evento('abertura', ANA, '07:40'), mensagem(ANA, '08:00')]),
    ).toEqual(ABERTO);
  });

  it('depois do devolver, conta do último devolver', () => {
    expect(
      desdeNaTriagem(ABERTO, [
        evento('abertura', ANA, '07:40'),
        evento('assumiu', DIEGO, '08:00', { de: null, desde: ABERTO.toISOString() }),
        evento('devolveu', DIEGO, '09:10', { de: DIEGO }),
        evento('passou', ANA, '09:20', { de: null, para: RENATO }),
        evento('devolveu', RENATO, '09:30', { de: RENATO }),
        mensagem(ANA, '09:35'),
      ]),
    ).toEqual(as('09:30'));
  });

  it('depois do reabrir sem ninguém, conta do reabrir; o reabrir com alguém não volta à triagem', () => {
    const resolvido = [
      evento('abertura', ANA, '07:40'),
      evento('resolveu', ANA, '08:10'),
      evento('reabriu', ANA, '10:00', { para: null }),
    ];
    expect(desdeNaTriagem(ABERTO, resolvido)).toEqual(as('10:00'));
    expect(
      desdeNaTriagem(ABERTO, [
        evento('abertura', ANA, '07:40'),
        evento('reabriu', ANA, '10:00', { para: ANA }),
      ]),
    ).toEqual(ABERTO);
  });

  it('depois do desfazer sem ninguém, volta a contar de quando o chamado caiu na triagem', () => {
    // Ana assume às 09:40 o #1042, na triagem desde as 07:40, e desfaz às 09:41.
    expect(
      desdeNaTriagem(ABERTO, [
        evento('abertura', ANA, '07:40'),
        evento('assumiu', ANA, '09:40', { de: null, desde: ABERTO.toISOString() }),
        evento('desfez', ANA, '09:41', { para: null, desde: ABERTO.toISOString() }),
      ]),
    ).toEqual(ABERTO);
    // O desfazer para outra conta não volta à triagem.
    expect(
      desdeNaTriagem(ABERTO, [
        evento('devolveu', DIEGO, '08:30', { de: DIEGO }),
        evento('desfez', ANA, '09:41', { para: RENATO, desde: as('08:00').toISOString() }),
      ]),
    ).toEqual(as('08:30'));
  });

  it('o desfazer com o desde ilegível conta dele mesmo', () => {
    expect(
      desdeNaTriagem(ABERTO, [evento('desfez', ANA, '09:41', { para: null, desde: 'ontem' })]),
    ).toEqual(as('09:41'));
    expect(desdeNaTriagem(ABERTO, [evento('desfez', ANA, '09:41', { para: null })])).toEqual(
      as('09:41'),
    );
  });
});

describe('desdeDeQuemAtende', () => {
  const AGORA = as('10:15');
  /** O #1033 com Renato desde ontem às 15:05. */
  const COM_RENATO: Pick<ChamadoParaAcao, 'responsavel' | 'desde'> = {
    responsavel: RENATO,
    desde: new Date('2026-11-16T15:05:00-03:00'),
  };
  const depois = (
    responsavel: string | null,
    conversa: MudancaDoChamado['conversa'] = [],
  ): Pick<MudancaDoChamado, 'responsavel' | 'conversa'> => ({ responsavel, conversa });

  it('sem ninguém, é nulo: a triagem conta pela conversa', () => {
    expect(
      desdeDeQuemAtende(
        COM_RENATO,
        depois(null, [{ especie: 'evento', evento: 'devolveu', dados: { de: RENATO } }]),
        AGORA,
      ),
    ).toBeNull();
  });

  it('com a mesma conta, segue o de antes', () => {
    expect(
      desdeDeQuemAtende(
        COM_RENATO,
        depois(RENATO, [{ especie: 'nota', texto: 'Vou ver.' }]),
        AGORA,
      ),
    ).toEqual(COM_RENATO.desde);
  });

  it('com outra conta, é agora', () => {
    expect(
      desdeDeQuemAtende(
        COM_RENATO,
        depois(ANA, [
          {
            especie: 'evento',
            evento: 'assumiu',
            dados: { de: RENATO, desde: COM_RENATO.desde.toISOString() },
          },
        ]),
        AGORA,
      ),
    ).toEqual(AGORA);
    expect(desdeDeQuemAtende({ responsavel: null, desde: ABERTO }, depois(ANA), AGORA)).toEqual(
      AGORA,
    );
  });

  it('no desfazer, volta ao de antes do assumir', () => {
    // Ana assumiu o #1033 de Renato e desfaz: ele volta a Renato desde ontem às 15:05.
    expect(
      desdeDeQuemAtende(
        { responsavel: ANA, desde: as('09:40') },
        depois(RENATO, [
          {
            especie: 'evento',
            evento: 'desfez',
            dados: { para: RENATO, desde: COM_RENATO.desde.toISOString() },
          },
        ]),
        AGORA,
      ),
    ).toEqual(COM_RENATO.desde);
  });

  it('no reabrir, é agora, mesmo com a conta que já estava com o resolvido (tarefa 4.14)', () => {
    // Ana resolveu o #1035 ontem, com ela desde as 10:12, e o reabre: ele volta a ela agora.
    expect(
      desdeDeQuemAtende(
        { responsavel: ANA, desde: new Date('2026-11-16T10:12:00-03:00') },
        depois(ANA, [{ especie: 'evento', evento: 'reabriu', dados: { para: ANA } }]),
        AGORA,
      ),
    ).toEqual(AGORA);
  });
});

describe('antesDoAssumir', () => {
  const assumiuDaTriagem = evento('assumiu', ANA, '09:40', {
    de: null,
    desde: ABERTO.toISOString(),
  });

  it('do assumir da triagem: a triagem, sem ninguém, desde quando o chamado estava nela', () => {
    // A nota e a mensagem depois do assumir não sobem a versão e não impedem o desfazer.
    expect(
      antesDoAssumir(
        [evento('abertura', DIEGO, '07:40'), assumiuDaTriagem, mensagem(DIEGO, '09:45')],
        ANA,
        'em-atendimento',
      ),
    ).toEqual({ situacao: 'triagem', de: null, desde: ABERTO });
  });

  it('Desfazer depois de virar OS: o evento da OS não sobe a versão nem impede o desfazer', () => {
    expect(
      antesDoAssumir(
        [assumiuDaTriagem, evento('os', ANA, '09:45', { numero: 13 })],
        ANA,
        'em-atendimento',
      ),
    ).toEqual({ situacao: 'triagem', de: null, desde: ABERTO });
  });

  it('Pedir toner depois do assumir: o evento da solicitação não sobe a versão nem impede o desfazer', () => {
    expect(
      antesDoAssumir(
        [assumiuDaTriagem, evento('solicitacao', ANA, '09:45', { numero: 4, como: 'juntou' })],
        ANA,
        'em-atendimento',
      ),
    ).toEqual({ situacao: 'triagem', de: null, desde: ABERTO });
  });

  it('do assumir de outra conta: a situação de agora, que o assumir não muda, com ela', () => {
    const deRenato = evento('assumiu', ANA, '09:40', {
      de: RENATO,
      desde: as('08:50').toISOString(),
    });
    expect(antesDoAssumir([deRenato], ANA, 'aguardando')).toEqual({
      situacao: 'aguardando',
      de: RENATO,
      desde: as('08:50'),
    });
  });

  it('o último evento que sobe a versão que não é o assumir de quem desfaz dá nulo', () => {
    // Diego passou o chamado de volta a Ana depois do assumir dela.
    expect(
      antesDoAssumir(
        [assumiuDaTriagem, evento('passou', DIEGO, '09:50', { de: ANA, para: ANA })],
        ANA,
        'em-atendimento',
      ),
    ).toBeNull();
    // O assumir é de Diego.
    expect(antesDoAssumir([assumiuDaTriagem], DIEGO, 'em-atendimento')).toBeNull();
    // "Enviar e esperar a resposta" na triagem grava o assumir, a mensagem e a espera.
    expect(
      antesDoAssumir(
        [assumiuDaTriagem, mensagem(ANA, '09:40'), evento('aguardando', ANA, '09:40')],
        ANA,
        'aguardando',
      ),
    ).toBeNull();
    // A troca do ativo depois do assumir sobe a versão (tarefa 4.15).
    expect(
      antesDoAssumir(
        [
          assumiuDaTriagem,
          evento('ativo', DIEGO, '09:50', { antes: null, depois: 'ativo-pat-00139' }),
        ],
        ANA,
        'em-atendimento',
      ),
    ).toBeNull();
    // Nada foi assumido desde a abertura.
    expect(antesDoAssumir([evento('abertura', ANA, '07:40')], ANA, 'triagem')).toBeNull();
    expect(antesDoAssumir([], ANA, 'triagem')).toBeNull();
  });

  it('o assumir com os dados ilegíveis dá nulo', () => {
    for (const dados of [
      null,
      {},
      { de: null },
      { de: 7, desde: ABERTO.toISOString() },
      { de: null, desde: 'às 07:40' },
      { de: null, desde: 1763376000000 },
    ]) {
      expect(antesDoAssumir([evento('assumiu', ANA, '09:40', dados)], ANA, 'em-atendimento')).toBe(
        null,
      );
    }
  });

  it('os eventos que sobem a versão são os das ações e a troca do ativo, sem a abertura', () => {
    expect(EVENTOS_QUE_SOBEM_A_VERSAO).toEqual([
      'assumiu',
      'passou',
      'devolveu',
      'desfez',
      'aguardando',
      'retomou',
      'resolveu',
      'reabriu',
      'ativo',
    ]);
  });

  it('virar OS, pedir toner e a solicitação gerada ou não vão à conversa e não sobem a versão', () => {
    expect(EVENTOS_QUE_NAO_SOBEM_A_VERSAO).toEqual(['os', 'solicitacao', 'solicitacao-nao-gerada']);
  });
});
