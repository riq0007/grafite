// O estado do formulário que se preenche (change chamados-da-ti, design, decisão 21): as respostas,
// mudadas pelo `responder` do domínio, e o nome do que elas citam, para o título, o resumo e o campo
// mostrarem o escolhido sem pedir de novo. As funções são puras; a peça e quem a usa as chamam.
import {
  type AtivoDasRespostas,
  type CampoDoFormulario,
  type ContextoDasRespostas,
  camposVisiveis,
  type Formulario,
  mostrarData,
  mostrarDecimal,
  type RespostaDoCampo,
  type RespostasDoFormulario,
  responder,
} from '@grafite/domain';

/**
 * Onde o arquivo de um campo Anexo está: enviado agora e ainda sem dono, já tomado pelo chamado
 * ou, na prévia, só no navegador, sem envio. O lugar decide o endereço do download.
 */
export type OndeEstaOAnexo = 'sem-dono' | 'no-chamado' | 'no-navegador';

/** O arquivo de um campo Anexo, pelo nome original, com o tamanho e o lugar onde está. */
export interface AnexoCitado {
  nome: string;
  bytes: number;
  onde: OndeEstaOAnexo;
}

/** O nome do que as respostas citam, pelo id. */
export interface CitadosDoFormulario {
  ativos: ReadonlyMap<string, AtivoDasRespostas>;
  /** O caminho do local, como "Jundiaí › Recepção". */
  locais: ReadonlyMap<string, string>;
  pessoas: ReadonlyMap<string, string>;
  anexos: ReadonlyMap<string, AnexoCitado>;
}

export interface EstadoDoFormulario {
  respostas: RespostasDoFormulario;
  citados: CitadosDoFormulario;
}

export const ESTADO_VAZIO: EstadoDoFormulario = {
  respostas: {},
  citados: { ativos: new Map(), locais: new Map(), pessoas: new Map(), anexos: new Map() },
};

/** O que uma escolha cita, com o nome que o título, o resumo e o campo mostram. */
export type Citado =
  | { tipo: 'ativo'; id: string; ativo: AtivoDasRespostas }
  | { tipo: 'local'; id: string; caminho: string }
  | { tipo: 'pessoa'; id: string; nome: string }
  | { tipo: 'anexo'; id: string; anexo: AnexoCitado };

function citar(citados: CitadosDoFormulario, novos: readonly Citado[]): CitadosDoFormulario {
  if (novos.length === 0) return citados;
  const ativos = new Map(citados.ativos);
  const locais = new Map(citados.locais);
  const pessoas = new Map(citados.pessoas);
  const anexos = new Map(citados.anexos);
  for (const citado of novos) {
    if (citado.tipo === 'ativo') ativos.set(citado.id, citado.ativo);
    else if (citado.tipo === 'local') locais.set(citado.id, citado.caminho);
    else if (citado.tipo === 'pessoa') pessoas.set(citado.id, citado.nome);
    else anexos.set(citado.id, citado.anexo);
  }
  return { ativos, locais, pessoas, anexos };
}

/**
 * A resposta de um campo, sem o que o objeto herda: o id do campo pode ser um nome do JavaScript,
 * como `constructor`.
 */
export const respostaDoCampo = (
  respostas: Readonly<RespostasDoFormulario>,
  campoId: string,
): RespostaDoCampo | undefined =>
  Object.hasOwn(respostas, campoId) ? respostas[campoId] : undefined;

/**
 * A resposta nova de um campo, pelo `responder` do domínio: o campo que some perde a resposta com o
 * "Apagar a resposta se o campo sumir" ligado. O que a escolha cita entra nos citados.
 */
export function responderNoEstado(
  formulario: Formulario,
  estado: EstadoDoFormulario,
  campoId: string,
  resposta: RespostaDoCampo | null,
  citados: readonly Citado[] = [],
): EstadoDoFormulario {
  return {
    respostas: responder(formulario, estado.respostas, campoId, resposta),
    citados: citar(estado.citados, citados),
  };
}

/** O contexto do título e do resumo das respostas, com o nome do tipo. */
export function contextoDoEstado(
  estado: EstadoDoFormulario,
  nomeDoTipo: string,
): ContextoDasRespostas {
  const { ativos, locais, pessoas } = estado.citados;
  return { nomeDoTipo, ativos, locais, pessoas };
}

/** Quem preenche: quem abre, na gaveta; quem atende, no chamado; ou a pessoa, na prévia. */
export type QuemPreenche = 'abertura' | 'chamado' | 'pessoa';

export interface CampoQueAparece {
  campo: CampoDoFormulario;
  /** Se quem preenche muda a resposta; senão, ela aparece só para ler. */
  editavel: boolean;
}

/**
 * Os campos que aparecem, na ordem do formulário: os que a condição mostra, sem os só da TI para a
 * pessoa. No chamado, só os campos só da TI mudam, porque as respostas da pessoa não mudam depois da
 * abertura.
 */
export function camposQueAparecem(
  formulario: Formulario,
  respostas: Readonly<RespostasDoFormulario>,
  quem: QuemPreenche,
  soLeitura = false,
): CampoQueAparece[] {
  const visiveis = camposVisiveis(formulario, respostas);
  return formulario.campos
    .filter((campo) => visiveis.has(campo.id) && !(quem === 'pessoa' && campo.soDaTi))
    .map((campo) => ({
      campo,
      editavel: !soLeitura && (quem !== 'chamado' || campo.soDaTi),
    }));
}

