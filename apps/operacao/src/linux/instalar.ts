// `grafite instalar <tar>` no servidor Linux (spec operacao-em-linux, "Instalação do zero no Linux";
// change servidor-linux-com-docker, design, decisões 2, 4, 11 e 12). O comando roda num contêiner da
// imagem do comando, com o socket do Docker e a pasta da instalação montada no mesmo caminho, que o
// lançador escolhe e passa, com o fuso do servidor. O começo, antes de criar qualquer coisa:
// 1. o Docker do servidor e o plugin compose, o pacote e as portas 80 e 443 do servidor, vistas por
//    um contêiner da imagem do comando na rede do servidor;
// 2. as respostas, perguntadas ou lidas do arquivo do roteiro, sem a pasta, o pgBin e a senha do
//    postgres, que a plataforma dá ou a instalação gera;
// Depois, as pastas, com o dono de cada contêiner, e a marca em cada destino do backup, que um
// contêiner da imagem do comando grava com o destino montado. O resto, como
// no Windows, retomado pelo mesmo comando depois de uma falha:
// 3. as imagens do pacote no Docker, a configuração de cada ambiente, com as senhas de antes ou
//    geradas, e o projeto do Compose;
// 4. o PostgreSQL de cada ambiente, com os papéis e o banco do Grafite, e as migrations pela imagem;
// 5. a primeira organização e o coletor do servidor, na produção;
// 6. o proxy, os contêineres e a saúde pela rede interna e pelo HTTPS.
import { access, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type ExecutarProcesso,
  type FerramentasDoPostgres,
  MARCA_DO_DESTINO,
} from '@grafite/operacao';
import {
  type ChavesDoPush,
  completarSegredos,
  urlDoBanco,
  variaveisDaProducao,
} from '../ambientes.ts';
import { CADASTRE_AS_FAIXAS, ligarColetor } from '../coletor.ts';
import { gravarEstado } from '../estado.ts';
import { estadoDa } from '../instalar.ts';
import {
  BANCOS,
  type PastasDaInstalacaoNoLinux,
  PG_BIN_NO_LINUX,
  PORTAS,
  PORTAS_DO_PROXY,
  pastasDaInstalacaoNoLinux,
  SERVICO_DO_POSTGRES_DA_PRODUCAO,
  SERVICOS,
  USUARIO_DOS_CONTEINERES,
} from '../layout.ts';
import {
  lerArquivoDeRespostas,
  lerRespostasSalvas,
  perguntarRespostas,
  type RespostasDaInstalacao,
  salvarRespostas,
} from '../respostas.ts';
import { conferirSaude, type Saude } from '../saude.ts';
import type { Console } from '../windows/console.ts';
import type { Servicos } from '../windows/servicos.ts';
import { gravarConfiguracoesNoLinux, lerSegredosNoLinux } from './ambientes.ts';
import { prepararBancoNoLinux, superusuarioNoLinux } from './banco.ts';
import {
  carregarVersao,
  conferirPacoteDoLinux,
  type DescricaoDoPacoteDoLinux,
  imagemDaVersao,
} from './pacote.ts';
import { PERMISSOES_DO_SISTEMA, type Permissoes } from './permissoes.ts';
import { configurarProxyNoLinux } from './proxy.ts';
import { scriptsDoLinux } from './versao.ts';

export interface DependenciasDoComecoNoLinux {
  /** O tar da versão, com o `.sha256` ao lado. */
  pacote: string;
  /** O arquivo de respostas do roteiro automático, no lugar das perguntas. */
  arquivoDeRespostas?: string;
  /** A pasta da instalação, que o lançador montou no mesmo caminho. */
  raiz: string;
  /** O fuso do servidor, como America/Sao_Paulo, que o lançador passa. */
  fuso: string;
  console: Console;
  executar: ExecutarProcesso;
  permissoes?: Permissoes;
}

export interface InstalacaoPreparada {
  descricao: DescricaoDoPacoteDoLinux;
  respostas: RespostasDaInstalacao;
  tokenDaCloudflare: string | undefined;
  pastas: PastasDaInstalacaoNoLinux;
  /** Se a instalação continua uma interrompida. */
  retomada: boolean;
}

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

const env = () => ({ env: process.env });

