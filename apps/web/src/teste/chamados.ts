// Os chamados dos testes da web (spec chamados e modulo-chamados; change chamados-da-ti): a fila das
// 09:40 de qua 11/11/2026 dos mockups (m01 a m12), com o quadro e a lista dos prazos como a API os
// devolve, e o servidor dos dois, que guarda o que devolve para o teste mudar e relê-lo.
import type { components } from '@grafite/api-client';
import {
  HORARIO_DA_TI_PADRAO,
  prazoEmMinutos,
  type RelogioDoChamado,
  situacaoDoPrazo,
} from '@grafite/domain';
import { vi } from 'vitest';
import { type RelogioDaApi, relogioDaApi } from '../modulos/chamados/prazo.ts';
import { CONTA_DE_EXEMPLO, type ServidorDeTeste } from './sessao.ts';

export type QuadroDeTeste = components['schemas']['QuadroDosChamados'];
export type ColunaDeTeste = QuadroDeTeste['colunas'][number];
export type PrazosDeTeste = components['schemas']['PrazosDosChamados'];
export type ChamadoNosPrazosDeTeste = PrazosDeTeste['chamados'][number];

/** O instante no relógio de São Paulo (UTC−3). */
export const sp = (dataHora: string) => new Date(`${dataHora}-03:00`);

/** Agora, nos mockups: qua 11/11/2026, 09:40, em São Paulo. */
export const AGORA_DOS_MOCKUPS = sp('2026-11-11T09:40:00');
export const FUSO_DOS_MOCKUPS = 'America/Sao_Paulo';
export const HORARIO_DOS_MOCKUPS = HORARIO_DA_TI_PADRAO;

const MINUTO = 60_000;

/** A conta da sessão de exemplo, que sempre tem o id. */
function idDaContaDeExemplo(): string {
  if (CONTA_DE_EXEMPLO.id === null) throw new Error('A conta de exemplo não tem id.');
  return CONTA_DE_EXEMPLO.id;
}

/** As contas da TI; Ana Souza é a conta da sessão de exemplo. */
export const ANA = { conta: idDaContaDeExemplo(), nome: 'Ana Souza' };
export const BRUNO = { conta: '0199a6e0-0000-7000-8000-0000000000c2', nome: 'Bruno Lima' };
export const DIEGO = { conta: '0199a6e0-0000-7000-8000-0000000000c3', nome: 'Diego Martins' };
export const RENATO = { conta: '0199a6e0-0000-7000-8000-0000000000c4', nome: 'Renato Alves' };

/** Os tipos de fábrica que a fila usa, com o nome e o ícone. */
export const TIPOS_DOS_MOCKUPS = {
  rede: { id: '0199a6e0-0000-7000-8000-0000000000e1', nome: 'Rede e internet', icone: 'globo' },
  computador: { id: '0199a6e0-0000-7000-8000-0000000000e2', nome: 'Computador', icone: 'notebook' },
  acesso: { id: '0199a6e0-0000-7000-8000-0000000000e3', nome: 'Acesso e senha', icone: 'cadeado' },
  telefone: { id: '0199a6e0-0000-7000-8000-0000000000e4', nome: 'Telefone', icone: 'telefone' },
  toner: { id: '0199a6e0-0000-7000-8000-0000000000e5', nome: 'Toner', icone: 'gota' },
  impressora: {
    id: '0199a6e0-0000-7000-8000-0000000000e6',
    nome: 'Impressora',
    icone: 'impressora',
  },
  outro: { id: '0199a6e0-0000-7000-8000-0000000000e7', nome: 'Outro', icone: 'reticencias' },
  software: { id: '0199a6e0-0000-7000-8000-0000000000e8', nome: 'Software', icone: 'janela' },
} as const;

const naApi = (relogio: RelogioDoChamado): RelogioDaApi => ({
  prazo: relogio.prazo,
  contadoS: relogio.contadoS,
  relogioDesde: relogio.relogioDesde?.toISOString() ?? null,
  primeiraRespostaEm: relogio.primeiraRespostaEm?.toISOString() ?? null,
});

const prazoDe = (horas: number) =>
  prazoEmMinutos(
    {
      modo: 'corridas',
      resposta: { valor: 30, unidade: 'min' },
      resolucao: { valor: horas, unidade: 'h' },
    },
    HORARIO_DOS_MOCKUPS,
  );

