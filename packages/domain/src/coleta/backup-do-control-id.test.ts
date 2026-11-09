// O backup do Control iD (spec backup-do-control-id; change p5a-backup-do-control-id, design,
// decisões 4, 5 e 6): o resultado pelas categorias, a retenção, a agenda, a expiração e o nome do
// arquivo, no fuso de São Paulo.
import { describe, expect, it } from 'vitest';
import {
  agendadoDevido,
  type BackupParaReter,
  backupsQueSaem,
  CATEGORIAS_DO_BACKUP,
  MENSAGENS_DO_BACKUP,
  nomeDoArquivoDoBackup,
  pedidoExpirado,
  ROTULOS_DAS_CATEGORIAS,
  resultadoDoBackup,
} from './backup-do-control-id.ts';

describe('as categorias do backup', () => {
  it('seguem a ordem do PMG, com o rótulo de cada uma e o das fotos', () => {
    expect(CATEGORIAS_DO_BACKUP).toEqual([
      'users',
      'groups',
      'user_groups',
      'cards',
      'templates',
      'access_rules',
      'group_access_rules',
      'time_zones',
      'time_spans',
      'access_rule_time_zones',
    ]);
    expect(ROTULOS_DAS_CATEGORIAS.templates).toBe('Biometria');
    expect(ROTULOS_DAS_CATEGORIAS.face_images).toBe('Fotos');
  });
});

describe('o resultado do backup', () => {
  const ok = (categoria: string, quantidade: number) =>
    ({ categoria, situacao: 'ok', quantidade }) as const;

  it('Backup completo: Sucesso, com os registros e as fotos', () => {
    expect(resultadoDoBackup([ok('users', 312), ok('cards', 300), ok('face_images', 312)])).toEqual(
      { situacao: 'sucesso', registros: 612, fotos: 312, erro: null },
    );
  });

  it('Biometria que falha: Parcial, com a categoria na mensagem', () => {
    expect(
      resultadoDoBackup([
        ok('users', 10),
        { categoria: 'templates', situacao: 'erro', quantidade: 0, erro: 'HTTP 500' },
      ]),
    ).toEqual({
      situacao: 'parcial',
      registros: 10,
      fotos: 0,
      erro: 'Falhou a leitura de: Biometria.',
    });
  });

  it('todas as categorias com erro, ou nenhuma: Falha', () => {
    expect(
      resultadoDoBackup([{ categoria: 'users', situacao: 'erro', quantidade: 0, erro: 'x' }]),
    ).toMatchObject({ situacao: 'falha', erro: 'Falhou a leitura de: Usuários.' });
    expect(resultadoDoBackup([])).toMatchObject({
      situacao: 'falha',
      erro: 'Nenhuma categoria foi lida.',
    });
  });
});

// Os momentos em UTC; São Paulo fica 3 horas atrás.
const em = (texto: string) => new Date(`${texto}-03:00`);
const bom = (id: string, quando: string): BackupParaReter => ({
  id,
  situacao: 'sucesso',
  pedidoEm: em(quando),
  concluidoEm: em(quando),
});

describe('a retenção', () => {
  it('Oitavo dia: o de 8 dias atrás sai, se não é o último da semana nem do mês dele', () => {
    // Quarta, 28/10: ficam os dias 22 a 28; o dia 21 (quarta) não é o último da semana de 19 a 25
    // nem o de outubro.
    const backups = [21, 22, 23, 24, 25, 26, 27, 28].map((dia) =>
      bom(`d${dia}`, `2026-10-${dia}T02:10:00`),
    );
    expect(backupsQueSaem(backups, em('2026-10-28T03:00:00'))).toEqual(['d21']);
  });

  it('fica o último de cada semana das 4 últimas e o de cada mês dos 12 últimos', () => {
    const backups = [
      bom('domingo-11', '2026-10-11T02:00:00'),
      bom('sabado-10', '2026-10-10T02:00:00'),
      bom('agosto', '2026-08-31T02:00:00'),
      bom('agosto-antes', '2026-08-30T02:00:00'),
      bom('ano-passado', '2025-09-30T02:00:00'),
      bom('hoje', '2026-10-28T02:00:00'),
    ];
    expect(backupsQueSaem(backups, em('2026-10-28T03:00:00')).sort()).toEqual([
      'agosto-antes',
      'ano-passado',
      'sabado-10',
    ]);
  });

  it('Dois backups no mesmo dia: o mais tarde fica como o do dia, e o outro sai', () => {
    const backups = [bom('madrugada', '2026-10-28T02:00:00'), bom('tarde', '2026-10-28T15:00:00')];
    expect(backupsQueSaem(backups, em('2026-10-28T15:01:00'))).toEqual(['madrugada']);
  });

  it('as falhas ficam 30 dias, e os pedidos abertos nunca saem', () => {
    const falha = (id: string, quando: string): BackupParaReter => ({
      id,
      situacao: 'falha',
      pedidoEm: em(quando),
      concluidoEm: em(quando),
    });
    const backups: BackupParaReter[] = [
      falha('falha-velha', '2026-09-20T02:00:00'),
      falha('falha-nova', '2026-10-20T02:00:00'),
      {
        id: 'na-fila',
        situacao: 'na-fila',
        pedidoEm: em('2026-08-01T02:00:00'),
        concluidoEm: null,
      },
    ];
    expect(backupsQueSaem(backups, em('2026-10-28T03:00:00'))).toEqual(['falha-velha']);
  });
});

