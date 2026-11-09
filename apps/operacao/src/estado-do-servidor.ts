// O estado do servidor em dados (change painel-da-operacao, design, decisão 5; spec
// painel-da-operacao, "Estado do servidor no painel"), para a tela principal do painel. Ele junta:
// - os serviços da declaração, com o estado de cada um;
// - as versões de cada ambiente, do operacao.json;
// - o último backup de cada destino, pelos manifestos, e o último backup e o último teste de
//   restauração do banco da produção, ou "sem informação" com ele parado;
// - o vencimento do certificado que o proxy dá ao primeiro endereço da produção;
// - o espaço livre no disco da instalação;
// - os avisos, em texto: o serviço parado, o backup com falha ou antigo, o certificado perto de
//   vencer e o disco quase cheio.
// Cada parte que falha fica sem informação, e o resto aparece: o painel abre com o Grafite parado.
import { statfs } from 'node:fs/promises';
import { connect } from 'node:tls';
import type { BackupDoServidor, RegistroDoBackup } from './backup.ts';
import type { AmbienteInstalado, CertificadoDaInstalacao } from './estado.ts';
import { lerInstalacao } from './instalacao.ts';
import {
  type Plataforma,
  SERVICOS_NO_LINUX,
  type ServicoDaInstalacao,
  servicosDaInstalacao,
} from './layout.ts';
import type { EstadoDoServico, Servicos } from './windows/servicos.ts';

export interface PecasDoEstado {
  raiz: string;
  plataforma: { nome: Plataforma; nomeDoServico(id: string): string };
  servicos: Servicos;
  backup: Pick<BackupDoServidor, 'listar' | 'registros'>;
  /** O vencimento do certificado que o proxy dá ao endereço. */
  vencimentoDoCertificado(endereco: string): Promise<Date>;
  /** O espaço do disco de uma pasta, em bytes. */
  disco(pasta: string): Promise<{ livre: number; total: number }>;
  agora(): Date;
  /** A declaração dos serviços; sem ela, a da instalação. */
  declaracao?: readonly ServicoDaInstalacao[];
}

export interface RegistroNoEstado {
  situacao: RegistroDoBackup['situacao'];
  momento: string;
  erro?: string;
}

export interface EstadoDoServidor {
  plataforma: Plataforma;
  servicos: {
    id: string;
    nome: string;
    /** O nome do serviço na plataforma: o do Windows ou o do Compose. */
    nomeNaPlataforma: string;
    ambiente: AmbienteInstalado | null;
    ligadoPeloAmbiente: boolean;
    estado: EstadoDoServico;
  }[];
  ambientes: Record<
    AmbienteInstalado,
    { atual: string | null; anterior: string | null; enderecos: string[] }
  >;
  backups: {
    destino: string;
    ultimo: { nome: string; momento: string | null; versao?: string } | null;
  }[];
  /** O último backup pelo banco da produção, ou sem informação com ele parado. */
  ultimoBackup: RegistroNoEstado | 'sem-informacao' | null;
  testeDeRestauracao: RegistroNoEstado | 'sem-informacao' | null;
  certificado: CertificadoDaInstalacao & { venceEm: string | null; dias: number | null };
  disco: { livre: number; total: number } | null;
  avisos: string[];
}

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
/** O backup é diário: com mais de 26 horas, o de ontem não saiu. */
const IDADE_DO_BACKUP = 26 * HORA;
const DIAS_DO_CERTIFICADO = 14;
const DISCO_LIVRE = 0.1;

const noEstado = ({ situacao, momento, erro }: RegistroDoBackup): RegistroNoEstado => ({
  situacao,
  momento: momento.toISOString(),
  ...(erro === undefined ? {} : { erro }),
});

/** O resultado da parte, ou `null` quando ela falha. */
const ouNada = <T>(parte: Promise<T>): Promise<T | null> => parte.catch(() => null);

export async function estadoDoServidor(pecas: PecasDoEstado): Promise<EstadoDoServidor> {
  const { estado } = await lerInstalacao(pecas.raiz, pecas.plataforma.nome);
  const agora = pecas.agora();
  // Os serviços da declaração, com o estado de cada um.
  const servicos: EstadoDoServidor['servicos'] = [];
  for (const { id, nome, ambiente, ligadoPeloAmbiente } of pecas.declaracao ??
    servicosDaInstalacao()) {
    const situacao: EstadoDoServico = await pecas.servicos
      .estado(id)
      .catch((): EstadoDoServico => 'ausente');
    servicos.push({
      id,
      nome,
      nomeNaPlataforma: pecas.plataforma.nomeDoServico(id),
      ambiente,
      ligadoPeloAmbiente,
      estado: situacao,
    });
  }

  // Os backups: o último registro do banco e o mais novo de cada destino.
  const registros = await ouNada(pecas.backup.registros());
  const ultimoBackup = registros?.ultimoBackup ?? null;
  const listados = (await ouNada(pecas.backup.listar())) ?? [];
  const backups = listados.map(({ destino, backups: doDestino }) => {
    const ultimo = doDestino.at(-1);
    return {
      destino,
      ultimo:
        ultimo === undefined
          ? null
          : {
              nome: ultimo.nome,
              momento: ultimo.criadoEm?.toISOString() ?? null,
              ...(ultimo.versao === undefined ? {} : { versao: ultimo.versao }),
            },
    };
  });

  // O certificado que o proxy dá ao primeiro endereço da produção.
  const [endereco] = estado.ambientes.producao.enderecos;
  const vence =
    endereco === undefined ? null : await ouNada(pecas.vencimentoDoCertificado(endereco));
  const dias = vence === null ? null : Math.floor((vence.getTime() - agora.getTime()) / DIA);
  const { certificado } = estado;

  // O disco da instalação.
  const disco = await ouNada(pecas.disco(pecas.raiz));

  const semAvisos: Omit<EstadoDoServidor, 'avisos'> = {
    plataforma: pecas.plataforma.nome,
    servicos,
    ambientes: {
      producao: {
        atual: estado.ambientes.producao.atual,
        anterior: estado.ambientes.producao.anterior,
        enderecos: estado.ambientes.producao.enderecos,
      },
      teste: {
        atual: estado.ambientes.teste.atual,
        anterior: estado.ambientes.teste.anterior,
        enderecos: estado.ambientes.teste.enderecos,
      },
    },
    backups,
    ultimoBackup:
      registros === null ? 'sem-informacao' : ultimoBackup === null ? null : noEstado(ultimoBackup),
    testeDeRestauracao:
      registros === null
        ? 'sem-informacao'
        : registros.ultimoTeste === null
          ? null
          : noEstado(registros.ultimoTeste),
    certificado: { ...certificado, venceEm: vence?.toISOString() ?? null, dias },
    disco,
  };
  return { ...semAvisos, avisos: avisosDoEstado(semAvisos, agora) };
}

