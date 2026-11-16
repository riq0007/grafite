// O título e o resumo das respostas do chamado (spec tipos-de-chamado, "Título montado das
// respostas"; spec chamados, "Conversa do chamado"; change chamados-da-ti, design, decisão 2). Os
// dois usam só os campos visíveis que a pessoa vê e leem também o formulário que se preenche, na
// prévia: a resposta fora do tipo do campo, ou que o contexto não traz, fica de fora.
import { mostrarData } from '../campos/datas.ts';
import { mostrarDecimal } from '../campos/numeros.ts';
import type { CampoDoFormulario, Formulario } from './formulario.ts';
import { camposVisiveis, respostaDe, vale } from './respostas.ts';

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

const LIMITE_DO_TITULO = 120;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

type Respostas = Readonly<Record<string, unknown>>;

/** O texto numa linha só: as quebras de linha e os espaços repetidos viram um espaço. */
const umaLinha = (texto: string) => texto.replace(/\s+/gu, ' ').trim();

/**
 * A primeira letra minúscula, fora quando a primeira palavra tem outra letra maiúscula, como em
 * "VPN" e "Wi-Fi".
 */
function comMinuscula(texto: string): string {
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

/** O nome no resumo ou, sem ele, o rótulo sem o "?". */
const nomeNoResumo = (campo: CampoDoFormulario) =>
  campo.nomeNoResumo ?? campo.rotulo.replace(/\?+$/u, '').trimEnd();

const textoDaOpcao = (campo: CampoDoFormulario, id: unknown) =>
  campo.opcoes.find((opcao) => opcao.id === id)?.texto ?? null;

const textos = (valor: unknown): string[] | null =>
  Array.isArray(valor) && valor.every((item) => typeof item === 'string') ? valor : null;

function mostrarAtivo(id: unknown, contexto: ContextoDasRespostas): string | null {
  const ativo = typeof id === 'string' ? contexto.ativos?.get(id) : undefined;
  return ativo ? (ativo.patrimonio ?? ativo.rotulo) : null;
}

/** A resposta do campo como o resumo a mostra; nula, o campo fica de fora. */
function mostrarResposta(
  campo: CampoDoFormulario,
  resposta: unknown,
  contexto: ContextoDasRespostas,
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

/**
 * O resumo das respostas, a linha da abertura na conversa: "<nome no resumo>: <resposta>", na
 * ordem do formulário e separados por " · ". A opção e o texto que aparecem por uma condição vão
 * depois da vírgula, junto da resposta do campo da primeira cláusula que vale, também em cadeia, e
 * as do Ativo vêm por último. A leitura do chamado o monta com os nomes de agora, para a pessoa
 * anonimizada sair dele como sai do chamado.
 */
export function resumoDasRespostas(
  formulario: Formulario,
  respostas: Respostas,
  contexto: ContextoDasRespostas,
): string {
  const porId = new Map(formulario.campos.map((campo) => [campo.id, campo]));
  const campos = camposQueAPessoaVe(formulario, respostas);
  const visiveis = new Set(campos.map((campo) => campo.id));
  const partes: { nome: string; respostas: string[] }[] = [];
  const parteDe = new Map<string, { nome: string; respostas: string[] }>();
  const ativos: string[] = [];
  for (const campo of campos) {
    const resposta = mostrarResposta(campo, respostaDe(respostas, campo.id), contexto);
    if (resposta === null) continue;
    if (campo.tipo === 'ativo') {
      ativos.push(`${nomeNoResumo(campo)}: ${resposta}`);
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
  return [...partes.map((parte) => `${parte.nome}: ${parte.respostas.join(', ')}`), ...ativos].join(
    ' · ',
  );
}
