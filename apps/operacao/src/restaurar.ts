// `grafite restaurar <backup> --ambiente producao` (spec backup, "Restauração da produção"; design
// do F2d, decisão 16). Um engano na restauração não pode custar o que estava no ar:
// 1. o backup é conferido (os hashes e o pg_restore --list), e a senha do postgres e o nome do
//    banco são pedidos, antes de qualquer mudança;
// 2. o coletor e o app param;
// 3. o dump é restaurado num banco novo, as linhas são conferidas com o manifesto e o banco novo
//    recebe as migrations da versão em uso, tudo sem tocar no banco da produção;
// 4. só então o banco da produção é guardado como `grafite_antes_AAAAMMDDHHmm` e o restaurado fica
//    no lugar dele, e os arquivos do backup trocam de lugar com os de antes, que também ficam;
// 5. o app inicia com a saúde conferida, e o coletor inicia.
// Uma falha antes da troca não muda nada; depois dela, a troca é desfeita. Os serviços ficam
// parados nos dois casos. O banco e os arquivos de antes ficam até quem opera apagá-los pelo runbook.
// O fluxo é das duas plataformas (change servidor-linux-com-docker, design, decisão 1): a peça da
// plataforma dá o superusuário da produção, as migrations e o dono dos arquivos restaurados.
import { basename, isAbsolute, join } from 'node:path';
import {
  compararLinhas,
  type ExecutarProcesso,
  type FerramentasDoPostgres,
  pastasNoDestino,
  separarSenha,
} from '@grafite/operacao';
import type { BackupDoServidor } from './backup.ts';
import { rodarSql, sqlDoBanco } from './banco.ts';
import { lerConfigEnv } from './configuracao.ts';
import {
  contarLinhasNoBanco,
  prepararArquivos,
  restaurarEmBancoNovo,
  trocarArquivos,
  trocarBancos,
} from './copia.ts';
import { comServicosParados, mensagemDe, vejaNoRunbook } from './falhas.ts';
import { type Instalacao, lerInstalacao } from './instalacao.ts';
import { BANCOS, NO_SERVIDOR, PORTAS, SERVICOS } from './layout.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { conferirSaude, type Saude } from './saude.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

export interface DependenciasDaRestauracao {
  raiz: string;
  /** O backup: a pasta dele, ou o nome, como 2026-10-07T0500Z, no primeiro destino. */
  backup: string;
  console: Console;
  executar: ExecutarProcesso;
  ferramentas: (pgBin: string) => FerramentasDoPostgres;
  servicos: Servicos;
  saude: Saude;
  backupDoServidor: (instalacao: Instalacao) => BackupDoServidor;
  /** As peças da plataforma: o superusuário da produção, as migrations e o dono dos arquivos. */
  plataforma: PlataformaDaInstalacao;
  agora: () => Date;
}

/** O momento nos nomes do que fica guardado, em UTC: AAAAMMDDHHmm. */
const carimbo = (momento: Date) => momento.toISOString().slice(0, 16).replace(/[-T:]/g, '');

/** A pasta do backup pedido: o caminho dado, ou o nome no primeiro destino da produção. */
async function pastaDoBackup(pedido: string, { pastas }: Instalacao): Promise<string> {
  if (isAbsolute(pedido)) return pedido;
  const { GRAFITE_BACKUP_DESTINOS = '' } = await lerConfigEnv(pastas.producao.configEnv);
  const [primeiro] = GRAFITE_BACKUP_DESTINOS.split(';')
    .map((destino) => destino.trim())
    .filter((destino) => destino !== '');
  if (primeiro === undefined) {
    throw new Error('Sem destinos de backup na configuração: diga a pasta do backup.');
  }
  return pastasNoDestino(primeiro, pedido).pronta;
}

const senhaDa = (url: string | undefined) => (url === undefined ? '' : separarSenha(url).senha);

/** A conexão do mesmo papel com outro banco. */
function comOBanco(url: string, banco: string): string {
  const conexao = new URL(url);
  conexao.pathname = `/${banco}`;
  return conexao.toString();
}

