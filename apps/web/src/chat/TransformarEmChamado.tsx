// "Transformar em chamado" (spec modulo-chat, "Transformar em chamado na tela"; mockup m02): o
// diálogo que o menu da mensagem e o Ctrl+Shift+T abrem, com a mensagem citada como ela é, com quem
// escreveu e a hora.
import { Botao, Dialogo, useDataHora } from '@grafite/ui';
import { useState } from 'react';
import type { MensagemDoChat } from './conversa.ts';
import estilos from './TransformarEmChamado.module.css';

/** A mensagem que vira chamado, com o nome de quem a escreveu como a conversa o mostra. */
export interface MensagemATransformar {
  mensagem: MensagemDoChat;
  autor: string;
}

export function TransformarEmChamado({
  alvo,
  aoFechar,
}: {
  alvo: MensagemATransformar | null;
  aoFechar: () => void;
}) {
  const dataHora = useDataHora();
  // A citada continua no diálogo enquanto ele sai da tela.
  const [mostrada, definirMostrada] = useState(alvo);
  if (alvo !== null && alvo !== mostrada) definirMostrada(alvo);
  const citada = alvo ?? mostrada;
  return (
    <Dialogo
      titulo="Transformar em chamado"
      aberto={alvo !== null}
      aoMudarAberto={(aberto) => {
        if (!aberto) aoFechar();
      }}
      acoes={(fechar) => <Botao onPress={fechar}>Cancelar</Botao>}
    >
      {citada && (
        <figure className={estilos.citada}>
          <figcaption className={estilos.quem}>
            <span className={estilos.autor}>{citada.autor}</span>
            <span className={estilos.paraOLeitor}> · </span>
            <time className={estilos.hora} dateTime={citada.mensagem.criadaEm}>
              {dataHora.formatarHora(new Date(citada.mensagem.criadaEm))}
            </time>
          </figcaption>
          {citada.mensagem.texto && (
            <blockquote className={estilos.texto}>{citada.mensagem.texto}</blockquote>
          )}
        </figure>
      )}
    </Dialogo>
  );
}
