// A lista da vista Chat (spec modulo-chat, "Lista do Chat" e "Selos e movimento do chat"; change
// chat-com-chamados, design, decisões 5 e 15; m01 e m03): o título, com "Nova conversa", e as
// seções: os chamados abertos da conta em CHAMADOS, no azul do chamado, com o que ela acaba de abrir
// no alto, aberto até quem o recolhe pela seta; os resolvidos que ainda se reabrem em FECHADOS,
// recolhido; as equipes e os canais; e as conversas diretas, em RECENTES. A conversa e o chamado do
// endereço ficam marcados.
import { secoesDoChat } from '@grafite/domain';
import { Avatar, Icone } from '@grafite/ui';
import { useRouterState } from '@tanstack/react-router';
import { BellOff, ChevronRight, Hash, LifeBuoy } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { miniaturasNoChat } from '../api/fotos.ts';
import { useServidor } from '../sessao/useSessao.tsx';
import { rotaComoNoApp } from './base.tsx';
import { Contador, contagemEmTexto, nomeParaOLeitor } from './Contador.tsx';
import { useChamadoNovo } from './chamadoNovo.tsx';
import {
  type ChamadoDeQuemParticipa,
  type ConversaNaLista,
  useChamadosDoChat,
  useConversasDoChat,
} from './consultas.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { LinkDoChat } from './LinkDoChat.tsx';
import estilos from './ListaDoChat.module.css';
import moldura from './MolduraDoChat.module.css';
import { NovaConversa } from './NovaConversa.tsx';
import { SeloDoChamado } from './SeloDoChamado.tsx';

const NENHUM_DESLIGADO: readonly string[] = [];

interface RotaCasada {
  routeId: string;
  params: unknown;
}

const parametro = (rota: RotaCasada | undefined, nome: string): string | undefined => {
  const params = rota?.params;
  if (typeof params !== 'object' || params === null || !(nome in params)) return undefined;
  const valor = (params as Record<string, unknown>)[nome];
  return typeof valor === 'string' ? valor : undefined;
};

/** A conversa do endereço, em minúsculas, como a lista compara os ids. */
const conversaDoEndereco = ({ matches }: { matches: readonly RotaCasada[] }) => {
  const ultima = matches.at(-1);
  if (!ultima || rotaComoNoApp(ultima.routeId) !== '/chat/c/$conversa') return null;
  return parametro(ultima, 'conversa')?.toLowerCase() ?? null;
};

/** O número do chamado do endereço. */
export const chamadoDoEndereco = ({ matches }: { matches: readonly RotaCasada[] }) => {
  const ultima = matches.at(-1);
  if (!ultima || rotaComoNoApp(ultima.routeId) !== '/chat/chamados/$numero') return null;
  const numero = Number(parametro(ultima, 'numero'));
  return Number.isSafeInteger(numero) ? numero : null;
};

/** O chamado com as datas, como as ordens do domínio as leem. */
export const comAsDatas = (chamado: ChamadoDeQuemParticipa) => ({
  ...chamado,
  abertoEm: new Date(chamado.abertoEm),
  resolvidoEm: chamado.resolvidoEm === null ? null : new Date(chamado.resolvidoEm),
});

export type ChamadoNaLista = ReturnType<typeof comAsDatas>;

