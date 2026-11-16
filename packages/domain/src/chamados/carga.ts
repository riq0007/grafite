// A carga de cada pessoa da TI e a saudação do Início (spec chamados, "Carga de cada pessoa"; spec
// modulo-chamados, "Início dos chamados" e "Quem está com o quê"; change chamados-da-ti, design,
// decisão 7). Conta só os chamados que a conta que olha vê, no dia do fuso dela. A ordem dos
// quadrados pelo vencimento fica com a tela, pelo `compararPrazos`.
import { relogioDoFuso } from '../fuso.ts';
import { nomeCurto } from '../pessoas/pessoa.ts';
import type { SituacaoDoChamado } from './acoes.ts';
import {
  type AlcanceDeQuemAtende,
  type AlcanceDeQuemVe,
  atendeOChamado,
  ehDaTi,
  type LocaisDoChamado,
  veOChamado,
} from './atendimento.ts';

/** O aviso a quem não vê os chamados da organização inteira, junto das contagens. */
export const AVISO_DO_ALCANCE = 'Contando só os chamados dos locais que você vê.';

/** A conta como está agora: as ativas com `chamados.atender` e as que estão com algum aberto. */
export interface ContaNaCarga {
  id: string;
  nome: string;
  ativa: boolean;
  /** O alcance de `chamados.atender`, pelo `alcance` do acesso. */
  alcance: AlcanceDeQuemAtende;
}

/** O chamado aberto ou resolvido, com os locais dele. */
export interface ChamadoNaCarga extends LocaisDoChamado {
  numero: number;
  situacao: SituacaoDoChamado;
  /** Quem atende; nulo na triagem. */
  responsavel: string | null;
  abertoEm: Date;
  resolvidoEm: Date | null;
  resolvidoPor: string | null;
}

export interface PedidoDaCarga {
  contas: readonly ContaNaCarga[];
  chamados: readonly ChamadoNaCarga[];
  /** O alcance de `chamados.ver` de quem olha. */
  alcanceDeQuemOlha: AlcanceDeQuemVe;
  /** A carga cheia do horário da TI. */
  cargaCheia: number;
  agora: Date;
  /** O fuso de quem olha, que diz o que é hoje. */
  fuso: string;
}

/** O aberto há mais tempo, pela abertura: "mais antigo #1041, há 17 h". */
export interface ChamadoMaisAntigo {
  numero: number;
  abertoEm: Date;
}

/** A coluna de uma pessoa, ou a dos chamados que ela não atende mais. */
export interface ColunaDaCarga {
  conta: string;
  nome: string;
  naoAtendeMais: boolean;
  /** Os números dos Em atendimento e dos Aguardando o colaborador, do menor ao maior. */
  abertos: number[];
  maisAntigo: ChamadoMaisAntigo | null;
  /** A barra: tantos pedaços quanto a carga cheia, um cheio por chamado. */
  pedacos: { total: number; cheios: number };
  /** Os números dos que a conta resolveu hoje, do menor ao maior. */
  resolvidosHoje: number[];
}

export interface CargaDasPessoas {
  /** Os chamados da triagem, na coluna "Sem responsável". */
  triagem: { abertos: number[]; maisAntigo: ChamadoMaisAntigo | null };
  /** As pessoas da TI pelo nome, e depois as colunas de quem não atende mais, também pelo nome. */
  colunas: ColunaDaCarga[];
  /**
   * Todos os resolvidos hoje que quem olha vê, de quem quer que os tenha resolvido, do menor ao
   * maior: a contagem do Início.
   */
  resolvidosHoje: number[];
  /** Se a tela mostra o `AVISO_DO_ALCANCE`. */
  contandoSoOsLocaisQueVe: boolean;
}

/** Se o chamado foi aberto antes do outro; no empate, o de menor número. */
const abertoAntes = (chamado: ChamadoNaCarga, outro: ChamadoNaCarga) =>
  (chamado.abertoEm.getTime() - outro.abertoEm.getTime() || chamado.numero - outro.numero) < 0;

function maisAntigoDe(chamados: readonly ChamadoNaCarga[]): ChamadoMaisAntigo | null {
  let antigo: ChamadoNaCarga | null = null;
  for (const chamado of chamados) {
    if (!antigo || abertoAntes(chamado, antigo)) antigo = chamado;
  }
  return antigo && { numero: antigo.numero, abertoEm: antigo.abertoEm };
}

const crescente = (numeros: readonly number[]) => [...numeros].sort((a, b) => a - b);

interface Monte {
  conta: ContaNaCarga;
  naoAtendeMais: boolean;
  abertos: ChamadoNaCarga[];
  resolvidosHoje: number[];
}

const porNome = (a: Monte, b: Monte) =>
  a.conta.nome.localeCompare(b.conta.nome, 'pt-BR') ||
  (a.conta.id < b.conta.id ? -1 : a.conta.id > b.conta.id ? 1 : 0);

/**
 * A triagem e as colunas das pessoas, só com os chamados que quem olha vê. O chamado aberto de uma
 * conta que não o atende mais vai para a coluna dela de quem não atende mais, que só aparece com
 * algum aberto. O resolvido hoje é de quem resolveu: na coluna de pessoa da TI dela ou, sem ela, na
 * de quem não atende mais; o total, para a contagem do Início, leva também os que não ficam em
 * coluna nenhuma. Recusa o aberto sem quem atende ou com uma conta que não veio.
 */
