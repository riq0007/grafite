// O app do chat por inteiro (spec modulo-chat, "App do chat", "Trilha do chat", "Lista do Chat" e
// "Chat no celular"): a trilha à esquerda, com as vistas, os contadores e o menu da conta no pé, a
// lista da vista do endereço e, ao lado dela, a tela escolhida. Sem o chat, a vista dá lugar ao
// motivo, e as telas dela nem montam, sem pedir dados. No celular, uma coluna só, com a lista ou a
// tela escolhida nela, e a trilha na barra de baixo, que dá lugar à seta de voltar na tela.
import { EstadoVazio, Icone, RegiaoDeAvisos, usePostura } from '@grafite/ui';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { Bell, LifeBuoy, type LucideIcon, MessageCircle, Users, WifiOff } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { SemPermissao } from '../modulos/administracao/SemPermissao.tsx';
import { useNotificacoes } from '../notificacoes/useNotificacoes.tsx';
import type { EstadoDaSessao } from '../sessao/loja.ts';
import { useAcesso } from '../sessao/useAcesso.ts';
import { useServidor, useSessao } from '../sessao/useSessao.tsx';
import { Contador, contagemEmTexto, nomeParaOLeitor, type TomDoContador } from './Contador.tsx';
import { useChamadoNovo } from './chamadoNovo.tsx';
import { useResumoDoChat } from './consultas.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import { ListaDaVista } from './ListaDaVista.tsx';
import { MenuDaConta } from './MenuDaConta.tsx';
import { ModuloDesligado } from './ModuloDesligado.tsx';
import estilos from './MolduraDoChat.module.css';

export type IdDaVista = 'chat' | 'equipes' | 'chamados' | 'avisos';

interface VistaDaTrilha {
  id: IdDaVista;
  nome: string;
  endereco: string;
  icone: LucideIcon;
}

/** As vistas, na ordem da trilha. */
const VISTAS: readonly VistaDaTrilha[] = [
  { id: 'chat', nome: 'Chat', endereco: '/chat', icone: MessageCircle },
  { id: 'equipes', nome: 'Equipes', endereco: '/chat/equipes', icone: Users },
  { id: 'chamados', nome: 'Chamados', endereco: '/chat/chamados', icone: LifeBuoy },
  { id: 'avisos', nome: 'Avisos', endereco: '/chat/avisos', icone: Bell },
];

/**
 * A vista de cada tela do chat, pelo id da rota dela (`rotas.tsx`): a conversa, a direta que ainda
 * não nasceu e o chamado são da vista Chat, que lista os chamados abertos e os fechados. O chamado
 * aberto pela vista Chamados leva a vista na busca (`vistaNaBusca`), para a lista dela ficar ao lado.
 */
const VISTA_DA_ROTA: Readonly<Record<string, IdDaVista>> = {
  '/chat/': 'chat',
  '/chat/c/$conversa': 'chat',
  '/chat/direta/$conta': 'chat',
  '/chat/equipes': 'equipes',
  '/chat/equipes/$conversa': 'equipes',
  '/chat/chamados': 'chamados',
  '/chat/chamados/$numero': 'chat',
  '/chat/avisos': 'avisos',
};

/** O endereço da lista da vista, aonde a seta de voltar do celular leva. */
export const enderecoDaVista = (vista: IdDaVista) =>
  VISTAS.find(({ id }) => id === vista)?.endereco ?? '/chat';

/**
 * As telas de um item da lista, a conversa, a direta, o chamado e a equipe: no celular, elas ficam no
 * lugar da lista, com a seta de voltar, e sem a barra de baixo.
 */
const ROTAS_DE_ITEM: ReadonlySet<string> = new Set([
  '/chat/c/$conversa',
  '/chat/direta/$conta',
  '/chat/chamados/$numero',
  '/chat/equipes/$conversa',
]);

/** A tela aberta é a de um item da lista. */
export const naTelaDeUmItem = ({ matches }: { matches: readonly { routeId: string }[] }) =>
  ROTAS_DE_ITEM.has(matches.at(-1)?.routeId ?? '');

