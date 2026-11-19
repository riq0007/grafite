// O título e o resumo das respostas do chamado (spec tipos-de-chamado, "Título montado das
// respostas"; spec chamados, "Conversa do chamado"; change chamados-da-ti, design, decisão 2). Os
// dois usam só os campos visíveis que a pessoa vê e leem também o formulário que se preenche, na
// prévia: a resposta fora do tipo do campo, ou que o contexto não traz, fica de fora. Os campos da TI
// que mudam depois da abertura vão à auditoria como o resumo mostra a resposta (tarefa 4.15).
import { mostrarData } from '../campos/datas.ts';
import { mostrarDecimal } from '../campos/numeros.ts';
import type { CampoDoFormulario, Formulario } from './formulario.ts';
import { type CampoMudado, camposVisiveis, respostaDe, vale } from './respostas.ts';

/** O ativo como o título e o resumo o mostram: o patrimônio ou, sem ele, o nome das telas. */
export interface AtivoDasRespostas {
  patrimonio: string | null;
  /** O nome que as telas mostram (`rotuloDoAtivo`). */
  rotulo: string;
}

/** O que as respostas citam pelo id, lido pela API na abertura e pela web nos campos. */
export interface ContextoDasRespostas {
  nomeDoTipo: string;
  ativos?: ReadonlyMap<string, AtivoDasRespostas>;
  locais?: ReadonlyMap<string, string>;
  pessoas?: ReadonlyMap<string, string>;
}

/** Os nomes do que as respostas citam, sem o nome do tipo, que só o título usa. */
type NomesDasRespostas = Omit<ContextoDasRespostas, 'nomeDoTipo'>;

const LIMITE_DO_TITULO = 120;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

type Respostas = Readonly<Record<string, unknown>>;

/** O texto numa linha só: as quebras de linha e os espaços repetidos viram um espaço. */
const umaLinha = (texto: string) => texto.replace(/\s+/gu, ' ').trim();

/**
 * A primeira letra minúscula, fora quando a primeira palavra tem outra letra maiúscula, como em
 * "VPN" e "Wi-Fi". A conversa do chamado a usa no texto do alerta, depois dos dois-pontos.
 */
export function comMinuscula(texto: string): string {
  const [primeira = '', ...resto] = [...texto];
  const depois = resto.join('');
  const restoDaPalavra = depois.split(/\s/u)[0] ?? '';
  return /\p{Lu}/u.test(restoDaPalavra) ? texto : `${primeira.toLowerCase()}${depois}`;
}

const ehOpcao = (campo: CampoDoFormulario) =>
  campo.tipo === 'escolha-unica' || campo.tipo === 'varias-opcoes';

/**
 * Só a opção e o texto condicionais se explicam sem o nome, depois da vírgula, como em
 * "Manchando, na borda". O Sim ou não, o número, a data, o local, a pessoa e o anexo ficam com o
 * nome no resumo.
 */
const seJunta = (campo: CampoDoFormulario) =>
  ehOpcao(campo) || campo.tipo === 'texto-curto' || campo.tipo === 'texto-longo';

/**
 * O nome no resumo ou, sem ele, o rótulo sem o "?". O resumo o usa, e a recusa do resolver também
 * (`acoes.ts`).
 */
export const nomeNoResumo = (campo: CampoDoFormulario): string =>
  campo.nomeNoResumo ?? campo.rotulo.replace(/\?+$/u, '').trimEnd();

const textoDaOpcao = (campo: CampoDoFormulario, id: unknown) =>
  campo.opcoes.find((opcao) => opcao.id === id)?.texto ?? null;

const textos = (valor: unknown): string[] | null =>
  Array.isArray(valor) && valor.every((item) => typeof item === 'string') ? valor : null;

function mostrarAtivo(id: unknown, contexto: NomesDasRespostas): string | null {
  const ativo = typeof id === 'string' ? contexto.ativos?.get(id) : undefined;
  return ativo ? (ativo.patrimonio ?? ativo.rotulo) : null;
}

