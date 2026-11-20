// O app do chat por inteiro (spec modulo-chat, "App do chat" e "Trilha do chat"): a trilha à
// esquerda, com as vistas e o menu da conta no pé, e a vista do endereço ao lado. Sem o chat, a
// vista dá lugar ao motivo, e as telas dela nem montam, sem pedir dados.
import { EstadoVazio, Icone, RegiaoDeAvisos } from '@grafite/ui';
import { Outlet, useRouterState } from '@tanstack/react-router';
import {
  Bell,
  LifeBuoy,
  type LucideIcon,
  MessageCircle,
  PowerOff,
  Users,
  WifiOff,
} from 'lucide-react';
import { SemPermissao } from '../modulos/administracao/SemPermissao.tsx';
import type { EstadoDaSessao } from '../sessao/loja.ts';
import { useAcesso } from '../sessao/useAcesso.ts';
import { useServidor, useSessao } from '../sessao/useSessao.tsx';
import { LinkDoChat } from './LinkDoChat.tsx';
import { MenuDaConta } from './MenuDaConta.tsx';
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
 * A vista de cada tela do chat, pelo id da rota dela (`rotas.tsx`): a conversa é da vista Chat, e o
 * chamado, da vista Chamados.
 */
const VISTA_DA_ROTA: Readonly<Record<string, IdDaVista>> = {
  '/chat/': 'chat',
  '/chat/c/$conversa': 'chat',
  '/chat/equipes': 'equipes',
  '/chat/chamados': 'chamados',
  '/chat/chamados/$numero': 'chamados',
  '/chat/avisos': 'avisos',
};

const semBarraNoFim = (caminho: string) => caminho.replace(/\/+$/, '');

/**
 * A vista da tela aberta, pela última rota casada. A página não encontrada não é de nenhuma: o
 * roteador casa o começo do endereço, como o /chat/equipes do /chat/equipes/outra, e a última rota
 * não cobre o endereço inteiro.
 */
export function vistaDaTela({
  location,
  matches,
}: {
  location: { pathname: string };
  matches: readonly { routeId: string; pathname: string }[];
}): IdDaVista | null {
  const ultima = matches.at(-1);
  if (!ultima || semBarraNoFim(ultima.pathname) !== semBarraNoFim(location.pathname)) return null;
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
  // A vista Chamados só existe com o módulo Chamados ligado.
  const vistas = VISTAS.filter(
    (vista) => vista.id !== 'chamados' || !desligados.includes('chamados'),
  );
  return (
    <div className={estilos.app}>
      <nav aria-label="Vistas do chat" className={estilos.trilha}>
        {motivo === null && (
          <ul className={estilos.vistas}>
            {vistas.map((vista) => (
              <li key={vista.id}>
                <LinkDoChat
                  para={vista.endereco}
                  aria-current={vista.id === atual ? 'page' : undefined}
                  className={estilos.vista}
                >
                  <Icone icone={vista.icone} tamanho={20} />
                  {vista.nome}
                </LinkDoChat>
              </li>
            ))}
          </ul>
        )}
        {sessao.tipo === 'ativa' && <MenuDaConta conta={sessao.conta} />}
      </nav>
      <main className={estilos.conteudo}>
        {motivo === null ? (
          <Outlet />
        ) : (
          <div className={estilos.motivo}>
            <SemOChat motivo={motivo} />
          </div>
        )}
      </main>
      <RegiaoDeAvisos />
    </div>
  );
}

function SemOChat({ motivo }: { motivo: MotivoSemOChat }) {
  const { pode } = useAcesso();
  if (motivo === 'sem-acesso') return <SemPermissao a="ao chat" />;
  if (motivo === 'desligado') {
    return (
      <EstadoVazio
        icone={PowerOff}
        titulo="O chat está desligado nesta organização."
        descricao={
          pode('organizacao.editar')
            ? 'Você pode ligá-lo na seção Módulos da Administração do Grafite.'
            : 'Peça a quem define os padrões da organização para ligá-lo.'
        }
      />
    );
  }
  return (
    <EstadoVazio
      icone={WifiOff}
      titulo="Sem conexão com o servidor."
      descricao="O chat abre quando a conexão voltar."
    />
  );
}
