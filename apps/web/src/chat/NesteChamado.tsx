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

/**
 * Quem atende o chamado, desde quando assumiu, ou, no resolvido, quem atendeu, pelo resumo dos
 * tempos da última resolução, e quando resolveu. Nulo com ninguém.
 */
export function quemAtende(
  chamado: ConversaDoChamado,
): { nome: string; assumiu: Date | null; resolveu: Date | null } | null {
  if (chamado.situacao === 'resolvido') {
    const resumo = ultimaResolucao(chamado.conversa)?.resumo ?? null;
    if (resumo) {
      return { nome: resumo.atendeu, assumiu: null, resolveu: new Date(resumo.resolvido.em) };
    }
    return chamado.atende && { nome: chamado.atende.nome, assumiu: null, resolveu: null };
  }
  return (
    chamado.atende && {
      nome: chamado.atende.nome,
      assumiu: new Date(chamado.atende.desde),
      resolveu: null,
    }
  );
}

/**
 * Quem atende e a previsão da resposta numa linha, no cabeçalho do chamado no celular (m08), como
 * "Atende: Ana Souza · responde em ~1 h"; sem ninguém, "Na fila da TI"; no resolvido, quem atendeu.
 * Nulo no resolvido sem registro de quem atendeu.
 */
export function linhaDeQuemAtende(chamado: ConversaDoChamado): string | null {
  const quem = quemAtende(chamado);
  if (chamado.situacao === 'resolvido') return quem && `Atendeu: ${quem.nome}`;
  const atende = quem ? `Atende: ${quem.nome}` : 'Na fila da TI';
  return chamado.previsao === null ? atende : `${atende} · ${chamado.previsao}`;
}

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

  const atende = quemAtende(chamado);
  let sobre: string | null = null;
  if (atende?.resolveu) sobre = `resolveu ${quandoAs(atende.resolveu, agora, dataHora)}`;
  else if (atende?.assumiu) sobre = `assumiu ${quandoAs(atende.assumiu, agora, dataHora)}`;
  const quem = atende && { nome: atende.nome, sobre };

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
