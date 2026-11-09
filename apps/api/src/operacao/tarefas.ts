// As tarefas do servidor (specs backup e https-interno; design do F2d, decisões 1, 10, 11 e 13): o
// backup, o teste de restauração e a vigilância do certificado. Elas rodam na fila sem o contexto de
// uma organização e uma de cada vez (a política `stately`: com uma rodando, outra espera, e uma
// terceira não entra). Os dados levam só a organização que opera o servidor, que recebe o evento e,
// esgotadas as tentativas, a falha nas Tarefas dela. Só a produção, com a operadora, as agenda.
import type { Ambiente } from '@grafite/domain';
import {
  executarBackup,
  executarTesteDeRestauracao,
  type FerramentasDoPostgres,
  FUSO_DO_SERVIDOR,
  ferramentasLocais,
} from '@grafite/operacao';
import { z } from 'zod';
import type { ConfiguracaoDoBackup } from '../config.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import type { FilaDeTarefas } from '../fila/fila.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';
import { vigiarCertificado } from './certificado.ts';

/** O fuso do servidor, em que o horário do backup e a retenção são contados. */
export { FUSO_DO_SERVIDOR };

export const TAREFAS_DO_SERVIDOR = {
  backup: 'backup',
  teste: 'teste-de-restauracao',
  certificado: 'vigilancia-do-certificado',
} as const;

/** A vigilância do certificado roda todo dia às 08:00, com a TI no expediente. */
const CRON_DA_VIGILANCIA = '0 8 * * *';
/** O backup e o teste podem levar horas num banco grande; a fila não os dá por perdidos antes. */
const DURACAO_MAXIMA = 6 * 60 * 60;

export interface ServidorDaOperacao {
  ambiente: Ambiente;
  versao: string;
  /** A pasta dos arquivos da produção, que o backup zipa. */
  pastaDosArquivos: string;
  backup?: ConfiguracaoDoBackup;
  /** O endereço cujo certificado a tarefa diária confere. */
  certificadoVigiar?: string;
  /** As ferramentas do PostgreSQL (padrão: as da pasta `GRAFITE_PG_BIN`). */
  ferramentas?: FerramentasDoPostgres;
  /** As novas tentativas depois de uma falha (padrão: 2, a 15 min uma da outra). */
  novasTentativas?: { limite: number; espera: number };
}

export interface AgendaDaOperacao {
  /** `HH:MM`, no fuso do servidor. */
  horario: string;
  /** 0 é domingo. */
  diaDoTeste: number;
}

const DadosDoBackup = z.object({
  orgId: z.uuid(),
  pedidoPor: z.enum(['agenda', 'tela']).default('agenda'),
});
const DadosDaOperadora = z.object({ orgId: z.uuid() });

/**
 * Os horários da fila: o backup todo dia no horário da agenda; o teste de restauração uma hora
 * depois, no dia escolhido (ou todo dia), para testar o backup recém-feito.
 */
export function cronsDaAgenda(
  { horario, diaDoTeste }: AgendaDaOperacao,
  teste: ConfiguracaoDoBackup['teste'],
): { backup: string; teste: string } {
  const [hora = 0, minuto = 0] = horario.split(':').map(Number);
  const horaDoTeste = (hora + 1) % 24;
  const diaDoTesteNoCron = hora === 23 ? (diaDoTeste + 1) % 7 : diaDoTeste;
  return {
    backup: `${minuto} ${hora} * * *`,
    teste: `${minuto} ${horaDoTeste} * * ${teste === 'diario' ? '*' : diaDoTesteNoCron}`,
  };
}

