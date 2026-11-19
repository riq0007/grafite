// As respostas do formulário do tipo de chamado (spec tipos-de-chamado, "Condição de um campo" e
// "Respostas do formulário"; change chamados-da-ti, design, decisão 2): os campos que aparecem com
// as respostas, o formulário que se preenche, com o "Apagar a resposta se o campo sumir", a
// conferência da abertura, com os erros na chave do campo, e a mudança dos campos só da TI depois
// dela (tarefa 4.15). Se o ativo, o local e a pessoa existem e estão ativos, e se os arquivos são
// aceitos, quem confere é a API.
//
// Os ids dos campos podem ser nomes do JavaScript, como `constructor` e `__proto__`: as respostas
// são lidas só do próprio pedido e montadas pelo `Object.fromEntries`, que nunca troca o protótipo.
import { lerTexto } from '../campos/textos.ts';
import { vazio } from '../campos/tipos.ts';
import {
  type CampoDoFormulario,
  type ClausulaDaCondicao,
  type Formulario,
  RECUSA_DO_FORMULARIO,
} from './formulario.ts';
import { ForaDoFormato, fora, objeto, UUID } from './leitura.ts';

/** A resposta no tipo do campo (design, decisão 2). */
export type RespostaDoCampo = string | string[] | number | boolean;

/** As respostas pelo id do campo; o campo sem resposta não tem a chave. */
export type RespostasDoFormulario = Record<string, RespostaDoCampo>;

export type ConferenciaDasRespostas =
  | { ok: true; respostas: RespostasDoFormulario }
  | { ok: false; erros: Record<string, string> };

const LIMITES_DO_TEXTO = { 'texto-curto': 200, 'texto-longo': 4000 } as const;
const MAIOR_NUMERO = 999_999_999;
/** Quantos arquivos um campo Anexo aceita. */
export const MAXIMO_DE_ANEXOS = 5;

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A resposta do campo no pedido, sem o que o objeto herda, como o `constructor`. */
export const respostaDe = (
  respostas: Readonly<Record<string, unknown>>,
  campoId: string,
): unknown => (Object.hasOwn(respostas, campoId) ? respostas[campoId] : undefined);

/** A cláusula vale com a resposta do campo de que ela depende; sem a resposta, não vale. */
export function vale(
  clausula: ClausulaDaCondicao,
  base: CampoDoFormulario,
  resposta: unknown,
): boolean {
  if ('valor' in clausula) return resposta === clausula.valor;
  if (base.tipo === 'varias-opcoes') {
    return Array.isArray(resposta) && resposta.includes(clausula.opcaoId);
  }
  return resposta === clausula.opcaoId;
}

/** A condição como a frase a escreve: as partes com "e" se juntam antes das com "ou". */
function mostra(
  condicao: readonly ClausulaDaCondicao[],
  valeA: (clausula: ClausulaDaCondicao) => boolean,
): boolean {
  if (condicao.length === 0) return true;
  let algumGrupo = false;
  let grupo = true;
  for (const clausula of condicao) {
    if (clausula.juncao === 'ou') {
      algumGrupo ||= grupo;
      grupo = true;
    }
    grupo &&= valeA(clausula);
  }
  return algumGrupo || grupo;
}

/**
 * Os ids dos campos que aparecem com as respostas, na ordem do formulário. A condição só vê os
 * campos visíveis: a resposta guardada de um campo escondido não mostra o que depende dele. O "Só
 * a TI vê" não conta aqui; quem mostra o formulário à pessoa tira os campos só da TI.
 */
export function camposVisiveis(
  formulario: Formulario,
  respostas: Readonly<Record<string, unknown>>,
): ReadonlySet<string> {
  const porId = new Map(formulario.campos.map((campo) => [campo.id, campo]));
  const visiveis = new Set<string>();
  for (const campo of formulario.campos) {
    const aparece = mostra(campo.condicao, (clausula) => {
      const base = porId.get(clausula.campoId);
      return (
        base !== undefined &&
        visiveis.has(base.id) &&
        vale(clausula, base, respostaDe(respostas, base.id))
      );
    });
    if (aparece) visiveis.add(campo.id);
  }
  return visiveis;
}

/**
 * Os campos só da TI obrigatórios, vazios e mostrados pela condição, na ordem do formulário: os que
 * o resolver exige (spec chamados, "Ativo ligado e campos da TI"). Os da pessoa passaram pela
 * conferência da abertura.
 */
