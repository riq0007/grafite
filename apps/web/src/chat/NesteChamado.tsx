// O painel "Neste chamado" (spec modulo-chat, "Chamado no chat"; change chat-com-chamados, design,
// decisão 15, "O chamado no chat"): o que o chamado junta, cada parte num cartão. Os anexos, com quem
// mandou e quando, ou o campo do formulário; o ativo ligado, com o ícone do tipo e o patrimônio; e
// quem atende, com a previsão da resposta, ou, no resolvido, quem atendeu. A parte vazia diz que não
// tem. Fica ao lado da conversa na tela larga e, na estreita, num popover, pelo botão do cabeçalho.
import { Avatar, Carimbo, type DataHora, Icone } from '@grafite/ui';
import { FileText, Image } from 'lucide-react';
import { useId } from 'react';
import { ICONES_DOS_TIPOS_DE_CHAMADO } from '../modulos/chamados/icones.ts';
import {
  anexosDoChamado,
  type ConversaDoChamado,
  type EventoDoChamado,
  quandoAs,
} from './chamado.ts';
import estilos from './NesteChamado.module.css';

/** O último resolvido com o resumo dos tempos, de onde sai quem atendeu. */
const ultimaResolucao = (conversa: ConversaDoChamado['conversa']) =>
  conversa.findLast(
    (item): item is EventoDoChamado =>
      item.especie === 'evento' && item.evento === 'resolveu' && item.resumo !== null,
  );

export function NesteChamado({
  chamado,
  agora,
  dataHora,
}: {
  chamado: ConversaDoChamado;
  agora: Date;
  dataHora: DataHora;
}) {
  const idDosAnexos = useId();
  const idDoAtivo = useId();
  const idDeQuem = useId();
  const anexos = anexosDoChamado(chamado, { agora, dataHora });
  const resolvido = chamado.situacao === 'resolvido';
  const { ativo } = chamado;

  let quem: { nome: string; sobre: string | null } | null;
  if (resolvido) {
    const resumo = ultimaResolucao(chamado.conversa)?.resumo ?? null;
    quem = resumo
      ? {
          nome: resumo.atendeu,
          sobre: `resolveu ${quandoAs(new Date(resumo.resolvido.em), agora, dataHora)}`,
        }
      : chamado.atende && { nome: chamado.atende.nome, sobre: null };
  } else {
    quem = chamado.atende && {
      nome: chamado.atende.nome,
      sobre: `assumiu ${quandoAs(new Date(chamado.atende.desde), agora, dataHora)}`,
    };
  }

  return (
    <div className={estilos.painel}>
      <section className={estilos.secao} aria-labelledby={idDosAnexos}>
        <Carimbo nivel={3} id={idDosAnexos}>{`Anexos · ${anexos.length}`}</Carimbo>
        {anexos.length === 0 ? (
          <p className={estilos.nenhum}>Nenhum anexo.</p>
        ) : (
          <ul className={estilos.cartoes}>
            {anexos.map((anexo) => (
              <li key={anexo.id}>
                <a
                  className={estilos.cartao}
                  href={`/api/chat/chamados/${chamado.numero}/anexos/${anexo.id}`}
                  download={anexo.nome}
                >
                  <span className={estilos.icone}>
                    <Icone
                      icone={anexo.tipo.startsWith('image/') ? Image : FileText}
                      tamanho={20}
                    />
                  </span>
                  <span className={estilos.textos}>
                    <span className={estilos.nome}>{anexo.nome}</span>
                    <small>{anexo.sobre}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={estilos.secao} aria-labelledby={idDoAtivo}>
        <Carimbo nivel={3} id={idDoAtivo}>
          Ativo ligado
        </Carimbo>
        {ativo === null ? (
          <p className={estilos.nenhum}>Nenhum ativo ligado.</p>
        ) : (
          <div className={estilos.cartao}>
            <span className={estilos.icone}>
              <Icone icone={ICONES_DOS_TIPOS_DE_CHAMADO[chamado.tipo.icone]} tamanho={20} />
            </span>
            <span className={estilos.textos}>
              <span className={estilos.nome}>{ativo.nome}</span>
              {ativo.patrimonio !== null && (
                <small className={estilos.mono}>{ativo.patrimonio}</small>
              )}
            </span>
          </div>
        )}
      </section>
      <section className={estilos.secao} aria-labelledby={idDeQuem}>
        <Carimbo nivel={3} id={idDeQuem}>
          {resolvido ? 'Quem atendeu' : 'Quem atende'}
        </Carimbo>
        <div className={estilos.cartao}>
          {quem ? (
            <>
              <Avatar nome={quem.nome} className={estilos.foto} decorativo />
              <span className={estilos.textos}>
                <span className={estilos.nome}>{quem.nome}</span>
                {quem.sobre !== null && <small>{quem.sobre}</small>}
                {!resolvido && chamado.previsao !== null && <small>{chamado.previsao}</small>}
              </span>
            </>
          ) : (
            <span className={estilos.textos}>
              <span className={estilos.nome}>{resolvido ? 'Sem registro' : 'Na fila da TI'}</span>
              {!resolvido && chamado.previsao !== null && <small>{chamado.previsao}</small>}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
