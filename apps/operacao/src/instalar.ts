// `grafite instalar <zip>` (spec operacao-servicos, "Instalação do zero"; design do F2d, decisão 6).
// Em ordem:
// 1. conferir o Node 24, o pacote, o PostgreSQL 18 da produção, a pasta raiz e as portas do proxy,
//    antes de criar nada;
// 2. as respostas, perguntadas ou lidas do arquivo do roteiro;
// 3. a configuração de cada ambiente, com as senhas geradas, a instância do teste e os papéis e o
//    banco de cada instância;
// 4. a primeira versão: o pacote desempacotado, as junções e as migrations nos dois bancos;
// 5. a primeira organização, na produção, com a senha temporária mostrada uma vez;
// 6. os serviços, o proxy, o firewall, a partida, o atalho do menu da operação e a saúde dos dois
//    ambientes pelo HTTPS.
// Cada passo confere o que já existe: a instalação interrompida é retomada pelo mesmo comando, com as
// respostas guardadas em `instalacao.json` e as senhas dos config.env, que nunca são trocadas.
// Pelo atalho de instalação, com --preparar (change instalador-e-menu-da-operacao, design, decisão
// 3), o pacote conferido é seguido da preparação do servidor: o IIS que ocupa as portas do proxy e o
// PostgreSQL 18 que falta, cuja senha segue na memória, sem ser perguntada de novo.
import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutarProcesso, FerramentasDoPostgres } from '@grafite/operacao';
import {
  type ChavesDoPush,
  completarSegredos,
  gravarConfiguracoes,
  lerSegredos,
  urlDoBanco,
  variaveisDaProducao,
} from './ambientes.ts';
import {
  conferirPostgres18,
  conferirServidorDaProducao,
  criarInstanciaDoTeste,
  rodarSql,
  sqlDoBanco,
} from './banco.ts';
import { CADASTRE_AS_FAIXAS, ligarColetor } from './coletor.ts';
import { type EstadoDaInstalacao, gravarEstado } from './estado.ts';
import {
  BANCOS,
  ferramentasDaProducao,
  type PastasDaInstalacao,
  PG_BIN_PADRAO,
  PORTAS,
  PORTAS_DO_PROXY,
  pastasDaInstalacao,
  RAIZ_PADRAO,
  SERVICO_DO_POSTGRES_DA_PRODUCAO,
  SERVICOS,
} from './layout.ts';
import { conferirPacote, type DescricaoDoPacote, desempacotarVersao } from './pacote.ts';
import { configurarProxy } from './proxy.ts';
import {
  lerArquivoDeRespostas,
  lerRespostasSalvas,
  perguntarPasta,
  perguntarRespostas,
  type RespostasDaInstalacao,
  salvarRespostas,
} from './respostas.ts';
import { conferirSaude, type Saude } from './saude.ts';
import { comandoDaApi, migrarBanco, scriptsDoWindows } from './versao.ts';
import { type AtalhoDoMenu, instalarAtalhoDoMenu } from './windows/atalhos.ts';
import type { Console } from './windows/console.ts';
import { abrirPortasDoProxy } from './windows/firewall.ts';
import type { Juncoes } from './windows/juncoes.ts';
import { conferirPortasDoProxy, portasOcupadas } from './windows/portas.ts';
import { type PecasDaPreparacao, prepararIis, prepararPostgres } from './windows/preparar.ts';
import type { Prerequisitos } from './windows/prerequisitos.ts';
import {
  configurarServicoDoWindows,
  definicaoDoServico,
  type Servicos,
} from './windows/servicos.ts';