export function tarefasDoServidor(
  contexto: ContextoDasTarefas,
  servidor: ServidorDaOperacao,
): DefinicaoDeTarefa[] {
  const { limite, espera } = servidor.novasTentativas ?? { limite: 2, espera: 15 * 60 };
  const opcoes = {
    policy: 'stately',
    retryLimit: limite,
    retryDelay: espera,
    expireInSeconds: DURACAO_MAXIMA,
    deadLetter: FILA_DAS_FALHAS,
  } as const;
  const pool = contexto.banco.$client;
  const configurado = () => {
    if (!servidor.backup) throw new Error('O backup não está configurado neste servidor.');
    return {
      backup: servidor.backup,
      ferramentas: servidor.ferramentas ?? ferramentasLocais(servidor.backup.pastaPgBin),
    };
  };

  const backup: DefinicaoDeTarefa<z.infer<typeof DadosDoBackup>> = {
    nome: TAREFAS_DO_SERVIDOR.backup,
    rotulo: 'Backup',
    rotina: {
      nome: 'Backup do servidor',
      descricao: 'Copia o banco e os arquivos do Grafite para a pasta dos backups.',
    },
    dados: DadosDoBackup,
    opcoes,
    async trabalho({ orgId, pedidoPor }) {
      const { backup: config, ferramentas } = configurado();
      const feito = await executarBackup({
        urlBackup: config.urlBackup,
        ferramentas,
        pastaDosArquivos: servidor.pastaDosArquivos,
        destinos: config.destinos,
        retencao: config.retencao,
        exigirMarca: config.exigirMarca,
        fuso: FUSO_DO_SERVIDOR,
        versao: servidor.versao,
        agora: contexto.agora,
        pool,
        orgOperadoraId: orgId,
        pedidoPor,
      });
      contexto.log.info(
        { pasta: feito.pasta, tamanho: feito.tamanho, removidos: feito.removidos.length },
        'backup feito',
      );
    },
  };

  const teste: DefinicaoDeTarefa<z.infer<typeof DadosDaOperadora>> = {
    nome: TAREFAS_DO_SERVIDOR.teste,
    rotulo: 'Teste de restauração',
    rotina: {
      nome: 'Teste de restauração',
      descricao: 'Restaura o último backup num banco à parte, para conferir que ele abre.',
    },
    dados: DadosDaOperadora,
    opcoes,
    async trabalho({ orgId }) {
      const { backup: config, ferramentas } = configurado();
      const resultado = await executarTesteDeRestauracao({
        ferramentas,
        urlRestauracao: config.urlRestauracao,
        destinos: config.destinos,
        ...(config.pastaDaRestauracao !== undefined && {
          pastaDaInstancia: config.pastaDaRestauracao,
        }),
        pool,
        orgOperadoraId: orgId,
      });
      contexto.log.info({ backup: resultado.backup, ...resultado.detalhes }, 'backup restaurado');
    },
  };

  const certificado: DefinicaoDeTarefa<z.infer<typeof DadosDaOperadora>> = {
    nome: TAREFAS_DO_SERVIDOR.certificado,
    rotulo: 'Vigilância do certificado',
    rotina: {
      nome: 'Vigilância do certificado',
      descricao: 'Confere a validade do certificado do endereço e avisa antes de ele vencer.',
    },
    dados: DadosDaOperadora,
    opcoes: { ...opcoes, expireInSeconds: 5 * 60 },
    async trabalho() {
      if (!servidor.certificadoVigiar) return;
      const dias = await vigiarCertificado(servidor.certificadoVigiar, { agora: contexto.agora });
      contexto.log.info({ endereco: servidor.certificadoVigiar, dias }, 'certificado conferido');
    },
  };

  return [backup, teste, certificado];
}

/**
 * Agenda as tarefas do servidor na fila, ou tira os agendamentos: só a produção, com a organização
 * operadora encontrada, agenda. Roda na partida e a cada mudança da agenda; agendar de novo troca o
 * horário.
 */
export async function agendarTarefasDoServidor(
  fila: Pick<FilaDeTarefas, 'agendar' | 'desagendar'>,
  agenda: AgendaDaOperacao,
  servidor: ServidorDaOperacao & { orgOperadoraId: string | null },
): Promise<void> {
  const { orgOperadoraId } = servidor;
  const ativo = servidor.ambiente === 'producao' && orgOperadoraId !== null;
  if (ativo && servidor.backup) {
    const crons = cronsDaAgenda(agenda, servidor.backup.teste);
    await fila.agendar(
      TAREFAS_DO_SERVIDOR.backup,
      crons.backup,
      { orgId: orgOperadoraId, pedidoPor: 'agenda' },
      FUSO_DO_SERVIDOR,
    );
    await fila.agendar(
      TAREFAS_DO_SERVIDOR.teste,
      crons.teste,
      { orgId: orgOperadoraId },
      FUSO_DO_SERVIDOR,
    );
  } else {
    await fila.desagendar(TAREFAS_DO_SERVIDOR.backup);
    await fila.desagendar(TAREFAS_DO_SERVIDOR.teste);
  }
  if (ativo && servidor.certificadoVigiar) {
    await fila.agendar(
      TAREFAS_DO_SERVIDOR.certificado,
      CRON_DA_VIGILANCIA,
      { orgId: orgOperadoraId },
      FUSO_DO_SERVIDOR,
    );
  } else {
    await fila.desagendar(TAREFAS_DO_SERVIDOR.certificado);
  }
}