export function ListaDoChat() {
  const idDoTitulo = useId();
  const desligados = useServidor()?.modulosDesligados ?? NENHUM_DESLIGADO;
  const comChamados = !desligados.includes('chamados');
  const conversas = useConversasDoChat();
  const chamados = useChamadosDoChat(comChamados);
  const { novo } = useChamadoNovo();
  const conversa = useRouterState({ select: conversaDoEndereco });
  const chamado = useRouterState({ select: chamadoDoEndereco });

  const secoes = useMemo(
    () =>
      chamados.data
        ? secoesDoChat(
            [...chamados.data.abertos, ...chamados.data.resolvidos].map(comAsDatas),
            novo,
          )
        : null,
    [chamados.data, novo],
  );
  const equipesECanais = conversas.data?.equipesECanais ?? [];
  const recentes = conversas.data?.recentes ?? [];

  return (
    <section aria-labelledby={idDoTitulo} className={`${moldura.lista} ${estilos.lista}`}>
      <div className={estilos.cabecalho}>
        <h1 id={idDoTitulo} className={estilos.titulo} tabIndex={-1} data-titulo-de-chegada="lista">
          Chat
        </h1>
        <NovaConversa className={estilos.novaConversa} />
      </div>
      <div className={estilos.secoes}>
        {comChamados && chamados.isError && !chamados.data && (
          <FalhaDoChat
            mensagem={chamados.error.message}
            relendo={chamados.isFetching}
            tentarDeNovo={() => void chamados.refetch()}
          />
        )}
        {conversas.isError && !conversas.data && (
          <FalhaDoChat
            mensagem={conversas.error.message}
            relendo={conversas.isFetching}
            tentarDeNovo={() => void conversas.refetch()}
          />
        )}
        {comChamados && secoes && (
          <SecaoDosChamados chamados={secoes.chamados} novo={novo} escolhido={chamado} />
        )}
        {secoes && secoes.fechados.length > 0 && (
          <SecaoDosFechados chamados={secoes.fechados} escolhido={chamado} />
        )}
        {equipesECanais.length > 0 && (
          <SecaoDasConversas
            titulo="Equipes e canais"
            conversas={equipesECanais}
            escolhida={conversa}
          />
        )}
        {recentes.length > 0 && (
          <SecaoDasConversas titulo="Recentes" conversas={recentes} escolhida={conversa} />
        )}
      </div>
    </section>
  );
}

const CHAVE_DOS_CHAMADOS = 'grafite.chat.chamadosRecolhidos';

/** CHAMADOS recolhido por quem o recolheu neste navegador; o que não se lê fica aberto. */
function chamadosRecolhidos(): boolean {
  try {
    return localStorage.getItem(CHAVE_DOS_CHAMADOS) === 'sim';
  } catch {
    // O armazenamento bloqueado: a seção aberta, como começa.
    return false;
  }
}

/** Guarda a escolha; com o armazenamento bloqueado, ela vale até a lista sair da tela. */
function guardarChamadosRecolhidos(recolhidos: boolean): void {
  try {
    if (recolhidos) localStorage.setItem(CHAVE_DOS_CHAMADOS, 'sim');
    else localStorage.removeItem(CHAVE_DOS_CHAMADOS);
  } catch {
    // Navegação privada ou armazenamento bloqueado: a escolha fica só na lista aberta.
  }
}

/** O número, quando ele é um dos chamados da seção. */
const naSecao = (chamados: readonly ChamadoNaLista[], numero: number | null) =>
  numero !== null && chamados.some((chamado) => chamado.numero === numero) ? numero : null;

/**
 * O título que abre e fecha a seção: o botão com a seta que gira, e a boia no de CHAMADOS. Recolhida,
 * a soma das respostas novas fica no contador azul ao lado do título e no nome dele, como
 * "Chamados · 3, 1 resposta nova".
 */
function TituloQueRecolhe({
  aberta,
  itens,
  alternar,
  chamado = false,
  respostasNovas = 0,
  children,
}: {
  aberta: boolean;
  itens: string;
  alternar: () => void;
  chamado?: boolean;
  respostasNovas?: number;
  children: string;
}) {
  const novas = aberta ? 0 : respostasNovas;
  const contagem = contagemEmTexto(novas, 'resposta nova', 'respostas novas');
  return (
    <h2 className={estilos.tituloDaSecao} data-tom={chamado ? 'chamado' : undefined}>
      <button
        type="button"
        className={estilos.recolher}
        aria-expanded={aberta}
        aria-controls={aberta ? itens : undefined}
        aria-label={contagem === null ? undefined : nomeParaOLeitor(children, contagem)}
        onClick={alternar}
      >
        <span className={estilos.seta}>
          <Icone icone={ChevronRight} tamanho={14} />
        </span>
        {chamado && <Icone icone={LifeBuoy} tamanho={14} />}
        {children}
        <Contador quantos={novas} tom="chamado" className={estilos.contadorDoTitulo} />
      </button>
    </h2>
  );
}

