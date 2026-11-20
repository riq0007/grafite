// A conversa na tela (spec modulo-chat, "Conversa na tela"; spec chat, "Não lidas" e "Link da
// mensagem"; change chat-com-chamados, design, decisões 5 e 15). As mensagens carregadas são um
// trecho contínuo da conversa, que cresce pelas pontas, de 50 em 50, e se relê inteiro quando a
// conversa muda, sem deixar buraco. A tela abre na mensagem do link, na primeira não lida ou na
// última, e mostra os dias, o separador "Mensagens novas" e as mensagens seguidas da mesma pessoa
// juntas. Os ids são os `uuidv7()` da API, em minúsculas: a ordem do texto é a ordem da conversa.
import type { components } from '@grafite/api-client';
import type { DataHora } from '@grafite/ui';

export type MensagemDoChat = components['schemas']['MensagemDoChat'];
export type PaginaDeMensagens = components['schemas']['PaginaDeMensagens'];

/** O pedido de uma página: as mais novas, sem nada; ou antes, depois ou ao redor de uma mensagem. */
export interface PedidoDaPagina {
  antes?: string;
  depois?: string;
  em?: string;
}

export type BuscarPagina = (pedido: PedidoDaPagina) => Promise<PaginaDeMensagens>;

/** As mensagens carregadas, da mais antiga para a mais nova, sem buraco entre elas. */
export interface TrechoDaConversa {
  itens: MensagemDoChat[];
  /** Há mensagens antes da primeira do trecho. */
  anteriores: boolean;
  /** Há mensagens depois da última do trecho: o trecho não chega ao fim da conversa. */
  seguintes: boolean;
  /** A última mensagem lida pela conta, a mais nova que as páginas trouxeram. */
  lidaAte: string | null;
  /** A última lida quando a conversa abriu: "Mensagens novas" fica depois dela. */
  lidaAoAbrir: string | null;
}

/** O maior de dois ids, sem o nulo. */
const maisNovo = (a: string | null, b: string | null) =>
  a === null || (b !== null && b > a) ? b : a;

/**
 * O trecho com a página: as mensagens que a página cobre saem do trecho, e entram as dela, com as
 * reações e as marcas de agora. A página cobre da primeira à última mensagem dela, ou do começo da
 * conversa, sem nada antes, até o fim, sem nada depois; a de antes e a de depois de uma mensagem
 * começam ou terminam nela. A página longe do trecho, sem nada em comum com ele, fica no lugar dele,
 * para não deixar buraco.
 */
export function juntarPagina(
  trecho: TrechoDaConversa | undefined,
  pedido: PedidoDaPagina,
  pagina: PaginaDeMensagens,
): TrechoDaConversa {
  const daPagina = {
    itens: pagina.itens,
    anteriores: pagina.anteriores,
    seguintes: pagina.seguintes,
    lidaAte: maisNovo(trecho?.lidaAte ?? null, pagina.lidaAte),
  };
  if (!trecho) return { ...daPagina, lidaAoAbrir: pagina.lidaAte };
  const primeira = pagina.itens[0]?.id;
  const ultima = pagina.itens.at(-1)?.id;
  /** A página não diz nada abaixo deste id (exclusivo), ou nulo, do começo da conversa. */
  const abaixo = pedido.depois ?? (pagina.anteriores && primeira !== undefined ? primeira : null);
  const abaixoIncluido = pedido.depois === undefined;
  /** A página não diz nada acima deste id, ou nulo, até o fim da conversa. */
  const acima = pedido.antes ?? (pagina.seguintes && ultima !== undefined ? ultima : null);
  const acimaIncluido = pedido.antes === undefined;
  const cobre = (id: string) =>
    (abaixo === null || (abaixoIncluido ? id >= abaixo : id > abaixo)) &&
    (acima === null || (acimaIncluido ? id <= acima : id < acima));

  const doTrecho = { primeira: trecho.itens[0]?.id, ultima: trecho.itens.at(-1)?.id };
  const toca =
    doTrecho.primeira === undefined ||
    doTrecho.ultima === undefined ||
    pedido.antes === doTrecho.primeira ||
    pedido.depois === doTrecho.ultima ||
    ((abaixo === null || abaixo <= doTrecho.ultima) &&
      (acima === null || acima >= doTrecho.primeira));
  if (!toca) return { ...daPagina, lidaAoAbrir: trecho.lidaAoAbrir };

  const itens = [...trecho.itens.filter(({ id }) => !cobre(id)), ...pagina.itens].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  return {
    itens,
    anteriores: trecho.anteriores && pagina.anteriores,
    seguintes: trecho.seguintes && pagina.seguintes,
    lidaAte: daPagina.lidaAte,
    lidaAoAbrir: trecho.lidaAoAbrir,
  };
}

