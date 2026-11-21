// A lista da vista Equipes (spec modulo-chat, "Equipes e Avisos na tela"; change chat-com-chamados,
// design, decisão 15): as equipes e os canais de que a conta participa, em ordem de nome, a equipe
// com as iniciais dela e o canal com o "#", cada um com quantas pessoas tem. A escolhida fica marcada
// e mostra, ao lado, quem participa.
import { Avatar, Icone } from '@grafite/ui';
import { useRouterState } from '@tanstack/react-router';
import { Hash } from 'lucide-react';
import { useId } from 'react';
import { nomeParaOLeitor } from './Contador.tsx';
import { type EquipeDoChat, useEquipesDoChat } from './consultas.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { LinkDoChat } from './LinkDoChat.tsx';
import estilos from './ListaDasEquipes.module.css';
import lista from './ListaDoChat.module.css';
import moldura from './MolduraDoChat.module.css';

/** Quantas pessoas, como "12 pessoas" e "1 pessoa". */
export const pessoasEmTexto = (quantas: number) =>
  `${quantas} ${quantas === 1 ? 'pessoa' : 'pessoas'}`;

/** A equipe ou o canal do endereço, em minúsculas, como a lista compara os ids. */
const equipeDoEndereco = ({
  matches,
}: {
  matches: readonly { routeId: string; params: unknown }[];
}) => {
  const ultima = matches.at(-1);
  if (ultima?.routeId !== '/chat/equipes/$conversa') return null;
  const { conversa } = ultima.params as { conversa?: unknown };
  return typeof conversa === 'string' ? conversa.toLowerCase() : null;
};

export function ListaDasEquipes() {
  const idDoTitulo = useId();
  const equipes = useEquipesDoChat();
  const escolhida = useRouterState({ select: equipeDoEndereco });
  const itens = equipes.data?.itens ?? [];
  return (
    <section aria-labelledby={idDoTitulo} className={`${moldura.lista} ${lista.lista}`}>
      <div className={lista.cabecalho}>
        <h1 id={idDoTitulo} className={lista.titulo}>
          Equipes
        </h1>
      </div>
      <div className={lista.secoes}>
        {equipes.isPending && (
          <p role="status" className={estilos.aviso}>
            Carregando as equipes e os canais…
          </p>
        )}
        {equipes.isError && !equipes.data && (
          <FalhaDoChat
            mensagem={equipes.error.message}
            relendo={equipes.isFetching}
            tentarDeNovo={() => void equipes.refetch()}
          />
        )}
        {equipes.data && itens.length === 0 && (
          <p className={estilos.aviso}>Você não participa de nenhuma equipe nem canal.</p>
        )}
        {itens.length > 0 && (
          <ul className={`${lista.itens} ${estilos.itens}`}>
            {itens.map((equipe) => (
              <LinhaDaEquipe
                key={equipe.id}
                equipe={equipe}
                escolhida={equipe.id.toLowerCase() === escolhida}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** A marca da equipe, com as iniciais dela, ou do canal, com o "#". */
function MarcaDaEquipe({ equipe }: { equipe: EquipeDoChat }) {
  if (equipe.tipo === 'canal') {
    return (
      <span className={lista.marcaDoCanal} aria-hidden="true">
        <Icone icone={Hash} tamanho={16} />
      </span>
    );
  }
  return <Avatar nome={equipe.nome} tamanho="barra" decorativo />;
}

/**
 * A equipe ou o canal na lista: a marca, o nome e quantas pessoas tem. O leitor de tela ouve o tipo,
 * como "Financeiro, equipe, 12 pessoas".
 */
function LinhaDaEquipe({ equipe, escolhida }: { equipe: EquipeDoChat; escolhida: boolean }) {
  return (
    <li>
      <LinkDoChat
        para={`/chat/equipes/${equipe.id}`}
        aria-current={escolhida ? 'page' : undefined}
        aria-label={nomeParaOLeitor(
          equipe.nome,
          equipe.tipo === 'canal' ? 'canal' : 'equipe',
          pessoasEmTexto(equipe.pessoas),
        )}
        className={lista.conversa}
      >
        <MarcaDaEquipe equipe={equipe} />
        <span className={lista.nomeDaConversa}>{equipe.nome}</span>
        <span className={estilos.pessoas}>{pessoasEmTexto(equipe.pessoas)}</span>
      </LinkDoChat>
    </li>
  );
}
