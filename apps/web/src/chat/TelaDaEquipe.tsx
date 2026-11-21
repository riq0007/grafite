// A equipe ou o canal escolhido na vista Equipes (spec modulo-chat, "Equipes e Avisos na tela";
// change chat-com-chamados, design, decisão 15): o cabeçalho, como o da conversa, com quantas
// pessoas, "Abrir a conversa" e quem participa, pelo nome, com a foto ou as iniciais.
import { nomeNoChat } from '@grafite/domain';
import { Avatar, Botao, Icone, usePostura } from '@grafite/ui';
import { Hash } from 'lucide-react';
import { useId } from 'react';
import { miniaturasNoChat } from '../api/fotos.ts';
import { useIrNoChat } from './base.tsx';
import { useEquipesDoChat, usePessoasDaConversa } from './consultas.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { focarAoChegar } from './focoNaChegada.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import { pessoasEmTexto } from './ListaDasEquipes.tsx';
import conversa from './TelaDaConversa.module.css';
import estilos from './TelaDaEquipe.module.css';
import { EstadoComAVolta, VoltarALista } from './VoltarALista.tsx';

/** A equipe ou o canal que não existe para a conta, com o caminho de volta. */
export function EquipeNaoEncontrada() {
  return (
    <EstadoComAVolta>
      <div role="alert" className={conversa.naoEncontrada}>
        <p>Equipe ou canal não encontrado.</p>
        <LinkDoChat para="/chat/equipes">Ir para as Equipes</LinkDoChat>
      </div>
    </EstadoComAVolta>
  );
}

export function TelaDaEquipe({ id }: { id: string }) {
  const idDoNome = useId();
  const idDeQuem = useId();
  const irNoChat = useIrNoChat();
  const equipes = useEquipesDoChat();
  const equipe = equipes.data?.itens.find((item) => item.id.toLowerCase() === id) ?? null;
  const pessoas = usePessoasDaConversa(id, equipe !== null);
  const celular = usePostura() === 'celular';

  if (!equipes.data) {
    // A falha fica na lista ao lado, com o motivo e "Tentar de novo"; no celular, a lista fica
    // escondida, e a falha vem na tela, com a seta de voltar.
    if (equipes.isError) {
      return celular ? (
        <EstadoComAVolta>
          <div className={conversa.abrindo}>
            <FalhaDoChat
              mensagem={equipes.error.message}
              relendo={equipes.isFetching}
              tentarDeNovo={() => void equipes.refetch()}
            />
          </div>
        </EstadoComAVolta>
      ) : null;
    }
    return (
      <EstadoComAVolta>
        <p role="status" className={conversa.abrindo}>
          Abrindo a equipe…
        </p>
      </EstadoComAVolta>
    );
  }
  if (!equipe) return <EquipeNaoEncontrada />;

  return (
    <section className={estilos.equipe} aria-labelledby={idDoNome}>
      <header className={`${conversa.cabecalho} ${estilos.cabecalho}`}>
        <VoltarALista />
        {equipe.tipo === 'canal' ? (
          <span className={conversa.marcaDoCanal} aria-hidden="true">
            <Icone icone={Hash} tamanho={16} />
          </span>
        ) : (
          <Avatar nome={equipe.nome} className={conversa.foto} decorativo />
        )}
        <div className={conversa.titulos}>
          <h2
            id={idDoNome}
            className={conversa.nome}
            tabIndex={-1}
            data-titulo-de-chegada="item"
            ref={focarAoChegar}
          >
            {equipe.nome}
          </h2>
          <span className={conversa.sobre}>
            {`${equipe.tipo === 'canal' ? 'Canal' : 'Equipe'} · ${pessoasEmTexto(equipe.pessoas)}`}
          </span>
        </div>
        <Botao
          nivel="primario"
          className={estilos.abrir}
          onPress={() => irNoChat(`/chat/c/${equipe.id}`)}
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
