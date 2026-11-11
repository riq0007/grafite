// A exibição do painel (spec painel-de-dashboards, "Exibição do painel"; change
// diagnostico-dos-paineis, design, decisão 1): se o navegador consegue mostrar o painel dentro do
// Grafite, lido da resposta que a verificação já recebe, sem rede. É uma leitura, e não uma prova:
// a ferramenta pode responder ao servidor de um jeito e ao navegador de outro.

export const EXIBICOES_DO_PAINEL = ['aparece', 'recusa', 'pede-entrada'] as const;

export type ExibicaoDoPainel = (typeof EXIBICOES_DO_PAINEL)[number];

/** A exibição em texto e no tom do rótulo. "Aparece na grade" não é anunciada como conferida. */
export const EXIBICOES_DO_PAINEL_NA_TELA = {
  aparece: { texto: 'Aparece na grade', tom: 'neutra' },
  recusa: { texto: 'Recusa ser embutido', tom: 'atencao' },
  'pede-entrada': { texto: 'Pede a entrada', tom: 'atencao' },
} as const satisfies Record<ExibicaoDoPainel, { texto: string; tom: string }>;

/** O que a verificação leu da resposta do painel no ar. */
export interface RespostaComCabecalhos {
  status: number;
  /** O `X-Frame-Options`, como veio; repetido, os valores vêm separados por vírgula. */
  xFrameOptions: string | null;
  /** O `Content-Security-Policy`, como veio; as políticas vêm separadas por vírgula. */
  contentSecurityPolicy: string | null;
  /** O endereço da resposta, depois dos redirecionamentos. */
  enderecoFinal: string;
}

const SEM_O_GRAFITE = 'A ferramenta manda frame-ancestors sem o endereço do Grafite.';

/** Os trechos do caminho que dizem que o redirecionamento terminou numa página de entrada. */
const TRECHOS_DA_ENTRADA = new Set(['login', 'signin', 'sign-in', 'auth', 'sso', 'entrar']);

/** Os valores do `X-Frame-Options` que o navegador conhece; dois diferentes, com um destes, barram. */
const VALORES_CONHECIDOS = new Set(['deny', 'sameorigin', 'allowall']);

/** A fonte com host: o esquema, o host, com o curinga de subdomínio, a porta e o caminho. */
const FONTE_COM_HOST =
  /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+)(?::(?:\d+|\*))?(?:\/.*)?$/;

/** O endereço lido, sem o trecho depois do "#", que a resposta não traz, ou `null`. */
function ler(endereco: string): URL | null {
  try {
    const lido = new URL(endereco);
    lido.hash = '';
    return lido;
  } catch {
    return null;
  }
}

/**
 * As fontes de cada política que traz a diretiva `frame-ancestors`, em minúsculas. As políticas vêm
 * separadas por vírgula, e as diretivas, por ponto e vírgula; repetida na mesma política, vale a
 * primeira, como no navegador.
 */
function fontesDoFrameAncestors(cabecalho: string): string[][] {
  const politicas: string[][] = [];
  for (const politica of cabecalho.split(',')) {
    for (const diretiva of politica.split(';')) {
      const [nome, ...fontes] = diretiva.trim().toLowerCase().split(/\s+/);
      if (nome !== 'frame-ancestors') continue;
      politicas.push(fontes);
      break;
    }
  }
  return politicas;
}

/**
 * A fonte libera o Grafite? O endereço de acesso guarda só o host: o esquema da fonte só tem de ser
 * da web, e a porta e o caminho dela não são comparados.
 */
function fonteLibera(fonte: string, hosts: readonly string[], mesmaOrigem: boolean): boolean {
  if (fonte === '*' || fonte === 'http:' || fonte === 'https:') return true;
  if (fonte === "'self'") return mesmaOrigem;
  const lida = FONTE_COM_HOST.exec(fonte);
  if (!lida) return false;
  const [, esquema, curinga, host = ''] = lida;
  if (esquema !== undefined && esquema !== 'http' && esquema !== 'https') return false;
  // O curinga pede um subdomínio: "*.empresa.local" não casa com "empresa.local".
  if (curinga) return hosts.some((um) => um.endsWith(`.${host}`));
  return hosts.includes(host);
}

