// O diretório da organização (spec diretorio-ad; change integracao-ad-ldap): a conferência da
// configuração, os filtros com o valor escapado (RFC 4515), o DN normalizado para comparar, a
// situação da conta no AD pelo userAccountControl e os grupos do Grafite que os grupos do AD dão.

import type { TipoDeSegredo } from '../cofre/segredos.ts';

/**
 * Os logins do Cofre que servem de conta de serviço do diretório: os do Control iD e a Conta de
 * serviço, o tipo natural da conta do AD (change conta-de-servico-no-diretorio).
 */
export const TIPOS_DA_CONTA_DE_SERVICO = [
  'usuario-e-senha',
  'conta-administrativa',
  'conta-de-servico',
] as const satisfies readonly TipoDeSegredo[];

/** O atributo do usuário e o filtro das pessoas de fábrica, os do Active Directory. */
export const ATRIBUTO_DO_USUARIO_PADRAO = 'sAMAccountName';
export const FILTRO_DAS_PESSOAS_PADRAO = '(&(objectCategory=person)(objectClass=user))';

/** Quantos usuários e grupos a busca traz, e até quantos usuários o teste da conexão conta. */
export const LIMITE_DA_BUSCA_NO_DIRETORIO = 50;
export const LIMITE_DA_CONTAGEM_NO_DIRETORIO = 1000;

export const MENSAGENS_DO_DIRETORIO = {
  servidor: 'Informe o servidor como ldap://servidor ou ldaps://servidor.',
  baseDn: 'Informe a base DN, como DC=empresa,DC=local.',
  contaDeServico: 'Escolha a conta de serviço no Cofre: um login ativo, com o usuário.',
  atributo: 'Informe o atributo do usuário, como sAMAccountName.',
  filtro: 'Informe o filtro das pessoas entre parênteses, como (objectClass=user).',
  semAcesso:
    'Seu usuário do AD não tem acesso ao Grafite. Peça a liberação a quem administra os acessos.',
  foraDoAr: 'O AD não respondeu. Tente de novo ou use uma conta local.',
  senhaSoComLdaps: 'A redefinição da senha exige o ldaps://.',
  naoRespondeu: 'O servidor não respondeu.',
  contaRecusada: 'A conta de serviço foi recusada.',
  certificado: 'O certificado do servidor não é confiável.',
  naoConfigurado: 'O diretório ainda não foi configurado.',
  cofreDesligado:
    'Com o módulo Cofre desligado, a conta de serviço escolhida continua, e a escolha de outra espera o módulo ser ligado.',
  acDoServidor: 'Cole o certificado da AC em PEM, que começa com -----BEGIN CERTIFICATE-----.',
  acDoServidorLonga: 'Use até 20.000 caracteres no certificado da AC.',
} as const;

/** O certificado da AC do servidor, em caracteres: cabe uma cadeia em PEM. */
export const LIMITE_DA_AC_DO_SERVIDOR = 20_000;

export interface ConfiguracaoDoDiretorio {
  servidor: string;
  baseDn: string;
  segredoId: string;
  atributoDoUsuario: string;
  filtroDasPessoas: string;
  conferirCertificado: boolean;
  /** A AC da empresa que emite o certificado do LDAPS, em PEM, ou `null` sem ela. */
  acDoServidor: string | null;
  ligado: boolean;
}

export type CampoDoDiretorio =
  | 'servidor'
  | 'baseDn'
  | 'segredoId'
  | 'atributoDoUsuario'
  | 'filtroDasPessoas'
  | 'acDoServidor';

const SERVIDOR = /^ldaps?:\/\/[^\s/:@]+(?::(\d{1,5}))?\/?$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATRIBUTO = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

/** O filtro entre parênteses, com os parênteses equilibrados. */
function filtroValido(filtro: string): boolean {
  if (!filtro.startsWith('(') || !filtro.endsWith(')')) return false;
  let abertos = 0;
  for (let indice = 0; indice < filtro.length; indice++) {
    const letra = filtro[indice];
    if (letra === '\\') {
      indice += 2;
      continue;
    }
    if (letra === '(') abertos++;
    if (letra === ')') abertos--;
    if (abertos < 0) return false;
  }
  return abertos === 0;
}

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');

const BLOCO_DO_CERTIFICADO =
  /-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\s]+?\n-----END CERTIFICATE-----/g;

