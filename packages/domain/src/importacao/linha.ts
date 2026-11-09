// A regra de cada linha da planilha (spec importacao-de-ativos, "Valores da planilha" e "Prévia linha
// a linha"; design do P1e, decisão 4): a mesma para a prévia e para a tarefa. Cada célula é lida
// pela regra do campo, as referências pelo texto, e o valor é comparado com o guardado; o campo
// travado e o só manual ficam como estão, e o escopo e os restritos são os de quem importa. A função
// é pura: quem chama casa a linha, lê o ativo casado e diz o acesso.
import { CHAVE_DO_MODELO } from '../ativos/campos-do-ativo.ts';
import type { EstadoDosCampos } from '../ativos/estado-do-campo.ts';
import { podeGravar } from '../ativos/estado-do-campo.ts';
import { mensagemDosTiposAceitos } from '../ativos/ligacoes.ts';
import {
  type CamposDoAtivo,
  type DefinicaoNoAtivo,
  valoresIguais,
} from '../ativos/valores-do-ativo.ts';
import {
  aceito,
  campoDeArquivo,
  type Leitura,
  recusado,
  type ValorDeCampo,
  vazio,
} from '../campos/tipos.ts';
import { lerValor, mostrarValor } from '../campos/valores.ts';
import { normalizarTexto } from '../texto.ts';
import type {
  AtivoNoIndice,
  Casamento,
  IdentificacaoDaLinha,
  ResultadoDoCasamento,
} from './casamento.ts';
import { camposDaImportacao } from './colunas.ts';
import type { ReferenciasPorTexto } from './referencias.ts';

/** Uma célula da planilha: o texto, o número, ou nada. */
export type Celula = string | number | null;

export const ACOES_DA_LINHA = ['novo', 'alterar', 'sem-mudanca', 'com-erro'] as const;
export type AcaoDaLinha = (typeof ACOES_DA_LINHA)[number];

export const ROTULOS_DAS_ACOES_DA_LINHA = {
  novo: 'Novo',
  alterar: 'Alterar',
  'sem-mudanca': 'Sem mudança',
  'com-erro': 'Com erro',
} as const satisfies Record<AcaoDaLinha, string>;

/** Por que a planilha não muda um campo: a trava ou a política só manual. */
export type MotivoDoCampoSeguro = 'Travado' | 'Só manual';

/** Um campo que muda, pelo rótulo e pelo valor mostrado; o vazio é `null`. */
export interface MudancaDaLinha {
  chave: string;
  campo: string;
  antes: string | null;
  depois: string | null;
}

/** Um campo que a planilha mudaria e que fica como está. */
export interface CampoSeguroDaLinha {
  chave: string;
  campo: string;
  motivo: MotivoDoCampoSeguro;
}

/** Uma recusa, no campo, pelo rótulo, ou na linha inteira, com `null`. */
export interface ErroDaLinha {
  campo: string | null;
  mensagem: string;
}

/** O que a linha grava, como o pedido da tela: só o que muda, na forma guardada. */
export interface PedidoDaLinha {
  modeloId?: string;
  valores: Record<string, ValorDeCampo>;
}

export interface PlanoDaLinha {
  /** O número da linha na planilha, contando a dos títulos. */
  linha: number;
  acao: AcaoDaLinha;
  /** O ativo casado, ou `null` no ativo novo e na recusa do casamento. */
  ativoId: string | null;
  mudancas: MudancaDaLinha[];
  seguros: CampoSeguroDaLinha[];
  erros: ErroDaLinha[];
  pedido: PedidoDaLinha;
}

/** O ativo casado, como está guardado: os valores pela chave, com os dos campos comuns. */
export interface AtivoAtual {
  id: string;
  localId: string | null;
  modeloId: string | null;
  valores: Readonly<Record<string, ValorDeCampo>>;
  estado: EstadoDosCampos;
}