/** O caminho como o roteador o casa: sem as barras do fim e sem diferenciar as maiúsculas. */
const comoORoteadorCasa = (caminho: string) => caminho.replace(/\/+$/, '').toLowerCase();

const daVistaChamados = (busca: unknown) =>
  typeof busca === 'object' && busca !== null && 'vista' in busca && busca.vista === 'chamados';

/**
 * A vista da tela aberta, pela última rota casada. A página não encontrada não é de nenhuma: o
 * roteador casa o começo do endereço, como o /chat/avisos do /chat/avisos/outra, e a última rota
 * não cobre o endereço inteiro. No meio de uma navegação, o roteador troca o endereço antes das rotas
 * casadas e o endereço resolvido depois delas: as rotas cobrem um dos dois, e a vista não some entre
 * duas telas dela, o que desmontaria a lista.
 */
export function vistaDaTela({
  location,
  resolvedLocation,
  matches,
}: {
  location: { pathname: string };
  resolvedLocation?: { pathname: string } | undefined;
  matches: readonly { routeId: string; pathname: string; search?: unknown }[];
}): IdDaVista | null {
  const ultima = matches.at(-1);
  if (!ultima) return null;
  const caminho = comoORoteadorCasa(ultima.pathname);
  const cobre = [location, resolvedLocation].some(
    (endereco) => endereco !== undefined && comoORoteadorCasa(endereco.pathname) === caminho,
  );
  if (!cobre) return null;
  if (ultima.routeId === '/chat/chamados/$numero' && daVistaChamados(ultima.search)) {
    return 'chamados';
  }
  return VISTA_DA_ROTA[ultima.routeId] ?? null;
}

/** Por que o chat não abre para a conta. */
export type MotivoSemOChat = 'sem-conexao' | 'desligado' | 'sem-acesso';

/**
 * O motivo, na ordem em que se confere: sem o servidor, não se sabe nada da conta; com o módulo
 * desligado, ninguém usa o chat, e pedir acesso não adianta; e, ligado, só quem tem `chat.usar`.
 * `null` quando o chat abre.
 */
export function motivoSemOChat({
  sessao,
  desligados,
  usaOChat,
}: {
  sessao: EstadoDaSessao['tipo'];
  desligados: readonly string[];
  usaOChat: boolean;
}): MotivoSemOChat | null {
  if (sessao === 'desconhecida') return 'sem-conexao';
  if (desligados.includes('chat')) return 'desligado';
  return usaOChat ? null : 'sem-acesso';
}

/** Nenhum módulo desligado, enquanto o servidor não disse quais são. */
const NENHUM_DESLIGADO: readonly string[] = [];

export function MolduraDoChat() {
  const sessao = useSessao();
  const desligados = useServidor()?.modulosDesligados ?? NENHUM_DESLIGADO;
  const { pode } = useAcesso();
  const motivo = motivoSemOChat({
    sessao: sessao.tipo,
    desligados,
    usaOChat: pode('chat.usar'),
  });
  const atual = useRouterState({ select: vistaDaTela });
  const doItem = useRouterState({ select: naTelaDeUmItem });
  const celular = usePostura() === 'celular';
  // O chamado que a conta acaba de abrir sai do alto quando a lista do Chat sai da tela: ela volta
  // na ordem de sempre (spec modulo-chat, "Lista do Chat").
  const { marcar } = useChamadoNovo();
  const vistaDeAntes = useRef(atual);
  useEffect(() => {
    if (vistaDeAntes.current === 'chat' && atual !== 'chat') marcar(null);
    vistaDeAntes.current = atual;
  }, [atual, marcar]);
  // A vista Chamados só existe com o módulo Chamados ligado.
  const vistas = VISTAS.filter(
    (vista) => vista.id !== 'chamados' || !desligados.includes('chamados'),
  );
  let conteudo: ReactNode;
  if (motivo !== null) {
    conteudo = (
      <div className={estilos.motivo}>
        <SemOChat motivo={motivo} />
      </div>
    );
  } else if (atual === null) {
    // A página não encontrada fica sozinha, sem a lista de nenhuma vista.
    conteudo = <Outlet />;
  } else if (atual === 'chamados' && desligados.includes('chamados')) {
    // A vista Chamados pelo endereço, com o módulo desligado: nem a lista nem a tela montam.
    conteudo = (
      <div className={estilos.motivo}>
        <ModuloDesligado titulo="O módulo Chamados está desligado nesta organização." />
      </div>
    );
  } else {
    // No celular, a lista fica montada por baixo da tela do item, sem ser vista nem receber o foco:
    // a volta a encontra como estava, com a rolagem e as seções abertas.
    conteudo = (
      <>
        <div className={estilos.colunaDaLista} inert={(celular && doItem) || undefined}>
          <ListaDaVista vista={atual} />
        </div>
        <div className={estilos.tela}>
          <Outlet />
        </div>
      </>
    );
  }
  // O que a coluna do celular mostra: a lista da vista, ou a tela, a do item, a dos Avisos, que não
  // têm lista, e as que dizem o motivo.
  const coluna =
    motivo === null && atual !== null && atual !== 'avisos' && !doItem ? 'lista' : 'tela';
  return (
    <div className={estilos.app} data-item={doItem || undefined}>
      <nav aria-label="Vistas do chat" className={estilos.trilha}>
        {motivo === null && <VistasDaTrilha vistas={vistas} atual={atual} />}
        {sessao.tipo === 'ativa' && <MenuDaConta conta={sessao.conta} naBarraDeBaixo={celular} />}
      </nav>
      <main className={estilos.conteudo} data-coluna={coluna}>
        {conteudo}
      </main>
      <RegiaoDeAvisos />
    </div>
  );
}

