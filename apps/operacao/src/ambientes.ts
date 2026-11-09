// A configuração de cada ambiente (design do F2d, decisões 2, 3, 9 e 11): o config.env da produção e
// o do teste, o do coletor e o do proxy, com as senhas geradas no servidor. As senhas ficam só
// nesses arquivos, que só os administradores e a conta dos serviços leem. Cada instância do
// PostgreSQL tem as próprias senhas, então nada do teste abre a produção. O teste usa a mesma chave
// dos dois passos e a mesma chave do cofre da produção: os dados dele são uma cópia da produção, as
// contas entram nele com o app autenticador de sempre, e os segredos copiados abrem nele. As chaves
// do push ficam só na produção (change p3c-email-e-push, design, decisão 10): o teste, com a cópia
// das contas, não avisa pessoas de verdade. No Linux (change servidor-linux-com-docker, design,
// decisões 3, 4, 5, 10 e 11), os apps, os bancos e o coletor se acham pelo nome do serviço na rede
// interna, o proxy é confiável pelo IP fixo, as pastas são as de /opt/grafite, montadas no mesmo
// caminho, e os contêineres seguem o fuso do servidor.
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { prepararFilaDoColetor } from './coletor.ts';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import type { AmbienteInstalado } from './estado.ts';
import {
  enderecosDoAmbiente,
  type PastasDaInstalacao,
  type Plataforma,
  PORTAS,
  pastasDaInstalacao,
  pastasDaInstalacaoNoLinux,
  REDE_NO_LINUX,
  SERVICOS_NO_LINUX,
} from './layout.ts';
import type { RespostasDaInstalacao } from './respostas.ts';
import { restringirAcesso } from './windows/acl.ts';

/** O par das chaves VAPID do push, em base64url: a pública não comprimida e a privada. */
export interface ChavesDoPush {
  publica: string;
  privada: string;
}

export interface Segredos {
  /** O superusuário da produção só existe no Linux, onde a instalação cria a instância dela. */
  producao: { dono: string; app: string; backup: string; superusuario?: string };
  /** O superusuário é o da instância do teste, onde o teste de restauração e a cópia restauram. */
  teste: { dono: string; app: string; superusuario: string };
  /** A chave AES-256, em base64, que cifra as chaves dos apps autenticadores. */
  chaveDoisPassos: string;
  /** A chave mestra do cofre, AES-256 em base64, que cifra a chave de cada segredo (P6). */
  chaveDoCofre: string;
  tokenDoColetor: string;
  /** Só no modo público: o token da Cloudflare, com permissão de editar o DNS só da zona. */
  tokenDaCloudflare?: string;
  /** As chaves do push da produção, geradas uma vez e nunca trocadas. */
  push: ChavesDoPush;
}

export interface SegredosDeAntes {
  producao: Partial<Segredos['producao']>;
  teste: Partial<Segredos['teste']>;
  chaveDoisPassos?: string;
  chaveDoCofre?: string;
  tokenDoColetor?: string;
  tokenDaCloudflare?: string;
  push?: ChavesDoPush;
}

/** O contato do servidor para os serviços de push: o endereço da organização que opera o servidor. */
const contatoDoPush = (operadora: string) => `https://${operadora || 'localhost'}`;

/** A conexão de um papel com o banco do Grafite do ambiente, na instância dele. */
export function urlDoBanco(
  papel: string,
  senha: string,
  ambiente: AmbienteInstalado,
  plataforma: Plataforma = 'windows',
): string {
  const { host, porta, nome } = enderecosDoAmbiente(plataforma, ambiente).banco;
  return `postgres://${papel}:${encodeURIComponent(senha)}@${host}:${porta}/${nome}`;
}

const plataformaDas = (respostas: RespostasDaInstalacao): Plataforma =>
  respostas.plataforma ?? 'windows';

/** As pastas que a configuração cita, do layout da plataforma. */
function pastasDas(respostas: RespostasDaInstalacao) {
  return plataformaDas(respostas) === 'linux'
    ? pastasDaInstalacaoNoLinux(respostas.raiz)
    : pastasDaInstalacao(respostas.raiz);
}

