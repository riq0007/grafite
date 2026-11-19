// A condição de um campo no construtor (change chamados-da-ti, design, "A condição (tarefa 5.23)";
// m10; spec tipos-de-chamado, "Condição de um campo"): os campos que ela pode usar, a parte nova,
// a troca do campo e do valor, a parte tirada, o que cada resposta faz, a marca na prévia e os
// avisos. A conta do que cada resposta faz usa o `camposVisiveis` do domínio, a mesma conta do
// formulário que se preenche.
import {
  type CampoDoFormulario,
  type ClausulaDaCondicao,
  camposVisiveis,
  type Formulario,
  type JuncaoDaCondicao,
  MAXIMO_DE_CLAUSULAS_DA_CONDICAO,
  type RespostaDoCampo,
  type RespostasDoFormulario,
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO,
  type TipoDeCampoDoChamado,
} from '@grafite/domain';

/** Os tipos de campo que uma condição pode usar, como o domínio confere. */
const NA_CONDICAO: readonly TipoDeCampoDoChamado[] = [
  'escolha-unica',
  'varias-opcoes',
  'sim-ou-nao',
];

/**
 * Os campos que a condição do campo pode usar: os anteriores de Escolha única, Várias opções ou Sim
 * ou não e, no campo que a pessoa vê, só os que ela também vê.
 */
export function camposDaCondicao(
  campo: CampoDoFormulario,
  campos: readonly CampoDoFormulario[],
): CampoDoFormulario[] {
  const indice = campos.findIndex((cada) => cada.id === campo.id);
  return campos
    .slice(0, Math.max(indice, 0))
    .filter((base) => NA_CONDICAO.includes(base.tipo) && (campo.soDaTi || !base.soDaTi));
}

/** A palavra da parte: "for" e, nas Várias opções, "tiver". */
export const palavraDaClausula = (base: CampoDoFormulario): 'for' | 'tiver' =>
  base.tipo === 'varias-opcoes' ? 'tiver' : 'for';

/** Um valor do seletor da parte: a opção do campo, ou o Sim e o Não. */
export interface ValorDaClausula {
  id: string;
  rotulo: string;
}

const SIM_OU_NAO: readonly ValorDaClausula[] = [
  { id: 'sim', rotulo: 'Sim' },
  { id: 'nao', rotulo: 'Não' },
];

/** Os valores do seletor da parte; a opção ainda sem texto vale pela posição, como "Opção 3". */
export function valoresDaClausula(base: CampoDoFormulario): ValorDaClausula[] {
  if (base.tipo === 'sim-ou-nao') return [...SIM_OU_NAO];
  return base.opcoes.map((opcao, indice) => ({
    id: opcao.id,
    rotulo: opcao.texto || `Opção ${indice + 1}`,
  }));
}

/** A chave do valor da parte no seletor: o id da opção, ou "sim" e "nao". */
export const chaveDoValor = (clausula: ClausulaDaCondicao): string =>
  'valor' in clausula ? (clausula.valor ? 'sim' : 'nao') : clausula.opcaoId;

/** A parte com o valor escolhido no seletor. */
export function trocarValorDaClausula(
  clausula: ClausulaDaCondicao,
  chave: string,
): ClausulaDaCondicao {
  const { campoId, juncao } = clausula;
  return 'valor' in clausula
    ? { campoId, juncao, valor: chave === 'sim' }
    : { campoId, juncao, opcaoId: chave };
}

/** A parte sobre o campo, com o primeiro valor que as outras partes do mesmo campo não usam. */
function clausulaDoCampo(
  base: CampoDoFormulario,
  juncao: JuncaoDaCondicao | null,
  outras: readonly ClausulaDaCondicao[],
): ClausulaDaCondicao {
  const usados = new Set(
    outras.filter((clausula) => clausula.campoId === base.id).map(chaveDoValor),
  );
  const valores = valoresDaClausula(base);
  const chave = (valores.find((valor) => !usados.has(valor.id)) ?? valores[0])?.id ?? '';
  return base.tipo === 'sim-ou-nao'
    ? { campoId: base.id, juncao, valor: chave !== 'nao' }
    : { campoId: base.id, juncao, opcaoId: chave };
}

/** A parte com o campo trocado: a junção fica, e o valor é o primeiro do campo novo. */
export const trocarCampoDaClausula = (
  clausula: ClausulaDaCondicao,
  base: CampoDoFormulario,
): ClausulaDaCondicao => clausulaDoCampo(base, clausula.juncao, []);

/**
 * A parte nova: a primeira, do campo que serve mais perto, acima; a do "ou quando…", do campo da
 * parte anterior; a do "e quando…", de um campo que a condição ainda não usa, ou do da anterior. O
 * valor é o primeiro que nenhuma parte do mesmo campo usa. Nenhuma, com 5 partes ou sem campo que
 * sirva.
 */
