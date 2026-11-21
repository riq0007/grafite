// O resumo dos tempos do chamado resolvido (spec modulo-chat, "Chamado no chat"; spec
// modulo-chamados, "Conversa com a pessoa no chamado aberto"; change chat-com-chamados, design,
// decisão 15): quando abriu, a primeira resposta da TI e quanto ela levou, quando resolveu e quanto
// levou, e quem atendeu, em quatro colunas, embaixo do evento da resolução, no chat e na conversa do
// chamado aberto da TI.
import type { components } from '@grafite/api-client';
import type { DataHora } from '@grafite/ui';
import { horaNaConversa } from './chamado.ts';
import estilos from './ResumoDosTempos.module.css';

export type ResumoDosTemposDoChamado = components['schemas']['ResumoDosTemposNoChat'];

export function ResumoDosTempos({
  resumo,
  agora,
  dataHora,
}: {
  resumo: ResumoDosTemposDoChamado;
  agora: Date;
  dataHora: DataHora;
}) {
  const hora = (em: string) => horaNaConversa(new Date(em), agora, dataHora);
  const { primeiraResposta, resolvido } = resumo;
  return (
    <dl className={estilos.tempos}>
      <div>
        <dt>Aberto</dt>
        <dd className={estilos.mono}>{hora(resumo.abertoEm)}</dd>
      </div>
      <div>
        <dt>Primeira resposta da TI</dt>
        <dd className={primeiraResposta ? estilos.mono : undefined}>
          {primeiraResposta
            ? `${hora(primeiraResposta.em)} · ${primeiraResposta.tempo}`
            : 'sem resposta'}
        </dd>
      </div>
      <div>
        <dt>Resolvido</dt>
        <dd className={estilos.mono}>{`${hora(resolvido.em)} · ${resolvido.tempo}`}</dd>
      </div>
      <div>
        <dt>Atendeu</dt>
        <dd className={estilos.forte}>{resumo.atendeu}</dd>
      </div>
    </dl>
  );
}