/** O fuso do servidor, que os contêineres do Linux seguem; o Windows usa o do sistema. */
function fusoDas(respostas: RespostasDaInstalacao): Record<string, string> {
  return plataformaDas(respostas) === 'linux' && respostas.fuso ? { TZ: respostas.fuso } : {};
}

/**
 * No modo interno com a AC do Caddy, os apps confiam na raiz dela: no Windows, a do Caddy; no Linux,
 * a cópia pública, que o usuário dos contêineres lê.
 */
function raizExtra(respostas: RespostasDaInstalacao): Record<string, string> {
  const { certificado } = respostas;
  if (certificado.modo !== 'interno' || certificado.ac !== 'caddy') return {};
  return {
    NODE_EXTRA_CA_CERTS:
      plataformaDas(respostas) === 'linux'
        ? pastasDaInstalacaoNoLinux(respostas.raiz).raizDaAcPublica
        : pastasDaInstalacao(respostas.raiz).raizDaAcDoCaddy,
  };
}

/**
 * O que os dois apps têm em comum: atrás do proxy, que é o único confiável. No Windows, só em
 * 127.0.0.1, com a web da versão em uso; no Linux, em todas as interfaces do contêiner, que não
 * publica porta nenhuma, com a web da imagem.
 */
function variaveisDoApp(
  ambiente: AmbienteInstalado,
  respostas: RespostasDaInstalacao,
  senhas: { dono: string; app: string },
  { chaveDoisPassos, chaveDoCofre }: Pick<Segredos, 'chaveDoisPassos' | 'chaveDoCofre'>,
): Record<string, string> {
  const plataforma = plataformaDas(respostas);
  const noLinux = plataforma === 'linux';
  return {
    GRAFITE_AMBIENTE: ambiente,
    NODE_ENV: 'production',
    GRAFITE_API_HOST: noLinux ? '0.0.0.0' : '127.0.0.1',
    GRAFITE_API_PORTA: String(PORTAS[ambiente]),
    GRAFITE_DATABASE_URL: urlDoBanco('grafite_app', senhas.app, ambiente, plataforma),
    GRAFITE_DATABASE_URL_MIGRACOES: urlDoBanco('grafite_owner', senhas.dono, ambiente, plataforma),
    GRAFITE_WEB_PASTA: noLinux
      ? '/app/web'
      : join(pastasDaInstalacao(respostas.raiz)[ambiente].atual, 'web'),
    GRAFITE_ARQUIVOS_PASTA: pastasDas(respostas)[ambiente].arquivos,
    GRAFITE_CHAVE_DOIS_PASSOS: chaveDoisPassos,
    GRAFITE_CHAVE_DO_COFRE: chaveDoCofre,
    GRAFITE_PROXIES_CONFIAVEIS: noLinux ? REDE_NO_LINUX.proxy : '127.0.0.1,::1',
    ...fusoDas(respostas),
  };
}