/** O Docker do servidor responde pelo socket, e o plugin compose está na imagem do comando. */
export async function conferirDocker(executar: ExecutarProcesso): Promise<void> {
  const servidor = await executar('docker', ['version', '--format', '{{.Server.Version}}'], env());
  if (servidor.codigo !== 0) {
    throw new Error(
      `O Docker do servidor não respondeu: ${(servidor.erro || servidor.saida).trim()}. Confira se o Docker Engine está instalado e rodando.`,
    );
  }
  const compose = await executar('docker', ['compose', 'version', '--short'], env());
  if (compose.codigo !== 0) {
    throw new Error(
      `O plugin compose do Docker não respondeu: ${(compose.erro || compose.saida).trim()}.`,
    );
  }
}

/** Tenta ouvir em cada porta e escreve as que estão ocupadas, separadas por vírgula. */
const OUVIR_AS_PORTAS = `const net = require('node:net');
const portas = process.argv.slice(1).map(Number);
const ocupadas = [];
let faltam = portas.length;
const fim = () => { if (--faltam === 0) console.log(ocupadas.sort((a, b) => a - b).join(',')); };
for (const porta of portas) {
  const servidor = net.createServer();
  servidor.once('error', () => { ocupadas.push(porta); fim(); });
  servidor.listen(porta, '0.0.0.0', () => servidor.close(fim));
}`;

/**
 * As portas ocupadas no servidor: o comando roda na rede interna, então um contêiner da imagem do
 * comando, na rede do servidor, tenta ouvir em cada uma.
 */
export async function portasOcupadasNoLinux(
  executar: ExecutarProcesso,
  imagemDoComando: string,
  portas: readonly number[],
): Promise<number[]> {
  const { codigo, saida, erro } = await executar(
    'docker',
    [
      'run',
      '--rm',
      '--pull',
      'never',
      '--network',
      'host',
      '--entrypoint',
      'node',
      imagemDoComando,
      '-e',
      OUVIR_AS_PORTAS,
      ...portas.map(String),
    ],
    env(),
  );
  if (codigo !== 0) {
    throw new Error(`Não foi possível conferir as portas do servidor: ${(erro || saida).trim()}`);
  }
  return saida
    .trim()
    .split(',')
    .filter((porta) => porta !== '')
    .map(Number);
}

/** O proxy precisa da 80 e da 443 do servidor: outro programa nelas para a instalação. */
function conferirPortasDoProxy(ocupadas: readonly number[]): void {
  const [porta] = ocupadas;
  if (porta === undefined) return;
  if (ocupadas.length === 1) {
    throw new Error(
      `A porta ${porta} do servidor está ocupada por outro programa, e o proxy do Grafite precisa das portas 80 e 443: libere-a e rode a instalação de novo.`,
    );
  }
  throw new Error(
    'As portas 80 e 443 do servidor estão ocupadas por outro programa, e o proxy do Grafite precisa delas: libere-as e rode a instalação de novo.',
  );
}

/**
 * As pastas da instalação, com o dono de cada contêiner: a raiz só do root; os arquivos dos apps,
 * a fila do coletor e os destinos do backup, do usuário dos contêineres; as pastas dos bancos
 * vazias, que o PostgreSQL acerta na primeira vez. O destino que não aceita o dono, como um
 * compartilhamento montado com outro, só ganha um aviso.
 */
export async function prepararPastasNoLinux({
  pastas,
  destinos,
  permissoes,
  console,
  executar,
  imagemDoComando,
}: {
  pastas: PastasDaInstalacaoNoLinux;
  destinos: readonly string[];
  permissoes: Permissoes;
  console: Console;
  executar: ExecutarProcesso;
  /** A imagem do comando, que prepara os destinos do lado do servidor. */
  imagemDoComando: string;
}): Promise<void> {
  const { uid, gid } = USUARIO_DOS_CONTEINERES;
  await mkdir(pastas.raiz, { recursive: true });
  await permissoes.modo(pastas.raiz, 0o700);
  for (const pasta of [
    pastas.producao.arquivos,
    pastas.producao.banco,
    pastas.teste.arquivos,
    pastas.teste.banco,
    pastas.filaDoColetor,
    join(pastas.caddy, 'dados'),
    join(pastas.caddy, 'config'),
    pastas.acDoCaddy,
    pastas.versoes,
  ]) {
    await mkdir(pasta, { recursive: true });
  }
  for (const pasta of [pastas.producao.arquivos, pastas.teste.arquivos, pastas.filaDoColetor]) {
    await permissoes.dono(pasta, uid, gid);
  }
  await permissoes.modo(pastas.filaDoColetor, 0o700);
  const marca = `Destino do backup do Grafite, marcado pela instalação em ${pastas.raiz}. Não apague: sem a marca, o backup recusa a pasta.`;
  for (const destino of destinos) {
    const { dono } = await prepararDestino({ executar, imagemDoComando, destino, marca });
    if (!dono) {
      console.escrever(
        `O destino ${destino} não aceitou o dono dos contêineres (${uid}): confira se o usuário ${uid} grava nele, ou o backup falhará.`,
      );
    }
  }
}

