// A atualização e a volta (spec operacao-servicos, "Atualização pelo teste antes da produção" e
// "Volta à versão anterior"; design do F2d, decisão 7). O pacote é conferido pelo hash antes de tudo
// e preparado no servidor uma vez só; o mesmo pacote passa pelo teste e depois pela produção.
// - Teste: parar o app, migrar o banco com a versão nova, passar a anterior à versão de antes e a
//   atual à nova, iniciar e conferir a saúde.
// - Produção: só a versão que roda no teste, com saúde e com todas as migrations dela no banco do
//   teste. Antes de mudar, o backup conferido e o nome do banco digitado; depois, parar o coletor e
//   o app, migrar, passar à versão, iniciar o app, conferir a saúde e iniciar o coletor.
// - Volta: troca a atual e a anterior, sem migrations, porque toda mudança de estrutura acrescenta
//   antes de remover (spec mestre, seção 10.6).
// Uma falha depois da parada deixa os serviços parados, com o erro e o runbook. O fluxo e as regras
// são das duas plataformas (change servidor-linux-com-docker, design, decisões 1 e 8); as versões no
// servidor são a peça de cada uma: o zip desempacotado e as junções no Windows, as imagens e o .env
// do Compose no Linux.
import { type ExecutarProcesso, type FerramentasDoPostgres, separarSenha } from '@grafite/operacao';
import { type ChavesDoPush, completarChaveDoCofre, completarChavesDoPush } from './ambientes.ts';
import type { BackupDoServidor } from './backup.ts';
import { completarConfiguracaoDoColetor, ligarColetor } from './coletor.ts';
import { lerConfigEnv } from './configuracao.ts';
import type { AmbienteInstalado } from './estado.ts';
import { comServicosParados, mensagemDe, vejaNoRunbook } from './falhas.ts';
import { type Instalacao, lerInstalacao, registrarVersao } from './instalacao.ts';
import { BANCOS, NO_SERVIDOR, type Plataforma, PORTAS, SERVICOS } from './layout.ts';
import type { MigracaoDoDiario, PacoteConferido, PlataformaDaInstalacao } from './plataforma.ts';
import { conferirSaude, type Saude } from './saude.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

export interface DependenciasDaAtualizacao {
  raiz: string;
  /** O pacote da versão, com o `.sha256` ao lado: o zip no Windows, o tar no Linux. */
  pacote: string;
  console: Console;
  executar: ExecutarProcesso;
  servicos: Servicos;
  saude: Saude;
  /** As peças da plataforma da instalação, como as versões no servidor. */
  plataforma: PlataformaDaInstalacao;
  /** Uma chave AES-256 nova, em base64, para a chave do cofre que falta. */
  gerarChave: () => string;
  /** Um par novo das chaves do push, para a produção de antes do push. */
  gerarChavesDoPush: () => ChavesDoPush;
}

export interface DependenciasDaProducao extends DependenciasDaAtualizacao {
  /** As ferramentas do PostgreSQL de uma pasta de binários. */
  ferramentas: (pgBin: string) => FerramentasDoPostgres;
  /** O backup da produção da instalação. */
  backup: (instalacao: Instalacao) => BackupDoServidor;
}

export type DependenciasDaVolta = Pick<
  DependenciasDaAtualizacao,
  'raiz' | 'console' | 'servicos' | 'saude' | 'plataforma'
>;

/** Onde o runbook diz o que fazer quando a atualização falha. */
const runbookDaAtualizacao = (plataforma: Plataforma) =>
  vejaNoRunbook('Atualização que falhou', plataforma);

const CHAVES_DO_PUSH_GRAVADAS =
  'As chaves do push foram geradas na configuração da produção: os avisos no celular já podem ser ligados nos Ajustes.';
const CHAVE_DO_COFRE_GRAVADA =
  'A chave mestra do cofre foi gerada e gravada na configuração da produção e do teste. Guarde-a fora do servidor, com a chave dos dois passos (runbook, "Guarda das chaves").';

/** Prepara a versão do pacote conferido no servidor, se ela ainda não estiver lá, e a registra. */
async function prepararVersao(
  { console }: Pick<DependenciasDaAtualizacao, 'console'>,
  instalacao: Instalacao,
  pacote: PacoteConferido,
): Promise<void> {
  console.escrever(await pacote.preparar(instalacao));
  await registrarVersao(instalacao, pacote.versao);
}

/** Apaga as versões que nenhum ambiente usa, depois de uma atualização com saúde. */
async function limparVersoes(dep: DependenciasDaAtualizacao, instalacao: Instalacao) {
  for (const linha of await dep.plataforma.limparVersoes(instalacao)) dep.console.escrever(linha);
}

/** A conexão do dono das tabelas do ambiente, do config.env dele. */
async function urlDoDono({ pastas }: Instalacao, ambiente: AmbienteInstalado): Promise<string> {
  const { GRAFITE_DATABASE_URL_MIGRACOES: url } = await lerConfigEnv(pastas[ambiente].configEnv);
  if (url === undefined) {
    throw new Error(`Falta GRAFITE_DATABASE_URL_MIGRACOES em ${pastas[ambiente].configEnv}.`);
  }
  return url;
}