export function variaveisDaProducao(
  respostas: RespostasDaInstalacao,
  segredos: Segredos,
): Record<string, string> {
  const [operadora = ''] = respostas.enderecos;
  const plataforma = plataformaDas(respostas);
  const bancoDoTeste = enderecosDoAmbiente(plataforma, 'teste').banco;
  return {
    ...variaveisDoApp('producao', respostas, segredos.producao, segredos),
    GRAFITE_ORGANIZACAO_OPERADORA: operadora,
    GRAFITE_BACKUP_DESTINOS: respostas.backup.destinos.join(';'),
    GRAFITE_BACKUP_RETENCAO: '7,4,12',
    GRAFITE_BACKUP_JANELA: respostas.backup.janela,
    GRAFITE_BACKUP_TESTE: 'semanal',
    GRAFITE_BACKUP_URL: urlDoBanco(
      'grafite_backup',
      segredos.producao.backup,
      'producao',
      plataforma,
    ),
    GRAFITE_RESTAURACAO_URL: `postgres://postgres:${encodeURIComponent(segredos.teste.superusuario)}@${bancoDoTeste.host}:${bancoDoTeste.porta}/postgres`,
    GRAFITE_PG_BIN: respostas.pgBin,
    // No Linux, o destino é uma pasta do servidor, como um compartilhamento montado: sem a marca da
    // instalação, ele pode ser o ponto de montagem vazio, e o backup iria para o disco do servidor.
    ...(plataforma === 'linux'
      ? {
          GRAFITE_BACKUP_EXIGIR_MARCA: 'sim',
          // A pasta do PostgreSQL do teste só existe no contêiner dele: o disco é o da pasta do
          // servidor, que o app da produção monta só para ler.
          GRAFITE_RESTAURACAO_PASTA: pastasDaInstalacaoNoLinux(respostas.raiz).teste.banco,
        }
      : {}),
    GRAFITE_CERTIFICADO_VIGIAR: operadora,
    GRAFITE_PUSH_CHAVE_PUBLICA: segredos.push.publica,
    GRAFITE_PUSH_CHAVE_PRIVADA: segredos.push.privada,
    GRAFITE_PUSH_CONTATO: contatoDoPush(operadora),
    ...raizExtra(respostas),
  };
}

export function variaveisDoTeste(
  respostas: RespostasDaInstalacao,
  segredos: Segredos,
): Record<string, string> {
  return {
    ...variaveisDoApp('teste', respostas, segredos.teste, segredos),
    ...raizExtra(respostas),
  };
}

/**
 * O coletor fala com a API da produção, com o endereço da organização que opera o servidor no
 * cabeçalho Host, e guarda a fila em disco na pasta da produção (design do P2a): no Windows, pelo
 * 127.0.0.1; no Linux, pelo nome do serviço do app na rede interna.
 */
export function variaveisDoColetor(
  respostas: RespostasDaInstalacao,
  segredos: Segredos,
): Record<string, string> {
  const [operadora = ''] = respostas.enderecos;
  const noLinux = plataformaDas(respostas) === 'linux';
  const app = noLinux ? SERVICOS_NO_LINUX.producao : '127.0.0.1';
  return {
    NODE_ENV: 'production',
    GRAFITE_COLETOR_API_URL: `http://${app}:${PORTAS.producao}`,
    GRAFITE_COLETOR_ENDERECO: operadora,
    GRAFITE_COLETOR_TOKEN: segredos.tokenDoColetor,
    GRAFITE_COLETOR_PASTA: pastasDas(respostas).filaDoColetor,
    GRAFITE_COLETOR_HOST: noLinux ? '0.0.0.0' : '127.0.0.1',
    GRAFITE_COLETOR_PORTA: String(PORTAS.coletor),
    ...fusoDas(respostas),
  };
}

/** O ambiente do Caddy: as pastas dos dados e, no modo público, o token do DNS. */
export function variaveisDoProxy(
  respostas: RespostasDaInstalacao,
  segredos: Segredos,
): Record<string, string> {
  const { caddy } = pastasDas(respostas);
  const juntar = plataformaDas(respostas) === 'linux' ? posix.join : join;
  const variaveis: Record<string, string> = {
    XDG_DATA_HOME: juntar(caddy, 'dados'),
    XDG_CONFIG_HOME: juntar(caddy, 'config'),
  };
  if (respostas.certificado.modo === 'publico') {
    if (segredos.tokenDaCloudflare === undefined) {
      throw new Error('O modo público precisa do token da Cloudflare.');
    }
    variaveis.CLOUDFLARE_API_TOKEN = segredos.tokenDaCloudflare;
  }
  return variaveis;
}

