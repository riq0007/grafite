// O "Andamento" do chamado no chat de quem atende pelo chat (spec modulo-chat, "Andamento do chamado
// no chat"; change andamento-e-varias-mensagens, decisões 2 e 9): o menu, em camada opaca, com as
// ações que o chamado aceita agora, na ordem do domínio, e, separado no fim, "Abrir no Chamados". O
// assumir, o passar e o devolver vão pelo `useAcoesDoAtendimento` do Chamados, com o "Desfazer" do
// assumir; o retomar, pela rota da TI, no gancho do chat. Depois de cada ação, aceita ou recusada, a
// tela relê o chamado do chat e as listas. No computador, o botão "Andamento" do cabeçalho; no
// celular, o de ícone "Andamento do #1045", com o submenu embaixo do item, como o kit faz.
import type { AcaoDoAndamento } from '@grafite/domain';
import { Botao, BotaoDeIcone, ItemDeMenu, Menu, Separador, Submenu } from '@grafite/ui';
import {
  ArrowLeftRight,
  HandGrab,
  ListChecks,
  Play,
  SquareArrowOutUpRight,
  Undo2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useAcoesDoAtendimento } from '../modulos/chamados/acoes.ts';
import { textoDosAbertos } from '../modulos/chamados/quadro/quadro.ts';
import { useIrNoChat, useOndeEstaOChat } from './base.tsx';
import type { ConversaDoChamado } from './chamado.ts';
import { useAndamentoNoChat, useQuemRecebeNoChat, useRelerOsChamadosDoChat } from './consultas.ts';

type Andamento = NonNullable<ConversaDoChamado['andamento']>;

/** As ações que este menu já tem; o aguardar, o resolver e o reabrir vêm com os diálogos dele. */
const NO_MENU = [
  'assumir',
  'passar',
  'devolver',
  'retomar',
] as const satisfies readonly AcaoDoAndamento[];
type NoMenu = (typeof NO_MENU)[number];
const estaNoMenu = (acao: AcaoDoAndamento): acao is NoMenu =>
  (NO_MENU as readonly string[]).includes(acao);

export function AndamentoDoChamado({
  numero,
  andamento,
  celular,
}: {
  numero: number;
  andamento: Andamento;
  celular: boolean;
}) {
  const reler = useRelerOsChamadosDoChat();
  const atendimento = useAcoesDoAtendimento({ aoMudar: reler });
  const doChat = useAndamentoNoChat(numero);
  const irNoChat = useIrNoChat();
  const noApp = useOndeEstaOChat() === 'app';
  const [aberto, definirAberto] = useState(false);
  const { versao } = andamento;
  const acoes = andamento.acoes.filter(estaNoMenu);

  const itens: Record<NoMenu, () => ReactNode> = {
    assumir: () => (
      <ItemDeMenu
        key="assumir"
        id="assumir"
        icone={HandGrab}
        onAction={() => void atendimento.assumir(numero, versao)}
      >
        Assumir
      </ItemDeMenu>
    ),
    passar: () => (
      <Submenu key="passar" rotulo="Passar para…" icone={ArrowLeftRight}>
        <QuemRecebe
          numero={numero}
          ligado={aberto}
          aoEscolher={(conta) => void atendimento.passar(numero, versao, conta)}
        />
      </Submenu>
    ),
    devolver: () => (
      <ItemDeMenu
        key="devolver"
        id="devolver"
        icone={Undo2}
        onAction={() => void atendimento.devolver(numero, versao)}
      >
        Devolver à triagem
      </ItemDeMenu>
    ),
    retomar: () => (
      <ItemDeMenu
        key="retomar"
        id="retomar"
        icone={Play}
        onAction={() => void doChat.retomar(versao)}
      >
        Retomar
      </ItemDeMenu>
    ),
  };

  const rotulo = `Andamento do #${numero}`;
  return (
    <Menu
      rotulo={rotulo}
      opaco
      nomePeloRotulo
      posicao="bottom end"
      aoMudarAberto={definirAberto}
      gatilho={
        celular ? (
          <BotaoDeIcone icone={ListChecks} rotulo={rotulo} comDica={false} />
        ) : (
          <Botao icone={ListChecks}>Andamento</Botao>
        )
      }
    >
      {acoes.map((acao) => itens[acao]())}
      {acoes.length > 0 && <Separador />}
      <ItemDeMenu
        id="abrir-no-chamados"
        icone={SquareArrowOutUpRight}
        // No app, o Grafite abre numa janela nova; na casca, no módulo.
        descricao={noApp ? 'No Grafite, numa janela nova' : undefined}
        onAction={() => irNoChat(`/chamados/${numero}`)}
      >
        Abrir no Chamados
      </ItemDeMenu>
    </Menu>
  );
}

/**
 * O submenu do "Passar para…": cada conta com os abertos dela, como "2 abertos"; enquanto lê,
 * "Carregando quem atende…"; na falha, a frase do erro; e, sem ninguém, a frase do Chamados.
 */
function QuemRecebe({
  numero,
  ligado,
  aoEscolher,
}: {
  numero: number;
  ligado: boolean;
  aoEscolher: (conta: string) => void;
}) {
  const quem = useQuemRecebeNoChat(numero, ligado);
  if (!quem.data) {
    return (
      <ItemDeMenu id="carregando" isDisabled>
        {quem.isError ? quem.error.message : 'Carregando quem atende…'}
      </ItemDeMenu>
    );
  }
  if (quem.data.contas.length === 0) {
    return (
      <ItemDeMenu id="ninguem" isDisabled>
        Ninguém mais atende os locais do chamado.
      </ItemDeMenu>
    );
  }
  return quem.data.contas.map((conta) => (
    <ItemDeMenu
      key={conta.conta}
      id={conta.conta}
      descricao={textoDosAbertos(conta.abertos)}
      onAction={() => aoEscolher(conta.conta)}
    >
      {conta.nome}
    </ItemDeMenu>
  ));
}
