// O horário da TI na API (spec chamados, "Horário da TI"; change chamados-da-ti, design, decisões 1
// e 3): a linha da organização, ou o padrão do domínio, enquanto ela não mudou o dela.
import { horarioDaTi, type Transacao } from '@grafite/db';
import { type DiaDaSemana, HORARIO_DA_TI_PADRAO, type HorarioDaTi } from '@grafite/domain';

/** O horário da TI da organização do contexto. */
export async function lerHorarioDaTi(tx: Transacao): Promise<HorarioDaTi> {
  const [linha] = await tx
    .select({
      dias: horarioDaTi.dias,
      inicio: horarioDaTi.inicio,
      fim: horarioDaTi.fim,
      fuso: horarioDaTi.fuso,
      cargaCheia: horarioDaTi.cargaCheia,
    })
    .from(horarioDaTi);
  if (!linha) return HORARIO_DA_TI_PADRAO;
  // O `horario_da_ti_dias_validos` só deixa gravar os dias de 1 a 7.
  return { ...linha, dias: linha.dias as DiaDaSemana[] };
}
