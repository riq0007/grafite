// Ler e mostrar o valor de um campo (spec campos-personalizados; design do P1a, decisão 2): as
// mesmas funções na API, nas telas e na importação, para as mensagens serem iguais em todo lugar.
// Ler de novo um valor guardado dá o mesmo valor.
import { lerData, mostrarData } from './datas.ts';
import { lerLista, lerListaMultipla, mostrarLista, mostrarListaMultipla } from './listas.ts';
import { lerDecimal, lerInteiro, lerMoeda, mostrarDecimal, mostrarMoeda } from './numeros.ts';
import { lerIp, lerMac, lerUrl } from './rede.ts';
import { lerTexto } from './textos.ts';
import {
  aceito,
  type DefinicaoDeCampo,
  ENVIE_PELA_FICHA,
  type Leitura,
  recusado,
  type ValorDeCampo,
  vazio,
} from './tipos.ts';

/** A chave de produto da Microsoft: cinco blocos de cinco letras ou números. */
const CHAVE_DE_PRODUTO = /[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ESCOLHA_DA_REFERENCIA = {
  pessoa: 'Escolha uma pessoa da lista.',
  local: 'Escolha um local da lista.',
  ativo: 'Escolha um ativo da lista.',
  fornecedor: 'Escolha um fornecedor da lista.',
} as const;

/** A licença guarda a edição e a modalidade, e nunca a chave, que vai para o cofre. */
function lerLicenca(entrada: unknown): Leitura<string> {
  const lida = lerTexto(entrada, 200);
  if (lida.ok && lida.valor !== null && CHAVE_DE_PRODUTO.test(lida.valor)) {
    return recusado('A chave de produto não fica no cadastro: guarde-a no cofre.');
  }
  return lida;
}

/** O arquivo enviado pela ficha, pelo id do registro dele; o valor guardado se lê igual. */
function lerArquivo(entrada: unknown): Leitura<string> {
  if (vazio(entrada)) return aceito(null);
  if (typeof entrada !== 'string' || !UUID.test(entrada.trim())) return recusado(ENVIE_PELA_FICHA);
  return aceito(entrada.trim().toLowerCase());
}

/** A referência a um registro da organização, pelo id; quem confere se ele existe é a API. */
function lerReferencia(
  entrada: unknown,
  tipo: keyof typeof ESCOLHA_DA_REFERENCIA,
): Leitura<string> {
  if (vazio(entrada)) return aceito(null);
  if (typeof entrada !== 'string' || !UUID.test(entrada.trim())) {
    return recusado(ESCOLHA_DA_REFERENCIA[tipo]);
  }
  return aceito(entrada.trim().toLowerCase());
}

export function lerValor(definicao: DefinicaoDeCampo, entrada: unknown): Leitura {
  const configuracao = definicao.configuracao ?? {};
  switch (definicao.tipo) {
    case 'texto':
      return lerTexto(entrada, 200);
    case 'texto-longo':
      return lerTexto(entrada, 5000);
    case 'inteiro':
      return lerInteiro(entrada, configuracao);
    case 'decimal':
      return lerDecimal(entrada, configuracao);
    case 'moeda':
      return lerMoeda(entrada);
    case 'data':
      return lerData(entrada);
    case 'lista':
      return lerLista(entrada, configuracao.opcoes ?? []);
    case 'lista-multipla':
      return lerListaMultipla(entrada, configuracao.opcoes ?? []);
    case 'pessoa':
    case 'local':
    case 'ativo':
    case 'fornecedor':
      return lerReferencia(entrada, definicao.tipo);
    case 'licenca':
      return lerLicenca(entrada);
    case 'url':
      return lerUrl(entrada);
    case 'ip':
      return lerIp(entrada);
    case 'mac':
      return lerMac(entrada);
    case 'arquivo':
    case 'imagem':
      return lerArquivo(entrada);
  }
}

/**
 * O texto que a tela mostra para o valor guardado; vazio sem valor. A pessoa, o local, o ativo e o
 * fornecedor aparecem pelo nome que `nomeDoRegistro` der, ou pelo id, e o arquivo e a imagem, pelo
 * nome do arquivo.
 */
export function mostrarValor(
  definicao: DefinicaoDeCampo,
  valor: ValorDeCampo | null,
  nomeDoRegistro?: (id: string) => string | undefined,
): string {
  if (valor === null) return '';
  const opcoes = definicao.configuracao?.opcoes ?? [];
  switch (definicao.tipo) {
    case 'inteiro':
    case 'decimal':
      return mostrarDecimal(Number(valor));
    case 'moeda':
      return mostrarMoeda(Number(valor));
    case 'data':
      return mostrarData(String(valor));
    case 'lista':
      return mostrarLista(String(valor), opcoes);
    case 'lista-multipla':
      return mostrarListaMultipla(Array.isArray(valor) ? valor : [String(valor)], opcoes);
    case 'pessoa':
    case 'local':
    case 'ativo':
    case 'fornecedor':
    case 'arquivo':
    case 'imagem':
      return nomeDoRegistro?.(String(valor)) ?? String(valor);
    default:
      return String(valor);
  }
}
