import { describe, expect, it } from 'vitest';
import type { AlcanceDeQuemAtende, LocaisDoChamado } from './atendimento.ts';
import {
  assuntoDoChamado,
  type ChamadoQueNotifica,
  destinoDoChamado,
  destinoDoChamadoNoChat,
  notificacaoDoPassado,
  notificacoesDaAbertura,
  notificacoesDaAcao,
  notificacoesDaTriagem,
  notificacoesDeQuemParticipa,
  notificacoesDoEstouro,
  notificacoesParaQuemParticipa,
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
  mensagem: false,
  assunto: null,
  mensagemDoChatId: null,
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

  it('o retomar e o resolver não avisam ninguém (tarefa 4.14)', () => {
    for (const acao of ['retomar', 'resolver'] as const) {
      expect(notificacoesDaAcao(chamado(), { acao }, 'conta-diego'), acao).toEqual([]);
    }
  });

  it('Reaberto por outra pessoa: o chamado que volta a quem resolveu avisa essa conta', () => {
    expect(
      notificacoesDaAcao(chamado(), { acao: 'reabrir', para: 'conta-ana' }, 'conta-diego'),
    ).toEqual([notificacaoDoPassado(chamado(), 'conta-ana')]);
  });

  it('quem reabre o que resolveu não é avisado', () => {
    expect(
      notificacoesDaAcao(chamado(), { acao: 'reabrir', para: 'conta-ana' }, 'conta-ana'),
    ).toEqual([]);
  });

  it('o reaberto que cai na triagem avisa quem atende os locais, fora quem reabriu', () => {
    const novas = notificacoesDaAcao(
      chamado(),
      { acao: 'reabrir', para: null, contas: CONTAS },
      'conta-fabio',
    );
    expect(titulosPorConta(novas)).toEqual({
      'conta-ana': 'Chamado #1043 na triagem: Impressora manchando',
      'conta-diego': 'Chamado #1043 na triagem: Impressora manchando',
    });
  });
});

describe('notificacoesDoEstouro', () => {
  const TITULO = 'Chamado #1043 passou do prazo: Impressora manchando';
  const comQuemAtende = (responsavelId: string) =>
    chamado({ situacao: 'em-atendimento', responsavelId });

  it('avisa a conta com o chamado, que ainda atende os locais dele, na severidade Atenção', () => {
    expect(notificacoesDoEstouro(comQuemAtende('conta-diego'), CONTAS)).toEqual([
      { ...NOTIFICACAO, severidade: 'atencao', contaId: 'conta-diego', titulo: TITULO },
    ]);
  });

  it('na triagem, avisa cada conta que atende os locais', () => {
    expect(titulosPorConta(notificacoesDoEstouro(chamado(), CONTAS))).toEqual({
      'conta-ana': TITULO,
      'conta-diego': TITULO,
      'conta-fabio': TITULO,
    });
  });

  it('com quem não atende mais os locais, ou com a conta inativa, avisa quem atende', () => {
    const quemAtende = { 'conta-ana': TITULO, 'conta-diego': TITULO, 'conta-fabio': TITULO };
    // Bruno atende só Campinas, e o chamado é de Jundiaí.
    expect(titulosPorConta(notificacoesDoEstouro(comQuemAtende('conta-bruno'), CONTAS))).toEqual(
      quemAtende,
    );
    // A conta inativa não está entre as contas que atendem.
    expect(titulosPorConta(notificacoesDoEstouro(comQuemAtende('conta-inativa'), CONTAS))).toEqual(
      quemAtende,
    );
  });

  it('o chamado sem local avisa só quem atende a organização inteira', () => {
    expect(titulosPorConta(notificacoesDoEstouro(chamado({ locais: SEM_LOCAL }), CONTAS))).toEqual({
      'conta-ana': TITULO,
    });
  });

  it('sem ninguém que atenda os locais, não avisa ninguém', () => {
    expect(notificacoesDoEstouro(chamado(), [{ id: 'conta-carla', alcance: null }])).toEqual([]);
  });
});

