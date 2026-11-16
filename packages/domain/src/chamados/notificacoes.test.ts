import { describe, expect, it } from 'vitest';
import type { AlcanceDeQuemAtende, LocaisDoChamado } from './atendimento.ts';
import {
  type ChamadoQueNotifica,
  destinoDoChamado,
  notificacaoDoPassado,
  notificacoesDaAbertura,
  notificacoesDaAcao,
  notificacoesDaTriagem,
  ORIGEM_DOS_CHAMADOS,
} from './notificacoes.ts';

const JUNDIAI = 'local-jundiai';
const CAMPINAS = 'local-campinas';

const EM_JUNDIAI: LocaisDoChamado = { locais: [JUNDIAI], semLocal: false };
const EM_JUNDIAI_E_CAMPINAS: LocaisDoChamado = { locais: [JUNDIAI, CAMPINAS], semLocal: false };
const SEM_LOCAL: LocaisDoChamado = { locais: [], semLocal: true };

/** Ana atende a organização; Diego, Jundiaí; Bruno, Campinas; Carla não atende nada. */
const CONTAS: { id: string; alcance: AlcanceDeQuemAtende }[] = [
  { id: 'conta-ana', alcance: 'organizacao' },
  { id: 'conta-diego', alcance: new Set([JUNDIAI]) },
  { id: 'conta-bruno', alcance: new Set([CAMPINAS]) },
  { id: 'conta-carla', alcance: null },
  { id: 'conta-fabio', alcance: new Set([JUNDIAI, CAMPINAS]) },
];

const chamado = (parte: Partial<ChamadoQueNotifica> = {}): ChamadoQueNotifica => ({
  numero: 1043,
  titulo: 'Impressora manchando',
  situacao: 'triagem',
  responsavelId: null,
  locais: EM_JUNDIAI,
  ...parte,
});

const NOTIFICACAO = {
  severidade: 'info',
  descricao: null,
  origem: 'Chamados',
  destino: '/chamados/1043',
  alertaId: null,
} as const;

const titulosPorConta = (novas: { contaId: string; titulo: string }[]) =>
  Object.fromEntries(novas.map(({ contaId, titulo }) => [contaId, titulo]));

describe('o endereço e a origem', () => {
  it('o chamado abre pelo número, na origem "Chamados"', () => {
    expect(destinoDoChamado(1043)).toBe('/chamados/1043');
    expect(ORIGEM_DOS_CHAMADOS).toBe('Chamados');
  });
});

describe('notificacaoDoPassado', () => {
  it('Passado a Renato: "Chamado #1043 com você", na severidade Informação', () => {
    expect(notificacaoDoPassado(chamado(), 'conta-renato')).toEqual({
      ...NOTIFICACAO,
      contaId: 'conta-renato',
      titulo: 'Chamado #1043 com você: Impressora manchando',
    });
  });
});

describe('notificacoesDaTriagem', () => {
  it('avisa cada conta que atende todos os locais do chamado, fora a dada', () => {
    const novas = notificacoesDaTriagem(chamado(), CONTAS, { fora: 'conta-ana' });
    expect(titulosPorConta(novas)).toEqual({
      'conta-diego': 'Chamado #1043 na triagem: Impressora manchando',
      'conta-fabio': 'Chamado #1043 na triagem: Impressora manchando',
    });
    expect(novas[0]).toEqual({
      ...NOTIFICACAO,
      contaId: 'conta-diego',
      titulo: 'Chamado #1043 na triagem: Impressora manchando',
    });
  });

  it('o chamado de dois locais só avisa quem atende os dois', () => {
    const novas = notificacoesDaTriagem(chamado({ locais: EM_JUNDIAI_E_CAMPINAS }), CONTAS, {
      fora: 'conta-bruno',
    });
    expect(novas.map(({ contaId }) => contaId)).toEqual(['conta-ana', 'conta-fabio']);
  });

  it('o chamado sem local só avisa quem atende a organização inteira', () => {
    const novas = notificacoesDaTriagem(chamado({ locais: SEM_LOCAL }), CONTAS, {
      fora: 'conta-diego',
    });
    expect(novas.map(({ contaId }) => contaId)).toEqual(['conta-ana']);
  });
});

describe('notificacoesDaAbertura', () => {
  it('Chamado pelo telefone: o "Fica comigo" não avisa ninguém', () => {
    expect(
      notificacoesDaAbertura(chamado({ situacao: 'em-atendimento', responsavelId: 'conta-ana' }), {
        abertoPor: 'conta-ana',
        contas: CONTAS,
      }),
    ).toEqual([]);
  });

  it('o chamado que nasce com quem atende o tipo avisa só essa conta', () => {
    expect(
      notificacoesDaAbertura(
        chamado({ situacao: 'em-atendimento', responsavelId: 'conta-diego' }),
        { abertoPor: 'conta-ana', contas: CONTAS },
      ),
    ).toEqual([
      {
        ...NOTIFICACAO,
        contaId: 'conta-diego',
        titulo: 'Chamado #1043 com você: Impressora manchando',
      },
    ]);
  });

  it('o chamado que nasce com quem abriu, por atender o tipo, não avisa ninguém', () => {
    expect(
      notificacoesDaAbertura(
        chamado({ situacao: 'em-atendimento', responsavelId: 'conta-diego' }),
        { abertoPor: 'conta-diego', contas: CONTAS },
      ),
    ).toEqual([]);
  });

  it('Chamado para a triagem: avisa quem atende os locais dele, fora quem abriu', () => {
    const novas = notificacoesDaAbertura(chamado(), { abertoPor: 'conta-diego', contas: CONTAS });
    expect(titulosPorConta(novas)).toEqual({
      'conta-ana': 'Chamado #1043 na triagem: Impressora manchando',
      'conta-fabio': 'Chamado #1043 na triagem: Impressora manchando',
    });
  });
});

describe('notificacoesDaAcao', () => {
  it('Passar o chamado: avisa só a conta escolhida', () => {
    expect(
      notificacoesDaAcao(chamado(), { acao: 'passar', para: 'conta-renato' }, 'conta-ana'),
    ).toEqual([notificacaoDoPassado(chamado(), 'conta-renato')]);
  });

  it('quem passa o chamado a si mesmo não é avisado', () => {
    expect(
      notificacoesDaAcao(chamado(), { acao: 'passar', para: 'conta-ana' }, 'conta-ana'),
    ).toEqual([]);
  });

  it('Devolver à triagem: avisa quem atende os locais, fora quem devolveu', () => {
    const novas = notificacoesDaAcao(
      chamado(),
      { acao: 'devolver', contas: CONTAS },
      'conta-fabio',
    );
    expect(titulosPorConta(novas)).toEqual({
      'conta-ana': 'Chamado #1043 na triagem: Impressora manchando',
      'conta-diego': 'Chamado #1043 na triagem: Impressora manchando',
    });
  });

  it('o assumir e o desfazer não avisam ninguém', () => {
    expect(notificacoesDaAcao(chamado(), { acao: 'assumir' }, 'conta-diego')).toEqual([]);
    expect(notificacoesDaAcao(chamado(), { acao: 'desfazer' }, 'conta-diego')).toEqual([]);
  });

  it('a mensagem, a espera e a nota não avisam ninguém (tarefa 4.13)', () => {
    for (const acao of ['mensagem', 'esperar', 'nota'] as const) {
      expect(notificacoesDaAcao(chamado(), { acao }, 'conta-diego'), acao).toEqual([]);
    }
  });
});
