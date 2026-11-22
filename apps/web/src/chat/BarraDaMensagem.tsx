// O menu da mensagem (spec modulo-chat, "Menu da mensagem"; spec chat, "Reações", "Link da
// mensagem" e "Silenciar uma conversa"; change chat-com-chamados, design, decisão 15, "A caixa e o
// menu da mensagem"; mockup m01): a barra no canto da mensagem, com o mouse ou o foco nela, com
// "Reagir", "Responder" e "Mais". "Reagir" dá as três de sempre e a reação escrita; "Mais" abre o
// menu em camada opaca, com "Transformar em chamado" no azul do chamado, a quem pode abri-lo. Os
// itens do "Mais" servem também ao menu do botão direito e da tecla de menu (`MenuDaMensagem`).
import {
  avisar,
  Botao,
  BotaoDeIcone,
  CampoDeTexto,
  copiarParaAreaDeTransferencia,
  ItemDeMenu,
  Menu,
  Popover,
  SecaoDeMenu,
  Separador,
  Submenu,
  usePostura,
} from '@grafite/ui';
import {
  Bell,
  BellOff,
  CornerUpLeft,
  Ellipsis,
  LifeBuoy,
  Link,
  PenLine,
  SmilePlus,
} from 'lucide-react';
import { type FormEvent, type RefObject, useRef, useState } from 'react';
import type { MensagemDoChat } from './conversa.ts';
import estilos from './FluxoDaConversa.module.css';

/** As três reações de sempre (spec chat, "Reações"). */
export const REACOES_RAPIDAS = ['+1', 'ok', 'visto'] as const;

/** Reage com o texto, ou tira a reação da conta com ele; devolve a recusa, ou nulo. */
export type Reagir = (mensagem: MensagemDoChat, texto: string) => Promise<string | null>;

/** O que a mensagem pede à tela da conversa. */
export interface AcoesDaMensagem {
  /** Põe a mensagem em cima da caixa, como a respondida; nulo a quem não escreve na conversa. */
  responder: ((mensagem: MensagemDoChat) => void) | null;
  /** Nulo na conversa arquivada, que não muda mais. */
  reagir: Reagir | null;
  /**
   * Abre o transformar em chamado, com o nome de quem escreveu como a conversa o mostra; nulo a quem
   * não pode abrir um chamado pelo chat.
   */
  transformar: ((mensagem: MensagemDoChat, autor: string) => void) | null;
  silenciada: boolean;
  /** Silencia a conversa, ou volta a ouvi-la. */
  silenciar: (silenciada: boolean) => void;
}

/** Reage, e a recusa, como "A mensagem já tem 10 reações diferentes.", vira o aviso. */
export function reagirAvisando(reagir: Reagir, mensagem: MensagemDoChat, texto: string) {
  void reagir(mensagem, texto).then((recusa) => {
    if (recusa) avisar({ situacao: 'atencao', titulo: recusa });
  });
}

/** O endereço da mensagem no app do chat, que abre a conversa nela (spec chat, "Link da mensagem"). */
export const linkDaMensagem = (conversa: string, mensagem: string) =>
  `${window.location.origin}/chat/c/${conversa}?m=${mensagem}`;

/** Copia o link da mensagem, com o aviso de que copiou ou de que não deu. */
export async function copiarOLink(conversa: string, mensagem: string) {
  try {
    await copiarParaAreaDeTransferencia(linkDaMensagem(conversa, mensagem));
    avisar({ situacao: 'sucesso', titulo: 'Link copiado.' });
  } catch {
    avisar({ situacao: 'atencao', titulo: 'Não foi possível copiar.' });
  }
}

/** O que os itens do menu da mensagem recebem de quem os mostra. */
interface PropsDosItens {
  mensagem: MensagemDoChat;
  /** O nome de quem escreveu, como a mensagem o mostra. */
  autor: string;
  conversa: string;
  acoes: AcoesDaMensagem;
  /**
   * Guarda o que leva o foco a outro lugar, como o responder, o transformar e a reação escrita, para
   * agir depois de o menu fechar e devolver o foco.
   */
  agirDepois: (agir: () => void) => void;
  /** Abre a reação escrita. */
  escrever: () => void;
  /**
   * Na janela estreita, as reações ficam no próprio menu, com o nome "Reagir" em cima: o submenu
   * não cabe ao lado do menu, de nenhum dos lados, e sairia da tela.
   */
  celular: boolean;
}