export interface DependenciasDaInstalacao {
  /** O zip da versão, com o `.sha256` ao lado. */
  zip: string;
  /** O arquivo de respostas do roteiro automático, no lugar das perguntas. */
  arquivoDeRespostas?: string;
  console: Console;
  executar: ExecutarProcesso;
  /** As ferramentas do PostgreSQL de uma pasta de binários. */
  ferramentas: (pgBin: string) => FerramentasDoPostgres;
  /** Os serviços do Windows da instalação. */
  servicos: (pastas: PastasDaInstalacao) => Servicos;
  juncoes: Juncoes;
  saude: Saude;
  /** O node.exe que os serviços e os scripts da versão rodam. */
  node: string;
  versaoDoNode: string;
  gerarSenha: () => string;
  /** 32 bytes em base64, para a chave dos dois passos. */
  gerarChave: () => string;
  /** Um par novo das chaves do push, só para a produção. */
  gerarChavesDoPush: () => ChavesDoPush;
  /** O atalho "Grafite" da área de trabalho de todos os usuários, que abre o painel da operação. */
  atalhoDoMenu: AtalhoDoMenu;
  /** A preparação do servidor, quando a instalação vem do atalho (--preparar). */
  preparacao?: PreparacaoDoServidor;
}

/** A preparação do servidor pelo atalho de instalação, antes das conferências de hoje. */
export interface PreparacaoDoServidor extends PecasDaPreparacao {
  prerequisitos: Prerequisitos;
  /** A pasta do zip, onde ficam os instaladores copiados por quem opera ou baixados. */
  pastaDoZip: string;
}

const NODE_MINIMO = 24;

export function conferirNode(versao: string): void {
  if (Number(versao.split('.')[0]) < NODE_MINIMO) {
    throw new Error(
      `O Grafite precisa do Node ${NODE_MINIMO}; este servidor tem o Node ${versao}.`,
    );
  }
}

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/** O estado da instalação pronta, sem segredos, na plataforma das respostas. */
export function estadoDa(respostas: RespostasDaInstalacao, versao: string): EstadoDaInstalacao {
  return {
    raiz: respostas.raiz,
    plataforma: respostas.plataforma ?? 'windows',
    ambientes: {
      producao: {
        enderecos: respostas.enderecos,
        porta: PORTAS.producao,
        atual: versao,
        anterior: null,
      },
      teste: {
        enderecos: respostas.enderecos.map(
          (endereco) => respostas.mapaDoTeste[endereco] ?? endereco,
        ),
        porta: PORTAS.teste,
        atual: versao,
        anterior: null,
      },
    },
    mapaDoTeste: respostas.mapaDoTeste,
    certificado: respostas.certificado,
    versoes: [versao],
    pgBin: respostas.pgBin,
  };
}

export async function instalar(dep: DependenciasDaInstalacao): Promise<void> {
  const { console } = dep;

  // 1 e 2. As conferências e as respostas, sem criar nada.
  conferirNode(dep.versaoDoNode);
  const descricao = await conferirPacote(dep.zip);
  console.escrever(`Pacote do Grafite ${descricao.versao} conferido.`);

  // 0. Pelo atalho, o IIS primeiro: com o não, nada foi instalado.
  let preparado: { senhaDoPostgres?: string } = {};
  if (dep.preparacao !== undefined) {
    await prepararIis({ console, executar: dep.executar, sistema: dep.preparacao.sistema });
    preparado = await prepararPostgres({
      ...dep.preparacao,
      console,
      executar: dep.executar,
      ferramentas: dep.ferramentas,
    });
  }

  const doArquivo = dep.arquivoDeRespostas
    ? await lerArquivoDeRespostas(dep.arquivoDeRespostas)
    : undefined;
  const raiz =
    doArquivo?.respostas.raiz ??
    (await perguntarPasta(console, 'Pasta da instalação', RAIZ_PADRAO));
  const pastas = pastasDaInstalacao(raiz);
  const salvas = await lerRespostasSalvas(pastas);
  if (salvas === null && (await existe(pastas.estado))) {
    throw new Error(
      `O Grafite já está instalado em ${raiz}. Para uma versão nova, use grafite atualizar.`,
    );
  }
  if (salvas !== null) {
    console.escrever('Retomando a instalação interrompida, com as respostas dadas antes.');
  }

  // O PostgreSQL que a preparação acabou de instalar está na pasta padrão.
  const pgBin =
    salvas?.pgBin ??
    doArquivo?.respostas.pgBin ??
    (preparado.senhaDoPostgres === undefined
      ? await perguntarPasta(console, 'Pasta dos programas do PostgreSQL 18', PG_BIN_PADRAO)
      : PG_BIN_PADRAO);
  const ferramentas = dep.ferramentas(pgBin);
  await conferirPostgres18(ferramentas, pgBin);
  const senhaDoPostgres =
    doArquivo?.senhaDoPostgres ??
    preparado.senhaDoPostgres ??
    (await console.perguntarSegredo('Senha do usuário postgres do PostgreSQL da produção'));
  await conferirServidorDaProducao(ferramentas, senhaDoPostgres);
  // Na retomada, o proxy já rodando é quem segura as portas.
  if ((await dep.servicos(pastas).estado(SERVICOS.proxy)) !== 'rodando') {
    conferirPortasDoProxy(await portasOcupadas(dep.executar, PORTAS_DO_PROXY));
  }

  let respostas: RespostasDaInstalacao;
  let tokenDaCloudflare: string | undefined;
  if (salvas !== null) respostas = salvas;
  else if (doArquivo !== undefined) {
    respostas = doArquivo.respostas;
    tokenDaCloudflare = doArquivo.tokenDaCloudflare;
  } else {
    ({ respostas, tokenDaCloudflare } = await perguntarRespostas(console, { raiz, pgBin }));
  }

  try {
    await instalarComAsRespostas(dep, {
      pastas,
      respostas,
      ferramentas,
      senhaDoPostgres,
      tokenDaCloudflare,
      descricao,
    });
  } catch (erro) {
    throw new Error(
      `${erro instanceof Error ? erro.message : String(erro)}\nA instalação parou no meio. Corrija o problema e rode o mesmo comando de novo: ela continua de onde parou.`,
      { cause: erro },
    );
  }
}