/**
 * CHAMADOS · N, com os abertos em cartões, ou "Nenhum chamado aberto.". A seção começa aberta e se
 * recolhe pela seta, com a escolha guardada no navegador. Ela abre sozinha quando o chamado do
 * endereço ou o que a conta acaba de abrir é um dos dela, e quem a recolhe depois a recolhe, até
 * outro chegar.
 */
function SecaoDosChamados({
  chamados,
  novo,
  escolhido,
}: {
  chamados: readonly ChamadoNaLista[];
  novo: number | null;
  escolhido: number | null;
}) {
  const idDosItens = useId();
  const doEscolhido = naSecao(chamados, escolhido);
  const doNovo = naSecao(chamados, novo);
  const [aberta, definirAberta] = useState(
    () => doEscolhido !== null || doNovo !== null || !chamadosRecolhidos(),
  );
  const [vistos, definirVistos] = useState({ escolhido: doEscolhido, novo: doNovo });
  // A seção que abre depois de a lista estar na tela entra como as que abrem; a que já começa aberta,
  // não.
  const [mudou, definirMudou] = useState(false);
  if (doEscolhido !== vistos.escolhido || doNovo !== vistos.novo) {
    const chegou =
      (doEscolhido !== null && doEscolhido !== vistos.escolhido) ||
      (doNovo !== null && doNovo !== vistos.novo);
    definirVistos({ escolhido: doEscolhido, novo: doNovo });
    if (chegou && !aberta) {
      definirAberta(true);
      definirMudou(true);
    }
  }
  const alternar = () => {
    guardarChamadosRecolhidos(aberta);
    definirAberta(!aberta);
    definirMudou(true);
  };
  return (
    <div className={estilos.secao}>
      <TituloQueRecolhe
        aberta={aberta}
        itens={idDosItens}
        alternar={alternar}
        chamado
        respostasNovas={chamados.reduce((soma, chamado) => soma + chamado.respostaNova, 0)}
      >
        {`Chamados · ${chamados.length}`}
      </TituloQueRecolhe>
      {/* A entrada fica no que embrulha: trocar "Nenhum chamado aberto." pela lista não a toca. */}
      {aberta && (
        <div id={idDosItens} className={mudou ? estilos.abrindo : undefined}>
          {chamados.length === 0 ? (
            <p className={estilos.nenhum}>Nenhum chamado aberto.</p>
          ) : (
            <ul className={estilos.itens}>
              {chamados.map((chamado) => (
                <CartaoDoChamado
                  key={chamado.numero}
                  chamado={chamado}
                  novo={chamado.numero === novo}
                  escolhido={chamado.numero === escolhido}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * FECHADOS · N, recolhido, com os resolvidos que ainda se reabrem. A seção abre sozinha quando o
 * chamado do endereço é um deles, e quem a fecha a fecha, até outro deles ser escolhido.
 */
function SecaoDosFechados({
  chamados,
  escolhido,
}: {
  chamados: readonly ChamadoNaLista[];
  escolhido: number | null;
}) {
  const idDosItens = useId();
  const [aberta, definirAberta] = useState(false);
  const doEscolhido = naSecao(chamados, escolhido);
  const [abertaPor, definirAbertaPor] = useState<number | null>(null);
  if (doEscolhido !== abertaPor) {
    definirAbertaPor(doEscolhido);
    if (doEscolhido !== null) definirAberta(true);
  }
  return (
    <div className={estilos.secao}>
      <TituloQueRecolhe aberta={aberta} itens={idDosItens} alternar={() => definirAberta(!aberta)}>
        {`Fechados · ${chamados.length}`}
      </TituloQueRecolhe>
      {aberta && (
        <ul id={idDosItens} className={`${estilos.itens} ${estilos.abrindo}`}>
          {chamados.map((chamado) => (
            <CartaoDoChamado
              key={chamado.numero}
              chamado={chamado}
              novo={false}
              escolhido={chamado.numero === escolhido}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * O chamado num cartão com o contorno azul: o título em peso forte, que quebra a linha e não corta,
 * o selo da situação, o contador da resposta nova, em azul, e o número em mono. O leitor de tela
 * ouve o mesmo, na ordem da tela, como "Trocar o mouse, Aberto, chamado 1045".
 */
function CartaoDoChamado({
  chamado,
  novo,
  escolhido,
}: {
  chamado: ChamadoNaLista;
  novo: boolean;
  escolhido: boolean;
}) {
  return (
    <li>
      <LinkDoChat
        para={`/chat/chamados/${chamado.numero}`}
        aria-current={escolhido ? 'page' : undefined}
        aria-label={nomeParaOLeitor(
          chamado.titulo,
          chamado.situacaoEmTexto,
          `chamado ${chamado.numero}`,
          contagemEmTexto(chamado.respostaNova, 'resposta nova', 'respostas novas'),
        )}
        data-novo={novo ? '' : undefined}
        className={estilos.chamado}
      >
        <span className={estilos.tituloDoChamado}>{chamado.titulo}</span>
        <span className={estilos.linhaDoChamado}>
          <SeloDoChamado texto={chamado.situacaoEmTexto} />
          <Contador quantos={chamado.respostaNova} tom="chamado" />
          <span className={estilos.numero}>{`#${chamado.numero}`}</span>
        </span>
      </LinkDoChat>
    </li>
  );
}

/** EQUIPES E CANAIS ou RECENTES, com o contador de cada conversa. */
function SecaoDasConversas({
  titulo,
  conversas,
  escolhida,
}: {
  titulo: string;
  conversas: readonly ConversaNaLista[];
  escolhida: string | null;
}) {
  return (
    <div className={estilos.secao}>
      <h2 className={estilos.tituloDaSecao}>{titulo}</h2>
      <ul className={estilos.itens}>
        {conversas.map((conversa) => (
          <LinhaDaConversa
            key={conversa.id}
            conversa={conversa}
            escolhida={conversa.id.toLowerCase() === escolhida}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * A conversa na lista: a equipe com as iniciais dela, o canal com o "#" e a direta com a foto ou as
 * iniciais da outra pessoa, o nome e o contador. A silenciada continua com o contador, que não
 * entra no total do chat, e diz que está silenciada, como "avisos-da-ti, silenciada, 3 não lidas".
 */
function LinhaDaConversa({
  conversa,
  escolhida,
}: {
  conversa: ConversaNaLista;
  escolhida: boolean;
}) {
  return (
    <li>
      <LinkDoChat
        para={`/chat/c/${conversa.id}`}
        aria-current={escolhida ? 'page' : undefined}
        aria-label={nomeParaOLeitor(
          conversa.nome,
          conversa.silenciada && 'silenciada',
          contagemEmTexto(conversa.naoLidas, 'não lida', 'não lidas'),
        )}
        className={estilos.conversa}
      >
        {conversa.tipo === 'canal' ? (
          <span className={estilos.marcaDoCanal} aria-hidden="true">
            <Icone icone={Hash} tamanho={16} />
          </span>
        ) : (
          <Avatar
            nome={conversa.outra?.nome ?? conversa.nome}
            imagens={
              conversa.outra
                ? miniaturasNoChat(conversa.outra.conta, conversa.outra.foto)
                : undefined
            }
            tamanho="barra"
            decorativo
          />
        )}
        <span className={estilos.nomeDaConversa}>{conversa.nome}</span>
        {conversa.silenciada && (
          <span className={estilos.silenciada}>
            <Icone icone={BellOff} tamanho={14} />
          </span>
        )}
        <Contador quantos={conversa.naoLidas} />
      </LinkDoChat>
    </li>
  );
}
