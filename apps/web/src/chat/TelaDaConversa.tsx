// A conversa aberta (spec modulo-chat, "Conversa na tela"; spec chat, "Chamados da conversa"; change
// chat-com-chamados, design, decisão 15, "A conversa aberta" e "A conversa, nos casos que a spec não
// escreve"): o cabeçalho, com a foto ou as iniciais, o nome e, na equipe, quantas pessoas participam
// ou, no canal, quem escreve; na equipe e no canal, as abas Conversa, Arquivos e "Chamados da equipe"
// (ou "do canal"); e as mensagens, com a caixa de escrever embaixo e, na barra de cada uma, o
// responder, as reações, o silenciar e o transformar em chamado (spec modulo-chat, "Menu da
// mensagem"). A aba Conversa continua montada nas outras, com o ponto da rolagem; sem o módulo
// Chamados, a aba dos chamados sai.
import { comecoDoTexto, nomeNoChat } from '@grafite/domain';
import { Abas, Avatar, avisar, Botao, formatarTamanho, Icone, useDataHora } from '@grafite/ui';
import { type UseInfiniteQueryResult, useQueryClient } from '@tanstack/react-query';
import { FileText, Hash, Image } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { miniaturasNoChat } from '../api/fotos.ts';
import { pedir } from '../api/pedir.ts';
import { useApi } from '../api/useApi.tsx';
import { useAcesso } from '../sessao/useAcesso.ts';
import { useServidor, useSessao } from '../sessao/useSessao.tsx';
import type { AcoesDaMensagem } from './BarraDaMensagem.tsx';
import { CaixaDoChat } from './CaixaDoChat.tsx';
import { ComOResumoDoChamado } from './ChamadoCitado.tsx';
import {
  CHAVE_DAS_CONVERSAS,
  CHAVE_DO_RESUMO_DO_CHAT,
  type ConversaAberta,
  chaveDaConversa,
  useArquivosDaConversa,
  useChamadosDaConversa,
  useConversaAberta,
  useMensagensDaConversa,
} from './consultas.ts';
import { quandoNoChat } from './conversa.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { type ControleDoFluxo, FluxoDaConversa, naoEncontrada } from './FluxoDaConversa.tsx';
import { useAgoraNoChat } from './janela.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import { rascunhoDaConversa, useRascunho } from './rascunhos.tsx';
import { SeloDoChamado } from './SeloDoChamado.tsx';
import estilos from './TelaDaConversa.module.css';
import { type MensagemATransformar, TransformarEmChamado } from './TransformarEmChamado.tsx';
import { EstadoComAVolta, VoltarALista } from './VoltarALista.tsx';

const NENHUM_DESLIGADO: readonly string[] = [];

/** A frase da spec chat ("Link da mensagem") para o link da mensagem de quem não participa. */
const SEM_A_MENSAGEM = 'A mensagem não foi encontrada.';

/**
 * O texto de ajuda da caixa: "Escrever uma mensagem em Equipe Financeiro…" na equipe e no canal, e
 * "Escrever uma mensagem para Paulo Nunes…" na direta.
 */
