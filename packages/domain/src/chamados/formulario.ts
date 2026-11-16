// O formulário do tipo de chamado (spec tipos-de-chamado, "Formulário do tipo", "Condição de um
// campo", "Título montado das respostas" e "O que acontece depois"; change chamados-da-ti, design,
// decisão 2): os campos em ordem, com ids curtos e estáveis, que ligam as condições, as respostas e
// o título; conferido à mão, como a configuração dos campos do ativo, com os erros por chave para a
// tela mostrá-los no lugar. Se os tipos de ativo existem e estão ativos, quem confere é a API.
import { lerTexto } from '../campos/textos.ts';
import { normalizarTexto } from '../texto.ts';
import { ForaDoFormato, fora, objeto, UUID } from './leitura.ts';

export const TIPOS_DE_CAMPO_DO_CHAMADO = [
  'texto-curto',
  'texto-longo',
  'escolha-unica',
  'varias-opcoes',
  'ativo',
  'local',
  'pessoa',
  'data',
  'numero',
  'anexo',
  'sim-ou-nao',
] as const;
export type TipoDeCampoDoChamado = (typeof TIPOS_DE_CAMPO_DO_CHAMADO)[number];

export const ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO: Record<TipoDeCampoDoChamado, string> = {
  'texto-curto': 'Texto curto',
  'texto-longo': 'Texto longo',
  'escolha-unica': 'Escolha única',
  'varias-opcoes': 'Várias opções',
  ativo: 'Ativo',
  local: 'Local',
  pessoa: 'Pessoa',
  data: 'Data',
  numero: 'Número',
  anexo: 'Anexo',
  'sim-ou-nao': 'Sim ou não',
};

/** O id de um campo ou de uma opção, o mesmo formato que o banco confere no anexo do campo. */
export const ID_DO_FORMULARIO = /^[A-Za-z0-9_-]{1,40}$/;

export const MAXIMO_DE_CAMPOS_DO_FORMULARIO = 20;
export const MAXIMO_DE_CLAUSULAS_DA_CONDICAO = 5;
const MINIMO_DE_OPCOES = 2;
const MAXIMO_DE_OPCOES = 12;

/** Os tipos de campo com opções, os que uma condição pode usar e os que podem dar o título. */
const COM_OPCOES: readonly TipoDeCampoDoChamado[] = ['escolha-unica', 'varias-opcoes'];
const NA_CONDICAO: readonly TipoDeCampoDoChamado[] = [...COM_OPCOES, 'sim-ou-nao'];
const NO_TITULO: readonly TipoDeCampoDoChamado[] = ['escolha-unica', 'texto-curto', 'ativo'];

export const RECUSA_DO_FORMULARIO =
  'O formulário não pôde ser lido. Recarregue a página e tente de novo.';

/** A recusa dos tipos de ativo do campo Ativo: aqui, o formato; na API, os que não estão ativos. */
export const RECUSA_DOS_TIPOS_DE_ATIVO = 'Escolha os tipos da lista.';

export interface OpcaoDoCampo {
  id: string;
  texto: string;
}

/** Como a cláusula se junta à anterior; a primeira não tem junção. */
export type JuncaoDaCondicao = 'e' | 'ou';

/** A cláusula: a opção na Escolha única e nas Várias opções, ou o sim ou não no Sim ou não. */
export type ClausulaDaCondicao = { campoId: string; juncao: JuncaoDaCondicao | null } & (
  | { opcaoId: string }
  | { valor: boolean }
);

export interface CampoDoFormulario {
  id: string;
  tipo: TipoDeCampoDoChamado;
  rotulo: string;
  /** O nome na linha do resumo; nulo, vale o rótulo sem o "?". */
  nomeNoResumo: string | null;
  obrigatorio: boolean;
  soDaTi: boolean;
  apagarSeSumir: boolean;
  opcoes: OpcaoDoCampo[];
  /** Os tipos aceitos no campo Ativo; nenhum, o campo aceita ativos de qualquer tipo. */
  tiposDeAtivo: string[];
  /** As cláusulas da condição; nenhuma, o campo aparece sempre. */
  condicao: ClausulaDaCondicao[];
}

