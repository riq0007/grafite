// O que a gaveta da abertura decide sem a tela (spec modulo-chamados, "Abrir um chamado"; spec
// chamados, "Abrir um chamado pela TI"; change chamados-da-ti, design, "A gaveta da abertura
// (tarefa 5.18)"): o pedido do `POST /chamados`, o título montado das respostas, que quem abre
// troca, as recusas do 400 na chave de cada campo da tela, o endereço que abre a gaveta e o retorno.
import { type Formulario, tituloDasRespostas } from '@grafite/domain';
import {
  contextoDoEstado,
  ESTADO_VAZIO,
  type EstadoDoFormulario,
  respostaDoCampo,
} from '../formulario/estado.ts';

/** O que a gaveta guarda: quem pediu, o tipo, as respostas, o título escrito e o "Fica comigo". */
export interface Abertura {
  /** A pessoa que pediu, pelo id. */
  pessoa: string | null;
  /** O tipo escolhido, pelo id. */
  tipo: string | null;
  estado: EstadoDoFormulario;
  /** O título que quem abre escreveu; nulo, vale o montado das respostas. */
  tituloEscrito: string | null;
  ficaComigo: boolean;
}

export const ABERTURA_VAZIA: Abertura = {
  pessoa: null,
  tipo: null,
  estado: ESTADO_VAZIO,
  tituloEscrito: null,
  ficaComigo: true,
};

/**
 * O pedido do `POST /chamados`: o título que quem abre não tocou vai nulo, e a API monta o mesmo
 * título com os nomes de agora; o escrito vai como está, também vazio, para a API recusá-lo no campo.
 * As respostas vão todas, também as do campo escondido, que a API deixa de fora.
 */
export function pedidoDaAbertura({ pessoa, tipo, estado, tituloEscrito, ficaComigo }: Abertura) {
  return { pessoa, tipo, titulo: tituloEscrito, respostas: estado.respostas, ficaComigo };
}

/** O título no campo: o escrito, ou o montado das respostas; trocado, com o montado para voltar. */
export interface TituloNaGaveta {
  valor: string;
  montado: string;
  trocado: boolean;
}

/** O título do tipo escolhido, montado com os nomes do que as respostas citam, sem pedir à API. */
export function tituloNaGaveta(
  tipo: { nome: string; formulario: Formulario },
  { estado, tituloEscrito }: Pick<Abertura, 'estado' | 'tituloEscrito'>,
): TituloNaGaveta {
  const montado = tituloDasRespostas(
    tipo.formulario,
    estado.respostas,
    contextoDoEstado(estado, tipo.nome),
  );
  return {
    valor: tituloEscrito ?? montado,
    montado,
    trocado: tituloEscrito !== null && tituloEscrito !== montado,
  };
}

/** As chaves que a gaveta mostra num campo: a pessoa, o tipo e o título. */
const DOS_CAMPOS_DA_GAVETA = new Set(['pessoa', 'tipo', 'titulo']);

/** A chave de um campo do formulário, também a de dentro dele, como `campos.foto.0`. */
const DE_UM_CAMPO = /^campos\.([^.]+)/;

/**
 * As recusas do 400 na chave da tela: a pessoa, o tipo, o título e cada campo do formulário ficam
 * no lugar deles; as respostas, o formulário e o que a gaveta não mostra viram a recusa geral do
 * formulário, no alto dele, sem campo. Com duas recusas na mesma chave, fica a primeira.
 */
export function errosDaAbertura(campos: Readonly<Record<string, string>>): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const [chave, erro] of Object.entries(campos)) {
    const doCampo = DE_UM_CAMPO.exec(chave);
    const destino = DOS_CAMPOS_DA_GAVETA.has(chave)
      ? chave
      : doCampo
        ? `campos.${doCampo[1]}`
        : 'formulario';
    if (!Object.hasOwn(erros, destino)) erros[destino] = erro;
  }
  return erros;
}

const igual = (uma: unknown, outra: unknown) =>
  JSON.stringify(uma ?? null) === JSON.stringify(outra ?? null);

/**
 * As recusas que ainda valem: cada uma, enquanto o que ela recusou não muda, como a pessoa, o título
 * escrito ou a resposta do campo. As dos campos e a do formulário valem só no mesmo tipo, porque
 * eram do formulário dele.
 */
export function errosQueValem(
  erros: Readonly<Record<string, string>>,
  naRecusa: Abertura,
  agora: Abertura,
): Record<string, string> {
  const mesmoTipo = naRecusa.tipo === agora.tipo;
  const valem: Record<string, string> = {};
  for (const [chave, erro] of Object.entries(erros)) {
    const doCampo = DE_UM_CAMPO.exec(chave)?.[1];
    let vale: boolean;
    if (chave === 'pessoa') vale = naRecusa.pessoa === agora.pessoa;
    else if (chave === 'titulo') vale = naRecusa.tituloEscrito === agora.tituloEscrito;
    else if (doCampo !== undefined) {
      vale =
        mesmoTipo &&
        igual(
          respostaDoCampo(naRecusa.estado.respostas, doCampo),
          respostaDoCampo(agora.estado.respostas, doCampo),
        );
    } else vale = mesmoTipo;
    if (vale) valem[chave] = erro;
  }
  return valem;
}

/** A busca do endereço das telas com o "Novo chamado": o `abrir` abre a gaveta. */
export interface BuscaDaAbertura {
  abrir?: 1;
}

/** O `abrir=1` do endereço, também como texto ou verdadeiro; qualquer outro valor não abre nada. */
export function validarAbertura(busca: Record<string, unknown>): BuscaDaAbertura {
  const { abrir } = busca;
  return abrir === 1 || abrir === '1' || abrir === true ? { abrir: 1 } : {};
}

/** O aviso depois da abertura. */
export const retornoDaAbertura = (numero: number) => `Chamado #${numero} aberto.`;