export function cargaDasPessoas(pedido: PedidoDaCarga): CargaDasPessoas {
  const contas = new Map(pedido.contas.map((conta) => [conta.id, conta]));
  const daTiPorConta = new Map<string, Monte>();
  for (const conta of pedido.contas) {
    if (ehDaTi(conta)) {
      daTiPorConta.set(conta.id, { conta, naoAtendeMais: false, abertos: [], resolvidosHoje: [] });
    }
  }
  const naoAtendePorConta = new Map<string, Monte>();
  const vistos = pedido.chamados.filter((chamado) => veOChamado(pedido.alcanceDeQuemOlha, chamado));

  const triagem: ChamadoNaCarga[] = [];
  for (const chamado of vistos) {
    if (chamado.situacao === 'triagem') triagem.push(chamado);
    if (chamado.situacao !== 'em-atendimento' && chamado.situacao !== 'aguardando') continue;
    const conta = chamado.responsavel === null ? undefined : contas.get(chamado.responsavel);
    if (!conta) {
      throw new Error(`O chamado #${chamado.numero} está aberto sem a conta de quem atende.`);
    }
    const daPessoa = daTiPorConta.get(conta.id);
    if (daPessoa && atendeOChamado(conta.alcance, chamado)) {
      daPessoa.abertos.push(chamado);
      continue;
    }
    const naoAtende = naoAtendePorConta.get(conta.id) ?? {
      conta,
      naoAtendeMais: true,
      abertos: [],
      resolvidosHoje: [],
    };
    naoAtende.abertos.push(chamado);
    naoAtendePorConta.set(conta.id, naoAtende);
  }

  const dia = (momento: Date) => {
    const { ano, mes, dia } = relogioDoFuso(momento, pedido.fuso);
    return `${ano}-${mes}-${dia}`;
  };
  const hoje = dia(pedido.agora);
  const resolvidosHoje: number[] = [];
  for (const chamado of vistos) {
    const { situacao, resolvidoEm, resolvidoPor } = chamado;
    if (situacao !== 'resolvido' || !resolvidoEm || !resolvidoPor) continue;
    if (dia(resolvidoEm) !== hoje) continue;
    resolvidosHoje.push(chamado.numero);
    const coluna = daTiPorConta.get(resolvidoPor) ?? naoAtendePorConta.get(resolvidoPor);
    coluna?.resolvidosHoje.push(chamado.numero);
  }

  const coluna = (monte: Monte): ColunaDaCarga => ({
    conta: monte.conta.id,
    nome: monte.conta.nome,
    naoAtendeMais: monte.naoAtendeMais,
    abertos: crescente(monte.abertos.map((chamado) => chamado.numero)),
    maisAntigo: maisAntigoDe(monte.abertos),
    pedacos: {
      total: pedido.cargaCheia,
      cheios: Math.min(monte.abertos.length, pedido.cargaCheia),
    },
    resolvidosHoje: crescente(monte.resolvidosHoje),
  });

  return {
    triagem: {
      abertos: crescente(triagem.map((chamado) => chamado.numero)),
      maisAntigo: maisAntigoDe(triagem),
    },
    colunas: [
      ...[...daTiPorConta.values()].sort(porNome).map(coluna),
      ...[...naoAtendePorConta.values()].sort(porNome).map(coluna),
    ],
    resolvidosHoje: crescente(resolvidosHoje),
    contandoSoOsLocaisQueVe: pedido.alcanceDeQuemOlha !== 'organizacao',
  };
}

/** "0 abertos", "1 aberto", "2 abertos". */
export function textoDosAbertos(quantos: number): string {
  return `${quantos} ${quantos === 1 ? 'aberto' : 'abertos'}`;
}

/** "a", "a e b", "a, b e c". */
function emLista(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

/**
 * O pé da coluna: "Resolveu hoje: #1035", ou "Nada resolvido hoje". Com mais de três, os três
 * primeiros pelo número, como "Resolveu hoje: #1031, #1033, #1035 e mais 2".
 */
export function textoDoResolvidoHoje(numeros: readonly number[]): string {
  if (numeros.length === 0) return 'Nada resolvido hoje';
  const ordem = crescente(numeros).map((numero) => `#${numero}`);
  if (ordem.length > 3) {
    return `Resolveu hoje: ${ordem.slice(0, 3).join(', ')} e mais ${ordem.length - 3}`;
  }
  return `Resolveu hoje: ${emLista(ordem)}`;
}

/**
 * A saudação do Início ao primeiro nome, no fuso da conta: "Bom dia" das 05:00 às 11:59, "Boa
 * tarde" das 12:00 às 17:59 e "Boa noite" no resto.
 */
export function saudacao(nome: string, agora: Date, fuso: string): string {
  const { hora } = relogioDoFuso(agora, fuso);
  const comeco =
    hora >= 5 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiro = nomeCurto(nome);
  return primeiro ? `${comeco}, ${primeiro}` : comeco;
}
