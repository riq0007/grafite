// A folha da mensagem no celular (spec modulo-chat, "Chat no celular" e "Menu da mensagem"; change
// chat-com-chamados, design, decisão 15, "O celular"; mockup m09): o toque longo levanta a mensagem,
// acima da folha, com as reações de sempre e a escrita, e a folha tem o menu da mensagem, com
// "Copiar o texto", que o toque não seleciona, e "Transformar em chamado" no azul. O que leva o foco
// a outro lugar, como o responder, o transformar e a reação escrita, age depois de a folha sair, com
// o foco de volta na mensagem, que fica como o lugar da volta do diálogo e do popover.
import {
  Avatar,
  avisar,
  copiarParaAreaDeTransferencia,
  Folha,
  Icone,
  ItemDeMenu,
  MenuNaFolha,
  useDataHora,
} from '@grafite/ui';
import { Bell, BellOff, Check, Copy, CornerUpLeft, LifeBuoy, Link, PenLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { miniaturasNoChat } from '../api/fotos.ts';
import {
  type AcoesDaMensagem,
  copiarOLink,
  REACOES_RAPIDAS,
  ReacaoEscrita,
  reagirAvisando,
} from './BarraDaMensagem.tsx';
import type { MensagemDoChat } from './conversa.ts';
import estilos from './FolhaDaMensagem.module.css';

async function copiarOTexto(texto: string) {
  try {
    await copiarParaAreaDeTransferencia(texto);
    avisar({ situacao: 'sucesso', titulo: 'Texto copiado.' });
  } catch {
    avisar({ situacao: 'atencao', titulo: 'Não foi possível copiar.' });
  }
}

export function FolhaDaMensagem({
  mensagem,
  autor,
  conversa,
  acoes,
  elemento,
}: {
  mensagem: MensagemDoChat;
  /** O nome de quem escreveu, como a conversa o mostra. */
  autor: string;
  conversa: string;
  acoes: AcoesDaMensagem;
  /** A mensagem na conversa, que fica com o foco e com a reação escrita presa a ela. */
  elemento: HTMLElement;
}) {
  const [aberta, definirAberta] = useState(true);
  const [escrevendo, definirEscrevendo] = useState(false);
  // A reação escrita se prende ao começo da mensagem, a foto ou a hora da seguida, e não a ela
  // inteira: o popover tem ao menos a largura de onde se prende e passaria da borda da tela.
  const ancora = useRef<Element | null>(elemento.firstElementChild ?? elemento);
  const depois = useRef<(() => void) | null>(null);
  const dataHora = useDataHora();
  const { responder, reagir, transformar } = acoes;
  const minhas = new Set(mensagem.reacoes.filter(({ minha }) => minha).map(({ texto }) => texto));

  /** Fecha a folha, e a ação age depois de ela sair, com o foco de volta na mensagem. */
  const agirDepois = (agir: () => void) => {
    depois.current = agir;
    definirAberta(false);
  };
  const sair = () => {
    const agir = depois.current;
    depois.current = null;
    if (!agir) return;
    elemento.focus({ preventScroll: true });
    agir();
  };

  const acima = (
    <>
      {reagir && (
        <fieldset aria-label="Reações de sempre" className={estilos.reacoes}>
          {REACOES_RAPIDAS.map((texto) => (
            <button
              key={texto}
              type="button"
              className={estilos.reacao}
              aria-pressed={minhas.has(texto)}
              onClick={() => {
                reagirAvisando(reagir, mensagem, texto);
                definirAberta(false);
              }}
            >
              {minhas.has(texto) && <Icone icone={Check} tamanho={16} />}
              {texto}
            </button>
          ))}
          <button
            type="button"
            className={estilos.reacao}
            aria-label="Escrever a reação…"
            onClick={() => agirDepois(() => definirEscrevendo(true))}
          >
            <Icone icone={PenLine} tamanho={20} />
          </button>
        </fieldset>
      )}
      <div className={estilos.levantada}>
        <Avatar
          nome={mensagem.autor.nome}
          imagens={miniaturasNoChat(mensagem.autor.conta, mensagem.autor.foto)}
          className={estilos.foto}
          decorativo
        />
        <div className={estilos.corpo}>
          <p className={estilos.quem}>
            <span className={estilos.nome}>{autor}</span>
            <time dateTime={mensagem.criadaEm}>
              {dataHora.formatarHora(new Date(mensagem.criadaEm))}
            </time>
          </p>
          {mensagem.texto ? <p className={estilos.texto}>{mensagem.texto}</p> : null}
        </div>
      </div>
    </>
  );

  return (
    <>
      <Folha
        aberta={aberta}
        aoMudarAberta={definirAberta}
        rotulo={`Mensagem de ${autor}`}
        acima={acima}
        aoSair={sair}
      >
        {(fechar) => (
          <MenuNaFolha rotulo={`Ações da mensagem de ${autor}`}>
            {responder && (
              <ItemDeMenu
                id="responder"
                icone={CornerUpLeft}
                onAction={() => agirDepois(() => responder(mensagem))}
              >
                Responder
              </ItemDeMenu>
            )}
            {mensagem.texto ? (
              <ItemDeMenu
                id="copiar"
                icone={Copy}
                onAction={() => {
                  void copiarOTexto(mensagem.texto ?? '');
                  fechar();
                }}
              >
                Copiar o texto
              </ItemDeMenu>
            ) : null}
            <ItemDeMenu
              id="link"
              icone={Link}
              onAction={() => {
                void copiarOLink(conversa, mensagem.id);
                fechar();
              }}
            >
              Copiar link da mensagem
            </ItemDeMenu>
            {transformar && (
              <ItemDeMenu
                id="transformar"
                icone={LifeBuoy}
                informativo
                isDisabled={mensagem.chamado !== null}
                descricao={mensagem.chamado ? `Já virou o #${mensagem.chamado.numero}` : undefined}
                onAction={() => agirDepois(() => transformar(mensagem, autor))}
              >
                Transformar em chamado
              </ItemDeMenu>
            )}
            <ItemDeMenu
              id="silenciar"
              icone={acoes.silenciada ? Bell : BellOff}
              onAction={() => {
                acoes.silenciar(!acoes.silenciada);
                fechar();
              }}
            >
              {acoes.silenciada ? 'Voltar a ouvir a conversa' : 'Silenciar a conversa'}
            </ItemDeMenu>
          </MenuNaFolha>
        )}
      </Folha>
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
