// A paleta do construtor do formulário (change chamados-da-ti, design, "O construtor, a paleta
// (tarefa 5.21)"; m09): o campo novo, opcional e com o rótulo único, acrescentar na posição, com o
// limite de 20 campos, e a posição da linha de encaixe pelo alvo sob o ponteiro.
import {
  type CampoDoFormulario,
  MAXIMO_DE_CAMPOS_DO_FORMULARIO,
  normalizarTexto,
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO,
  type TipoDeCampoDoChamado,
} from '@grafite/domain';
import type { AlvoDoArraste } from '../useArrastar.ts';

/** O alvo do espaço depois do último campo, que solta o campo no fim. */
export const ALVO_DO_FIM = 'fim';

/**
 * O alvo da própria linha de encaixe: ela tira o campo de baixo do ponteiro, e a posição fica onde
 * está, em vez de pular a cada movimento.
 */
export const ALVO_DA_LINHA = 'linha';

const COM_OPCOES: readonly TipoDeCampoDoChamado[] = ['escolha-unica', 'varias-opcoes'];

/** O nome do tipo de campo, único no formulário: "Número" e, com um "Número", "Número 2". */
export function rotuloDoCampoNovo(
  tipo: TipoDeCampoDoChamado,
  campos: readonly CampoDoFormulario[],
): string {
  const nome = ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[tipo];
  const usados = new Set(campos.map(({ rotulo }) => normalizarTexto(rotulo)));
  let rotulo = nome;
  for (let numero = 2; usados.has(normalizarTexto(rotulo)); numero++) rotulo = `${nome} ${numero}`;
  return rotulo;
}

/**
 * O campo acrescentado pela paleta: opcional, que a pessoa vê, sem condição, com o "Apagar a
 * resposta se o campo sumir" ligado e, no Ativo, de qualquer tipo. A Escolha única e as Várias
 * opções nascem com duas opções, o mínimo que a gravação aceita. Os ids saem do `gerarId`, o
 * `idDoFormulario` com os bytes sorteados; o que repete um id do formulário sai de novo.
 */
export function campoNovo(
  tipo: TipoDeCampoDoChamado,
  campos: readonly CampoDoFormulario[],
  gerarId: () => string,
): CampoDoFormulario {
  const usados = new Set(
    campos.flatMap(({ id, opcoes }) => [id, ...opcoes.map((opcao) => opcao.id)]),
  );
  const idLivre = () => {
    let id = gerarId();
    while (usados.has(id)) id = gerarId();
    usados.add(id);
    return id;
  };
  const id = idLivre();
  return {
    id,
    tipo,
    rotulo: rotuloDoCampoNovo(tipo, campos),
    nomeNoResumo: null,
    obrigatorio: false,
    soDaTi: false,
    apagarSeSumir: true,
    opcoes: COM_OPCOES.includes(tipo)
      ? [
          { id: idLivre(), texto: 'Opção 1' },
          { id: idLivre(), texto: 'Opção 2' },
        ]
      : [],
    tiposDeAtivo: [],
    condicao: [],
  };
}

/** Os campos com o novo na posição; com 20 campos, nenhum: a paleta já fica desligada. */
export function acrescentarCampo(
  campos: readonly CampoDoFormulario[],
  campo: CampoDoFormulario,
  posicao: number,
): CampoDoFormulario[] | null {
  if (campos.length >= MAXIMO_DE_CAMPOS_DO_FORMULARIO) return null;
  const lugar = Math.min(Math.max(posicao, 0), campos.length);
  return [...campos.slice(0, lugar), campo, ...campos.slice(lugar)];
}

/** A frase da paleta desligada, com 20 campos; antes disso, nenhuma. */
export function avisoDaPaleta(campos: readonly CampoDoFormulario[]): string | null {
  return campos.length >= MAXIMO_DE_CAMPOS_DO_FORMULARIO
    ? `O formulário tem no máximo ${MAXIMO_DE_CAMPOS_DO_FORMULARIO} campos.`
    : null;
}

/**
 * Onde o campo entra, pelo alvo sob o ponteiro: antes do campo na metade de cima e depois dele na de
 * baixo; o fim, no espaço depois do último; e, na própria linha, onde ela já está. Fora da lista, ou
 * num campo que saiu, nenhum lugar.
 */
export function posicaoDoEncaixe(
  campos: readonly CampoDoFormulario[],
  alvo: AlvoDoArraste | null,
  anterior: number | null,
): number | null {
  if (alvo === null) return null;
  if (alvo.chave === ALVO_DO_FIM) return campos.length;
  if (alvo.chave === ALVO_DA_LINHA) return anterior;
  const indice = campos.findIndex(({ id }) => id === alvo.chave);
  if (indice < 0) return null;
  return alvo.metade === 'antes' ? indice : indice + 1;
}

/** O texto da linha de encaixe, como no m09. */
export const textoDoEncaixe = (tipo: TipoDeCampoDoChamado): string =>
  `Solte o campo “${ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[tipo]}” aqui`;

/** O texto da linha de encaixe ao mover um campo da lista pela alça (tarefa 5.22). */
export const textoDoEncaixeDoCampo = (rotulo: string): string => `Solte o campo “${rotulo}” aqui`;

/** O aviso para o leitor de tela: onde, nos campos de antes, o campo novo entrou. */
export function avisoDoAcrescentado(
  rotulo: string,
  campos: readonly CampoDoFormulario[],
  posicao: number,
): string {
  if (campos.length === 0) return `Campo “${rotulo}” acrescentado.`;
  const depois = campos[posicao];
  return depois
    ? `Campo “${rotulo}” acrescentado antes de “${depois.rotulo}”.`
    : `Campo “${rotulo}” acrescentado no fim.`;
}