/** A resposta do campo como o resumo a mostra; nula, o campo fica de fora. */
function mostrarResposta(
  campo: CampoDoFormulario,
  resposta: unknown,
  contexto: NomesDasRespostas,
): string | null {
  switch (campo.tipo) {
    case 'texto-curto':
    case 'texto-longo':
      return typeof resposta === 'string' ? umaLinha(resposta) || null : null;
    case 'escolha-unica':
      return textoDaOpcao(campo, resposta);
    case 'varias-opcoes': {
      const ids = textos(resposta);
      const escolhidas = campo.opcoes.filter((opcao) => ids?.includes(opcao.id));
      if (escolhidas.length === 0) return null;
      return escolhidas
        .map((opcao, indice) => (indice === 0 ? opcao.texto : comMinuscula(opcao.texto)))
        .join(', ');
    }
    case 'ativo':
      return mostrarAtivo(resposta, contexto);
    case 'local':
      return (typeof resposta === 'string' && contexto.locais?.get(resposta)) || null;
    case 'pessoa':
      return (typeof resposta === 'string' && contexto.pessoas?.get(resposta)) || null;
    case 'data':
      return typeof resposta === 'string' && DATA.test(resposta) ? mostrarData(resposta) : null;
    case 'numero':
      return typeof resposta === 'number' && Number.isFinite(resposta)
        ? mostrarDecimal(resposta)
        : null;
    case 'anexo': {
      const quantos = new Set(textos(resposta)).size;
      if (quantos === 0) return null;
      return quantos === 1 ? '1 arquivo' : `${quantos} arquivos`;
    }
    case 'sim-ou-nao':
      if (typeof resposta !== 'boolean') return null;
      return resposta ? 'Sim' : 'Não';
  }
}

/** Os campos que a pessoa vê com as respostas, na ordem do formulário. */
function camposQueAPessoaVe(formulario: Formulario, respostas: Respostas): CampoDoFormulario[] {
  const visiveis = camposVisiveis(formulario, respostas);
  return formulario.campos.filter((campo) => visiveis.has(campo.id) && !campo.soDaTi);
}

/**
 * O título que quem abre ou atende escreve (spec chamados, "Abrir um chamado pela TI"): numa linha
 * só, como o montado, sem os espaços das pontas e de 1 a 120 caracteres, contados em caracteres, e
 * não nas unidades do UTF-16 que o `.max` do Zod conta.
 */
export function conferirTituloDoChamado(
  pedido: string,
): { ok: true; titulo: string } | { ok: false; erro: string } {
  const titulo = umaLinha(pedido);
  if (titulo === '') return { ok: false, erro: 'Escreva o título.' };
  if ([...titulo].length > LIMITE_DO_TITULO) {
    return { ok: false, erro: `Use até ${LIMITE_DO_TITULO} caracteres.` };
  }
  return { ok: true, titulo };
}

/** O título com mais de 120 caracteres, cortado em 120, sem o espaço antes das reticências. */
function cortar(titulo: string): string {
  const letras = [...titulo];
  if (letras.length <= LIMITE_DO_TITULO) return titulo;
  return `${letras
    .slice(0, LIMITE_DO_TITULO - 1)
    .join('')
    .trimEnd()}…`;
}

/**
 * O título do chamado: o nome do tipo, quando o tipo começa por ele, e a resposta do campo
 * escolhido. Sem o campo, ou sem a resposta dele, é a primeira resposta de texto, sozinha, ou o
 * nome do tipo.
 */
export function tituloDasRespostas(
  formulario: Formulario,
  respostas: Respostas,
  contexto: ContextoDasRespostas,
): string {
  const campos = camposQueAPessoaVe(formulario, respostas);
  const escolhido = campos.find((campo) => campo.id === formulario.titulo.campoId);
  const resposta = escolhido
    ? mostrarResposta(escolhido, respostaDe(respostas, escolhido.id), contexto)
    : null;
  if (escolhido && resposta) {
    if (!formulario.titulo.comecaPeloTipo) return cortar(resposta);
    const depois = escolhido.tipo === 'escolha-unica' ? comMinuscula(resposta) : resposta;
    return cortar(`${contexto.nomeDoTipo} ${depois}`);
  }
  for (const campo of campos) {
    if (campo.tipo !== 'texto-curto' && campo.tipo !== 'texto-longo') continue;
    const texto = mostrarResposta(campo, respostaDe(respostas, campo.id), contexto);
    if (texto) return cortar(texto);
  }
  return cortar(contexto.nomeDoTipo);
}

/** Uma parte do resumo das respostas: o nome no resumo e a resposta, ou as respostas juntas. */
export interface ParteDoResumo {
  nome: string;
  resposta: string;
  /** A resposta é o patrimônio de um ativo, que as telas mostram na fonte mono. */
  mono: boolean;
}