export function camposDaTiQueFaltam(
  formulario: Formulario,
  respostas: Readonly<Record<string, unknown>>,
): CampoDoFormulario[] {
  const visiveis = camposVisiveis(formulario, respostas);
  return formulario.campos.filter(
    (campo) =>
      campo.soDaTi &&
      campo.obrigatorio &&
      visiveis.has(campo.id) &&
      vazio(respostaDe(respostas, campo.id)),
  );
}

/**
 * A contagem dos "Campos do tipo" do chamado aberto (spec modulo-chamados, "Chamado aberto"): os
 * campos que a condição mostra com resposta, sem a guardada de um campo escondido, e os pendentes,
 * os que o resolver exige.
 */
export function contagemDasRespostas(
  formulario: Formulario,
  respostas: Readonly<Record<string, unknown>>,
): { respondidos: number; pendentes: number } {
  const visiveis = camposVisiveis(formulario, respostas);
  const respondidos = formulario.campos.filter(
    (campo) => visiveis.has(campo.id) && !vazio(respostaDe(respostas, campo.id)),
  ).length;
  return { respondidos, pendentes: camposDaTiQueFaltam(formulario, respostas).length };
}

/**
 * O formulário que se preenche, na gaveta da abertura e na prévia: grava a resposta nova, ou tira
 * a chave com a resposta vazia, e o campo que some perde a dele quando tem o "Apagar a resposta se
 * o campo sumir" ligado. Desligado, ele a guarda para quando voltar.
 */
export function responder(
  formulario: Formulario,
  respostas: Readonly<RespostasDoFormulario>,
  campoId: string,
  resposta: RespostaDoCampo | null,
): RespostasDoFormulario {
  const entradas = Object.entries(respostas).filter(([id]) => id !== campoId);
  if (resposta !== null && !vazio(resposta)) entradas.push([campoId, resposta]);
  const novas = Object.fromEntries(entradas);
  const visiveis = camposVisiveis(formulario, novas);
  const apagados = new Set(
    formulario.campos
      .filter((campo) => campo.apagarSeSumir && !visiveis.has(campo.id))
      .map((campo) => campo.id),
  );
  return Object.fromEntries(entradas.filter(([id]) => !apagados.has(id)));
}

type Leitura = { ok: true; valor: RespostaDoCampo | null } | { ok: false; erro: string };

const aceita = (valor: RespostaDoCampo): Leitura => ({ ok: true, valor });
const recusada = (erro: string): Leitura => ({ ok: false, erro });

