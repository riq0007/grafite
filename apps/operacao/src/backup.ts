// O backup da produção pelo comando de operação (spec backup; design do F2d, decisões 7, 8, 11, 13 e
// 16): com a configuração da produção, o mesmo backup e o mesmo teste de restauração das tarefas da
// API (packages/operacao), registrados em operacao.* como pedidos pelo comando. Antes de a produção
// mudar, o backup é conferido: os hashes de cada parte e a leitura do dump inteiro pelo pg_restore.
// No Linux (change servidor-linux-com-docker, design, decisão 11), a configuração exige a marca em
// cada destino, e o que o comando grava neles, como o root, passa ao usuário dos contêineres, para
// o app fazer os backups seguintes e apagar os antigos.
import { join } from 'node:path';
import {
  backupsProntosNoDestino,
  conferirDump,
  conferirPartes,
  executarBackup,
  executarTesteDeRestauracao,
  type FerramentasDoPostgres,
  FUSO_DO_SERVIDOR,
  lerManifesto,
  type Manifesto,
  pastasNoDestino,
  type ResultadoDoTesteDeRestauracao,
} from '@grafite/operacao';
import pg from 'pg';
import { lerConfigEnv } from './configuracao.ts';
import { mensagemDe } from './falhas.ts';
import type { Instalacao } from './instalacao.ts';

export interface BackupPronto {
  /** O nome do backup, como `2026-10-08T0500Z`. */
  nome: string;
  /** A pasta dele no primeiro destino. */
  pasta: string;
  criadoEm: Date;
}

export interface BackupListado {
  nome: string;
  criadoEm?: Date;
  /** Os bytes das partes. */
  tamanho?: number;
  /** A versão do Grafite que fez o backup. */
  versao?: string;
  /** Por que o manifesto não pôde ser lido. */
  problema?: string;
}

export interface BackupsDoDestino {
  destino: string;
  /** Do mais antigo ao mais novo. */
  backups: BackupListado[];
}

/** Um backup ou um teste de restauração, como o banco da produção o registrou. */
export interface RegistroDoBackup {
  situacao: 'em-andamento' | 'feito' | 'falhou';
  /** O fim; no que ainda roda, o começo. */
  momento: Date;
  erro?: string;
}

export interface RegistrosDoBackup {
  ultimoBackup: RegistroDoBackup | null;
  ultimoTeste: RegistroDoBackup | null;
}

export interface BackupDoServidor {
  /** Faz o backup da produção agora, em todos os destinos, e o devolve conferido. */
  fazer(): Promise<BackupPronto>;
  /** O backup pronto mais novo do primeiro destino, ou `null` sem nenhum. */
  maisNovo(): Promise<BackupPronto | null>;
  /** Confere os hashes das partes e a leitura do dump; recusa o backup que não passa. */
  conferir(pasta: string): Promise<Manifesto>;
  /** Os backups prontos de cada destino. */
  listar(): Promise<BackupsDoDestino[]>;
  /** O teste de restauração do backup mais novo, na instância do teste, com o registro. */
  testar(): Promise<ResultadoDoTesteDeRestauracao>;
  /**
   * O último backup e o último teste de restauração, do banco da produção (change
   * painel-da-operacao, design, decisão 5); sem o banco no ar, a leitura falha.
   */
  registros(): Promise<RegistrosDoBackup>;
}

/** A configuração do backup, do config.env da produção, conferida a cada uso. */
async function lerConfiguracao(instalacao: Instalacao) {
  const caminho = instalacao.pastas.producao.configEnv;
  const env = await lerConfigEnv(caminho);
  const exigir = (nome: string) => {
    const valor = env[nome]?.trim();
    if (!valor) throw new Error(`Falta ${nome} em ${caminho}: o backup não está configurado.`);
    return valor;
  };
  return {
    exigir,
    destinos: () =>
      exigir('GRAFITE_BACKUP_DESTINOS')
        .split(';')
        .map((destino) => destino.trim())
        .filter((destino) => destino !== ''),
    operadora: env.GRAFITE_ORGANIZACAO_OPERADORA?.trim() || undefined,
    exigirMarca: env.GRAFITE_BACKUP_EXIGIR_MARCA === 'sim',
    pastaDaRestauracao: env.GRAFITE_RESTAURACAO_PASTA?.trim() || undefined,
    retencao: () => {
      const [diarios = 7, semanais = 4, mensais = 12] = (env.GRAFITE_BACKUP_RETENCAO ?? '7,4,12')
        .split(',')
        .map(Number);
      return { diarios, semanais, mensais };
    },
  };
}

type Configuracao = Awaited<ReturnType<typeof lerConfiguracao>>;

/** Roda com o pool do papel da aplicação e a organização operadora, que recebe o evento. */
async function comOBanco<T>(
  config: Configuracao,
  fn: (pool: pg.Pool, orgOperadoraId: string | null) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: config.exigir('GRAFITE_DATABASE_URL'), max: 3 });
  try {
    let orgOperadoraId: string | null = null;
    if (config.operadora !== undefined) {
      const { rows } = await pool.query<{ org: string | null }>(
        'select app.organizacao_do_endereco($1) as org',
        [config.operadora],
      );
      orgOperadoraId = rows[0]?.org ?? null;
    }
    return await fn(pool, orgOperadoraId);
  } finally {
    await pool.end();
  }
}