/** Completa os segredos de antes com os que faltam, gerados; os de antes nunca são trocados. */
export function completarSegredos(
  antes: Partial<SegredosDeAntes>,
  {
    gerarSenha,
    gerarChave,
    gerarChavesDoPush,
  }: { gerarSenha: () => string; gerarChave: () => string; gerarChavesDoPush: () => ChavesDoPush },
  { superusuarioDaProducao = false }: { superusuarioDaProducao?: boolean } = {},
): Segredos {
  const producao = antes.producao ?? {};
  const teste = antes.teste ?? {};
  const segredos: Segredos = {
    producao: {
      dono: producao.dono ?? gerarSenha(),
      app: producao.app ?? gerarSenha(),
      backup: producao.backup ?? gerarSenha(),
    },
    teste: {
      dono: teste.dono ?? gerarSenha(),
      app: teste.app ?? gerarSenha(),
      superusuario: teste.superusuario ?? gerarSenha(),
    },
    chaveDoisPassos: antes.chaveDoisPassos ?? gerarChave(),
    chaveDoCofre: antes.chaveDoCofre ?? gerarChave(),
    tokenDoColetor: antes.tokenDoColetor ?? gerarSenha(),
    push: antes.push ?? gerarChavesDoPush(),
  };
  if (antes.tokenDaCloudflare !== undefined) segredos.tokenDaCloudflare = antes.tokenDaCloudflare;
  if (superusuarioDaProducao) {
    segredos.producao.superusuario = producao.superusuario ?? gerarSenha();
  }
  return segredos;
}

const senhaDe = (url: string | undefined) => {
  if (url === undefined) return undefined;
  try {
    return decodeURIComponent(new URL(url).password) || undefined;
  } catch {
    return undefined;
  }
};

/** Sem as chaves sem valor, para os segredos que faltam ficarem de fora. */
function definidos<T extends object>(objeto: T): T {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as T;
}

/** Os segredos dos arquivos de uma instalação interrompida; os que faltam ficam de fora. */
export async function lerSegredos(pastas: {
  producao: { configEnv: string };
  teste: { configEnv: string };
  coletorEnv: string;
  caddyEnv: string;
}): Promise<SegredosDeAntes> {
  const ler = (caminho: string) =>
    lerConfigEnv(caminho).catch(() => ({}) as Record<string, string>);
  const producao = await ler(pastas.producao.configEnv);
  const teste = await ler(pastas.teste.configEnv);
  const coletor = await ler(pastas.coletorEnv);
  const proxy = await ler(pastas.caddyEnv);
  return definidos({
    producao: definidos({
      dono: senhaDe(producao.GRAFITE_DATABASE_URL_MIGRACOES),
      app: senhaDe(producao.GRAFITE_DATABASE_URL),
      backup: senhaDe(producao.GRAFITE_BACKUP_URL),
    }),
    teste: definidos({
      dono: senhaDe(teste.GRAFITE_DATABASE_URL_MIGRACOES),
      app: senhaDe(teste.GRAFITE_DATABASE_URL),
      superusuario: senhaDe(producao.GRAFITE_RESTAURACAO_URL),
    }),
    chaveDoisPassos: producao.GRAFITE_CHAVE_DOIS_PASSOS ?? teste.GRAFITE_CHAVE_DOIS_PASSOS,
    chaveDoCofre: producao.GRAFITE_CHAVE_DO_COFRE ?? teste.GRAFITE_CHAVE_DO_COFRE,
    tokenDoColetor: coletor.GRAFITE_COLETOR_TOKEN,
    tokenDaCloudflare: proxy.CLOUDFLARE_API_TOKEN,
    push:
      producao.GRAFITE_PUSH_CHAVE_PUBLICA && producao.GRAFITE_PUSH_CHAVE_PRIVADA
        ? {
            publica: producao.GRAFITE_PUSH_CHAVE_PUBLICA,
            privada: producao.GRAFITE_PUSH_CHAVE_PRIVADA,
          }
        : undefined,
  });
}

/**
 * A chave do cofre nos dois config.env de uma instalação de antes do cofre (design do P6, decisão
 * 10): a da produção, se houver, a do teste, ou uma gerada, gravada no que não a tem, com o acesso
 * restrito. Diz se gravou alguma: com as duas no lugar, nada muda.
 */
