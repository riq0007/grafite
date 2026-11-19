// Os campos do construtor do formulário (change chamados-da-ti, design, "O construtor, os campos
// (tarefa 5.22)"; m09): o selo e o detalhe de cada campo, a ordem pela linha e pelo menu, as opções,
// a recusa na hora pelo `conferirFormulario`, o título do chamado, as mudanças não salvas e as
// recusas junto do que recusam.
import {
  type CampoDoFormulario,
  conferirFormulario,
  type Formulario,
  idDoFormulario,
  MAXIMO_DE_OPCOES_DO_CAMPO,
  MINIMO_DE_OPCOES_DO_CAMPO,
  nomeNoResumo,
  normalizarTexto,
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO,
  TIPOS_DE_CAMPO_DO_TITULO,
  tituloDasRespostas,
} from '@grafite/domain';
import { type MovimentoNaOrdem, moverNaOrdem } from '../tipos/edicao.ts';

/** O id de um campo ou de uma opção novos, com os bytes sorteados pelo navegador. */
export const sortearId = () => idDoFormulario(crypto.getRandomValues(new Uint8Array(10)));

/** A recusa da mudança na hora: o lugar de quem a pediu e a frase. */
export interface RecusaNaHora {
  lugar: string;
  mensagem: string;
}

/** Os lugares da recusa na hora, para cada controle achar a dele. */
export const LUGAR = {
  obrigatorio: (id: string) => `obrigatorio:${id}`,
  soDaTi: (id: string) => `soDaTi:${id}`,
  opcao: (id: string, opcao: string) => `opcao:${id}:${opcao}`,
  remover: (id: string) => `remover:${id}`,
  mover: (id: string) => `mover:${id}`,
} as const;

/** O selo do cartão do campo: um só, o primeiro que vale nesta ordem. */
export type SeloDoCampo = 'condicional' | 'so-a-ti-ve' | 'obrigatorio' | 'opcional';

export function seloDoCampo(campo: CampoDoFormulario): SeloDoCampo {
  if (campo.condicao.length > 0) return 'condicional';
  if (campo.soDaTi) return 'so-a-ti-ve';
  return campo.obrigatorio ? 'obrigatorio' : 'opcional';
}

const OU = new Intl.ListFormat('pt-BR', { type: 'disjunction' });

const temOpcoes = (campo: CampoDoFormulario) =>
  campo.tipo === 'escolha-unica' || campo.tipo === 'varias-opcoes';

/**
 * A linha embaixo do rótulo: o tipo de campo, as opções das escolhas, os tipos aceitos no Ativo e
 * o campo que a TI preenche, como "Escolha única · 4 opções" e "Número · preenchido pela TI".
 */
export function detalheDoCampo(
  campo: CampoDoFormulario,
  nomesDosTipos: ReadonlyMap<string, string>,
): string {
  const partes = [ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[campo.tipo]];
  if (temOpcoes(campo)) {
    partes.push(campo.opcoes.length === 1 ? '1 opção' : `${campo.opcoes.length} opções`);
  }
  const tipos = campo.tiposDeAtivo.flatMap((id) => nomesDosTipos.get(id) ?? []);
  if (campo.tipo === 'ativo' && tipos.length > 0) partes.push(`só ${OU.format(tipos)}`);
  if (campo.soDaTi) partes.push('preenchido pela TI');
  return partes.join(' · ');
}

/**
 * O campo na posição da linha de encaixe, contada na lista de agora, como a paleta. Nos dois
 * lugares em volta do campo, a ordem não muda, e não há o que mover.
 */
export function moverCampo(
  campos: readonly CampoDoFormulario[],
  id: string,
  posicao: number,
): CampoDoFormulario[] | null {
  const indice = campos.findIndex((campo) => campo.id === id);
  const campo = campos[indice];
  if (!campo || posicao === indice || posicao === indice + 1) return null;
  if (posicao < 0 || posicao > campos.length) return null;
  const resto = campos.filter((_, cada) => cada !== indice);
  const lugar = posicao > indice ? posicao - 1 : posicao;
  return [...resto.slice(0, lugar), campo, ...resto.slice(lugar)];
}

/** O "Subir" e o "Descer" do menu do campo, como na tabela dos tipos. */
export function subirOuDescer(
  campos: readonly CampoDoFormulario[],
  id: string,
  movimento: MovimentoNaOrdem,
): CampoDoFormulario[] {
  const porId = new Map(campos.map((campo) => [campo.id, campo]));
  return moverNaOrdem(
    campos.map((campo) => campo.id),
    id,
    movimento,
  ).flatMap((cada) => porId.get(cada) ?? []);
}

