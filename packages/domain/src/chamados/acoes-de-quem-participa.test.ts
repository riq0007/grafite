import { describe, expect, it } from 'vitest';
import type { ContaQueRecebe } from './acoes.ts';
import {
  ACOES_DE_QUEM_PARTICIPA,
  type ChamadoParaQuemParticipa,
  decidirAcaoDeQuemParticipa,
  MATRIZ_DE_QUEM_PARTICIPA,
  mensagemDaRecusaDeQuemParticipa,
  type PedidoDeQuemParticipa,
  type PerguntaParaEscolher,
  type RecusaDeQuemParticipa,
  SITUACOES_DE_QUEM_PARTICIPA,
} from './acoes-de-quem-participa.ts';

const JUNDIAI = { id: 'local-jundiai', nome: 'Jundiaí' };
const CAMPINAS = 'local-campinas';

/** Bruno, que resolveu o #1045, como a conta está agora. */
const BRUNO: ContaQueRecebe = {
  id: 'conta-bruno',
  nome: 'Bruno Lima',
  ativa: true,
  alcance: new Set([JUNDIAI.id]),
};
const ANA = 'conta-ana';

/** O #1045 foi resolvido por Bruno em 11/11 às 11:20. */
const RESOLVIDO_EM = new Date('2026-11-11T11:20:00-03:00');

/** O #1050, de Fernanda Rocha, em Jundiaí, na triagem. */
const NA_TRIAGEM: ChamadoParaQuemParticipa = {
  numero: 1050,
  situacao: 'triagem',
  fechado: false,
  responsavel: null,
  locais: [JUNDIAI],
  semLocal: false,
  resolvidoEm: null,
  pelaTi: false,
};
/** O #1044, em atendimento com Bruno. */
const EM_ATENDIMENTO: ChamadoParaQuemParticipa = {
  ...NA_TRIAGEM,
  numero: 1044,
  situacao: 'em-atendimento',
  responsavel: BRUNO.id,
};
/** O #1041, aguardando Fernanda, com Ana. */
const AGUARDANDO: ChamadoParaQuemParticipa = {
  ...NA_TRIAGEM,
  numero: 1041,
  situacao: 'aguardando',
  responsavel: ANA,
};
/** O #1045, resolvido por Bruno, que ainda reabre. */
const RESOLVIDO: ChamadoParaQuemParticipa = {
  ...NA_TRIAGEM,
  numero: 1045,
  situacao: 'resolvido',
  responsavel: BRUNO.id,
  resolvidoEm: RESOLVIDO_EM,
};
/** O #1030, resolvido há mais de 7 dias: fechado. */
const FECHADO: ChamadoParaQuemParticipa = { ...RESOLVIDO, numero: 1030, fechado: true };

const TEXTO = 'Voltou a manchar';
const responder = (quemResolveu: ContaQueRecebe | null = BRUNO): PedidoDeQuemParticipa => ({
  acao: 'responder',
  texto: TEXTO,
  anexos: 0,
  quemResolveu,
});

/** A pergunta das 10:52 de Bruno, no #1045. */
const PERGUNTA: PerguntaParaEscolher = {
  id: '0190a000-0000-7000-8000-000000001052',
  opcoes: ['Pode ser', 'Agora não', 'Amanhã cedo'],
  respondida: false,
};
const escolher = (opcao = 'Pode ser', pergunta = PERGUNTA): PedidoDeQuemParticipa => ({
  acao: 'escolher',
  pergunta,
  opcao,
});

const reabrir = (quemResolveu: ContaQueRecebe | null = BRUNO): PedidoDeQuemParticipa => ({
  acao: 'reabrir',
  quemResolveu,
});

const avaliar = (
  nivel: string | null = 'otimo',
  comentario: string | null = null,
  avaliado = false,
): PedidoDeQuemParticipa => ({ acao: 'avaliar', nivel, comentario, avaliado });

const VISTA: PedidoDeQuemParticipa = { acao: 'vista' };

const recusa = (motivo: RecusaDeQuemParticipa) => ({ aceita: false, recusa: motivo });

/** Nada muda no chamado: a situação, quem atende e o relógio ficam como estavam. */
const semMudar = (chamado: ChamadoParaQuemParticipa, conversa: unknown[] = []) => ({
  aceita: true,
  situacao: chamado.situacao,
  responsavel: chamado.responsavel,
  relogio: 'segue',
  sobeAVersao: false,
  conversa,
});

const MENSAGEM = { especie: 'mensagem', texto: TEXTO };
const ESCOLHEU = {
  especie: 'evento',
  evento: 'escolheu',
  dados: { mensagem: PERGUNTA.id, opcao: 'Pode ser' },
};
const RETOMOU = { especie: 'evento', evento: 'retomou', dados: {} };