/** Cria o destino, grava a marca e dá o destino ao usuário dos contêineres, ou diz que não deu. */
const PREPARAR_O_DESTINO = `mkdir -p "$1" && printf '%s\\n' "$3" > "$1/${MARCA_DO_DESTINO}" && { chown "$2" "$1" 2>/dev/null || echo sem-dono; }`;

/**
 * Prepara um destino do backup por um contêiner descartável da imagem do comando, com o destino
 * montado no mesmo caminho: na instalação, o lançador ainda não sabe os destinos, que vêm das
 * respostas, e o comando não os tem montados.
 */
async function prepararDestino({
  executar,
  imagemDoComando,
  destino,
  marca,
}: {
  executar: ExecutarProcesso;
  imagemDoComando: string;
  destino: string;
  marca: string;
}): Promise<{ dono: boolean }> {
  const { uid, gid } = USUARIO_DOS_CONTEINERES;
  const { codigo, saida, erro } = await executar(
    'docker',
    [
      'run',
      '--rm',
      '--pull',
      'never',
      '--network',
      'none',
      '--volume',
      `${destino}:${destino}`,
      '--entrypoint',
      'sh',
      imagemDoComando,
      '-c',
      PREPARAR_O_DESTINO,
      'sh',
      destino,
      `${uid}:${gid}`,
      marca,
    ],
    env(),
  );
  if (codigo !== 0) {
    throw new Error(
      `Não foi possível preparar o destino do backup ${destino}: ${(erro || saida).trim()}`,
    );
  }
  return { dono: !saida.includes('sem-dono') };
}

/** As conferências, as respostas, as pastas e as marcas, antes dos bancos e dos contêineres. */
export async function prepararInstalacaoNoLinux(
  dep: DependenciasDoComecoNoLinux,
): Promise<InstalacaoPreparada> {
  const { console, executar, raiz, fuso } = dep;
  const permissoes = dep.permissoes ?? PERMISSOES_DO_SISTEMA;

  // 1. As conferências, sem criar nada.
  await conferirDocker(executar);
  const descricao = await conferirPacoteDoLinux(dep.pacote, { executar });
  console.escrever(`Pacote do Grafite ${descricao.versao} conferido.`);
  const pastas = pastasDaInstalacaoNoLinux(raiz);
  const salvas = await lerRespostasSalvas(pastas);
  if (salvas === null && (await existe(pastas.estado))) {
    throw new Error(
      `O Grafite já está instalado em ${raiz}. Para uma versão nova, use sudo grafite atualizar.`,
    );
  }
  if (salvas !== null) {
    console.escrever('Retomando a instalação interrompida, com as respostas dadas antes.');
  }
  // Na retomada, o proxy já rodando é quem segura as portas.
  if (salvas === null) {
    conferirPortasDoProxy(
      await portasOcupadasNoLinux(
        executar,
        imagemDaVersao('operacao', descricao.versao),
        PORTAS_DO_PROXY,
      ),
    );
  }

  // 2. As respostas, com o que a plataforma dá.
  const daPlataforma = { raiz, pgBin: PG_BIN_NO_LINUX };
  let lidas: Pick<
    RespostasDaInstalacao,
    Exclude<keyof RespostasDaInstalacao, 'plataforma' | 'fuso'>
  >;
  let tokenDaCloudflare: string | undefined;
  if (salvas !== null) lidas = salvas;
  else if (dep.arquivoDeRespostas !== undefined) {
    const doArquivo = await lerArquivoDeRespostas(dep.arquivoDeRespostas, daPlataforma);
    lidas = doArquivo.respostas;
    tokenDaCloudflare = doArquivo.tokenDaCloudflare;
  } else {
    ({ respostas: lidas, tokenDaCloudflare } = await perguntarRespostas(console, daPlataforma));
  }
  const respostas: RespostasDaInstalacao = {
    ...lidas,
    ...daPlataforma,
    plataforma: 'linux',
    fuso,
  };

  // 3. As pastas e as marcas dos destinos, e as respostas guardadas para a retomada.
  await prepararPastasNoLinux({
    pastas,
    destinos: respostas.backup.destinos,
    permissoes,
    console,
    executar,
    imagemDoComando: imagemDaVersao('operacao', descricao.versao),
  });
  await salvarRespostas(pastas, respostas);

  return { descricao, respostas, tokenDaCloudflare, pastas, retomada: salvas !== null };
}

