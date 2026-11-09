// O proxy HTTPS (spec https-interno; design do F2d, decisão 9): o Caddy na frente dos apps, com um
// site por endereço de acesso, o reverse_proxy para a porta do ambiente (que leva o endereço pedido,
// do qual a API tira a organização) e o HSTS só na produção. O certificado vem do modo escolhido na
// instalação: o Let's Encrypt pelo DNS da Cloudflare, a AC do próprio Caddy ou os arquivos da AC da
// empresa. O Caddyfile é gerado do operacao.json e conferido pelo próprio Caddy antes de valer.
import { access, copyFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import type { ExecutarProcesso, ResultadoDaFerramenta } from '@grafite/operacao';
import type { EstadoDaInstalacao } from './estado.ts';
import { SERVICOS, SERVICOS_NO_LINUX } from './layout.ts';
import type { Servicos } from './windows/servicos.ts';

/** O serviço do proxy no Windows. */
export const SERVICO_DO_PROXY = SERVICOS.proxy;

/** No Caddyfile, a barra normal: o Windows a aceita, e o Caddyfile não a trata como escape. */
const noCaddyfile = (caminho: string) => caminho.replaceAll('\\', '/');

export function gerarCaddyfile(estado: EstadoDaInstalacao): string {
  const { certificado } = estado;
  // No Linux (change servidor-linux-com-docker, design, decisão 7), o proxy é um contêiner na rede
  // interna: os dados ficam na pasta da instalação montada nele, e os apps são os serviços dela.
  const noLinux = estado.plataforma === 'linux';
  const dados = noLinux
    ? posix.join(estado.raiz, 'caddy', 'dados')
    : win32.join(estado.raiz, 'caddy', 'dados');
  const globais = ['\tadmin off'];
  if (certificado.modo === 'publico') globais.push(`\temail ${certificado.email}`);
  if (certificado.modo === 'interno' && certificado.ac === 'caddy')
    globais.push('\tskip_install_trust');
  globais.push('\tstorage file_system {', `\t\troot ${noCaddyfile(dados)}`, '\t}');

  const tls =
    certificado.modo === 'publico'
      ? ['\ttls {', '\t\tdns cloudflare {env.CLOUDFLARE_API_TOKEN}', '\t}']
      : certificado.ac === 'caddy'
        ? ['\ttls internal']
        : [`\ttls ${noCaddyfile(certificado.certificado)} ${noCaddyfile(certificado.chave)}`];

  const sites = (['producao', 'teste'] as const).flatMap((ambiente) => {
    const { enderecos, porta } = estado.ambientes[ambiente];
    return enderecos.map((endereco) =>
      [
        `${endereco} {`,
        ...tls,
        ...(ambiente === 'producao'
          ? ['\theader Strict-Transport-Security "max-age=31536000"']
          : []),
        `\treverse_proxy ${noLinux ? SERVICOS_NO_LINUX[ambiente] : '127.0.0.1'}:${porta}`,
        '}',
        '',
      ].join('\n'),
    );
  });

  return [
    '# Gerado por "grafite proxy configurar" a partir do operacao.json. Não edite: rode o comando de novo.',
    '{',
    ...globais,
    '}',
    '',
    ...sites,
  ].join('\n');
}

export interface DependenciasDoProxy {
  estado: EstadoDaInstalacao;
  executar: ExecutarProcesso;
  servicos: Servicos;
  /** O caddy.exe da instalação. */
  caddy: string;
}

/**
 * Gera o Caddyfile numa cópia, que o Caddy confere; só então ela troca o atual, e o proxy reinicia.
 * O Caddyfile recusado não troca nada. Quem confere é o Caddy da plataforma: no Windows, o do
 * pacote; no Linux, o da imagem do proxy.
 */
export async function trocarCaddyfile({
  estado,
  servicos,
  caddyfile,
  validar,
}: {
  estado: EstadoDaInstalacao;
  servicos: Servicos;
  caddyfile: string;
  validar: (caddyfile: string) => Promise<ResultadoDaFerramenta>;
}): Promise<void> {
  const novo = `${caddyfile}.novo`;
  await writeFile(novo, gerarCaddyfile(estado));
  const { codigo, saida, erro } = await validar(novo);
  if (codigo !== 0) {
    await rm(novo, { force: true });
    throw new Error(
      `O Caddy recusou a configuração nova, e a atual continua: ${(erro || saida).trim()}`,
    );
  }
  await rename(novo, caddyfile);
  await servicos.parar(SERVICO_DO_PROXY);
  await servicos.iniciar(SERVICO_DO_PROXY);
}

/** O Caddyfile do Windows, conferido pelo caddy.exe da instalação. */
export async function configurarProxy({
  estado,
  executar,
  servicos,
  caddy,
}: DependenciasDoProxy): Promise<void> {
  await trocarCaddyfile({
    estado,
    servicos,
    caddyfile: join(estado.raiz, 'caddy', 'Caddyfile'),
    validar: (novo) =>
      executar(caddy, ['validate', '--config', novo, '--adapter', 'caddyfile'], {
        env: process.env,
      }),
  });
}

/**
 * Copia o certificado raiz da AC do Caddy para o destino (uma pasta ou um arquivo), para ser
 * distribuído às máquinas e aos celulares. Devolve o arquivo copiado.
 */
export async function exportarRaiz(estado: EstadoDaInstalacao, destino: string): Promise<string> {
  const { certificado } = estado;
  if (certificado.modo === 'publico') {
    throw new Error(
      "O modo público usa o Let's Encrypt, em que todo dispositivo já confia: não há raiz para distribuir.",
    );
  }
  if (certificado.ac === 'empresa') {
    throw new Error('O certificado é da AC da empresa: distribua a raiz dela.');
  }
  const raiz = join(estado.raiz, 'caddy', 'dados', 'pki', 'authorities', 'local', 'root.crt');
  await access(raiz).catch(() => {
    throw new Error(
      'O proxy ainda não gerou a raiz: inicie o serviço Grafite Proxy e tente de novo.',
    );
  });
  const ehPasta = await stat(destino).then(
    (informacoes) => informacoes.isDirectory(),
    () => false,
  );
  const arquivo = ehPasta ? join(destino, 'grafite-raiz.crt') : destino;
  await copyFile(raiz, arquivo);
  return arquivo;
}
