// As mensagens dos canais de fora (spec notificacoes, "E-mail do crítico na hora", "Resumo diário
// por e-mail", "Push por severidade" e "Teste dos canais"; change p3c-email-e-push, design,
// decisões 6 e 7): o e-mail sai em texto, com o que a central mostra e o endereço do registro na
// origem da organização, e o push leva um conteúdo pronto para o aparelho mostrar.
import { ROTULOS_DAS_SEVERIDADES } from '../alertas/regras.ts';
import type { SeveridadeDaNotificacao } from './notificacoes.ts';

/** A notificação, com o que os canais de fora mostram dela. */
export interface NotificacaoParaMensagem {
  id: string;
  severidade: SeveridadeDaNotificacao;
  titulo: string;
  descricao: string | null;
  origem: string;
  destino: string | null;
  criadaEm: Date;
}

/** De onde o e-mail vem: o nome da organização e a origem dos endereços dela. */
export interface OrigemDaMensagem {
  organizacao: string;
  /** Como `https://grafite.empresa.com.br`, sem o caminho. */
  origem: string;
}

export interface MensagemDeEmail {
  assunto: string;
  texto: string;
}

/** O que o push leva até o aparelho, que o mostra pelo sistema dele. */
export interface ConteudoDoPush {
  titulo: string;
  corpo: string;
  /** O endereço que o toque abre, dentro do Grafite. */
  destino: string;
  severidade: SeveridadeDaNotificacao;
  /** A etiqueta do aviso no aparelho: o mesmo aviso não aparece duas vezes. */
  etiqueta: string;
}

/** Quantas notificações o resumo lista; as outras entram na conta de "E mais". */
export const ITENS_DO_RESUMO = 50;

/** O endereço do registro na origem da organização; sem destino, a tela inicial. */
export function enderecoDoRegistro(origem: string, destino: string | null): string {
  return `${origem.replace(/\/+$/, '')}${destino ?? '/'}`;
}

/** O pé de todo e-mail: de qual organização ele é e onde mudar o que chega. */
const rodape = (organizacao: string) =>
  `\n-- \nGrafite · ${organizacao}\nPara mudar o que chega por e-mail, abra Ajustes › Notificações no Grafite.\n`;

/** O e-mail de uma notificação crítica, mandado na hora. */
export function emailDoCritico(
  notificacao: NotificacaoParaMensagem,
  { organizacao, origem }: OrigemDaMensagem,
): MensagemDeEmail {
  const linhas = [notificacao.titulo];
  if (notificacao.descricao) linhas.push(notificacao.descricao);
  linhas.push('', `Origem: ${notificacao.origem}`);
  if (notificacao.destino) {
    linhas.push(`Abrir: ${enderecoDoRegistro(origem, notificacao.destino)}`);
  }
  return {
    assunto: `${ROTULOS_DAS_SEVERIDADES[notificacao.severidade]}: ${notificacao.titulo}`,
    texto: `${linhas.join('\n')}\n${rodape(organizacao)}`,
  };
}

/**
 * O resumo diário: as notificações dadas, da mais nova para a mais antiga, até `ITENS_DO_RESUMO`,
 * e quantas mais há das `total` não lidas que não foram por e-mail. O horário é o do fuso dado.
 */
export function emailDoResumo(
  notificacoes: readonly NotificacaoParaMensagem[],
  total: number,
  { organizacao, origem, fuso }: OrigemDaMensagem & { fuso: string },
): MensagemDeEmail {
  const horario = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const listadas = notificacoes.slice(0, ITENS_DO_RESUMO);
  const linhas = listadas.map((notificacao) =>
    [
      ROTULOS_DAS_SEVERIDADES[notificacao.severidade],
      notificacao.titulo,
      notificacao.origem,
      horario.format(notificacao.criadaEm).replace(',', ''),
    ].join(' · '),
  );
  if (total > listadas.length) linhas.push('', `E mais ${total - listadas.length} na central.`);
  linhas.push('', `Abrir o Grafite: ${enderecoDoRegistro(origem, null)}`);
  return {
    assunto: `Resumo do Grafite: ${total} ${total === 1 ? 'notificação não lida' : 'notificações não lidas'}`,
    texto: `${linhas.join('\n')}\n${rodape(organizacao)}`,
  };
}

/** O e-mail de teste, que a conta manda para si pelos Ajustes. */
export function emailDeTeste({ organizacao }: OrigemDaMensagem): MensagemDeEmail {
  return {
    assunto: 'Teste do e-mail do Grafite',
    texto: `Este é um e-mail de teste do Grafite. Se ele chegou, as notificações por e-mail chegam aqui também.\n${rodape(organizacao)}`,
  };
}

/** O conteúdo do push de uma notificação. */
export function conteudoDoPush(notificacao: NotificacaoParaMensagem): ConteudoDoPush {
  return {
    titulo: `${ROTULOS_DAS_SEVERIDADES[notificacao.severidade]}: ${notificacao.titulo}`,
    corpo: notificacao.descricao ?? notificacao.origem,
    destino: notificacao.destino ?? '/',
    severidade: notificacao.severidade,
    etiqueta: notificacao.id,
  };
}

/** O aviso de teste, que a conta manda para os aparelhos dela pelos Ajustes. */
export function pushDeTeste(): ConteudoDoPush {
  return {
    titulo: 'Teste do aviso do Grafite',
    corpo: 'Se este aviso apareceu, os avisos no celular chegam aqui.',
    destino: '/ajustes/notificacoes',
    severidade: 'info',
    etiqueta: 'teste',
  };
}