export interface TituloDoFormulario {
  comecaPeloTipo: boolean;
  campoId: string | null;
}

export interface Formulario {
  titulo: TituloDoFormulario;
  campos: CampoDoFormulario[];
}

export type ConferenciaDoFormulario =
  | { ok: true; formulario: Formulario }
  | { ok: false; erros: Record<string, string> };

/**
 * O id pedido. O que falta ou sai do formato não é da tela, que sempre manda o id. O nome de uma
 * propriedade do objeto do JavaScript, como `constructor` e `__proto__`, também não: como chave
 * das respostas, ele devolveria a do protótipo ou o trocaria. O `idDoFormulario` nunca o gera.
 */
function lerId(valor: unknown): string {
  return typeof valor === 'string' && ID_DO_FORMULARIO.test(valor) && !(valor in Object.prototype)
    ? valor
    : fora();
}

class Erros {
  readonly porChave: Record<string, string> = {};

  /** Guarda a recusa; a primeira de cada chave vale. */
  anotar(chave: string, mensagem: string): void {
    this.porChave[chave] ??= mensagem;
  }

  get vazio(): boolean {
    return Object.keys(this.porChave).length === 0;
  }
}

function conferirOpcoes(campoId: string, pedidas: unknown, erros: Erros): OpcaoDoCampo[] {
  const lista = Array.isArray(pedidas) ? pedidas : [];
  if (lista.length < MINIMO_DE_OPCOES) {
    erros.anotar(`campos.${campoId}.opcoes`, `Inclua ao menos ${MINIMO_DE_OPCOES} opções.`);
  } else if (lista.length > MAXIMO_DE_OPCOES) {
    erros.anotar(`campos.${campoId}.opcoes`, `Use até ${MAXIMO_DE_OPCOES} opções.`);
  }
  const ids = new Set<string>();
  const textos = new Set<string>();
  return lista.map((item) => {
    const pedida = objeto(item) ?? fora();
    const id = lerId(pedida.id);
    if (ids.has(id)) fora();
    ids.add(id);
    const chave = `campos.${campoId}.opcoes.${id}`;
    const texto = lerTexto(pedida.texto, 60);
    if (!texto.ok) {
      erros.anotar(chave, texto.erro);
      return { id, texto: '' };
    }
    if (!texto.valor) {
      erros.anotar(chave, 'Escreva a opção.');
      return { id, texto: '' };
    }
    const normalizado = normalizarTexto(texto.valor);
    if (textos.has(normalizado)) erros.anotar(chave, 'Essa opção já existe.');
    textos.add(normalizado);
    return { id, texto: texto.valor };
  });
}

function conferirTiposDeAtivo(campoId: string, pedidos: unknown, erros: Erros): string[] {
  if (pedidos === undefined || pedidos === null) return [];
  if (
    !Array.isArray(pedidos) ||
    pedidos.some((tipo) => typeof tipo !== 'string' || !UUID.test(tipo))
  ) {
    erros.anotar(`campos.${campoId}.tiposDeAtivo`, RECUSA_DOS_TIPOS_DE_ATIVO);
    return [];
  }
  return [...new Set(pedidos.map((tipo) => String(tipo).toLowerCase()))];
}

/** O campo sem a condição, que depende dos campos anteriores e fica para depois. */
function conferirCampo(
  pedido: Record<string, unknown>,
  rotulos: Set<string>,
  erros: Erros,
): CampoDoFormulario {
  const id = lerId(pedido.id);
  const tipo = TIPOS_DE_CAMPO_DO_CHAMADO.find((t) => t === pedido.tipo) ?? fora();
  const lido = lerTexto(pedido.rotulo, 80);
  let rotulo = '';
  if (!lido.ok) erros.anotar(`campos.${id}.rotulo`, lido.erro);
  else if (!lido.valor) erros.anotar(`campos.${id}.rotulo`, 'Escreva o rótulo.');
  else {
    rotulo = lido.valor;
    const normalizado = normalizarTexto(rotulo);
    if (rotulos.has(normalizado)) {
      erros.anotar(`campos.${id}.rotulo`, 'Já existe um campo com esse rótulo.');
    }
    rotulos.add(normalizado);
  }
  const nome = lerTexto(pedido.nomeNoResumo, 30);
  if (!nome.ok) erros.anotar(`campos.${id}.nomeNoResumo`, nome.erro);
  return {
    id,
    tipo,
    rotulo,
    nomeNoResumo: nome.ok && nome.valor ? nome.valor : null,
    obrigatorio: pedido.obrigatorio === true,
    soDaTi: pedido.soDaTi === true,
    apagarSeSumir: pedido.apagarSeSumir !== false,
    opcoes: COM_OPCOES.includes(tipo) ? conferirOpcoes(id, pedido.opcoes, erros) : [],
    tiposDeAtivo: tipo === 'ativo' ? conferirTiposDeAtivo(id, pedido.tiposDeAtivo, erros) : [],
    condicao: [],
  };
}

