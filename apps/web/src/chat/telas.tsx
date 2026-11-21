// As telas de cada endereço do chat (change chat-com-chamados, design, decisão 12), as mesmas no app
// do chat, em /chat, e na janela do Chat da casca, em /conversas: cada árvore de rotas as pendura
// nos endereços dela. As telas leem os parâmetros e a busca da rota casada pelo nome, sem a rota de
// uma das árvores, e os tipos do roteador são os da casca, que registra o dela.
import { EstadoVazio } from '@grafite/ui';
import { useParams, useRouterState, useSearch } from '@tanstack/react-router';
import { LifeBuoy, MessageCircle, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAcesso } from '../sessao/useAcesso.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import estilos from './MolduraDoChat.module.css';
import { TelaDaConversa } from './TelaDaConversa.tsx';
import { type PessoaDaDireta, TelaDaDireta } from './TelaDaDireta.tsx';
import { EquipeNaoEncontrada, TelaDaEquipe } from './TelaDaEquipe.tsx';
import { ChamadoNaoEncontrado, TelaDoChamado } from './TelaDoChamado.tsx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Os parâmetros da rota casada, pelo nome, nas duas árvores. */
const useParametros = () => useParams({ strict: false }) as Record<string, string | undefined>;

/** A vista Chat sem nada escolhido na lista. */
export function NadaEscolhido() {
  return (
    <div className={estilos.nadaEscolhido}>
      <EstadoVazio
        icone={MessageCircle}
        titulo="Escolha uma conversa ou um chamado na lista."
        descricao="Para falar com alguém, use Nova conversa."
      />
    </div>
  );
}

/** A vista Chamados sem nenhum escolhido na lista. */
export function NenhumChamadoEscolhido() {
  const { pode } = useAcesso();
  return (
    <div className={estilos.nadaEscolhido}>
      <EstadoVazio
        icone={LifeBuoy}
        titulo="Escolha um chamado na lista."
        descricao={
          pode('chamados.pedir')
            ? 'Para abrir um chamado, use Transformar em chamado no menu de uma mensagem.'
            : undefined
        }
      />
    </div>
  );
}

/** A vista Equipes sem nenhuma escolhida na lista. */
export function NenhumaEquipeEscolhida() {
  return (
    <div className={estilos.nadaEscolhido}>
      <EstadoVazio icone={Users} titulo="Escolha uma equipe ou um canal na lista." />
    </div>
  );
}

/** O endereço que não leva a nenhuma tela do chat, com o caminho de volta. */
export function ChatNaoEncontrado() {
  return (
    <div className={estilos.naoEncontrada}>
      <h1 className={estilos.tituloDaLista}>Página não encontrada</h1>
      <p>Este endereço não leva a nenhuma tela do chat.</p>
      <LinkDoChat para="/chat">Ir para o Chat</LinkDoChat>
    </div>
  );
}

/**
 * A busca da conversa: com `?m=`, ela abre na mensagem do link (spec chat, "Link da mensagem"). O
 * `?m=` mexido, que não é o id de uma mensagem, sai: a conversa abre como sem o link. O `m`
 * indefinido apaga o da busca da raiz, que o roteador junta por baixo da validada.
 */
export const validarBuscaDaConversa = (busca: Record<string, unknown>): { m?: string } => ({
  m: typeof busca.m === 'string' && UUID.test(busca.m) ? busca.m : undefined,
});

/**
 * A tela de cada conversa começa do zero: as abas, a rolagem e a abertura são dela. Os ids vão em
 * minúsculas, como a API os devolve.
 */
export function ConversaDoEndereco(): ReactNode {
  const conversa = useParametros().conversa?.toLowerCase() ?? '';
  const alvo = (useSearch({ strict: false }) as { m?: string }).m?.toLowerCase() ?? null;
  return <TelaDaConversa key={conversa} conversa={conversa} alvo={alvo} />;
}

/**
 * A conversa direta com a pessoa escolhida em "Nova conversa", que ainda não nasceu: ela nasce com a
 * primeira mensagem (spec chat, "Conversa direta"). A pessoa vem no estado da navegação, que o
 * histórico guarda também na volta e ao recarregar.
 */
export function DiretaDoEndereco(): ReactNode {
  const conta = useParametros().conta?.toLowerCase() ?? '';
  const pessoa = useRouterState({
    select: (estado) => (estado.location.state as { pessoa?: PessoaDaDireta }).pessoa ?? null,
  });
  const daConta = pessoa?.conta.toLowerCase() === conta ? pessoa : null;
  return <TelaDaDireta key={conta} conta={conta} pessoa={daConta} />;
}

/** A busca do chamado: aberto pela vista Chamados, com `?vista=chamados`, ele fica nela. */
export const validarBuscaDoChamado = (busca: Record<string, unknown>): { vista?: 'chamados' } =>
  busca.vista === 'chamados' ? { vista: 'chamados' } : {};

/** O número do chamado no endereço: um inteiro positivo, sem zero à esquerda, que cabe no banco. */
const NUMERO_DO_CHAMADO = /^[1-9]\d{0,9}$/;
const MAIOR_NUMERO = 2_147_483_647;

/** A tela de cada chamado começa do zero, com a rolagem e o que se marca nela. */
export function ChamadoDoEndereco(): ReactNode {
  const numero = useParametros().numero ?? '';
  const { vista } = useSearch({ strict: false }) as { vista?: 'chamados' };
  const lido = NUMERO_DO_CHAMADO.test(numero) ? Number(numero) : null;
  if (lido === null || lido > MAIOR_NUMERO) return <ChamadoNaoEncontrado />;
  return <TelaDoChamado key={lido} numero={lido} vista={vista ?? null} />;
}

/** O id fora do formato não é de nenhuma equipe: a tela diz isso sem pedir nada. */
export function EquipeDoEndereco(): ReactNode {
  const conversa = useParametros().conversa?.toLowerCase() ?? '';
  if (!UUID.test(conversa)) return <EquipeNaoEncontrada />;
  return <TelaDaEquipe key={conversa} id={conversa} />;
}