export async function atualizarTeste(dep: DependenciasDaAtualizacao): Promise<void> {
  const { console, servicos, saude, plataforma } = dep;
  const { comando, pacote: nomeDoPacote } = NO_SERVIDOR[plataforma.nome];
  // O hash vem antes de tudo, mesmo da leitura da instalação.
  const pacote = await plataforma.conferirPacote(dep.pacote);
  const { versao } = pacote;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  await prepararVersao(dep, instalacao, pacote);
  const urlDono = await urlDoDono(instalacao, 'teste');

  await comServicosParados(
    servicos,
    [SERVICOS.teste],
    `O app do teste ficou parado. ${runbookDaAtualizacao(plataforma.nome)}`,
    async () => {
      await plataforma.scripts(instalacao, versao).migrarBanco(urlDono);
      await plataforma.passarParaAVersao(instalacao, 'teste', versao);
      // A chave do cofre, uma vez só, nos dois ambientes: a produção a encontra pronta.
      const gravada = await completarChaveDoCofre({
        executar: dep.executar,
        pastas: instalacao.pastas,
        gerarChave: dep.gerarChave,
      });
      if (gravada) console.escrever(CHAVE_DO_COFRE_GRAVADA);
      await servicos.iniciar(SERVICOS.teste);
      conferirSaude(
        await saude.local(PORTAS.teste),
        { versao, ambiente: 'teste' },
        'O app do teste',
      );
    },
  );
  await limparVersoes(dep, instalacao);
  console.escrever(
    `O teste roda a versão ${versao}. Para levá-la à produção: ${comando} atualizar ${nomeDoPacote} --ambiente producao.`,
  );
}

/** As migrations do diário que faltam no banco da conexão do dono, pela etiqueta. */
async function migracoesQueFaltam(
  ferramentas: FerramentasDoPostgres,
  diario: MigracaoDoDiario[],
  urlDono: string,
): Promise<string[]> {
  const { url, senha } = separarSenha(urlDono);
  const { codigo, saida, erro } = await ferramentas.executar(
    'psql',
    [
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      `--dbname=${url}`,
      '--command=select created_at from drizzle.__drizzle_migrations order by created_at',
    ],
    { senha },
  );
  if (codigo !== 0) {
    throw new Error(
      `Não foi possível ler as migrations do banco do teste: ${(erro || saida).trim()}`,
    );
  }
  const aplicadas = new Set(
    saida
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha !== '')
      .map(Number),
  );
  return diario.filter(({ when }) => !aplicadas.has(when)).map(({ tag }) => tag);
}

/** A guarda da produção: o teste roda a versão, com saúde, e tem todas as migrations dela. */
async function conferirVersaoNoTeste(
  dep: DependenciasDaProducao,
  instalacao: Instalacao,
  versao: string,
): Promise<void> {
  const { comando, pacote } = NO_SERVIDOR[dep.plataforma.nome];
  const rodeAntes = `Rode antes ${comando} atualizar ${pacote} --ambiente teste.`;
  const noTeste = instalacao.estado.ambientes.teste.atual;
  if (noTeste !== versao) {
    throw new Error(
      `A ${versao} precisa rodar no teste primeiro: o teste roda a ${noTeste ?? 'nenhuma'}. ${rodeAntes}`,
    );
  }
  let resposta: Awaited<ReturnType<Saude['local']>>;
  try {
    resposta = await dep.saude.local(PORTAS.teste);
  } catch (erro) {
    throw new Error(
      `A ${versao} precisa rodar no teste, com saúde, antes da produção: ${mensagemDe(erro)}`,
    );
  }
  conferirSaude(resposta, { versao, ambiente: 'teste' }, 'O app do teste');
  const faltam = await migracoesQueFaltam(
    dep.ferramentas(instalacao.estado.pgBin),
    await dep.plataforma.diario(instalacao, versao),
    await urlDoDono(instalacao, 'teste'),
  );
  if (faltam.length > 0) {
    throw new Error(
      `O banco do teste não tem todas as migrations da ${versao}: ${faltam.length === 1 ? 'falta' : 'faltam'} ${faltam.join(', ')}. ${rodeAntes}`,
    );
  }
}

