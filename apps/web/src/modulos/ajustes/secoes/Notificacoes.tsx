import {
  avisar,
  Botao,
  Checkbox,
  ControleSegmentado,
  Formulario,
  GrupoDeCheckboxes,
  Interruptor,
  Segmento,
} from '@grafite/ui';
import {
  RestaurarPadroes,
  TituloDaSecao,
  useAlvoDasPreferencias,
} from '../../../preferencias/alvo.tsx';
import { TEMPOS_DO_AVISO, type TempoDoAviso } from '../../../preferencias/preferencias.ts';
import { CanaisDeFora } from './CanaisDeFora.tsx';

/**
 * Seção Notificações: se Atenção e Informação viram aviso na tela (o Crítico sempre vira), quanto
 * tempo o aviso temporário fica, com um aviso de exemplo que fica o tempo em edição, o modo Foco,
 * que deixa só o Crítico virar aviso, e os canais de fora, o e-mail e o celular.
 */
export function SecaoNotificacoes() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { atencao, informacao, tempo, foco } = preferencias.notificacoes;
  const naTela = ['critico', ...(atencao ? ['atencao'] : []), ...(informacao ? ['info'] : [])];
  return (
    <>
      <TituloDaSecao>Notificações</TituloDaSecao>
      <Formulario aria-label="Notificações" onSubmit={(evento) => evento.preventDefault()}>
        <GrupoDeCheckboxes
          rotulo="Avisos na tela"
          data-foco="avisos-na-tela"
          value={naTela}
          onChange={(escolhidas) =>
            mudar('notificacoes', {
              atencao: escolhidas.includes('atencao'),
              informacao: escolhidas.includes('info'),
            })
          }
          descricao="O Crítico sempre aparece, até ser reconhecido ou adiado. O que não aparece como aviso continua na central de notificações."
        >
          <Checkbox value="critico" isDisabled>
            Crítico
          </Checkbox>
          <Checkbox value="atencao">Atenção</Checkbox>
          <Checkbox value="info">Informação</Checkbox>
        </GrupoDeCheckboxes>

        <ControleSegmentado
          rotulo="Tempo do aviso"
          data-foco="tempo-do-aviso"
          value={String(tempo)}
          onChange={(valor) => mudar('notificacoes', { tempo: Number(valor) as TempoDoAviso })}
          descricao="Quanto tempo os avisos de Atenção e de Informação ficam na tela."
        >
          {TEMPOS_DO_AVISO.map((segundos) => (
            <Segmento key={segundos} value={String(segundos)}>
              {segundos} s
            </Segmento>
          ))}
        </ControleSegmentado>

        <Interruptor
          data-foco="modo-foco"
          isSelected={foco}
          onChange={(ligado) => mudar('notificacoes', { foco: ligado })}
          descricao="Com o Foco ligado, só o Crítico vira aviso. O resto vai para a central."
        >
          Modo Foco
        </Interruptor>

        <div>
          {/* Pelo avisar, e não pelo notificar: o exemplo não entra na central. */}
          <Botao
            onPress={() =>
              avisar({
                situacao: 'info',
                titulo: 'Aviso de exemplo',
                descricao: `Some em ${tempo} s, como os avisos de Atenção e de Informação.`,
                duracao: tempo * 1000,
              })
            }
          >
            Mostrar aviso de exemplo
          </Botao>
        </div>

        <CanaisDeFora />

        <div>
          <RestaurarPadroes secao="notificacoes" />
        </div>
      </Formulario>
    </>
  );
}
