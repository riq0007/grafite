import { CalendarDate, parseDate } from '@internationalized/date';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  DateField,
  type DateFieldProps,
  DateFieldStateContext,
  DateInput,
  DateSegment,
  I18nProvider,
} from 'react-aria-components';
import type { DateSegment as SegmentoDaData } from 'react-stately';
import estilos from './Campo.module.css';
import { DescricaoDoCampo, ErroDoCampo, RotuloDoCampo } from './partes.tsx';

export interface PropsDoCampoDeData
  extends Omit<
    DateFieldProps<CalendarDate>,
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
    | 'isDateUnavailable'
    | 'granularity'
    | 'shouldForceLeadingZeros'
  > {
  /** Rótulo visível. */
  rotulo: string;
  descricao?: string;
  obrigatorio?: boolean;
  /** Erro vindo de fora do campo (da API, por exemplo). */
  erro?: string;
  /** A data em `aaaa-mm-dd`, ou `null` sem data. Sem ele, o campo guarda a própria data. */
  valor?: string | null;
  /**
   * Recebe cada data completa, inclusive enquanto o ano é digitado (0002, 0020, 0202 e 2026).
   * Quem consulta com ela, como um filtro, espera o campo perder o foco (`onBlur`).
   */
  aoMudar?: (valor: string | null) => void;
  /**
   * A data que não existe, como o usuário a digitou ("31/02/2026"), ou `null` quando ela sai. Quem
   * aplica o valor, como um filtro, não aplica enquanto houver uma.
   */
  aoRecusar?: (texto: string | null) => void;
  className?: string;
}

/**
 * Data em dd/mm/aaaa, com cada parte editável pelo teclado, no formato do pt-BR qualquer que
 * seja o idioma do navegador. Uma data que não existe (31/02) é recusada, com o motivo em texto.
 */
export function CampoDeData({
  rotulo,
  descricao,
  obrigatorio = false,
  erro,
  valor,
  aoMudar,
  aoRecusar,
  className,
  ...resto
}: PropsDoCampoDeData) {
  const [interno, definirInterno] = useState<string | null>(null);
  const atual = valor === undefined ? interno : valor;
  // A data inexistente à vista e a recusada ao sair do campo, como o usuário as digitou.
  const [inexistente, definirInexistente] = useState<string | null>(null);
  const [recusada, definirRecusada] = useState<string | null>(null);
  const saindo = useRef(false);
  const naoExiste = inexistente ?? recusada;
  const avisar = useRef(aoRecusar);
  avisar.current = aoRecusar;
  useEffect(() => {
    avisar.current?.(naoExiste);
  }, [naoExiste]);

  return (
    <I18nProvider locale="pt-BR">
      <DateField
        {...resto}
        value={atual ? parseDate(atual) : null}
        onChange={(data) => {
          // Ao sair do campo com uma data que não existe, o React Aria a troca pela mais próxima
          // (31/02 vira 28/02). O campo recusa a troca: fica com o valor de antes.
          if (saindo.current && inexistente) {
            definirRecusada(inexistente);
            return;
          }
          definirRecusada(null);
          const texto = data ? data.toString() : null;
          definirInterno(texto);
          aoMudar?.(texto);
        }}
        shouldForceLeadingZeros
        isRequired={obrigatorio}
        isInvalid={erro || naoExiste ? true : undefined}
        className={[estilos.campo, className].filter(Boolean).join(' ')}
      >
        <RotuloDoCampo rotulo={rotulo} obrigatorio={obrigatorio} />
        <div
          onFocusCapture={() => {
            saindo.current = false;
          }}
          onBlurCapture={(evento) => {
            saindo.current = !evento.currentTarget.contains(evento.relatedTarget as Node | null);
          }}
        >
          <DateInput className={`${estilos.entrada} ${estilos.data}`}>
            {(segmento) => <DateSegment segment={segmento} className={estilos.segmento} />}
          </DateInput>
        </div>
        <AcompanharInexistente aoMudar={definirInexistente} />
        {descricao && <DescricaoDoCampo>{descricao}</DescricaoDoCampo>}
        <ErroDoCampo erro={erro ?? (naoExiste ? `A data ${naoExiste} não existe.` : undefined)} />
      </DateField>
    </I18nProvider>
  );
}

/** Avisa quando as partes à vista formam uma data que não existe, dando o texto dela. */
function AcompanharInexistente({ aoMudar }: { aoMudar: (texto: string | null) => void }) {
  const estado = useContext(DateFieldStateContext);
  const texto = estado ? textoDaInexistente(estado.segments) : null;
  useEffect(() => {
    aoMudar(texto);
  }, [aoMudar, texto]);
  return null;
}

function textoDaInexistente(segmentos: SegmentoDaData[]): string | null {
  const valorDe = (tipo: SegmentoDaData['type']) => {
    const segmento = segmentos.find((s) => s.type === tipo);
    return segmento && !segmento.isPlaceholder ? segmento.value : null;
  };
  const [dia, mes, ano] = [valorDe('day'), valorDe('month'), valorDe('year')];
  if (dia == null || mes == null || ano == null) return null;
  // A CalendarDate leva o dia ao último do mês: se mudou, a data não existe.
  if (new CalendarDate(ano, mes, dia).day === dia) return null;
  return segmentos.map((s) => s.text).join('');
}