export function novaClausula(
  campo: CampoDoFormulario,
  campos: readonly CampoDoFormulario[],
  juncao: JuncaoDaCondicao | null,
): ClausulaDaCondicao | null {
  const { condicao } = campo;
  if (condicao.length >= MAXIMO_DE_CLAUSULAS_DA_CONDICAO) return null;
  const servem = camposDaCondicao(campo, campos);
  const maisPerto = servem.at(-1);
  if (!maisPerto) return null;
  const anterior = condicao.at(-1);
  const daAnterior = anterior && servem.find((base) => base.id === anterior.campoId);
  const usados = new Set(condicao.map((clausula) => clausula.campoId));
  let base = maisPerto;
  if (juncao === 'ou') base = daAnterior ?? maisPerto;
  if (juncao === 'e') {
    base = servem.findLast((cada) => !usados.has(cada.id)) ?? daAnterior ?? maisPerto;
  }
  return clausulaDoCampo(base, condicao.length === 0 ? null : (juncao ?? 'e'), condicao);
}

/** A condição sem a parte; sem a primeira, a seguinte começa a frase, sem junção. */
export function tirarClausula(
  condicao: readonly ClausulaDaCondicao[],
  indice: number,
): ClausulaDaCondicao[] {
  const [primeira, ...resto] = condicao.filter((_, posicao) => posicao !== indice);
  return primeira ? [{ ...primeira, juncao: null }, ...resto] : [];
}

/** O que uma resposta faz ao campo: mostra, esconde, ou depende das outras partes. */
export type EfeitoDaResposta = 'aparece' | 'some' | 'depende';

export interface LinhaDoEfeito {
  chave: string;
  rotulo: string;
  efeito: EfeitoDaResposta;
}

/** As respostas de um campo da condição, cada uma com o que ela faz. */
export interface EfeitoDoCampo {
  campo: CampoDoFormulario;
  linhas: LinhaDoEfeito[];
}

/** Os subconjuntos, para as respostas das Várias opções. */
function subconjuntos(ids: readonly string[]): string[][] {
  const todos: string[][] = [[]];
  for (const id of ids) {
    for (const outro of todos.slice()) todos.push([...outro, id]);
  }
  return todos;
}

/** As combinações das respostas de cada campo, uma de cada. */
const combinacoes = (
  listas: readonly (readonly (readonly [string, RespostaDoCampo | undefined])[])[],
): RespostasDoFormulario[] =>
  listas.reduce<RespostasDoFormulario[]>(
    (feitas, lista) =>
      feitas.flatMap((respostas) =>
        lista.map(([campoId, resposta]) =>
          resposta === undefined ? respostas : { ...respostas, [campoId]: resposta },
        ),
      ),
    [{}],
  );

/** O limite de casos que a conta testa; acima dele, ela deixa de lado as condições da cadeia. */
const MAXIMO_DE_CASOS = 4096;

/**
 * O que cada resposta faz, uma tabela por campo da condição, na ordem em que a frase os cita. A conta
 * testa, com o `camposVisiveis` do domínio, as respostas que as condições citam: a da linha, fixa, e
 * as dos outros campos, todas. Nas Várias opções, a linha é a opção marcada, com as outras citadas
 * livres; a não citada vale sozinha. Os campos da condição entram com as condições deles, e as dos
 * campos de que eles dependem, e o caso em que um campo escondido teria resposta não conta: no
 * formulário, ele não tem.
 */
export function efeitoDasRespostas(
  campo: CampoDoFormulario,
  campos: readonly CampoDoFormulario[],
): EfeitoDoCampo[] {
  const porId = new Map(campos.map((cada) => [cada.id, cada]));
  const bases = [...new Set(campo.condicao.flatMap(({ campoId }) => porId.get(campoId) ?? []))];
  // A cadeia: os campos da condição e, um a um, os das condições deles, na ordem do formulário.
  const naCadeia = new Set<string>();
  const aVer = campo.condicao.map(({ campoId }) => campoId);
  for (let id = aVer.pop(); id !== undefined; id = aVer.pop()) {
    const cada = porId.get(id);
    if (!cada || cada.id === campo.id || naCadeia.has(id)) continue;
    naCadeia.add(id);
    aVer.push(...cada.condicao.map(({ campoId }) => campoId));
  }
  const cadeia = campos.filter((cada) => naCadeia.has(cada.id));
  return (
    efeitosNaConta(campo, bases, cadeia) ??
    efeitosNaConta(
      campo,
      bases,
      bases.map((base) => ({ ...base, condicao: [] })),
    ) ??
    []
  );
}

