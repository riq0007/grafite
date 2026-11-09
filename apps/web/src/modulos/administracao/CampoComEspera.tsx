import { CampoDeTexto } from '@grafite/ui';
import { useEffect, useState } from 'react';

/** Quanto a digitação espera parada antes de ir à API. */
const ESPERA = 250;

export interface PropsDoCampoComEspera {
  rotulo: string;
  /** O valor em vigor, como o da query string; quando ele muda por fora, o campo acompanha. */
  valor: string;
  aoMudar: (texto: string) => void;
  placeholder?: string;
  type?: 'search' | 'text';
}

/**
 * Um filtro de texto: vai à API quando a digitação para, e acompanha a limpeza dos filtros, como a
 * busca das pessoas e o código de rastreio da auditoria.
 */
export function CampoComEspera({
  rotulo,
  valor,
  aoMudar,
  placeholder,
  type = 'text',
}: PropsDoCampoComEspera) {
  const [texto, definirTexto] = useState(valor);
  const [ultimoValor, definirUltimoValor] = useState(valor);
  if (valor !== ultimoValor) {
    definirUltimoValor(valor);
    definirTexto(valor);
  }
  useEffect(() => {
    if (texto === valor) return;
    const espera = setTimeout(() => aoMudar(texto), ESPERA);
    return () => clearTimeout(espera);
  }, [texto, valor, aoMudar]);
  return (
    <CampoDeTexto
      type={type}
      rotulo={rotulo}
      placeholder={placeholder}
      autoComplete="off"
      value={texto}
      onChange={definirTexto}
    />
  );
}
