// O chamado citado (spec chat, "Chamado citado numa mensagem"; spec modulo-chat, "Chamado citado na
// tela"; change chat-com-chamados, design, decisão 15): o chip de 32 px, com o número em mono, o
// selo da situação e quem atende, e o resumo no cartão do botão com cartão do kit, que abre com o
// mouse ou o foco parados no chip, ou ao escolhê-lo, e fecha com o Esc. O resumo tem a situação, o
// título, quem atende e "Copiar link" e, a quem participa do chamado ou o vê com `chamados.ver`, as
// duas últimas mensagens que a conta vê, o ativo, a hora da abertura e "Abrir chamado". Os chamados
// de "Chamados da equipe" abrem o mesmo resumo.
import {
  Avatar,
  avisar,
  Botao,
  copiarParaAreaDeTransferencia,
  GatilhoComCartao,
  Icone,
  useDataHora,
} from '@grafite/ui';
import { LifeBuoy, Link, SquareArrowOutUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useIrNoChat, useOndeEstaOChat } from './base.tsx';
import estilos from './ChamadoCitado.module.css';
import { type ResumoDoChamadoNoChat, useResumoDoChamadoNoChat } from './consultas.ts';
import { quandoNoChat, rotuloDoDia } from './conversa.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { useAgoraNoChat } from './janela.ts';
import { SeloDoChamado } from './SeloDoChamado.tsx';

/** O que o chip e "Chamados da equipe" já sabem do chamado, antes do resumo. */
export interface ChamadoNoChip {
  numero: number;
  /** A situação nas palavras do chat, como a API a manda para a conta. */
  situacao: string;
  atende: string | null;
  /** O título, que "Chamados da equipe" já tem; o chip o mostra com o resumo. */
  titulo?: string;
}

/**
 * O endereço do chamado: o da conversa dele no chat ou, a quem o vê só no módulo Chamados, o do
 * módulo.
 */
export const enderecoDoChamado = (numero: number, abrir: ResumoDoChamadoNoChat['abrir']) =>
  abrir === 'chamados' ? `/chamados/${numero}` : `/chat/chamados/${numero}`;

async function copiarOLink(numero: number, abrir: ResumoDoChamadoNoChat['abrir']) {
  try {
    await copiarParaAreaDeTransferencia(
      `${window.location.origin}${enderecoDoChamado(numero, abrir)}`,
    );
    avisar({ situacao: 'sucesso', titulo: 'Link copiado.' });
  } catch {
    avisar({ situacao: 'atencao', titulo: 'Não foi possível copiar.' });
  }
}

/**
 * O botão com o resumo do chamado, desenhado pela tela: o chip, no texto da mensagem, ou o chamado
 * de "Chamados da equipe".
 */
export function ComOResumoDoChamado({
  chamado,
  className,
  soAoEscolher = false,
  children,
}: {
  chamado: ChamadoNoChip;
  className: string | undefined;
  /** Numa lista, o resumo abre só ao escolher a linha, para não cobrir as de baixo. */
  soAoEscolher?: boolean;
  children: ReactNode;
}) {
  return (
    <GatilhoComCartao
      soAoEscolher={soAoEscolher}
      className={className}
      titulo={`Resumo do chamado ${chamado.numero}`}
      cartao={() => <ResumoDoChamado chamado={chamado} />}
    >
      {children}
    </GatilhoComCartao>
  );
}

/** O chip do chamado citado no texto: "#1045 · EM ANDAMENTO · Bruno Lima". */
export function ChipDoChamado({
  chamado,
  semCartao = false,
}: {
  chamado: ChamadoNoChip;
  /** Na seleção das mensagens, o chip sem o cartão do resumo, que não abre nem recebe o foco. */
  semCartao?: boolean;
}) {
  const dentro = (
    <>
      <span className={estilos.paraOLeitor}>Chamado </span>
      <span className={estilos.numero}>#{chamado.numero}</span>
      <span className={estilos.paraOLeitor}>, </span>
      <SeloDoChamado texto={chamado.situacao} />
      {chamado.atende !== null && (
        <span className={estilos.atende}>
          <span aria-hidden="true">· </span>
          <span className={estilos.paraOLeitor}>, atende </span>
          {chamado.atende}
        </span>
      )}
    </>
  );
  return semCartao ? (
    <span className={estilos.chip}>{dentro}</span>
  ) : (
    <ComOResumoDoChamado chamado={chamado} className={estilos.chip}>
      {dentro}
    </ComOResumoDoChamado>
  );
}