/** O relógio que conta, em horas corridas, e vence daqui a tantos minutos (negativo, estourou). */
export function correndo(horas: number, venceEmMin: number): RelogioDaApi {
  const desde = new Date(AGORA_DOS_MOCKUPS.getTime() - (horas * 60 - venceEmMin) * MINUTO);
  return naApi({
    prazo: prazoDe(horas),
    contadoS: 0,
    relogioDesde: desde,
    primeiraRespostaEm: new Date(desde.getTime() + 10 * MINUTO),
  });
}

/** O relógio parado, com tantos minutos contados. */
export function parado(horas: number, contadoMin: number): RelogioDaApi {
  return naApi({
    prazo: prazoDe(horas),
    contadoS: contadoMin * 60,
    relogioDesde: null,
    primeiraRespostaEm: sp('2026-11-10T17:22:00'),
  });
}

type Quem = { conta: string; nome: string } | null;

/** Um chamado aberto da lista dos prazos, como a API o devolve. */
export function chamadoNosPrazos(
  numero: number,
  tipo: keyof typeof TIPOS_DOS_MOCKUPS,
  titulo: string,
  {
    pessoa,
    responsavel,
    abertoEm,
    relogio,
  }: { pessoa: string; responsavel: Quem; abertoEm: Date; relogio: RelogioDaApi | null },
): ChamadoNosPrazosDeTeste {
  const situacao = relogio
    ? situacaoDoPrazo(
        relogioDaApi(relogio),
        HORARIO_DOS_MOCKUPS,
        AGORA_DOS_MOCKUPS,
        FUSO_DOS_MOCKUPS,
      )
    : null;
  return {
    numero,
    titulo,
    situacao:
      responsavel === null
        ? 'triagem'
        : situacao?.grupo === 'parado'
          ? 'aguardando'
          : 'em-atendimento',
    versao: 1,
    abertoEm: abertoEm.toISOString(),
    tipo: { ...TIPOS_DOS_MOCKUPS[tipo] },
    pessoa: { id: `0199a6e0-0000-7000-8000-00000000${numero}`, nome: pessoa, local: null },
    responsavel,
    ativo: null,
    locais: [],
    semLocal: true,
    relogio,
    grupo: situacao?.grupo ?? null,
    ultimaMensagem: null,
  };
}

/** Os 12 chamados abertos às 09:40, pela ordem do número. */
export const CHAMADOS_DOS_MOCKUPS: ChamadoNosPrazosDeTeste[] = [
  chamadoNosPrazos(1029, 'outro', 'Monitor extra para a Sala Atlântico', {
    pessoa: 'Helena Prado',
    responsavel: DIEGO,
    abertoEm: sp('2026-11-08T09:40:00'),
    relogio: parado(24, 7 * 60),
  }),
  chamadoNosPrazos(1031, 'acesso', 'Senha do sistema bloqueada', {
    pessoa: 'Otávio Neves',
    responsavel: ANA,
    abertoEm: sp('2026-11-10T17:40:00'),
    relogio: correndo(4, 120),
  }),
  chamadoNosPrazos(1032, 'software', 'Licença do Office expirada', {
    pessoa: 'Camila Rezende',
    responsavel: BRUNO,
    abertoEm: sp('2026-11-09T11:20:00'),
    relogio: parado(24, 12 * 60),
  }),
  chamadoNosPrazos(1033, 'rede', 'Switch Rack 2 sem link na porta 3', {
    pessoa: 'Sandra Vieira',
    responsavel: RENATO,
    abertoEm: sp('2026-11-11T01:20:00'),
    relogio: correndo(8, -20),
  }),
  chamadoNosPrazos(1034, 'outro', 'Controle da portaria não lê o cartão', {
    pessoa: 'Portaria',
    responsavel: BRUNO,
    abertoEm: sp('2026-11-10T16:40:00'),
    relogio: correndo(24, 7 * 60),
  }),
  chamadoNosPrazos(1036, 'outro', 'Trocar o teclado da Portaria', {
    pessoa: 'Portaria',
    responsavel: DIEGO,
    abertoEm: sp('2026-11-10T17:40:00'),
    relogio: correndo(24, 8 * 60),
  }),
  chamadoNosPrazos(1037, 'telefone', 'Ramal 214 sem tom de discagem', {
    pessoa: 'Tiago Moura',
    responsavel: RENATO,
    abertoEm: sp('2026-11-11T03:40:00'),
    relogio: correndo(10, 4 * 60),
  }),
  chamadoNosPrazos(1038, 'rede', 'Wi-Fi cai na Sala Atlântico', {
    pessoa: 'Helena Prado',
    responsavel: null,
    abertoEm: sp('2026-11-11T03:40:00'),
    relogio: correndo(8, 120),
  }),
  chamadoNosPrazos(1039, 'computador', 'Notebook não liga', {
    pessoa: 'Luiza Farias',
    responsavel: DIEGO,
    abertoEm: sp('2026-11-11T05:40:00'),
    relogio: correndo(5, 60),
  }),
  chamadoNosPrazos(1040, 'toner', 'Toner CF258A acabando no Financeiro', {
    pessoa: 'Paulo Nunes',
    responsavel: null,
    abertoEm: sp('2026-11-11T06:52:00'),
    relogio: correndo(8, 5 * 60 + 12),
  }),
  chamadoNosPrazos(1041, 'acesso', 'Sem acesso à pasta do Financeiro', {
    pessoa: 'Fernanda Rocha',
    responsavel: ANA,
    abertoEm: sp('2026-11-10T17:05:00'),
    relogio: parado(4, 2 * 60 + 16),
  }),
  chamadoNosPrazos(1042, 'impressora', 'Impressora da Recepção manchando', {
    pessoa: 'Marina Rocha',
    responsavel: null,
    abertoEm: sp('2026-11-11T07:40:00'),
    relogio: correndo(8, 6 * 60 + 20),
  }),
];