const CHAMADO = '01935e00-0000-7000-8000-000000001041';

const quemRecebe = (novas: { contaId: string }[]) => novas.map(({ contaId }) => contaId);

describe('o assunto e o endereço no chat', () => {
  it('o assunto é o do chamado, com o id em minúsculas, como o banco o devolve', () => {
    expect(assuntoDoChamado(CHAMADO.toUpperCase())).toBe(`chamado:${CHAMADO}`);
  });

  it('quem participa abre o chamado pelo número, no app do chat', () => {
    expect(destinoDoChamadoNoChat(1041)).toBe('/chat/chamados/1041');
  });
});

describe('notificacoesDeQuemParticipa', () => {
  const doChat = (parte: Partial<ChamadoQueNotifica> = {}) => ({ ...chamado(parte), id: CHAMADO });
  const FERNANDA = { contaId: 'conta-fernanda', nome: 'Fernanda Rocha' };
  const MENSAGEM = { especie: 'mensagem', texto: 'O nome é Contratos 2026.' } as const;
  const RETOMOU = { especie: 'evento', evento: 'retomou', dados: {} } as const;

  it('Fernanda Rocha respondeu o #1041: quem atende recebe, com o começo da mensagem, como mensagem', () => {
    expect(
      notificacoesDeQuemParticipa(
        doChat({ numero: 1041 }),
        { responsavel: 'conta-bruno', conversa: [MENSAGEM] },
        FERNANDA,
        CONTAS,
      ),
    ).toEqual([
      {
        contaId: 'conta-bruno',
        severidade: 'info',
        titulo: 'Fernanda Rocha respondeu o #1041',
        descricao: 'O nome é Contratos 2026.',
        origem: 'Chamados',
        destino: '/chamados/1041',
        alertaId: null,
        mensagem: true,
        assunto: `chamado:${CHAMADO}`,
        mensagemDoChatId: null,
      },
    ]);
  });

  it('a escolha leva a opção escolhida', () => {
    const [nova] = notificacoesDeQuemParticipa(
      doChat(),
      {
        responsavel: 'conta-bruno',
        conversa: [
          {
            especie: 'evento',
            evento: 'escolheu',
            dados: { mensagem: 'mensagem-da-pergunta', opcao: 'Pode reiniciar agora' },
          },
          RETOMOU,
        ],
      },
      FERNANDA,
      CONTAS,
    );
    expect(nova).toMatchObject({
      contaId: 'conta-bruno',
      titulo: 'Fernanda Rocha respondeu o #1043',
      descricao: 'Pode reiniciar agora',
    });
  });

  it('a resposta do Aguardando o colaborador, que o retoma, notifica quem atende', () => {
    expect(
      quemRecebe(
        notificacoesDeQuemParticipa(
          doChat(),
          { responsavel: 'conta-bruno', conversa: [MENSAGEM, RETOMOU] },
          FERNANDA,
          CONTAS,
        ),
      ),
    ).toEqual(['conta-bruno']);
  });

  it('na triagem, a resposta não notifica ninguém: o chamado já está na lista da triagem', () => {
    expect(
      notificacoesDeQuemParticipa(
        doChat(),
        { responsavel: null, conversa: [MENSAGEM] },
        FERNANDA,
        CONTAS,
      ),
    ).toEqual([]);
  });

  it('a mensagem que reabre o chamado notifica só o "Chamado #1045 com você", a quem o resolveu', () => {
    const resolvido = doChat({ numero: 1045 });
    expect(
      notificacoesDeQuemParticipa(
        resolvido,
        {
          responsavel: 'conta-bruno',
          conversa: [
            MENSAGEM,
            { especie: 'evento', evento: 'reabriu', dados: { para: 'conta-bruno' } },
          ],
        },
        FERNANDA,
        CONTAS,
      ),
    ).toEqual([notificacaoDoPassado(resolvido, 'conta-bruno')]);
  });

  it('a reabertura sem quem resolveu vai à triagem: avisa quem atende os locais, fora quem reabriu', () => {
    const reabriu = { especie: 'evento', evento: 'reabriu', dados: { para: null } } as const;
    expect(
      titulosPorConta(
        notificacoesDeQuemParticipa(
          doChat(),
          { responsavel: null, conversa: [reabriu] },
          { contaId: 'conta-diego', nome: 'Diego Martins' },
          CONTAS,
        ),
      ),
    ).toEqual({
      'conta-ana': 'Chamado #1043 na triagem: Impressora manchando',
      'conta-fabio': 'Chamado #1043 na triagem: Impressora manchando',
    });
  });

  it('quem escreve não é notificado: a conta da TI que é a pessoa do chamado e o atende', () => {
    const ana = { contaId: 'conta-ana', nome: 'Ana Souza' };
    expect(
      notificacoesDeQuemParticipa(
        doChat(),
        { responsavel: 'conta-ana', conversa: [MENSAGEM] },
        ana,
        CONTAS,
      ),
    ).toEqual([]);
    expect(
      notificacoesDeQuemParticipa(
        doChat(),
        {
          responsavel: 'conta-ana',
          conversa: [{ especie: 'evento', evento: 'reabriu', dados: { para: 'conta-ana' } }],
        },
        ana,
        CONTAS,
      ),
    ).toEqual([]);
  });

  it('a avaliação e o "Marcar como vista" não notificam', () => {
    const avaliou = {
      especie: 'evento',
      evento: 'avaliou',
      dados: { nivel: 'otimo', comentario: null, resolucao: '2026-11-19T10:00:00.000Z' },
    } as const;
    expect(
      notificacoesDeQuemParticipa(
        doChat(),
        { responsavel: 'conta-bruno', conversa: [avaliou] },
        FERNANDA,
        CONTAS,
      ),
    ).toEqual([]);
    expect(
      notificacoesDeQuemParticipa(
        doChat(),
        { responsavel: 'conta-bruno', conversa: [] },
        FERNANDA,
        CONTAS,
      ),
    ).toEqual([]);
  });
});