/**
 * A conversa aberta: na mensagem do link, ao redor dela; sem o link, nas mais novas, ou, com a
 * última lida antes delas, ao redor dela, onde está a primeira não lida. A conversa que a conta nunca
 * leu abre nas mais novas.
 */
export async function abrirTrecho(
  buscar: BuscarPagina,
  alvo: string | null,
): Promise<TrechoDaConversa> {
  if (alvo !== null) return juntarPagina(undefined, { em: alvo }, await buscar({ em: alvo }));
  const novas = await buscar({});
  const primeira = novas.itens[0];
  if (novas.lidaAte !== null && novas.anteriores && primeira && novas.lidaAte < primeira.id) {
    const ao = { em: novas.lidaAte };
    return juntarPagina(undefined, ao, await buscar(ao));
  }
  return juntarPagina(undefined, {}, novas);
}

/**
 * As páginas que relêem o trecho, juntas numa só: o trecho que chega ao fim da conversa se relê das
 * mais novas para trás, até o começo dele, e traz o que chegou depois; o outro, do começo dele para a
 * frente, até o fim dele. A página junta vale como a das mais novas, que cobre da primeira à última.
 */
export async function relerTrecho(
  buscar: BuscarPagina,
  trecho: TrechoDaConversa,
): Promise<{ pedido: PedidoDaPagina; pagina: PaginaDeMensagens }> {
  const primeira = trecho.itens[0]?.id;
  const ultima = trecho.itens.at(-1)?.id;
  const paginas: PaginaDeMensagens[] = [];
  if (!trecho.seguintes || primeira === undefined || ultima === undefined) {
    let pagina = await buscar({});
    paginas.push(pagina);
    let comeco = pagina.itens[0]?.id;
    while (
      primeira !== undefined &&
      pagina.anteriores &&
      comeco !== undefined &&
      comeco > primeira
    ) {
      pagina = await buscar({ antes: comeco });
      paginas.unshift(pagina);
      comeco = pagina.itens[0]?.id;
    }
  } else {
    let pagina = await buscar({ em: primeira });
    paginas.push(pagina);
    let fim = pagina.itens.at(-1)?.id;
    while (pagina.seguintes && fim !== undefined && fim < ultima) {
      pagina = await buscar({ depois: fim });
      paginas.push(pagina);
      fim = pagina.itens.at(-1)?.id;
    }
  }
  return { pedido: {}, pagina: juntas(paginas) };
}

/** As páginas seguidas, da mais antiga para a mais nova, como uma página só. */
function juntas(paginas: readonly PaginaDeMensagens[]): PaginaDeMensagens {
  return {
    itens: paginas.flatMap(({ itens }) => itens),
    anteriores: paginas[0]?.anteriores ?? false,
    seguintes: paginas.at(-1)?.seguintes ?? false,
    lidaAte: paginas.reduce<string | null>((lida, pagina) => maisNovo(lida, pagina.lidaAte), null),
  };
}

/** O ano do dia, "2026", no fuso. */
const anoDe = (data: Date, dataHora: DataHora) => dataHora.formatarData(data).slice(-4);

