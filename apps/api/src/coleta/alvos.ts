// Os alvos da coleta (spec coletor-local, "Configuração da coleta"; design do P2a, decisão 6, do
// P2b, decisão 4, e do P2c, decisão 3): para cada coleta, os ativos ativos dos tipos que ligam a
// capacidade dela, o ping pela disponibilidade, o SNMP pelos suprimentos e contadores e a sondagem
// pela saúde do Control iD, com o IP preenchido no campo que o
// tipo escolheu para ela, e o coletor de cada um, o da faixa mais específica que alcança o IP e, no
// empate, o cadastrado primeiro. A configuração de um coletor traz os dele, e o lote confere as
// leituras pela mesma regra. O IP guardado já está na forma canônica, pelo motor de campos.
import { ativos, coletores, type Transacao, tiposDeAtivo } from '@grafite/db';
import { escolhaDeColetor } from '@grafite/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

/** O tipo do ativo, da mesma organização (sem importar a leitura dos ativos, que usa este módulo). */
const doTipo = and(eq(tiposDeAtivo.orgId, ativos.orgId), eq(tiposDeAtivo.id, ativos.tipoId));

/**
 * O que o coletor faz num alvo: o ping, da disponibilidade, o SNMP, dos suprimentos, ou a sondagem,
 * da saúde do Control iD.
 */
export type TipoDeColeta = 'ping' | 'snmp' | 'controlid';

/** A capacidade que liga cada coleta, com o campo de IP escolhido no tipo. */
const CAPACIDADE_DA_COLETA = {
  ping: 'rede.disponibilidade',
  snmp: 'snmp.suprimentos',
  controlid: 'controlid.saude',
} as const satisfies Record<TipoDeColeta, string>;

/**
 * A coleta que dá cada métrica: as da rede, o ping; as do Control iD, a sondagem; as do SNMP e da
 * impressora, o SNMP.
 */
export const coletaDaMetrica = (metrica: string): TipoDeColeta =>
  metrica.startsWith('rede.') ? 'ping' : metrica.startsWith('controlid.') ? 'controlid' : 'snmp';

export interface AlvoDaColeta {
  ativoId: string;
  /** O tipo do ativo, que guarda a configuração da coleta, como a versão do SNMP. */
  tipoId: string;
  coleta: TipoDeColeta;
  ip: string;
  /** O coletor que alcança o IP, ou `null` quando nenhum coletor ativo alcança. */
  coletorId: string | null;
}

/** O campo de IP que o tipo escolheu para a disponibilidade, no JSONB da configuração. */
export const campoDoIpDoTipo = sql<
  string | null
>`(${tiposDeAtivo.configuracaoDasCapacidades} -> 'rede.disponibilidade' ->> 'campoDoIp')`;

/** O IP do ativo no campo que o tipo escolheu, ou `null`. */
export const ipDoAtivo = sql<string | null>`(${ativos.valores} ->> ${campoDoIpDoTipo})`;

/** Se o tipo do ativo liga a disponibilidade na rede. */
export const tipoComDisponibilidade = sql`'rede.disponibilidade' = any(${tiposDeAtivo.capacidades})`;

/** Os coletores ativos, com as faixas, na ordem do cadastro. */
export function coletoresAtivos(tx: Transacao) {
  return tx
    .select({ id: coletores.id, nome: coletores.nome, faixas: coletores.faixas })
    .from(coletores)
    .where(eq(coletores.situacao, 'ativo'))
    .orderBy(asc(coletores.id));
}

/**
 * Os ativos que cada coleta alcança, com o IP e o coletor de cada um, primeiro os do ping, depois
 * os do SNMP e os da sondagem; com `ativoIds`, só esses, e com `coletas`, só as dadas.
 */
export async function alvosDaColeta(
  tx: Transacao,
  {
    ativoIds,
    coletas = ['ping', 'snmp', 'controlid'],
  }: { ativoIds?: readonly string[]; coletas?: readonly TipoDeColeta[] } = {},
): Promise<AlvoDaColeta[]> {
  if (ativoIds && ativoIds.length === 0) return [];
  const escolher = escolhaDeColetor(await coletoresAtivos(tx));
  const alvos: AlvoDaColeta[] = [];
  for (const coleta of coletas) {
    const capacidade = CAPACIDADE_DA_COLETA[coleta];
    const campo = sql`(${tiposDeAtivo.configuracaoDasCapacidades} -> ${capacidade}::text ->> 'campoDoIp')`;
    const ip = sql<string | null>`(${ativos.valores} ->> ${campo})`;
    const linhas = await tx
      .select({ ativoId: ativos.id, tipoId: ativos.tipoId, ip })
      .from(ativos)
      .innerJoin(tiposDeAtivo, doTipo)
      .where(
        and(
          eq(ativos.situacao, 'ativo'),
          sql`${capacidade}::text = any(${tiposDeAtivo.capacidades})`,
          sql`${ip} is not null`,
          ativoIds ? inArray(ativos.id, [...ativoIds]) : undefined,
        ),
      )
      .orderBy(asc(ativos.id));
    for (const linha of linhas) {
      if (linha.ip) alvos.push({ ...linha, ip: linha.ip, coleta, coletorId: escolher(linha.ip) });
    }
  }
  return alvos;
}