/** A retomada do aguardando: Em atendimento com quem atende, e o relógio volta a contar. */
const retomado = (conversa: unknown[]) => ({
  aceita: true,
  situacao: 'em-atendimento',
  responsavel: ANA,
  relogio: 'volta',
  sobeAVersao: true,
  conversa,
});

/** A reabertura: Em atendimento com quem resolveu, e o relógio volta a contar. */
const reabertoComBruno = (conversa: unknown[]) => ({
  aceita: true,
  situacao: 'em-atendimento',
  responsavel: BRUNO.id,
  relogio: 'volta',
  sobeAVersao: true,
  conversa,
});

describe('responder', () => {
  it('na triagem, a mensagem entra na conversa, e a situação não muda', () => {
    expect(decidirAcaoDeQuemParticipa(NA_TRIAGEM, responder())).toEqual(
      semMudar(NA_TRIAGEM, [MENSAGEM]),
    );
  });

  it('em atendimento, a mensagem entra na conversa, e a situação não muda', () => {
    expect(decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, responder())).toEqual(
      semMudar(EM_ATENDIMENTO, [MENSAGEM]),
    );
  });

  it('Resposta que retoma: no aguardando, volta a Em atendimento com quem atende, e o relógio volta a contar', () => {
    expect(decidirAcaoDeQuemParticipa(AGUARDANDO, responder())).toEqual(
      retomado([MENSAGEM, RETOMOU]),
    );
  });

  it('Escrever no resolvido: reabre o chamado, Em atendimento com quem resolveu', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, responder())).toEqual(
      reabertoComBruno([
        MENSAGEM,
        { especie: 'evento', evento: 'reabriu', dados: { para: BRUNO.id } },
      ]),
    );
  });

  it('no fechado, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(FECHADO, responder())).toEqual(recusa({ motivo: 'fechado' }));
  });
});

describe('escolher uma opção', () => {
  it('na triagem, a escolha entra na conversa, sem virar mensagem, e a situação não muda', () => {
    expect(decidirAcaoDeQuemParticipa(NA_TRIAGEM, escolher())).toEqual(
      semMudar(NA_TRIAGEM, [ESCOLHEU]),
    );
  });

  it('em atendimento, a escolha entra na conversa, e a situação não muda', () => {
    expect(decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, escolher())).toEqual(
      semMudar(EM_ATENDIMENTO, [ESCOLHEU]),
    );
  });

  it('no aguardando, a escolha conta como a resposta e retoma o chamado', () => {
    expect(decidirAcaoDeQuemParticipa(AGUARDANDO, escolher())).toEqual(
      retomado([ESCOLHEU, RETOMOU]),
    );
  });

  it('no resolvido, é recusada: escrever reabre', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, escolher())).toEqual(
      recusa({ motivo: 'escreva-para-reabrir' }),
    );
  });

  it('no fechado, é recusada', () => {
    expect(decidirAcaoDeQuemParticipa(FECHADO, escolher())).toEqual(recusa({ motivo: 'fechado' }));
  });
});

describe('reabrir', () => {
  it('na triagem, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(NA_TRIAGEM, reabrir())).toEqual(
      recusa({ motivo: 'nao-resolvido' }),
    );
  });

  it('em atendimento, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, reabrir())).toEqual(
      recusa({ motivo: 'nao-resolvido' }),
    );
  });

  it('no aguardando, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(AGUARDANDO, reabrir())).toEqual(
      recusa({ motivo: 'nao-resolvido' }),
    );
  });

  it('no resolvido, sem escrever, volta a Em atendimento com quem resolveu', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, reabrir())).toEqual(
      reabertoComBruno([{ especie: 'evento', evento: 'reabriu', dados: { para: BRUNO.id } }]),
    );
  });

  it('no fechado, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(FECHADO, reabrir())).toEqual(recusa({ motivo: 'fechado' }));
  });
});

describe('avaliar', () => {
  it('na triagem, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(NA_TRIAGEM, avaliar())).toEqual(
      recusa({ motivo: 'avaliar-sem-resolver' }),
    );
  });

  it('em atendimento, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, avaliar())).toEqual(
      recusa({ motivo: 'avaliar-sem-resolver' }),
    );
  });

  it('no aguardando, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(AGUARDANDO, avaliar())).toEqual(
      recusa({ motivo: 'avaliar-sem-resolver' }),
    );
  });

  it('Avaliar: no resolvido, a avaliação entra na conversa, com a resolução de agora, e o chamado fica resolvido', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, avaliar('otimo'))).toEqual(
      semMudar(RESOLVIDO, [
        {
          especie: 'evento',
          evento: 'avaliou',
          dados: { nivel: 'otimo', comentario: null, resolucao: '2026-11-11T14:20:00.000Z' },
        },
      ]),
    );
  });

  it('no fechado, é recusado', () => {
    expect(decidirAcaoDeQuemParticipa(FECHADO, avaliar())).toEqual(recusa({ motivo: 'fechado' }));
  });
});

