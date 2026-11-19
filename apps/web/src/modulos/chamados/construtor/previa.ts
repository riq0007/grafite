// A prévia em tamanho real do construtor (spec modulo-chamados, "Construtor do formulário"; change
// chamados-da-ti, design, "A prévia em tamanho real (tarefa 5.24)"; m11): o que a pessoa vê, campo
// a campo, o aviso dos campos que só a TI vê, o que chegaria para a TI, o detalhe do "Ver como" e o
// "Enviar para a TI", que confere as respostas como a abertura, sem enviar nada.
import {
  type AtivoDasRespostas,
  type CampoDoFormulario,
  camposVisiveis,
  conferirRespostas,
  type Formulario,
  type ParteDoResumo,
  partesDoResumo,
  type RespostasDoFormulario,
  tituloDasRespostas,
} from '@grafite/domain';
import type { Situacao } from '@grafite/ui';
import type { SugestoesDoChamado } from '../formulario/buscas.ts';
import {
  contextoDoEstado,
  type EstadoDoFormulario,
  respostaDoCampo,
} from '../formulario/estado.ts';
import { fraseDaCondicao, nomeNaFrase } from './condicao.ts';

/** Um campo em "O que ela vê, campo a campo". */
export interface CampoQueElaVe {
  id: string;
  nome: string;
  /** Se a pessoa vê o campo: o só da TI ela não vê. */
  ve: boolean;
  /** "obrigatório", "opcional" ou "só a TI". */
  nota: string;
  /** Quando o campo aparece, como "se for Manchando"; sem condição, ou no só da TI, nula. */
  condicao: string | null;
}

/**
 * O que a pessoa vê, campo a campo, na ordem do formulário (m11): se ela vê o campo, se ele é
 * obrigatório ou opcional e, com condição, quando ele aparece. O campo só da TI fica só com o "só a
 * TI", porque ela não o vê com nenhuma resposta.
 */
export function oQueElaVe(campos: readonly CampoDoFormulario[]): CampoQueElaVe[] {
  return campos.map((campo) => {
    const frase = campo.soDaTi ? null : fraseDaCondicao(campo, campos);
    return {
      id: campo.id,
      nome: nomeNaFrase(campo),
      ve: !campo.soDaTi,
      nota: campo.soDaTi ? 'só a TI' : campo.obrigatorio ? 'obrigatório' : 'opcional',
      condicao: frase === null ? null : `se ${frase}`,
    };
  });
}

/**
 * A frase no lugar do formulário, nas duas prévias, quando a pessoa não vê nenhum campo: sem campos,
 * a aba mostraria só a faixa vazia. Com um campo que ela vê, nenhuma.
 */
export function previaVazia(campos: readonly CampoDoFormulario[]): string | null {
  if (campos.length === 0) return 'O formulário ainda não tem campos.';
  if (campos.every((campo) => campo.soDaTi)) {
    return 'A pessoa não vê nenhum campo: só a TI vê os deste formulário.';
  }
  return null;
}

const LISTA = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

/**
 * O aviso dos campos que ficaram escondidos da pessoa, os só da TI, pelo nome entre aspas: o nome do
 * campo não diz o artigo, e o "o" do m11 erraria em "a Data da compra". Sem nenhum, nada.
 */
export function avisoDosEscondidos(
  campos: readonly CampoDoFormulario[],
): { titulo: string; texto: string } | null {
  const daTi = campos.filter((campo) => campo.soDaTi);
  if (daTi.length === 0) return null;
  const nomes = LISTA.format(daTi.map((campo) => `“${nomeNaFrase(campo)}”`));
  return {
    titulo:
      daTi.length === 1 ? '1 campo ficou escondido.' : `${daTi.length} campos ficaram escondidos.`,
    texto: `Só a TI vê ${nomes}, depois que o chamado chega.`,
  };
}

/** "O que chegaria para a TI", embaixo da aba (m11). */
export interface OQueChegaria {
  titulo: string;
  tipo: string;
  /** Se a pessoa responde o ativo do chamado, no primeiro campo Ativo, como a abertura o liga. */
  temAtivo: boolean;
  /** O ativo do chamado, a resposta do primeiro campo Ativo; sem resposta, nulo. */
  ativo: AtivoDasRespostas | null;
  /** As outras respostas, como o resumo da conversa as mostra. */
  respostas: ParteDoResumo[];
  /** Se o formulário tem campos que só a TI vê, que ela preenche depois. */
  camposDaTi: boolean;
}

/**
 * O que chegaria para a TI com as respostas da prévia: o título montado, o tipo, o ativo do chamado,
 * que a abertura liga pela resposta do primeiro campo Ativo, e as outras respostas, pelo resumo da
 * conversa, sem esse ativo, que já tem o lugar dele.
 */