export const ajudaDaCaixa = ({ tipo, nome }: Pick<ConversaAberta, 'tipo' | 'nome'>) =>
  tipo === 'direta' ? `Escrever uma mensagem para ${nome}…` : `Escrever uma mensagem em ${nome}…`;

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
  const api = useApi();
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  const controle = useRef<ControleDoFluxo>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const [, mudarRascunho] = useRascunho(rascunhoDaConversa(conversa));
  const [transformando, definirTransformando] = useState<MensagemATransformar | null>(null);
  const aberta = cabecalho.data;

  if (!aberta) {
    if (!cabecalho.isError) {
      return (
        <EstadoComAVolta>
          <p role="status" className={estilos.abrindo}>
            Abrindo a conversa…
          </p>
        </EstadoComAVolta>
      );
    }
    if (!naoEncontrada(cabecalho.error)) {
      return (
        <EstadoComAVolta>
          <div className={estilos.abrindo}>
            <FalhaDoChat
              mensagem={cabecalho.error.message}
              relendo={cabecalho.isFetching}
              tentarDeNovo={() => void cabecalho.refetch()}
            />
          </div>
        </EstadoComAVolta>
      );
    }
    return (
      <EstadoComAVolta>
        <div role="alert" className={estilos.naoEncontrada}>
          <p>{alvo === null ? cabecalho.error.message : SEM_A_MENSAGEM}</p>
          <LinkDoChat para="/chat">Ir para o Chat</LinkDoChat>
        </div>
      </EstadoComAVolta>
    );
  }

  /** A conversa silenciada, ou ouvida de novo: o cabeçalho, a lista e o total do chat mudam. */
  const silenciar = async (silenciada: boolean) => {
    const resposta = await pedir(
      () =>
        api.PUT('/chat/conversas/{id}/silenciada', {
          params: { path: { id: conversa } },
          body: { silenciada },
        }),
      silenciada ? 'silenciar a conversa' : 'voltar a ouvir a conversa',
    );
    if (!('dados' in resposta)) {
      avisar({ situacao: 'atencao', titulo: resposta.erro });
      return;
    }
    const agora = resposta.dados.silenciada;
    consultas.setQueryData<ConversaAberta>(
      [...chaveDaConversa(conversa), 'cabecalho'],
      (antes) => antes && { ...antes, silenciada: agora },
    );
    void consultas.invalidateQueries({ queryKey: CHAVE_DAS_CONVERSAS });
    void consultas.invalidateQueries({ queryKey: CHAVE_DO_RESUMO_DO_CHAT });
    avisar({
      situacao: 'sucesso',
      titulo: agora ? 'Conversa silenciada.' : 'A conversa volta a notificar.',
    });
  };
  const acoes: AcoesDaMensagem = {
    // A respondida vai à caixa como a mensagem enviada a mostra: o nome no chat e o começo do texto.
    responder: aberta.escreve
      ? (mensagem) => {
          mudarRascunho((antes) => ({
            ...antes,
            respondida: {
              id: mensagem.id,
              autor: nomeNoChat(mensagem.autor.nome, mensagem.autor.daTi),
              comeco: comecoDoTexto(mensagem.texto ?? ''),
            },
          }));
          caixa.current?.focus();
        }
      : null,
    reagir: aberta.arquivada
      ? null
      : async (mensagem, texto) => {
          const resposta = await pedir(
            () =>
              api.POST('/chat/mensagens/{id}/reacoes', {
                params: { path: { id: mensagem.id } },
                body: { texto },
              }),
            'reagir à mensagem',
          );
          if (!('dados' in resposta)) return resposta.problema?.campos?.texto ?? resposta.erro;
          mensagens.mostrar(resposta.dados, 'trocar');
          return null;
        },
    transformar:
      pode('chamados.pedir') && !desligados.includes('chamados')
        ? (mensagem, autor) => definirTransformando({ mensagem, autor })
        : null,
    silenciada: aberta.silenciada,
    silenciar: (silenciada) => void silenciar(silenciada),
  };

  const fluxo = (visivel: boolean) => (
    <>
      <FluxoDaConversa
        key={alvo ?? ''}
        ref={controle}
        conversa={conversa}
        alvo={alvo}
        visivel={visivel}
        mensagens={mensagens}
        acoes={acoes}
      />
      {aberta.escreve ? (
        <CaixaDoChat
          caixa={caixa}
          rascunho={rascunhoDaConversa(conversa)}
          ajuda={ajudaDaCaixa(aberta)}
          citar={!desligados.includes('chamados')}
          mandar={(corpo) =>
            pedir(
              () =>
                api.POST('/chat/conversas/{id}/mensagens', {
                  params: { path: { id: conversa } },
                  body: corpo,
                }),
              'mandar a mensagem',
            )
          }
          aoEnviar={(mensagem) => {
            const entrou = mensagens.mostrar(mensagem);
            controle.current?.irAoFimAoEnviar(!entrou);
          }}
        />
      ) : (
        aberta.recusa !== null && <p className={estilos.semCaixa}>{aberta.recusa}</p>
      )}
    </>
  );
  const sobre = sobreAConversa(aberta);
  const outrasAbas = [
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
  // A aba escolhida que sai, como a dos chamados com o módulo desligado, deixa a Conversa na tela.
  const escolhida = outrasAbas.some(({ id }) => id === aba) ? aba : 'conversa';
  const abas =
    aberta.tipo === 'direta'
      ? null
      : [
          { id: 'conversa', rotulo: 'Conversa', conteudo: fluxo(escolhida === 'conversa') },
          ...outrasAbas,
        ];

  return (
    <section className={estilos.conversa} aria-labelledby={idDoNome}>
      <header className={estilos.cabecalho} data-sem-abas={abas === null || undefined}>
        <VoltarALista />
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
        <div className={estilos.titulos}>
          <h2 id={idDoNome} className={estilos.nome}>
            {aberta.nome}
          </h2>
          {sobre !== null && <span className={estilos.sobre}>{sobre}</span>}
        </div>
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
      <TransformarEmChamado
        alvo={transformando}
        conversa={conversa}
        aoFechar={() => definirTransformando(null)}
      />
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
      <CarregarMais lista={arquivos} />
    </div>
  );
}

/**
 * "Carregar mais" na lista que tem a página seguinte; a página que falha diz o motivo, em texto, com
 * "Tentar de novo".
 */
function CarregarMais({
  lista,
}: {
  lista: Pick<
    UseInfiniteQueryResult<unknown>,
    'hasNextPage' | 'isFetchingNextPage' | 'isFetchNextPageError' | 'error' | 'fetchNextPage'
  >;
}) {
  if (!lista.hasNextPage) return null;
  if (lista.isFetchNextPageError && lista.error) {
    return (
      <FalhaDoChat
        mensagem={lista.error.message}
        relendo={lista.isFetchingNextPage}
        tentarDeNovo={() => void lista.fetchNextPage()}
      />
    );
  }
  return (
    <Botao
      carregando={lista.isFetchingNextPage}
      rotuloCarregando="Carregando"
      onPress={() => void lista.fetchNextPage()}
    >
      Carregar mais
    </Botao>
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
            <li key={chamado.numero}>
              <ComOResumoDoChamado chamado={chamado} className={estilos.chamado} soAoEscolher>
                <span className={estilos.linhaDoChamado}>
                  <span className={estilos.paraOLeitor}>Chamado </span>
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
              </ComOResumoDoChamado>
            </li>
          ))}
        </ul>
      )}
      <CarregarMais lista={chamados} />
    </div>
  );
}
