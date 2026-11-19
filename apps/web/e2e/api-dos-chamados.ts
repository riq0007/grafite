// A API dos chamados simulada, para as pontas a ponta de "Quem está com o quê" (specs chamados e
// modulo-chamados; change chamados-da-ti, tarefa 5.8): o quadro e a lista dos prazos, montados do
// que a simulação guarda, e o assumir, com a conferência da versão, como a API: a versão que a tela
// manda e não é mais a do chamado é recusada com o 409 `chamado-mudou` e a frase do domínio. O teste
// muda quem atende pela simulação, como outra pessoa da TI, sem avisar a tela. A sessão simulada é
// a da administradora, Ana Souza, que atende em todos os locais.
import type { components } from '@grafite/api-client';
import {
  HORARIO_DA_TI_PADRAO,
  mensagemDaRecusaDaAcao,
  prazoEmMinutos,
  type RelogioDoChamado,
  situacaoDoPrazo,
} from '@grafite/domain';
import type { Page } from '@playwright/test';
import { SESSAO } from './fixtures.ts';

type Quadro = components['schemas']['QuadroDosChamados'];
type Prazos = components['schemas']['PrazosDosChamados'];
type ChamadoDepoisDaAcao = components['schemas']['ChamadoDepoisDaAcao'];

export interface PessoaDaTi {
  conta: string;
  nome: string;
}

/** As pessoas da TI, nas colunas, nesta ordem; Ana Souza é a conta da sessão simulada. */
export const ANA: PessoaDaTi = { conta: SESSAO.sessao.conta.id, nome: 'Ana Souza' };
export const DIEGO: PessoaDaTi = {
  conta: '0199a6e0-0000-7000-8000-0000000000c3',
  nome: 'Diego Martins',
};
export const RENATO: PessoaDaTi = {
  conta: '0199a6e0-0000-7000-8000-0000000000c4',
  nome: 'Renato Alves',
};
const PESSOAS = [ANA, DIEGO, RENATO];

const TIPO = {
  id: '0199a6e0-0000-7000-8000-0000000000e1',
  nome: 'Rede e internet',
  icone: 'globo',
};
const HORA = 3_600_000;

interface ChamadoGuardado {
  numero: number;
  titulo: string;
  pessoa: string;
  abertoEm: Date;
  responsavel: PessoaDaTi | null;
  versao: number;
}

/** Um pedido de ação que a tela mandou, com o corpo. */
export interface PedidoDeAcao {
  acao: 'assumir';
  numero: number;
  corpo: unknown;
}

/**
 * Os chamados abertos há pouco, cada um com 4 h corridas para resolver. O relógio conta desde a
 * abertura, e a situação do prazo sai do domínio, como na API.
 */
function chamadoNosPrazos(chamado: ChamadoGuardado, agora: Date): Prazos['chamados'][number] {
  const relogio: RelogioDoChamado = {
    prazo: prazoEmMinutos(
      {
        modo: 'corridas',
        resposta: { valor: 30, unidade: 'min' },
        resolucao: { valor: 4, unidade: 'h' },
      },
      HORARIO_DA_TI_PADRAO,
    ),
    contadoS: 0,
    relogioDesde: chamado.abertoEm,
    primeiraRespostaEm: null,
  };
  const situacao = situacaoDoPrazo(relogio, HORARIO_DA_TI_PADRAO, agora, HORARIO_DA_TI_PADRAO.fuso);
  return {
    numero: chamado.numero,
    titulo: chamado.titulo,
    situacao: chamado.responsavel ? 'em-atendimento' : 'triagem',
    versao: chamado.versao,
    abertoEm: chamado.abertoEm.toISOString(),
    tipo: TIPO,
    pessoa: {
      id: `0199a6e0-0000-7000-8000-00000000${chamado.numero}`,
      nome: chamado.pessoa,
      local: null,
    },
    responsavel: chamado.responsavel,
    ativo: null,
    locais: [],
    semLocal: true,
    relogio: {
      prazo: relogio.prazo,
      contadoS: relogio.contadoS,
      relogioDesde: chamado.abertoEm.toISOString(),
      primeiraRespostaEm: null,
    },
    grupo: situacao.grupo,
    ultimaMensagem: null,
  };
}

/** O mais antigo dos chamados dados, ou nulo, sem nenhum. */
function maisAntigo(chamados: ChamadoGuardado[]) {
  const [antigo] = [...chamados].sort((a, b) => a.abertoEm.getTime() - b.abertoEm.getTime());
  return antigo ? { numero: antigo.numero, abertoEm: antigo.abertoEm.toISOString() } : null;
}