/** O resumo no cartão, lido quando ele abre. */
function ResumoDoChamado({ chamado }: { chamado: ChamadoNoChip }) {
  const resumo = useResumoDoChamadoNoChat(chamado.numero);
  const irNoChat = useIrNoChat();
  // No app, o chamado do módulo abre o Grafite numa janela nova; na casca, a janela é a mesma.
  const noApp = useOndeEstaOChat() === 'app';
  const dataHora = useDataHora();
  const agora = useAgoraNoChat();
  const dados = resumo.data;
  const detalhes = dados?.detalhes ?? null;
  const titulo = dados?.titulo ?? chamado.titulo;
  // A situação e quem atende de agora vêm do resumo: o chip só segue o chamado na conversa de origem,
  // e o citado em outra conversa fica com a última leitura dela. Antes do resumo, valem os do chip.
  const situacao = dados?.situacao ?? chamado.situacao;
  const atende = dados ? dados.atende : chamado.atende;
  // A hora de hoje vai sozinha, como no m12; a de outro dia leva o dia.
  const quando = (em: string) => {
    const data = new Date(em);
    return rotuloDoDia(data, agora, dataHora) === 'Hoje'
      ? dataHora.formatarHora(data)
      : quandoNoChat(data, agora, dataHora);
  };
  const abrir = (onde: NonNullable<ResumoDoChamadoNoChat['abrir']>) =>
    irNoChat(enderecoDoChamado(chamado.numero, onde));
  return (
    <div className={estilos.cartao}>
      <p className={estilos.cabecalho}>
        <span className={estilos.marca}>
          <Icone icone={LifeBuoy} tamanho={12} />
          Chamado <span className={estilos.mono}>#{chamado.numero}</span>
        </span>
        <SeloDoChamado texto={situacao} />
      </p>
      {titulo !== undefined && <p className={estilos.titulo}>{titulo}</p>}
      {resumo.isPending && (
        <p role="status" className={estilos.estado}>
          Carregando o resumo…
        </p>
      )}
      {resumo.isError && !dados && (
        <FalhaDoChat
          mensagem={resumo.error.message}
          relendo={resumo.isFetching}
          tentarDeNovo={() => void resumo.refetch()}
        />
      )}
      {detalhes && detalhes.ultimas.length > 0 && (
        <ul className={estilos.ultimas} aria-label="Últimas mensagens">
          {detalhes.ultimas.map((ultima) => (
            <li key={`${ultima.em}·${ultima.especie}·${ultima.autor}`}>
              <Avatar nome={ultima.autor} tamanho="barra" className={estilos.foto} decorativo />
              <div>
                <p className={estilos.quem}>
                  {ultima.minha ? 'Você' : ultima.autor} ·{' '}
                  <time className={estilos.mono} dateTime={ultima.em}>
                    {quando(ultima.em)}
                  </time>
                  {ultima.especie === 'nota' && <span className={estilos.nota}>Nota</span>}
                </p>
                <p className={estilos.textoDaUltima}>{ultima.texto || 'Sem texto.'}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(atende !== null || detalhes) && (
        <dl className={estilos.dados}>
          {atende !== null && (
            <div>
              <dt>Atende</dt>
              <dd>{atende}</dd>
            </div>
          )}
          {detalhes?.ativo && (
            <div>
              <dt>Ativo</dt>
              <dd className={detalhes.ativo.patrimonio === null ? undefined : estilos.mono}>
                {detalhes.ativo.patrimonio ?? detalhes.ativo.nome}
              </dd>
            </div>
          )}
          {detalhes && (
            <div>
              <dt>Aberto</dt>
              <dd className={estilos.mono}>{quando(detalhes.abertoEm)}</dd>
            </div>
          )}
        </dl>
      )}
      {dados && (
        <div className={estilos.acoes}>
          {dados.abrir !== null && (
            <Botao
              nivel="primario"
              icone={SquareArrowOutUpRight}
              onPress={() => dados.abrir !== null && abrir(dados.abrir)}
            >
              Abrir chamado
              {dados.abrir === 'chamados' && noApp && (
                <span className={estilos.paraOLeitor}>, no Grafite, numa janela nova</span>
              )}
            </Botao>
          )}
          <Botao icone={Link} onPress={() => void copiarOLink(chamado.numero, dados.abrir)}>
            Copiar link
          </Botao>
        </div>
      )}
    </div>
  );
}
