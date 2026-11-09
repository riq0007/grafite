// A notificação dos alertas que abrem (spec notificacoes, "Notificações dos alertas"; change
// p3b-notificacoes-no-servidor, design, decisões 3 e 4): cada conta que vê o alerta no local do
// ativo ganha a dela; o coletor e o ativo sem local só alcançam quem vê os alertas na organização
// inteira. Mais de 5 alertas de uma vez para a mesma conta viram uma notificação só.
import { type Acesso, podeEm } from '../acesso/acesso.ts';
import type { ArvoreDeLocais } from '../locais/arvore.ts';
import {
  type NovaNotificacao,
  type SeveridadeDaNotificacao,
  severidadeMaisAlta,
} from './notificacoes.ts';

/** Até quantos alertas abertos de uma vez cada um tem a sua notificação. */
export const LIMITE_SEM_AGRUPAR = 5;

/** O módulo que notifica os alertas, como a central o mostra. */
export const ORIGEM_DOS_ALERTAS = 'Alertas';

/** A lista dos alertas abertos, para a notificação agrupada. */
export const DESTINO_DOS_ALERTAS_ABERTOS = '/alertas';

export interface AlertaQueAbriu {
  id: string;
  severidade: SeveridadeDaNotificacao;
  texto: string;
  /** O local do ativo; `null` no ativo sem local e no alerta de um coletor. */
  localId: string | null;
  /** O ativo, pelo rótulo e pelo patrimônio, ou o coletor, pelo nome. */
  descricao: string;
  /** A ficha do ativo, ou a tela do coletor. */
  destino: string;
}

export interface ContaParaNotificar {
  id: string;
  acesso: Acesso;
}

/** As notificações dos alertas que abriram numa avaliação, para as contas que os veem. */
export function notificacoesDosAlertas(
  abertos: readonly AlertaQueAbriu[],
  contas: readonly ContaParaNotificar[],
  arvore: Pick<ArvoreDeLocais, 'ancestrais'>,
): NovaNotificacao[] {
  const notificacoes: NovaNotificacao[] = [];
  for (const conta of contas) {
    const visiveis = abertos.filter((alerta) =>
      podeEm(conta.acesso, 'alertas.ver', alerta.localId, arvore),
    );
    if (visiveis.length > LIMITE_SEM_AGRUPAR) {
      notificacoes.push({
        contaId: conta.id,
        severidade: severidadeMaisAlta(visiveis.map(({ severidade }) => severidade)),
        titulo: `${visiveis.length} alertas abertos`,
        descricao: null,
        origem: ORIGEM_DOS_ALERTAS,
        destino: DESTINO_DOS_ALERTAS_ABERTOS,
        alertaId: null,
      });
      continue;
    }
    for (const alerta of visiveis) {
      notificacoes.push({
        contaId: conta.id,
        severidade: alerta.severidade,
        titulo: alerta.texto,
        descricao: alerta.descricao,
        origem: ORIGEM_DOS_ALERTAS,
        destino: alerta.destino,
        alertaId: alerta.id,
      });
    }
  }
  return notificacoes;
}
