// O menu da mensagem no botão direito e na tecla de menu (spec modulo-chat, "Menu da mensagem";
// change chat-com-chamados, design, decisão 15, "Os pedidos do usuário de 22/11"): o mesmo menu do
// "Mais", em camada opaca, onde o ponteiro está ou junto do "Mais". A mensagem fica com o foco, sem
// rolar a conversa, e marcada enquanto o menu está aberto. O que leva o foco a outro lugar, como o
// responder, o transformar e a reação escrita, age depois de o menu sair, com o foco de volta na
// mensagem, que fica como o lugar da volta do diálogo e do popover, como na folha do celular. O menu
// do navegador não abre por cima deste, nem no que o Chromium no Windows manda ao soltar a tecla de
// menu, ao item que já tem o foco.
import { MenuDeContexto, usePostura } from '@grafite/ui';
import { useEffect, useRef, useState } from 'react';
import { type AcoesDaMensagem, itensDaMensagem, ReacaoEscrita } from './BarraDaMensagem.tsx';
import type { MensagemDoChat } from './conversa.ts';

export function MenuDaMensagem({
  mensagem,
  autor,
  conversa,
  acoes,
  elemento,
  posicao,
  aoSair,
}: {
  mensagem: MensagemDoChat;
  /** O nome de quem escreveu, como a conversa o mostra. */
  autor: string;
  conversa: string;
  acoes: AcoesDaMensagem;
  /** A mensagem na conversa, que fica com o foco e com a reação escrita presa ao começo dela. */
  elemento: HTMLElement;
  /** Onde o menu abre, nas coordenadas da janela. */
  posicao: { x: number; y: number };
  /** O menu e a reação escrita que ele abriu saíram: a mensagem deixa de ficar marcada. */
  aoSair: () => void;
}) {
  const [aberto, definirAberto] = useState(true);
  /** O menu saiu, com o foco de volta na mensagem e a ação feita. */
  const [saiu, definirSaiu] = useState(false);
  const [escrevendo, definirEscrevendo] = useState(false);
  // A reação escrita se prende ao começo da mensagem, a foto ou a hora da seguida, e não a ela
  // inteira, como na folha: o popover tem ao menos a largura de onde se prende.
  const ancora = useRef<Element | null>(elemento.firstElementChild ?? elemento);
  const depois = useRef<(() => void) | null>(null);
  const celular = usePostura() === 'celular';
  const { reagir } = acoes;

  useEffect(() => {
    if (saiu && !escrevendo) aoSair();
  }, [saiu, escrevendo, aoSair]);

  return (
    <>
      <MenuDeContexto
        rotulo={`Ações da mensagem de ${autor}`}
        posicao={aberto ? posicao : null}
        opaco
        origem={elemento}
        semRolar
        semMenuDoNavegador
        aoFechar={() => definirAberto(false)}
        aoVoltarOFoco={() => {
          const agir = depois.current;
          depois.current = null;
          agir?.();
          definirSaiu(true);
        }}
      >
        {itensDaMensagem({
          mensagem,
          autor,
          conversa,
          acoes,
          agirDepois: (agir) => {
            depois.current = agir;
          },
          escrever: () => definirEscrevendo(true),
          celular,
        })}
      </MenuDeContexto>
      {reagir && (
        <ReacaoEscrita
          ancora={ancora}
          aberta={escrevendo}
          aoMudarAberta={definirEscrevendo}
          reagir={(texto) => reagir(mensagem, texto)}
        />
      )}
    </>
  );
}