/** O formulário com o campo trocado pelo de mesmo id. */
export const trocarCampo = (formulario: Formulario, campo: CampoDoFormulario): Formulario => ({
  ...formulario,
  campos: formulario.campos.map((cada) => (cada.id === campo.id ? campo : cada)),
});

/**
 * A opção acrescentada, "Opção 5" e, com o texto já usado, o número seguinte, com o id que nenhum
 * campo nem opção do formulário tem. Com 12 opções, nenhuma.
 */
export function acrescentarOpcao(
  campo: CampoDoFormulario,
  campos: readonly CampoDoFormulario[],
  gerarId: () => string,
): CampoDoFormulario | null {
  if (campo.opcoes.length >= MAXIMO_DE_OPCOES_DO_CAMPO) return null;
  const usados = new Set(
    [campo, ...campos].flatMap(({ id, opcoes }) => [id, ...opcoes.map((opcao) => opcao.id)]),
  );
  let id = gerarId();
  while (usados.has(id)) id = gerarId();
  const textos = new Set(campo.opcoes.map(({ texto }) => normalizarTexto(texto)));
  let numero = campo.opcoes.length + 1;
  while (textos.has(normalizarTexto(`Opção ${numero}`))) numero++;
  return { ...campo, opcoes: [...campo.opcoes, { id, texto: `Opção ${numero}` }] };
}

/** A frase do "Acrescentar" desligado, com 12 opções. */
export const avisoDasOpcoes = (campo: CampoDoFormulario): string | null =>
  campo.opcoes.length >= MAXIMO_DE_OPCOES_DO_CAMPO
    ? `O campo tem no máximo ${MAXIMO_DE_OPCOES_DO_CAMPO} opções.`
    : null;

function errosDe(formulario: Formulario, pedeOAtivo: boolean): Record<string, string> {
  const conferido = conferirFormulario(formulario, { pedeOAtivo });
  return conferido.ok ? {} : conferido.erros;
}

/**
 * A recusa que a mudança traz: a primeira recusa do formulário depois dela que não havia antes, na
 * ordem do domínio. A que já havia, como o rótulo ainda vazio, não conta.
 */
export function recusaDaMudanca(
  antes: Formulario,
  depois: Formulario,
  pedeOAtivo: boolean,
): string | null {
  const ja = errosDe(antes, pedeOAtivo);
  for (const [chave, erro] of Object.entries(errosDe(depois, pedeOAtivo))) {
    if (ja[chave] !== erro) return erro;
  }
  return null;
}

/** O formulário depois da mudança, ou a recusa nova que ela traria, sem mudar nada. */
export type MudancaConferida = { formulario: Formulario } | { recusa: string };

export function conferirMudanca(
  antes: Formulario,
  depois: Formulario,
  pedeOAtivo: boolean,
): MudancaConferida {
  const recusa = recusaDaMudanca(antes, depois, pedeOAtivo);
  return recusa ? { recusa } : { formulario: depois };
}

/** Tira a opção, com o mínimo de 2 e sem a que uma condição usa. */
export function tirarOpcao(
  formulario: Formulario,
  campoId: string,
  opcaoId: string,
  pedeOAtivo: boolean,
): MudancaConferida {
  const campo = formulario.campos.find(({ id }) => id === campoId);
  if (!campo) return { formulario };
  if (campo.opcoes.length <= MINIMO_DE_OPCOES_DO_CAMPO) {
    return { recusa: `O campo tem no mínimo ${MINIMO_DE_OPCOES_DO_CAMPO} opções.` };
  }
  const opcoes = campo.opcoes.filter(({ id }) => id !== opcaoId);
  return conferirMudanca(formulario, trocarCampo(formulario, { ...campo, opcoes }), pedeOAtivo);
}

/** Tira o campo, sem o de que outro depende, o do título e o que o "Pede o ativo" precisa. */
export function removerCampo(
  formulario: Formulario,
  campoId: string,
  pedeOAtivo: boolean,
): MudancaConferida {
  const campos = formulario.campos.filter(({ id }) => id !== campoId);
  return conferirMudanca(formulario, { ...formulario, campos }, pedeOAtivo);
}

