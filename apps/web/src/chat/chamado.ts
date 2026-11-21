// O chamado no chat de quem participa (spec modulo-chat, "Chamado no chat"; spec chamados, "Leitura
// do chamado pela pessoa", "Resposta nova" e "Avaliação do atendimento"; change chat-com-chamados,
// design, decisão 15): a ordem do que a conversa mostra, a hora das etapas e do painel e o dia do
// "Reabrir até".
import type { components } from '@grafite/api-client';
import { nomeNoChat } from '@grafite/domain';
import type { DataHora } from '@grafite/ui';
import { rotuloDoDia } from './conversa.ts';

export type ConversaDoChamado = components['schemas']['ConversaDoChamadoDeQuemParticipa'];
export type ItemDoChamado = ConversaDoChamado['conversa'][number];
export type MensagemDoChamado = Extract<ItemDoChamado, { especie: 'mensagem' }>;
export type EventoDoChamado = Extract<ItemDoChamado, { especie: 'evento' }>;
export type EtapaNoChat = ConversaDoChamado['etapas'][number];
export type CartaoDoAtivo = components['schemas']['CartaoDoAtivo'];

/** O que a conversa do chamado mostra, na ordem. */
export type ItemDoChamadoNaTela =
  | { tipo: 'dia'; chave: string; rotulo: string }
  | { tipo: 'nova'; chave: string }
  | { tipo: 'abertura'; chave: string; evento: EventoDoChamado | null }
  | { tipo: 'mensagem'; chave: string; mensagem: MensagemDoChamado }
  | { tipo: 'evento'; chave: string; evento: EventoDoChamado }
  | { tipo: 'avaliacao'; chave: string };

const ehEvento = (item: ItemDoChamado, codigo: string): item is EventoDoChamado =>
  item.especie === 'evento' && item.evento === codigo;

/**
 * A conversa na ordem da tela: o dia antes do primeiro item de cada dia; a abertura, com o resumo das
 * respostas ou a mensagem citada, no lugar do evento dela, ou no começo, sem ele; "Resposta nova"
 * antes da primeira mensagem dela; e, no resolvido que ainda reabre, o quadro da avaliação logo
 * depois do último resolvido. A avaliação dessa resolução fica no quadro, e o evento dela sai da
 * conversa; a de uma resolução de antes fica, como a spec pede.
 */
export function itensDoChamado(
  {
    conversa,
    respostaNova,
    situacao,
    fechado,
  }: Pick<ConversaDoChamado, 'conversa' | 'respostaNova' | 'situacao' | 'fechado'>,
  { agora, dataHora }: { agora: Date; dataHora: DataHora },
): ItemDoChamadoNaTela[] {
  const avaliavel = situacao === 'resolvido' && !fechado;
  const ultimoResolvido = avaliavel
    ? conversa.findLastIndex((item) => ehEvento(item, 'resolveu'))
    : -1;
  const primeiraNova = respostaNova.quantas > 0 ? respostaNova.desde : null;
  const itens: ItemDoChamadoNaTela[] = [];
  let diaDeAntes: string | null = null;
  let comAbertura = false;
  conversa.forEach((item, posicao) => {
    if (avaliavel && posicao > ultimoResolvido && ehEvento(item, 'avaliou')) return;
    const em = new Date(item.em);
    const dia = dataHora.formatarData(em);
    if (dia !== diaDeAntes) {
      itens.push({ tipo: 'dia', chave: `dia:${dia}`, rotulo: rotuloDoDia(em, agora, dataHora) });
      diaDeAntes = dia;
    }
    if (item.especie === 'mensagem') {
      if (item.id === primeiraNova) itens.push({ tipo: 'nova', chave: 'nova' });
      itens.push({ tipo: 'mensagem', chave: item.id, mensagem: item });
    } else if (item.evento === 'abertura' && !comAbertura) {
      comAbertura = true;
      itens.push({ tipo: 'abertura', chave: item.id, evento: item });
    } else {
      itens.push({ tipo: 'evento', chave: item.id, evento: item });
    }
    if (posicao === ultimoResolvido) itens.push({ tipo: 'avaliacao', chave: 'avaliacao' });
  });
  if (!comAbertura) itens.unshift({ tipo: 'abertura', chave: 'abertura', evento: null });
  if (avaliavel && ultimoResolvido === -1) itens.push({ tipo: 'avaliacao', chave: 'avaliacao' });
  return itens;
}