export async function completarChaveDoCofre({
  executar,
  pastas,
  gerarChave,
}: {
  executar: ExecutarProcesso;
  pastas: Pick<PastasDaInstalacao, 'producao' | 'teste'>;
  gerarChave: () => string;
}): Promise<boolean> {
  const configs = [pastas.producao.configEnv, pastas.teste.configEnv];
  const atuais = await Promise.all(configs.map((caminho) => lerConfigEnv(caminho)));
  const faltam = configs.filter((_, indice) => !atuais[indice]?.GRAFITE_CHAVE_DO_COFRE);
  if (faltam.length === 0) return false;
  const chave =
    atuais.map((variaveis) => variaveis.GRAFITE_CHAVE_DO_COFRE).find(Boolean) ?? gerarChave();
  for (const [indice, caminho] of configs.entries()) {
    if (!faltam.includes(caminho)) continue;
    await writeFile(caminho, gerarConfigEnv({ ...atuais[indice], GRAFITE_CHAVE_DO_COFRE: chave }));
    await restringirAcesso(executar, caminho);
  }
  return true;
}

/**
 * As chaves do push na configuração de uma produção de antes do push (change p3c-email-e-push,
 * design, decisão 10): geradas uma vez, com o contato na organização que opera o servidor, e
 * gravadas com o acesso restrito. Diz se gravou: a produção que já tem as chaves fica com elas, e
 * o teste nunca as recebe.
 */
export async function completarChavesDoPush({
  executar,
  pastas,
  gerarChavesDoPush,
}: {
  executar: ExecutarProcesso;
  pastas: Pick<PastasDaInstalacao, 'producao'>;
  gerarChavesDoPush: () => ChavesDoPush;
}): Promise<boolean> {
  const caminho = pastas.producao.configEnv;
  const atuais = await lerConfigEnv(caminho);
  if (atuais.GRAFITE_PUSH_CHAVE_PUBLICA && atuais.GRAFITE_PUSH_CHAVE_PRIVADA) return false;
  const { publica, privada } = gerarChavesDoPush();
  await writeFile(
    caminho,
    gerarConfigEnv({
      ...atuais,
      GRAFITE_PUSH_CHAVE_PUBLICA: publica,
      GRAFITE_PUSH_CHAVE_PRIVADA: privada,
      GRAFITE_PUSH_CONTATO: contatoDoPush(atuais.GRAFITE_ORGANIZACAO_OPERADORA ?? ''),
    }),
  );
  await restringirAcesso(executar, caminho);
  return true;
}

/** Grava cada arquivo de configuração e deixa o acesso só aos administradores e ao sistema. */
export async function gravarConfiguracoes({
  pastas,
  respostas,
  segredos,
  executar,
}: {
  pastas: PastasDaInstalacao;
  respostas: RespostasDaInstalacao;
  segredos: Segredos;
  executar: ExecutarProcesso;
}): Promise<void> {
  const gravar = async (caminho: string, variaveis: Record<string, string>) => {
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, gerarConfigEnv(variaveis));
    await restringirAcesso(executar, caminho);
  };
  await gravar(pastas.producao.configEnv, variaveisDaProducao(respostas, segredos));
  await gravar(pastas.teste.configEnv, variaveisDoTeste(respostas, segredos));
  await gravar(pastas.coletorEnv, variaveisDoColetor(respostas, segredos));
  await prepararFilaDoColetor(executar, pastas);
  await gravar(pastas.caddyEnv, variaveisDoProxy(respostas, segredos));
}

/** Um par novo das chaves do push, da curva P-256, em base64url, como o navegador as usa. */
export function gerarChavesDoPush(): ChavesDoPush {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { d = '', x = '', y = '' } = privateKey.export({ format: 'jwk' });
  const publica = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(x, 'base64url'),
    Buffer.from(y, 'base64url'),
  ]).toString('base64url');
  return { publica, privada: d };
}
