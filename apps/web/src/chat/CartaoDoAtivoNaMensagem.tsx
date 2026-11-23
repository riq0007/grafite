// O cartão do ativo na mensagem da TI (spec modulo-chat, "Chamado no chat"; spec chamados, "Cartão do
// ativo na mensagem"; change chat-com-chamados, design, decisão 15, "O chamado no chat"): o retrato
// do ativo como foi mandado, com a miniatura do tipo, o nome em peso forte, o modelo e o patrimônio
// em mono, o selo do toner crítico, a barra do nível com o número ao lado, o IP, a situação e a hora
// dos dados. "Abrir a ficha" abre o Grafite na ficha, só a quem vê os ativos: no app do chat, numa
// janela nova, e, na janela do Chat da casca, nela mesma. No chamado aberto da TI, a API diz a quem
// vai o "Abrir a ficha", pelo local do ativo, e o campo de escrever põe o "Tirar" no cartão
// (chat-com-chamados, tarefa 4.13).
import { tintaDoSuprimento } from '@grafite/domain';
import { type DataHora, Icone, Medidor, MiniaturaDeAtivo, RotuloDeSituacao } from '@grafite/ui';
import { ArrowUpRight, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAcesso } from '../sessao/useAcesso.ts';
import { useServidor } from '../sessao/useSessao.tsx';
import estilos from './CartaoDoAtivoNaMensagem.module.css';
import { type CartaoDoAtivo, momentoDaEtapa } from './chamado.ts';
import { LinkDoChat } from './LinkDoChat.tsx';

const NENHUM_DESLIGADO: readonly string[] = [];

export function CartaoDoAtivoNaMensagem({
  cartao,
  agora,
  dataHora,
  abrir,
  acao,
}: {
  cartao: CartaoDoAtivo;
  agora: Date;
  dataHora: DataHora;
  /**
   * O "Abrir a ficha" que a API decidiu, pelo local do ativo; sem ele, a quem vê os ativos com o
   * Ativos ligado.
   */
  abrir?: boolean;
  /** A ação do cartão no canto, como o "Tirar" do campo de escrever. */
  acao?: ReactNode;
}) {
  const { pode } = useAcesso();
  const desligados = useServidor()?.modulosDesligados ?? NENHUM_DESLIGADO;
  const abrirAFicha = abrir ?? (pode('ativos.ver') && !desligados.includes('ativos'));
  const { suprimento } = cartao;
  const sobre = [cartao.modelo, cartao.patrimonio].filter(Boolean).join(' · ');
  return (
    <article className={estilos.cartao} aria-label={`Ativo ${cartao.nome}`}>
      <div className={estilos.topo}>
        <MiniaturaDeAtivo tipo={cartao.icone} className={estilos.miniatura} />
        <div className={estilos.nomes}>
          <p className={estilos.nome}>{cartao.nome}</p>
          {sobre !== '' && <p className={estilos.sobre}>{sobre}</p>}
        </div>
        {suprimento?.critico && (
          <RotuloDeSituacao situacao="critico" icone={CircleAlert}>
            Toner crítico
          </RotuloDeSituacao>
        )}
        {acao}
      </div>
      {suprimento && (
        <div className={estilos.suprimento}>
          <span className={estilos.nomeDoSuprimento}>{suprimento.descricao}</span>
          <Medidor
            rotulo={suprimento.descricao}
            valor={suprimento.percentual}
            tinta={tintaDoSuprimento(suprimento.descricao) ?? 'neutra'}
            marcas={[]}
            tamanho="compacto"
          />
        </div>
      )}
      <dl className={estilos.dados}>
        {cartao.ip !== null && (
          <div>
            <dt>IP</dt>
            <dd className={estilos.mono}>{cartao.ip}</dd>
          </div>
        )}
        <div>
          <dt>Situação</dt>
          <dd>{cartao.disponibilidade?.texto ?? 'Sem leitura'}</dd>
        </div>
        <div>
          <dt>Dados de</dt>
          <dd>{momentoDaEtapa(new Date(cartao.em), agora, dataHora)}</dd>
        </div>
      </dl>
      {abrirAFicha && (
        <LinkDoChat className={estilos.abrir} para={`/ativos/${cartao.ativo}`}>
          Abrir a ficha
          <Icone icone={ArrowUpRight} tamanho={14} />
        </LinkDoChat>
      )}
    </article>
  );
}