export function oQueChegaria(
  formulario: Formulario,
  estado: EstadoDoFormulario,
  nomeDoTipo: string,
): OQueChegaria {
  const contexto = contextoDoEstado(estado, nomeDoTipo);
  const primeiro = formulario.campos.find((campo) => campo.tipo === 'ativo');
  const temAtivo = primeiro !== undefined && !primeiro.soDaTi;
  const visivel =
    primeiro !== undefined && camposVisiveis(formulario, estado.respostas).has(primeiro.id);
  const id = temAtivo && visivel ? respostaDoCampo(estado.respostas, primeiro.id) : undefined;
  const ativo = typeof id === 'string' ? (estado.citados.ativos.get(id) ?? null) : null;
  // O campo Ativo não é a base de nenhuma condição: sem ele, os outros aparecem do mesmo jeito.
  const semOAtivo: Formulario = {
    ...formulario,
    campos: formulario.campos.filter((campo) => campo !== primeiro),
  };
  return {
    titulo: tituloDasRespostas(formulario, estado.respostas, contexto),
    tipo: nomeDoTipo,
    temAtivo,
    ativo,
    respostas: partesDoResumo(semOAtivo, estado.respostas, contexto),
    camposDaTi: formulario.campos.some((campo) => campo.soDaTi),
  };
}

/** Uma parte do detalhe do "Ver como": o local ou um ativo, este em mono, pelo patrimônio. */
export interface ParteDoVerComo {
  texto: string;
  mono: boolean;
}

/** Os ativos da pessoa que o "Ver como" mostra; os outros entram no "e mais 2". */
const ATIVOS_NO_VER_COMO = 2;

/**
 * O detalhe da pessoa no "Ver como", pelas sugestões dela, como "Financeiro · NB-0231": o local de
 * trabalho e os ativos sob a responsabilidade dela, que o campo Ativo sugere. Sem as sugestões,
 * ainda a caminho, nada.
 */
export function detalheDoVerComo(sugestoes: SugestoesDoChamado | undefined): ParteDoVerComo[] {
  if (!sugestoes) return [];
  const partes: ParteDoVerComo[] = [];
  if (sugestoes.local) partes.push({ texto: sugestoes.local.nome, mono: false });
  const daPessoa = sugestoes.ativos.filter((ativo) => ativo.motivo === 'responsavel');
  for (const ativo of daPessoa.slice(0, ATIVOS_NO_VER_COMO)) {
    partes.push(
      ativo.patrimonio
        ? { texto: ativo.patrimonio, mono: true }
        : { texto: ativo.rotulo, mono: false },
    );
  }
  const faltam = daPessoa.length - ATIVOS_NO_VER_COMO;
  if (faltam > 0) partes.push({ texto: `e mais ${faltam}`, mono: false });
  return partes;
}

/** O que o "Enviar para a TI" da prévia diz: as recusas, em cada campo, e o aviso. */
export interface EnvioDaPrevia {
  erros: Record<string, string>;
  aviso: { situacao: Extract<Situacao, 'sucesso' | 'atencao'>; texto: string };
}

/**
 * O "Enviar para a TI" da prévia confere as respostas como a abertura (`conferirRespostas`), com as
 * recusas na chave de cada campo, e não envia nada: o botão que só enfeitasse enganaria.
 */
export function envioDaPrevia(
  formulario: Formulario,
  respostas: Readonly<RespostasDoFormulario>,
): EnvioDaPrevia {
  const conferencia = conferirRespostas(formulario, respostas);
  if (conferencia.ok) {
    return {
      erros: {},
      aviso: {
        situacao: 'sucesso',
        texto: 'Na aba, o chamado iria para a TI. A prévia não envia nada.',
      },
    };
  }
  const quantos = Object.keys(conferencia.erros).length;
  const veja = quantos === 1 ? 'veja o campo marcado' : `veja os ${quantos} campos marcados`;
  return {
    erros: conferencia.erros,
    aviso: { situacao: 'atencao', texto: `Na aba, o chamado não iria assim: ${veja}.` },
  };
}

/** A chave da recusa de um campo, `campos.<id>`. */
const DE_UM_CAMPO = /^campos\.([^.]+)$/;

const igual = (uma: unknown, outra: unknown) =>
  JSON.stringify(uma ?? null) === JSON.stringify(outra ?? null);

/** Se nenhuma resposta mudou: o aviso do "Enviar para a TI" vale só assim. */
export const mesmasRespostas = (
  uma: Readonly<RespostasDoFormulario>,
  outra: Readonly<RespostasDoFormulario>,
): boolean => igual(uma, outra);

/**
 * As recusas do "Enviar para a TI" que ainda valem, como na gaveta da abertura: a de um campo,
 * enquanto a resposta dele não muda; a geral, enquanto nenhuma resposta muda.
 */
export function recusasQueValem(
  erros: Readonly<Record<string, string>>,
  naRecusa: Readonly<RespostasDoFormulario>,
  agora: Readonly<RespostasDoFormulario>,
): Record<string, string> {
  const valem: Record<string, string> = {};
  for (const [chave, erro] of Object.entries(erros)) {
    const campoId = DE_UM_CAMPO.exec(chave)?.[1];
    const vale =
      campoId === undefined
        ? mesmasRespostas(naRecusa, agora)
        : igual(respostaDoCampo(naRecusa, campoId), respostaDoCampo(agora, campoId));
    if (vale) valem[chave] = erro;
  }
  return valem;
}
