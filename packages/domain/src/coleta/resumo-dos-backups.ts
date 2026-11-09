// O resumo dos backups de um controle (spec backup-do-control-id, "Resumo dos backups por controle";
// change suprimentos-rostos-e-backups, design, decisão 6): os dias de São Paulo com a melhor
// situação de cada um e os usuários e os rostos pelas categorias lidas.
import {
  CATEGORIA_DAS_FOTOS,
  type CategoriaLida,
  deslocado,
  diaEmSaoPaulo,
  type SituacaoDoBackup,
} from './backup-do-control-id.ts';

export type SituacaoDoDia = 'ok' | 'parcial' | 'falha' | 'nada';

export interface DiaDosBackups {
  /** AAAA-MM-DD, em São Paulo. */
  data: string;
  situacao: SituacaoDoDia;
}

export interface BackupDoDia {
  situacao: SituacaoDoBackup;
  concluidoEm: Date | null;
}

const SITUACAO_NO_DIA: Partial<Record<SituacaoDoBackup, SituacaoDoDia>> = {
  sucesso: 'ok',
  parcial: 'parcial',
  falha: 'falha',
};

/** O melhor ganha: um backup concluído no dia vale mais que uma falha do mesmo dia. */
const PESO: Record<SituacaoDoDia, number> = { ok: 3, parcial: 2, falha: 1, nada: 0 };

/** Os `dias` dias de São Paulo até hoje, do mais antigo ao mais recente, com a melhor situação. */
export function diasDosBackups(
  backups: readonly BackupDoDia[],
  dias: number,
  agora: Date,
): DiaDosBackups[] {
  const melhor = new Map<string, SituacaoDoDia>();
  for (const backup of backups) {
    const situacao = SITUACAO_NO_DIA[backup.situacao];
    if (!backup.concluidoEm || !situacao) continue;
    const dia = diaEmSaoPaulo(backup.concluidoEm);
    if (PESO[situacao] > PESO[melhor.get(dia) ?? 'nada']) melhor.set(dia, situacao);
  }
  const hoje = diaEmSaoPaulo(agora);
  return Array.from({ length: dias }, (_, i) => {
    const data = deslocado(hoje, i - (dias - 1));
    return { data, situacao: melhor.get(data) ?? 'nada' };
  });
}

export interface ContagensDoBackup {
  usuarios: number | null;
  rostos: number | null;
}

/** Os usuários e os rostos (as fotos) de um backup; a categoria com erro fica sem dado. */
export function contagensDoBackup(categorias: readonly CategoriaLida[]): ContagensDoBackup {
  const quantidade = (nome: string) => {
    const lida = categorias.find((categoria) => categoria.categoria === nome);
    return lida && lida.situacao === 'ok' ? lida.quantidade : null;
  };
  return { usuarios: quantidade('users'), rostos: quantidade(CATEGORIA_DAS_FOTOS) };
}