export async function restaurarProducao(dep: DependenciasDaRestauracao): Promise<void> {
  const { console, servicos, plataforma } = dep;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  const { estado, pastas } = instalacao;
  const versao = estado.ambientes.producao.atual;
  if (versao === null) throw new Error('A produção não tem nenhuma versão instalada.');

  // 1. Conferir, pedir a senha e o nome, sem mudar nada.
  const pasta = await pastaDoBackup(dep.backup, instalacao);
  const nome = basename(pasta);
  const manifesto = await dep.backupDoServidor(instalacao).conferir(pasta);
  console.escrever(
    `Backup ${nome} conferido: feito em ${manifesto.criadoEm}, pela versão ${manifesto.versao}.`,
  );
  const ferramentas = dep.ferramentas(estado.pgBin);
  const superusuario = await plataforma.superusuarioDaProducao(instalacao, console);
  await console.confirmarDigitado(
    `Para restaurar a produção a partir do backup ${nome}, digite o nome do banco da produção`,
    BANCOS.producao.nome,
  );

  const configuracao = await lerConfigEnv(pastas.producao.configEnv);
  const urlDono = configuracao.GRAFITE_DATABASE_URL_MIGRACOES ?? '';
  const momento = carimbo(dep.agora());
  const producao = BANCOS.producao.nome;
  const restaurando = `${producao}_restaurando`;
  const guardado = `${producao}_antes_${momento}`;
  const { arquivos } = pastas.producao;
  const arquivosDeAntes = `${arquivos}-antes-${momento}`;

  await comServicosParados(
    servicos,
    [SERVICOS.coletor, SERVICOS.producao],
    `O app e o coletor da produção ficaram parados. ${vejaNoRunbook('Restauração que falhou', plataforma.nome)}`,
    async () => {
      let bancoTrocado = false;
      let arquivosTrocados = false;
      try {
        // 3. O banco novo, conferido e na versão em uso, sem tocar no da produção.
        await restaurarEmBancoNovo(
          ferramentas,
          superusuario,
          restaurando,
          join(pasta, 'banco.dump'),
        );
        const diferencas = compararLinhas(
          await contarLinhasNoBanco(ferramentas, superusuario, restaurando),
          manifesto.linhas,
        );
        if (diferencas.length > 0) {
          throw new Error(
            `As linhas restauradas não batem com o manifesto: ${diferencas.join(' ')}`,
          );
        }
        await plataforma.scripts(instalacao, versao).migrarBanco(comOBanco(urlDono, restaurando));
        const novos = await prepararArquivos(join(pasta, 'arquivos.zip'), arquivos);

        // 4. A troca, guardando o banco e os arquivos de antes.
        await trocarBancos(ferramentas, superusuario, {
          atual: producao,
          novo: restaurando,
          guardarComo: guardado,
        });
        bancoTrocado = true;
        await rodarSql(
          ferramentas,
          superusuario,
          sqlDoBanco(producao, {
            dono: senhaDa(urlDono),
            app: senhaDa(configuracao.GRAFITE_DATABASE_URL),
            backup: senhaDa(configuracao.GRAFITE_BACKUP_URL),
          }),
        );
        await trocarArquivos(arquivos, novos, { guardarAntesEm: arquivosDeAntes });
        arquivosTrocados = true;
        await plataforma.acertarDono(arquivos);

        // 5. A partida, com a saúde.
        await servicos.iniciar(SERVICOS.producao);
        conferirSaude(
          await dep.saude.local(PORTAS.producao),
          { versao, ambiente: 'producao' },
          'O app da produção',
        );
        await servicos.iniciar(SERVICOS.coletor);
      } catch (erro) {
        throw new Error(
          `${mensagemDe(erro)}\n${await desfazer({ bancoTrocado, arquivosTrocados })}`,
          { cause: erro },
        );
      }
    },
  );

  /** Desfaz a troca já feita e diz como ficou a produção. */
  async function desfazer({
    bancoTrocado,
    arquivosTrocados,
  }: {
    bancoTrocado: boolean;
    arquivosTrocados: boolean;
  }): Promise<string> {
    if (!bancoTrocado) {
      return 'Nada foi trocado: o banco e os arquivos da produção continuam os de antes.';
    }
    const restaurado = `${producao}_restaurado_${momento}`;
    try {
      if (arquivosTrocados) {
        await trocarArquivos(arquivos, arquivosDeAntes, {
          guardarAntesEm: `${arquivos}-restaurados-${momento}`,
        });
      }
      await trocarBancos(ferramentas, superusuario, {
        atual: producao,
        novo: guardado,
        guardarComo: restaurado,
      });
    } catch (erro) {
      return `A troca não pôde ser desfeita (${mensagemDe(erro)}): o banco de antes está em ${guardado}, e os arquivos de antes, em ${arquivosDeAntes}.`;
    }
    return `A troca foi desfeita: o banco e os arquivos da produção voltaram a ser os de antes, e os restaurados ficaram como ${restaurado}.`;
  }

  console.escrever(`A produção foi restaurada do backup ${nome}.`);
  console.escrever(
    `O banco de antes ficou como ${guardado}, e os arquivos de antes, em ${arquivosDeAntes}. Confira a produção e apague os dois como diz "Depois da restauração" no runbook (${NO_SERVIDOR[plataforma.nome].runbook}).`,
  );
}