/** Os blocos `-----BEGIN CERTIFICATE-----` do texto, cada um com o fim. */
export function blocosDoCertificado(pem: string): string[] {
  return pem.match(BLOCO_DO_CERTIFICADO) ?? [];
}

/** O texto só com certificados em PEM, ao menos um, e nada além deles. */
const soCertificados = (pem: string) =>
  blocosDoCertificado(pem).length > 0 && pem.replace(BLOCO_DO_CERTIFICADO, '').trim() === '';

/**
 * Confere a configuração pedida: o servidor `ldap://` ou `ldaps://`, com a porta de 1 a 65535, a
 * base DN, a conta de serviço do Cofre, o atributo do usuário e o filtro, com os padrões do AD, e
 * o certificado da AC, opcional, em PEM, com as quebras de linha do Windows trocadas.
 */
export function conferirConfiguracaoDoDiretorio(pedido: {
  servidor?: unknown;
  baseDn?: unknown;
  segredoId?: unknown;
  atributoDoUsuario?: unknown;
  filtroDasPessoas?: unknown;
  conferirCertificado?: unknown;
  acDoServidor?: unknown;
  ligado?: unknown;
}):
  | { ok: true; configuracao: ConfiguracaoDoDiretorio }
  | { ok: false; campos: Partial<Record<CampoDoDiretorio, string>> } {
  const campos: Partial<Record<CampoDoDiretorio, string>> = {};
  const servidor = texto(pedido.servidor).replace(/\/$/, '');
  const porta = SERVIDOR.exec(servidor)?.[1];
  if (!SERVIDOR.test(servidor) || (porta && (Number(porta) < 1 || Number(porta) > 65535))) {
    campos.servidor = MENSAGENS_DO_DIRETORIO.servidor;
  }
  const baseDn = texto(pedido.baseDn);
  if (!baseDn.includes('=')) campos.baseDn = MENSAGENS_DO_DIRETORIO.baseDn;
  const segredoId = texto(pedido.segredoId);
  if (!UUID.test(segredoId)) campos.segredoId = MENSAGENS_DO_DIRETORIO.contaDeServico;
  const atributoDoUsuario = texto(pedido.atributoDoUsuario) || ATRIBUTO_DO_USUARIO_PADRAO;
  if (!ATRIBUTO.test(atributoDoUsuario)) campos.atributoDoUsuario = MENSAGENS_DO_DIRETORIO.atributo;
  const filtroDasPessoas = texto(pedido.filtroDasPessoas) || FILTRO_DAS_PESSOAS_PADRAO;
  if (!filtroValido(filtroDasPessoas)) campos.filtroDasPessoas = MENSAGENS_DO_DIRETORIO.filtro;
  const acDoServidor = texto(pedido.acDoServidor).replace(/\r\n?/g, '\n') || null;
  if (acDoServidor && acDoServidor.length > LIMITE_DA_AC_DO_SERVIDOR) {
    campos.acDoServidor = MENSAGENS_DO_DIRETORIO.acDoServidorLonga;
  } else if (acDoServidor && !soCertificados(acDoServidor)) {
    campos.acDoServidor = MENSAGENS_DO_DIRETORIO.acDoServidor;
  }
  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return {
    ok: true,
    configuracao: {
      servidor,
      baseDn,
      segredoId,
      atributoDoUsuario,
      filtroDasPessoas,
      conferirCertificado: pedido.conferirCertificado !== false,
      acDoServidor,
      ligado: pedido.ligado === true,
    },
  };
}

/** Os caracteres que o valor de um filtro LDAP escapa (RFC 4515), com o NUL. */
const ESCAPES_DO_FILTRO: Record<string, string> = {
  '\\': '\\5c',
  '*': '\\2a',
  '(': '\\28',
  ')': '\\29',
  [String.fromCharCode(0)]: '\\00',
};

/** O valor dentro de um filtro LDAP, com os caracteres especiais escapados. */
export function escaparFiltro(valor: string): string {
  return Array.from(valor, (letra) => ESCAPES_DO_FILTRO[letra] ?? letra).join('');
}

type FiltrosDaConfiguracao = Pick<
  ConfiguracaoDoDiretorio,
  'atributoDoUsuario' | 'filtroDasPessoas'
>;

/** O filtro que acha a pessoa pelo usuário, dentro do filtro das pessoas. */
export function filtroDoUsuario(configuracao: FiltrosDaConfiguracao, usuario: string): string {
  return `(&${configuracao.filtroDasPessoas}(${configuracao.atributoDoUsuario}=${escaparFiltro(usuario)}))`;
}

