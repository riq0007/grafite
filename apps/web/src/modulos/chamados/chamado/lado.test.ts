import { criarDataHora } from '@grafite/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FichaDoChamado } from '../consultas.ts';
import {
  acoesDoAtivo,
  contatosDaPessoa,
  gravarSecoes,
  lerSecoes,
  linhaDoTempo,
  linhasDoEstoque,
  preencheOsCampos,
  textoDasOrdens,
} from './lado.ts';

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
  tipo: { podeVirarOs: true },
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

  it('o tipo que não vira OS fica sem o virar OS, e o resto continua', () => {
    // Como o #2, de Toner: a recusa "O tipo Toner não vira OS." só viria com a gaveta preenchida.
    expect(acoesDoAtivo({ ...FICHA, tipo: { podeVirarOs: false } }, TUDO)).toEqual({
      virarOs: false,
      pedirToner: true,
      trocar: 'trocar',
    });
  });

  it('a OS que o chamado tem tira o virar OS, e a solicitação, o pedir toner', () => {
    const os = {
      id: '0190a000-0000-7000-8000-000000000013',
      numero: 13,
      situacao: 'aberta',
      ativo: { id: '0190a000-0000-7000-8000-000000000139', rotulo: 'Impressora', patrimonio: null },
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

describe('quem preenche os campos só da TI', () => {
  it('quem atende os locais do chamado, fora do resolvido, como a API', () => {
    expect(preencheOsCampos(FICHA)).toBe(true);
    expect(preencheOsCampos({ ...FICHA, situacao: 'triagem' })).toBe(true);
    expect(preencheOsCampos({ ...FICHA, situacao: 'aguardando' })).toBe(true);
  });

  it('quem só vê o chamado e o chamado resolvido só leem', () => {
    expect(preencheOsCampos({ ...FICHA, permite: { atender: false } })).toBe(false);
    expect(preencheOsCampos({ ...FICHA, situacao: 'resolvido' })).toBe(false);
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

type Item = FichaDoChamado['conversa'][number];
type Evento = Extract<Item, { especie: 'evento' }>;

const ANA = {
  tipo: 'conta',
  id: '0190a000-0000-7000-8000-00000000a0a0',
  nome: 'Ana Souza',
} as const;
const BRUNO = {
  tipo: 'conta',
  id: '0190a000-0000-7000-8000-00000000b0b0',
  nome: 'Bruno Lima',
} as const;
const FERNANDA = {
  tipo: 'pessoa',
  id: '0190a000-0000-7000-8000-00000000f0f0',
  nome: 'Fernanda Rocha',
} as const;
const contaDe = (autor: typeof ANA | typeof BRUNO) => ({ conta: autor.id, nome: autor.nome });

let sequencia = 0;
const proximoId = () => {
  sequencia += 1;
  return `0190a000-0000-7000-8000-${String(sequencia).padStart(12, '0')}`;
};

function evento(
  qual: Evento['evento'],
  em: string,
  autor: Evento['autor'],
  dados: Partial<Evento> = {},
): Item {
  return {
    especie: 'evento',
    id: proximoId(),
    em,
    autor,
    evento: qual,
    de: null,
    para: null,
    desde: null,
    ativo: null,
    os: null,
    solicitacao: null,
    motivo: null,
    avaliacao: null,
    resumo: null,
    ...dados,
  };
}

const mensagem = (em: string, autor: NonNullable<Evento['autor']>): Item => ({
  especie: 'mensagem',
  id: proximoId(),
  em,
  autor,
  texto: 'Pode testar agora?',
  anexos: [],
  opcoes: null,
  escolhida: null,
  cartao: null,
});

// Hoje é 18/11, ao meio-dia de São Paulo.
const AGORA = new Date('2026-11-18T15:00:00Z');
const dataHora = criarDataHora('America/Sao_Paulo');
const linha = (conversa: Item[], pessoa = 'Fernanda Rocha') =>
  linhaDoTempo(conversa, { pessoa, agora: AGORA, dataHora });

describe('a linha do tempo (spec modulo-chamados, "Chamado aberto")', () => {
  it('o #1041 do m03: a triagem, o atendimento e a espera, com o último como o de agora', () => {
    expect(
      linha([
        evento('abertura', '2026-11-17T20:05:00Z', FERNANDA),
        mensagem('2026-11-17T20:05:00Z', FERNANDA),
        evento('assumiu', '2026-11-17T20:20:00Z', ANA, { desde: '2026-11-17T20:05:00Z' }),
        {
          especie: 'alerta',
          id: proximoId(),
          em: '2026-11-18T12:00:00Z',
          texto: 'Offline',
          severidade: 'critico',
        },
        mensagem('2026-11-18T12:21:00Z', ANA),
        evento('aguardando', '2026-11-18T12:21:00Z', ANA),
      ]),
    ).toMatchObject([
      { titulo: 'Na triagem', texto: 'ontem, 17:05 · aberto por Fernanda Rocha', agora: false },
      { titulo: 'Em atendimento', texto: 'ontem, 17:20 · assumido por Ana Souza', agora: false },
      { titulo: 'Aguardando o colaborador', texto: 'hoje, 09:21 · o relógio parou', agora: true },
    ]);
  });

  it('o #1042 do m04: a troca do ativo, a OS e a solicitação ficam só na conversa', () => {
    const marina = { ...FERNANDA, nome: 'Marina Rocha' };
    expect(
      linha(
        [
          evento('abertura', '2026-11-18T10:40:00Z', marina),
          evento('solicitacao', '2026-11-18T10:40:00Z', marina, {
            solicitacao: { numero: 4, como: 'gerou' },
          }),
          evento('assumiu', '2026-11-18T12:40:00Z', ANA, { desde: '2026-11-18T10:40:00Z' }),
          evento('os', '2026-11-18T12:45:00Z', ANA, { os: { numero: 12 } }),
        ],
        'Marina Rocha',
      ),
    ).toMatchObject([
      { titulo: 'Na triagem', texto: 'hoje, 07:40 · aberto por Marina Rocha', agora: false },
      { titulo: 'Em atendimento', texto: 'hoje, 09:40 · assumido por Ana Souza', agora: true },
    ]);
  });

  it('a abertura pela TI diz para quem', () => {
    expect(linha([evento('abertura', '2026-11-18T10:40:00Z', ANA)], 'Marina Rocha')).toMatchObject([
      { titulo: 'Na triagem', texto: 'hoje, 07:40 · aberto por Ana Souza para Marina Rocha' },
    ]);
  });

  it('a abertura com quem atende nasce Em atendimento, com quem atende quando não é quem abriu', () => {
    // O "Fica comigo": quem abriu é quem atende.
    expect(
      linha(
        [evento('abertura', '2026-11-18T10:40:00Z', ANA, { para: contaDe(ANA) })],
        'Marina Rocha',
      ),
    ).toMatchObject([
      {
        titulo: 'Em atendimento',
        texto: 'hoje, 07:40 · aberto por Ana Souza para Marina Rocha',
        agora: true,
      },
    ]);
    // Quem atende o tipo por padrão.
    expect(
      linha([evento('abertura', '2026-11-18T10:40:00Z', FERNANDA, { para: contaDe(BRUNO) })]),
    ).toMatchObject([
      {
        titulo: 'Em atendimento',
        texto: 'hoje, 07:40 · aberto por Fernanda Rocha · com Bruno Lima',
        agora: true,
      },
    ]);
  });

  it('o assumir e o passar no aguardando continuam no aguardando, e o devolver volta à triagem', () => {
    const passos = linha([
      evento('abertura', '2026-11-18T10:40:00Z', FERNANDA),
      evento('assumiu', '2026-11-18T12:40:00Z', ANA),
      evento('aguardando', '2026-11-18T12:41:00Z', ANA),
      evento('passou', '2026-11-18T13:00:00Z', ANA, {
        de: contaDe(ANA),
        para: contaDe(BRUNO),
      }),
      evento('assumiu', '2026-11-18T13:10:00Z', ANA, { de: contaDe(BRUNO) }),
    ]);
    expect(passos.slice(3)).toMatchObject([
      {
        titulo: 'Aguardando o colaborador',
        texto: 'hoje, 10:00 · passado para Bruno Lima por Ana Souza',
      },
      { titulo: 'Aguardando o colaborador', texto: 'hoje, 10:10 · assumido por Ana Souza' },
    ]);
    expect(
      linha([
        evento('abertura', '2026-11-18T10:40:00Z', FERNANDA),
        evento('passou', '2026-11-18T12:40:00Z', ANA, { para: contaDe(BRUNO) }),
        evento('devolveu', '2026-11-18T13:00:00Z', BRUNO, { de: contaDe(BRUNO) }),
      ]).slice(1),
    ).toMatchObject([
      { titulo: 'Em atendimento', texto: 'hoje, 09:40 · passado para Bruno Lima por Ana Souza' },
      { titulo: 'Na triagem', texto: 'hoje, 10:00 · devolvido por Bruno Lima', agora: true },
    ]);
  });

  it('o desfazer tira o assumir que ele desfaz', () => {
    expect(
      linha([
        evento('abertura', '2026-11-18T10:40:00Z', FERNANDA),
        evento('assumiu', '2026-11-18T12:40:00Z', ANA),
        evento('desfez', '2026-11-18T12:40:05Z', ANA, { desde: '2026-11-18T10:40:00Z' }),
      ]),
    ).toMatchObject([{ titulo: 'Na triagem', agora: true }]);
    // No aguardando, o desfazer volta à espera com quem estava.
    expect(
      linha([
        evento('abertura', '2026-11-18T10:40:00Z', FERNANDA),
        evento('assumiu', '2026-11-18T12:00:00Z', BRUNO),
        evento('aguardando', '2026-11-18T12:30:00Z', BRUNO),
        evento('assumiu', '2026-11-18T12:40:00Z', ANA, { de: contaDe(BRUNO) }),
        evento('desfez', '2026-11-18T12:40:05Z', ANA, { para: contaDe(BRUNO) }),
      ]).map((passo) => passo.titulo),
    ).toEqual(['Na triagem', 'Em atendimento', 'Aguardando o colaborador']);
  });

  it('a retomada e a reabertura voltam a contar, e a resolução para o relógio que contava', () => {
    const abertoEEsperando = [
      evento('abertura', '2026-11-18T10:40:00Z', FERNANDA),
      evento('assumiu', '2026-11-18T12:40:00Z', ANA),
      evento('aguardando', '2026-11-18T12:41:00Z', ANA),
    ];
    expect(
      linha([
        ...abertoEEsperando,
        evento('retomou', '2026-11-18T13:30:00Z', ANA),
        evento('resolveu', '2026-11-18T14:00:00Z', ANA),
        evento('reabriu', '2026-11-18T14:30:00Z', BRUNO, { para: contaDe(ANA) }),
        evento('resolveu', '2026-11-18T14:40:00Z', ANA),
        evento('reabriu', '2026-11-18T14:50:00Z', ANA),
      ]).slice(3),
    ).toMatchObject([
      {
        titulo: 'Em atendimento',
        texto: 'hoje, 10:30 · retomado por Ana Souza · o relógio voltou a contar',
      },
      { titulo: 'Resolvido', texto: 'hoje, 11:00 · resolvido por Ana Souza · o relógio parou' },
      {
        titulo: 'Em atendimento',
        texto: 'hoje, 11:30 · reaberto por Bruno Lima para Ana Souza · o relógio voltou a contar',
      },
      { titulo: 'Resolvido', texto: 'hoje, 11:40 · resolvido por Ana Souza · o relógio parou' },
      {
        titulo: 'Na triagem',
        texto: 'hoje, 11:50 · reaberto por Ana Souza · o relógio voltou a contar',
        agora: true,
      },
    ]);
    // Resolvido do aguardando: o relógio já estava parado.
    expect(
      linha([...abertoEEsperando, evento('resolveu', '2026-11-18T14:00:00Z', ANA)]).at(-1),
    ).toMatchObject({ titulo: 'Resolvido', texto: 'hoje, 11:00 · resolvido por Ana Souza' });
  });

  it('o fechado ganha "Fechado · 17/11" depois do resolvido, como o passo de agora', () => {
    // Resolvido em 10/11, ele se reabriu até 17/11 e fechou na meia-noite de 18/11.
    const resolvido = [
      evento('abertura', '2026-11-09T13:00:00Z', FERNANDA),
      evento('assumiu', '2026-11-09T13:10:00Z', ANA),
      evento('resolveu', '2026-11-10T14:00:00Z', ANA),
    ];
    const fechou = evento('fechou', '2026-11-18T03:00:00Z', null);
    // Com o evento da tarefa do fechamento e sem ele, no vencido que ela ainda não fechou.
    for (const conversa of [resolvido, [...resolvido, fechou]]) {
      const passos = linhaDoTempo(conversa, {
        pessoa: 'Fernanda Rocha',
        agora: AGORA,
        dataHora,
        fechado: '17/11',
      });
      expect(passos.slice(2)).toMatchObject([
        { titulo: 'Resolvido', agora: false },
        { titulo: 'Fechado', texto: '17/11', agora: true },
      ]);
    }
    expect(
      linhaDoTempo([...resolvido, fechou], {
        pessoa: 'Fernanda Rocha',
        agora: AGORA,
        dataHora,
        fechado: '17/11',
      }).at(-1)?.id,
    ).toBe(fechou.id);
    // Sem fechar, o resolvido é o de agora.
    expect(linha(resolvido).at(-1)).toMatchObject({ titulo: 'Resolvido', agora: true });
  });
});

describe('as seções guardadas neste navegador', () => {
  const DE_FABRICA = { pessoa: false, ativo: true, linha: true, campos: false };

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('começam com o Ativo ligado e a Linha do tempo abertos', () => {
    expect(lerSecoes()).toEqual(DE_FABRICA);
  });

  it('a escolha fica guardada, a mesma para os outros chamados', () => {
    gravarSecoes({ ...DE_FABRICA, linha: false, campos: true });
    expect(lerSecoes()).toEqual({ ...DE_FABRICA, linha: false, campos: true });
  });

  it('o guardado que não se lê fica com a fábrica, seção por seção', () => {
    localStorage.setItem('grafite.chamados.secoes', '{quebrado');
    expect(lerSecoes()).toEqual(DE_FABRICA);
    localStorage.setItem('grafite.chamados.secoes', JSON.stringify({ linha: 'não', pessoa: true }));
    expect(lerSecoes()).toEqual({ ...DE_FABRICA, pessoa: true });
  });

  it('com o armazenamento bloqueado, a fábrica, sem erro', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(lerSecoes()).toEqual(DE_FABRICA);
    expect(() => gravarSecoes({ ...DE_FABRICA, pessoa: true })).not.toThrow();
  });
});