/** Os campos que podem dar o título: de Escolha única, de Texto curto e de Ativo que a pessoa vê. */
export const camposDoTitulo = (campos: readonly CampoDoFormulario[]): CampoDoFormulario[] =>
  campos.filter((campo) => TIPOS_DE_CAMPO_DO_TITULO.includes(campo.tipo) && !campo.soDaTi);

/**
 * O detalhe do "Título do chamado": o exemplo pela primeira opção da Escolha única, pela mesma conta
 * da abertura, e, sem ela, de onde a resposta vem. A condição do campo não esconde o exemplo.
 */
export function fraseDoTitulo(formulario: Formulario, nomeDoTipo: string): string {
  const { titulo } = formulario;
  const escolhido = camposDoTitulo(formulario.campos).find(({ id }) => id === titulo.campoId);
  if (!escolhido) return `Das respostas: a primeira resposta de texto ou “${nomeDoTipo}”`;
  const opcao =
    escolhido.tipo === 'escolha-unica' ? escolhido.opcoes.find(({ texto }) => texto.trim()) : null;
  if (opcao) {
    const exemplo = tituloDasRespostas(
      { titulo, campos: [{ ...escolhido, condicao: [] }] },
      { [escolhido.id]: opcao.id },
      { nomeDoTipo },
    );
    return `Das respostas: “${exemplo}”`;
  }
  return titulo.comecaPeloTipo
    ? `Das respostas: “${nomeDoTipo}” e a resposta de “${escolhido.rotulo}”`
    : `Das respostas: a resposta de “${escolhido.rotulo}”`;
}

/**
 * Quantas mudanças o formulário tem: cada campo acrescentado, tirado ou mudado conta 1, e a ordem
 * dos que ficaram e o título contam 1 cada.
 */
export function mudancasDoFormulario(gravado: Formulario, agora: Formulario): number {
  const antes = new Map(gravado.campos.map((campo) => [campo.id, campo]));
  const depois = new Map(agora.campos.map((campo) => [campo.id, campo]));
  let mudancas = 0;
  for (const [id, campo] of depois) {
    const doGravado = antes.get(id);
    if (!doGravado || JSON.stringify(doGravado) !== JSON.stringify(campo)) mudancas++;
  }
  for (const id of antes.keys()) if (!depois.has(id)) mudancas++;
  const ordemAgora = agora.campos.filter(({ id }) => antes.has(id)).map(({ id }) => id);
  const ordemGravada = gravado.campos.filter(({ id }) => depois.has(id)).map(({ id }) => id);
  if (ordemAgora.join() !== ordemGravada.join()) mudancas++;
  if (JSON.stringify(gravado.titulo) !== JSON.stringify(agora.titulo)) mudancas++;
  return mudancas;
}

export const textoDasMudancas = (mudancas: number) =>
  mudancas === 1 ? '1 mudança não salva' : `${mudancas} mudanças não salvas`;

/** As recusas de um campo, cada uma junto do que recusa no campo aberto. */
export interface ErrosDoCampo {
  rotulo?: string;
  nomeNoResumo?: string;
  /** A das opções juntas, como o limite. */
  opcoes?: string;
  /** A de cada opção, pelo id dela. */
  porOpcao: Record<string, string>;
  tiposDeAtivo?: string;
  /** A do "Pede o ativo", no primeiro campo Ativo. */
  pedeOAtivo?: string;
  /** As que não têm lugar no campo aberto, como a da condição e a de quem depende dele. */
  outras: string[];
}

const DO_CAMPO = new Set(['rotulo', 'nomeNoResumo', 'tiposDeAtivo'] as const);
type ParteDoCampo = 'rotulo' | 'nomeNoResumo' | 'tiposDeAtivo';
const ehParteDoCampo = (parte: string | undefined): parte is ParteDoCampo =>
  DO_CAMPO.has(parte as ParteDoCampo);

/**
 * As recusas pela chave, junto do que recusam: cada campo com as dele, o "Pede o ativo" no primeiro
 * campo Ativo e, no alto da lista, as do formulário inteiro, a do "Pede o ativo" sem campo Ativo e
 * a de um campo que não está na lista.
 */