export interface DependenciasDaInstalacaoNoLinux extends DependenciasDoComecoNoLinux {
  /** As ferramentas do PostgreSQL 18 da imagem do comando, que chegam aos bancos pela rede interna. */
  ferramentas: FerramentasDoPostgres;
  /** Os contêineres do projeto do Compose da instalação. */
  servicos: Servicos;
  saude: Saude;
  gerarSenha: () => string;
  /** 32 bytes em base64, para a chave dos dois passos e a do cofre. */
  gerarChave: () => string;
  /** Um par novo das chaves do push, só para a produção. */
  gerarChavesDoPush: () => ChavesDoPush;
  /** A espera pelo PostgreSQL de cada contêiner, que os testes encurtam. */
  esperarBanco?: { esperar?: (ms: number) => Promise<void>; tentativas?: number };
}

export async function instalarNoLinux(dep: DependenciasDaInstalacaoNoLinux): Promise<void> {
  const preparada = await prepararInstalacaoNoLinux(dep);
  try {
    await instalarComAsRespostas(dep, preparada);
  } catch (erro) {
    throw new Error(
      `${erro instanceof Error ? erro.message : String(erro)}\nA instalação parou no meio. Corrija o problema e rode o mesmo comando de novo: ela continua de onde parou.`,
      { cause: erro },
    );
  }
}