/** O que a regra da linha precisa saber, além da linha: o tipo, as buscas e o acesso. */
export interface ContextoDaLinha {
  definicoes: CamposDoAtivo;
  /** A chave do campo de cada coluna, pela posição, ou `null` em "Ignorar". */
  mapeamento: readonly (string | null)[];
  referencias: ReferenciasPorTexto;
  /** Para os campos do tipo ativo, pelo patrimônio. */
  casamento: Pick<Casamento, 'ativoPeloPatrimonio'>;
  /** O nome de um tipo de ativo, para a recusa do campo que não aceita o tipo. */
  nomeDoTipo(id: string): string | undefined;
  /** O texto de um registro guardado pelo id: o local pelo caminho, a pessoa, o ativo e o modelo. */
  nomeDoRegistro(id: string): string | undefined;
  /** O caminho de um local, para a recusa do escopo. */
  caminhoDoLocal(id: string): string;
  /** O acesso de quem importa: `ativos.editar` e `ativos.restritos` no local dado. */
  acesso: {
    editaEm(localId: string | null): boolean;
    restritosEm(localId: string | null): boolean;
  };
}

const IDENTIFICACAO = {
  patrimonio: 'ativo.patrimonio',
  serie: 'ativo.serie',
  hostname: 'ativo.hostname',
} as const satisfies Record<keyof IdentificacaoDaLinha, string>;

const CHAVES_DA_IDENTIFICACAO = new Set<string>(Object.values(IDENTIFICACAO));

const SEM_VALOR = 'A linha não tem valor nas colunas escolhidas.';
const RESTRITOS_FORA = 'Você não edita os campos restritos neste local.';
const ATIVO_INATIVO = 'O ativo escolhido está inativo.';
const O_PROPRIO_ATIVO = 'Um ativo não pode se referir a si mesmo.';

/** O texto da célula, sem espaços nas pontas, com o número da planilha como texto. */
const textoDa = (celula: Celula | undefined) =>
  celula === null || celula === undefined ? '' : String(celula).trim();

/** O patrimônio, a série e o hostname da linha, pelas colunas escolhidas. */
export function identificacaoDaLinha(
  celulas: readonly Celula[],
  mapeamento: readonly (string | null)[],
): IdentificacaoDaLinha {
  const da = (chave: string) => {
    const posicao = mapeamento.indexOf(chave);
    const texto = posicao < 0 ? '' : textoDa(celulas[posicao]);
    return texto === '' ? null : texto;
  };
  return {
    patrimonio: da(IDENTIFICACAO.patrimonio),
    serie: da(IDENTIFICACAO.serie),
    hostname: da(IDENTIFICACAO.hostname),
  };
}

/** A recusa do escopo, pelo caminho do local, ou a do ativo sem local. */
const foraDoEscopo = (contexto: ContextoDaLinha, localId: string | null) =>
  localId === null
    ? 'Você não edita ativos sem local.'
    : `Você não edita ativos em ${contexto.caminhoDoLocal(localId)}.`;

/** O ativo de um campo do tipo ativo, pelo patrimônio, com as recusas da tela. */
function lerAtivoDoCampo(
  definicao: DefinicaoNoAtivo,
  celula: Celula,
  atual: AtivoAtual | null,
  contexto: ContextoDaLinha,
): Leitura<string> & { ativo?: AtivoNoIndice } {
  const texto = textoDa(celula);
  const ativo = contexto.casamento.ativoPeloPatrimonio(texto);
  if (!ativo) return recusado(`Ativo não encontrado: ${texto}.`);
  if (atual && ativo.id === atual.id) return recusado(O_PROPRIO_ATIVO);
  if (ativo.situacao !== 'ativo') return recusado(ATIVO_INATIVO);
  const aceitos = definicao.configuracao.tipos ?? [];
  if (aceitos.length > 0 && !aceitos.includes(ativo.tipoId)) {
    return recusado(
      mensagemDosTiposAceitos(
        aceitos.flatMap((id) => {
          const nome = contexto.nomeDoTipo(id);
          return nome ? [nome] : [];
        }),
      ),
    );
  }
  return { ...aceito(ativo.id), ativo };
}