/** A conta do que cada resposta faz, com os campos dados; nenhuma, acima do limite de casos. */
function efeitosNaConta(
  campo: CampoDoFormulario,
  bases: readonly CampoDoFormulario[],
  naConta: readonly CampoDoFormulario[],
): EfeitoDoCampo[] | null {
  const formulario: Formulario = {
    titulo: { comecaPeloTipo: true, campoId: null },
    campos: [...naConta, campo],
  };
  const condicoes = [campo, ...naConta].flatMap((cada) => cada.condicao);
  const citadas = (base: CampoDoFormulario) => [
    ...new Set(condicoes.filter((clausula) => clausula.campoId === base.id).map(chaveDoValor)),
  ];
  /** As respostas do campo que a conta testa; com a linha, só as dela. */
  const respostas = (
    base: CampoDoFormulario,
    linha?: string,
  ): (readonly [string, RespostaDoCampo | undefined])[] => {
    const comId = (resposta: RespostaDoCampo | undefined) => [base.id, resposta] as const;
    if (base.tipo === 'sim-ou-nao') {
      const todas = linha === undefined ? [true, false, undefined] : [linha === 'sim'];
      return todas.map(comId);
    }
    if (base.tipo === 'escolha-unica') {
      return (linha === undefined ? [...citadas(base), undefined] : [linha]).map(comId);
    }
    if (linha !== undefined && !citadas(base).includes(linha)) return [comId([linha])];
    const livres = citadas(base).filter((id) => id !== linha);
    return subconjuntos(livres)
      .map((outras) => (linha === undefined ? outras : [linha, ...outras]))
      .map((marcadas) => comId(marcadas.length > 0 ? marcadas : undefined));
  };
  const porBase = bases.map((base) => ({
    base,
    linhas: valoresDaClausula(base).map(({ id, rotulo }) => ({
      id,
      rotulo,
      listas: naConta.map((cada) => (cada.id === base.id ? respostas(cada, id) : respostas(cada))),
    })),
  }));
  const tamanhos = porBase.flatMap(({ linhas }) =>
    linhas.map(({ listas }) => listas.reduce((total, lista) => total * lista.length, 1)),
  );
  if (tamanhos.some((tamanho) => tamanho > MAXIMO_DE_CASOS)) return null;
  return porBase.map(({ base, linhas }) => ({
    campo: base,
    linhas: linhas.map(({ id, rotulo, listas }) => {
      let casos = 0;
      let mostram = 0;
      for (const caso of combinacoes(listas)) {
        const visiveis = camposVisiveis(formulario, caso);
        // A resposta de um campo escondido não existe no formulário: o caso não acontece.
        if (Object.keys(caso).some((campoId) => !visiveis.has(campoId))) continue;
        casos += 1;
        if (visiveis.has(campo.id)) mostram += 1;
      }
      const efeito: EfeitoDaResposta =
        mostram === 0 ? 'some' : mostram === casos ? 'aparece' : 'depende';
      return { chave: id, rotulo, efeito };
    }),
  }));
}

/** O nome do campo na frase: o rótulo, ou o tipo do campo, enquanto ele não tem rótulo. */
export const nomeNaFrase = (campo: CampoDoFormulario): string =>
  campo.rotulo || ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[campo.tipo];

/**
 * A marca tracejada do campo condicional na prévia, que só o editor mostra: "aparece só quando for
 * Manchando". Com mais de um campo na condição, cada parte diz o campo.
 */
export function marcaDaCondicao(
  campo: CampoDoFormulario,
  campos: readonly CampoDoFormulario[],
): string | null {
  if (campo.condicao.length === 0) return null;
  const umCampo = new Set(campo.condicao.map(({ campoId }) => campoId)).size === 1;
  const partes = campo.condicao.map((clausula) => {
    const base = campos.find((cada) => cada.id === clausula.campoId);
    const valor = base
      ? valoresDaClausula(base).find(({ id }) => id === chaveDoValor(clausula))?.rotulo
      : undefined;
    const qual = umCampo || !base ? '' : `“${nomeNaFrase(base)}” `;
    const juncao = clausula.juncao ? `${clausula.juncao} ` : '';
    return `${juncao}${qual}${base ? palavraDaClausula(base) : 'for'} ${valor ?? '…'}`;
  });
  return `aparece só quando ${partes.join(' ')}`;
}

/**
 * O aviso da condição: o limite de partes, ou, sem condição, por que nenhum campo serve. Fora
 * disso, nenhum.
 */
export function avisoDaCondicao(
  campo: CampoDoFormulario,
  campos: readonly CampoDoFormulario[],
): string | null {
  if (campo.condicao.length >= MAXIMO_DE_CLAUSULAS_DA_CONDICAO) {
    return `A condição tem no máximo ${MAXIMO_DE_CLAUSULAS_DA_CONDICAO} partes.`;
  }
  if (campo.condicao.length === 0 && camposDaCondicao(campo, campos).length === 0) {
    return `Nenhum campo antes deste serve à condição: ela usa um campo de Escolha única, Várias opções ou Sim ou não${
      campo.soDaTi ? '' : ' que a pessoa também vê'
    }.`;
  }
  return null;
}
