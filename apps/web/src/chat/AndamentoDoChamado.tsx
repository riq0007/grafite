// O "Andamento" do chamado no chat de quem atende pelo chat (spec modulo-chat, "Andamento do chamado
// no chat"; change andamento-e-varias-mensagens, decisões 2 e 9): o menu, em camada opaca, com as
// ações que o chamado aceita agora, na ordem do domínio, e, separado no fim, "Abrir no Chamados". O
// assumir, o passar, o devolver e o reabrir vão pelo `useAcoesDoAtendimento` do Chamados, com o
// "Desfazer" do assumir; o aguardar, o retomar e o resolver, pelas rotas da TI, no gancho do chat, e
// o aguardar e o resolver pedem num diálogo, que fica aberto, com o texto escrito, na recusa. Depois
// de cada ação, aceita ou recusada, a tela relê o chamado do chat e as listas. No computador, o botão
// "Andamento" do cabeçalho; no celular, o de ícone "Andamento do #1045", com o submenu embaixo do
// item, como o kit faz.
import { type AcaoDoAndamento, LIMITES_DA_CONVERSA, nomeCurto } from '@grafite/domain';
import {
  AreaDeTexto,
  Botao,
  BotaoDeIcone,
  Dialogo,
  ItemDeMenu,
  MensagemDoPasso,
  Menu,
  Separador,
  Submenu,
} from '@grafite/ui';
import {
  ArrowLeftRight,
  CircleCheck,
  HandGrab,
  Hourglass,
  ListChecks,
  Play,
  RotateCcw,
  SquareArrowOutUpRight,
  Undo2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useAcoesDoAtendimento } from '../modulos/chamados/acoes.ts';
import { ajudaDoCampo } from '../modulos/chamados/chamado/escrever.ts';
import { textoDosAbertos } from '../modulos/chamados/quadro/quadro.ts';
import estilos from './AndamentoDoChamado.module.css';
import { useIrNoChat, useOndeEstaOChat } from './base.tsx';
import type { ConversaDoChamado } from './chamado.ts';
import {
  type RecusaNoAndamento,
  useAndamentoNoChat,
  useQuemRecebeNoChat,
  useRelerOsChamadosDoChat,
} from './consultas.ts';

type Andamento = NonNullable<ConversaDoChamado['andamento']>;

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
  const [dialogo, definirDialogo] = useState<'esperar' | 'resolver' | null>(null);
  const { versao, acoes, pessoa } = andamento;
  const primeiroNome = nomeCurto(pessoa.nome);
  const abrirNoChamados = () => irNoChat(`/chamados/${numero}`);

  const itens: Record<AcaoDoAndamento, () => ReactNode> = {
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
    esperar: () => (
      <ItemDeMenu
        key="esperar"
        id="esperar"
        icone={Hourglass}
        onAction={() => definirDialogo('esperar')}
      >
        {`Aguardar ${primeiroNome}…`}
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
    resolver: () => (
      <ItemDeMenu
        key="resolver"
        id="resolver"
        icone={CircleCheck}
        onAction={() => definirDialogo('resolver')}
      >
        Resolver…
      </ItemDeMenu>
    ),
    reabrir: () => (
      <ItemDeMenu
        key="reabrir"
        id="reabrir"
        icone={RotateCcw}
        onAction={() => void atendimento.reabrir(numero, versao)}
      >
        Reabrir
      </ItemDeMenu>
    ),
  };

  const rotulo = `Andamento do #${numero}`;
  return (
    <>
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
          onAction={abrirNoChamados}
        >
          Abrir no Chamados
        </ItemDeMenu>
      </Menu>
      <DialogoDoAndamento
        aberto={dialogo === 'esperar'}
        aoFechar={() => definirDialogo(null)}
        titulo={`Aguardar ${primeiroNome} no #${numero}`}
        campo={{
          rotulo: `Mensagem para ${primeiroNome}`,
          maximo: LIMITES_DA_CONVERSA.mensagem,
          // À pessoa que não usa o chat, a frase do Chamados.
          descricao: pessoa.usaOChat ? undefined : ajudaDoCampo(primeiroNome, false),
        }}
        confirmar={{ rotulo: 'Enviar e aguardar', carregando: 'Enviando' }}
        aoConfirmar={(texto) => doChat.esperar(texto, pessoa.nome)}
        abrirNoChamados={abrirNoChamados}
      />
      <DialogoDoAndamento
        aberto={dialogo === 'resolver'}
        aoFechar={() => definirDialogo(null)}
        titulo={`Resolver o #${numero}`}
        campo={{ rotulo: 'O que foi feito', maximo: LIMITES_DA_CONVERSA.feito }}
        confirmar={{ rotulo: 'Resolver', carregando: 'Resolvendo' }}
        aoConfirmar={(feito) => doChat.resolver(versao, feito)}
        abrirNoChamados={abrirNoChamados}
      />
    </>
  );
}

/**
 * O diálogo do aguardar e do resolver: o campo, "Cancelar" e a ação. A recusa do campo fica nele, e
 * toda outra vai no alto, com o diálogo aberto e o texto escrito; a do campo só da TI vazio leva
 * também "Abrir no Chamados", onde o campo se preenche.
 */
function DialogoDoAndamento({
  aberto,
  aoFechar,
  titulo,
  campo,
  confirmar,
  aoConfirmar,
  abrirNoChamados,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  campo: { rotulo: string; maximo: number; descricao?: string | undefined };
  confirmar: { rotulo: string; carregando: string };
  aoConfirmar: (texto: string) => Promise<RecusaNoAndamento | null>;
  abrirNoChamados: () => void;
}) {
  const [texto, definirTexto] = useState('');
  const [erro, definirErro] = useState<string | null>(null);
  const [falha, definirFalha] = useState<RecusaNoAndamento | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  const limpar = () => {
    definirTexto('');
    definirErro(null);
    definirFalha(null);
  };

  const mudarAberto = (abrir: boolean) => {
    if (abrir || enviando) return;
    limpar();
    aoFechar();
  };

  const enviar = async () => {
    if (enviando) return;
    definirEnviando(true);
    const recusa = await aoConfirmar(texto);
    definirEnviando(false);
    if (!recusa) {
      limpar();
      aoFechar();
      return;
    }
    if (recusa.doCampo) {
      definirErro(recusa.erro);
      definirFalha(null);
      return;
    }
    definirFalha(recusa);
    definirTentativa((anterior) => anterior + 1);
  };

  return (
    <Dialogo
      titulo={titulo}
      aberto={aberto}
      aoMudarAberto={mudarAberto}
      acoes={(fechar) => (
        <>
          <Botao isDisabled={enviando} onPress={fechar}>
            Cancelar
          </Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando={confirmar.carregando}
            onPress={() => void enviar()}
          >
            {confirmar.rotulo}
          </Botao>
        </>
      )}
    >
      <div className={estilos.formulario}>
        {falha && (
          <div className={estilos.recusa}>
            <MensagemDoPasso texto={falha.erro} chave={tentativa} />
            {falha.abrirNoChamados && (
              <Botao icone={SquareArrowOutUpRight} onPress={abrirNoChamados}>
                Abrir no Chamados
              </Botao>
            )}
          </div>
        )}
        <AreaDeTexto
          rotulo={campo.rotulo}
          descricao={campo.descricao}
          value={texto}
          onChange={(novo) => {
            definirTexto(novo);
            definirErro(null);
          }}
          erro={erro ?? undefined}
          contador={{ maximo: campo.maximo }}
          autoFocus
        />
      </div>
    </Dialogo>
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