/** A célula lida pela regra do campo, com as referências pelo texto. */
function lerCelula(
  definicao: DefinicaoNoAtivo,
  celula: Celula,
  atual: AtivoAtual | null,
  contexto: ContextoDaLinha,
): Leitura & { ativo?: AtivoNoIndice } {
  switch (definicao.tipo) {
    case 'local':
      return contexto.referencias.local(celula);
    case 'pessoa':
      return contexto.referencias.pessoa(celula);
    case 'fornecedor':
      return contexto.referencias.fornecedor(celula);
    case 'ativo':
      return lerAtivoDoCampo(definicao, celula, atual, contexto);
    default:
      return lerValor(definicao, celula);
  }
}

/** O mesmo valor guardado; na identificação, sem diferenciar acento e maiúsculas, como o casamento. */
function mesmoValor(chave: string, novo: ValorDeCampo, anterior: ValorDeCampo | null) {
  if (anterior === null) return false;
  if (CHAVES_DA_IDENTIFICACAO.has(chave) && typeof novo === 'string') {
    return normalizarTexto(novo) === normalizarTexto(String(anterior));
  }
  return valoresIguais(novo, anterior);
}

/**
 * O plano da linha: a ação, o que muda, o que fica seguro, as recusas e o pedido de gravação. A
 * recusa do escopo esconde os valores do ativo, e a dos restritos esconde os campos restritos.
 */