/**
 * O número de cada pergunta no visual da aba (decisão 16), na ordem das que aparecem: o campo com
 * condição fica sem número, como a continuação da pergunta anterior, e por isso a numeração não
 * muda enquanto a pessoa responde.
 */
export function numerosDasPerguntas(aparecem: readonly CampoQueAparece[]): (number | null)[] {
  let numero = 0;
  return aparecem.map(({ campo }) => {
    if (campo.condicao.length > 0) return null;
    numero += 1;
    return numero;
  });
}

/**
 * Se cada campo, no visual da aba (decisão 16), se cola à pergunta de cima, como a continuação
 * dela (o m05 da 19): o campo com condição se cola quando o que aparece antes dele é a base da
 * condição ou outra continuação da mesma pergunta. Fora disso, fica no vão normal, sem se prender
 * à pergunta errada, e começa a própria continuação.
 */
export function continuacoesDasPerguntas(aparecem: readonly CampoQueAparece[]): boolean[] {
  // A pergunta de cima e as continuações coladas a ela.
  let deCima = new Set<string>();
  return aparecem.map(({ campo }) => {
    const cola = campo.condicao.some(({ campoId }) => deCima.has(campoId));
    if (cola) deCima.add(campo.id);
    else deCima = new Set([campo.id]);
    return cola;
  });
}

/** A explicação do campo só da TI, que é opcional na abertura e, obrigatório, exigido para resolver. */
export function descricaoDoCampo(campo: CampoDoFormulario): string | undefined {
  if (!campo.soDaTi) return undefined;
  return campo.obrigatorio ? 'Só a TI vê. A resposta é exigida para resolver.' : 'Só a TI vê.';
}

/**
 * O número como se digita: só os algarismos, com os pontos de milhar e os espaços do número
 * colado, que saem. O vazio é a resposta tirada; outro caractere não entra.
 */
export function lerNumero(texto: string): { ok: true; valor: number | null } | { ok: false } {
  const algarismos = texto.replace(/[.\s]/g, '');
  if (algarismos === '') return { ok: true, valor: null };
  return /^\d+$/.test(algarismos) ? { ok: true, valor: Number(algarismos) } : { ok: false };
}

/**
 * O que o campo Ativo diz a quem não vê os ativos, no lugar da busca: a falta e, na resposta
 * exigida, quem pode responder. Na abertura, exigida é a resposta da pessoa; no chamado, a do campo
 * só da TI obrigatório, para resolver. Na prévia, quem configura vê como a pessoa.
 */
export function avisoSemOsAtivos(campo: CampoDoFormulario, quem: QuemPreenche): string {
  if (quem === 'abertura' && campo.obrigatorio && !campo.soDaTi) {
    return 'Você não vê os ativos. Quem vê os ativos pode abrir este chamado.';
  }
  if (quem === 'chamado' && campo.obrigatorio) {
    return 'Você não vê os ativos. Quem vê os ativos pode responder este campo.';
  }
  return 'Você não vê os ativos.';
}

/** O ativo como o campo o mostra: o nome das telas e, com ele, o patrimônio. */
export const rotuloDoAtivoCitado = ({ rotulo, patrimonio }: AtivoDasRespostas): string =>
  patrimonio ? `${rotulo} · ${patrimonio}` : rotulo;

/**
 * A resposta para ler, no chamado; sem resposta, ou fora do tipo do campo, `null`. O Anexo aparece
 * como a lista dos arquivos, e não em texto.
 */
export function textoDaResposta(
  campo: CampoDoFormulario,
  resposta: RespostaDoCampo | undefined,
  citados: CitadosDoFormulario,
): string | null {
  if (resposta === undefined) return null;
  // A resposta em texto: o texto digitado, o id escolhido ou a data.
  const valor = typeof resposta === 'string' ? resposta : null;
  switch (campo.tipo) {
    case 'texto-curto':
    case 'texto-longo':
      return valor;
    case 'escolha-unica':
      return campo.opcoes.find((opcao) => opcao.id === valor)?.texto ?? null;
    case 'varias-opcoes': {
      const ids = Array.isArray(resposta) ? resposta : [];
      const textos = campo.opcoes.filter((opcao) => ids.includes(opcao.id)).map((o) => o.texto);
      return textos.length > 0 ? textos.join(', ') : null;
    }
    case 'ativo': {
      const ativo = valor === null ? undefined : citados.ativos.get(valor);
      return ativo ? rotuloDoAtivoCitado(ativo) : null;
    }
    case 'local':
      return (valor !== null && citados.locais.get(valor)) || null;
    case 'pessoa':
      return (valor !== null && citados.pessoas.get(valor)) || null;
    case 'data':
      return valor === null ? null : mostrarData(valor);
    case 'numero':
      return typeof resposta === 'number' ? mostrarDecimal(resposta) : null;
    case 'sim-ou-nao':
      if (typeof resposta !== 'boolean') return null;
      return resposta ? 'Sim' : 'Não';
    case 'anexo':
      return null;
  }
}

/**
 * De onde vêm os ativos sugeridos, depois do "Sugerido:": os sob a responsabilidade da pessoa, os do
 * local de trabalho dela ou os dois. Sem ativo sugerido, nada.
 */
export function origemDasSugestoes(
  motivos: readonly ('responsavel' | 'local')[],
  nome: string,
): string | undefined {
  const daPessoa = motivos.includes('responsavel');
  const doLocal = motivos.includes('local');
  if (daPessoa && doLocal) return `de ${nome} e do local de trabalho`;
  if (daPessoa) return `de ${nome}`;
  if (doLocal) return `do local de trabalho de ${nome}`;
  return undefined;
}
