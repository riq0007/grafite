// `grafite preparar-teste` (spec operacao-servicos, "Teste com a cópia da produção"; design do F2d,
// decisão 8): os dados do teste passam a ser a cópia da produção.
// 1. O backup da produção das últimas 24 h, conferido, ou um novo.
// 2. O nome do banco do teste digitado.
// 3. Parar o app do teste.
// 4. Restaurar o banco, com o superusuário da instância do teste, num banco novo que substitui o do
//    teste, e os arquivos, na pasta do teste.
// 5. Trocar os endereços pelos do mapa do teste; os que não estão nele saem, então o teste nunca
//    atende um endereço da produção. A organização que fica sem endereço é avisada pelo nome.
// 6. Aplicar as migrations da versão do teste, iniciar e conferir a saúde.
// Nada vai do teste para a produção: a produção só é lida, pelo backup. O fluxo é das duas
// plataformas (change servidor-linux-com-docker, design, decisão 1): o superusuário do teste é o da
// conexão da restauração, e a peça da plataforma dá as migrations e o dono dos arquivos.
import { join } from 'node:path';
import { type ExecutarProcesso, type FerramentasDoPostgres, separarSenha } from '@grafite/operacao';
import type { BackupDoServidor, BackupPronto } from './backup.ts';
import { rodarSql, sqlDoBanco } from './banco.ts';
import { lerConfigEnv } from './configuracao.ts';
import {
  restaurarArquivos,
  restaurarComoBanco,
  type TrocaDeEnderecos,
  trocarEnderecos,
} from './copia.ts';
import { comServicosParados, vejaNoRunbook } from './falhas.ts';
import { type Instalacao, lerInstalacao } from './instalacao.ts';
import { BANCOS, PORTAS, SERVICOS } from './layout.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { conferirSaude, type Saude } from './saude.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

export interface DependenciasDaPreparacao {
  raiz: string;
  console: Console;
  executar: ExecutarProcesso;
  ferramentas: (pgBin: string) => FerramentasDoPostgres;
  servicos: Servicos;
  saude: Saude;
  backup: (instalacao: Instalacao) => BackupDoServidor;
  /** As peças da plataforma da instalação: as migrations da versão do teste e o dono dos arquivos. */
  plataforma: PlataformaDaInstalacao;
  agora: () => Date;
}

/** Até quanto tempo um backup serve para a cópia, sem fazer outro. */
const VALIDADE_DO_BACKUP = 24 * 60 * 60 * 1000;

const senhaDa = (url: string | undefined, nome: string, arquivo: string) => {
  if (url === undefined) throw new Error(`Falta ${nome} em ${arquivo}.`);
  return separarSenha(url).senha;
};

/** O backup das últimas 24 h, conferido, ou um novo. */
async function backupParaACopia(
  { console, agora }: DependenciasDaPreparacao,
  backup: BackupDoServidor,
): Promise<BackupPronto> {
  const recente = await backup.maisNovo();
  if (recente !== null && agora().getTime() - recente.criadoEm.getTime() <= VALIDADE_DO_BACKUP) {
    await backup.conferir(recente.pasta);
    return recente;
  }
  console.escrever('Não há backup da produção das últimas 24 h: fazendo um agora.');
  return backup.fazer();
}

export async function prepararTeste(dep: DependenciasDaPreparacao): Promise<void> {
  const { console, servicos, plataforma } = dep;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  const { estado, pastas } = instalacao;
  const versao = estado.ambientes.teste.atual;
  if (versao === null) throw new Error('O teste não tem nenhuma versão instalada.');

  const backup = await backupParaACopia(dep, dep.backup(instalacao));
  console.escrever(`A cópia vem do backup ${backup.nome}, em ${backup.pasta}.`);
  await console.confirmarDigitado(
    'Para trocar os dados do teste pela cópia da produção, digite o nome do banco do teste',
    BANCOS.teste.nome,
  );

  const producao = await lerConfigEnv(pastas.producao.configEnv);
  const teste = await lerConfigEnv(pastas.teste.configEnv);
  // O superusuário da instância do teste, pela conexão com que a produção restaura nela.
  const restauracao = new URL(
    producao.GRAFITE_RESTAURACAO_URL ?? `postgres://postgres@127.0.0.1:${BANCOS.teste.porta}`,
  );
  const superusuario = {
    host: restauracao.hostname,
    porta: Number(restauracao.port || BANCOS.teste.porta),
    senha: senhaDa(
      producao.GRAFITE_RESTAURACAO_URL,
      'GRAFITE_RESTAURACAO_URL',
      pastas.producao.configEnv,
    ),
  };
  const senhas = {
    dono: senhaDa(
      teste.GRAFITE_DATABASE_URL_MIGRACOES,
      'GRAFITE_DATABASE_URL_MIGRACOES',
      pastas.teste.configEnv,
    ),
    app: senhaDa(teste.GRAFITE_DATABASE_URL, 'GRAFITE_DATABASE_URL', pastas.teste.configEnv),
  };
  const ferramentas = dep.ferramentas(estado.pgBin);
  let troca: TrocaDeEnderecos = { semEndereco: [], ausentes: [] };

  await comServicosParados(
    servicos,
    [SERVICOS.teste],
    `O app do teste ficou parado. ${vejaNoRunbook('Preparação do teste que falhou', plataforma.nome)}`,
    async () => {
      await restaurarComoBanco(
        ferramentas,
        superusuario,
        BANCOS.teste.nome,
        join(backup.pasta, 'banco.dump'),
      );
      // As permissões do banco não vêm no dump; a cópia volta a ter as do teste.
      await rodarSql(ferramentas, superusuario, sqlDoBanco(BANCOS.teste.nome, senhas));
      await restaurarArquivos(join(backup.pasta, 'arquivos.zip'), pastas.teste.arquivos);
      await plataforma.acertarDono(pastas.teste.arquivos);
      troca = await trocarEnderecos(
        ferramentas,
        superusuario,
        BANCOS.teste.nome,
        estado.mapaDoTeste,
      );
      await plataforma
        .scripts(instalacao, versao)
        .migrarBanco(teste.GRAFITE_DATABASE_URL_MIGRACOES ?? '');
      await servicos.iniciar(SERVICOS.teste);
      conferirSaude(
        await dep.saude.local(PORTAS.teste),
        { versao, ambiente: 'teste' },
        'O app do teste',
      );
    },
  );

  for (const nome of troca.semEndereco) {
    console.escrever(
      `A organização ${nome} ficou sem endereço no teste: nenhum endereço dela está no mapa do teste (operacao.json).`,
    );
  }
  for (const endereco of troca.ausentes) {
    console.escrever(
      `O endereço ${endereco} do mapa do teste não é de nenhuma organização da produção.`,
    );
  }
  console.escrever(
    `O teste tem a cópia da produção do backup ${backup.nome}, com a versão ${versao}.`,
  );
}
