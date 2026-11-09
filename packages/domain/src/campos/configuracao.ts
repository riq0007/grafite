// A configuração de cada tipo de campo (spec campos-personalizados; design do P1a, decisão 3, e do
// P1d, decisão 1): os limites dos números, as casas do decimal, as opções das listas, cada uma com
// um id que não muda, e, no campo de ativo, os tipos aceitos e o nome do lado de lá. As opções não
// são excluídas, só inativadas. Se os tipos aceitos existem e estão ativos, quem confere é a API.
import { normalizarTexto } from '../texto.ts';
import { lerDecimal, lerInteiro } from './numeros.ts';
import { lerTexto } from './textos.ts';
import {
  type ConfiguracaoDoCampo,
  type OpcaoDaLista,
  SITUACOES_DA_OPCAO,
  type TipoDeCampo,
} from './tipos.ts';

const MAXIMO_DE_OPCOES = 200;
const MAXIMO_DE_TIPOS_ACEITOS = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConferenciaDaConfiguracao =
  | { ok: true; configuracao: ConfiguracaoDoCampo }
  | { ok: false; erros: Record<string, string> };

/** As chaves que a configuração de cada tipo de campo aceita. */
function chavesDoTipo(tipo: TipoDeCampo): readonly string[] {
  if (tipo === 'inteiro') return ['minimo', 'maximo'];
  if (tipo === 'decimal') return ['minimo', 'maximo', 'casas'];
  if (tipo === 'lista' || tipo === 'lista-multipla') return ['opcoes'];
  if (tipo === 'ativo') return ['tipos', 'ladoDeLa'];
  return [];
}

const objeto = (valor: unknown): Record<string, unknown> | null =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;

function conferirLimites(
  tipo: 'inteiro' | 'decimal',
  pedida: Record<string, unknown>,
  erros: Record<string, string>,
): ConfiguracaoDoCampo {
  const configuracao: ConfiguracaoDoCampo = {};
  if (tipo === 'decimal' && pedida.casas !== undefined) {
    const { casas } = pedida;
    if (typeof casas === 'number' && Number.isInteger(casas) && casas >= 0 && casas <= 6) {
      configuracao.casas = casas;
    } else {
      erros.casas = 'Use de 0 a 6 casas decimais.';
    }
  }
  for (const chave of ['minimo', 'maximo'] as const) {
    if (pedida[chave] === undefined || pedida[chave] === null) continue;
    const lido =
      tipo === 'inteiro'
        ? lerInteiro(pedida[chave], {})
        : lerDecimal(pedida[chave], { casas: configuracao.casas ?? 2 });
    if (!lido.ok) erros[chave] = lido.erro;
    else if (lido.valor !== null) configuracao[chave] = lido.valor;
  }
  const { minimo, maximo } = configuracao;
  if (minimo !== undefined && maximo !== undefined && minimo > maximo) {
    erros.minimo = 'O mínimo não pode passar do máximo.';
  }
  return configuracao;
}

function conferirOpcoes(
  pedida: unknown,
  novoId: () => string,
  erros: Record<string, string>,
): ConfiguracaoDoCampo {
  const opcoes = Array.isArray(pedida) ? pedida : [];
  if (opcoes.length === 0) {
    erros.opcoes = 'Inclua pelo menos uma opção.';
    return {};
  }
  if (opcoes.length > MAXIMO_DE_OPCOES) {
    erros.opcoes = `Use até ${MAXIMO_DE_OPCOES} opções.`;
    return {};
  }
  const vistos = new Set<string>();
  const conferidas: OpcaoDaLista[] = [];
  opcoes.forEach((item, indice) => {
    const opcao = objeto(item) ?? {};
    const rotulo = lerTexto(opcao.rotulo, 60);
    if (!rotulo.ok) erros[`opcoes.${indice}`] = rotulo.erro;
    else if (rotulo.valor === null) erros[`opcoes.${indice}`] = 'Informe o rótulo da opção.';
    else if (vistos.has(normalizarTexto(rotulo.valor))) {
      erros[`opcoes.${indice}`] = 'Já existe uma opção com este rótulo.';
    } else {
      vistos.add(normalizarTexto(rotulo.valor));
      const situacao = SITUACOES_DA_OPCAO.find((s) => s === opcao.situacao) ?? 'ativa';
      const id = typeof opcao.id === 'string' && opcao.id !== '' ? opcao.id : novoId();
      conferidas.push({ id, rotulo: rotulo.valor, situacao });
    }
  });
  return { opcoes: conferidas };
}

/** O campo de ativo: os tipos aceitos, sem repetir e até 20, e o nome do lado de lá. */
function conferirReferenciaDeAtivo(
  pedida: Record<string, unknown>,
  erros: Record<string, string>,
): ConfiguracaoDoCampo {
  const configuracao: ConfiguracaoDoCampo = {};
  if (pedida.tipos !== undefined && pedida.tipos !== null) {
    const tipos = Array.isArray(pedida.tipos) ? pedida.tipos : [null];
    if (tipos.some((tipo) => typeof tipo !== 'string' || !UUID.test(tipo))) {
      erros.tipos = 'Escolha os tipos da lista.';
    } else {
      const unicos = [...new Set(tipos.map((tipo) => String(tipo).toLowerCase()))];
      if (unicos.length > MAXIMO_DE_TIPOS_ACEITOS) {
        erros.tipos = `Escolha até ${MAXIMO_DE_TIPOS_ACEITOS} tipos.`;
      } else if (unicos.length > 0) configuracao.tipos = unicos;
    }
  }
  const ladoDeLa = lerTexto(pedida.ladoDeLa, 60);
  if (!ladoDeLa.ok) erros.ladoDeLa = ladoDeLa.erro;
  else if (ladoDeLa.valor !== null) configuracao.ladoDeLa = ladoDeLa.valor;
  return configuracao;
}

/**
 * Confere a configuração pedida para o tipo de campo. As opções novas, sem id, ganham um de
 * `novoId`. Os erros vêm por chave, como `minimo` ou `opcoes.2`, para a tela mostrá-los no lugar.
 */
export function conferirConfiguracao(
  tipo: TipoDeCampo,
  pedida: unknown,
  novoId: () => string,
): ConferenciaDaConfiguracao {
  const configuracao = objeto(pedida ?? {});
  const aceitas = chavesDoTipo(tipo);
  if (!configuracao || Object.keys(configuracao).some((chave) => !aceitas.includes(chave))) {
    return {
      ok: false,
      erros: { configuracao: 'Esta configuração não serve para o tipo do campo.' },
    };
  }
  const erros: Record<string, string> = {};
  let conferida: ConfiguracaoDoCampo = {};
  if (tipo === 'inteiro' || tipo === 'decimal')
    conferida = conferirLimites(tipo, configuracao, erros);
  if (tipo === 'lista' || tipo === 'lista-multipla') {
    conferida = conferirOpcoes(configuracao.opcoes, novoId, erros);
  }
  if (tipo === 'ativo') conferida = conferirReferenciaDeAtivo(configuracao, erros);
  return Object.keys(erros).length > 0
    ? { ok: false, erros }
    : { ok: true, configuracao: conferida };
}

/** As opções que existiam e sumiram da configuração nova: elas só podem ser inativadas. */
export function opcoesExcluidas(
  antes: readonly OpcaoDaLista[],
  depois: readonly Readonly<Record<string, unknown>>[],
): OpcaoDaLista[] {
  const ficam = new Set(depois.map((opcao) => opcao.id));
  return antes.filter((opcao) => !ficam.has(opcao.id));
}
