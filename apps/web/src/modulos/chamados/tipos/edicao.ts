// O que a tela dos tipos decide sem a API (change chamados-da-ti, design, "A tela dos tipos (tarefa
// 5.19)"): a ordem nova do arraste, o que a tabela escreve, o tipo como o editor o escreve e o
// pedido da gravação, as recusas que valem e a prévia do colaborador com o tipo que se edita.
import type { components } from '@grafite/api-client';
import type {
  IconeDoTipoDeChamado,
  ModoDoPrazo,
  SemNinguem,
  SolicitacaoDoTipoDeChamado,
  UnidadeDoPrazo,
} from '@grafite/domain';
import type { OpcaoDeSelecao } from '@grafite/ui';
import type { TipoNaGrade } from '../previa/GradeDosTipos.tsx';

export type TipoDeChamado = components['schemas']['TipoDeChamado'];
export type PedidoDoTipo = components['schemas']['PedidoDoTipoDeChamado'];
export type ContaQueAtende = components['schemas']['ContasQueAtendemOsChamados']['contas'][number];

/**
 * A ordem depois de soltar o tipo na metade de cima (antes) ou na de baixo (depois) da linha sob o
 * ponteiro, como o `useArrastar` a dá (decisão 15). Soltar sobre ele mesmo, ou num alvo que não está
 * na lista, não muda nada.
 */
export function reordenar(
  ids: readonly string[],
  movido: string,
  alvo: string,
  metade: 'antes' | 'depois',
): string[] {
  if (movido === alvo || !ids.includes(movido)) return [...ids];
  const resto = ids.filter((id) => id !== movido);
  const indice = resto.indexOf(alvo);
  if (indice < 0) return [...ids];
  const em = metade === 'antes' ? indice : indice + 1;
  return [...resto.slice(0, em), movido, ...resto.slice(em)];
}

export type MovimentoNaOrdem = 'subir' | 'descer';

/** O "Subir" e o "Descer" do menu da linha: o tipo troca de lugar com o de cima ou com o de baixo. */
export function moverNaOrdem(
  ids: readonly string[],
  id: string,
  movimento: MovimentoNaOrdem,
): string[] {
  const indice = ids.indexOf(id);
  const vizinho = ids[movimento === 'subir' ? indice - 1 : indice + 1];
  if (indice < 0 || vizinho === undefined) return [...ids];
  return reordenar(ids, id, vizinho, movimento === 'subir' ? 'antes' : 'depois');
}

/** O que o menu da linha oferece: só o que muda a ordem. O primeiro só desce, e o último só sobe. */
export function movimentosNaOrdem(ids: readonly string[], id: string): MovimentoNaOrdem[] {
  const indice = ids.indexOf(id);
  if (indice < 0) return [];
  const movimentos: MovimentoNaOrdem[] = [];
  if (indice > 0) movimentos.push('subir');
  if (indice < ids.length - 1) movimentos.push('descer');
  return movimentos;
}

/** O prazo da tabela: o da resolução, curto e com a unidade como está, como "8 h" e "3 d". */
export const prazoNaTabela = ({ prazo }: TipoDeChamado) =>
  `${prazo.resolucao.valor} ${prazo.resolucao.unidade}`;

/** Quem atende na tabela: o primeiro nome, ou a triagem. */
export const quemAtendeNaTabela = ({ atendePorPadrao }: TipoDeChamado) =>
  atendePorPadrao ? (atendePorPadrao.nome.split(' ')[0] ?? atendePorPadrao.nome) : 'Triagem';

/** O selo da linha, só na exceção: o rascunho, o inativo e o que só a TI abre. */
export function seloDoTipo({
  situacao,
  soATiAbre,
}: TipoDeChamado): 'rascunho' | 'inativo' | 'so-a-ti-abre' | null {
  if (situacao !== 'em-uso') return situacao;
  return soATiAbre ? 'so-a-ti-abre' : null;
}

