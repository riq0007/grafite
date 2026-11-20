// A conversa aberta (spec modulo-chat, "Conversa na tela"; spec chat, "Chamados da conversa"; change
// chat-com-chamados, design, decisão 15, "A conversa aberta" e "A conversa, nos casos que a spec não
// escreve"): o cabeçalho, com a foto ou as iniciais, o nome e, na equipe, quantas pessoas participam
// ou, no canal, quem escreve; na equipe e no canal, as abas Conversa, Arquivos e "Chamados da equipe"
// (ou "do canal"); e as mensagens. A aba Conversa continua montada nas outras, com o ponto da
// rolagem; sem o módulo Chamados, a aba dos chamados sai.
import { nomeNoChat } from '@grafite/domain';
import { Abas, Avatar, Botao, formatarTamanho, Icone, useDataHora } from '@grafite/ui';
import { FileText, Hash, Image } from 'lucide-react';
import { useId, useState } from 'react';
import { miniaturasNoChat } from '../api/fotos.ts';
import { useServidor, useSessao } from '../sessao/useSessao.tsx';
import {
  type ConversaAberta,
  useArquivosDaConversa,
  useChamadosDaConversa,
  useConversaAberta,
  useMensagensDaConversa,
} from './consultas.ts';
import { quandoNoChat } from './conversa.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { FluxoDaConversa, naoEncontrada } from './FluxoDaConversa.tsx';
import { useAgoraNoChat } from './janela.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import { SeloDoChamado } from './SeloDoChamado.tsx';
import estilos from './TelaDaConversa.module.css';

const NENHUM_DESLIGADO: readonly string[] = [];

/** A frase da spec chat ("Link da mensagem") para o link da mensagem de quem não participa. */
const SEM_A_MENSAGEM = 'A mensagem não foi encontrada.';

/** O que o cabeçalho diz embaixo do nome: as pessoas da equipe e quem escreve. */
export function sobreAConversa(aberta: ConversaAberta): string | null {
  const escreve = aberta.escreveGrupo === null ? null : `Só ${aberta.escreveGrupo} escreve`;
  if (aberta.tipo === 'canal') return escreve ?? 'Todos escrevem';
  if (aberta.tipo === 'equipe') {
    const pessoas = aberta.pessoas === 1 ? '1 pessoa' : `${aberta.pessoas ?? 0} pessoas`;
    return escreve === null ? pessoas : `${pessoas} · ${escreve}`;
  }
  return null;
}

export function TelaDaConversa({ conversa, alvo }: { conversa: string; alvo: string | null }) {
  const cabecalho = useConversaAberta(conversa);
  // As mensagens vêm junto com o cabeçalho, sem esperar por ele.
  const mensagens = useMensagensDaConversa(conversa, alvo);
  const desligados = useServidor()?.modulosDesligados ?? NENHUM_DESLIGADO;
  const [aba, definirAba] = useState('conversa');
  const idDoNome = useId();
  const aberta = cabecalho.data;

  if (!aberta) {
    if (!cabecalho.isError) {
      return (
        <p role="status" className={estilos.abrindo}>
          Abrindo a conversa…
        </p>
      );
    }
    if (!naoEncontrada(cabecalho.error)) {
      return (
        <div className={estilos.abrindo}>
          <FalhaDoChat
            mensagem={cabecalho.error.message}
            relendo={cabecalho.isFetching}
            tentarDeNovo={() => void cabecalho.refetch()}
          />
        </div>
      );
    }
    return (
      <div role="alert" className={estilos.naoEncontrada}>
        <p>{alvo === null ? cabecalho.error.message : SEM_A_MENSAGEM}</p>
        <LinkDoChat para="/chat">Ir para o Chat</LinkDoChat>
      </div>
    );
  }

  const fluxo = (visivel: boolean) => (
    <FluxoDaConversa
      key={alvo ?? ''}
      conversa={conversa}
      alvo={alvo}
      visivel={visivel}
      mensagens={mensagens}
    />
  );
  const sobre = sobreAConversa(aberta);
  const abas =
    aberta.tipo === 'direta'
      ? null
      : [
          { id: 'conversa', rotulo: 'Conversa', conteudo: fluxo(aba === 'conversa') },
          {
            id: 'arquivos',
            rotulo: 'Arquivos',
            conteudo: <ArquivosDaConversa conversa={conversa} />,
          },
          ...(desligados.includes('chamados')
            ? []
            : [
                {
                  id: 'chamados',
                  rotulo: aberta.tipo === 'canal' ? 'Chamados do canal' : 'Chamados da equipe',
                  conteudo: <ChamadosDaConversa conversa={conversa} tipo={aberta.tipo} />,
                },
              ]),
        ];
  const escolhida = abas?.some(({ id }) => id === aba) ? aba : 'conversa';

  return (
    <section className={estilos.conversa} aria-labelledby={idDoNome}>
      <header className={estilos.cabecalho} data-sem-abas={abas === null || undefined}>
        {aberta.tipo === 'canal' ? (
          <span className={estilos.marcaDoCanal} aria-hidden="true">
            <Icone icone={Hash} tamanho={16} />
          </span>
        ) : (
          <Avatar
            nome={aberta.outra?.nome ?? aberta.nome}
            imagens={
              aberta.outra ? miniaturasNoChat(aberta.outra.conta, aberta.outra.foto) : undefined
            }
            className={estilos.foto}
            decorativo
          />
        )}
        <h2 id={idDoNome} className={estilos.nome}>
          {aberta.nome}
        </h2>
        {sobre !== null && <span className={estilos.sobre}>{sobre}</span>}
      </header>
      {abas === null ? (
        fluxo(true)
      ) : (
        <Abas
          rotulo="Seções da conversa"
          abas={abas}
          selecionada={escolhida}
          aoMudar={definirAba}
          manterMontadas={['conversa']}
          preencher
          className={estilos.abas}
        />
      )}
    </section>
  );
}