/**
 * O nome do campo nas frases das recusas: o rótulo; o pedido, quando o rótulo foi recusado por
 * ser longo; e o id, sem rótulo escrito.
 */
const nomeDoCampo = (campo: CampoDoFormulario, pedido: Record<string, unknown>): string =>
  campo.rotulo || (typeof pedido.rotulo === 'string' && pedido.rotulo.trim()) || campo.id;

/**
 * A condição do campo na posição `indice`: só sobre os campos anteriores e, no campo que a pessoa
 * vê, só sobre os que ela também vê. O formato de cada cláusula vem antes das recusas da tela.
 */
function conferirCondicao(
  indice: number,
  campos: CampoDoFormulario[],
  pedidos: Record<string, unknown>[],
  erros: Erros,
): ClausulaDaCondicao[] {
  const campo = campos[indice] ?? fora();
  const pedido = pedidos[indice] ?? fora();
  const pedida = pedido.condicao;
  if (pedida === undefined || pedida === null) return [];
  if (!Array.isArray(pedida) || pedida.length > MAXIMO_DE_CLAUSULAS_DA_CONDICAO) return fora();
  const nome = nomeDoCampo(campo, pedido);
  const clausulas: ClausulaDaCondicao[] = [];
  pedida.forEach((item, posicao) => {
    const clausula = objeto(item) ?? fora();
    const campoId = lerId(clausula.campoId);
    const juncao = posicao === 0 ? null : clausula.juncao;
    if (juncao !== null && juncao !== 'e' && juncao !== 'ou') fora();
    const onde = campos.findIndex((outro) => outro.id === campoId);
    if (onde === -1) {
      erros.anotar(`campos.${campoId}`, `'${nome}' depende deste campo. Mude a condição antes.`);
      return;
    }
    const usado = campos[onde] ?? fora();
    if (onde === indice || !NA_CONDICAO.includes(usado.tipo)) fora();
    const simOuNao = usado.tipo === 'sim-ou-nao';
    if (simOuNao && typeof clausula.valor !== 'boolean') fora();
    const opcaoId = simOuNao ? null : lerId(clausula.opcaoId);
    const outro = nomeDoCampo(usado, pedidos[onde] ?? {});
    if (onde > indice) {
      erros.anotar(
        `campos.${campo.id}.condicao`,
        `'${nome}' depende de '${outro}', que precisa vir antes.`,
      );
      return;
    }
    if (!campo.soDaTi && usado.soDaTi) {
      erros.anotar(
        `campos.${campo.id}.condicao`,
        `'${nome}' aparece para a pessoa e depende de '${outro}', que só a TI vê.`,
      );
      return;
    }
    const base = { campoId, juncao: juncao as JuncaoDaCondicao | null };
    if (opcaoId === null) {
      clausulas.push({ ...base, valor: clausula.valor as boolean });
      return;
    }
    if (!usado.opcoes.some((opcao) => opcao.id === opcaoId)) {
      erros.anotar(
        `campos.${usado.id}.opcoes.${opcaoId}`,
        `'${nome}' depende desta opção. Mude a condição antes.`,
      );
      return;
    }
    clausulas.push({ ...base, opcaoId });
  });
  return clausulas;
}