describe('marcar como vista', () => {
  it('na triagem, nada muda no chamado', () => {
    expect(decidirAcaoDeQuemParticipa(NA_TRIAGEM, VISTA)).toEqual(semMudar(NA_TRIAGEM));
  });

  it('em atendimento, nada muda no chamado', () => {
    expect(decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, VISTA)).toEqual(semMudar(EM_ATENDIMENTO));
  });

  it('no aguardando, nada muda no chamado, e ele continua aguardando', () => {
    expect(decidirAcaoDeQuemParticipa(AGUARDANDO, VISTA)).toEqual(semMudar(AGUARDANDO));
  });

  it('no resolvido, nada muda no chamado', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, VISTA)).toEqual(semMudar(RESOLVIDO));
  });

  it('no fechado, nada muda no chamado: a marcação é só da leitura da conta', () => {
    expect(decidirAcaoDeQuemParticipa(FECHADO, VISTA)).toEqual(semMudar(FECHADO));
  });
});

describe('a reabertura sem quem resolveu', () => {
  const naTriagem = (conversa: unknown[]) => ({
    aceita: true,
    situacao: 'triagem',
    responsavel: null,
    relogio: 'volta',
    sobeAVersao: true,
    conversa,
  });
  const REABRIU_SEM_NINGUEM = { especie: 'evento', evento: 'reabriu', dados: { para: null } };

  it('quem resolveu e não atende mais os locais deixa o chamado na triagem, como o reabrir da TI', () => {
    for (const quemResolveu of [
      { ...BRUNO, ativa: false },
      { ...BRUNO, alcance: new Set([CAMPINAS]) },
    ]) {
      expect(decidirAcaoDeQuemParticipa(RESOLVIDO, reabrir(quemResolveu))).toEqual(
        naTriagem([REABRIU_SEM_NINGUEM]),
      );
      expect(decidirAcaoDeQuemParticipa(RESOLVIDO, responder(quemResolveu))).toEqual(
        naTriagem([MENSAGEM, REABRIU_SEM_NINGUEM]),
      );
    }
  });

  it('sem a conta de quem resolveu, o chamado volta à triagem', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, reabrir(null))).toEqual(
      naTriagem([REABRIU_SEM_NINGUEM]),
    );
  });
});

describe('a mensagem de quem participa', () => {
  it('perde os espaços das pontas e vai até 4.000 caracteres, contados em caracteres', () => {
    expect(
      decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, {
        acao: 'responder',
        texto: `  ${TEXTO}\n`,
        anexos: 0,
        quemResolveu: null,
      }),
    ).toMatchObject({ conversa: [MENSAGEM] });
    const cheio = '👍'.repeat(4000);
    expect(
      decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, {
        acao: 'responder',
        texto: cheio,
        anexos: 5,
        quemResolveu: null,
      }),
    ).toMatchObject({ aceita: true });
    expect(
      decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, {
        acao: 'responder',
        texto: `${cheio}!`,
        anexos: 0,
        quemResolveu: null,
      }),
    ).toEqual(recusa({ motivo: 'texto-longo', texto: 'mensagem' }));
  });

  it('pede o texto ou um anexo e aceita até 5 anexos', () => {
    expect(
      decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, {
        acao: 'responder',
        texto: ' \n ',
        anexos: 0,
        quemResolveu: null,
      }),
    ).toEqual(recusa({ motivo: 'sem-texto', texto: 'mensagem' }));
    // Só com os anexos, o texto fica nulo (tarefa 4.18).
    expect(
      decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, {
        acao: 'responder',
        texto: ' \n ',
        anexos: 1,
        quemResolveu: null,
      }),
    ).toMatchObject({ aceita: true, conversa: [{ especie: 'mensagem', texto: null }] });
    expect(
      decidirAcaoDeQuemParticipa(AGUARDANDO, {
        acao: 'responder',
        texto: TEXTO,
        anexos: 6,
        quemResolveu: null,
      }),
    ).toEqual(recusa({ motivo: 'anexos-demais' }));
  });

  it('a recusa do texto vem antes da reabertura, e nada muda no resolvido', () => {
    expect(
      decidirAcaoDeQuemParticipa(RESOLVIDO, {
        acao: 'responder',
        texto: '',
        anexos: 0,
        quemResolveu: BRUNO,
      }),
    ).toEqual(recusa({ motivo: 'sem-texto', texto: 'mensagem' }));
  });

  it('no fechado, a recusa do fechado vem antes da do texto', () => {
    expect(
      decidirAcaoDeQuemParticipa(FECHADO, {
        acao: 'responder',
        texto: '',
        anexos: 9,
        quemResolveu: BRUNO,
      }),
    ).toEqual(recusa({ motivo: 'fechado' }));
  });
});

