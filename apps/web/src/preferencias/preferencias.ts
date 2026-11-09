// Preferências de interface do usuário, agrupadas como as seções dos Ajustes. O modelo, os padrões de
// fábrica e a validação campo a campo vêm do domínio, iguais na API (design do F2c, decisão 1); aqui
// fica o que é só da web: a leitura da cópia do navegador e os atributos que a aplicam ao <html>.
import { type PreferenciasDaInterface, resolverPreferencias } from '@grafite/domain';
import {
  type DestaqueGerado,
  destaqueDeFabrica,
  destaquePersonalizado,
  type Tema,
  temaPersonalizado,
  temas,
  variaveisDeCor,
  variaveisDoDestaque,
} from '@grafite/ui';

export {
  PADRAO_DE_FABRICA,
  type PreferenciasDaInterface,
  type SecaoDePreferencias,
  TEMPOS_DO_AVISO,
  type TempoDoAviso,
} from '@grafite/domain';

type Bruto = Record<string, unknown>;

const objeto = (valor: unknown): Bruto =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Bruto) : {};

/** `null` quando não há nada salvo; texto que não é JSON conta como salvo, mas vazio. */
function lerJson(texto: string | null): Bruto | null {
  if (texto === null) return null;
  try {
    return objeto(JSON.parse(texto));
  } catch {
    return {};
  }
}

/**
 * Lê as preferências salvas. Cada campo é validado sozinho: o inválido volta ao padrão sem
 * descartar os demais. Sem a chave nova, aproveita a aparência que o F0 salvou (`textoDoF0`,
 * num objeto plano com tema, destaque, densidade, raio, movimento e transparência).
 */
export function lerPreferencias(
  texto: string | null,
  textoDoF0: string | null = null,
): PreferenciasDaInterface {
  const salvo = lerJson(texto);
  const doF0 = salvo === null ? (lerJson(textoDoF0) ?? {}) : {};
  return resolverPreferencias({
    ...salvo,
    aparencia: { ...doF0, ...objeto(salvo?.aparencia) },
    acessibilidade: { ...doF0, ...objeto(salvo?.acessibilidade) },
  });
}

/** O tema de fábrica que fica por baixo do personalizado, pelo tom: o color-scheme e o resto. */
export const TEMA_DE_BAIXO = { escuro: 'grafite', claro: 'nevoa' } as const;

/** As variáveis de cor e de sombra que o anti-flash aceita, além da lista fixa. */
export const VARIAVEL_DE_COR = /^--(cor|sombra)-[a-z0-9-]+$/;

/**
 * O tema e o destaque que valem, de fábrica ou personalizados, gerados como os do tokens.css: para as
 * variáveis do <html> e para a leitura do contraste dos Ajustes.
 */
export function temaEDestaque(aparencia: PreferenciasDaInterface['aparencia']): {
  tema: Tema;
  destaque: DestaqueGerado;
} {
  const tema =
    aparencia.tema === 'personalizado'
      ? temaPersonalizado(aparencia.personalizado)
      : temas[aparencia.tema];
  const destaque =
    aparencia.destaque === 'personalizado'
      ? destaquePersonalizado(tema, aparencia.destaquePersonalizado)
      : destaqueDeFabrica(tema, aparencia.destaque);
  return { tema, destaque };
}

/**
 * As variáveis do tema e do destaque personalizados (change tema-personalizado, design, decisão 3):
 * as do tema inteiro, com o destaque que vale, ou só as do destaque, sobre um tema de fábrica. Com
 * o tema e o destaque de fábrica, nenhuma: o tokens.css já os tem.
 */
function coresPersonalizadas(
  aparencia: PreferenciasDaInterface['aparencia'],
): Record<string, string> {
  if (aparencia.tema !== 'personalizado' && aparencia.destaque !== 'personalizado') return {};
  const { tema, destaque } = temaEDestaque(aparencia);
  return aparencia.tema === 'personalizado'
    ? variaveisDeCor(tema, destaque)
    : variaveisDoDestaque(destaque);
}

/** Atributos e variáveis do <html> que aplicam as preferências (lidos também pelo anti-flash). */
export function atributosDaInterface(p: PreferenciasDaInterface): Record<string, string> {
  const { tema, destaque, personalizado } = p.aparencia;
  return {
    'data-theme': tema === 'personalizado' ? TEMA_DE_BAIXO[personalizado.tom] : tema,
    'data-accent': destaque === 'personalizado' ? 'grafite' : destaque,
    'data-density': p.aparencia.densidade,
    '--raio-base': `${p.aparencia.raio}px`,
    'data-dock': p.dock.posicao,
    '--tamanho-item-dock': `${p.dock.tamanho}px`,
    ...(p.dock.ocultar ? { 'data-dock-ocultar': 'sim' } : {}),
    ...(p.acessibilidade.movimento === 'reduzido' ? { 'data-motion': 'reduzido' } : {}),
    ...(p.acessibilidade.transparencia === 'reduzida' ? { 'data-transparency': 'reduzida' } : {}),
    ...coresPersonalizadas(p.aparencia),
  };
}

/** Nomes que o script anti-flash aceita (index.html); os demais são ignorados. */
export const ATRIBUTOS_PERMITIDOS = [
  'data-theme',
  'data-accent',
  'data-density',
  'data-motion',
  'data-transparency',
  '--raio-base',
  'data-dock',
  'data-dock-ocultar',
  '--tamanho-item-dock',
] as const;
