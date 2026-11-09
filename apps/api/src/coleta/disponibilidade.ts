// A disponibilidade dos ativos na lista e na ficha (spec disponibilidade-de-rede, "Situação da
// disponibilidade", e cadastro-de-ativos; design do P2a, decisão 11): a situação pelo estado atual,
// com o desde, a latência da mesma leitura, o coletor que a fez e, sem leitura, o motivo. No banco, a
// mesma situação serve ao filtro "é qualquer de" e à ordem da coluna, com o que pede atenção primeiro
// e, na mesma situação, a leitura mais antiga antes. Sem o relógio: a tela diz se a leitura está
// desatualizada.
import { ativos, coletores, estadoDosAtivos, type Transacao, tiposDeAtivo } from '@grafite/db';
import {
  escolhaDeColetor,
  ORDEM_DAS_SITUACOES_DA_DISPONIBILIDADE,
  situacaoDaDisponibilidade,
} from '@grafite/domain';
import { inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { DisponibilidadeDoAtivo } from '../ativos/esquemas.ts';
import { campoDoIpDoTipo, coletoresAtivos, ipDoAtivo, tipoComDisponibilidade } from './alvos.ts';

/** A coluna da disponibilidade na tabela dos ativos. */
export const COLUNA_DA_DISPONIBILIDADE = 'coleta.disponibilidade';

/** O estado atual da disponibilidade do ativo da linha, numa subconsulta. */
const doEstado = (coluna: string) =>
  sql`(select ${sql.raw(coluna)} from estado_dos_ativos e
        where e.org_id = ${ativos.orgId} and e.ativo_id = ${ativos.id}
          and e.metrica = 'rede.disponibilidade')`;

/**
 * A situação no banco, como a domínio a diz: vazia no ativo inativo e no de tipo sem a capacidade;
 * "nao-verificado" sem o IP ou sem leitura; e a da última leitura.
 */
export const situacaoNoBanco = sql<string | null>`(case
  when ${ativos.situacao} = 'inativo' or not ${tipoComDisponibilidade} then null
  when ${ipDoAtivo} is null then 'nao-verificado'
  else coalesce(${doEstado("case when e.situacao = 'sem-dado' then 'sem-dado' else e.valor_texto end")}, 'nao-verificado')
end)`;

/** A chave da ordem: a posição da situação e, nela, o momento da leitura, em ms. */
export const ordemDaDisponibilidade = sql`(array_position(array[${sql.join(
  ORDEM_DAS_SITUACOES_DA_DISPONIBILIDADE.map((situacao) => sql`${situacao}`),
  sql`, `,
)}]::text[], ${situacaoNoBanco}) * 10000000000000::numeric
  + coalesce((extract(epoch from ${doEstado('e.momento')}) * 1000)::numeric, 0))`;

type Disponibilidade = z.infer<typeof DisponibilidadeDoAtivo>;

/** O que a disponibilidade precisa de cada ativo da página. */
export interface AtivoComDisponibilidade {
  id: string;
  tipoId: string;
  localId: string | null;
  valores: unknown;
  situacao: string;
}

const iso = (momento: Date) => momento.toISOString();

/**
 * A disponibilidade de cada ativo, pelo id; fica de fora o inativo e o de tipo sem a capacidade. O
 * motivo "nenhum coletor alcança" só mostra o IP a quem vê o campo: o IP restrito, a quem não vê os
 * restritos no local do ativo, aparece como "o IP do ativo".
 */
export async function disponibilidadeDosAtivos(
  tx: Transacao,
  linhas: readonly AtivoComDisponibilidade[],
  {
    restritos,
    veRestritos,
  }: { restritos: ReadonlySet<string>; veRestritos: (localId: string | null) => boolean },
): Promise<Map<string, Disponibilidade>> {
  const resultado = new Map<string, Disponibilidade>();
  const tipos = await tx
    .select({ id: tiposDeAtivo.id, campoDoIp: campoDoIpDoTipo })
    .from(tiposDeAtivo)
    .where(tipoComDisponibilidade);
  const campoDoTipo = new Map(tipos.map((tipo) => [tipo.id, tipo.campoDoIp]));
  const candidatos = linhas.filter(
    (linha) => linha.situacao === 'ativo' && campoDoTipo.has(linha.tipoId),
  );
  if (candidatos.length === 0) return resultado;
  const estados = await tx
    .select()
    .from(estadoDosAtivos)
    .where(
      inArray(
        estadoDosAtivos.ativoId,
        candidatos.map((linha) => linha.id),
      ),
    );
  const estadoDe = (ativoId: string, metrica: string) =>
    estados.find((estado) => estado.ativoId === ativoId && estado.metrica === metrica);
  const nomes = new Map(
    (await tx.select({ id: coletores.id, nome: coletores.nome }).from(coletores)).map((coletor) => [
      coletor.id,
      coletor.nome,
    ]),
  );
  const escolher = escolhaDeColetor(await coletoresAtivos(tx));
  for (const linha of candidatos) {
    const campoDoIp = campoDoTipo.get(linha.tipoId) ?? null;
    const guardado = campoDoIp ? (linha.valores as Record<string, unknown>)[campoDoIp] : null;
    const ip = typeof guardado === 'string' && guardado !== '' ? guardado : null;
    const estado = estadoDe(linha.id, 'rede.disponibilidade');
    const situacao = situacaoDaDisponibilidade({
      ip,
      estado: estado ?? null,
      alcancado: ip !== null && escolher(ip) !== null,
    });
    if (situacao.situacao === 'nao-verificado') {
      const ipEscondido =
        campoDoIp !== null && restritos.has(campoDoIp) && !veRestritos(linha.localId);
      resultado.set(linha.id, {
        situacao: 'nao-verificado',
        momento: null,
        desde: null,
        motivo:
          ipEscondido && ip
            ? situacao.motivo.replace(`o IP ${ip}`, 'o IP do ativo')
            : situacao.motivo,
        latencia: null,
        coletor: null,
      });
      continue;
    }
    const latencia = estadoDe(linha.id, 'rede.latencia');
    const daMesmaLeitura =
      situacao.situacao === 'online' &&
      latencia !== undefined &&
      latencia.valorNumero !== null &&
      latencia.momento.getTime() === situacao.momento.getTime();
    resultado.set(linha.id, {
      situacao: situacao.situacao,
      momento: iso(situacao.momento),
      desde: iso(situacao.desde),
      motivo: null,
      latencia:
        daMesmaLeitura && latencia?.valorNumero !== null && latencia?.valorNumero !== undefined
          ? { valor: latencia.valorNumero, inconsistente: latencia.situacao === 'inconsistente' }
          : null,
      coletor: estado ? (nomes.get(estado.coletorId) ?? null) : null,
    });
  }
  return resultado;
}