describe('a escolha', () => {
  it('Escolha que chega tarde: a pergunta já respondida recusa', () => {
    expect(
      decidirAcaoDeQuemParticipa(
        EM_ATENDIMENTO,
        escolher('Pode ser', { ...PERGUNTA, respondida: true }),
      ),
    ).toEqual(recusa({ motivo: 'ja-respondida' }));
  });

  it('a opção que não é da pergunta recusa, também na mensagem sem opções', () => {
    expect(decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, escolher('Talvez'))).toEqual(
      recusa({ motivo: 'opcao-de-fora' }),
    );
    // A opção é a da pergunta, como foi gravada.
    expect(decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, escolher('pode ser'))).toEqual(
      recusa({ motivo: 'opcao-de-fora' }),
    );
    expect(
      decidirAcaoDeQuemParticipa(EM_ATENDIMENTO, escolher('Pode ser', { ...PERGUNTA, opcoes: [] })),
    ).toEqual(recusa({ motivo: 'opcao-de-fora' }));
  });

  it('a pergunta já respondida recusa antes da opção de fora', () => {
    expect(
      decidirAcaoDeQuemParticipa(
        EM_ATENDIMENTO,
        escolher('Talvez', { ...PERGUNTA, respondida: true }),
      ),
    ).toEqual(recusa({ motivo: 'ja-respondida' }));
  });

  it('a recusa do resolvido vem antes da pergunta já respondida', () => {
    expect(
      decidirAcaoDeQuemParticipa(
        RESOLVIDO,
        escolher('Pode ser', { ...PERGUNTA, respondida: true }),
      ),
    ).toEqual(recusa({ motivo: 'escreva-para-reabrir' }));
  });
});

describe('a avaliação', () => {
  it('Avaliar de novo: a mesma resolução já avaliada recusa', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, avaliar('bom', null, true))).toEqual(
      recusa({ motivo: 'ja-avaliado' }),
    );
  });

  it('pede um dos quatro níveis e aceita o comentário de até 500 caracteres, sem os espaços das pontas', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, avaliar(null))).toEqual(
      recusa({ motivo: 'sem-nivel' }),
    );
    expect(
      decidirAcaoDeQuemParticipa(RESOLVIDO, avaliar('regular', `  ${'a'.repeat(500)} `)),
    ).toMatchObject({
      conversa: [{ evento: 'avaliou', dados: { nivel: 'regular', comentario: 'a'.repeat(500) } }],
    });
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, avaliar('regular', 'a'.repeat(501)))).toEqual(
      recusa({ motivo: 'comentario-longo' }),
    );
  });

  it('a avaliação já feita recusa antes do nível', () => {
    expect(decidirAcaoDeQuemParticipa(RESOLVIDO, avaliar(null, null, true))).toEqual(
      recusa({ motivo: 'ja-avaliado' }),
    );
  });
});

