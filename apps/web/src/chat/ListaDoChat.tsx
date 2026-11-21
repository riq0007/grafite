// A lista da vista Chat (spec modulo-chat, "Lista do Chat" e "Selos e movimento do chat"; change
// chat-com-chamados, design, decisões 5 e 15; m01 e m03): o título, com "Nova conversa", e as
// seções: os chamados abertos da conta em CHAMADOS, no azul do chamado, com o que ela acaba de abrir
// no alto; os resolvidos que ainda se reabrem em FECHADOS, recolhido; as equipes e os canais; e as
// conversas diretas, em RECENTES. A conversa e o chamado do endereço ficam marcados.
import { secoesDoChat } from '@grafite/domain';
import { Avatar, Icone } from '@grafite/ui';
import { useRouterState } from '@tanstack/react-router';
import { BellOff, ChevronRight, Hash, LifeBuoy } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { miniaturasNoChat } from '../api/fotos.ts';
import { useServidor } from '../sessao/useSessao.tsx';
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
  if (ultima?.routeId !== '/chat/c/$conversa') return null;
  return parametro(ultima, 'conversa')?.toLowerCase() ?? null;
};

/** O número do chamado do endereço. */
export const chamadoDoEndereco = ({ matches }: { matches: readonly RotaCasada[] }) => {
  const ultima = matches.at(-1);
  if (ultima?.routeId !== '/chat/chamados/$numero') return null;
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
        <h1 id={idDoTitulo} className={estilos.titulo}>
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

/** CHAMADOS · N, com os abertos em cartões, ou "Nenhum chamado aberto.". */
function SecaoDosChamados({
  chamados,
  novo,
  escolhido,
}: {
  chamados: readonly ChamadoNaLista[];
  novo: number | null;
  escolhido: number | null;
}) {
  return (
    <div className={estilos.secao}>
      <h2 className={estilos.tituloDaSecao} data-tom="chamado">
        <Icone icone={LifeBuoy} tamanho={14} />
        {`Chamados · ${chamados.length}`}
      </h2>
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
  const doEscolhido =
    escolhido !== null && chamados.some(({ numero }) => numero === escolhido) ? escolhido : null;
  const [abertaPor, definirAbertaPor] = useState<number | null>(null);
  if (doEscolhido !== abertaPor) {
    definirAbertaPor(doEscolhido);
    if (doEscolhido !== null) definirAberta(true);
  }
  return (
    <div className={estilos.secao}>
      <h2 className={estilos.tituloDaSecao}>
        <button
          type="button"
          className={estilos.recolher}
          aria-expanded={aberta}
          aria-controls={aberta ? idDosItens : undefined}
          onClick={() => definirAberta(!aberta)}
        >
          <Icone icone={ChevronRight} tamanho={14} />
          {`Fechados · ${chamados.length}`}
        </button>
      </h2>
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
