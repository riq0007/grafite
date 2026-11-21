// A equipe ou o canal escolhido na vista Equipes (spec modulo-chat, "Equipes e Avisos na tela";
// change chat-com-chamados, design, decisão 15): o cabeçalho, como o da conversa, com quantas
// pessoas, "Abrir a conversa" e quem participa, pelo nome, com a foto ou as iniciais.
import { nomeNoChat } from '@grafite/domain';
import { Avatar, Botao, Icone } from '@grafite/ui';
import { useRouter } from '@tanstack/react-router';
import { Hash } from 'lucide-react';
import { useId } from 'react';
import { miniaturasNoChat } from '../api/fotos.ts';
import { useEquipesDoChat, usePessoasDaConversa } from './consultas.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { LinkDoChat } from './LinkDoChat.tsx';
import { pessoasEmTexto } from './ListaDasEquipes.tsx';
import conversa from './TelaDaConversa.module.css';
import estilos from './TelaDaEquipe.module.css';

/** A equipe ou o canal que não existe para a conta, com o caminho de volta. */
export function EquipeNaoEncontrada() {
  return (
    <div role="alert" className={conversa.naoEncontrada}>
      <p>Equipe ou canal não encontrado.</p>
      <LinkDoChat para="/chat/equipes">Ir para as Equipes</LinkDoChat>
    </div>
  );
}

export function TelaDaEquipe({ id }: { id: string }) {
  const idDoNome = useId();
  const idDeQuem = useId();
  const roteador = useRouter();
  const equipes = useEquipesDoChat();
  const equipe = equipes.data?.itens.find((item) => item.id.toLowerCase() === id) ?? null;
  const pessoas = usePessoasDaConversa(id, equipe !== null);

  if (!equipes.data) {
    // A falha fica na lista ao lado, com o motivo e "Tentar de novo".
    if (equipes.isError) return null;
    return (
      <p role="status" className={conversa.abrindo}>
        Abrindo a equipe…
      </p>
    );
  }
  if (!equipe) return <EquipeNaoEncontrada />;

  return (
    <section className={estilos.equipe} aria-labelledby={idDoNome}>
      <header className={`${conversa.cabecalho} ${estilos.cabecalho}`}>
        {equipe.tipo === 'canal' ? (
          <span className={conversa.marcaDoCanal} aria-hidden="true">
            <Icone icone={Hash} tamanho={16} />
          </span>
        ) : (
          <Avatar nome={equipe.nome} className={conversa.foto} decorativo />
        )}
        <h2 id={idDoNome} className={conversa.nome}>
          {equipe.nome}
        </h2>
        <span className={conversa.sobre}>
          {`${equipe.tipo === 'canal' ? 'Canal' : 'Equipe'} · ${pessoasEmTexto(equipe.pessoas)}`}
        </span>
        <Botao
          nivel="primario"
          className={estilos.abrir}
          onPress={() => void roteador.navigate({ href: `/chat/c/${equipe.id}` })}
        >
          Abrir a conversa
        </Botao>
      </header>
      <section className={estilos.quem} aria-labelledby={idDeQuem}>
        <h3 id={idDeQuem} className={estilos.tituloDeQuem}>
          Quem participa
        </h3>
        {pessoas.isPending ? (
          <p role="status" className={estilos.aviso}>
            Carregando quem participa…
          </p>
        ) : pessoas.isError ? (
          <FalhaDoChat
            mensagem={pessoas.error.message}
            relendo={pessoas.isFetching}
            tentarDeNovo={() => void pessoas.refetch()}
          />
        ) : (
          <ul className={estilos.pessoas}>
            {pessoas.data.pessoas.map((pessoa) => (
              <li key={pessoa.conta} className={estilos.pessoa}>
                <Avatar
                  nome={pessoa.nome}
                  imagens={miniaturasNoChat(pessoa.conta, pessoa.foto)}
                  tamanho="barra"
                  decorativo
                />
                <span className={estilos.nomeDaPessoa}>{nomeNoChat(pessoa.nome, pessoa.daTi)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