/** O dia nos separadores da conversa: "Hoje", "Ontem", "12/11" e, de outro ano, "30/12/2025". */
export function rotuloDoDia(em: Date, agora: Date, dataHora: DataHora): string {
  const grupo = dataHora.grupoDoDia(em, agora);
  if (grupo === 'Hoje' || grupo === 'Ontem') return grupo;
  const dia = dataHora.formatarData(em);
  return anoDe(em, dataHora) === anoDe(agora, dataHora) ? dia.slice(0, 5) : dia;
}

/** O dia e a hora no chat, como "hoje, 10:19", "ontem, 17:05" e "12/11, 10:19". */
export function quandoNoChat(em: Date, agora: Date, dataHora: DataHora): string {
  const dia = rotuloDoDia(em, agora, dataHora);
  const noComeco = dia === 'Hoje' || dia === 'Ontem' ? dia.toLowerCase() : dia;
  return `${noComeco}, ${dataHora.formatarHora(em)}`;
}

/** Até quanto tempo depois da anterior a mensagem da mesma pessoa fica junto dela. */
export const SEGUIDA_ATE = 5 * 60_000;

/** O que a conversa mostra, na ordem. */
export type ItemNaTela =
  | { tipo: 'dia'; chave: string; rotulo: string }
  | { tipo: 'novas'; chave: string }
  | { tipo: 'mensagem'; chave: string; mensagem: MensagemDoChat; seguida: boolean }
  | { tipo: 'evento'; chave: string; mensagem: MensagemDoChat };

/** A mensagem que conta como não lida: dos outros, e não o evento. */
const dosOutros = (mensagem: MensagemDoChat, conta: string) =>
  mensagem.especie === 'mensagem' && mensagem.autor.conta !== conta;

/**
 * A conversa na ordem da tela: o dia antes da primeira mensagem de cada dia; "Mensagens novas" antes
 * da primeira mensagem dos outros depois da última lida na abertura; e cada mensagem, seguida da
 * anterior quando é da mesma pessoa, até 5 min depois dela, sem um separador ou um evento no meio e
 * sem responder a outra, que leva o nome em cima.
 */
export function itensDaConversa(
  mensagens: readonly MensagemDoChat[],
  {
    conta,
    lidaAoAbrir,
    agora,
    dataHora,
  }: { conta: string; lidaAoAbrir: string | null; agora: Date; dataHora: DataHora },
): ItemNaTela[] {
  const itens: ItemNaTela[] = [];
  const primeiraNova =
    lidaAoAbrir === null
      ? undefined
      : mensagens.find((mensagem) => mensagem.id > lidaAoAbrir && dosOutros(mensagem, conta));
  let diaDeAntes: string | null = null;
  let anterior: MensagemDoChat | null = null;
  for (const mensagem of mensagens) {
    const em = new Date(mensagem.criadaEm);
    const dia = dataHora.formatarData(em);
    if (dia !== diaDeAntes) {
      itens.push({ tipo: 'dia', chave: `dia:${dia}`, rotulo: rotuloDoDia(em, agora, dataHora) });
      diaDeAntes = dia;
      anterior = null;
    }
    if (mensagem === primeiraNova) {
      itens.push({ tipo: 'novas', chave: 'novas' });
      anterior = null;
    }
    if (mensagem.especie === 'evento') {
      itens.push({ tipo: 'evento', chave: mensagem.id, mensagem });
      anterior = null;
      continue;
    }
    const seguida =
      anterior !== null &&
      anterior.autor.conta === mensagem.autor.conta &&
      mensagem.respondida === null &&
      em.getTime() - new Date(anterior.criadaEm).getTime() <= SEGUIDA_ATE;
    itens.push({ tipo: 'mensagem', chave: mensagem.id, mensagem, seguida });
    anterior = mensagem;
  }
  return itens;
}

/** As mensagens dos outros que chegaram depois da última vista no fim da conversa. */
export function novasDesde(
  mensagens: readonly MensagemDoChat[],
  conta: string,
  vistaAte: string | null,
): number {
  if (vistaAte === null) return 0;
  return mensagens.filter((mensagem) => mensagem.id > vistaAte && dosOutros(mensagem, conta))
    .length;
}