/** Os anexos das mensagens, o mais novo primeiro, com quem mandou e quando. */
function ArquivosDaConversa({ conversa }: { conversa: string }) {
  const arquivos = useArquivosDaConversa(conversa, true);
  const sessao = useSessao();
  const conta = (sessao.tipo === 'ativa' && sessao.conta.id) || '';
  const dataHora = useDataHora();
  const agora = useAgoraNoChat();
  const itens = arquivos.data?.pages.flatMap(({ itens }) => itens) ?? [];
  return (
    <div className={estilos.lista}>
      {arquivos.isPending && (
        <p role="status" className={estilos.nenhum}>
          Carregando os arquivos…
        </p>
      )}
      {arquivos.isError && !arquivos.data && (
        <FalhaDoChat
          mensagem={arquivos.error.message}
          relendo={arquivos.isFetching}
          tentarDeNovo={() => void arquivos.refetch()}
        />
      )}
      {arquivos.data && itens.length === 0 && (
        <p className={estilos.nenhum}>Nenhum arquivo nesta conversa.</p>
      )}
      {itens.length > 0 && (
        <ul className={estilos.itens} aria-label="Arquivos da conversa">
          {itens.map((arquivo) => (
            <li key={arquivo.id} className={estilos.arquivo}>
              <span className={estilos.iconeDoArquivo}>
                <Icone icone={arquivo.tipo.startsWith('image/') ? Image : FileText} tamanho={20} />
              </span>
              <span className={estilos.sobreOArquivo}>
                <a
                  href={`/api/chat/conversas/${conversa}/anexos/${arquivo.id}`}
                  download={arquivo.nome}
                  className={estilos.nomeDoArquivo}
                >
                  {arquivo.nome}
                </a>
                <small>
                  {[
                    formatarTamanho(arquivo.bytes),
                    arquivo.autor.conta === conta
                      ? 'Você'
                      : nomeNoChat(arquivo.autor.nome, arquivo.autor.daTi),
                    quandoNoChat(new Date(arquivo.enviadoEm), agora, dataHora),
                  ].join(' · ')}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {arquivos.hasNextPage && (
        <Botao
          carregando={arquivos.isFetchingNextPage}
          rotuloCarregando="Carregando"
          onPress={() => void arquivos.fetchNextPage()}
        >
          Carregar mais
        </Botao>
      )}
    </div>
  );
}

/**
 * Os chamados abertos das mensagens da equipe ou do canal, o mais novo primeiro, com o número, o
 * título, a situação nas palavras do colaborador, quem atende, quem abriu e quando.
 */
function ChamadosDaConversa({
  conversa,
  tipo,
}: {
  conversa: string;
  tipo: ConversaAberta['tipo'];
}) {
  const chamados = useChamadosDaConversa(conversa, true);
  const dataHora = useDataHora();
  const agora = useAgoraNoChat();
  const itens = chamados.data?.pages.flatMap(({ itens }) => itens) ?? [];
  return (
    <div className={estilos.lista}>
      {chamados.isPending && (
        <p role="status" className={estilos.nenhum}>
          Carregando os chamados…
        </p>
      )}
      {chamados.isError && !chamados.data && (
        <FalhaDoChat
          mensagem={chamados.error.message}
          relendo={chamados.isFetching}
          tentarDeNovo={() => void chamados.refetch()}
        />
      )}
      {chamados.data && itens.length === 0 && (
        <p className={estilos.nenhum}>
          {tipo === 'canal'
            ? 'Nenhum chamado aberto das mensagens deste canal.'
            : 'Nenhum chamado aberto das mensagens desta equipe.'}
        </p>
      )}
      {itens.length > 0 && (
        <ul
          className={estilos.itens}
          aria-label={tipo === 'canal' ? 'Chamados do canal' : 'Chamados da equipe'}
        >
          {itens.map((chamado) => (
            <li key={chamado.numero} className={estilos.chamado}>
              <span className={estilos.linhaDoChamado}>
                <span className={estilos.numero}>#{chamado.numero}</span>
                <span className={estilos.tituloDoChamado}>{chamado.titulo}</span>
                <SeloDoChamado texto={chamado.situacao} />
              </span>
              <small>
                {[
                  chamado.atende === null ? null : `${chamado.atende} atende`,
                  chamado.abriu === null ? 'Aberto' : `Aberto por ${chamado.abriu}`,
                  quandoNoChat(new Date(chamado.abertoEm), agora, dataHora),
                ]
                  .filter((parte) => parte !== null)
                  .join(' · ')}
              </small>
            </li>
          ))}
        </ul>
      )}
      {chamados.hasNextPage && (
        <Botao
          carregando={chamados.isFetchingNextPage}
          rotuloCarregando="Carregando"
          onPress={() => void chamados.fetchNextPage()}
        >
          Carregar mais
        </Botao>
      )}
    </div>
  );
}