describe('a agenda', () => {
  const nenhum = { agendado: null, qualquer: null };
  const so = (momento: Date) => ({ agendado: momento, qualquer: momento });

  it('põe o backup do dia depois do horário, uma vez por dia em São Paulo', () => {
    expect(agendadoDevido('02:00', em('2026-10-28T01:59:00'), nenhum)).toBe(false);
    expect(agendadoDevido('02:00', em('2026-10-28T02:00:00'), nenhum)).toBe(true);
    // Agenda depois de um servidor parado: às 08:00, o das 02:00 ainda entra.
    expect(agendadoDevido('02:00', em('2026-10-28T08:00:00'), so(em('2026-10-27T02:00:30')))).toBe(
      true,
    );
    expect(agendadoDevido('02:00', em('2026-10-28T08:00:00'), so(em('2026-10-28T02:00:30')))).toBe(
      false,
    );
  });

  // O manual que termina depois do agendado passa a ser o do dia, e a retenção apaga o agendado
  // (spec backup-do-control-id, "Dois backups no mesmo dia"): a agenda não pede outro no mesmo dia.
  it('o backup pedido hoje depois do horário vale como o do dia, mesmo sem o agendado', () => {
    const manualDasQuinze = em('2026-10-28T15:00:00');
    expect(
      agendadoDevido('02:00', em('2026-10-28T15:05:00'), {
        agendado: null,
        qualquer: manualDasQuinze,
      }),
    ).toBe(false);
    expect(
      agendadoDevido('02:00', em('2026-10-28T15:05:00'), {
        agendado: em('2026-10-27T02:00:30'),
        qualquer: manualDasQuinze,
      }),
    ).toBe(false);
    // O manual antes do horário não vale: o agendado do dia ainda entra.
    expect(
      agendadoDevido('02:00', em('2026-10-28T02:05:00'), {
        agendado: em('2026-10-27T02:00:30'),
        qualquer: em('2026-10-28T01:30:00'),
      }),
    ).toBe(true);
  });
});

describe('a expiração do pedido', () => {
  it('Coletor desligado: 2 horas na fila, ou 30 minutos em andamento', () => {
    const agora = em('2026-10-28T04:00:00');
    expect(
      pedidoExpirado(
        { situacao: 'na-fila', pedidoEm: em('2026-10-28T02:00:00'), iniciadoEm: null },
        agora,
      ),
    ).toBe(MENSAGENS_DO_BACKUP.naoBuscado);
    expect(
      pedidoExpirado(
        { situacao: 'na-fila', pedidoEm: em('2026-10-28T02:01:00'), iniciadoEm: null },
        agora,
      ),
    ).toBeNull();
    expect(
      pedidoExpirado(
        {
          situacao: 'em-andamento',
          pedidoEm: em('2026-10-28T03:00:00'),
          iniciadoEm: em('2026-10-28T03:30:00'),
        },
        agora,
      ),
    ).toBe(MENSAGENS_DO_BACKUP.naoTerminado);
  });
});

describe('o nome do arquivo', () => {
  it('leva o patrimônio, ou o nome sem acento, e o momento em São Paulo', () => {
    expect(
      nomeDoArquivoDoBackup(
        { patrimonio: 'PAT-00778', nome: 'Portaria' },
        em('2026-10-28T02:05:00'),
      ),
    ).toBe('controlid-pat-00778-2026-10-28-0205.zip');
    expect(
      nomeDoArquivoDoBackup(
        { patrimonio: null, nome: 'Portão da Expedição' },
        em('2026-10-28T15:30:00'),
      ),
    ).toBe('controlid-portao-da-expedicao-2026-10-28-1530.zip');
  });
});