/** O pé da tabela: os chamados abertos de todos os tipos. */
export function fraseDosAbertos(tipos: readonly TipoDeChamado[]): string {
  const abertos = tipos.reduce((soma, tipo) => soma + tipo.abertos, 0);
  if (abertos === 0) return 'Nenhum chamado aberto nestes tipos.';
  return abertos === 1
    ? '1 chamado aberto nestes tipos.'
    : `${abertos} chamados abertos nestes tipos.`;
}

/** A contagem do cabeçalho do tipo, como "1 aberto · 38 no último ano". */
export function contagemDoTipo({ abertos, noUltimoAno }: TipoDeChamado): string {
  const agora = abertos === 0 ? 'Nenhum aberto' : abertos === 1 ? '1 aberto' : `${abertos} abertos`;
  const noAno = noUltimoAno === 0 ? 'nenhum' : String(noUltimoAno);
  return `${agora} · ${noAno} no último ano`;
}

/** Um número do prazo como o campo o mostra: o texto, que pode estar vazio enquanto se escreve. */
export interface NumeroDoPrazoNaEdicao {
  valor: string;
  unidade: UnidadeDoPrazo;
}

/** O tipo como o editor o escreve. */
export interface EdicaoDoTipo {
  nome: string;
  icone: IconeDoTipoDeChamado;
  frase: string;
  prazo: {
    modo: ModoDoPrazo;
    resposta: NumeroDoPrazoNaEdicao;
    resolucao: NumeroDoPrazoNaEdicao;
  };
  atendePorPadrao: string | null;
  semNinguem: SemNinguem;
  podeVirarOs: boolean;
  geraSolicitacao: SolicitacaoDoTipoDeChamado;
  /** Fica guardado no Toner, para a volta ao Equipamento, mas só vai com o Equipamento. */
  tipoDeAtivoDoEquipamento: string | null;
  pedeOAtivo: boolean;
  apareceParaOColaborador: boolean;
  soATiAbre: boolean;
}

/** O editor começa no tipo gravado. */
export function edicaoDoTipo(tipo: TipoDeChamado): EdicaoDoTipo {
  const { prazo } = tipo;
  return {
    nome: tipo.nome,
    icone: tipo.icone,
    frase: tipo.frase ?? '',
    prazo: {
      modo: prazo.modo,
      resposta: { valor: String(prazo.resposta.valor), unidade: prazo.resposta.unidade },
      resolucao: { valor: String(prazo.resolucao.valor), unidade: prazo.resolucao.unidade },
    },
    atendePorPadrao: tipo.atendePorPadrao?.id ?? null,
    semNinguem: tipo.semNinguem,
    podeVirarOs: tipo.podeVirarOs,
    geraSolicitacao: tipo.geraSolicitacao,
    tipoDeAtivoDoEquipamento: tipo.tipoDeAtivoDoEquipamento?.id ?? null,
    pedeOAtivo: tipo.pedeOAtivo,
    apareceParaOColaborador: tipo.apareceParaOColaborador,
    soATiAbre: tipo.soATiAbre,
  };
}

/** O número escrito; o campo só aceita algarismos, e o vazio vai como zero, que a API recusa. */
const numeroDoTexto = (texto: string) => (texto === '' ? 0 : Number(texto));

/** O pedido do `PUT /chamados/tipos/:id`, com o tipo inteiro. */
export function pedidoDoTipo(edicao: EdicaoDoTipo): PedidoDoTipo {
  const { prazo } = edicao;
  return {
    nome: edicao.nome,
    icone: edicao.icone,
    frase: edicao.frase,
    prazo: {
      modo: prazo.modo,
      resposta: { valor: numeroDoTexto(prazo.resposta.valor), unidade: prazo.resposta.unidade },
      resolucao: {
        valor: numeroDoTexto(prazo.resolucao.valor),
        unidade: prazo.resolucao.unidade,
      },
    },
    atendePorPadrao: edicao.atendePorPadrao,
    semNinguem: edicao.semNinguem,
    podeVirarOs: edicao.podeVirarOs,
    geraSolicitacao: edicao.geraSolicitacao,
    tipoDeAtivoDoEquipamento:
      edicao.geraSolicitacao === 'equipamento' ? edicao.tipoDeAtivoDoEquipamento : null,
    pedeOAtivo: edicao.pedeOAtivo,
    apareceParaOColaborador: edicao.apareceParaOColaborador,
    soATiAbre: edicao.soATiAbre,
  };
}