export function planejarLinha(
  linha: number,
  celulas: readonly Celula[],
  casamento: ResultadoDoCasamento,
  atual: AtivoAtual | null,
  contexto: ContextoDaLinha,
): PlanoDaLinha {
  const { definicoes } = contexto;
  const plano: PlanoDaLinha = {
    linha,
    acao: 'com-erro',
    ativoId: null,
    mudancas: [],
    seguros: [],
    erros: [],
    pedido: { valores: {} },
  };
  if (casamento.tipo === 'recusado') {
    const campo = definicoes.porChave.get(casamento.campo)?.rotulo ?? null;
    plano.erros.push({ campo, mensagem: casamento.mensagem });
    return plano;
  }
  if (casamento.tipo === 'casado' && atual?.id !== casamento.ativo.id) {
    throw new Error('O ativo casado não foi lido.');
  }
  const cadastro = casamento.tipo === 'novo';
  plano.ativoId = atual?.id ?? null;

  const ordem = new Map(
    camposDaImportacao(definicoes, { restritos: true }).map((campo, posicao) => [
      campo.chave,
      posicao,
    ]),
  );
  const mostrar = (definicao: DefinicaoNoAtivo, valor: ValorDeCampo) =>
    mostrarValor(definicao, valor, (id) => contexto.nomeDoRegistro(id)) || null;

  let algumValor = false;
  contexto.mapeamento.forEach((chave, posicao) => {
    const celula = celulas[posicao] ?? null;
    if (chave === null || vazio(celula)) return;
    algumValor = true;

    if (chave === CHAVE_DO_MODELO) {
      const lido = contexto.referencias.modelo(celula);
      if (!lido.ok) {
        plano.erros.push({ campo: 'Modelo', mensagem: lido.erro });
        return;
      }
      if (lido.valor === null || lido.valor === (atual?.modeloId ?? null)) return;
      if (!podeGravar({ escrita: 'automatica' }, atual?.estado[CHAVE_DO_MODELO], 'planilha')) {
        plano.seguros.push({ chave, campo: 'Modelo', motivo: 'Travado' });
        return;
      }
      plano.mudancas.push({
        chave,
        campo: 'Modelo',
        antes: atual?.modeloId ? (contexto.nomeDoRegistro(atual.modeloId) ?? null) : null,
        depois: contexto.nomeDoRegistro(lido.valor) ?? null,
      });
      plano.pedido.modeloId = lido.valor;
      return;
    }

    const definicao = definicoes.porChave.get(chave);
    // A coluna de um campo que saiu do tipo, ou de arquivo, não grava nada.
    if (!definicao || campoDeArquivo(definicao.tipo)) return;
    const lido = lerCelula(definicao, celula, atual, contexto);
    if (!lido.ok) {
      plano.erros.push({ campo: definicao.rotulo, mensagem: lido.erro });
      return;
    }
    if (lido.valor === null) return;
    const anterior = atual?.valores[chave] ?? null;
    if (mesmoValor(chave, lido.valor, anterior)) return;
    if (!podeGravar(definicao, atual?.estado[chave], 'planilha')) {
      plano.seguros.push({
        chave,
        campo: definicao.rotulo,
        motivo: definicao.escrita === 'manual' ? 'Só manual' : 'Travado',
      });
      return;
    }
    plano.mudancas.push({
      chave,
      campo: definicao.rotulo,
      antes: anterior === null ? null : mostrar(definicao, anterior),
      depois:
        'ativo' in lido && lido.ativo
          ? (contexto.nomeDoRegistro(lido.ativo.id) ?? lido.ativo.nome)
          : mostrar(definicao, lido.valor),
    });
    plano.pedido.valores[chave] = lido.valor;
  });

  const temPedido =
    Object.keys(plano.pedido.valores).length > 0 || plano.pedido.modeloId !== undefined;
  if (!algumValor || (cadastro && !temPedido && plano.erros.length === 0)) {
    plano.erros.push({ campo: null, mensagem: SEM_VALOR });
  }
  if (cadastro && algumValor) {
    for (const definicao of definicoes.porChave.values()) {
      if (!definicao.obrigatorio || definicao.padrao !== undefined) continue;
      if (definicao.chave in plano.pedido.valores) continue;
      if (plano.erros.some((erro) => erro.campo === definicao.rotulo)) continue;
      plano.erros.push({ campo: definicao.rotulo, mensagem: 'Preencha este campo.' });
    }
  }

  // O escopo, só quando a linha grava alguma coisa: o local de antes e o de depois.
  if (temPedido) {
    const localAntes = atual?.localId ?? null;
    const localDepois =
      'ativo.local' in plano.pedido.valores
        ? String(plano.pedido.valores['ativo.local'])
        : localAntes;
    const locais = cadastro ? [localDepois] : [...new Set([localAntes, localDepois])];
    const fora = locais.find((local) => !contexto.acesso.editaEm(local));
    if (fora !== undefined) {
      plano.erros.push({ campo: null, mensagem: foraDoEscopo(contexto, fora) });
      plano.mudancas = [];
      plano.seguros = [];
      plano.pedido = { valores: {} };
    } else {
      const restritas = plano.mudancas.filter(
        (mudanca) => definicoes.porChave.get(mudanca.chave)?.restrito,
      );
      if (restritas.length > 0 && !locais.every((local) => contexto.acesso.restritosEm(local))) {
        plano.erros.push({ campo: null, mensagem: RESTRITOS_FORA });
        plano.mudancas = plano.mudancas.filter((mudanca) => !restritas.includes(mudanca));
        for (const mudanca of restritas) delete plano.pedido.valores[mudanca.chave];
      }
    }
  }

  plano.mudancas.sort(
    (a, b) =>
      (ordem.get(a.chave) ?? Number.MAX_SAFE_INTEGER) -
      (ordem.get(b.chave) ?? Number.MAX_SAFE_INTEGER),
  );
  plano.acao =
    plano.erros.length > 0
      ? 'com-erro'
      : cadastro
        ? 'novo'
        : plano.mudancas.length > 0
          ? 'alterar'
          : 'sem-mudanca';
  return plano;
}