/** A busca dos usuários pelo usuário, pelo nome ou pelo e-mail; sem o termo, todos. */
export function filtroDaBuscaDeUsuarios(configuracao: FiltrosDaConfiguracao, termo: string) {
  const limpo = termo.trim();
  if (limpo === '') return configuracao.filtroDasPessoas;
  const valor = `*${escaparFiltro(limpo)}*`;
  return `(&${configuracao.filtroDasPessoas}(|(${configuracao.atributoDoUsuario}=${valor})(displayName=${valor})(mail=${valor})))`;
}

/** A busca dos grupos pelo nome; sem o termo, todos. */
export function filtroDaBuscaDeGrupos(termo: string): string {
  const limpo = termo.trim();
  if (limpo === '') return '(objectClass=group)';
  return `(&(objectClass=group)(cn=*${escaparFiltro(limpo)}*))`;
}

/** As partes do DN, separadas pelas vírgulas que não estão escapadas. */
const partesDoDn = (dn: string) => dn.split(/(?<!\\),/);

/** O DN para comparar: minúsculo e sem os espaços em volta das vírgulas e dos iguais. */
export function normalizarDn(dn: string): string {
  return partesDoDn(dn.trim())
    .map((parte) =>
      parte
        .split('=')
        .map((pedaco) => pedaco.trim())
        .join('='),
    )
    .join(',')
    .toLowerCase();
}

/** O nome que o DN mostra: o valor da primeira parte, sem os escapes. */
export function nomeDoDn(dn: string): string {
  const [primeira = ''] = partesDoDn(dn.trim());
  const igual = primeira.indexOf('=');
  const valor = igual === -1 ? primeira : primeira.slice(igual + 1);
  return valor.trim().replace(/\\(.)/g, '$1');
}

/** O bit do userAccountControl que desativa a conta no AD. */
export const CONTA_DESATIVADA_NO_AD = 0x2;

/** A conta do AD está ativa: sem o bit da desativação; sem o atributo, ativa. */
export function contaAtivaNoAd(userAccountControl: number | null): boolean {
  return userAccountControl === null || (userAccountControl & CONTA_DESATIVADA_NO_AD) === 0;
}

/** O userAccountControl com a conta ativada ou desativada, sem mudar os outros bits. */
export function comSituacaoNoAd(userAccountControl: number, ativa: boolean): number {
  return ativa
    ? userAccountControl & ~CONTA_DESATIVADA_NO_AD
    : userAccountControl | CONTA_DESATIVADA_NO_AD;
}

/** Os grupos do Grafite que os grupos do AD da pessoa dão, sem repetir. */
export function gruposDoGrafite(
  gruposDoAd: readonly string[],
  mapeamentos: readonly { grupoDn: string; grupoId: string }[],
): string[] {
  const daPessoa = new Set(gruposDoAd.map(normalizarDn));
  return [
    ...new Set(
      mapeamentos
        .filter((mapeamento) => daPessoa.has(normalizarDn(mapeamento.grupoDn)))
        .map((mapeamento) => mapeamento.grupoId),
    ),
  ];
}

/**
 * O que muda na participação da conta: entra nos grupos devidos em que não está e sai dos que são
 * alvo de algum mapeamento e o AD não dá mais. Os outros grupos ficam como estão.
 */
export function sincronizacaoDosGrupos({
  alvos,
  devidos,
  atuais,
}: {
  alvos: readonly string[];
  devidos: readonly string[];
  atuais: readonly string[];
}): { incluir: string[]; encerrar: string[] } {
  const devidosAgora = new Set(devidos);
  const atuaisAgora = new Set(atuais);
  return {
    incluir: devidos.filter((grupoId) => !atuaisAgora.has(grupoId)),
    encerrar: atuais.filter((grupoId) => alvos.includes(grupoId) && !devidosAgora.has(grupoId)),
  };
}

const NUMERO = new Intl.NumberFormat('pt-BR');

/** O resultado do teste da conexão: quantos usuários a base tem, até o limite da contagem. */
export function textoDaContagem(quantos: number): string {
  if (quantos > LIMITE_DA_CONTAGEM_NO_DIRETORIO) {
    return `Conectado: mais de ${NUMERO.format(LIMITE_DA_CONTAGEM_NO_DIRETORIO)} usuários na base.`;
  }
  return `Conectado: ${NUMERO.format(quantos)} ${quantos === 1 ? 'usuário' : 'usuários'} na base.`;
}