/** Mudou quando o pedido difere do pedido do tipo gravado: o que não iria na gravação não conta. */
export const mudouOTipo = (edicao: EdicaoDoTipo, tipo: TipoDeChamado) =>
  JSON.stringify(pedidoDoTipo(edicao)) !== JSON.stringify(pedidoDoTipo(edicaoDoTipo(tipo)));

/** Trocar quem atende; sem ninguém, o "Fica com <pessoa> mesmo assim" não tem com quem ficar. */
export function trocarQuemAtende(edicao: EdicaoDoTipo, conta: string | null): EdicaoDoTipo {
  return {
    ...edicao,
    atendePorPadrao: conta,
    semNinguem: conta === null ? 'triagem' : edicao.semNinguem,
  };
}

/** A opção de ninguém na escolha de quem atende, que leva o chamado à triagem. */
export const NINGUEM = 'ninguem';

/**
 * As opções de quem atende por padrão: ninguém primeiro, e as contas que atendem, pelo nome. A
 * conta gravada que deixou de atender entra na ordem do nome, escolhida até a gravação a recusar.
 */
export function opcoesDeQuemAtende(
  contas: readonly ContaQueAtende[],
  gravada: ContaQueAtende | null,
): OpcaoDeSelecao[] {
  const todas =
    gravada && !contas.some((conta) => conta.id === gravada.id) ? [...contas, gravada] : contas;
  return [
    { id: NINGUEM, rotulo: 'Ninguém, cai na triagem' },
    ...[...todas]
      .sort((uma, outra) => uma.nome.localeCompare(outra.nome, 'pt-BR'))
      .map((conta) => ({ id: conta.id, rotulo: conta.nome })),
  ];
}

/** As chaves das recusas que o editor mostra num campo; o resto vai à recusa geral, no pé. */
const DOS_CAMPOS = new Set([
  'nome',
  'icone',
  'frase',
  'resposta',
  'resolucao',
  'atendePorPadrao',
  'geraSolicitacao',
  'tipoDeAtivoDoEquipamento',
  'pedeOAtivo',
]);

/** O formato de um número do prazo, como `prazo.resposta.valor`, vai ao número dele. */
const DO_NUMERO = /^prazo\.(resposta|resolucao)(?:\.|$)/;

/** As recusas do 400 nas chaves da tela; na mesma chave, vale a primeira. */
export function errosDoTipo(campos: Readonly<Record<string, string>>): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const [chave, erro] of Object.entries(campos)) {
    const naTela = DOS_CAMPOS.has(chave) ? chave : (DO_NUMERO.exec(chave)?.[1] ?? 'geral');
    erros[naTela] ??= erro;
  }
  return erros;
}

/**
 * O que cada recusa recusou. A resposta maior é da frase inteira do prazo; quem atende vale com o
 * "Se não houver ninguém"; a solicitação, o tipo de ativo e o "Pede o ativo" dependem um do outro.
 */
const RECUSOU: Record<string, (edicao: EdicaoDoTipo) => unknown> = {
  nome: (edicao) => edicao.nome,
  icone: (edicao) => edicao.icone,
  frase: (edicao) => edicao.frase,
  resposta: (edicao) => edicao.prazo,
  resolucao: (edicao) => edicao.prazo,
  atendePorPadrao: (edicao) => [edicao.atendePorPadrao, edicao.semNinguem],
  geraSolicitacao: (edicao) => [edicao.geraSolicitacao, edicao.tipoDeAtivoDoEquipamento],
  tipoDeAtivoDoEquipamento: (edicao) => [edicao.geraSolicitacao, edicao.tipoDeAtivoDoEquipamento],
  pedeOAtivo: (edicao) => [edicao.pedeOAtivo, edicao.geraSolicitacao],
};