/**
 * Os avisos do estado, em texto, nesta ordem: o serviço parado, o backup com falha ou antigo, o
 * destino sem o backup mais novo, o certificado perto de vencer e o disco quase cheio. O servidor
 * simulado da página usa as mesmas regras.
 */
export function avisosDoEstado(estado: Omit<EstadoDoServidor, 'avisos'>, agora: Date): string[] {
  const avisos: string[] = [];
  for (const { nome, estado: situacao } of estado.servicos) {
    if (situacao === 'parado') avisos.push(`O ${nome} está parado.`);
    if (situacao === 'ausente') avisos.push(`O ${nome} não está registrado neste servidor.`);
  }

  const { ultimoBackup, backups } = estado;
  if (typeof ultimoBackup === 'object' && ultimoBackup?.situacao === 'falhou') {
    avisos.push(
      `O último backup falhou: ${ultimoBackup.erro ?? 'o motivo está no log da produção.'}`,
    );
  }
  const maisNovo = Math.max(
    ...backups.map(({ ultimo }) => (ultimo?.momento ? Date.parse(ultimo.momento) : 0)),
    0,
  );
  if (maisNovo === 0) avisos.push('Nenhum destino tem um backup pronto.');
  else if (agora.getTime() - maisNovo > IDADE_DO_BACKUP) {
    avisos.push('O backup mais novo tem mais de 26 horas.');
  }
  if (maisNovo > 0) {
    for (const { destino, ultimo } of backups) {
      if (ultimo === null) avisos.push(`O destino ${destino} não tem nenhum backup pronto.`);
      else if (ultimo.momento !== null && Date.parse(ultimo.momento) < maisNovo) {
        avisos.push(`O destino ${destino} não tem o backup mais novo.`);
      }
    }
  }

  // A AC do próprio proxy dá certificados de poucas horas, que ele renova sozinho.
  const { certificado } = estado;
  const { dias } = certificado;
  const renovaSozinho = certificado.modo === 'interno' && certificado.ac === 'caddy';
  if (dias !== null && (renovaSozinho ? dias < 0 : dias < DIAS_DO_CERTIFICADO)) {
    avisos.push(
      certificado.modo === 'publico'
        ? `O certificado do proxy vence em ${dias} dias. Ele se renova sozinho 30 dias antes: confira o token do DNS e o log do proxy, como diz o runbook ("Certificado").`
        : certificado.ac === 'empresa'
          ? `O certificado do proxy vence em ${dias} dias: peça o novo à AC da empresa e troque os arquivos, como diz o runbook ("Certificado").`
          : 'O certificado do proxy venceu, e a AC do proxy não o renovou: reinicie o proxy e confira o log dele, como diz o runbook ("Certificado").',
    );
  }

  const { disco } = estado;
  if (disco !== null && disco.total > 0 && disco.livre / disco.total < DISCO_LIVRE) {
    avisos.push(
      `O disco da instalação tem só ${Math.round((disco.livre / disco.total) * 100)}% de espaço livre.`,
    );
  }
  return avisos;
}

/** O espaço do disco de uma pasta, pelo sistema de arquivos. */
export async function discoDaPasta(pasta: string): Promise<{ livre: number; total: number }> {
  const { bavail, blocks, bsize } = await statfs(pasta);
  return { livre: bavail * bsize, total: blocks * bsize };
}

/**
 * O vencimento do certificado que o proxy dá ao endereço, pelo aperto de mão TLS: no Windows, em
 * 127.0.0.1:443; no Linux, no proxy da rede interna. Só a data importa: a cadeia não é conferida.
 */
export function vencimentoPeloProxy(plataforma: Plataforma) {
  const host = plataforma === 'linux' ? SERVICOS_NO_LINUX.proxy : '127.0.0.1';
  return (endereco: string): Promise<Date> =>
    new Promise((resolver, recusar) => {
      const conexao = connect(
        { host, port: 443, servername: endereco, rejectUnauthorized: false, timeout: 10_000 },
        () => {
          const { valid_to: venceEm } = conexao.getPeerCertificate();
          conexao.end();
          if (!venceEm) recusar(new Error('o proxy não mostrou o certificado'));
          else resolver(new Date(venceEm));
        },
      );
      conexao.once('timeout', () => conexao.destroy(new Error('o proxy não respondeu a tempo')));
      conexao.once('error', recusar);
    });
}