function conferirTitulo(
  pedido: unknown,
  campos: CampoDoFormulario[],
  erros: Erros,
): TituloDoFormulario {
  const titulo = objeto(pedido) ?? fora();
  const comecaPeloTipo = titulo.comecaPeloTipo !== false;
  if (titulo.campoId === undefined || titulo.campoId === null) {
    return { comecaPeloTipo, campoId: null };
  }
  const campoId = lerId(titulo.campoId);
  const campo = campos.find((outro) => outro.id === campoId);
  if (!campo) {
    erros.anotar(
      `campos.${campoId}`,
      'O título usa este campo. Escolha outro no Título do chamado.',
    );
  } else if (!NO_TITULO.includes(campo.tipo)) {
    fora();
  } else if (campo.soDaTi) {
    // A pessoa lê o título do próprio chamado, e ele nunca mostra o que só a TI vê.
    erros.anotar(`campos.${campoId}`, "O título usa este campo. Ele não pode ser 'Só a TI vê'.");
  }
  return { comecaPeloTipo, campoId };
}

/**
 * A recusa do "Pede o ativo" no formulário, ou nula: o primeiro campo Ativo é o ativo ligado, e
 * todo chamado nasce com ele. A gravação do tipo a usa no formulário gravado
 * (`conferirTipoDeChamado`).
 */
export function recusaDoPedeOAtivo(campos: readonly CampoDoFormulario[]): string | null {
  const primeiro = campos.find((campo) => campo.tipo === 'ativo');
  if (!primeiro) return 'Pede o ativo: inclua no formulário um campo Ativo obrigatório.';
  if (!primeiro.obrigatorio || primeiro.soDaTi || primeiro.condicao.length > 0) {
    return "Pede o ativo: o primeiro campo Ativo precisa ser obrigatório, sem condição e sem o 'Só a TI vê'.";
  }
  return null;
}

/**
 * Confere o formulário pedido, com os ids que o construtor gera pelo `idDoFormulario`. Os erros
 * vêm por chave, como `campos.<id>.rotulo`. A recusa de remover o que outro usa vai na chave do
 * que saiu, para o construtor conferir o formulário com o campo tirado antes de tirá-lo. O que a
 * tela não monta, como o id que falta, recebe só a recusa geral, na chave `formulario`.
 */
export function conferirFormulario(
  pedido: unknown,
  opcoes: { pedeOAtivo: boolean },
): ConferenciaDoFormulario {
  try {
    const formulario = objeto(pedido) ?? fora();
    if (!Array.isArray(formulario.campos)) fora();
    const pedidos = (formulario.campos as unknown[]).map((campo) => objeto(campo) ?? fora());
    if (pedidos.length > MAXIMO_DE_CAMPOS_DO_FORMULARIO) {
      const mensagem = `O formulário tem no máximo ${MAXIMO_DE_CAMPOS_DO_FORMULARIO} campos.`;
      return { ok: false, erros: { campos: mensagem } };
    }
    const erros = new Erros();
    const rotulos = new Set<string>();
    const campos = pedidos.map((campo) => conferirCampo(campo, rotulos, erros));
    if (new Set(campos.map((campo) => campo.id)).size !== campos.length) fora();
    campos.forEach((campo, indice) => {
      campo.condicao = conferirCondicao(indice, campos, pedidos, erros);
    });
    const titulo = conferirTitulo(formulario.titulo, campos, erros);
    const recusaDoAtivo = opcoes.pedeOAtivo ? recusaDoPedeOAtivo(campos) : null;
    if (recusaDoAtivo) erros.anotar('pedeOAtivo', recusaDoAtivo);
    return erros.vazio
      ? { ok: true, formulario: { titulo, campos } }
      : { ok: false, erros: erros.porChave };
  } catch (erro) {
    if (erro instanceof ForaDoFormato) {
      return { ok: false, erros: { formulario: RECUSA_DO_FORMULARIO } };
    }
    throw erro;
  }
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * O id de um campo ou de uma opção novos, dos bytes sorteados por quem chama: o construtor da web
 * passa o `crypto.getRandomValues`, que o domínio não tem. Com 10 bytes, a repetição num
 * formulário não acontece na prática.
 */
export function idDoFormulario(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 40), (byte) => ALFABETO[byte % ALFABETO.length]).join('');
}