const maisAntigo = (numero: number, abertoEm: Date) => ({
  numero,
  abertoEm: abertoEm.toISOString(),
});

/** A coluna de uma pessoa da TI, que atende a organização inteira, na carga cheia de 5. */
export function coluna(
  quem: { conta: string; nome: string },
  abertos: number[],
  antigo: { numero: number; abertoEm: Date } | null,
  extras: Partial<ColunaDeTeste> = {},
): ColunaDeTeste {
  return {
    conta: quem.conta,
    nome: quem.nome,
    naoAtendeMais: false,
    abertos,
    maisAntigo: antigo && maisAntigo(antigo.numero, antigo.abertoEm),
    pedacos: { total: 5, cheios: Math.min(abertos.length, 5) },
    resolvidosHoje: [],
    atende: { organizacao: true, locais: [] },
    ...extras,
  };
}

/** O quadro das 09:40: 3 na triagem e 9 com as quatro pessoas, 12 abertos. */
export const QUADRO_DOS_MOCKUPS: QuadroDeTeste = {
  triagem: {
    abertos: [1038, 1040, 1042],
    maisAntigo: maisAntigo(1038, sp('2026-11-11T03:40:00')),
  },
  colunas: [
    coluna(
      ANA,
      [1031, 1041],
      { numero: 1041, abertoEm: sp('2026-11-10T17:05:00') },
      {
        resolvidosHoje: [1035],
      },
    ),
    coluna(BRUNO, [1032, 1034], { numero: 1032, abertoEm: sp('2026-11-09T11:20:00') }),
    coluna(DIEGO, [1029, 1036, 1039], { numero: 1029, abertoEm: sp('2026-11-08T09:40:00') }),
    coluna(RENATO, [1033, 1037], { numero: 1033, abertoEm: sp('2026-11-11T01:20:00') }),
  ],
  resolvidosHoje: [1035],
  versoes: Object.fromEntries(CHAMADOS_DOS_MOCKUPS.map(({ numero }) => [numero, 1])),
  contandoSoOsLocaisQueVe: false,
};

export const PRAZOS_DOS_MOCKUPS: PrazosDeTeste = {
  horario: { ...HORARIO_DOS_MOCKUPS, dias: [1, 2, 3, 4, 5] },
  chamados: CHAMADOS_DOS_MOCKUPS,
};

/**
 * O servidor do quadro e da lista dos prazos: cada um devolve o que o estado tem na hora. O teste
 * troca o estado e publica o `chamados.mudaram` para a tela reler.
 */
export function servidorDoQuadro(inicial: { quadro?: QuadroDeTeste; prazos?: PrazosDeTeste } = {}) {
  const estado = {
    quadro: inicial.quadro ?? QUADRO_DOS_MOCKUPS,
    prazos: inicial.prazos ?? PRAZOS_DOS_MOCKUPS,
  };
  const quadro = vi.fn((_pedido: Request): Response | Promise<Response> =>
    Response.json(estado.quadro),
  );
  const prazos = vi.fn((_pedido: Request): Response | Promise<Response> =>
    Response.json(estado.prazos),
  );
  const servidor: ServidorDeTeste = {
    'GET /api/chamados/quadro': (pedido) => quadro(pedido),
    'GET /api/chamados/prazos': (pedido) => prazos(pedido),
    'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
  };
  return { servidor, estado, quadro, prazos };
}