describe('quem participa pela TI', () => {
  const TODOS = [NA_TRIAGEM, EM_ATENDIMENTO, AGUARDANDO, RESOLVIDO, FECHADO];
  /** O chamado que a conta abriu pelo chat no nome de outra pessoa e atende. */
  const pelaTi = (chamado: ChamadoParaQuemParticipa) => ({ ...chamado, pelaTi: true });

  it('Quem participa pela TI pela rota de quem participa: a mensagem, a escolha e o "Reabrir" são recusados', () => {
    for (const chamado of TODOS) {
      for (const pedido of [responder(), escolher(), reabrir()]) {
        expect(
          decidirAcaoDeQuemParticipa(pelaTi(chamado), pedido),
          `${pedido.acao} em #${chamado.numero}`,
        ).toEqual(recusa({ motivo: 'responda-pela-ti' }));
      }
    }
  });

  it('a avaliação é recusada, também no resolvido', () => {
    for (const chamado of TODOS) {
      expect(decidirAcaoDeQuemParticipa(pelaTi(chamado), avaliar()), `#${chamado.numero}`).toEqual(
        recusa({ motivo: 'quem-atende-nao-avalia' }),
      );
    }
  });

  it('a recusa vem antes da do texto, da pergunta e da avaliação já feita', () => {
    const vazia: PedidoDeQuemParticipa = {
      acao: 'responder',
      texto: ' ',
      anexos: 0,
      quemResolveu: null,
    };
    expect(decidirAcaoDeQuemParticipa(pelaTi(EM_ATENDIMENTO), vazia)).toEqual(
      recusa({ motivo: 'responda-pela-ti' }),
    );
    expect(
      decidirAcaoDeQuemParticipa(
        pelaTi(NA_TRIAGEM),
        escolher('Talvez', { ...PERGUNTA, respondida: true }),
      ),
    ).toEqual(recusa({ motivo: 'responda-pela-ti' }));
    expect(decidirAcaoDeQuemParticipa(pelaTi(RESOLVIDO), avaliar(null, null, true))).toEqual(
      recusa({ motivo: 'quem-atende-nao-avalia' }),
    );
  });

  it('"Marcar como vista" segue valendo: nada muda no chamado', () => {
    for (const chamado of TODOS) {
      expect(decidirAcaoDeQuemParticipa(pelaTi(chamado), VISTA), `#${chamado.numero}`).toEqual(
        semMudar(chamado),
      );
    }
  });
});

describe('a matriz de quem participa', () => {
  it('tem uma célula para cada ação em cada situação, com o fechado', () => {
    expect(ACOES_DE_QUEM_PARTICIPA).toEqual([
      'responder',
      'escolher',
      'reabrir',
      'avaliar',
      'vista',
    ]);
    expect(SITUACOES_DE_QUEM_PARTICIPA).toEqual([
      'triagem',
      'em-atendimento',
      'aguardando',
      'resolvido',
      'fechado',
    ]);
    for (const acao of ACOES_DE_QUEM_PARTICIPA) {
      expect(Object.keys(MATRIZ_DE_QUEM_PARTICIPA[acao]).sort()).toEqual(
        [...SITUACOES_DE_QUEM_PARTICIPA].sort(),
      );
    }
  });

  it('só retoma o aguardando e só reabre o resolvido', () => {
    for (const acao of ACOES_DE_QUEM_PARTICIPA) {
      for (const situacao of SITUACOES_DE_QUEM_PARTICIPA) {
        const celula = MATRIZ_DE_QUEM_PARTICIPA[acao][situacao];
        if (!('faz' in celula)) continue;
        if (celula.faz === 'retomar') expect(situacao, `${acao} em ${situacao}`).toBe('aguardando');
        if (celula.faz === 'reabrir') expect(situacao, `${acao} em ${situacao}`).toBe('resolvido');
      }
    }
  });
});

describe('mensagemDaRecusaDeQuemParticipa', () => {
  it('escreve as frases da spec, com o número do chamado onde ela o pede', () => {
    const frases: [RecusaDeQuemParticipa, string][] = [
      [
        { motivo: 'fechado' },
        'O chamado #1045 está fechado. Para o mesmo problema, abra outro chamado.',
      ],
      [{ motivo: 'escreva-para-reabrir' }, 'O chamado #1045 está resolvido. Escreva para reabrir.'],
      [{ motivo: 'nao-resolvido' }, 'O chamado #1045 não está resolvido.'],
      [{ motivo: 'avaliar-sem-resolver' }, 'O chamado não está resolvido.'],
      [{ motivo: 'ja-avaliado' }, 'O atendimento já foi avaliado.'],
      [{ motivo: 'sem-nivel' }, 'Escolha um nível.'],
      [{ motivo: 'comentario-longo' }, 'Use até 500 caracteres.'],
      [{ motivo: 'ja-respondida' }, 'Esta pergunta já foi respondida.'],
      [{ motivo: 'opcao-de-fora' }, 'Escolha uma opção da pergunta.'],
      [{ motivo: 'sem-texto', texto: 'mensagem' }, 'Escreva a mensagem.'],
      [{ motivo: 'texto-longo', texto: 'mensagem' }, 'Use até 4.000 caracteres.'],
      [{ motivo: 'anexos-demais' }, 'Anexe até 5 arquivos.'],
      [{ motivo: 'responda-pela-ti' }, 'Você atende o chamado #1045. Responda pela TI.'],
      [{ motivo: 'quem-atende-nao-avalia' }, 'Quem atende o chamado #1045 não o avalia.'],
    ];
    for (const [motivo, frase] of frases) {
      expect(mensagemDaRecusaDeQuemParticipa(1045, motivo)).toBe(frase);
    }
  });
});