export function errosNoFormulario(
  erros: Readonly<Record<string, string>>,
  campos: readonly CampoDoFormulario[],
): { porCampo: Record<string, ErrosDoCampo>; geral: string[] } {
  const porCampo: Record<string, ErrosDoCampo> = {};
  const geral: string[] = [];
  const existe = new Set(campos.map(({ id }) => id));
  const doCampo = (id: string): ErrosDoCampo => {
    if (!Object.hasOwn(porCampo, id)) porCampo[id] = { porOpcao: {}, outras: [] };
    return porCampo[id] as ErrosDoCampo;
  };
  const primeiroAtivo = campos.find(({ tipo }) => tipo === 'ativo')?.id;
  for (const [chave, erro] of Object.entries(erros)) {
    if (chave === 'pedeOAtivo' && primeiroAtivo) {
      doCampo(primeiroAtivo).pedeOAtivo = erro;
      continue;
    }
    const [raiz, id = '', parte, opcao] = chave.split('.');
    if (raiz !== 'campos' || !existe.has(id)) {
      geral.push(erro);
      continue;
    }
    const doId = doCampo(id);
    if (ehParteDoCampo(parte)) doId[parte] = erro;
    else if (parte === 'opcoes' && opcao) doId.porOpcao[opcao] = erro;
    else if (parte === 'opcoes') doId.opcoes = erro;
    else doId.outras.push(erro);
  }
  return { porCampo, geral };
}

/** A recusa que o campo fechado mostra embaixo dele: a primeira, na ordem do campo aberto. */
export function resumoDaRecusa(
  campo: CampoDoFormulario,
  erros: ErrosDoCampo | undefined,
): string | null {
  if (!erros) return null;
  const daOpcao = campo.opcoes
    .map(({ id }) => (Object.hasOwn(erros.porOpcao, id) ? erros.porOpcao[id] : undefined))
    .find(Boolean);
  return (
    erros.rotulo ??
    erros.nomeNoResumo ??
    erros.opcoes ??
    daOpcao ??
    erros.tiposDeAtivo ??
    erros.pedeOAtivo ??
    erros.outras[0] ??
    null
  );
}

/**
 * As recusas que ainda valem: a de um campo, enquanto ele não muda (a do rótulo, enquanto nenhum
 * rótulo muda, porque o repetido se resolve no outro); as outras, como a da condição, que depende da
 * ordem, enquanto o formulário não muda.
 */
export function errosQueValemNoFormulario(
  erros: Readonly<Record<string, string>>,
  naRecusa: Formulario,
  agora: Formulario,
): Record<string, string> {
  const valem: Record<string, string> = {};
  for (const [chave, erro] of Object.entries(erros)) {
    const [raiz, id, parte] = chave.split('.');
    const campoEm = (formulario: Formulario) =>
      formulario.campos.find((campo) => campo.id === id) ?? null;
    let recusou: (formulario: Formulario) => unknown = (formulario) => formulario;
    if (raiz === 'campos' && parte && parte !== 'condicao') {
      recusou =
        parte === 'rotulo'
          ? (formulario) => [campoEm(formulario), formulario.campos.map(({ rotulo }) => rotulo)]
          : campoEm;
    }
    if (JSON.stringify(recusou(naRecusa)) === JSON.stringify(recusou(agora))) valem[chave] = erro;
  }
  return valem;
}

/** Um tipo de ativo da organização, como a lista dos tipos o dá. */
export interface TipoDeAtivoDaLista {
  id: string;
  nome: string;
  situacao: string;
}

/**
 * Os tipos de ativo que o campo Ativo oferece: os ativos e, inativados depois, os que ele já
 * aceitava, que a gravação mantém. Pelo nome.
 */
export function opcoesDosTiposDeAtivo(
  tipos: readonly TipoDeAtivoDaLista[],
  jaAceitos: readonly string[],
): { id: string; rotulo: string }[] {
  return tipos
    .filter((tipo) => tipo.situacao === 'ativo' || jaAceitos.includes(tipo.id))
    .map((tipo) => ({
      id: tipo.id,
      rotulo: tipo.situacao === 'ativo' ? tipo.nome : `${tipo.nome} (inativo)`,
    }))
    .sort((uma, outra) => uma.rotulo.localeCompare(outra.rotulo, 'pt-BR'));
}

/** A descrição do "Nome no resumo": o que vale com ele vazio. */
export function descricaoDoNomeNoResumo(campo: CampoDoFormulario): string {
  const padrao = nomeNoResumo({ ...campo, nomeNoResumo: null });
  return padrao ? `Vazio, vale “${padrao}”.` : 'Vazio, vale o rótulo.';
}