/** O contador de uma vista da trilha e o que o leitor de tela ouve dele. */
interface ContagemDaVista {
  quantos: number;
  tom: TomDoContador;
  um: string;
  varios: string;
}

/**
 * As vistas da trilha, com os contadores: o total do chat no Chat, os chamados com resposta nova,
 * no azul do chamado, em Chamados, e as notificações não lidas em Avisos.
 */
function VistasDaTrilha({
  vistas,
  atual,
}: {
  vistas: readonly VistaDaTrilha[];
  atual: IdDaVista | null;
}) {
  const resumo = useResumoDoChat();
  const { naoLidas: avisos } = useNotificacoes();
  const contagens: Record<IdDaVista, ContagemDaVista | null> = {
    chat: {
      quantos: resumo.data?.naoLidas ?? 0,
      tom: 'neutro',
      um: 'não lida',
      varios: 'não lidas',
    },
    equipes: null,
    chamados: {
      quantos: resumo.data?.chamadosComRespostaNova ?? 0,
      tom: 'chamado',
      um: 'com resposta nova',
      varios: 'com resposta nova',
    },
    avisos: { quantos: avisos, tom: 'neutro', um: 'não lido', varios: 'não lidos' },
  };
  // Na barra de baixo do celular, as vistas e a conta dividem a largura em partes iguais.
  return (
    <ul className={estilos.vistas} style={{ '--quantas-vistas': vistas.length } as CSSProperties}>
      {vistas.map((vista) => {
        const contagem = contagens[vista.id];
        return (
          <li key={vista.id}>
            <LinkDoChat
              para={vista.endereco}
              aria-current={vista.id === atual ? 'page' : undefined}
              aria-label={
                contagem
                  ? nomeParaOLeitor(
                      vista.nome,
                      contagemEmTexto(contagem.quantos, contagem.um, contagem.varios),
                    )
                  : undefined
              }
              className={estilos.vista}
            >
              <Icone icone={vista.icone} tamanho={20} />
              {vista.nome}
              {contagem && (
                <Contador
                  quantos={contagem.quantos}
                  tom={contagem.tom}
                  className={estilos.contadorDaVista}
                />
              )}
            </LinkDoChat>
          </li>
        );
      })}
    </ul>
  );
}

function SemOChat({ motivo }: { motivo: MotivoSemOChat }) {
  if (motivo === 'sem-acesso') return <SemPermissao a="ao chat" />;
  if (motivo === 'desligado') {
    return <ModuloDesligado titulo="O chat está desligado nesta organização." />;
  }
  return (
    <EstadoVazio
      icone={WifiOff}
      titulo="Sem conexão com o servidor."
      descricao="O chat abre quando a conexão voltar."
    />
  );
}
