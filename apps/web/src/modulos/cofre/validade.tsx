// A validade e a rotação de um segredo (spec cofre-de-segredos, "Validade e rotação"): a data e,
// quando ela passou, "Vencido" e "Rotação atrasada" em texto, com o ícone de atenção, pelo dia de
// hoje no fuso escolhido. O dia vira com o relógio da casca, sem recarregar.
import { mostrarData, situacaoDaValidade } from '@grafite/domain';
import { RotuloDeSituacao, useDataHora } from '@grafite/ui';
import { useAgora } from '../../casca/status/useAgora.ts';
import estilos from './Cofre.module.css';

/** O dia de hoje no fuso, como "2026-10-12". */
export function hojeNoFuso(fuso: string, agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

/** "Vencido" e "Rotação atrasada" pelo dia de hoje no fuso de quem vê. */
export function useSituacaoDaValidade(datas: {
  validade: string | null;
  proximaRotacao: string | null;
}) {
  const { fuso } = useDataHora();
  const agora = useAgora();
  return situacaoDaValidade(datas, hojeNoFuso(fuso, agora));
}

/** A validade na lista: a data, ou um travessão, e os avisos do que passou. */
export function ValidadeDoSegredo({
  validade,
  proximaRotacao,
}: {
  validade: string | null;
  proximaRotacao: string | null;
}) {
  const { vencido, rotacaoAtrasada } = useSituacaoDaValidade({ validade, proximaRotacao });
  return (
    <span className={estilos.validade}>
      {validade ? mostrarData(validade) : '—'}
      {vencido && <RotuloDeSituacao situacao="atencao">Vencido</RotuloDeSituacao>}
      {rotacaoAtrasada && <RotuloDeSituacao situacao="atencao">Rotação atrasada</RotuloDeSituacao>}
    </span>
  );
}
