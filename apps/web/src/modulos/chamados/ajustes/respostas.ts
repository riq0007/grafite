// O que a tela das respostas prontas decide sem a API (spec modulo-chamados, "Respostas prontas e
// horário da TI na tela"; change chamados-da-ti, design, "As respostas prontas (tarefa 5.25)"): a
// linha da tabela, a contagem e o limite, a gaveta da resposta, o que mudou nela, os tipos que ela
// oferece e as recusas que valem.
import type { components } from '@grafite/api-client';
import { MAXIMO_DE_RESPOSTAS_PRONTAS, MENSAGENS_DA_RESPOSTA_PRONTA } from '@grafite/domain';
import type { TipoDeChamado } from '../tipos/edicao.ts';

export type RespostaPronta = components['schemas']['RespostaPronta'];

/** A resposta como a gaveta a escreve e a gravação a pede, com os tipos pelo id. */
export type EdicaoDaResposta = components['schemas']['PedidoDaRespostaPronta'];

/** A resposta nova: vazia, sem esperar a resposta, sem pergunta e em todos os tipos. */
export const RESPOSTA_NOVA: EdicaoDaResposta = {
  rotulo: '',
  texto: '',
  esperaAResposta: false,
  opcoes: [],
  tipos: [],
};

/** O texto numa linha, para o começo dele caber na linha da tabela, com as reticências do CSS. */
export const textoNumaLinha = (texto: string) => texto.replace(/\s+/gu, ' ').trim();

const TIPOS_A_VISTA = 2;

/**
 * Os tipos na linha da tabela: "Todos os tipos", sem nenhum, ou os nomes, até dois, e depois "e
 * mais N". Os nomes vão separados por vírgula, porque muitos têm o "e", como "Acesso e senha".
 */
export function tiposNaLista(tipos: readonly { nome: string }[]): string {
  if (tipos.length === 0) return 'Todos os tipos';
  const nomes = tipos
    .slice(0, TIPOS_A_VISTA)
    .map(({ nome }) => nome)
    .join(', ');
  const resto = tipos.length - TIPOS_A_VISTA;
  return resto > 0 ? `${nomes} e mais ${resto}` : nomes;
}

export const contagemDasRespostas = (quantas: number) =>
  `${quantas} ${quantas === 1 ? 'resposta' : 'respostas'}`;

/** A recusa do limite, já na lista: com 100 respostas, a nova não chega a ser escrita. */
export const limiteDasRespostas = (quantas: number): string | null =>
  quantas >= MAXIMO_DE_RESPOSTAS_PRONTAS ? MENSAGENS_DA_RESPOSTA_PRONTA.limite : null;

/** O que a gaveta mostra: a resposta gravada, com os tipos pelo id, ou a nova, vazia. */
export function edicaoDaResposta(resposta: RespostaPronta | null): EdicaoDaResposta {
  if (!resposta) return { ...RESPOSTA_NOVA, opcoes: [], tipos: [] };
  return {
    rotulo: resposta.rotulo,
    texto: resposta.texto,
    esperaAResposta: resposta.esperaAResposta,
    opcoes: resposta.opcoes,
    tipos: resposta.tipos.map(({ id }) => id),
  };
}

/** Os mesmos tipos, em qualquer ordem: a ordem é a das caixas marcadas, e a API grava em ordem. */
function mesmosTipos(uns: readonly string[], outros: readonly string[]): boolean {
  const conjunto = new Set(uns);
  return conjunto.size === new Set(outros).size && outros.every((id) => conjunto.has(id));
}

/** Se o que está na gaveta difere do gravado, ou, na nova, se algo foi escrito ou marcado. */
export function mudouAResposta(edicao: EdicaoDaResposta, resposta: RespostaPronta | null): boolean {
  const gravada = edicaoDaResposta(resposta);
  return (
    edicao.rotulo !== gravada.rotulo ||
    edicao.texto !== gravada.texto ||
    edicao.esperaAResposta !== gravada.esperaAResposta ||
    edicao.opcoes.length !== gravada.opcoes.length ||
    edicao.opcoes.some((opcao, i) => opcao !== gravada.opcoes[i]) ||
    !mesmosTipos(edicao.tipos, gravada.tipos)
  );
}

export interface TipoParaEscolher {
  id: string;
  nome: string;
  /** O inativo segue na lista, com os chamados abertos dele, e a tela o diz depois do nome. */
  inativo: boolean;
}

/** Os tipos que a resposta pode ter: os Em uso e os Inativos, na ordem dos tipos, como na API. */
export function tiposParaEscolher(
  tipos: readonly Pick<TipoDeChamado, 'id' | 'nome' | 'situacao'>[],
): TipoParaEscolher[] {
  return tipos
    .filter(({ situacao }) => situacao !== 'rascunho')
    .map(({ id, nome, situacao }) => ({ id, nome, inativo: situacao === 'inativo' }));
}

export type CampoDaGaveta = 'rotulo' | 'texto' | 'tipos';
export type ErrosDaResposta = Partial<Record<CampoDaGaveta, string>>;

const CAMPOS_DA_GAVETA: readonly CampoDaGaveta[] = ['rotulo', 'texto', 'tipos'];

/** As recusas da API nos campos da gaveta; o resto a tela mostra no pé, pela frase do pedido. */
export function errosDaResposta(campos: Readonly<Record<string, string>>): ErrosDaResposta {
  const erros: ErrosDaResposta = {};
  for (const campo of CAMPOS_DA_GAVETA) {
    const erro = campos[campo];
    if (erro) erros[campo] = erro;
  }
  return erros;
}

/** As recusas que ainda valem: cada uma, enquanto o campo dela não muda. */
export function recusasQueValem(
  erros: ErrosDaResposta,
  naRecusa: EdicaoDaResposta,
  agora: EdicaoDaResposta,
): ErrosDaResposta {
  const valem: ErrosDaResposta = {};
  if (erros.rotulo && naRecusa.rotulo === agora.rotulo) valem.rotulo = erros.rotulo;
  if (erros.texto && naRecusa.texto === agora.texto) valem.texto = erros.texto;
  if (erros.tipos && mesmosTipos(naRecusa.tipos, agora.tipos)) valem.tipos = erros.tipos;
  return valem;
}