/**
 * As reações de sempre, com a marca nas da conta, e a reação escrita: no menu do "Reagir" da barra,
 * no submenu "Reagir" do "Mais" ou, na janela estreita, no próprio "Mais", com o nome em cima.
 */
function reacoesNoMenu(
  reagir: Reagir,
  { mensagem, agirDepois, escrever }: Pick<PropsDosItens, 'mensagem' | 'agirDepois' | 'escrever'>,
  noProprioMenu = false,
) {
  const minhas = mensagem.reacoes.filter(({ minha }) => minha).map(({ texto }) => texto);
  return (
    <>
      <SecaoDeMenu
        titulo={noProprioMenu ? 'Reagir' : undefined}
        aria-label={noProprioMenu ? undefined : 'Reações de sempre'}
        selectionMode="multiple"
        shouldCloseOnSelect
        selectedKeys={minhas}
        onSelectionChange={(chaves) => {
          if (chaves === 'all') return;
          const mudou = REACOES_RAPIDAS.find(
            (texto) => chaves.has(texto) !== minhas.includes(texto),
          );
          if (mudou) reagirAvisando(reagir, mensagem, mudou);
        }}
      >
        {REACOES_RAPIDAS.map((texto) => (
          <ItemDeMenu key={texto} id={texto}>
            {texto}
          </ItemDeMenu>
        ))}
      </SecaoDeMenu>
      {!noProprioMenu && <Separador />}
      <ItemDeMenu id="escrever" icone={PenLine} onAction={() => agirDepois(escrever)}>
        Escrever a reação…
      </ItemDeMenu>
    </>
  );
}

/**
 * Os itens do "Mais", escritos uma vez para os dois menus da mensagem: o do botão e o do botão
 * direito e da tecla de menu (change chat-com-chamados, decisão 15, "Os pedidos do usuário de
 * 22/11").
 */
