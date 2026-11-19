import { Time } from '@internationalized/date';
import { useMemo, useState } from 'react';
import {
  DateInput,
  DateSegment,
  I18nProvider,
  TimeField,
  type TimeFieldProps,
} from 'react-aria-components';
import estilos from './Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from './partes.tsx';

export interface PropsDoCampoDeHora
  extends Omit<
    TimeFieldProps<Time>,
    | 'children'
    | 'className'
    | 'isRequired'
    | 'isInvalid'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'validate'
    | 'minValue'
    | 'maxValue'
    | 'placeholderValue'
    | 'granularity'
    | 'hourCycle'
    | 'hideTimeZone'
    | 'shouldForceLeadingZeros'
  > {
  /** Rótulo visível. */
  rotulo: string;
  descricao?: string;
  obrigatorio?: boolean;
  /** Erro vindo de fora do campo, como a recusa do formulário. */
  erro?: string;
  /** A hora em minutos do dia, de 0 (00:00) a 1.439 (23:59), ou `null` sem hora. */
  valor: number | null;
  /** Recebe cada hora completa em minutos do dia, ou `null` quando as duas partes são apagadas. */
  aoMudar: (valor: number | null) => void;
  className?: string;
}

const MINUTOS_DA_HORA = 60;

/**
 * Hora em hh:mm, com as horas e os minutos editáveis pelo teclado, em 24 h e com o zero à
 * esquerda, no formato do pt-BR qualquer que seja o idioma do navegador. O valor é o minuto do dia,
 * como o horário da TI o guarda.
 *
 * Com uma parte só apagada, a hora fica pela metade, e o valor não muda: o React Aria só avisa a
 * hora completa ou as duas partes apagadas. Ao sair do campo, a hora pela metade volta à de antes,
 * para o que se vê ser o que vale, como a data que não existe no campo de data. Sem hora, ela fica
 * à vista, e o valor segue nulo.
 */
export function CampoDeHora({
  rotulo,
  descricao,
  obrigatorio = false,
  erro,
  valor,
  aoMudar,
  className,
  ...resto
}: PropsDoCampoDeHora) {
  // O React Aria refaz as partes à vista quando o valor que recebe é outro objeto: a hora é a mesma
  // enquanto o valor não muda, para a hora pela metade não sumir a cada desenho da tela.
  const hora = useMemo(
    () =>
      valor === null
        ? null
        : new Time(Math.floor(valor / MINUTOS_DA_HORA), valor % MINUTOS_DA_HORA),
    [valor],
  );
  // Desfazer a hora pela metade monta o campo de novo, com a hora de antes.
  const [vez, definirVez] = useState(0);

  return (
    <I18nProvider locale="pt-BR">
      <TimeField
        key={vez}
        {...resto}
        value={hora}
        onChange={(nova) => aoMudar(nova ? nova.hour * MINUTOS_DA_HORA + nova.minute : null)}
        hourCycle={24}
        shouldForceLeadingZeros
        isRequired={obrigatorio}
        isInvalid={erro ? true : undefined}
        className={[estilos.campo, className].filter(Boolean).join(' ')}
      >
        <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
        <div
          onBlurCapture={(evento) => {
            const saindo = !evento.currentTarget.contains(evento.relatedTarget as Node | null);
            const pelaMetade = evento.currentTarget.querySelector('[data-placeholder]') !== null;
            if (saindo && pelaMetade && valor !== null) definirVez((atual) => atual + 1);
          }}
        >
          <DateInput className={`${estilos.entrada} ${estilos.data}`}>
            {(segmento) => <DateSegment segment={segmento} className={estilos.segmento} />}
          </DateInput>
        </div>
        {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
        <ErroDoCampo erro={erro} />
      </TimeField>
    </I18nProvider>
  );
}