/** O `X-Frame-Options` que barra, em maiúsculas, como vai no motivo, ou `null`. */
function xFrameOptionsQueBarra(cabecalho: string, mesmaOrigem: boolean): string | null {
  const valores = [
    ...new Set(
      cabecalho
        .split(',')
        .map((valor) => valor.trim().toLowerCase())
        .filter((valor) => valor !== ''),
    ),
  ];
  if (valores.length > 1) {
    return valores.some((valor) => VALORES_CONHECIDOS.has(valor))
      ? valores.join(', ').toUpperCase()
      : null;
  }
  const [valor] = valores;
  if (valor === 'deny') return 'DENY';
  return valor === 'sameorigin' && !mesmaOrigem ? 'SAMEORIGIN' : null;
}

/** O motivo da recusa, pelos cabeçalhos, ou `null`. Com o `frame-ancestors`, só ele conta. */
function motivoDaRecusa(
  resposta: RespostaComCabecalhos,
  enderecosDeAcesso: readonly string[],
): string | null {
  const hosts = enderecosDeAcesso.map((endereco) => endereco.toLowerCase());
  // A ferramenta atrás do endereço do Grafite tem a mesma origem dele.
  const hostDaResposta = ler(resposta.enderecoFinal)?.hostname.replace(/^\[|\]$/g, '') ?? '';
  const mesmaOrigem = hosts.includes(hostDaResposta);
  const politicas = fontesDoFrameAncestors(resposta.contentSecurityPolicy ?? '');
  if (politicas.length > 0) {
    const liberam = politicas.every((fontes) =>
      fontes.some((fonte) => fonteLibera(fonte, hosts, mesmaOrigem)),
    );
    return liberam ? null : SEM_O_GRAFITE;
  }
  const valor = xFrameOptionsQueBarra(resposta.xFrameOptions ?? '', mesmaOrigem);
  return valor ? `A ferramenta manda X-Frame-Options: ${valor}.` : null;
}

/** O motivo da entrada: o código da resposta, ou o redirecionamento para a página de entrada. */
function motivoDaEntrada(resposta: RespostaComCabecalhos, endereco: string): string | null {
  if (resposta.status === 401 || resposta.status === 403) return `Respondeu ${resposta.status}.`;
  const final = ler(resposta.enderecoFinal);
  // O endereço cadastrado que já é o da entrada foi escolhido por quem o cadastrou.
  if (!final || final.href === ler(endereco)?.href) return null;
  const trechos = final.pathname.toLowerCase().split('/');
  return trechos.some((trecho) => TRECHOS_DA_ENTRADA.has(trecho))
    ? 'Levou à página de entrada.'
    : null;
}

/**
 * A exibição do painel no ar, pela resposta: a recusa de ser embutido vence a entrada, porque sem a
 * liberação a tela de entrada também não apareceria. No painel em `http://`, que o Grafite mostra
 * pela ponte, os cabeçalhos que barram não contam.
 */
export function exibicaoDaResposta(
  resposta: RespostaComCabecalhos,
  { endereco, enderecosDeAcesso }: { endereco: string; enderecosDeAcesso: readonly string[] },
): { exibicao: ExibicaoDoPainel; motivo: string | null } {
  const pelaPonte = !endereco.toLowerCase().startsWith('https:');
  const recusa = pelaPonte ? null : motivoDaRecusa(resposta, enderecosDeAcesso);
  if (recusa) return { exibicao: 'recusa', motivo: recusa };
  const entrada = motivoDaEntrada(resposta, endereco);
  if (entrada) return { exibicao: 'pede-entrada', motivo: entrada };
  return { exibicao: 'aparece', motivo: null };
}