export function itensDaMensagem(props: PropsDosItens) {
  const { mensagem, autor, conversa, acoes, agirDepois } = props;
  const { responder, reagir, transformar } = acoes;
  return (
    <>
      {responder && (
        <ItemDeMenu
          id="responder"
          icone={CornerUpLeft}
          onAction={() => agirDepois(() => responder(mensagem))}
        >
          Responder
        </ItemDeMenu>
      )}
      {reagir &&
        (props.celular ? (
          <>
            {responder && <Separador />}
            {reacoesNoMenu(reagir, props, true)}
            <Separador />
          </>
        ) : (
          <Submenu rotulo="Reagir" icone={SmilePlus} dica={REACOES_RAPIDAS.join(' · ')}>
            {reacoesNoMenu(reagir, props)}
          </Submenu>
        ))}
      <ItemDeMenu id="link" icone={Link} onAction={() => void copiarOLink(conversa, mensagem.id)}>
        Copiar link da mensagem
      </ItemDeMenu>
      <Separador />
      {transformar && (
        <ItemDeMenu
          id="transformar"
          icone={LifeBuoy}
          informativo
          atalho={['ctrl', 'shift', 'T']}
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
        onAction={() => acoes.silenciar(!acoes.silenciada)}
      >
        {acoes.silenciada ? 'Voltar a ouvir a conversa' : 'Silenciar a conversa'}
      </ItemDeMenu>
    </>
  );
}

export function BarraDaMensagem({
  mensagem,
  autor,
  conversa,
  acoes,
  presa = false,
}: {
  mensagem: MensagemDoChat;
  /** O nome de quem escreveu, como a mensagem o mostra. */
  autor: string;
  conversa: string;
  acoes: AcoesDaMensagem;
  /**
   * A barra fica à vista, e a mensagem marcada, como com um menu dela aberto: o do botão direito ou
   * da tecla de menu, que abre fora da barra.
   */
  presa?: boolean;
}) {
  const barra = useRef<HTMLDivElement>(null);
  const [abertos, definirAbertos] = useState(0);
  const [escrevendo, definirEscrevendo] = useState(false);
  // A reação escrita, o responder e o transformar do menu agem depois de o menu fechar e devolver o
  // foco ao botão dele: o popover aberto antes perderia o foco para essa volta; com o menu aberto, o
  // resto da página fica inerte, e o foco na caixa não pegaria; e o diálogo aberto antes guardaria o
  // item do menu, que sai, como o lugar da volta do foco.
  const naVolta = useRef<(() => void) | null>(null);
  const voltou = () => {
    const agir = naVolta.current;
    naVolta.current = null;
    agir?.();
  };
  const prender = (aberto: boolean) => definirAbertos((antes) => antes + (aberto ? 1 : -1));
  const { responder, reagir } = acoes;
  const dosItens: PropsDosItens = {
    mensagem,
    autor,
    conversa,
    acoes,
    agirDepois: (agir) => {
      naVolta.current = agir;
    },
    escrever: () => definirEscrevendo(true),
    celular: usePostura() === 'celular',
  };

  return (
    <div
      ref={barra}
      className={estilos.barra}
      data-presa={abertos > 0 || escrevendo || presa || undefined}
    >
      {reagir && (
        <Menu
          rotulo="Reagir"
          opaco
          posicao="bottom end"
          aoMudarAberto={prender}
          gatilho={
            <BotaoDeIcone
              icone={SmilePlus}
              rotulo="Reagir"
              className={estilos.botaoDaBarra}
              onFocus={voltou}
            />
          }
        >
          {reacoesNoMenu(reagir, dosItens)}
        </Menu>
      )}
      {responder && (
        <BotaoDeIcone
          icone={CornerUpLeft}
          rotulo="Responder"
          className={estilos.botaoDaBarra}
          onPress={() => responder(mensagem)}
        />
      )}
      <Menu
        rotulo={`Ações da mensagem de ${autor}`}
        opaco
        nomePeloRotulo
        posicao="bottom end"
        aoMudarAberto={prender}
        gatilho={
          <BotaoDeIcone
            icone={Ellipsis}
            rotulo="Mais"
            className={estilos.botaoDaBarra}
            onFocus={voltou}
            // O menu do botão direito e da tecla de menu abre junto dele.
            data-mais=""
          />
        }
      >
        {itensDaMensagem(dosItens)}
      </Menu>
      {reagir && (
        <ReacaoEscrita
          ancora={barra}
          aberta={escrevendo}
          aoMudarAberta={definirEscrevendo}
          reagir={(texto) => reagir(mensagem, texto)}
        />
      )}
    </div>
  );
}

/**
 * A reação escrita, de 1 a 20 caracteres, num popover opaco, com a recusa no campo, preso à barra
 * da mensagem ou, no celular, à mensagem.
 */
export function ReacaoEscrita({
  ancora,
  aberta,
  aoMudarAberta,
  reagir,
}: {
  ancora: RefObject<Element | null>;
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
  reagir: (texto: string) => Promise<string | null>;
}) {
  const [texto, definirTexto] = useState('');
  const [recusa, definirRecusa] = useState<string | null>(null);
  const [reagindo, definirReagindo] = useState(false);
  const fechar = () => {
    aoMudarAberta(false);
    definirTexto('');
    definirRecusa(null);
  };
  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (reagindo) return;
    definirReagindo(true);
    const motivo = await reagir(texto);
    definirReagindo(false);
    if (motivo) definirRecusa(motivo);
    else fechar();
  };
  return (
    <Popover
      ancora={ancora}
      aberto={aberta}
      aoMudarAberto={(aberto) => (aberto ? aoMudarAberta(true) : fechar())}
      titulo="Escrever a reação"
      opaco
      posicao="bottom end"
    >
      <form className={estilos.reacaoEscrita} onSubmit={(evento) => void enviar(evento)}>
        <CampoDeTexto
          rotulo="Reação"
          autoFocus
          value={texto}
          onChange={(novo) => {
            definirTexto(novo);
            definirRecusa(null);
          }}
          erro={recusa ?? undefined}
        />
        <div className={estilos.acoesDaReacao}>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao type="submit" nivel="primario" carregando={reagindo} rotuloCarregando="Reagindo">
            Reagir
          </Botao>
        </div>
      </form>
    </Popover>
  );
}
