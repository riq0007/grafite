// O resumo do bloco Alertas no cartão da Visão geral da ficha do ativo (spec modulo-alertas,
// "Alertas na ficha do ativo"; change ficha-em-cartoes, design, decisão 3): quantos alertas estão
// abertos e se estão silenciados, lidos pelas mesmas consultas do bloco, sem pedir de novo com ele
// aberto. A chave fica sob a dos alertas, e o evento `alertas.mudaram` relê o resumo também.
import { resumoDaRelacao } from '../relacoes.tsx';
import { CHAVE_DOS_ALERTAS, opcoesDoSilencio, opcoesDosAlertas } from './consultas.ts';

export interface DadosDoResumo {
  /** A conta vê os alertas no local do ativo. */
  ver: boolean;
  abertos: number;
  silenciado: boolean;
}

/** "1 alerta aberto", "N alertas abertos" e "Alertas silenciados"; sem nada, nenhum resumo. */
export function textoDoResumoDosAlertas({ ver, abertos, silenciado }: DadosDoResumo) {
  if (!ver) return null;
  const partes = [
    ...(abertos > 0 ? [abertos === 1 ? '1 alerta aberto' : `${abertos} alertas abertos`] : []),
    ...(silenciado ? ['Alertas silenciados'] : []),
  ];
  return partes.length > 0 ? partes.join(' · ') : null;
}

export const resumoDosAlertas = resumoDaRelacao<DadosDoResumo>({
  consulta: (id, { api, consultas }) => ({
    queryKey: [...CHAVE_DOS_ALERTAS, 'resumo-do-ativo', id],
    queryFn: async () => {
      const silencio = await consultas.fetchQuery(opcoesDoSilencio(id, api));
      if (!silencio.permite.ver) return { ver: false, abertos: 0, silenciado: false };
      const alertas = await consultas.fetchInfiniteQuery(
        opcoesDosAlertas({ situacao: 'abertos', ativo: id }, api),
      );
      return {
        ver: true,
        abertos: alertas.pages[0]?.total ?? 0,
        silenciado: silencio.silencio !== null,
      };
    },
  }),
  texto: textoDoResumoDosAlertas,
});
