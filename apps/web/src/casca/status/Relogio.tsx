import { useDataHora } from '@grafite/ui';
import { useEffect, useState } from 'react';
import { vigiarOMinuto } from './relogio.ts';

/** O instante no formato do atributo datetime, em UTC e sem os segundos. */
const paraDatetime = (data: Date) => `${data.toISOString().slice(0, 16)}Z`;

/** Relógio da barra, no fuso escolhido e na fonte mono dos horários, atualizado na virada do minuto. */
export function Relogio() {
  const { formatarHorario } = useDataHora();
  const [agora, definirAgora] = useState(() => new Date());
  useEffect(() => vigiarOMinuto(() => definirAgora(new Date())), []);
  return (
    <time className="mono" dateTime={paraDatetime(agora)}>
      {formatarHorario(agora)}
    </time>
  );
}