/**
 * As partes do resumo das respostas, na ordem do formulário. A opção e o texto que aparecem por uma
 * condição vão depois da vírgula, junto da resposta do campo da primeira cláusula que vale, também
 * em cadeia, e as do Ativo vêm por último.
 */
export function partesDoResumo(
  formulario: Formulario,
  respostas: Respostas,
  contexto: ContextoDasRespostas,
): ParteDoResumo[] {
  const porId = new Map(formulario.campos.map((campo) => [campo.id, campo]));
  const campos = camposQueAPessoaVe(formulario, respostas);
  const visiveis = new Set(campos.map((campo) => campo.id));
  const partes: { nome: string; respostas: string[] }[] = [];
  const parteDe = new Map<string, { nome: string; respostas: string[] }>();
  const ativos: ParteDoResumo[] = [];
  for (const campo of campos) {
    const resposta = mostrarResposta(campo, respostaDe(respostas, campo.id), contexto);
    if (resposta === null) continue;
    if (campo.tipo === 'ativo') {
      const id = respostaDe(respostas, campo.id);
      const ativo = typeof id === 'string' ? contexto.ativos?.get(id) : undefined;
      ativos.push({
        nome: nomeNoResumo(campo),
        resposta,
        mono: ativo !== undefined && ativo.patrimonio !== null,
      });
      continue;
    }
    const clausula = seJunta(campo)
      ? campo.condicao.find((clausula) => {
          const base = porId.get(clausula.campoId);
          return (
            base !== undefined &&
            visiveis.has(base.id) &&
            vale(clausula, base, respostaDe(respostas, base.id))
          );
        })
      : undefined;
    const daBase = clausula ? parteDe.get(clausula.campoId) : undefined;
    if (daBase) {
      daBase.respostas.push(ehOpcao(campo) ? comMinuscula(resposta) : resposta);
      parteDe.set(campo.id, daBase);
      continue;
    }
    const parte = { nome: nomeNoResumo(campo), respostas: [resposta] };
    partes.push(parte);
    parteDe.set(campo.id, parte);
  }
  return [
    ...partes.map(({ nome, respostas }) => ({ nome, resposta: respostas.join(', '), mono: false })),
    ...ativos,
  ];
}

/**
 * O resumo das respostas, a linha da abertura na conversa: as partes (`partesDoResumo`) como
 * "<nome no resumo>: <resposta>", separadas por " · ". A leitura do chamado o monta com os nomes de
 * agora, para a pessoa anonimizada sair dele como sai do chamado.
 */
export function resumoDasRespostas(
  formulario: Formulario,
  respostas: Respostas,
  contexto: ContextoDasRespostas,
): string {
  return partesDoResumo(formulario, respostas, contexto)
    .map(({ nome, resposta }) => `${nome}: ${resposta}`)
    .join(' · ');
}

/**
 * Os campos da TI que mudaram, como a auditoria os guarda (spec chamados, "Ativo ligado e campos da
 * TI"; change chamados-da-ti, design, "O ativo, o título e os campos da TI"): pelo nome no resumo,
 * com a resposta de antes e a de depois como o resumo a mostra, e o lado sem resposta fica sem a
 * chave, como nos campos do ativo. O nome que se repete ganha o número da vez, para um campo não
 * apagar o outro.
 */
export function camposNaAuditoria(
  mudados: readonly CampoMudado[],
  contexto: NomesDasRespostas,
): { antes: Record<string, string>; depois: Record<string, string> } {
  const vezes = new Map<string, number>();
  const antes: [string, string][] = [];
  const depois: [string, string][] = [];
  for (const mudado of mudados) {
    const nome = nomeNoResumo(mudado.campo);
    const vez = (vezes.get(nome) ?? 0) + 1;
    vezes.set(nome, vez);
    const chave = vez === 1 ? nome : `${nome} (${vez})`;
    const deAntes = mostrarResposta(mudado.campo, mudado.antes, contexto);
    const deDepois = mostrarResposta(mudado.campo, mudado.depois, contexto);
    if (deAntes !== null) antes.push([chave, deAntes]);
    if (deDepois !== null) depois.push([chave, deDepois]);
  }
  return { antes: Object.fromEntries(antes), depois: Object.fromEntries(depois) };
}