async function instalarComAsRespostas(
  dep: DependenciasDaInstalacao,
  {
    pastas,
    respostas,
    ferramentas,
    senhaDoPostgres,
    tokenDaCloudflare,
    descricao,
  }: {
    pastas: PastasDaInstalacao;
    respostas: RespostasDaInstalacao;
    ferramentas: FerramentasDoPostgres;
    senhaDoPostgres: string;
    tokenDaCloudflare: string | undefined;
    descricao: DescricaoDoPacote;
  },
): Promise<void> {
  const { console, executar, juncoes, saude } = dep;
  const { versao } = descricao;
  const servicos = dep.servicos(pastas);
  await salvarRespostas(pastas, respostas);

  // 3. A configuração de cada ambiente, a instância do teste e os papéis e o banco de cada uma.
  const antes = await lerSegredos(pastas);
  if (antes.tokenDaCloudflare === undefined && tokenDaCloudflare === undefined) {
    if (respostas.certificado.modo === 'publico') {
      tokenDaCloudflare = await console.perguntarSegredo(
        'Token da Cloudflare, com permissão de editar o DNS só da zona',
      );
    }
  }
  const segredos = completarSegredos(
    { ...antes, ...(tokenDaCloudflare === undefined ? {} : { tokenDaCloudflare }) },
    dep,
  );
  await gravarConfiguracoes({ pastas, respostas, segredos, executar });
  console.escrever('Configuração dos ambientes gravada, só para os administradores.');

  await criarInstanciaDoTeste({
    pastas,
    ferramentas,
    executar,
    servicos,
    senhaDoSuperusuario: segredos.teste.superusuario,
  });
  await rodarSql(
    ferramentas,
    { porta: BANCOS.producao.porta, senha: senhaDoPostgres },
    sqlDoBanco(BANCOS.producao.nome, segredos.producao),
  );
  await rodarSql(
    ferramentas,
    { porta: BANCOS.teste.porta, senha: segredos.teste.superusuario },
    sqlDoBanco(BANCOS.teste.nome, { dono: segredos.teste.dono, app: segredos.teste.app }),
  );
  console.escrever('Bancos da produção e do teste prontos, cada um na sua instância.');

  // 4. A primeira versão.
  const { pasta: pastaDaVersao } = await desempacotarVersao({
    zip: dep.zip,
    descricao,
    pastaDasVersoes: pastas.versoes,
    juncoes,
  });
  await juncoes.apontar(pastas.producao.atual, pastaDaVersao);
  await juncoes.apontar(pastas.teste.atual, pastaDaVersao);
  const processo = { executar, node: dep.node, pastaDaVersao };
  for (const ambiente of ['producao', 'teste'] as const) {
    const { dono } = segredos[ambiente];
    await migrarBanco({ ...processo, urlDono: urlDoBanco('grafite_owner', dono, ambiente) });
  }
  console.escrever(`Versão ${versao} desempacotada, com as migrations nos dois bancos.`);

  // 5. A primeira organização, na produção.
  const { nome, pessoa, usuario, email } = respostas.organizacao;
  const criacao = await comandoDaApi({
    ...processo,
    variaveis: variaveisDaProducao(respostas, segredos),
    argumentos: [
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
    ],
  });
  if (criacao.codigo !== 0) {
    throw new Error(
      `A primeira organização não foi criada: ${(criacao.erro || criacao.saida).trim()}`,
    );
  }
  for (const linha of criacao.saida.trim().split('\n')) console.escrever(linha);
  // O coletor da produção, ligado a ela com o token do coletor.env, sem faixas.
  const coletor = await ligarColetor({
    scripts: scriptsDoWindows(processo),
    variaveisDaProducao: variaveisDaProducao(respostas, segredos),
    token: segredos.tokenDoColetor,
    endereco: respostas.enderecos[0] ?? '',
  });
  for (const linha of coletor) console.escrever(linha);

  // 6. Os serviços, o proxy, o firewall, a partida e a saúde.
  if (!(await configurarServicoDoWindows(executar, SERVICO_DO_POSTGRES_DA_PRODUCAO))) {
    console.escrever(
      `O serviço ${SERVICO_DO_POSTGRES_DA_PRODUCAO} não existe: configure o reinício do PostgreSQL da produção pelo runbook.`,
    );
  }
  for (const pasta of [pastas.producao.logs, pastas.teste.logs, pastas.servicos]) {
    await mkdir(pasta, { recursive: true });
  }
  const { caddy } = ferramentasDaProducao(pastas);
  for (const servico of ['api-producao', 'api-teste', 'coletor', 'proxy'] as const) {
    await servicos.registrar(definicaoDoServico(servico, pastas.raiz, { node: dep.node, caddy }));
  }
  const estado = estadoDa(respostas, versao);
  await configurarProxy({ estado, executar, servicos, caddy });
  await abrirPortasDoProxy(executar);
  for (const servico of [SERVICOS.producao, SERVICOS.teste, SERVICOS.coletor]) {
    await servicos.iniciar(servico);
  }
  // Na retomada, o atalho que já existe fica como está, e o Grafite.cmd e o ícone são os da versão.
  await instalarAtalhoDoMenu({ raiz: pastas.raiz, pastaDaVersao, atalhoDoMenu: dep.atalhoDoMenu });

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
  await copyFile(join(pastaDaVersao, 'grafite.ps1'), pastas.lancador);
  await rm(pastas.instalacao, { force: true });

  console.escrever(`Grafite ${versao} instalado em ${pastas.raiz}.`);
  console.escrever(
    `  Produção: ${estado.ambientes.producao.enderecos.map((e) => `https://${e}`).join(', ')}`,
  );
  console.escrever(
    `  Teste: ${estado.ambientes.teste.enderecos.map((e) => `https://${e}`).join(', ')} (vazio até grafite preparar-teste)`,
  );
  if (raizDaAc.raiz !== undefined) {
    console.escrever(
      '  Distribua o certificado raiz às máquinas e aos celulares: grafite proxy raiz <pasta>.',
    );
  }
  console.escrever(CADASTRE_AS_FAIXAS);
  console.escrever(
    '  O e-mail só sai depois de configurado: grafite email configurar --smtp <endereço> --remetente "Grafite <grafite@empresa.com.br>".',
  );
  console.escrever('  A operação do dia a dia abre pelo atalho "Grafite" da área de trabalho.');
}