/** As recusas que ainda valem: cada uma, enquanto o que ela recusou não muda; a geral, sem mudança. */
export function errosQueValem(
  erros: Readonly<Record<string, string>>,
  naRecusa: EdicaoDoTipo,
  agora: EdicaoDoTipo,
): Record<string, string> {
  const valem: Record<string, string> = {};
  for (const [chave, erro] of Object.entries(erros)) {
    const recusou = RECUSOU[chave] ?? ((edicao: EdicaoDoTipo) => edicao);
    if (JSON.stringify(recusou(naRecusa)) === JSON.stringify(recusou(agora))) valem[chave] = erro;
  }
  return valem;
}

/** O tipo que se edita, com o que se escreve, para a prévia. */
export interface TipoEditado {
  id: string;
  edicao: EdicaoDoTipo;
}

/** O tipo com o que se escreve no lugar do gravado, quando é ele que se edita. */
function comoSeEscreve(tipo: TipoDeChamado, editado: TipoEditado | null) {
  if (editado?.id !== tipo.id)
    return {
      nome: tipo.nome,
      icone: tipo.icone,
      frase: tipo.frase ?? '',
      soATiAbre: tipo.soATiAbre,
    };
  const { nome, icone, frase, soATiAbre } = editado.edicao;
  return { nome, icone, frase, soATiAbre };
}

/**
 * A grade da prévia: os tipos em uso que o colaborador escolhe, na ordem, com o que se edita
 * marcado "editando" e como se escreve. Ligar o "Só a TI abre" o tira da grade na hora.
 */
export function tiposNaPrevia(
  tipos: readonly TipoDeChamado[],
  editado: TipoEditado | null,
): TipoNaGrade[] {
  return tipos.flatMap((tipo) => {
    const vivo = comoSeEscreve(tipo, editado);
    if (tipo.situacao !== 'em-uso' || vivo.soATiAbre) return [];
    const naGrade: TipoNaGrade = {
      id: tipo.id,
      nome: vivo.nome,
      icone: vivo.icone,
      frase: vivo.frase,
    };
    return [editado?.id === tipo.id ? { ...naGrade, marca: 'editando' } : naGrade];
  });
}

const EM_LISTA = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/**
 * As notas embaixo da prévia: os tipos em uso que só a TI abre, que a grade não mostra, e os
 * chamados abertos do tipo que se edita, que mantêm o formulário com que foram abertos.
 */
export function notasDaPrevia(
  tipos: readonly TipoDeChamado[],
  editado: TipoEditado | null,
): { soDaTi: string | null; abertos: string | null } {
  const soDaTi = tipos
    .filter((tipo) => tipo.situacao === 'em-uso' && comoSeEscreve(tipo, editado).soATiAbre)
    .map((tipo) => comoSeEscreve(tipo, editado).nome);
  const abertos = tipos.find((tipo) => tipo.id === editado?.id)?.abertos ?? 0;
  return {
    soDaTi:
      soDaTi.length === 0
        ? null
        : soDaTi.length === 1
          ? `${soDaTi[0]} é só da TI e não aparece nesta grade.`
          : `${EM_LISTA.format(soDaTi)} são só da TI e não aparecem nesta grade.`,
    abertos:
      abertos === 0
        ? null
        : `Vale para os próximos chamados. ${
            abertos === 1
              ? 'O 1 aberto mantém o formulário atual.'
              : `Os ${abertos} abertos mantêm o formulário atual.`
          }`,
  };
}

/** A busca do endereço dos tipos: o tipo escolhido. */
export interface BuscaDosTipos {
  tipo?: string;
}

/** O `tipo` do endereço, só como texto; o que não é, a tela troca pelo primeiro da ordem. */
export function validarTipoEscolhido(busca: Record<string, unknown>): BuscaDosTipos {
  return typeof busca.tipo === 'string' && busca.tipo !== '' ? { tipo: busca.tipo } : {};
}