describe('notificacoesParaQuemParticipa', () => {
  /** O #1041 de Fernanda, que ela abriu pelo chat. */
  const doChat = (parte: Partial<{ origem: 'ti' | 'chat'; abertoPor: string | null }> = {}) => ({
    id: CHAMADO,
    numero: 1041,
    titulo: 'Pasta da rede sumiu',
    pessoaId: 'pessoa-fernanda',
    origem: 'chat' as const,
    abertoPor: 'conta-fernanda',
    ...parte,
  });
  const FERNANDA = { id: 'conta-fernanda', pessoaId: 'pessoa-fernanda', usaOChat: true };
  const PAULO = { id: 'conta-paulo', pessoaId: 'pessoa-paulo', usaOChat: true };
  const ANA = { contaId: 'conta-ana', nome: 'Ana Souza' };
  const TEXTO = 'Não achei uma pasta com esse nome na sua conta. Confirme o nome exato, por favor.';
  const MENSAGEM = { especie: 'mensagem', texto: TEXTO } as const;

  it('Resposta da TI no chat: Fernanda recebe "Ana Souza respondeu o #1041", e o endereço abre o #1041 no chat', () => {
    expect(
      notificacoesParaQuemParticipa(doChat(), { conversa: [MENSAGEM] }, ANA, [FERNANDA]),
    ).toEqual([
      {
        contaId: 'conta-fernanda',
        severidade: 'info',
        titulo: 'Ana Souza respondeu o #1041',
        descricao: TEXTO,
        origem: 'Chamados',
        destino: '/chat/chamados/1041',
        alertaId: null,
        mensagem: true,
        assunto: `chamado:${CHAMADO}`,
        mensagemDoChatId: null,
      },
    ]);
  });

  it('a mensagem da espera também é resposta da TI', () => {
    const espera = [
      {
        especie: 'evento',
        evento: 'assumiu',
        dados: { de: null, desde: '2026-11-19T10:00:00.000Z' },
      },
      MENSAGEM,
      { especie: 'evento', evento: 'aguardando', dados: {} },
    ] as const;
    expect(
      notificacoesParaQuemParticipa(doChat(), { conversa: espera }, ANA, [FERNANDA]).map(
        ({ titulo }) => titulo,
      ),
    ).toEqual(['Ana Souza respondeu o #1041']);
  });

  it('o resolvido: "#1045 resolvido: Impressora manchando", com o começo do "O que foi feito", e só ele', () => {
    const feito = 'Troquei o cilindro da impressora e imprimi uma página de teste sem manchas.';
    expect(
      notificacoesParaQuemParticipa(
        { ...doChat(), numero: 1045, titulo: 'Impressora manchando' },
        {
          conversa: [
            { especie: 'mensagem', texto: feito },
            { especie: 'evento', evento: 'resolveu', dados: {} },
          ],
        },
        ANA,
        [FERNANDA],
      ),
    ).toEqual([
      {
        contaId: 'conta-fernanda',
        severidade: 'info',
        titulo: '#1045 resolvido: Impressora manchando',
        descricao: feito,
        origem: 'Chamados',
        destino: '/chat/chamados/1045',
        alertaId: null,
        mensagem: true,
        assunto: `chamado:${CHAMADO}`,
        mensagemDoChatId: null,
      },
    ]);
  });

  it('quem abriu pelo chat também recebe, e a conta repetida recebe uma vez só', () => {
    expect(
      quemRecebe(
        notificacoesParaQuemParticipa(
          doChat({ abertoPor: 'conta-paulo' }),
          { conversa: [MENSAGEM] },
          ANA,
          [FERNANDA, PAULO, FERNANDA],
        ),
      ),
    ).toEqual(['conta-fernanda', 'conta-paulo']);
  });

  it('quem abriu pela TI não recebe: ele vê o chamado pelas permissões', () => {
    const bruno = { id: 'conta-bruno', pessoaId: 'pessoa-bruno', usaOChat: true };
    expect(
      quemRecebe(
        notificacoesParaQuemParticipa(
          doChat({ origem: 'ti', abertoPor: 'conta-bruno' }),
          { conversa: [MENSAGEM] },
          ANA,
          [FERNANDA, bruno],
        ),
      ),
    ).toEqual(['conta-fernanda']);
  });

  it('a conta que não usa o chat não recebe', () => {
    expect(
      notificacoesParaQuemParticipa(doChat(), { conversa: [MENSAGEM] }, ANA, [
        { ...FERNANDA, usaOChat: false },
      ]),
    ).toEqual([]);
  });

  it('quem escreveu não recebe: a conta da TI que é a pessoa do chamado', () => {
    const ana = { id: 'conta-ana', pessoaId: 'pessoa-ana', usaOChat: true };
    expect(
      notificacoesParaQuemParticipa(
        { ...doChat(), pessoaId: 'pessoa-ana', abertoPor: 'conta-ana' },
        { conversa: [MENSAGEM] },
        ANA,
        [ana],
      ),
    ).toEqual([]);
  });

  it('a nota interna e as outras ações não notificam a pessoa: ela as vê na conversa', () => {
    const semAviso = [
      [{ especie: 'nota', texto: 'Ver com o fornecedor.' }],
      [{ especie: 'evento', evento: 'passou', dados: { de: 'conta-ana', para: 'conta-bruno' } }],
      [{ especie: 'evento', evento: 'devolveu', dados: { de: 'conta-ana' } }],
      [{ especie: 'evento', evento: 'retomou', dados: {} }],
      [{ especie: 'evento', evento: 'reabriu', dados: { para: 'conta-ana' } }],
    ] as const;
    for (const conversa of semAviso) {
      expect(notificacoesParaQuemParticipa(doChat(), { conversa }, ANA, [FERNANDA])).toEqual([]);
    }
  });
});