export function backupDoServidor({
  instalacao,
  ferramentas,
  agora = () => new Date(),
  espacoLivre,
  acertarDono = async () => {},
}: {
  instalacao: Instalacao;
  ferramentas: FerramentasDoPostgres;
  agora?: () => Date;
  /** Os bytes livres onde a instância do teste grava (padrão: o disco da pasta de dados dela). */
  espacoLivre?: () => Promise<number>;
  /** Acerta o dono da pasta dos backups em cada destino, como a peça da plataforma. */
  acertarDono?: (pasta: string) => Promise<void>;
}): BackupDoServidor {
  async function conferir(pasta: string): Promise<Manifesto> {
    const manifesto = await lerManifesto(pasta);
    const problemas = await conferirPartes(pasta, manifesto);
    if (problemas.length > 0) {
      throw new Error(`O backup em ${pasta} não passou na conferência: ${problemas.join(' ')}`);
    }
    await conferirDump(ferramentas, join(pasta, 'banco.dump'));
    return manifesto;
  }

  return {
    conferir,

    async fazer() {
      const config = await lerConfiguracao(instalacao);
      const destinos = config.destinos();
      const feito = await comOBanco(config, (pool, orgOperadoraId) =>
        executarBackup({
          urlBackup: config.exigir('GRAFITE_BACKUP_URL'),
          ferramentas,
          pastaDosArquivos: config.exigir('GRAFITE_ARQUIVOS_PASTA'),
          destinos,
          retencao: config.retencao(),
          exigirMarca: config.exigirMarca,
          fuso: FUSO_DO_SERVIDOR,
          versao: instalacao.estado.ambientes.producao.atual ?? 'desconhecida',
          agora,
          pool,
          orgOperadoraId,
          pedidoPor: 'comando',
        }),
      );
      for (const destino of destinos) {
        // Num compartilhamento, o dono vem das opções da montagem, e o acerto pode ser recusado.
        await acertarDono(pastasNoDestino(destino, feito.pasta).base).catch(() => {});
      }
      const pasta = pastasNoDestino(destinos[0] ?? '', feito.pasta).pronta;
      await conferir(pasta);
      return { nome: feito.pasta, pasta, criadoEm: new Date(feito.manifesto.criadoEm) };
    },

    async maisNovo() {
      const [primeiro] = (await lerConfiguracao(instalacao)).destinos();
      if (primeiro === undefined) return null;
      const nome = (await backupsProntosNoDestino(primeiro)).at(-1);
      if (nome === undefined) return null;
      const pasta = pastasNoDestino(primeiro, nome).pronta;
      const manifesto = await lerManifesto(pasta);
      return { nome, pasta, criadoEm: new Date(manifesto.criadoEm) };
    },

    async listar() {
      const destinos = (await lerConfiguracao(instalacao)).destinos();
      const lista: BackupsDoDestino[] = [];
      for (const destino of destinos) {
        const backups: BackupListado[] = [];
        for (const nome of await backupsProntosNoDestino(destino)) {
          try {
            const manifesto = await lerManifesto(pastasNoDestino(destino, nome).pronta);
            backups.push({
              nome,
              criadoEm: new Date(manifesto.criadoEm),
              tamanho: Object.values(manifesto.partes).reduce((soma, p) => soma + p.tamanho, 0),
              versao: manifesto.versao,
            });
          } catch (erro) {
            backups.push({ nome, problema: mensagemDe(erro) });
          }
        }
        lista.push({ destino, backups });
      }
      return lista;
    },

    async registros() {
      const config = await lerConfiguracao(instalacao);
      return comOBanco(config, async (pool) => {
        const ultimo = async (tabela: string) => {
          const { rows } = await pool.query<{
            situacao: RegistroDoBackup['situacao'];
            momento: Date;
            erro: string | null;
          }>(
            `select situacao, coalesce(terminado_em, iniciado_em) as momento, erro from operacao.${tabela} order by iniciado_em desc limit 1`,
          );
          const [linha] = rows;
          if (linha === undefined) return null;
          return {
            situacao: linha.situacao,
            momento: linha.momento,
            ...(linha.erro === null ? {} : { erro: linha.erro }),
          };
        };
        return {
          ultimoBackup: await ultimo('backups'),
          ultimoTeste: await ultimo('testes_de_restauracao'),
        };
      });
    },

    async testar() {
      const config = await lerConfiguracao(instalacao);
      return comOBanco(config, (pool, orgOperadoraId) =>
        executarTesteDeRestauracao({
          ferramentas,
          urlRestauracao: config.exigir('GRAFITE_RESTAURACAO_URL'),
          destinos: config.destinos(),
          ...(config.pastaDaRestauracao === undefined
            ? {}
            : { pastaDaInstancia: config.pastaDaRestauracao }),
          pool,
          orgOperadoraId,
          ...(espacoLivre === undefined ? {} : { espacoLivre }),
        }),
      );
    },
  };
}
