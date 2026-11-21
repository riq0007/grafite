// A vista Avisos do app do chat (spec modulo-chat, "Equipes e Avisos na tela"; spec notificacoes,
// "Aparelhos do push" e "Central de notificações"; change chat-com-chamados, design, decisões 12 e
// 15): em cima, "Receber neste aparelho", pela mesma inscrição dos Ajustes, com o motivo em texto
// quando o aparelho não recebe os avisos; embaixo, as notificações da conta, como a central da casca.
// "Abrir" leva ao chat no endereço da notificação ou, no endereço da casca, abre o Grafite numa
// janela nova (o `navegar` do `AppDoChat`).
import { avisar, Botao, ConteudoDaCentralDeNotificacoes, useDataHora } from '@grafite/ui';
import { useId, useState } from 'react';
import { useEsteAparelho } from '../notificacoes/esteAparelho.ts';
import { paraACentral } from '../notificacoes/naCentral.ts';
import {
  type Notificacao,
  useNotificacoes,
  useNotificacoesDaCentral,
} from '../notificacoes/useNotificacoes.tsx';
import { usePreferencias } from '../preferencias/usePreferencias.tsx';
import estilos from './TelaDosAvisos.module.css';

export function TelaDosAvisos() {
  const idDoTitulo = useId();
  const idDasNotificacoes = useId();
  const notificacoes = useNotificacoes();
  const daCentral = useNotificacoesDaCentral(true);
  const { formatarHora } = useDataHora();
  const { preferencias, mudar } = usePreferencias();
  const notificacaoDe = (id: string) =>
    daCentral.notificacoes.find((notificacao) => notificacao.id === id) ??
    notificacoes.recentes.find((notificacao) => notificacao.id === id);
  const comNotificacao = (acao: (notificacao: Notificacao) => void) => (id: string) => {
    const notificacao = notificacaoDe(id);
    if (notificacao) acao(notificacao);
  };
  return (
    <div className={estilos.avisos}>
      <section aria-labelledby={idDoTitulo} className={estilos.conteudo}>
        <h1 id={idDoTitulo} className={estilos.titulo}>
          Avisos
        </h1>
        <EsteAparelho />
        <section aria-labelledby={idDasNotificacoes} className={estilos.notificacoes}>
          <h2 id={idDasNotificacoes} className={estilos.tituloDaParte}>
            Notificações
          </h2>
          <ConteudoDaCentralDeNotificacoes
            notificacoes={daCentral.notificacoes.map((notificacao) =>
              paraACentral(notificacao, formatarHora),
            )}
            filtros={daCentral.filtros}
            aoMudarFiltros={daCentral.mudarFiltros}
            naoLidas={daCentral.naoLidas ?? notificacoes.naoLidas}
            temMais={daCentral.temMais}
            carregandoMais={daCentral.carregandoMais}
            aoCarregarMais={daCentral.carregarMais}
            carregando={daCentral.carregando}
            erro={daCentral.erro}
            aoTentarDeNovo={daCentral.tentarDeNovo}
            foco={preferencias.notificacoes.foco}
            aoMudarFoco={(foco) => mudar('notificacoes', { foco })}
            aoAbrir={comNotificacao(notificacoes.abrir)}
            aoMarcarComoLida={comNotificacao(notificacoes.marcarComoLida)}
            aoMarcarTodasComoLidas={notificacoes.marcarTodasComoLidas}
            aoReconhecer={comNotificacao(notificacoes.reconhecer)}
            aoAdiar={comNotificacao(notificacoes.adiar)}
          />
        </section>
      </section>
    </div>
  );
}

/**
 * "Receber neste aparelho", com "Este aparelho recebe os avisos." quando ele já está inscrito e,
 * quando não pode receber, o motivo em texto: o servidor sem os avisos, o navegador sem eles, o
 * iPhone fora do app instalado e os avisos bloqueados.
 */
function EsteAparelho() {
  const idDoTitulo = useId();
  const aparelho = useEsteAparelho();
  const { canais, podeReceber, frase } = aparelho;
  const [inscrevendo, definirInscrevendo] = useState(false);
  const receber = async () => {
    definirInscrevendo(true);
    try {
      await aparelho.receber();
    } catch (erro) {
      avisar({ situacao: 'critico', titulo: (erro as Error).message });
    } finally {
      definirInscrevendo(false);
    }
  };
  const texto = canais.isPending
    ? 'Carregando os avisos deste aparelho…'
    : canais.isError
      ? canais.error.message
      : aparelho.textoDoPush;
  return (
    <section aria-labelledby={idDoTitulo} className={estilos.esteAparelho}>
      <h2 id={idDoTitulo} className={estilos.tituloDaParte}>
        Neste aparelho
      </h2>
      <div className={estilos.linhaDoAparelho}>
        <p
          ref={frase}
          tabIndex={-1}
          role={canais.isPending ? 'status' : undefined}
          className={estilos.texto}
        >
          {texto}
        </p>
        {canais.isError && <Botao onPress={() => void canais.refetch()}>Tentar de novo</Botao>}
        {podeReceber && (
          <Botao
            nivel="primario"
            carregando={inscrevendo}
            rotuloCarregando="Inscrevendo"
            onPress={receber}
          >
            Receber neste aparelho
          </Botao>
        )}
      </div>
    </section>
  );
}
