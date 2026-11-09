import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import estilosDoModal from '../componentes/modal/Modal.module.css';
import { BotaoDeIcone, Icone } from '../icones/Icone.tsx';
import estilos from './PainelDeBaixo.module.css';
import type { ItemDoMenuDaCasca } from './tipos.ts';

export interface PropsDoPainelDeBaixo {
  titulo: string;
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  itens: readonly ItemDoMenuDaCasca[];
  /** Um item sem submenu foi escolhido; o painel fecha em seguida. */
  aoEscolher: (idDoItem: string) => void;
}

/**
 * Painel que sobe de baixo, com a árvore de um menu no celular (variante da gaveta do F0: véu,
 * foco preso, Esc e o foco de volta a quem abriu). Um submenu abre no próprio painel, com o
 * título do nível e Voltar.
 */
export function PainelDeBaixo({
  titulo,
  aberto,
  aoMudarAberto,
  itens,
  aoEscolher,
}: PropsDoPainelDeBaixo) {
  const [pilha, definirPilha] = useState<readonly ItemDoMenuDaCasca[]>([]);
  const listaRef = useRef<HTMLUListElement>(null);
  /** Depois de trocar de nível: o id do item a focar ao voltar, ou null para o primeiro. */
  const focoDepois = useRef<string | null | undefined>(undefined);
  const nivel = pilha.at(-1);
  const lista = nivel?.filhos ?? itens;

  useEffect(() => {
    if (focoDepois.current === undefined) return;
    const id = focoDepois.current;
    focoDepois.current = undefined;
    const botoes = listaRef.current?.querySelectorAll<HTMLElement>('[data-id]') ?? [];
    const alvo = [...botoes].find((botao) => id === null || botao.dataset.id === id);
    alvo?.focus();
  });

  const mudarAberto = (abrir: boolean) => {
    if (!abrir) definirPilha([]);
    aoMudarAberto(abrir);
  };

  const escolher = (item: ItemDoMenuDaCasca) => {
    if (item.filhos) {
      focoDepois.current = null;
      definirPilha((atual) => [...atual, item]);
      return;
    }
    aoEscolher(item.id);
    mudarAberto(false);
  };

  return (
    <ModalOverlay
      isOpen={aberto}
      onOpenChange={mudarAberto}
      isDismissable
      className={`${estilosDoModal.veu} ${estilos.veu}`}
    >
      <Modal className={estilos.painel}>
        <Dialog className={estilos.dialogo}>
          <div className={estilosDoModal.cabecalho}>
            {nivel ? (
              <Button
                className={estilos.voltar}
                onPress={() => {
                  focoDepois.current = nivel.id;
                  definirPilha((atual) => atual.slice(0, -1));
                }}
              >
                <Icone icone={ChevronLeft} />
                Voltar
              </Button>
            ) : null}
            <Heading slot="title" className={`${estilosDoModal.titulo} ${estilos.titulo}`}>
              {nivel?.rotulo ?? titulo}
            </Heading>
            <BotaoDeIcone
              icone={X}
              rotulo="Fechar"
              slot="close"
              comDica={false}
              className={estilos.fechar}
            />
          </div>
          <ul ref={listaRef} className={estilos.lista}>
            {lista.map((item) => (
              <li key={item.id}>
                <Button className={estilos.item} data-id={item.id} onPress={() => escolher(item)}>
                  <span>{item.rotulo}</span>
                  {item.filhos && <Icone icone={ChevronRight} />}
                </Button>
              </li>
            ))}
          </ul>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
