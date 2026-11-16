// O horário da TI pela API (spec chamados, "Horário da TI"; change chamados-da-ti, design, decisão
// 3, tarefa 4.5), para quem configura os chamados: a leitura, com o padrão do domínio enquanto a
// organização não grava o dela, e a gravação pela conferência do domínio, com o formato no esquema
// da rota. A troca que muda os dias, as horas ou o fuso fecha, na mesma transação, os relógios que
// contam no horário, pelo horário antigo e sem subir a versão. Tudo com a auditoria e o evento dos
// ajustes.
import { isDeepStrictEqual } from 'node:util';
import { type Banco, chamados, horarioDaTi, naOrganizacao, type Transacao } from '@grafite/db';
import {
  conferirHorario,
  DIAS_DA_SEMANA_DO_HORARIO,
  type HorarioDaTi,
  segundosNoHorario,
} from '@grafite/domain';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { lerHorarioDaTi } from '../chamados/horario.ts';
import { dadosInvalidos, RespostaDeProblema } from '../problemas.ts';
import { travar } from '../travas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

/** O dia da semana, de segunda (1) a domingo (7), entregue no tipo do domínio. */
const DiaDaSemana = z.literal([...DIAS_DA_SEMANA_DO_HORARIO]);

/** O minuto do dia, das 00:00 (0) às 23:59 (1.439), como o banco guarda o início e o fim. */
const MinutoDoDia = z.int().min(0).max(1439);

const HorarioDaTiLido = z
  .object({
    /** Os dias do horário, em ordem e sem repetir. */
    dias: z.array(DiaDaSemana),
    inicio: MinutoDoDia,
    fim: MinutoDoDia,
    fuso: z.string(),
    /** O número de chamados abertos que enche a barra de carga de uma pessoa. */
    cargaCheia: z.number(),
  })
  .meta({ id: 'HorarioDaTi' });

/** O horário como a tela o grava: o formato fica aqui, e as recusas da spec, no domínio. */
const PedidoDoHorario = z
  .object({
    dias: z.array(DiaDaSemana),
    inicio: MinutoDoDia,
    fim: MinutoDoDia,
    /** Fora da lista, a conferência recusa com "Escolha um fuso da lista.". */
    fuso: z.string(),
    /** Fora de 1 a 20, ou com fração, a conferência recusa com "Use um número inteiro de 1 a 20.". */
    cargaCheia: z.number(),
  })
  .meta({ id: 'PedidoDoHorarioDaTi' });

const PROBLEMAS = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

/** O horário como a auditoria e a resposta o guardam, com os dias numa lista comum. */
const visaoDoHorario = (horario: HorarioDaTi) => ({
  dias: [...horario.dias],
  inicio: horario.inicio,
  fim: horario.fim,
  fuso: horario.fuso,
  cargaCheia: horario.cargaCheia,
});

/** O que os relógios usam do horário: tudo, fora a carga cheia. */
const janelaDo = ({ cargaCheia: _cargaCheia, ...janela }: HorarioDaTi) => janela;

/** O chamado com o relógio andando e o prazo no horário da TI. */
const contaNoHorario = and(
  isNotNull(chamados.relogioDesde),
  sql`${chamados.prazo}->>'modo' = 'horario'`,
);

/**
 * Fecha os relógios que contam no horário pelo horário antigo: o contado ganha o trecho desde a
 * última volta, e o relógio volta a contar no momento da troca. A versão não sobe (decisão 4).
 *
 * Os chamados ficam travados, para a ação que mexe no relógio ao mesmo tempo, como esperar ou
 * resolver, esperar o fechamento ou ser esperada por ele. A leitura vem depois da trava, num
 * comando à parte e só dos travados, para ver o que a ação deixou: o chamado que ela parou não
 * conta mais e não é fechado, e o que passou a contar depois da trava, sem ela, fica como está. O
 * relógio que voltou a contar depois do momento da troca, que é lido antes das esperas, também
 * fica: fechá-lo o poria para trás, contando o tempo em que estava parado. Devolve quantos fechou.
 */
async function fecharOsRelogios(
  tx: Transacao,
  antigo: HorarioDaTi,
  momento: Date,
): Promise<number> {
  const travados = (
    await tx.select({ id: chamados.id }).from(chamados).where(contaNoHorario).for('update')
  ).map(({ id }) => id);
  if (travados.length === 0) return 0;
  const contando = await tx
    .select({ id: chamados.id, contadoS: chamados.contadoS, relogioDesde: chamados.relogioDesde })
    .from(chamados)
    .where(and(inArray(chamados.id, travados), contaNoHorario));
  let fechados = 0;
  for (const { id, contadoS, relogioDesde } of contando) {
    if (relogioDesde === null || relogioDesde >= momento) continue;
    await tx
      .update(chamados)
      .set({
        contadoS: contadoS + segundosNoHorario(relogioDesde, momento, 'horario', antigo),
        relogioDesde: momento,
      })
      .where(eq(chamados.id, id));
    fechados += 1;
  }
  return fechados;
}

export const rotasDoHorarioDaTi: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';
  const autorDa = (requisicao: FastifyRequest) =>
    ({ tipo: 'conta', contaId: sessaoDa(requisicao).contaId }) as const;

  app.get(
    '/chamados/horario-da-ti',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'O horário da TI, ou o padrão enquanto a organização não grava o dela',
        response: { 200: HorarioDaTiLido, ...PROBLEMAS },
      },
    },
    async (requisicao) =>
      visaoDoHorario(await naOrganizacao(banco, orgDa(requisicao), lerHorarioDaTi)),
  );

  app.put(
    '/chamados/horario-da-ti',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Gravar o horário da TI, com os relógios que contam no horário fechados',
        body: PedidoDoHorario,
        response: { 200: HorarioDaTiLido, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        // Uma troca de cada vez na organização: o horário de agora é lido depois da trava, e a
        // segunda de duas trocas juntas fecha os relógios pelo horário da primeira. A trava é a
        // transacional, e não a da linha, porque a organização que nunca gravou o horário não tem
        // a linha para travar.
        await travar(tx, 'horario-da-ti');
        const antigo = await lerHorarioDaTi(tx);
        const conferido = conferirHorario(requisicao.body);
        if (!conferido.ok) throw dadosInvalidos(conferido.erros);
        const novo = conferido.horario;
        // O horário igual ao de agora não grava nada, nem a linha do padrão.
        if (isDeepStrictEqual(visaoDoHorario(novo), visaoDoHorario(antigo))) {
          return visaoDoHorario(antigo);
        }
        // Só a carga cheia não muda o tempo contado, e os relógios ficam como estão.
        const relogiosFechados = isDeepStrictEqual(janelaDo(novo), janelaDo(antigo))
          ? 0
          : await fecharOsRelogios(tx, antigo, momento);
        const colunas = visaoDoHorario(novo);
        await tx
          .insert(horarioDaTi)
          .values({ orgId: sql`app.current_org()`, ...colunas })
          .onConflictDoUpdate({ target: horarioDaTi.orgId, set: colunas });
        await registrarNaAuditoria(tx, {
          acao: 'horario-da-ti.alterado',
          ator: autorDa(requisicao),
          alvo: { tipo: 'horario-da-ti' },
          antes: visaoDoHorario(antigo),
          depois: colunas,
          dados: { relogiosFechados },
          origem: origemDa(requisicao),
          momento,
        });
        return colunas;
      });
    },
  );
};