export async function atualizarProducao(dep: DependenciasDaProducao): Promise<void> {
  const { console, servicos, saude, plataforma } = dep;
  const pacote = await plataforma.conferirPacote(dep.pacote);
  const { versao } = pacote;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  await conferirVersaoNoTeste(dep, instalacao, versao);
  await prepararVersao(dep, instalacao, pacote);
  const urlDono = await urlDoDono(instalacao, 'producao');

  console.escrever('Fazendo o backup da produção, antes de mudar qualquer coisa.');
  const backup = await dep.backup(instalacao).fazer();
  console.escrever(`Backup ${backup.nome} feito e conferido em ${backup.pasta}.`);
  await console.confirmarDigitado(
    `Para atualizar a produção para a ${versao}, digite o nome do banco da produção`,
    BANCOS.producao.nome,
  );

  await comServicosParados(
    servicos,
    [SERVICOS.coletor, SERVICOS.producao],
    `O app e o coletor da produção ficaram parados, e o backup de antes da atualização está em ${backup.pasta}. ${runbookDaAtualizacao(plataforma.nome)}`,
    async () => {
      const scripts = plataforma.scripts(instalacao, versao);
      await scripts.migrarBanco(urlDono);
      await plataforma.passarParaAVersao(instalacao, 'producao', versao);
      // As chaves do push, uma vez só, antes de o app da produção iniciar com elas.
      const pushGravado = await completarChavesDoPush({
        executar: dep.executar,
        pastas: instalacao.pastas,
        gerarChavesDoPush: dep.gerarChavesDoPush,
      });
      if (pushGravado) console.escrever(CHAVES_DO_PUSH_GRAVADAS);
      await servicos.iniciar(SERVICOS.producao);
      conferirSaude(
        await saude.local(PORTAS.producao),
        { versao, ambiente: 'producao' },
        'O app da produção',
      );
      // O coletor ligado à organização que opera o servidor, se ainda não estiver.
      const variaveisDaProducao = await lerConfigEnv(instalacao.pastas.producao.configEnv);
      const endereco = variaveisDaProducao.GRAFITE_ORGANIZACAO_OPERADORA ?? '';
      const token = await completarConfiguracaoDoColetor({
        executar: dep.executar,
        pastas: instalacao.pastas,
        endereco,
      });
      const linhas = await ligarColetor({ scripts, variaveisDaProducao, token, endereco });
      for (const linha of linhas) console.escrever(linha);
      await servicos.iniciar(SERVICOS.coletor);
      for (const servico of plataforma.servicosDaProducao) await servicos.iniciar(servico);
    },
  );
  await limparVersoes(dep, instalacao);
  // O atalho do menu que falta não desfaz a atualização, que já terminou com saúde.
  try {
    for (const linha of await plataforma.atalhoDoMenu(instalacao, versao)) console.escrever(linha);
  } catch (erro) {
    console.escrever(
      `A produção foi atualizada, mas o atalho do menu não foi criado: ${mensagemDe(erro)} A próxima atualização tenta de novo.`,
    );
  }
  console.escrever(
    `A produção roda a versão ${versao}. O backup de antes da atualização ficou em ${backup.pasta}.`,
  );
}

export async function voltar(dep: DependenciasDaVolta, ambiente: AmbienteInstalado): Promise<void> {
  const { servicos, saude, plataforma } = dep;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  const { atual, anterior } = instalacao.estado.ambientes[ambiente];
  const producao = ambiente === 'producao';
  const nome = producao ? 'A produção' : 'O teste';
  if (anterior === null) {
    throw new Error(`${nome} não tem versão anterior: ela só existe depois de uma atualização.`);
  }
  if (producao) {
    await dep.console.confirmarDigitado(
      `Para voltar a produção à ${anterior}, digite o nome do banco da produção`,
      BANCOS.producao.nome,
    );
  }
  await comServicosParados(
    servicos,
    producao ? [SERVICOS.coletor, SERVICOS.producao] : [SERVICOS.teste],
    `${producao ? 'O app e o coletor da produção ficaram parados.' : 'O app do teste ficou parado.'} ${runbookDaAtualizacao(plataforma.nome)}`,
    async () => {
      await plataforma.trocarAtualEAnterior(instalacao, ambiente);
      await servicos.iniciar(producao ? SERVICOS.producao : SERVICOS.teste);
      conferirSaude(
        await saude.local(PORTAS[ambiente]),
        { versao: anterior, ambiente },
        producao ? 'O app da produção' : 'O app do teste',
      );
      if (producao) {
        await servicos.iniciar(SERVICOS.coletor);
        for (const servico of plataforma.servicosDaProducao) await servicos.iniciar(servico);
      }
    },
  );
  // O atalho segue a produção: a volta devolve o Grafite.cmd da versão de antes, como o do menu
  // numa versão sem o painel. O que falta não desfaz a volta, que já terminou com saúde.
  if (producao) {
    try {
      for (const linha of await plataforma.atalhoDoMenu(instalacao, anterior)) {
        dep.console.escrever(linha);
      }
    } catch (erro) {
      dep.console.escrever(
        `A produção voltou, mas o atalho "Grafite" não foi trocado: ${mensagemDe(erro)}`,
      );
    }
  }
  dep.console.escrever(
    `${nome} voltou à ${anterior}. Para ir de novo à ${atual}: ${NO_SERVIDOR[plataforma.nome].comando} voltar --ambiente ${ambiente}.`,
  );
}