/** A data em aaaa-mm-dd, como o campo de data do kit a escreve, num dia que existe. */
function dataQueExiste(texto: string): boolean {
  const partes = DATA.exec(texto);
  if (!partes) return false;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

/** A resposta de um campo no tipo dele; a que a tela não monta sai pelo `fora`. */
function lerResposta(campo: CampoDoFormulario, bruta: unknown): Leitura {
  if (vazio(bruta)) return { ok: true, valor: null };
  switch (campo.tipo) {
    case 'texto-curto':
    case 'texto-longo': {
      if (typeof bruta !== 'string') return fora();
      const texto = lerTexto(bruta, LIMITES_DO_TEXTO[campo.tipo]);
      return texto.ok ? { ok: true, valor: texto.valor } : recusada(texto.erro);
    }
    case 'escolha-unica':
      if (typeof bruta !== 'string') return fora();
      return campo.opcoes.some((opcao) => opcao.id === bruta)
        ? aceita(bruta)
        : recusada('Escolha uma das opções.');
    case 'varias-opcoes': {
      if (!Array.isArray(bruta) || bruta.some((id) => typeof id !== 'string')) return fora();
      if (bruta.some((id) => !campo.opcoes.some((opcao) => opcao.id === id))) {
        return recusada('Escolha uma das opções.');
      }
      return aceita(campo.opcoes.filter((opcao) => bruta.includes(opcao.id)).map((o) => o.id));
    }
    case 'ativo':
    case 'local':
    case 'pessoa':
      if (typeof bruta !== 'string' || !UUID.test(bruta)) return fora();
      return aceita(bruta.toLowerCase());
    case 'data':
      return typeof bruta === 'string' && dataQueExiste(bruta) ? aceita(bruta) : fora();
    case 'numero':
      if (typeof bruta !== 'number') return fora();
      return Number.isInteger(bruta) && bruta >= 0 && bruta <= MAIOR_NUMERO
        ? aceita(bruta)
        : recusada('Use um número inteiro de 0 a 999.999.999.');
    case 'anexo': {
      if (!Array.isArray(bruta) || bruta.some((id) => typeof id !== 'string' || !UUID.test(id))) {
        return fora();
      }
      const ids = [...new Set(bruta.map((id) => String(id).toLowerCase()))];
      return ids.length > MAXIMO_DE_ANEXOS
        ? recusada(`Anexe até ${MAXIMO_DE_ANEXOS} arquivos.`)
        : aceita(ids);
    }
    case 'sim-ou-nao':
      return typeof bruta === 'boolean' ? aceita(bruta) : fora();
  }
}

/**
 * Confere as respostas da abertura com o formulário do tipo. Devolve as respostas dos campos
 * visíveis, no tipo de cada um e só com os campos do formulário, ou os erros na chave do campo
 * (`campos.<id>`). O campo escondido fica sem resposta, também a guardada; o só da TI é opcional
 * na abertura. O que a tela não monta recebe só a recusa geral, na chave `formulario`.
 */
export function conferirRespostas(
  formulario: Formulario,
  pedido: unknown,
): ConferenciaDasRespostas {
  const geral: ConferenciaDasRespostas = { ok: false, erros: { formulario: RECUSA_DO_FORMULARIO } };
  const respostas = objeto(pedido);
  if (!respostas) return geral;
  try {
    const visiveis = camposVisiveis(formulario, respostas);
    const erros: Record<string, string> = {};
    const entradas: [string, RespostaDoCampo][] = [];
    for (const campo of formulario.campos) {
      if (!visiveis.has(campo.id)) continue;
      const lida = lerResposta(campo, respostaDe(respostas, campo.id));
      if (!lida.ok) erros[`campos.${campo.id}`] = lida.erro;
      else if (lida.valor !== null) entradas.push([campo.id, lida.valor]);
      else if (campo.obrigatorio && !campo.soDaTi) {
        erros[`campos.${campo.id}`] = 'Responda esta pergunta.';
      }
    }
    return Object.keys(erros).length === 0
      ? { ok: true, respostas: Object.fromEntries(entradas) }
      : { ok: false, erros };
  } catch (erro) {
    if (erro instanceof ForaDoFormato) return geral;
    throw erro;
  }
}

/** Um campo que a mudança dos campos da TI mudou: a resposta guardada antes e a de depois, ou nulo. */
export interface CampoMudado {
  campo: CampoDoFormulario;
  antes: unknown;
  depois: RespostaDoCampo | null;
}

export type MudancaDosCamposDaTi =
  | { ok: true; respostas: RespostasDoFormulario; mudados: CampoMudado[] }
  | { ok: false; erros: Record<string, string> };

/**
 * A mudança dos campos só da TI do chamado (spec chamados, "Ativo ligado e campos da TI"; change
 * chamados-da-ti, design, "O ativo, o título e os campos da TI"). O pedido traz só as chaves que
 * mudam, com o vazio ou o nulo para apagar; a chave que não é um campo só da TI recebe a recusa
 * geral, porque a tela não a monta. As respostas novas se juntam às guardadas, e tudo passa pela
 * conferência da abertura: o campo que some pela condição perde a resposta, e a recusa de cada campo
 * vai na chave dele. Os campos que mudaram vêm na ordem do formulário, para a auditoria e os anexos;
 * sem nenhum, nada muda.
 */
export function mudarCamposDaTi(
  formulario: Formulario,
  guardadas: Readonly<Record<string, unknown>>,
  pedido: unknown,
): MudancaDosCamposDaTi {
  const novas = objeto(pedido);
  const daTi = new Set(formulario.campos.filter((campo) => campo.soDaTi).map((campo) => campo.id));
  if (!novas || Object.keys(novas).some((id) => !daTi.has(id))) {
    return { ok: false, erros: { formulario: RECUSA_DO_FORMULARIO } };
  }
  const juntas = Object.fromEntries([
    ...Object.entries(guardadas).filter(([id]) => !Object.hasOwn(novas, id)),
    ...Object.entries(novas),
  ]);
  const conferidas = conferirRespostas(formulario, juntas);
  if (!conferidas.ok) return conferidas;
  const { respostas } = conferidas;
  const mudados = formulario.campos.flatMap((campo): CampoMudado[] => {
    const antes = respostaDe(guardadas, campo.id) ?? null;
    const depois = Object.hasOwn(respostas, campo.id) ? (respostas[campo.id] ?? null) : null;
    return JSON.stringify(antes) === JSON.stringify(depois) ? [] : [{ campo, antes, depois }];
  });
  return { ok: true, respostas, mudados };
}