async function instalarComAsRespostas(
  dep: DependenciasDaInstalacaoNoLinux,
  { descricao, respostas, tokenDaCloudflare, pastas }: InstalacaoPreparada,
): Promise<void> {
  const { console, executar, ferramentas, servicos, saude } = dep;
  const { versao } = descricao;

  // 3. As imagens, a configuração de cada ambiente e o projeto do Compose.
  await carregarVersao({
    pacote: dep.pacote,
    descricao,
    pastaDasVersoes: pastas.versoes,
    executar,
  });
  console.escrever(`Imagens da versão ${versao} carregadas no Docker.`);
  const antes = await lerSegredosNoLinux(pastas);
  let token = antes.tokenDaCloudflare ?? tokenDaCloudflare;
  if (token === undefined && respostas.certificado.modo === 'publico') {
    token = await console.perguntarSegredo(
      'Token da Cloudflare, com permissão de editar o DNS só da zona',
    );
  }
  const segredos = completarSegredos(
    { ...antes, ...(token === undefined ? {} : { tokenDaCloudflare: token }) },
    dep,
    { superusuarioDaProducao: true },
  );
  await gravarConfiguracoesNoLinux({
    pastas,
    respostas,
    segredos,
    versoes: { producao: versao, teste: versao },
    modo: (dep.permissoes ?? PERMISSOES_DO_SISTEMA).modo,
  });
  console.escrever('Configuração dos ambientes gravada, só para o root.');

  // 4. O PostgreSQL de cada ambiente, com os papéis e o banco, e as migrations pela imagem.
  await servicos.iniciar(SERVICO_DO_POSTGRES_DA_PRODUCAO);
  await servicos.iniciar(SERVICOS.postgresDoTeste);
  const { superusuario = '', dono, app, backup } = segredos.producao;
  await prepararBancoNoLinux({
    ferramentas,
    superusuario: superusuarioNoLinux('producao', superusuario),
    banco: BANCOS.producao.nome,
    senhas: { dono, app, backup },
    ...dep.esperarBanco,
  });
  await prepararBancoNoLinux({
    ferramentas,
    superusuario: superusuarioNoLinux('teste', segredos.teste.superusuario),
    banco: BANCOS.teste.nome,
    senhas: { dono: segredos.teste.dono, app: segredos.teste.app },
    ...dep.esperarBanco,
  });
  console.escrever('Bancos da produção e do teste prontos, cada um no seu contêiner.');
  const scripts = scriptsDoLinux({ executar, versao });
  for (const ambiente of ['producao', 'teste'] as const) {
    await scripts.migrarBanco(
      urlDoBanco('grafite_owner', segredos[ambiente].dono, ambiente, 'linux'),
    );
  }
  console.escrever(`Migrations da versão ${versao} aplicadas nos dois bancos.`);

  // 5. A primeira organização, na produção, e o coletor do servidor, ligado a ela sem faixas.
  const { nome, pessoa, usuario, email } = respostas.organizacao;
  const criacao = await scripts.comandoDaApi(variaveisDaProducao(respostas, segredos), [
    'organizacao',
    'criar',
    '--se-nao-existir',
    '--nome',
    nome,
    ...respostas.enderecos.flatMap((endereco) => ['--endereco', endereco]),
    '--pessoa',
    pessoa,
    '--usuario',
    usuario,
    ...(email === undefined ? [] : ['--email', email]),
  ]);
  if (criacao.codigo !== 0) {
    throw new Error(
      `A primeira organização não foi criada: ${(criacao.erro || criacao.saida).trim()}`,
    );
  }
  for (const linha of criacao.saida.trim().split('\n')) console.escrever(linha);
  const coletor = await ligarColetor({
    scripts,
    variaveisDaProducao: variaveisDaProducao(respostas, segredos),
    token: segredos.tokenDoColetor,
    endereco: respostas.enderecos[0] ?? '',
  });
  for (const linha of coletor) console.escrever(linha);

  // 6. O proxy, os contêineres e a saúde, de dentro da rede interna.
  const estado = estadoDa(respostas, versao);
  await configurarProxyNoLinux({
    estado,
    executar,
    servicos,
    permissoes: dep.permissoes ?? PERMISSOES_DO_SISTEMA,
  });
  for (const servico of [SERVICOS.producao, SERVICOS.teste, SERVICOS.coletor]) {
    await servicos.iniciar(servico);
  }
  conferirSaude(
    await saude.local(PORTAS.producao),
    { versao, ambiente: 'producao' },
    'O app da produção',
  );
  conferirSaude(await saude.local(PORTAS.teste), { versao, ambiente: 'teste' }, 'O app do teste');
  await saude.local(PORTAS.coletor);
  const raizDaAc =
    respostas.certificado.modo === 'interno' && respostas.certificado.ac === 'caddy'
      ? { raiz: pastas.raizDaAcDoCaddy }
      : {};
  for (const ambiente of ['producao', 'teste'] as const) {
    for (const endereco of estado.ambientes[ambiente].enderecos) {
      conferirSaude(
        await saude.peloProxy(endereco, raizDaAc),
        { versao, ambiente },
        `O endereço https://${endereco}`,
      );
    }
  }

  await gravarEstado(estado);
  await rm(pastas.instalacao, { force: true });

  console.escrever(`Grafite ${versao} instalado em ${pastas.raiz}.`);
  console.escrever(
    `  Produção: ${estado.ambientes.producao.enderecos.map((e) => `https://${e}`).join(', ')}`,
  );
  console.escrever(
    `  Teste: ${estado.ambientes.teste.enderecos.map((e) => `https://${e}`).join(', ')} (vazio até sudo grafite preparar-teste)`,
  );
  if (raizDaAc.raiz !== undefined) {
    console.escrever(
      '  Distribua o certificado raiz às máquinas e aos celulares: sudo grafite proxy raiz <pasta>.',
    );
  }
  console.escrever(CADASTRE_AS_FAIXAS);
  console.escrever(
    '  O e-mail só sai depois de configurado: sudo grafite email configurar --smtp <endereço> --remetente "Grafite <grafite@empresa.com.br>".',
  );
}