/** O dia no começo da frase: "hoje", "ontem", "12/11" ou, de outro ano, "30/12/2025". */
function diaNaFrase(em: Date, agora: Date, dataHora: DataHora): string {
  const dia = rotuloDoDia(em, agora, dataHora);
  return dia === 'Hoje' || dia === 'Ontem' ? dia.toLowerCase() : dia;
}

/**
 * A hora da etapa como a spec a escreve, "ontem 17:05" e "hoje 09:21", sem a vírgula do
 * `momentoNaConversa` da TI.
 */
export function momentoDaEtapa(em: Date, agora: Date, dataHora: DataHora): string {
  return `${diaNaFrase(em, agora, dataHora)} ${dataHora.formatarHora(em)}`;
}

/** Quando, depois de um verbo, como em "assumiu às 10:48" e "resolveu ontem às 17:20". */
export function quandoAs(em: Date, agora: Date, dataHora: DataHora): string {
  const dia = diaNaFrase(em, agora, dataHora);
  const hora = `às ${dataHora.formatarHora(em)}`;
  return dia === 'hoje' ? hora : `${dia} ${hora}`;
}

/**
 * A hora na conversa, que os dias já separam: "10:53" hoje e, de outro dia, como na etapa, "ontem
 * 17:05", na escolha, no resumo dos tempos e nos anexos de "Neste chamado".
 */
export function horaNaConversa(em: Date, agora: Date, dataHora: DataHora): string {
  return rotuloDoDia(em, agora, dataHora) === 'Hoje'
    ? dataHora.formatarHora(em)
    : momentoDaEtapa(em, agora, dataHora);
}

/**
 * A hora da última mensagem no cartão da vista Chamados: só a hora hoje e, nos outros dias, só o
 * dia, como "ontem", "18/11" e, de outro ano, "30/12/2025".
 */
export function horaNaLista(em: Date, agora: Date, dataHora: DataHora): string {
  return rotuloDoDia(em, agora, dataHora) === 'Hoje'
    ? dataHora.formatarHora(em)
    : diaNaFrase(em, agora, dataHora);
}

/**
 * Quem escreveu a última mensagem, no cartão da vista Chamados, como em "Bruno: Já vi aqui": o
 * primeiro nome, ou "Você" na mensagem da conta. `null` sem o nome.
 */
export function quemEscreveuNaLista({
  autor,
  minha,
}: {
  autor: string;
  minha: boolean;
}): string | null {
  if (minha) return 'Você';
  return autor.trim().split(/\s+/)[0] || null;
}

/** Um anexo do chamado em "Neste chamado": o arquivo e, embaixo, de onde ele veio. */
export interface AnexoNoPainel {
  id: string;
  nome: string;
  tipo: string;
  bytes: number;
  /** Quem mandou e quando, como "você · 10:32", ou o campo do formulário, como "Print do erro". */
  sobre: string;
}

/**
 * Os anexos do chamado, na ordem em que chegaram: os da mensagem de onde ele foi aberto, os dos campos
 * do formulário e os das mensagens da conversa.
 */
export function anexosDoChamado(
  {
    origem,
    anexosDosCampos,
    conversa,
  }: Pick<ConversaDoChamado, 'origem' | 'anexosDosCampos' | 'conversa'>,
  { agora, dataHora }: { agora: Date; dataHora: DataHora },
): AnexoNoPainel[] {
  const hora = (em: string) => horaNaConversa(new Date(em), agora, dataHora);
  const daOrigem =
    origem?.anexos.map((anexo) => ({ ...anexo, sobre: `${origem.autor} · ${hora(origem.em)}` })) ??
    [];
  const dosCampos = anexosDosCampos.map(({ campo, ...anexo }) => ({ ...anexo, sobre: campo }));
  const dasMensagens = conversa.flatMap((item) => {
    if (item.especie !== 'mensagem') return [];
    const autor = item.autor.minha ? 'você' : nomeNoChat(item.autor.nome, item.autor.daTi);
    return item.anexos.map((anexo) => ({ ...anexo, sobre: `${autor} · ${hora(item.em)}` }));
  });
  return [...daOrigem, ...dosCampos, ...dasMensagens];
}

/** O dia do "Reabrir até 18/11", que a API manda como "2026-11-18"; de outro ano, com ele. */
export function diaDoReabrir(dia: string, agora: Date, dataHora: DataHora): string {
  const [ano, mes, data] = dia.split('-');
  const doMes = `${data}/${mes}`;
  return ano === dataHora.formatarData(agora).slice(-4) ? doMes : `${doMes}/${ano}`;
}