/**
 * Simula a API dos chamados na página: o #1038, na triagem, e o #1033, com Renato, abertos há 1 e
 * 2 h. Devolve os pedidos de ação que a tela mandou, quem está com cada chamado e o passar de outra
 * pessoa da TI, que sobe a versão sem avisar a tela.
 */
export async function simularChamados(pagina: Page) {
  const agora = Date.now();
  const chamados: ChamadoGuardado[] = [
    {
      numero: 1033,
      titulo: 'Switch Rack 2 sem link na porta 3',
      pessoa: 'Sandra Vieira',
      abertoEm: new Date(agora - 2 * HORA),
      responsavel: RENATO,
      versao: 1,
    },
    {
      numero: 1038,
      titulo: 'Wi-Fi cai na Sala Atlântico',
      pessoa: 'Helena Prado',
      abertoEm: new Date(agora - HORA),
      responsavel: null,
      versao: 1,
    },
  ];
  const pedidos: PedidoDeAcao[] = [];
  const doNumero = (numero: number) => chamados.find((chamado) => chamado.numero === numero);
  const comQuem = (pessoa: PessoaDaTi | null) =>
    chamados.filter((chamado) => chamado.responsavel?.conta === pessoa?.conta);

  const quadro = (): Quadro => ({
    triagem: {
      abertos: comQuem(null).map(({ numero }) => numero),
      maisAntigo: maisAntigo(comQuem(null)),
    },
    colunas: PESSOAS.map((pessoa) => {
      const abertos = comQuem(pessoa);
      return {
        conta: pessoa.conta,
        nome: pessoa.nome,
        naoAtendeMais: false,
        abertos: abertos.map(({ numero }) => numero),
        maisAntigo: maisAntigo(abertos),
        pedacos: {
          total: HORARIO_DA_TI_PADRAO.cargaCheia,
          cheios: Math.min(abertos.length, HORARIO_DA_TI_PADRAO.cargaCheia),
        },
        resolvidosHoje: [],
        atende: { organizacao: true, locais: [] },
      };
    }),
    resolvidosHoje: [],
    versoes: Object.fromEntries(chamados.map(({ numero, versao }) => [numero, versao])),
    contandoSoOsLocaisQueVe: false,
  });

  await pagina.route('**/api/chamados/quadro*', (rota) =>
    rota.request().method() === 'GET' ? rota.fulfill({ json: quadro() }) : rota.fallback(),
  );
  await pagina.route('**/api/chamados/prazos*', (rota) =>
    rota.request().method() === 'GET'
      ? rota.fulfill({
          json: {
            horario: { ...HORARIO_DA_TI_PADRAO, dias: [...HORARIO_DA_TI_PADRAO.dias] },
            chamados: chamados.map((chamado) => chamadoNosPrazos(chamado, new Date())),
          } satisfies Prazos,
        })
      : rota.fallback(),
  );
  await pagina.route('**/api/chamados/*/assumir', (rota) => {
    if (rota.request().method() !== 'POST') return rota.fallback();
    const numero = Number(new URL(rota.request().url()).pathname.split('/').at(-2));
    const corpo = rota.request().postDataJSON() as { versao?: number };
    pedidos.push({ acao: 'assumir', numero, corpo });
    const chamado = doNumero(numero);
    if (!chamado) return rota.fulfill({ status: 404, json: {} });
    if (corpo.versao !== undefined && corpo.versao !== chamado.versao) {
      return rota.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'urn:grafite:problema:chamado-mudou',
          title: 'Chamado mudou',
          status: 409,
          detail: mensagemDaRecusaDaAcao(numero, { motivo: 'versao', acao: 'assumir' }),
        }),
      });
    }
    chamado.responsavel = ANA;
    chamado.versao += 1;
    return rota.fulfill({
      json: {
        numero,
        versao: chamado.versao,
        situacao: 'em-atendimento',
        responsavel: { id: ANA.conta, nome: ANA.nome },
      } satisfies ChamadoDepoisDaAcao,
    });
  });

  return {
    pedidos,
    /** Quem está com o chamado agora, na simulação. */
    responsavelDo: (numero: number) => doNumero(numero)?.responsavel ?? null,
    /** Outra pessoa da TI passa o chamado, e a versão sobe, sem avisar a tela. */
    passar(numero: number, para: PessoaDaTi) {
      const chamado = doNumero(numero);
      if (!chamado) throw new Error(`A simulação não tem o #${numero}.`);
      chamado.responsavel = para;
      chamado.versao += 1;
    },
  };
}
